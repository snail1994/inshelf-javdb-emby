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

  function renderList(doc, opts) {
    var mount = opts.mount;
    if (!mount || !doc.createElement) return;

    var container = mount.querySelector ? mount.querySelector('.inshelf-badges') : null;
    if (!container) {
      container = doc.createElement('span');
      container.className = 'inshelf-badges';
      if (mount.classList && mount.classList.contains('box')) {
        container.className += ' inshelf-badges-overlay';
        mount.style.position = mount.style.position || 'relative';
      }
      mount.appendChild(container);
    }

    container.textContent = '';
    var states = opts.states || {};
    var ids = Object.keys(states);

    if (!ids.length) {
      if (container.parentNode) container.parentNode.removeChild(container);
      return;
    }

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

    var row = mount.nextElementSibling;
    if (!row || !row.classList || !row.classList.contains('inshelf-detail-row')) {
      row = doc.createElement('div');
      row.className = 'inshelf-detail-row';
      mount.parentNode.insertBefore(row, mount.nextSibling);
    }

    row.textContent = '';

    var codeLabel = doc.createElement('span');
    codeLabel.className = 'inshelf-code';
    codeLabel.textContent = opts.code;
    row.appendChild(codeLabel);

    var states = opts.states || {};
    var ids = Object.keys(states);

    if (!ids.length) {
      if (row.parentNode) row.parentNode.removeChild(row);
      return;
    }

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
