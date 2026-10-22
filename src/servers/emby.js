/*
 * Emby adapter (read-only).
 *
 * Emby's /Items endpoint can return the whole library in pages. We read
 * Path/OriginalTitle/ProductionYear once and let the core build a local index.
 * We never call POST/DELETE or change anything in Emby.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};

  var FIELDS = [
    {
      key: 'baseUrl',
      label: 'Emby 服务器地址',
      type: 'url',
      placeholder: 'http://192.168.1.10:8096/emby',
      hint: '填 http://IP:8096 或 http://IP:8096/emby 都可以，脚本会自动尝试'
    },
    {
      key: 'apiKey',
      label: 'Emby API Key',
      type: 'password',
      placeholder: '在 Emby 控制台 → 高级 → API 密钥 创建',
      hint: '只保存在油猴本地存储，不会上传到别处'
    },
    {
      key: 'ttlMinutes',
      label: '缓存有效期',
      type: 'select',
      options: [5, 15, 30, 60],
      default: 30,
      hint: '超过这个时间会在后台自动刷新媒体库索引'
    }
  ];

  function stripSlash(input) {
    return String(input || '').trim().replace(/\/+$/, '');
  }

  function unique(list) {
    var seen = {};
    return list.filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = 1;
      return true;
    });
  }

  /**
   * Return the user URL plus the /emby variant, in a sensible order.
   * A URL that already ends in /emby also gets the bare origin as a fallback.
   */
  function candidateBaseUrls(input) {
    var s = stripSlash(input);
    if (!s) return [];
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;

    var out = [s];
    if (/\/emby$/i.test(s)) {
      out.push(s.replace(/\/emby$/i, ''));
    } else {
      out.push(s + '/emby');
    }
    return unique(out);
  }

  function normalizeBaseUrl(input) {
    return candidateBaseUrls(input)[0] || '';
  }

  function describeStatus(res) {
    var status = res && res.status;
    if (status === 401 || status === 403) {
      return 'API Key 无效或没有权限（HTTP ' + status + '）';
    }
    if (status === 404) {
      return '地址不对（HTTP 404），通常应填 http://IP:8096/emby';
    }
    if (!status) {
      return (res && res.message) || '无法连接 Emby，请检查地址、端口、防火墙或证书';
    }
    return 'Emby 返回 HTTP ' + status;
  }

  async function getWithAuth(http, url, apiKey, timeout) {
    var headers = { Accept: 'application/json' };
    var hasQueryKey = /[?&]api_key=/.test(url);
    if (apiKey && !hasQueryKey) headers['X-Emby-Token'] = apiKey;

    var res = await http.getJson(url, headers, timeout);

    // Some reverse proxies strip X-Emby-Token; retry with the legacy query key.
    if ((res.status === 401 || res.status === 403) && apiKey && !hasQueryKey) {
      var sep = url.indexOf('?') >= 0 ? '&' : '?';
      res = await http.getJson(
        url + sep + 'api_key=' + encodeURIComponent(apiKey),
        { Accept: 'application/json' },
        timeout
      );
    }
    return res;
  }

  /**
   * Verify the URL/key and return the working base URL plus server identity.
   * Never throws: the settings panel needs a plain result object.
   */
  async function testConnection(config, http) {
    config = config || {};
    var candidates = candidateBaseUrls(config.baseUrl);
    if (!candidates.length) {
      return { ok: false, status: 0, message: '请先填写 Emby 服务器地址' };
    }

    var last = null;
    for (var i = 0; i < candidates.length; i++) {
      var base = candidates[i];
      try {
        var info = await getWithAuth(http, base + '/System/Info', config.apiKey, 15000);
        if (info.status === 200 && info.data) {
          return {
            ok: true,
            baseUrl: base,
            serverId: info.data.Id || '',
            serverName: info.data.ServerName || 'Emby',
            version: info.data.Version || ''
          };
        }
        last = info;

        // Non-admin keys may not read /System/Info. Public info + a tiny
        // /Items probe still proves the key can read the library.
        var pub = await getWithAuth(http, base + '/System/Info/Public', '', 15000);
        if (pub.status === 200) {
          var probe = await getWithAuth(
            http,
            base + '/Items?Limit=1&Recursive=true&IncludeItemTypes=Movie&Fields=Path',
            config.apiKey,
            15000
          );
          if (probe.status === 200) {
            return {
              ok: true,
              baseUrl: base,
              serverId: (pub.data && pub.data.Id) || '',
              serverName: (pub.data && pub.data.ServerName) || 'Emby',
              version: (pub.data && pub.data.Version) || ''
            };
          }
          last = probe;
        }
      } catch (e) {
        last = { status: 0, message: e.message || String(e) };
      }
    }

    return {
      ok: false,
      status: last && last.status,
      message: (last && last.message) || describeStatus(last)
    };
  }

  function buildItemsPath(start, limit, itemTypes) {
    return '/Items?Recursive=true'
      + '&IncludeItemTypes=' + encodeURIComponent(itemTypes)
      + '&Fields=Path%2COriginalTitle%2CProductionYear'
      + '&Limit=' + limit
      + '&StartIndex=' + start;
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Fetch every Movie/Video item, page by page.
   * @returns {Promise<{items:Array,total:number,truncated:boolean}>}
   */
  async function fetchLibrary(config, http, onProgress) {
    config = config || {};
    var candidates = candidateBaseUrls(config.baseUrl);
    if (!candidates.length) throw new Error('请先填写 Emby 地址');

    var limit = Number(config.limit);
    if (!isFinite(limit) || limit < 1) limit = 1000;
    if (limit > 5000) limit = 5000;

    var itemTypes = config.includeItemTypes || 'Movie,Video';
    var pageDelay = Number(config.pageDelayMs);
    if (!isFinite(pageDelay) || pageDelay < 0) pageDelay = 100;

    // First page also validates the URL, trying / and /emby variants.
    var base = null;
    var firstPage = null;
    var last = null;
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      var res = await getWithAuth(
        http,
        candidate + buildItemsPath(0, limit, itemTypes),
        config.apiKey,
        30000
      );
      if (res.status === 200) {
        base = candidate;
        firstPage = res;
        break;
      }
      last = res;
    }
    if (!base) throw new Error(describeStatus(last));

    var all = [];
    var total = 0;
    var start = 0;
    var pageData = firstPage;

    for (var page = 0; page < 50; page++) {
      var data = (pageData && pageData.data) || {};
      var items = data.Items || [];

      total = typeof data.TotalRecordCount === 'number' ? data.TotalRecordCount : total;

      for (var j = 0; j < items.length; j++) {
        var item = items[j] || {};
        all.push({
          id: item.Id,
          name: item.Name || '',
          originalTitle: item.OriginalTitle || '',
          path: item.Path || '',
          year: item.ProductionYear || ''
        });
      }

      if (typeof onProgress === 'function') {
        onProgress({ loaded: all.length, total: total, page: page + 1 });
      }

      if (!items.length) break;
      start += items.length;
      if (total && start >= total) break;
      if (page === 49) break;

      if (pageDelay > 0) await delay(pageDelay);
      var next = await getWithAuth(
        http,
        base + buildItemsPath(start, limit, itemTypes),
        config.apiKey,
        30000
      );
      if (next.status !== 200) throw new Error(describeStatus(next));
      pageData = next;
    }

    return {
      items: all,
      total: total || all.length,
      truncated: !!(total && all.length < total),
      baseUrl: base
    };
  }

  function buildItemUrl(config, item) {
    var base = stripSlash(config && config.baseUrl);
    if (!base) return '';
    if (!item || !item.id) return base + '/web/index.html';
    var serverId = config.serverId
      ? '&serverId=' + encodeURIComponent(config.serverId)
      : '';
    return base + '/web/index.html#!/item?id=' + encodeURIComponent(item.id) + serverId;
  }

  function buildSearchUrl(config, code) {
    var base = stripSlash(config && config.baseUrl);
    if (!base) return '';
    return base + '/web/index.html#!/search?query=' + encodeURIComponent(code || '');
  }

  var adapter = {
    id: 'emby',
    name: 'Emby',
    fields: FIELDS,
    candidateBaseUrls: candidateBaseUrls,
    normalizeBaseUrl: normalizeBaseUrl,
    describeStatus: describeStatus,
    testConnection: testConnection,
    fetchLibrary: fetchLibrary,
    buildItemUrl: buildItemUrl,
    buildSearchUrl: buildSearchUrl
  };

  Inshelf.servers = Inshelf.servers || {};
  Inshelf.servers.emby = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
