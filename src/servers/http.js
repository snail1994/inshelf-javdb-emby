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
