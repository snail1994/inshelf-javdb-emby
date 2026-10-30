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
