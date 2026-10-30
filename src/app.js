/*
 * App orchestration: scan the page, resolve per-server state, sync on demand,
 * and wire the settings modal. Site/server specifics stay in adapters.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var stateCore = Inshelf.state;
  var matcher = Inshelf.matcher;
  var storageApi = Inshelf.storage;
  var sites = Inshelf.siteRegistry;
  var servers = Inshelf.serverRegistry;
  var ui = Inshelf.ui;

  if (!stateCore || !matcher || !storageApi || !sites || !servers || !ui) {
    throw new Error('Inshelf core modules are not loaded');
  }

  function createApp(deps) {
    var doc = deps.doc;
    var win = deps.win || (doc && doc.defaultView) || root;
    var loc = deps.loc || (doc && doc.location) || {};
    var storage = deps.storage;
    var http = deps.http;

    var config = storage.loadConfig();
    var indexes = storage.loadIndexes();
    var syncing = {};
    var errors = {};
    var activeSite = null;
    var observer = null;
    var started = false;

    function activeServerId() {
      if (config.activeServer && config.servers && config.servers[config.activeServer]) {
        return config.activeServer;
      }
      var ids = Object.keys(config.servers || {});
      return ids[0] || 'emby';
    }

    function activeServerConfig() {
      return (config.servers && config.servers[activeServerId()]) || {};
    }

    function ttlMinutes() {
      var ttl = Number(activeServerConfig().ttlMinutes);
      return isFinite(ttl) && ttl > 0 ? ttl : 30;
    }

    function siteOption(siteId, key) {
      var site = config.sites && config.sites[siteId];
      if (!site || site.enabled === false) return false;
      return site[key] !== false;
    }

    function resolveStates(code) {
      return stateCore.resolve({
        config: config,
        indexes: indexes,
        code: code,
        syncing: syncing,
        errors: errors,
        now: Date.now(),
        ttlMinutes: ttlMinutes()
      });
    }

    function serverCfg(serverId) {
      return (config.servers && config.servers[serverId]) || {};
    }

    function openExternal(url) {
      if (!url) return;
      try {
        win.open(url, '_blank', 'noopener');
      } catch (e) {
        win.location.href = url;
      }
    }

    function context() {
      return {
        openItem: function (serverId, item) {
          var adapter = servers.get(serverId);
          if (!adapter || !item) return;
          openExternal(adapter.buildItemUrl(serverCfg(serverId), item));
        },
        openSearch: function (serverId, code) {
          var adapter = servers.get(serverId);
          if (!adapter) return;
          var cfg = serverCfg(serverId);
          var url = typeof adapter.buildSearchUrl === 'function'
            ? adapter.buildSearchUrl(cfg, code)
            : adapter.buildItemUrl(cfg, null);
          openExternal(url);
        },
        openSettings: openSettings
      };
    }

    function scan() {
      if (!activeSite) return;
      // Turbo/PJAX can swap the body; make sure the settings entry survives.
      renderGear();

      try {
        if (activeSite.isDetailPage(doc) && siteOption(activeSite.id, 'showDetail')) {
          var code = activeSite.getDetailCode(doc);
          var mount = activeSite.getDetailMount(doc);
          if (code && mount) {
            ui.badges.renderDetail(doc, {
              code: code,
              mount: mount,
              states: resolveStates(code).servers,
              ctx: context(),
              now: Date.now()
            });
          }
        }
      } catch (e) {
        warn('detail scan failed', e);
      }

      try {
        if (siteOption(activeSite.id, 'showList')) {
          var items = activeSite.getListItems(doc);
          var ctx = context();
          for (var i = 0; i < items.length; i++) {
            ui.badges.renderList(doc, {
              code: items[i].code,
              element: items[i].element,
              mount: items[i].mount,
              overlay: items[i].overlay,
              states: resolveStates(items[i].code).servers,
              ctx: ctx
            });
          }
        }
      } catch (e) {
        warn('list scan failed', e);
      }
    }

    function warn(message, error) {
      if (win.console && win.console.warn) win.console.warn('[Inshelf] ' + message, error);
    }

    function hasConfiguredServer() {
      return Object.keys(config.servers || {}).some(function (id) {
        var cfg = config.servers[id];
        return cfg && cfg.enabled !== false && cfg.baseUrl && cfg.apiKey;
      });
    }

    function ensureSync() {
      if (!hasConfiguredServer()) return;
      Object.keys(config.servers || {}).forEach(function (id) {
        var cfg = config.servers[id];
        if (!cfg || cfg.enabled === false || !cfg.baseUrl || !cfg.apiKey) return;
        var index = indexes.servers && indexes.servers[id];
        if (!index || stateCore.isStale(index, cfg.ttlMinutes || 30, Date.now())) {
          sync(id, false);
        }
      });
    }

    async function sync(serverId, manual) {
      if (syncing[serverId]) return { ok: false, message: '正在同步中' };

      var adapter = servers.get(serverId);
      var cfg = serverCfg(serverId);
      if (!adapter || !cfg.baseUrl || !cfg.apiKey) {
        errors[serverId] = '未配置服务器';
        scan();
        return { ok: false, message: '请先在设置中填写 Emby 地址和 API Key' };
      }

      syncing[serverId] = true;
      errors[serverId] = null;
      scan();

      try {
        // A first sync without a prior "test connection" still needs the
        // resolved base URL and serverId for correct deep links.
        if (typeof adapter.testConnection === 'function' && (!cfg.serverId || !cfg.baseUrl)) {
          try {
            var info = await adapter.testConnection(cfg, http);
            if (info && info.ok) {
              cfg.baseUrl = info.baseUrl || cfg.baseUrl;
              cfg.serverId = info.serverId || cfg.serverId || '';
              cfg.serverName = info.serverName || cfg.serverName || '';
              cfg.version = info.version || cfg.version || '';
              storage.saveConfig(config);
            }
          } catch (probeError) {
            // The library fetch below will surface the real error.
          }
        }

        var result = await adapter.fetchLibrary(cfg, http, function (progress) {
          if (manual && progress && progress.page === 1 && progress.total) {
            ui.toast.show(doc, '正在同步 ' + progress.total + ' 部影片…', 'info');
          }
        });

        if (result.baseUrl && result.baseUrl !== cfg.baseUrl) {
          cfg.baseUrl = result.baseUrl;
          storage.saveConfig(config);
        }

        var built = matcher.buildIndex(result.items);
        if (!indexes.servers) indexes.servers = {};
        indexes.servers[serverId] = Object.assign({}, built, {
          ts: Date.now(),
          baseUrl: cfg.baseUrl,
          serverId: cfg.serverId || '',
          serverName: cfg.serverName || adapter.name,
          version: cfg.version || '',
          total: result.total,
          truncated: !!result.truncated
        });
        storage.saveIndexes(indexes);

        var total = result.total || result.items.length;
        ui.toast.show(
          doc,
          '✓ 已同步 ' + total + ' 部影片，识别率 ' + Math.round(built.coverage * 100) + '%',
          'success'
        );
        return { ok: true, index: indexes.servers[serverId] };
      } catch (e) {
        errors[serverId] = e.message || String(e);
        ui.toast.showErrorOnce(doc, 'sync-' + serverId, '同步失败：' + errors[serverId]);
        return { ok: false, message: errors[serverId] };
      } finally {
        syncing[serverId] = false;
        scan();
      }
    }

    function saveConfig(next) {
      var previous = config;
      var nextConfig = next || config;

      Object.keys(nextConfig.servers || {}).forEach(function (id) {
        var before = previous.servers && previous.servers[id];
        var after = nextConfig.servers[id];
        if (before && after && before.baseUrl !== after.baseUrl) {
          if (indexes.servers && indexes.servers[id]) delete indexes.servers[id];
          errors[id] = null;
        }
      });

      config = nextConfig;
      var ok = storage.saveConfig(config);
      if (!ok) {
        ui.toast.showErrorOnce(doc, 'storage', '本地存储不可用，配置只在本页生效');
      }
      ui.toast.reset();
      renderGear();
      scan();
      return ok;
    }

    function openSettings() {
      ui.settings.open({
        doc: doc,
        config: config,
        servers: servers.list(),
        onTest: function (values) {
          var adapter = servers.get(values.type || activeServerId());
          if (!adapter) return Promise.resolve({ ok: false, message: '没有找到服务器适配器' });
          return adapter.testConnection(values, http);
        },
        onSave: saveConfig,
        onSync: function (serverId) {
          return sync(serverId, true);
        },
        onClear: function () {
          indexes = storageApi.defaultIndexes();
          storage.saveIndexes(indexes);
          errors = {};
          ui.toast.reset();
          scan();
        }
      });
    }

    function renderGear() {
      if (!doc || !doc.body) return;
      var gear = doc.getElementById('inshelf-gear');
      if (!gear) {
        gear = doc.createElement('button');
        gear.id = 'inshelf-gear';
        gear.className = 'inshelf-gear';
        gear.type = 'button';
        gear.title = 'Inshelf 设置';
        gear.textContent = '⚙';
        gear.addEventListener('click', openSettings);
        doc.body.appendChild(gear);
      }
      if (hasConfiguredServer()) {
        gear.classList.remove('inshelf-pulse');
      } else {
        gear.classList.add('inshelf-pulse');
      }
    }

    function init() {
      if (started) return null;
      started = true;

      ui.styles.inject(doc);

      activeSite = sites.list().filter(function (adapter) {
        try {
          return adapter.isActive(loc);
        } catch (e) {
          return false;
        }
      })[0] || null;

      if (!activeSite) return null;

      renderGear();
      scan();
      ensureSync();

      if (typeof activeSite.observe === 'function') {
        observer = activeSite.observe(doc, scan);
      } else if (win.MutationObserver && (doc.documentElement || doc.body)) {
        var timer = null;
        var mo = new win.MutationObserver(function () {
          if (timer) win.clearTimeout(timer);
          timer = win.setTimeout(scan, 200);
        });
        mo.observe(doc.documentElement || doc.body, { childList: true, subtree: true });
        observer = {
          disconnect: function () {
            if (timer) win.clearTimeout(timer);
            mo.disconnect();
          }
        };
      }

      ['turbo:load', 'turbo:render', 'pjax:end'].forEach(function (name) {
        doc.addEventListener(name, scan, true);
      });
      if (win.addEventListener) win.addEventListener('popstate', scan);

      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ Inshelf 设置', openSettings);
        GM_registerMenuCommand('🔄 立即同步', function () {
          sync(activeServerId(), true);
        });
        GM_registerMenuCommand('🧹 清除缓存', function () {
          indexes = storageApi.defaultIndexes();
          storage.saveIndexes(indexes);
          scan();
          ui.toast.show(doc, '已清除本地缓存', 'info');
        });
      }

      return { scan: scan, sync: sync, saveConfig: saveConfig };
    }

    return {
      init: init,
      scan: scan,
      sync: sync,
      saveConfig: saveConfig,
      openSettings: openSettings,
      getConfig: function () { return config; },
      getIndexes: function () { return indexes; },
      destroy: function () {
        if (observer && observer.disconnect) observer.disconnect();
        observer = null;
      }
    };
  }

  Inshelf.createApp = createApp;
  if (typeof module !== 'undefined' && module.exports) module.exports = createApp;
})(typeof globalThis !== 'undefined' ? globalThis : this);
