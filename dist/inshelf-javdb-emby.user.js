// ==UserScript==
// @name         Inshelf · JavDB / 123AV Emby 入库检测
// @namespace    https://github.com/snail1994/inshelf-javdb-emby
// @version      0.2.0
// @description  在 JavDB / 123AV 列表页/详情页显示影片是否已收入 Emby 媒体库，可点击跳转。
// @author       snail1994
// @license      MIT
// @homepageURL  https://github.com/snail1994/inshelf-javdb-emby
// @supportURL   https://github.com/snail1994/inshelf-javdb-emby/issues
// @updateURL    https://raw.githubusercontent.com/snail1994/inshelf-javdb-emby/main/dist/inshelf-javdb-emby.user.js
// @downloadURL  https://raw.githubusercontent.com/snail1994/inshelf-javdb-emby/main/dist/inshelf-javdb-emby.user.js
// @match        *://javdb.com/*
// @match        *://*.javdb.com/*
// @match        *://javdb*.com/*
// @match        *://*.javdb*.com/*
// @include      *://*javdb*.com/*
// @match        *://123av.com/*
// @match        *://*.123av.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* ===== src/core/namespace.js ===== */
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

/* ===== src/core/codes.js ===== */
/*
 * Code extraction / normalization.
 *
 * JAV codes are intentionally messy: ABC-123, ABC_123, ABC123, abc-123-C,
 * FC2-PPV-1234567, T28-123, MDWP0034, and filenames such as
 * [ThZu.Cc]ABC-123-C.mp4. This module turns any of them into a canonical
 * uppercase form and produces lookup variants used by the matcher.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};

  var EXT_RE = /\.(mp4|mkv|avi|wmv|mov|ts|m2ts|strm|iso|rmvb|flv|webm)$/i;

  // Lookbehind keeps match.index exact and avoids consuming the boundary.
  var STANDARD_RE = /(?<![A-Z0-9])([A-Z0-9]{2,10})[\s_-]+(\d{2,6})(?![A-Z0-9])/gi;
  var COMPACT_RE = /(?<![A-Z0-9])([A-Z]{2,6})(\d{2,5})(?![A-Z0-9])/g;
  var FC2_RE = /(?<![A-Z0-9])FC2[\s_-]?PPV[\s_-]?(\d{5,8})(?![A-Z0-9])/gi;
  var FC2_PLAIN_RE = /(?<![A-Z0-9])FC2[\s_-]?(\d{5,8})(?![A-Z0-9])/gi;

  // Common release/quality tags that look like a code prefix.
  var TECH_PREFIXES = {
    FHD: 1, UHD: 1, HD: 1, SD: 1, HDR: 1, SDR: 1,
    X264: 1, X265: 1, H264: 1, H265: 1, HEVC: 1, AV1: 1, VP9: 1,
    AAC: 1, AC3: 1, DTS: 1, MP4: 1, MKV: 1, AVI: 1, WMV: 1, MOV: 1,
    WEB: 1, BLURAY: 1, BDRIP: 1, HDTV: 1, REMUX: 1, PROPER: 1,
    REPACK: 1, EXTENDED: 1, UNCUT: 1, '4K': 1, '8K': 1
  };

  // Tags only make sense with a resolution number (FHD-1080), so a valid
  // code such as HD-123 is still allowed.
  var RESOLUTIONS = {
    '480': 1, '540': 1, '720': 1, '1080': 1,
    '1440': 1, '2160': 1, '4320': 1
  };

  function uniq(list) {
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i] || '').toUpperCase();
      if (!key || seen[key]) continue;
      seen[key] = 1;
      out.push(key);
    }
    return out;
  }

  /**
   * Strip query/hash, normalize slashes, take the last segment, decode URI
   * escapes and remove a media extension. Works for Windows and POSIX paths.
   */
  function basename(input) {
    var s = String(input || '');
    s = s.split('?')[0].split('#')[0].replace(/\\/g, '/');
    var parts = s.split('/');
    var b = parts[parts.length - 1] || '';
    try {
      b = decodeURIComponent(b);
    } catch (e) {
      /* keep the raw segment */
    }
    return b.replace(EXT_RE, '');
  }

  function isNoise(prefix, digits, text, index, raw) {
    if (/^\d+$/.test(prefix)) return true; // 2024-10-23
    var p = prefix.toUpperCase();
    if (TECH_PREFIXES[p] && RESOLUTIONS[digits]) return true;
    if (TECH_PREFIXES[p]) {
      var before = text.charAt(index - 1);
      var after = text.charAt(index + raw.length);
      if (/[[(（【]/.test(before) || /[\])）】]/.test(after)) return true;
    }
    return false;
  }

  /**
   * Extract canonical codes from arbitrary text (title, filename, path).
   * Returns a de-duplicated array in first-seen order.
   */
  function extractCodes(input) {
    var text = String(input || '').replace(EXT_RE, '');
    if (!text) return [];

    var found = [];

    // FC2 first, then blank the token so the generic patterns cannot also
    // report "PPV-1234567" as a separate code.
    var cleaned = text.replace(FC2_RE, function (m, digits) {
      found.push('FC2-PPV-' + digits);
      return ' ';
    });
    cleaned = cleaned.replace(FC2_PLAIN_RE, function (m, digits) {
      found.push('FC2-' + digits);
      return ' ';
    });

    var m;
    STANDARD_RE.lastIndex = 0;
    while ((m = STANDARD_RE.exec(cleaned))) {
      if (isNoise(m[1], m[2], cleaned, m.index, m[0])) continue;
      found.push(m[1].toUpperCase() + '-' + m[2]);
    }

    COMPACT_RE.lastIndex = 0;
    while ((m = COMPACT_RE.exec(cleaned))) {
      if (isNoise(m[1], m[2], cleaned, m.index, m[0])) continue;
      found.push(m[1].toUpperCase() + '-' + m[2]);
    }

    return uniq(found);
  }

  /**
   * Normalize a single code-like string. Returns '' for empty/unsupported.
   */
  function normalize(input) {
    var s = String(input || '')
      .trim()
      .toUpperCase()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!s) return '';

    var fc2 = /^FC2-PPV-(\d{5,8})$/.exec(s);
    if (fc2) return 'FC2-PPV-' + fc2[1];

    var fc2plain = /^FC2-(\d{5,8})$/.exec(s);
    if (fc2plain) return 'FC2-' + fc2plain[1];

    var standard = /^([A-Z0-9]{2,10})-(\d{2,8})$/.exec(s);
    if (standard) return standard[1] + '-' + standard[2];

    return s;
  }

  /**
   * Lookup variants, in priority order: exact, no-leading-zero, suffix-stripped,
   * compact, FC2 aliases. The matcher tries these against its index.
   */
  function variants(input) {
    var code = normalize(input);
    if (!code) return [];

    var out = [code];
    var parts = code.split('-');
    var last = parts[parts.length - 1];

    if (/^\d+$/.test(last)) {
      var noZero = last.replace(/^0+(?=\d)/, '');
      if (noZero !== last) {
        var head = parts.slice(0, -1).join('-');
        out.push(head + '-' + noZero);
        out.push(head + noZero);
      }
    }

    // ABC-123-C / ABC-123-UC / ABC-123-CD1 / ABC-123-1
    var suffix = /^(.+?-\d{2,6})-(?:C|UC|CH|CD\d+|DISC\d+|\d{1,2}|[A-Z])$/.exec(code);
    if (suffix) out.push(suffix[1]);

    if (/^FC2-PPV-/.test(code)) {
      var d = code.slice('FC2-PPV-'.length);
      out.push('FC2-' + d);
      out.push('FC2PPV' + d);
      out.push('FC2PPV-' + d);
    } else if (/^FC2-/.test(code)) {
      var d2 = code.slice('FC2-'.length);
      out.push('FC2-PPV-' + d2);
      out.push('FC2PPV' + d2);
    }

    out.push(code.replace(/-/g, ''));
    return uniq(out);
  }

  function compact(input) {
    return normalize(input).replace(/-/g, '');
  }

  var api = {
    basename: basename,
    extractCodes: extractCodes,
    normalize: normalize,
    variants: variants,
    compact: compact,
    EXT_RE: EXT_RE
  };

  Inshelf.codes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== src/core/matcher.js ===== */
/*
 * Build a compact code index from a media-server library and look codes up.
 *
 * The index deliberately stores only {id, name, year, count}, not full paths,
 * so a 50k-item library stays small enough for userscript storage.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var codes = Inshelf.codes;
  if (!codes) throw new Error('Inshelf.codes must load before matcher');

  function addText(texts, value, fromPath) {
    if (!value) return;
    var s = String(value);
    texts.push(fromPath ? codes.basename(s) : s);
    // A title can itself be a filename, and a path can carry the code in a
    // parent folder; extracting from both is cheap and improves recall.
    texts.push(s);
  }

  /**
   * @param {Array<{id:string,name?:string,path?:string,originalTitle?:string,original_title?:string,year?:string|number}>} items
   * @returns {{byCode:Object,byCompact:Object,total:number,coded:number,coverage:number}}
   */
  function buildIndex(items) {
    var byCode = {};
    var byCompact = {};
    var total = 0;
    var coded = 0;

    (items || []).forEach(function (item) {
      if (!item) return;
      total++;

      var texts = [];
      addText(texts, item.path, true);
      addText(texts, item.name, false);
      addText(texts, item.originalTitle, false);
      addText(texts, item.original_title, false);

      var found = [];
      var seen = {};
      texts.forEach(function (text) {
        codes.extractCodes(text).forEach(function (code) {
          if (!seen[code]) {
            seen[code] = 1;
            found.push(code);
          }
        });
      });

      if (found.length) coded++;

      found.forEach(function (code) {
        var compact = codes.compact(code);
        if (compact && !byCompact[compact]) byCompact[compact] = code;

        var entry = byCode[code];
        if (entry) {
          entry.count++;
          return;
        }
        byCode[code] = {
          id: item.id,
          name: item.name || '',
          year: item.year || '',
          count: 1
        };
      });
    });

    return {
      byCode: byCode,
      byCompact: byCompact,
      total: total,
      coded: coded,
      coverage: total > 0 ? coded / total : 0
    };
  }

  /**
   * @returns {{item:Object,count:number,matchType:string}|null}
   */
  function lookup(index, code) {
    if (!index || !code) return null;
    var byCode = index.byCode || index;
    var byCompact = index.byCompact || {};
    var list = codes.variants(code);

    for (var i = 0; i < list.length; i++) {
      var variant = list[i];
      if (byCode[variant]) {
        return {
          item: byCode[variant],
          count: byCode[variant].count || 1,
          matchType: variant === codes.normalize(code) ? 'exact' : 'variant'
        };
      }
    }

    for (var j = 0; j < list.length; j++) {
      var canonical = byCompact[codes.compact(list[j])];
      if (canonical && byCode[canonical]) {
        return {
          item: byCode[canonical],
          count: byCode[canonical].count || 1,
          matchType: 'compact'
        };
      }
    }

    return null;
  }

  var api = {
    buildIndex: buildIndex,
    lookup: lookup
  };

  Inshelf.matcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== src/core/state.js ===== */
/*
 * Resolve one JavDB code against every configured media server.
 *
 * The result is intentionally per-server so the UI can render several badges
 * later (Emby + Jellyfin) without changing the core. v0.1 uses one server.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var matcher = Inshelf.matcher;
  if (!matcher) throw new Error('Inshelf.matcher must load before state');

  function isStale(index, ttlMinutes, now) {
    if (!index || !index.ts) return true;
    var ttl = Number(ttlMinutes);
    if (!isFinite(ttl) || ttl <= 0) ttl = 30;
    return (now || Date.now()) - Number(index.ts) > ttl * 60000;
  }

  /**
   * @param {{
   *   config: Object,
   *   indexes: Object,
   *   code: string,
   *   syncing?: Object,
   *   errors?: Object,
   *   now?: number,
   *   ttlMinutes?: number,
   *   coverageThreshold?: number
   * }} opts
   * @returns {{overall:string,servers:Object}}
   */
  function resolve(opts) {
    opts = opts || {};
    var config = opts.config || {};
    var indexes = opts.indexes || {};
    var syncing = opts.syncing || {};
    var errors = opts.errors || {};
    var now = opts.now || Date.now();
    var ttl = opts.ttlMinutes || 30;
    var threshold = typeof opts.coverageThreshold === 'number' ? opts.coverageThreshold : 0.5;

    var indexMap = indexes.servers || indexes;
    var configServers = config.servers || {};
    var result = {};

    Object.keys(configServers).forEach(function (serverId) {
      var cfg = configServers[serverId] || {};
      if (cfg.enabled === false) return;

      var base = {
        serverId: serverId,
        serverName: cfg.serverName || cfg.name || serverId,
        serverType: cfg.type || serverId
      };

      if (!cfg.baseUrl || !cfg.apiKey) {
        result[serverId] = Object.assign({}, base, { status: 'unconfigured' });
        return;
      }

      var index = indexMap && indexMap[serverId];

      if (syncing[serverId] && !index) {
        result[serverId] = Object.assign({}, base, { status: 'loading' });
        return;
      }

      if (errors[serverId] && !index) {
        result[serverId] = Object.assign({}, base, {
          status: 'error',
          message: errors[serverId]
        });
        return;
      }

      if (!index) {
        result[serverId] = Object.assign({}, base, { status: 'loading' });
        return;
      }

      var match = matcher.lookup(index, opts.code);
      if (match) {
        result[serverId] = Object.assign({}, base, {
          status: 'in',
          item: match.item,
          count: match.count,
          matchType: match.matchType,
          ts: index.ts
        });
        return;
      }

      var coverage = typeof index.coverage === 'number' ? index.coverage : 1;
      if (coverage < threshold) {
        result[serverId] = Object.assign({}, base, {
          status: 'unknown',
          reason: 'low-coverage',
          coverage: coverage,
          ts: index.ts
        });
        return;
      }

      if (isStale(index, ttl, now)) {
        result[serverId] = Object.assign({}, base, {
          status: 'unknown',
          reason: 'stale',
          ts: index.ts
        });
        return;
      }

      result[serverId] = Object.assign({}, base, { status: 'out', ts: index.ts });
    });

    var statuses = Object.keys(result).map(function (id) {
      return result[id].status;
    });

    var overall = 'unknown';
    if (statuses.indexOf('in') >= 0) overall = 'in';
    else if (statuses.length && statuses.every(function (s) { return s === 'error'; })) overall = 'error';
    else if (statuses.length && statuses.every(function (s) { return s === 'unconfigured'; })) overall = 'unconfigured';
    else if (statuses.indexOf('loading') >= 0) overall = 'loading';
    else if (statuses.indexOf('unknown') >= 0) overall = 'unknown';
    else if (statuses.indexOf('out') >= 0) overall = 'out';

    return { overall: overall, servers: result };
  }

  var api = {
    resolve: resolve,
    isStale: isStale
  };

  Inshelf.state = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== src/servers/registry.js ===== */
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

/* ===== src/servers/http.js ===== */
/*
 * Tiny HTTP wrapper around GM_xmlhttpRequest.
 *
 * Adapters receive this object instead of calling GM_* directly, which keeps
 * them testable in Node with a fake { getJson(url, headers, timeout) }.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};

  function createHttp(gmRequest) {
    function getJson(url, headers, timeout) {
      return new Promise(function (resolve, reject) {
        if (typeof gmRequest !== 'function') {
          reject(new Error('GM_xmlhttpRequest 不可用，请检查油猴脚本权限'));
          return;
        }

        var settled = false;
        function done(fn, value) {
          if (settled) return;
          settled = true;
          fn(value);
        }

        try {
          gmRequest({
            method: 'GET',
            url: url,
            headers: headers || {},
            timeout: timeout || 30000,
            onload: function (res) {
              var data = null;
              var text = (res && res.responseText) || '';
              try {
                data = text ? JSON.parse(text) : null;
              } catch (e) {
                data = null;
              }
              done(resolve, {
                status: res && typeof res.status === 'number' ? res.status : 0,
                data: data,
                text: text
              });
            },
            onerror: function () {
              done(reject, new Error('网络错误，无法连接服务器'));
            },
            ontimeout: function () {
              done(reject, new Error('请求超时'));
            },
            onabort: function () {
              done(reject, new Error('请求被取消'));
            }
          });
        } catch (e) {
          done(reject, e);
        }
      });
    }

    return { getJson: getJson };
  }

  var api = { createHttp: createHttp };
  Inshelf.http = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== src/servers/emby.js ===== */
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

/* ===== src/sites/registry.js ===== */
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

/* ===== src/sites/javdb.js ===== */
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

/* ===== src/sites/av123.js ===== */
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
      var selectors = ['h1', 'h2', 'h3', 'h4', '.title', '[class*="title"]'];
      for (var i = 0; i < selectors.length; i++) {
        var el = card.querySelector(selectors[i]);
        if (el) return el;
      }
    }
    return (anchor.textContent || '').trim() ? anchor : (card || anchor);
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

      out.push({
        code: code,
        element: card,
        mount: findMount(card, anchor)
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

/* ===== src/storage.js ===== */
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
        javdb: { enabled: true, showList: true, showDetail: true },
        av123: { enabled: true, showList: true, showDetail: true }
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

/* ===== src/ui/styles.js ===== */
/*
 * All UI styles live here and use an `inshelf-` prefix so JavDB's own layout is
 * never touched. Injected once per page.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};
  var STYLE_ID = 'inshelf-style';

  var CSS = [
    '.inshelf-badges{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;margin-left:6px;vertical-align:middle;line-height:1.4}',
    '.inshelf-badges-overlay{position:absolute;left:6px;top:6px;margin:0;z-index:2}',
    '.inshelf-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;line-height:1.5;white-space:nowrap;border:1px solid transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif}',
    '.inshelf-in{background:#1f7a4d;color:#e2fff0;border-color:#2f9e68}',
    '.inshelf-out{background:#3a3f46;color:#d3dae3;border-color:#555d68}',
    '.inshelf-unknown{background:#7a5b12;color:#fff0c2;border-color:#a37a1c}',
    '.inshelf-loading{background:#1f4f7a;color:#dcefff;border-color:#2e6f9e}',
    '.inshelf-unconfigured{background:#7a3d12;color:#ffe6cf;border-color:#a35a24}',
    '.inshelf-error{background:#7a1f1f;color:#ffdada;border-color:#a63a3a}',
    '.inshelf-badge.is-clickable{cursor:pointer}',
    '.inshelf-badge.is-clickable:hover{filter:brightness(1.16)}',
    '.inshelf-detail-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0;padding:8px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:6px;font-size:12px;line-height:1.6}',
    '.inshelf-detail-row .inshelf-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;color:#9ad1ff;letter-spacing:.3px}',
    '.inshelf-link{color:#7cc4ff;text-decoration:none;font-size:12px;cursor:pointer}',
    '.inshelf-link:hover{text-decoration:underline}',
    '.inshelf-muted{color:#9aa4b2;font-size:11px}',
    '.inshelf-gear{position:fixed;right:18px;bottom:18px;width:40px;height:40px;border-radius:50%;background:rgba(28,32,38,.88);color:#fff;border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:2147483000;box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:.78;transition:opacity .2s,transform .2s}',
    '.inshelf-gear:hover{opacity:1;transform:scale(1.06)}',
    '.inshelf-gear.inshelf-pulse{animation:inshelf-pulse 1.8s infinite}',
    '@keyframes inshelf-pulse{0%,100%{box-shadow:0 0 0 0 rgba(124,196,255,.55)}50%{box-shadow:0 0 0 9px rgba(124,196,255,0)}}',
    '.inshelf-overlay{position:fixed;inset:0;background:rgba(0,0,0,.66);z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:16px}',
    '.inshelf-modal{width:min(580px,100%);max-height:min(760px,92vh);overflow:auto;background:#171a1f;color:#e6edf3;border:1px solid rgba(255,255,255,.13);border-radius:12px;padding:18px 18px 14px;font-size:13px;line-height:1.55;box-shadow:0 18px 50px rgba(0,0,0,.55);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif}',
    '.inshelf-modal *{box-sizing:border-box}',
    '.inshelf-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}',
    '.inshelf-modal-title{font-size:17px;font-weight:700;color:#fff}',
    '.inshelf-close{background:transparent;border:0;color:#9aa4b2;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}',
    '.inshelf-close:hover{color:#fff}',
    '.inshelf-section{margin:14px 0;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}',
    '.inshelf-section:first-of-type{border-top:0;padding-top:0}',
    '.inshelf-section-title{font-size:12px;font-weight:700;color:#9ad1ff;margin-bottom:8px;letter-spacing:.4px}',
    '.inshelf-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}',
    '.inshelf-field label{font-size:12px;color:#c7d0da;font-weight:600}',
    '.inshelf-field input,.inshelf-field select{width:100%;padding:7px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.16);background:#0f1216;color:#e6edf3;font-size:13px;outline:none}',
    '.inshelf-field input:focus,.inshelf-field select:focus{border-color:#4d9fe0}',
    '.inshelf-hint{font-size:11px;color:#8893a1}',
    '.inshelf-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}',
    '.inshelf-btn{padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.16);background:#232830;color:#e6edf3;font-size:12px;font-weight:600;cursor:pointer}',
    '.inshelf-btn:hover{background:#2c333d}',
    '.inshelf-btn.primary{background:#1f6feb;border-color:#2f7ff0;color:#fff}',
    '.inshelf-btn.primary:hover{background:#2a7bf5}',
    '.inshelf-btn.danger{color:#ffb4b4;border-color:rgba(255,120,120,.35)}',
    '.inshelf-btn:disabled{opacity:.55;cursor:not-allowed}',
    '.inshelf-status{min-height:20px;font-size:12px;color:#9aa4b2;margin:6px 0}',
    '.inshelf-status.ok{color:#6fdc9a}',
    '.inshelf-status.err{color:#ff9b9b}',
    '.inshelf-check{display:flex;align-items:center;gap:7px;font-size:12px;color:#c7d0da;margin:5px 0}',
    '.inshelf-check input{accent-color:#1f6feb}',
    '.inshelf-help{font-size:12px;color:#9aa4b2}',
    '.inshelf-help summary{cursor:pointer;color:#9ad1ff;margin-bottom:6px}',
    '.inshelf-help ol{margin:6px 0 0 18px;padding:0}',
    '.inshelf-help li{margin:3px 0}',
    '.inshelf-toast-container{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483002;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}',
    '.inshelf-toast{pointer-events:auto;background:rgba(20,23,28,.96);color:#e6edf3;border:1px solid rgba(255,255,255,.16);padding:8px 14px;border-radius:8px;font-size:13px;max-width:82vw;box-shadow:0 8px 24px rgba(0,0,0,.4)}',
    '.inshelf-toast.error{border-color:rgba(255,120,120,.5);color:#ffd6d6}',
    '.inshelf-toast.success{border-color:rgba(111,220,154,.5);color:#d8ffe8}',
    '@media (max-width:520px){.inshelf-modal{padding:14px}.inshelf-gear{right:12px;bottom:12px;width:36px;height:36px;font-size:16px}}'
  ].join('\n');

  function inject(doc) {
    if (!doc || !doc.createElement) return null;
    var existing = doc.getElementById && doc.getElementById(STYLE_ID);
    if (existing) return existing;

    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.type = 'text/css';
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
    return style;
  }

  function remove(doc) {
    var el = doc && doc.getElementById && doc.getElementById(STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  var api = { CSS: CSS, inject: inject, remove: remove };
  Inshelf.ui = Inshelf.ui || {};
  Inshelf.ui.styles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== src/ui/toast.js ===== */
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

/* ===== src/ui/badges.js ===== */
/*
 * Badge rendering for JavDB list cards and detail pages.
 *
 * `states` is the per-server object returned by core/state.resolve:
 *   { emby: { status:'in', item, count, ... }, jellyfin: {...} }
 * The renderer is intentionally server-agnostic so adding a server only needs
 * a new adapter; the badge layout stays the same.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};

  var LIST_LABEL = {
    in: '✓ 已入库',
    out: '未入库',
    unknown: '无法判断',
    loading: '检测中…',
    unconfigured: '未配置',
    error: '未连接'
  };

  function statusLabel(state) {
    if (state.status === 'in') {
      return LIST_LABEL.in + (state.count > 1 ? ' ×' + state.count : '');
    }
    if (state.status === 'unconfigured') {
      return '配置 ' + (state.serverName || state.serverId);
    }
    if (state.status === 'error') {
      return (state.serverName || state.serverId) + ' 未连接';
    }
    return LIST_LABEL[state.status] || LIST_LABEL.unknown;
  }

  function statusTitle(state, code) {
    var server = state.serverName || state.serverId || '媒体服务器';
    if (state.status === 'in') {
      var count = state.count > 1 ? '（' + state.count + ' 个版本）' : '';
      return '已在 ' + server + ' 中' + count + '\n点击打开 ' + server + ' 影片详情';
    }
    if (state.status === 'out') {
      return '索引中没有 ' + code + '\n点击在 ' + server + ' 中搜索';
    }
    if (state.status === 'unknown') {
      if (state.reason === 'low-coverage') {
        return '只有 ' + Math.round((state.coverage || 0) * 100) + '% 的影片能识别番号，无法确定';
      }
      if (state.reason === 'stale') {
        return '索引已过期，正在等待刷新';
      }
      return '无法确定是否入库';
    }
    if (state.status === 'loading') {
      return '正在同步 ' + server + ' 媒体库…';
    }
    if (state.status === 'unconfigured') {
      return '尚未配置 ' + server + '，点击打开设置';
    }
    if (state.status === 'error') {
      return '连接失败：' + (state.message || '未知错误');
    }
    return server;
  }

  function isClickable(state) {
    return state.status === 'in'
      || state.status === 'out'
      || state.status === 'unconfigured'
      || state.status === 'error';
  }

  function makeBadge(doc, state, code, ctx) {
    var badge = doc.createElement('span');
    badge.className = 'inshelf-badge inshelf-' + state.status;
    badge.setAttribute('data-inshelf-server', state.serverId || '');
    badge.setAttribute('data-inshelf-status', state.status);
    badge.textContent = statusLabel(state);
    badge.title = statusTitle(state, code);

    if (isClickable(state)) {
      badge.classList.add('is-clickable');
      badge.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (state.status === 'in') {
          ctx.openItem(state.serverId, state.item);
        } else if (state.status === 'unconfigured' || state.status === 'error') {
          ctx.openSettings();
        } else if (state.status === 'out') {
          ctx.openSearch(state.serverId, code);
        }
      });
    }

    return badge;
  }

  function stateSignature(code, states) {
    var ids = Object.keys(states || {}).sort();
    var parts = [code || ''];
    for (var i = 0; i < ids.length; i++) {
      var s = states[ids[i]] || {};
      parts.push([
        ids[i],
        s.status || '',
        s.count || 0,
        s.item && s.item.id ? s.item.id : '',
        s.ts || 0,
        s.coverage == null ? '' : s.coverage,
        s.reason || '',
        s.serverName || '',
        s.message || ''
      ].join(':'));
    }
    return parts.join('|');
  }

  function renderList(doc, opts) {
    var mount = opts.mount;
    if (!mount || !doc.createElement) return;

    var states = opts.states || {};
    var ids = Object.keys(states);

    if (!ids.length) {
      var stale = mount.querySelector ? mount.querySelector('.inshelf-badges') : null;
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
      return;
    }

    var container = mount.querySelector ? mount.querySelector('.inshelf-badges') : null;
    if (!container) {
      container = doc.createElement('span');
      container.className = 'inshelf-badges';
      if (mount.classList && mount.classList.contains('box')) {
        container.className += ' inshelf-badges-overlay';
        mount.style.position = mount.style.position || 'relative';
      }
      if (mount.classList && mount.classList.contains('video-title') && mount.firstChild) {
        mount.insertBefore(container, mount.firstChild);
      } else {
        mount.appendChild(container);
      }
    }

    // MutationObserver watches the whole document. Re-rendering identical
    // badges would itself trigger another scan and loop forever.
    var sig = stateSignature(opts.code, states);
    if (container.getAttribute('data-inshelf-sig') === sig) return;
    container.setAttribute('data-inshelf-sig', sig);
    container.textContent = '';

    ids.forEach(function (id) {
      container.appendChild(makeBadge(doc, states[id], opts.code, opts.ctx));
    });

    if (opts.element && opts.element.dataset) {
      opts.element.dataset.inshelfCode = opts.code;
    }
  }

  function makeLink(doc, text, onClick) {
    var link = doc.createElement('a');
    link.className = 'inshelf-link';
    link.href = '#';
    link.textContent = text;
    link.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return link;
  }

  function maxTimestamp(states) {
    var max = 0;
    Object.keys(states).forEach(function (id) {
      var ts = Number(states[id].ts);
      if (isFinite(ts) && ts > max) max = ts;
    });
    return max;
  }

  function formatAge(ts, now) {
    if (!ts) return '';
    var mins = Math.max(0, Math.round((now - ts) / 60000));
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + ' 分钟前';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + ' 小时前';
    return Math.round(hours / 24) + ' 天前';
  }

  function renderDetail(doc, opts) {
    var mount = opts.mount;
    if (!mount || !doc.createElement || !mount.parentNode) return;

    var states = opts.states || {};
    var ids = Object.keys(states);

    var current = mount.nextElementSibling;
    var isOurs = current && current.classList && current.classList.contains('inshelf-detail-row');

    if (!ids.length) {
      if (isOurs && current.parentNode) current.parentNode.removeChild(current);
      return;
    }

    var row = isOurs ? current : null;
    if (!row) {
      row = doc.createElement('div');
      row.className = 'inshelf-detail-row';
      mount.parentNode.insertBefore(row, mount.nextSibling);
    }

    var sig = stateSignature(opts.code, states)
      + '|' + Math.floor((opts.now || Date.now()) / 60000);
    if (row.getAttribute('data-inshelf-sig') === sig) return;
    row.setAttribute('data-inshelf-sig', sig);
    row.textContent = '';

    var codeLabel = doc.createElement('span');
    codeLabel.className = 'inshelf-code';
    codeLabel.textContent = opts.code;
    row.appendChild(codeLabel);

    ids.forEach(function (id) {
      var state = states[id];
      row.appendChild(makeBadge(doc, state, opts.code, opts.ctx));

      if (state.status === 'in') {
        row.appendChild(makeLink(doc, '在 ' + (state.serverName || 'Emby') + ' 中打开', function () {
          opts.ctx.openItem(state.serverId, state.item);
        }));
      } else if (state.status === 'out') {
        row.appendChild(makeLink(doc, '在 ' + (state.serverName || 'Emby') + ' 搜索', function () {
          opts.ctx.openSearch(state.serverId, opts.code);
        }));
      } else if (state.status === 'unconfigured' || state.status === 'error') {
        row.appendChild(makeLink(doc, '配置', function () {
          opts.ctx.openSettings();
        }));
      }
    });

    var ts = maxTimestamp(states);
    if (ts) {
      var age = doc.createElement('span');
      age.className = 'inshelf-muted';
      age.textContent = '缓存于 ' + formatAge(ts, opts.now || Date.now());
      row.appendChild(age);
    }
  }

  function clear(doc) {
    if (!doc || !doc.querySelectorAll) return;
    Array.prototype.forEach.call(doc.querySelectorAll('.inshelf-badges, .inshelf-detail-row'), function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  var api = {
    renderList: renderList,
    renderDetail: renderDetail,
    clear: clear,
    statusLabel: statusLabel,
    statusTitle: statusTitle,
    formatAge: formatAge
  };

  Inshelf.ui = Inshelf.ui || {};
  Inshelf.ui.badges = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== src/ui/settings.js ===== */
/*
 * Settings modal. Fields come from the active server adapter, so a future
 * Jellyfin adapter automatically gets its own form without editing this file.
 */
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function findAdapter(servers, id) {
    for (var i = 0; i < servers.length; i++) {
      if (servers[i].id === id) return servers[i];
    }
    return null;
  }

  function open(opts) {
    var doc = opts && opts.doc;
    if (!doc || !doc.body) return;

    var existing = doc.getElementById('inshelf-overlay');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var servers = opts.servers || [];
    if (!servers.length) return;

    var config = clone(opts.config);
    var activeId = config.activeServer || servers[0].id;
    var adapter = findAdapter(servers, activeId) || servers[0];
    activeId = adapter.id;

    var overlay = el(doc, 'div', 'inshelf-overlay');
    overlay.id = 'inshelf-overlay';

    var modal = el(doc, 'div', 'inshelf-modal');
    overlay.appendChild(modal);

    var head = el(doc, 'div', 'inshelf-modal-head');
    head.appendChild(el(doc, 'div', 'inshelf-modal-title', 'Inshelf 设置'));
    var close = el(doc, 'button', 'inshelf-close', '×');
    close.type = 'button';
    close.title = '关闭';
    head.appendChild(close);
    modal.appendChild(head);

    var body = el(doc, 'div');
    modal.appendChild(body);

    var status = el(doc, 'div', 'inshelf-status');
    body.appendChild(status);

    function setStatus(text, kind) {
      status.textContent = text || '';
      status.className = 'inshelf-status' + (kind ? ' ' + kind : '');
    }

    var serverSection = el(doc, 'div', 'inshelf-section');
    serverSection.appendChild(el(doc, 'div', 'inshelf-section-title', '媒体服务器'));
    var serverRow = el(doc, 'div', 'inshelf-row');

    if (servers.length > 1) {
      var serverSelect = el(doc, 'select');
      servers.forEach(function (server) {
        var option = el(doc, 'option', null, server.name);
        option.value = server.id;
        option.selected = server.id === activeId;
        serverSelect.appendChild(option);
      });
      serverSelect.addEventListener('change', function () {
        activeId = serverSelect.value;
        adapter = findAdapter(servers, activeId) || adapter;
        config.activeServer = activeId;
        loadServerConfig();
        renderFields();
        setStatus('');
      });
      serverRow.appendChild(serverSelect);
    } else {
      serverRow.appendChild(el(doc, 'span', 'inshelf-help', adapter.name));
    }

    serverSection.appendChild(serverRow);
    body.appendChild(serverSection);

    var fieldsSection = el(doc, 'div', 'inshelf-section');
    fieldsSection.appendChild(el(doc, 'div', 'inshelf-section-title', '连接'));
    var fieldsEl = el(doc, 'div');
    fieldsSection.appendChild(fieldsEl);
    body.appendChild(fieldsSection);

    var fieldInputs = {};
    var lastTest = null;

    function getServerConfig() {
      if (!config.servers) config.servers = {};
      if (!config.servers[activeId]) {
        config.servers[activeId] = {
          type: adapter.id,
          enabled: true,
          baseUrl: '',
          apiKey: '',
          serverId: '',
          serverName: '',
          version: '',
          ttlMinutes: 30
        };
      }
      return config.servers[activeId];
    }

    function loadServerConfig() {
      var cfg = getServerConfig();
      lastTest = cfg.baseUrl && cfg.serverId ? {
        baseUrl: cfg.baseUrl,
        serverId: cfg.serverId,
        serverName: cfg.serverName,
        version: cfg.version
      } : null;
    }

    function renderFields() {
      fieldsEl.textContent = '';
      fieldInputs = {};
      var cfg = getServerConfig();

      (adapter.fields || []).forEach(function (field) {
        var wrap = el(doc, 'div', 'inshelf-field');
        var label = el(doc, 'label', null, field.label || field.key);
        label.setAttribute('for', 'inshelf-field-' + field.key);
        wrap.appendChild(label);

        var input;
        if (field.type === 'select' && field.options) {
          input = el(doc, 'select');
          field.options.forEach(function (value) {
            var option = el(doc, 'option', null, String(value));
            option.value = String(value);
            if (String(cfg[field.key] === undefined ? field.default : cfg[field.key]) === String(value)) {
              option.selected = true;
            }
            input.appendChild(option);
          });
        } else {
          input = el(doc, 'input');
          input.type = field.type === 'password' ? 'password' : (field.type === 'url' ? 'url' : 'text');
          input.value = cfg[field.key] === undefined || cfg[field.key] === null ? '' : String(cfg[field.key]);
          if (field.placeholder) input.placeholder = field.placeholder;
          input.autocomplete = 'off';
          input.spellcheck = false;
        }

        input.id = 'inshelf-field-' + field.key;
        input.setAttribute('data-inshelf-field', field.key);
        fieldInputs[field.key] = input;
        wrap.appendChild(input);

        if (field.hint) wrap.appendChild(el(doc, 'div', 'inshelf-hint', field.hint));
        fieldsEl.appendChild(wrap);
      });
    }

    function readValues() {
      var values = {};
      Object.keys(fieldInputs).forEach(function (key) {
        values[key] = fieldInputs[key].value;
      });
      return values;
    }

    function applyValues() {
      var values = readValues();
      var cfg = getServerConfig();

      Object.keys(values).forEach(function (key) {
        cfg[key] = values[key];
      });
      cfg.type = adapter.id;
      cfg.enabled = true;
      cfg.baseUrl = String(values.baseUrl || '').trim();
      cfg.apiKey = String(values.apiKey || '').trim();
      cfg.ttlMinutes = Number(values.ttlMinutes) || 30;

      if (lastTest && lastTest.baseUrl === cfg.baseUrl) {
        cfg.serverId = lastTest.serverId || '';
        cfg.serverName = lastTest.serverName || '';
        cfg.version = lastTest.version || '';
      } else {
        cfg.serverId = '';
        cfg.serverName = '';
        cfg.version = '';
      }

      config.activeServer = activeId;
      config.servers[activeId] = cfg;
      return cfg;
    }

    var actions = el(doc, 'div', 'inshelf-row');
    var testBtn = el(doc, 'button', 'inshelf-btn', '测试连接');
    var saveBtn = el(doc, 'button', 'inshelf-btn primary', '保存');
    var syncBtn = el(doc, 'button', 'inshelf-btn', '同步媒体库');
    var clearBtn = el(doc, 'button', 'inshelf-btn danger', '清除缓存');
    [testBtn, saveBtn, syncBtn, clearBtn].forEach(function (btn) { btn.type = 'button'; });
    actions.appendChild(testBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(syncBtn);
    actions.appendChild(clearBtn);
    fieldsSection.appendChild(actions);

    var siteSection = el(doc, 'div', 'inshelf-section');
    siteSection.appendChild(el(doc, 'div', 'inshelf-section-title', '显示位置'));
    Object.keys(config.sites || {}).forEach(function (siteId) {
      var site = config.sites[siteId] || {};
      var siteAdapter = Inshelf.siteRegistry && Inshelf.siteRegistry.get(siteId);
      var row = el(doc, 'div', 'inshelf-row');
      row.appendChild(el(doc, 'span', 'inshelf-help', (siteAdapter && siteAdapter.name) || siteId));

      var listLabel = el(doc, 'label', 'inshelf-check');
      var listCb = el(doc, 'input');
      listCb.type = 'checkbox';
      listCb.checked = site.showList !== false;
      listCb.addEventListener('change', function () {
        site.showList = listCb.checked;
        config.sites[siteId] = site;
      });
      listLabel.appendChild(listCb);
      listLabel.appendChild(doc.createTextNode('列表页'));

      var detailLabel = el(doc, 'label', 'inshelf-check');
      var detailCb = el(doc, 'input');
      detailCb.type = 'checkbox';
      detailCb.checked = site.showDetail !== false;
      detailCb.addEventListener('change', function () {
        site.showDetail = detailCb.checked;
        config.sites[siteId] = site;
      });
      detailLabel.appendChild(detailCb);
      detailLabel.appendChild(doc.createTextNode('详情页'));

      row.appendChild(listLabel);
      row.appendChild(detailLabel);
      siteSection.appendChild(row);
    });
    body.appendChild(siteSection);

    var help = el(doc, 'details', 'inshelf-help');
    help.appendChild(el(doc, 'summary', null, '如何获取 Emby API Key？'));
    var ol = el(doc, 'ol');
    [
      '打开 Emby 控制台（右上角齿轮）。',
      '左侧「高级」→「API 密钥」。',
      '点「新建」，名称填 inshelf，权限保持默认。',
      '复制生成的 Key，粘贴到上方。'
    ].forEach(function (text) {
      ol.appendChild(el(doc, 'li', null, text));
    });
    help.appendChild(ol);
    body.appendChild(help);

    var footer = el(doc, 'div', 'inshelf-help');
    footer.style.marginTop = '10px';
    footer.textContent = '配置只保存在本机油猴存储；脚本只读 Emby，不会修改你的媒体库。';
    body.appendChild(footer);

    doc.body.appendChild(overlay);

    function closeModal() {
      doc.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (opts.onClose) opts.onClose();
    }

    function onKey(event) {
      if (event.key === 'Escape') closeModal();
    }

    close.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeModal();
    });
    doc.addEventListener('keydown', onKey);

    testBtn.addEventListener('click', async function () {
      var cfg = applyValues();
      if (!cfg.baseUrl) {
        setStatus('请先填写 Emby 地址', 'err');
        return;
      }
      testBtn.disabled = true;
      setStatus('正在测试连接…');
      try {
        var res = await opts.onTest({
          type: adapter.id,
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey
        });
        if (res && res.ok) {
          lastTest = {
            baseUrl: res.baseUrl,
            serverId: res.serverId,
            serverName: res.serverName,
            version: res.version
          };
          if (fieldInputs.baseUrl) fieldInputs.baseUrl.value = res.baseUrl;
          cfg.baseUrl = res.baseUrl;
          cfg.serverId = res.serverId || '';
          cfg.serverName = res.serverName || '';
          cfg.version = res.version || '';
          config.servers[activeId] = cfg;
          setStatus('✓ 已连接 ' + (res.serverName || 'Emby') + (res.version ? ' ' + res.version : ''), 'ok');
        } else {
          setStatus('✗ ' + ((res && res.message) || '连接失败'), 'err');
        }
      } catch (e) {
        setStatus('✗ ' + (e.message || String(e)), 'err');
      } finally {
        testBtn.disabled = false;
      }
    });

    saveBtn.addEventListener('click', function () {
      applyValues();
      try {
        var ok = opts.onSave(config);
        setStatus(ok === false ? '保存失败：本地存储不可用' : '✓ 已保存', ok === false ? 'err' : 'ok');
      } catch (e) {
        setStatus('✗ ' + (e.message || String(e)), 'err');
      }
    });

    syncBtn.addEventListener('click', async function () {
      applyValues();
      try {
        var saved = opts.onSave(config);
        if (saved === false) {
          setStatus('保存失败：本地存储不可用', 'err');
          return;
        }
      } catch (e) {
        setStatus('✗ ' + (e.message || String(e)), 'err');
        return;
      }

      syncBtn.disabled = true;
      setStatus('正在同步媒体库…');
      try {
        var result = await opts.onSync(activeId);
        if (result && result.ok === false) {
          setStatus('✗ ' + (result.message || '同步失败'), 'err');
        } else {
          setStatus('✓ 同步完成', 'ok');
        }
      } catch (e) {
        setStatus('✗ ' + (e.message || String(e)), 'err');
      } finally {
        syncBtn.disabled = false;
      }
    });

    clearBtn.addEventListener('click', function () {
      var view = doc.defaultView;
      if (!view || typeof view.confirm !== 'function') return;
      if (!view.confirm('清除本地媒体库索引？下次打开 JavDB 会重新同步。')) return;
      try {
        opts.onClear();
        setStatus('✓ 已清除本地缓存', 'ok');
      } catch (e) {
        setStatus('✗ ' + (e.message || String(e)), 'err');
      }
    });

    loadServerConfig();
    renderFields();
    if (fieldInputs.baseUrl && fieldInputs.baseUrl.focus) fieldInputs.baseUrl.focus();
  }

  var api = { open: open };
  Inshelf.ui = Inshelf.ui || {};
  Inshelf.ui.settings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== src/app.js ===== */
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

/* ===== src/main.js ===== */
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
