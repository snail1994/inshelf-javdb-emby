/*
 * Minimal bottom-centered toast. Errors are de-duplicated so a broken Emby
 * connection does not produce one toast per JavDB card.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var seenErrors = {};
  var MAX_TOASTS = 3;
  var DURATION = 3200;

  function container(doc) {
    if (!doc || !doc.body) return null;
    var el = doc.getElementById('inshelf-toast-container');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'inshelf-toast-container';
      el.className = 'inshelf-toast-container';
      doc.body.appendChild(el);
    }
    return el;
  }

  function show(doc, message, type) {
    var box = container(doc);
    if (!box || !message) return;

    while (box.children.length >= MAX_TOASTS) {
      box.removeChild(box.children[0]);
    }

    var toast = doc.createElement('div');
    toast.className = 'inshelf-toast' + (type ? ' ' + type : '');
    toast.textContent = String(message);
    box.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      if (box.parentNode && !box.children.length) box.parentNode.removeChild(box);
    }, DURATION);
  }

  function showErrorOnce(doc, key, message) {
    if (seenErrors[key]) return;
    seenErrors[key] = 1;
    show(doc, message, 'error');
  }

  function reset() {
    seenErrors = {};
  }

  var api = {
    show: show,
    showErrorOnce: showErrorOnce,
    reset: reset
  };

  Inshelf.ui = Inshelf.ui || {};
  Inshelf.ui.toast = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
