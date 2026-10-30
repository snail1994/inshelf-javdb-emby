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
    '.inshelf-badges-overlay{position:absolute;left:6px;top:6px;margin:0;z-index:5;display:flex;flex-direction:column;align-items:flex-start;gap:3px;max-width:calc(100% - 12px);pointer-events:none}',
    '.inshelf-badges-overlay .inshelf-badge{pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,.5)}',
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
