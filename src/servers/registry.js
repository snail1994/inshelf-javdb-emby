/*
 * Server adapter registry.
 *
 * A media-server adapter is the only place that knows a server's HTTP API.
 * Adding Jellyfin/Plex later means adding one adapter file and registering it;
 * matching, storage, badges and settings keep working unchanged.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var adapters = {};

  function assertAdapter(adapter) {
    if (!adapter || !adapter.id || !adapter.name) {
      throw new Error('server adapter must have id and name');
    }
    ['normalizeBaseUrl', 'testConnection', 'fetchLibrary', 'buildItemUrl'].forEach(function (key) {
      if (typeof adapter[key] !== 'function') {
        throw new Error('server adapter "' + adapter.id + '" is missing ' + key + '()');
      }
    });
  }

  function register(adapter) {
    assertAdapter(adapter);
    adapters[adapter.id] = adapter;
    return adapter;
  }

  function get(id) {
    return adapters[id] || null;
  }

  function list() {
    return Object.keys(adapters).sort().map(function (id) {
      return adapters[id];
    });
  }

  function clear() {
    adapters = {};
  }

  var api = {
    register: register,
    get: get,
    list: list,
    clear: clear
  };

  Inshelf.serverRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
