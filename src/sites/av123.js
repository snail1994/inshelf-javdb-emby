/*
 * 123AV adapter.
 *
 * 123AV does not expose a stable public class contract, so this adapter uses
 * the two things that are stable: the detail URL (`/v/<code-slug>`) and the
 * per-card link to that URL. Everything else is a bounded fallback, which keeps
 * the adapter useful even if the theme changes.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var codes = Inshelf.codes;
  if (!codes) throw new Error('Inshelf.codes must load before sites/av123');

  var DETAIL_PATH_RE = /\/v\/([^/?#]+)/i;
  var CARD_SELECTOR = 'article, li, .item, .video-item, .card, .thumb, .col, .grid-item, .post';

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (e) {
      return value;
    }
  }

  function parseDetailCode(text) {
    var list = codes.extractCodes(text || '');
    return list.length ? list[0] : null;
  }

  function parseListTitle(text) {
    return codes.extractCodes(text || '');
  }

  /**
   * Extract the code from `/v/<slug>`. The slug is the most reliable source:
   * it is present before the page title is parsed and survives theme changes.
   */
  function codeFromHref(href) {
    var match = DETAIL_PATH_RE.exec(String(href || ''));
    if (!match) return null;
    return parseDetailCode(safeDecode(match[1]));
  }

  function pagePath(doc) {
    var loc = (doc && doc.location)
      || (doc && doc.defaultView && doc.defaultView.location)
      || {};
    return loc.pathname || '';
  }

  function isActive(loc) {
    var host = (loc && loc.hostname) || '';
    return /^(?:[a-z0-9-]+\.)*123av\.com$/i.test(host);
  }

  function isDetailPage(doc) {
    if (!doc) return false;
    if (DETAIL_PATH_RE.test(pagePath(doc))) return true;
    // A client-side route may not update the path; the player iframe is a
    // reliable detail-page signal. Do not use the generic `.video-info` class:
    // 123AV also uses it on list cards.
    return !!(doc.querySelector && doc.querySelector(
      'iframe[src*="javplayer"], .video-detail'
    ));
  }

  function getDetailCode(doc) {
    if (!doc) return null;

    var fromPath = codeFromHref(pagePath(doc));
    if (fromPath) return fromPath;

    if (doc.querySelector) {
      var selectors = [
        'main h1',
        '.video-title',
        '.video-title h1',
        '.video-info h1',
        'h1',
        'meta[property="og:title"]'
      ];
      for (var i = 0; i < selectors.length; i++) {
        var el = doc.querySelector(selectors[i]);
        if (!el) continue;
        var text = el.getAttribute
          ? (el.getAttribute('content') || el.textContent || '')
          : (el.textContent || '');
        var found = parseDetailCode(text);
        if (found) return found;
      }
    }

    return parseDetailCode((doc.title || '') + ' ' + (doc.textContent || '').slice(0, 500));
  }

  function getDetailMount(doc) {
    if (!doc || !doc.querySelector) return null;
    var selectors = [
      'main h1',
      '.video-title',
      '.video-info h1',
      'h1',
      '.video-info',
      'main'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = doc.querySelector(selectors[i]);
      if (el) return el;
    }
    return doc.body || null;
  }

  function closestCard(anchor) {
    var semantic = anchor.closest && anchor.closest(CARD_SELECTOR);
    if (semantic && (!semantic.querySelector || semantic.querySelector('img'))) {
      return semantic;
    }

    var el = anchor;
    for (var depth = 0; depth < 5 && el; depth++, el = el.parentElement) {
      if (!el.querySelector || !el.querySelector('img')) continue;
      if (!(el.textContent || '').trim()) continue;
      var links = el.querySelectorAll ? el.querySelectorAll('a[href*="/v/"]') : [];
      // Do not collapse an entire grid into one "card".
      if (!links.length || links.length <= 4) return el;
    }
    return anchor.parentElement || anchor;
  }

  function findMount(card, anchor) {
    if (card && card.querySelector) {
      // 123AV clamps the title link to one line. A badge appended inside that
      // link is in the accessibility tree but visually clipped, so prefer an
      // overlay on the cover image.
      var img = card.querySelector('img');
      if (img) {
        var cover = (img.closest && img.closest('a')) || img.parentElement || card;
        return { mount: cover, overlay: true };
      }

      var selectors = ['h1', 'h2', 'h3', 'h4', '.title', '[class*="title"]'];
      for (var i = 0; i < selectors.length; i++) {
        var el = card.querySelector(selectors[i]);
        if (el) return { mount: el, overlay: false };
      }
    }
    var fallback = (anchor.textContent || '').trim() ? anchor : (card || anchor);
    return { mount: fallback, overlay: false };
  }

  function getListItems(doc) {
    if (!doc || !doc.querySelectorAll) return [];

    var anchors = doc.querySelectorAll('a[href]');
    var out = [];
    var seen = [];

    for (var i = 0; i < anchors.length; i++) {
      var anchor = anchors[i];
      if (!anchor) continue;

      // Header/nav/footer links are navigation, not film cards. The h1 guard
      // prevents a detail page's title link from becoming a duplicate card.
      if (anchor.closest && anchor.closest('header, nav, footer, h1')) continue;

      var href = anchor.getAttribute('href') || anchor.href || '';
      var code = codeFromHref(href);

      if (!code) {
        var img = anchor.querySelector && anchor.querySelector('img');
        var text = [
          anchor.textContent || '',
          anchor.getAttribute('title') || '',
          img && img.getAttribute ? (img.getAttribute('alt') || '') : ''
        ].join(' ');
        code = parseDetailCode(text);
      }

      if (!code) continue;

      var card = closestCard(anchor);
      if (!card || seen.indexOf(card) !== -1) continue;
      seen.push(card);

      var mountInfo = findMount(card, anchor);
      out.push({
        code: code,
        element: card,
        mount: mountInfo.mount,
        overlay: mountInfo.overlay
      });
    }

    return out;
  }

  var adapter = {
    id: 'av123',
    name: '123AV',
    hosts: [/123av\.com$/i],
    isActive: isActive,
    isDetailPage: isDetailPage,
    getDetailCode: getDetailCode,
    getDetailMount: getDetailMount,
    getListItems: getListItems,
    parseDetailCode: parseDetailCode,
    parseListTitle: parseListTitle,
    codeFromHref: codeFromHref
  };

  Inshelf.sites = Inshelf.sites || {};
  Inshelf.sites.av123 = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
