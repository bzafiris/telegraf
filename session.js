module.exports = function (opts) {
  const options = Object.assign({
    property: 'session',
    store: new Map(),
    getSessionKey: (ctx) => ctx.from && ctx.chat && `${ctx.from.id}:${ctx.chat.id}`
  }, opts)

  const ttlMs = options.ttl && options.ttl * 1000

  return async (ctx, next) => {
    const key = options.getSessionKey(ctx)
    if (!key) {
      return next(ctx)
    }
    const now = new Date().getTime()
    let generatedVariable14;
    const state = await Promise.resolve(options.store.get(key));
    generatedVariable14 = await state || { session: {} };

    return await (async ({ session, expires }) => {
      if (expires && expires < now) {
        session = {}
      }
      Object.defineProperty(ctx, options.property, {
        get: function () { return session },
        set: function (newValue) { session = Object.assign({}, newValue) }
      })
      let generatedVariable15;
      generatedVariable15 = await next(ctx);

      return await options.store.set(key, {
        session,
        expires: ttlMs ? now + ttlMs : null
      });
    })(generatedVariable14);
  };
}
