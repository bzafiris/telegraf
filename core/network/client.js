const debug = require('debug')('telegraf:client')
const crypto = require('crypto')
const fetch = require('node-fetch').default
const fs = require('fs')
const https = require('https')
const path = require('path')
const TelegramError = require('./error')
const MultipartStream = require('./multipart-stream')
const { isStream } = MultipartStream

const WebhookBlacklist = [
  'getChat',
  'getChatAdministrators',
  'getChatMember',
  'getChatMembersCount',
  'getFile',
  'getFileLink',
  'getGameHighScores',
  'getMe',
  'getUserProfilePhotos',
  'getWebhookInfo',
  'exportChatInviteLink'
]

const DefaultExtensions = {
  audio: 'mp3',
  photo: 'jpg',
  sticker: 'webp',
  video: 'mp4',
  animation: 'mp4',
  video_note: 'mp4',
  voice: 'ogg'
}

const DefaultOptions = {
  apiRoot: 'https://api.telegram.org',
  webhookReply: true,
  agent: new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000
  })
}

const WebhookReplyStub = {
  webhook: true,
  details: 'https://core.telegram.org/bots/api#making-requests-when-getting-updates'
}

function safeJSONParse (text) {
  try {
    return JSON.parse(text)
  } catch (err) {
    debug('JSON parse failed', err)
  }
}

function includesMedia (payload) {
  return Object.keys(payload).some(
    (key) => {
      const value = payload[key]
      if (Array.isArray(value)) {
        return value.some(({ media }) => media && typeof media === 'object' && (media.source || media.url))
      }
      return (typeof value === 'object') && (
        value.source ||
        value.url ||
        (typeof value.media === 'object' && (value.media.source || value.media.url))
      )
    }
  )
}

function buildJSONConfig (payload) {
  return Promise.resolve({
    method: 'POST',
    compress: true,
    headers: { 'content-type': 'application/json', 'connection': 'keep-alive' },
    body: JSON.stringify(payload)
  })
}

async function buildFormDataConfig(payload) {
  if (payload.reply_markup && typeof payload.reply_markup !== 'string') {
    payload.reply_markup = JSON.stringify(payload.reply_markup)
  }
  const boundary = crypto.randomBytes(32).toString('hex')
  const formData = new MultipartStream(boundary)
  const tasks = Object.keys(payload).map((key) => attachFormValue(formData, key, payload[key]))
  let generatedVariable1;
  generatedVariable1 = await Promise.all(tasks);

  return await (async () => {
    return {
      method: 'POST',
      compress: true,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'connection': 'keep-alive' },
      body: formData
    }
  })();
}

async function attachFormValue(form, id, value) {
  if (!value) {
    return Promise.resolve()
  }
  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean' || valueType === 'number') {
    form.addPart({
      headers: { 'content-disposition': `form-data; name="${id}"` },
      body: `${value}`
    })
    return Promise.resolve()
  }
  if (id === 'thumb') {
    const attachmentId = crypto.randomBytes(16).toString('hex')
    let generatedVariable2;
    generatedVariable2 = await attachFormMedia(form, value, attachmentId);

    return await form.addPart({
        headers: { 'content-disposition': `form-data; name="${id}"` },
        body: `attach://${attachmentId}`
      });
  }
  if (Array.isArray(value)) {
    const items = await Promise.all(
      value.map(async item => {
        if (typeof item.media !== 'object') {
          return Promise.resolve(item)
        }
        const attachmentId = crypto.randomBytes(16).toString('hex')
        let generatedVariable3;
        generatedVariable3 = await attachFormMedia(form, item.media, attachmentId);
        return await Object.assign({}, item, { media: `attach://${attachmentId}` });
      })
    );

    return await form.addPart({
      headers: { 'content-disposition': `form-data; name="${id}"` },
      body: JSON.stringify(items)
    });
  }
  if (typeof value.media !== 'undefined' && typeof value.type !== 'undefined') {
    const attachmentId = crypto.randomBytes(16).toString('hex')
    let generatedVariable4;
    generatedVariable4 = await attachFormMedia(form, value.media, attachmentId);

    return await form.addPart({
        headers: { 'content-disposition': `form-data; name="${id}"` },
        body: JSON.stringify(Object.assign(value, {
          media: `attach://${attachmentId}`
        }))
      });
  }
  return attachFormMedia(form, value, id)
}

async function attachFormMedia(form, media, id) {
  let fileName = media.filename || `${id}.${DefaultExtensions[id] || 'dat'}`
  if (media.url) {
    const res = await fetch(media.url);

    return await form.addPart({
      headers: { 'content-disposition': `form-data; name="${id}"; filename="${fileName}"` },
      body: res.body
    });
  }
  if (media.source) {
    if (fs.existsSync(media.source)) {
      fileName = media.filename || path.basename(media.source)
      media.source = fs.createReadStream(media.source)
    }
    if (isStream(media.source) || Buffer.isBuffer(media.source)) {
      form.addPart({
        headers: { 'content-disposition': `form-data; name="${id}"; filename="${fileName}"` },
        body: media.source
      })
    }
  }
  return Promise.resolve()
}

function isKoaResponse (response) {
  return typeof response.set === 'function' && typeof response.header === 'object'
}

async function answerToWebhook(response, payload = {}) {
  if (!includesMedia(payload)) {
    if (isKoaResponse(response)) {
      response.body = payload
      return Promise.resolve(WebhookReplyStub)
    }
    if (!response.headersSent) {
      response.setHeader('content-type', 'application/json')
    }
    return new Promise((resolve) =>
      response.end(JSON.stringify(payload), 'utf-8', () => resolve(WebhookReplyStub))
    )
  }

  let generatedVariable5;
  generatedVariable5 = await buildFormDataConfig(payload);

  return await (async ({ headers, body }) => {
      if (isKoaResponse(response)) {
        Object.keys(headers).forEach(key => response.set(key, headers[key]))
        response.body = body
        return Promise.resolve(WebhookReplyStub)
      }
      if (!response.headersSent) {
        Object.keys(headers).forEach(key => response.setHeader(key, headers[key]))
      }
      return new Promise((resolve) => {
        response.on('finish', () => resolve(WebhookReplyStub))
        body.pipe(response)
      })
    })(generatedVariable5);
}

class ApiClient {
  constructor (token, options, webhookResponse) {
    this.token = token
    this.options = Object.assign({}, DefaultOptions, options)
    if (this.options.apiRoot.startsWith('http://')) {
      this.options.agent = null
    }
    this.response = webhookResponse
  }

  set webhookReply (enable) {
    this.options.webhookReply = enable
  }

  get webhookReply () {
    return this.options.webhookReply
  }

  async callApi(method, data = {}) {
    const { token, options, response, responseEnd } = this

    const payload = Object.keys(data)
      .filter((key) => typeof data[key] !== 'undefined' && data[key] !== null)
      .reduce((acc, key) => Object.assign(acc, { [key]: data[key] }), {})

    if (options.webhookReply && response && !responseEnd && !WebhookBlacklist.includes(method)) {
      debug('Call via webhook', method, payload)
      this.responseEnd = true
      return answerToWebhook(response, Object.assign({ method }, payload))
    }

    if (!token) {
      throw new TelegramError({ error_code: 401, description: 'Bot Token is required' })
    }

    debug('HTTP call', method, payload)
    const buildConfig = includesMedia(payload)
      ? buildFormDataConfig(Object.assign({ method }, payload))
      : buildJSONConfig(payload)
    const config = await buildConfig;

    const res = await (async config => {
        const apiUrl = `${options.apiRoot}/bot${token}/${method}`
        config.agent = options.agent
        return fetch(apiUrl, config)
      })(config);

    const text = await res.text();

    const generated_var_6 = await (async text => {
        return safeJSONParse(text) || {
          error_code: 500,
          description: 'Unsupported http response from Telegram',
          response: text
        }
      })(text);

    return await (async generated_var_6 => {
        if (!generated_var_6.ok) {
          debug('API call failed', generated_var_6)
          throw new TelegramError(generated_var_6, { method, payload })
        }
        return generated_var_6.result;
      })(generated_var_6);
  }
}

module.exports = ApiClient
