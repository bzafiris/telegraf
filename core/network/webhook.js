const debug = require('debug')('telegraf:webhook')

module.exports = function (hookPath, updateHandler, errorHandler) {
  return (req, res, next) => {
    debug('Incoming request', req.method, req.url)
    if (req.method !== 'POST' || req.url !== hookPath) {
      if (typeof next === 'function') {
        return next()
      }
      res.statusCode = 403
      return res.end()
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      let update = {}
      try {
        update = JSON.parse(body)
      } catch (error) {
        res.writeHead(415)
        res.end()
        return errorHandler(error)
      }
      (async () => {
        let generatedVariable7;

        try {
          generatedVariable7 = await updateHandler(update, res);

          return await (async () => {
              if (!res.finished) {
                res.end()
              }
            })();
        } catch (err) {
          return await (async err => {
              debug('Webhook error', err)
              res.writeHead(500)
              res.end()
            })(err);
        }
      })()
    })
  };
}
