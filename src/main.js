/*
 * Userscript entry point. Registered adapters are the only site/server-specific
 * pieces; everything else is shared.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof location === 'undefined') {
    return; // Node tests require source modules directly, never main.
  }

  var Inshelf = root.Inshelf;
  if (!Inshelf || Inshelf.__started) return;
  Inshelf.__started = true;

  try {
    Inshelf.serverRegistry.register(Inshelf.servers.emby);
    Inshelf.siteRegistry.register(Inshelf.sites.javdb);
    Inshelf.siteRegistry.register(Inshelf.sites.av123);

    var storage = Inshelf.storage.createStorage(
      typeof GM_getValue === 'function' ? GM_getValue : null,
      typeof GM_setValue === 'function' ? GM_setValue : null
    );

    var http = Inshelf.http.createHttp(
      typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null
    );

    var app = Inshelf.createApp({
      doc: document,
      win: window,
      loc: location,
      storage: storage,
      http: http
    });

    Inshelf.app = app;
    app.init();
  } catch (e) {
    if (window.console && window.console.error) {
      window.console.error('[Inshelf] 初始化失败', e);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
