/*
 * JavDB adapter.
 *
 * Selectors are intentionally short and isolated here: when JavDB changes its
 * markup, this is the only file that needs updating. Detail pages use the
 * panel value as the source of truth because `.video-title` also appears in
 * recommendation blocks and would mis-label the main film.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var codes = Inshelf.codes;
  if (!codes) throw new Error('Inshelf.codes must load before sites/javdb');

  var DETAIL_VALUE_SELECTORS = [
    '.video-detail .panel-block.first-block .value',
    '.panel-block.first-block .value',
    '.movie-panel-info .panel-block.first-block .value'
  ];

  var DETAIL_MOUNT_SELECTORS = [
    '.video-detail .panel-block.first-block',
    '.panel-block.first-block',
    '.movie-panel-info',
    '.video-detail'
  ];

  function parseDetailCode(text) {
    var list = codes.extractCodes(text || '');
    return list.length ? list[0] : null;
  }

  function parseListTitle(text) {
    return codes.extractCodes(text || '');
  }

  function isActive(loc) {
    var host = (loc && loc.hostname) || '';
    return /javdb/i.test(host);
  }

  function isDetailPage(doc) {
    if (!doc) return false;
    if (doc.querySelector && doc.querySelector('.video-detail')) return true;
    var path = (doc.location && doc.location.pathname) || '';
    return /^\/v\//.test(path);
  }

  function getDetailCode(doc) {
    if (!doc || !doc.querySelector) return null;

    for (var i = 0; i < DETAIL_VALUE_SELECTORS.length; i++) {
      var el = doc.querySelector(DETAIL_VALUE_SELECTORS[i]);
      if (el) {
        var found = parseDetailCode(el.textContent || '');
        if (found) return found;
      }
    }

    var title = doc.querySelector('.video-detail h2.title, .video-detail .title, h2.title');
    if (title) {
      var fromTitle = parseDetailCode(title.textContent || '');
      if (fromTitle) return fromTitle;
    }

    var og = doc.querySelector('meta[property="og:title"]');
    if (og) {
      return parseDetailCode(og.getAttribute('content') || '');
    }

    return null;
  }

  function getDetailMount(doc) {
    if (!doc || !doc.querySelector) return null;
    for (var i = 0; i < DETAIL_MOUNT_SELECTORS.length; i++) {
      var el = doc.querySelector(DETAIL_MOUNT_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  function getListItems(doc) {
    if (!doc || !doc.querySelectorAll) return [];

    var nodes = doc.querySelectorAll('.movie-list .item, .movie-list > .item, .grid-item');
    var out = [];

    for (var i = 0; i < nodes.length; i++) {
      var item = nodes[i];
      if (!item) continue;

      var titleEl = item.querySelector('.video-title');
      var strong = titleEl && titleEl.querySelector('strong');
      var text = (strong && strong.textContent) || (titleEl && titleEl.textContent) || '';
      var found = parseListTitle(text);

      if (!found.length) {
        var anchor = item.querySelector('a[href*="/v/"]');
        if (anchor) {
          found = parseListTitle(anchor.getAttribute('title') || anchor.textContent || '');
        }
      }

      if (!found.length) continue;

      out.push({
        code: found[0],
        element: item,
        // Mount inside the <strong> that holds the code, not at the end of
        // `.video-title`: the title box is often clipped to one line, so a
        // badge appended after a long title is invisible.
        mount: strong || titleEl || item.querySelector('.box') || item,
        titleEl: titleEl || null
      });
    }

    return out;
  }

  function observe(doc, onChange) {
    if (!doc || !doc.defaultView) return null;
    var win = doc.defaultView;
    var target = doc.documentElement || doc.body;
    if (!win.MutationObserver || !target) return null;

    var timer = null;
    var observer = new win.MutationObserver(function () {
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(function () {
        if (typeof onChange === 'function') onChange();
      }, 200);
    });

    // Observe the document root, not body: a Turbo/PJAX body swap must not
    // silently kill infinite-scroll badge updates.
    observer.observe(target, { childList: true, subtree: true });

    return {
      disconnect: function () {
        if (timer) win.clearTimeout(timer);
        observer.disconnect();
      }
    };
  }

  var adapter = {
    id: 'javdb',
    name: 'JavDB',
    hosts: [/javdb/i],
    isActive: isActive,
    isDetailPage: isDetailPage,
    getDetailCode: getDetailCode,
    getDetailMount: getDetailMount,
    getListItems: getListItems,
    observe: observe,
    parseDetailCode: parseDetailCode,
    parseListTitle: parseListTitle
  };

  Inshelf.sites = Inshelf.sites || {};
  Inshelf.sites.javdb = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
