/*
 * Storage: GM_getValue/GM_setValue with schema versioning and migration.
 * Config and index are small JSON objects; the full library index is built by
 * core/matcher and contains no full paths.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};

  var SCHEMA_VERSION = 2;
  var CONFIG_KEY = 'inshelf_config';
  var INDEX_KEY = 'inshelf_index';

  function defaultConfig() {
    return {
      schemaVersion: SCHEMA_VERSION,
      activeServer: 'emby',
      servers: {
        emby: {
          type: 'emby',
          enabled: true,
          baseUrl: '',
          apiKey: '',
          serverId: '',
          serverName: '',
          version: '',
          ttlMinutes: 30
        }
      },
      sites: {
        javdb: { enabled: true, showList: true, showDetail: true }
      },
      ui: { gear: 'bottom-right' }
    };
  }

  function defaultIndexes() {
    return { schemaVersion: SCHEMA_VERSION, servers: {} };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function migrateConfig(raw) {
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = null;
      }
    }
    if (!isObject(raw)) return defaultConfig();

    var cfg = defaultConfig();

    // Very old / hypothetical v1: a single Emby server at the top level.
    if (raw.schemaVersion !== SCHEMA_VERSION && (raw.baseUrl || raw.apiKey)) {
      var emby = cfg.servers.emby;
      emby.baseUrl = raw.baseUrl || '';
      emby.apiKey = raw.apiKey || '';
      emby.serverId = raw.serverId || '';
      emby.serverName = raw.serverName || '';
      emby.version = raw.version || '';
      emby.ttlMinutes = Number(raw.ttlMinutes) || 30;
      if (isObject(raw.sites)) cfg.sites = Object.assign(cfg.sites, raw.sites);
      return cfg;
    }

    if (isObject(raw.servers)) {
      Object.keys(raw.servers).forEach(function (id) {
        var source = isObject(raw.servers[id]) ? raw.servers[id] : {};
        var base = cfg.servers[id] || {
          type: id,
          enabled: true,
          baseUrl: '',
          apiKey: '',
          serverId: '',
          serverName: '',
          version: '',
          ttlMinutes: 30
        };
        cfg.servers[id] = Object.assign({}, base, source);
      });
    }

    if (isObject(raw.sites)) cfg.sites = Object.assign(cfg.sites, raw.sites);
    if (isObject(raw.ui)) cfg.ui = Object.assign(cfg.ui, raw.ui);
    if (raw.activeServer) cfg.activeServer = raw.activeServer;
    cfg.schemaVersion = SCHEMA_VERSION;
    return cfg;
  }

  function migrateIndex(raw) {
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = null;
      }
    }
    if (!isObject(raw)) return defaultIndexes();

    // v1 single-server index: { byCode: ..., ts, total, ... }
    if (raw.byCode) {
      return {
        schemaVersion: SCHEMA_VERSION,
        servers: { emby: raw }
      };
    }

    if (raw.schemaVersion === SCHEMA_VERSION && isObject(raw.servers)) return raw;
    return defaultIndexes();
  }

  function createStorage(getValue, setValue) {
    function read(key, fallback) {
      if (typeof getValue !== 'function') return fallback;
      var value;
      try {
        value = getValue(key, null);
      } catch (e) {
        return fallback;
      }
      if (value === null || value === undefined || value === '') return fallback;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          return fallback;
        }
      }
      return value;
    }

    function write(key, value) {
      if (typeof setValue !== 'function') return false;
      try {
        setValue(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    }

    function loadConfig() {
      return migrateConfig(read(CONFIG_KEY, null));
    }

    function saveConfig(config) {
      var safe = migrateConfig(config || {});
      safe.schemaVersion = SCHEMA_VERSION;
      return write(CONFIG_KEY, safe);
    }

    function loadIndexes() {
      return migrateIndex(read(INDEX_KEY, null));
    }

    function saveIndexes(indexes) {
      var safe = indexes || defaultIndexes();
      safe.schemaVersion = SCHEMA_VERSION;
      return write(INDEX_KEY, safe);
    }

    function clear() {
      write(CONFIG_KEY, null);
      write(INDEX_KEY, null);
    }

    return {
      loadConfig: loadConfig,
      saveConfig: saveConfig,
      loadIndexes: loadIndexes,
      saveIndexes: saveIndexes,
      clear: clear
    };
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONFIG_KEY: CONFIG_KEY,
    INDEX_KEY: INDEX_KEY,
    defaultConfig: defaultConfig,
    defaultIndexes: defaultIndexes,
    migrateConfig: migrateConfig,
    migrateIndex: migrateIndex,
    createStorage: createStorage
  };

  Inshelf.storage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
