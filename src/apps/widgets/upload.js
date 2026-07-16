'use strict';

const { widgetPage } = require('../html');

/**
 * Upload widget — media_upload_widget tool.
 *
 * Lets claude.ai users upload LOCAL files (images / video / audio / documents)
 * into their Kolbo media library from inside the chat. Chat attachments are
 * unreachable from remote MCP servers — this widget is the bridge: the file is
 * POSTed straight from the iframe to api.kolbo.ai/mcp/upload with a
 * short-lived, upload-only ticket (never the user's API key).
 *
 * structuredContent: {
 *   widget: 'upload', title, upload_url, token, expires_at (epoch ms),
 *   accept (input accept attr), max_files, max_mb: {image,video,audio,document},
 *   project_id?
 * }
 *
 * Flow: pick/drop files -> client-side type+size validation -> XHR upload
 * (2 concurrent, per-file progress) -> per-file CDN URL. Every completed file
 * is pushed into the model context silently; the "Use these files" button
 * sends one chat message with all URLs so the model continues the task.
 */

const BODY = `
<div class="k-card">
  <div class="k-head">
    <span class="k-logo" id="logo"></span>
    <span class="k-title" id="title">Upload media</span>
    <span class="k-spacer"></span>
    <span class="k-chip" id="count-chip" style="display:none"></span>
  </div>
  <div class="k-body">
    <div id="drop" style="border:1.5px dashed var(--border);border-radius:12px;padding:26px 16px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s">
      <div id="drop-icon" style="font-size:26px;line-height:1;margin-bottom:8px;color:var(--text-muted)"></div>
      <div style="font-size:13px;font-weight:600">Click or drop files here</div>
      <div id="accept-hint" style="font-size:11.5px;color:var(--text-muted);margin-top:4px"></div>
    </div>
    <input type="file" id="picker" multiple style="display:none">
    <div id="rows" style="margin-top:10px"></div>
    <div class="k-actions" id="actions" style="display:none"></div>
    <div id="notice" style="display:none;margin-top:8px;font-size:12px;color:var(--text-muted)"></div>
  </div>
  <div class="k-footer">
    <span><a href="#" id="kolbo-link">Kolbo.AI</a> Media Library</span>
    <span class="k-credits">free</span>
  </div>
</div>
`;

const SCRIPT = `
el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('drop-icon').innerHTML = ICONS.upload;
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink('https://app.kolbo.ai/media-library'); };

var state = null;
var items = []; // {file, kind, status, pct, url, err, id}
var nextItemId = 1;
var CONCURRENCY = 2;
var active = 0;
var sent = false;

var KINDS = {
  image: { exts: ['jpg','jpeg','png','webp','gif','heic','heif','avif','bmp','tif','tiff'], icon: ICONS.image },
  video: { exts: ['mp4','mov','webm','m4v','mkv','avi'], icon: ICONS.video },
  audio: { exts: ['mp3','wav','m4a','aac','ogg','flac'], icon: ICONS.audio },
  document: { exts: ['pdf','txt','md','csv','json','docx','xlsx','pptx','doc','xls'], icon: ICONS.document }
};

function classify(name) {
  var ext = String(name || '').split('.').pop().toLowerCase();
  for (var k in KINDS) { if (KINDS[k].exts.indexOf(ext) !== -1) return k; }
  return null;
}

function fmtSize(b) {
  if (b == null) return '';
  if (b > 1024 * 1024) return (Math.round(b / 1024 / 102.4) / 10) + 'MB';
  return Math.max(1, Math.round(b / 1024)) + 'KB';
}

function expired() { return state && state.expires_at && Date.now() > state.expires_at; }

function boot(sc) {
  if (!sc || sc.widget !== 'upload') return;
  state = sc;
  if (sc.title) el('title').textContent = sc.title;
  var kinds = sc.kinds && sc.kinds.length ? sc.kinds : ['image','video','audio','document'];
  var exts = [];
  kinds.forEach(function (k) { if (KINDS[k]) exts = exts.concat(KINDS[k].exts); });
  el('picker').setAttribute('accept', exts.map(function (e) { return '.' + e; }).join(','));
  el('accept-hint').textContent = kinds.join(' · ') + ' — up to ' + (sc.max_files || 10) + ' files';
  if (expired()) return showExpired();
  window.kolbo.notifySize();
}

function showExpired() {
  el('drop').style.pointerEvents = 'none';
  el('drop').style.opacity = '0.5';
  el('notice').style.display = '';
  el('notice').innerHTML = ICONS.clock + ' This upload window expired. Ask Claude to open a new upload widget.';
  window.kolbo.notifySize();
}

// ---- picking ----
el('drop').onclick = function () { el('picker').click(); };
el('drop').ondragover = function (e) { e.preventDefault(); el('drop').style.borderColor = 'var(--accent, #7c6cff)'; };
el('drop').ondragleave = function () { el('drop').style.borderColor = 'var(--border)'; };
el('drop').ondrop = function (e) {
  e.preventDefault();
  el('drop').style.borderColor = 'var(--border)';
  addFiles(e.dataTransfer && e.dataTransfer.files);
};
el('picker').onchange = function () { addFiles(el('picker').files); el('picker').value = ''; };

function addFiles(list) {
  if (!list || !state) return;
  if (expired()) return showExpired();
  var maxFiles = state.max_files || 10;
  for (var i = 0; i < list.length; i++) {
    if (items.length >= maxFiles) break;
    var f = list[i];
    var kind = classify(f.name);
    var it = { file: f, kind: kind, status: 'queued', pct: 0, url: null, err: null, id: nextItemId++ };
    var allowedKinds = state.kinds && state.kinds.length ? state.kinds : ['image','video','audio','document'];
    if (!kind || allowedKinds.indexOf(kind) === -1) {
      it.status = 'error'; it.err = 'Unsupported file type';
    } else {
      var capMb = (state.max_mb && state.max_mb[kind]) || 50;
      if (f.size > capMb * 1024 * 1024) { it.status = 'error'; it.err = kind + ' files are limited to ' + capMb + 'MB'; }
    }
    items.push(it);
  }
  render();
  pump();
}

// ---- upload queue ----
function pump() {
  if (expired()) return showExpired();
  while (active < CONCURRENCY) {
    var next = null;
    for (var i = 0; i < items.length; i++) { if (items[i].status === 'queued') { next = items[i]; break; } }
    if (!next) break;
    upload(next);
  }
}

function upload(it) {
  it.status = 'uploading';
  active++;
  render();
  var fd = new FormData();
  fd.append('file', it.file, it.file.name);
  if (state.project_id) fd.append('project_id', state.project_id);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', state.upload_url, true);
  xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) { it.pct = Math.round((e.loaded / e.total) * 100); renderRow(it); }
  };
  xhr.onload = function () {
    active--;
    var res = null;
    try { res = JSON.parse(xhr.responseText); } catch (e) {}
    if (xhr.status >= 200 && xhr.status < 300 && res && res.success && res.media && res.media.url) {
      it.status = 'done';
      it.url = res.media.url;
      // Silent context update — the model learns the URL even before the
      // user clicks "Use these files".
      try {
        window.kolbo.updateModelContext('Upload widget: "' + it.file.name + '" (' + it.kind + ') uploaded to the Kolbo media library. URL: ' + it.url);
      } catch (e) {}
    } else {
      it.status = 'error';
      it.err = (res && res.error) || ('Upload failed (' + xhr.status + ')');
    }
    render();
    pump();
  };
  xhr.onerror = function () {
    active--;
    it.status = 'error';
    it.err = 'Network error — try again';
    render();
    pump();
  };
  xhr.send(fd);
}

// ---- rendering ----
function rowHtml(it) {
  var icon = it.kind && KINDS[it.kind] ? KINDS[it.kind].icon : ICONS.file;
  var right = '';
  if (it.status === 'queued') right = '<span style="color:var(--text-muted)">queued</span>';
  else if (it.status === 'uploading') right = '<span style="color:var(--text-muted)">' + it.pct + '%</span>';
  else if (it.status === 'done') right = '<span style="color:#4ade80">' + ICONS.check + ' uploaded</span>';
  else right = '<span class="k-error" style="padding:0;border:0;background:none">' + ICONS.x + ' ' + esc(it.err || 'failed') + '</span> <a href="#" data-retry="' + it.id + '" style="font-size:11px">retry</a>';
  var bar = it.status === 'uploading'
    ? '<div style="height:3px;border-radius:2px;background:var(--surface);margin-top:5px;overflow:hidden"><div id="bar-' + it.id + '" style="height:100%;width:' + it.pct + '%;background:var(--accent,#7c6cff);transition:width .2s"></div></div>'
    : '';
  return '<div id="row-' + it.id + '" style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--surface)">' +
    '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px">' +
    '<span>' + icon + '</span>' +
    '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(it.file.name) + '">' + esc(it.file.name) + '</span>' +
    '<span style="color:var(--text-muted);font-size:11px">' + fmtSize(it.file.size) + '</span>' +
    '<span id="status-' + it.id + '" style="font-size:11.5px">' + right + '</span>' +
    '</div>' + bar + '</div>';
}

function renderRow(it) {
  var s = el('status-' + it.id);
  if (s && it.status === 'uploading') s.innerHTML = '<span style="color:var(--text-muted)">' + it.pct + '%</span>';
  var b = el('bar-' + it.id);
  if (b) b.style.width = it.pct + '%';
}

function render() {
  el('rows').innerHTML = items.map(rowHtml).join('');
  Array.prototype.forEach.call(el('rows').querySelectorAll('[data-retry]'), function (a) {
    a.onclick = function (e) {
      e.preventDefault();
      var id = Number(a.getAttribute('data-retry'));
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === id) { items[i].status = 'queued'; items[i].err = null; items[i].pct = 0; }
      }
      render();
      pump();
    };
  });
  var done = items.filter(function (i) { return i.status === 'done'; });
  var busy = items.some(function (i) { return i.status === 'uploading' || i.status === 'queued'; });
  el('count-chip').style.display = items.length ? '' : 'none';
  el('count-chip').textContent = done.length + '/' + items.length + ' uploaded';
  if (done.length && !busy && !sent) {
    el('actions').style.display = '';
    el('actions').innerHTML = '<button class="k-btn primary" id="btn-use">Use ' + (done.length === 1 ? 'this file' : 'these ' + done.length + ' files') + '</button>' +
      '<button class="k-btn ghost" id="btn-more">Add more</button>';
    el('btn-use').onclick = function () {
      if (sent) return;
      sent = true;
      var lines = done.map(function (i, idx) { return (idx + 1) + '. ' + i.file.name + ' (' + i.kind + '): ' + i.url; });
      window.kolbo.sendMessage('I uploaded ' + done.length + ' file(s) to my Kolbo media library:\\n' + lines.join('\\n') + '\\nContinue with these files.');
      el('actions').innerHTML = '<span style="font-size:12px;color:var(--text-muted)">' + ICONS.check + ' Sent to Claude — continuing…</span>';
      window.kolbo.notifySize();
    };
    el('btn-more').onclick = function () { el('picker').click(); };
  } else if (!done.length || busy) {
    el('actions').style.display = 'none';
  }
  window.kolbo.notifySize();
}

window.kolbo.onToolResult(function (result) {
  var sc = result.structuredContent || structured(result);
  if (sc && sc.widget === 'upload') return boot(sc);
  var card = document.querySelector('.k-card');
  if (card && !state) card.style.display = 'none';
  window.kolbo.notifySize();
});
`;

function uploadWidgetHtml() {
  return widgetPage({ title: 'Kolbo Upload', body: BODY, script: SCRIPT });
}

module.exports = { uploadWidgetHtml };
