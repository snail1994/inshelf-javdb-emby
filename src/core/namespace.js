/*
 * Inshelf namespace.
 * Every source module attaches its public API to globalThis.Inshelf so the
 * zero-dependency build can concatenate modules in a fixed order. Node tests
 * require the same modules directly; `module.exports` is ignored in browsers.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  Inshelf.version = Inshelf.version || '0.1.0';
  if (typeof module !== 'undefined' && module.exports) module.exports = Inshelf;
})(typeof globalThis !== 'undefined' ? globalThis : this);
