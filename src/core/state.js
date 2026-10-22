/*
 * Resolve one JavDB code against every configured media server.
 *
 * The result is intentionally per-server so the UI can render several badges
 * later (Emby + Jellyfin) without changing the core. v0.1 uses one server.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var matcher = Inshelf.matcher;
  if (!matcher) throw new Error('Inshelf.matcher must load before state');

  function isStale(index, ttlMinutes, now) {
    if (!index || !index.ts) return true;
    var ttl = Number(ttlMinutes);
    if (!isFinite(ttl) || ttl <= 0) ttl = 30;
    return (now || Date.now()) - Number(index.ts) > ttl * 60000;
  }

  /**
   * @param {{
   *   config: Object,
   *   indexes: Object,
   *   code: string,
   *   syncing?: Object,
   *   errors?: Object,
   *   now?: number,
   *   ttlMinutes?: number,
   *   coverageThreshold?: number
   * }} opts
   * @returns {{overall:string,servers:Object}}
   */
  function resolve(opts) {
    opts = opts || {};
    var config = opts.config || {};
    var indexes = opts.indexes || {};
    var syncing = opts.syncing || {};
    var errors = opts.errors || {};
    var now = opts.now || Date.now();
    var ttl = opts.ttlMinutes || 30;
    var threshold = typeof opts.coverageThreshold === 'number' ? opts.coverageThreshold : 0.5;

    var indexMap = indexes.servers || indexes;
    var configServers = config.servers || {};
    var result = {};

    Object.keys(configServers).forEach(function (serverId) {
      var cfg = configServers[serverId] || {};
      if (cfg.enabled === false) return;

      var base = {
        serverId: serverId,
        serverName: cfg.serverName || cfg.name || serverId,
        serverType: cfg.type || serverId
      };

      if (!cfg.baseUrl || !cfg.apiKey) {
        result[serverId] = Object.assign({}, base, { status: 'unconfigured' });
        return;
      }

      var index = indexMap && indexMap[serverId];

      if (syncing[serverId] && !index) {
        result[serverId] = Object.assign({}, base, { status: 'loading' });
        return;
      }

      if (errors[serverId] && !index) {
        result[serverId] = Object.assign({}, base, {
          status: 'error',
          message: errors[serverId]
        });
        return;
      }

      if (!index) {
        result[serverId] = Object.assign({}, base, { status: 'loading' });
        return;
      }

      var match = matcher.lookup(index, opts.code);
      if (match) {
        result[serverId] = Object.assign({}, base, {
          status: 'in',
          item: match.item,
          count: match.count,
          matchType: match.matchType,
          ts: index.ts
        });
        return;
      }

      var coverage = typeof index.coverage === 'number' ? index.coverage : 1;
      if (coverage < threshold) {
        result[serverId] = Object.assign({}, base, {
          status: 'unknown',
          reason: 'low-coverage',
          coverage: coverage,
          ts: index.ts
        });
        return;
      }

      if (isStale(index, ttl, now)) {
        result[serverId] = Object.assign({}, base, {
          status: 'unknown',
          reason: 'stale',
          ts: index.ts
        });
        return;
      }

      result[serverId] = Object.assign({}, base, { status: 'out', ts: index.ts });
    });

    var statuses = Object.keys(result).map(function (id) {
      return result[id].status;
    });

    var overall = 'unknown';
    if (statuses.indexOf('in') >= 0) overall = 'in';
    else if (statuses.length && statuses.every(function (s) { return s === 'error'; })) overall = 'error';
    else if (statuses.length && statuses.every(function (s) { return s === 'unconfigured'; })) overall = 'unconfigured';
    else if (statuses.indexOf('loading') >= 0) overall = 'loading';
    else if (statuses.indexOf('unknown') >= 0) overall = 'unknown';
    else if (statuses.indexOf('out') >= 0) overall = 'out';

    return { overall: overall, servers: result };
  }

  var api = {
    resolve: resolve,
    isStale: isStale
  };

  Inshelf.state = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
