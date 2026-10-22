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
