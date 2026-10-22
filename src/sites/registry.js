/*
 * Site adapter registry.
 *
 * A site adapter only knows how to read one website's DOM. Adding JavBus or
 * MissAV later means adding one adapter file and registering it.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var adapters = {};

  function assertAdapter(adapter) {
    if (!adapter || !adapter.id || !adapter.name) {
      throw new Error('site adapter must have id and name');
    }
    ['isActive', 'isDetailPage', 'getDetailCode', 'getDetailMount', 'getListItems'].forEach(function (key) {
      if (typeof adapter[key] !== 'function') {
        throw new Error('site adapter "' + adapter.id + '" is missing ' + key + '()');
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

  Inshelf.siteRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
