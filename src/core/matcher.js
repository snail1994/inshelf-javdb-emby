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
