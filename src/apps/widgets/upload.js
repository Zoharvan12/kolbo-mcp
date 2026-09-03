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
 * Mobile (Claude iOS/Android): WebKit drops <input type=file> selections inside
 * cross-origin MCP App iframes, so the primary CTA openLinks a TOP-LEVEL
 * upload page (/mcp/upload-ui) where the native picker works. Desktop keeps
 * the in-chat picker; empty-selection after pick also offers the external page.
 *
 * structuredContent: {
 *   widget: 'upload', title, upload_url, upload_ui_url, token, expires_at (epoch ms),
 *   accept (input accept attr), max_files, max_mb: {image,video,audio,document},
 *   project_id?
 * }
 *
 * Flow (desktop): pick/drop files -> client-side type+size validation -> XHR
 * upload (2 concurrent, per-file progress + thumbnails) -> per-file CDN URL.
 * Every completed file is pushed into the model context silently; the
 * "Use these files" button sends one chat message with all URLs.
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
    <div id="drop" style="border:1.5px dashed var(--border);border-radius:12px;padding:22px 14px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;-webkit-tap-highlight-color:transparent">
      <div id="drop-icon" style="font-size:26px;line-height:1;margin-bottom:8px;color:var(--text-muted)"></div>
      <div id="drop-title" style="font-size:13px;font-weight:600">Click or drop files here</div>
      <div id="accept-hint" style="font-size:11.5px;color:var(--text-muted);margin-top:4px;line-height:1.35"></div>
    </div>
    <input type="file" id="picker" multiple accept="*/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip:rect(0,0,0,0)">
    <div id="rows" style="margin-top:10px"></div>
    <div class="k-actions" id="actions" style="display:none"></div>
    <div id="notice" style="display:none;margin-top:8px;font-size:12px;color:var(--text-muted);line-height:1.4"></div>
  </div>
  <div class="k-footer">
    <span><a href="#" id="kolbo-link">Kolbo.AI</a> Media Library</span>
  </div>
</div>
`;

const SCRIPT = `
el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('drop-icon').innerHTML = ICONS.upload;
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink('https://app.kolbo.ai/media-library'); };

var state = null;
var items = []; // {file, kind, status, pct, url, err, id, thumb}
var nextItemId = 1;
var CONCURRENCY = 2;
var active = 0;
var sent = false;
var pickerArmed = false;

var KINDS = {
  image: { exts: ['jpg','jpeg','png','webp','gif','heic','heif','avif','bmp','tif','tiff'], icon: ICONS.image },
  video: { exts: ['mp4','mov','webm','m4v','mkv','avi'], icon: ICONS.video },
  audio: { exts: ['mp3','wav','m4a','aac','ogg','flac'], icon: ICONS.audio },
  document: { exts: ['pdf','txt','md','csv','json','docx','xlsx','pptx','doc','xls'], icon: ICONS.document }
};

function isMobileHost() {
  var ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  // iPadOS desktop-UA spoof
  if (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform || '')) return true;
  return false;
}

function classify(file) {
  var name = (file && file.name) || '';
  var ext = name.indexOf('.') >= 0 ? String(name).split('.').pop().toLowerCase() : '';
  if (ext) {
    for (var k in KINDS) { if (KINDS[k].exts.indexOf(ext) !== -1) return k; }
  }
  // Mobile Photos often yields a MIME with a weak/missing filename.
  var mime = String((file && file.type) || '').toLowerCase();
  if (mime.indexOf('image/') === 0) return 'image';
  if (mime.indexOf('video/') === 0) return 'video';
  if (mime.indexOf('audio/') === 0) return 'audio';
  if (mime === 'application/pdf' || mime.indexOf('text/') === 0 || mime.indexOf('application/vnd.') === 0 || mime === 'application/msword' || mime === 'application/json') return 'document';
  return null;
}

function filenameFor(it) {
  var n = (it.file && it.file.name) || '';
  if (n && n.indexOf('.') !== -1) return n;
  var ext = { image: 'jpg', video: 'mp4', audio: 'mp3', document: 'pdf' }[it.kind] || 'bin';
  return 'upload-' + it.id + '.' + ext;
}

function fmtSize(b) {
  if (b == null) return '';
  if (b > 1024 * 1024) return (Math.round(b / 1024 / 102.4) / 10) + 'MB';
  return Math.max(1, Math.round(b / 1024)) + 'KB';
}

function expired() { return state && state.expires_at && Date.now() > state.expires_at; }

function uploadUiUrl() {
  if (!state) return '';
  var base = state.upload_ui_url || String(state.upload_url || '').replace(/\\/upload\\/?$/, '/upload-ui');
  if (!base) return '';
  var cfg = {
    token: state.token,
    upload_url: state.upload_url,
    title: state.title || 'Upload media',
    kinds: state.kinds,
    max_files: state.max_files,
    max_mb: state.max_mb,
    project_id: state.project_id,
    expires_at: state.expires_at
  };
  try {
    var json = JSON.stringify(cfg);
    var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    return base + '#' + b64;
  } catch (e) {
    return base + '#' + encodeURIComponent(JSON.stringify(cfg));
  }
}

function openExternalUploader() {
  var url = uploadUiUrl();
  if (!url) return;
  window.kolbo.openLink(url);
  el('notice').style.display = '';
  el('notice').innerHTML = ICONS.open + ' Uploader opened. After files finish, return here and paste the copied message into Claude.';
  window.kolbo.notifySize();
}

function boot(sc) {
  if (!sc || sc.widget !== 'upload') return;
  state = sc;
  if (sc.title) el('title').textContent = sc.title;
  var kinds = sc.kinds && sc.kinds.length ? sc.kinds : ['image','video','audio','document'];
  var exts = [];
  kinds.forEach(function (k) { if (KINDS[k]) exts = exts.concat(KINDS[k].exts); });
  el('picker').setAttribute('accept', exts.map(function (e) { return '.' + e; }).concat(kinds.map(function (k) { return k + '/*'; })).join(','));
  var maxN = sc.max_files || 20;
  var mobile = isMobileHost();
  if (mobile) {
    el('drop-title').textContent = 'Tap to open uploader';
    el('accept-hint').textContent = kinds.join(' · ') + (maxN === 1 ? ' — one file' : ' — up to ' + maxN + ' files') + '. Opens a full-screen picker (required on iPhone & Android).';
  } else {
    el('drop-title').textContent = 'Click or drop files here';
    el('accept-hint').textContent = kinds.join(' · ') + (maxN === 1 ? ' — one file' : ' — up to ' + maxN + ' files');
  }
  if (expired()) return showExpired();
  // Always offer the external path — desktop users may be inside a host that
  // also sandboxes file inputs; mobile uses it as the primary CTA.
  el('actions').style.display = '';
  el('actions').innerHTML = mobile
    ? '<button class="k-btn primary" id="btn-external" style="width:100%;min-height:44px">' + ICONS.upload + ' Open uploader</button>' +
      '<button class="k-btn ghost" id="btn-inline">Try in-chat picker</button>'
    : '<button class="k-btn ghost" id="btn-external">' + ICONS.open + ' Open full-screen uploader</button>';
  el('btn-external').onclick = function (e) { e.preventDefault(); e.stopPropagation(); openExternalUploader(); };
  var inline = el('btn-inline');
  if (inline) inline.onclick = function (e) { e.preventDefault(); e.stopPropagation(); armInlinePicker(); };
  window.kolbo.notifySize();
}

function showExpired() {
  el('drop').style.pointerEvents = 'none';
  el('drop').style.opacity = '0.5';
  el('notice').style.display = '';
  el('notice').innerHTML = ICONS.clock + ' This upload window expired. Ask Claude to open a new upload widget.';
  window.kolbo.notifySize();
}

function armInlinePicker() {
  pickerArmed = true;
  el('picker').click();
}

// ---- picking ----
el('drop').onclick = function () {
  if (!state) return;
  if (expired()) return showExpired();
  if (isMobileHost()) return openExternalUploader();
  armInlinePicker();
};
el('drop').ondragover = function (e) { e.preventDefault(); el('drop').style.borderColor = 'var(--accent, #7c6cff)'; };
el('drop').ondragleave = function () { el('drop').style.borderColor = 'var(--border)'; };
el('drop').ondrop = function (e) {
  e.preventDefault();
  el('drop').style.borderColor = 'var(--border)';
  addFiles(e.dataTransfer && e.dataTransfer.files);
};
el('picker').onchange = function () {
  var files = el('picker').files;
  // iOS/WebKit cross-origin iframe: picker UI runs, selection is dropped → empty FileList.
  if (pickerArmed && (!files || !files.length)) {
    pickerArmed = false;
    el('notice').style.display = '';
    el('notice').innerHTML = ICONS.warn + ' In-chat picker could not receive the file on this device. Use the full-screen uploader instead.';
    el('actions').style.display = '';
    el('actions').innerHTML = '<button class="k-btn primary" id="btn-external" style="width:100%;min-height:44px">' + ICONS.upload + ' Open uploader</button>';
    el('btn-external').onclick = function (e) { e.preventDefault(); openExternalUploader(); };
    window.kolbo.notifySize();
    return;
  }
  pickerArmed = false;
  addFiles(files);
  el('picker').value = '';
};

function makeThumb(it) {
  if (it.kind === 'image') {
    try { it.thumb = URL.createObjectURL(it.file); } catch (e) {}
    return;
  }
  if (it.kind !== 'video') return;
  try {
    var url = URL.createObjectURL(it.file);
    var v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
    var done = false;
    function snap() {
      if (done) return;
      try {
        var c = document.createElement('canvas');
        c.width = 68; c.height = 68;
        c.getContext('2d').drawImage(v, 0, 0, 68, 68);
        it.thumb = c.toDataURL('image/jpeg', 0.7);
        done = true;
        render();
      } catch (e) {}
      try { URL.revokeObjectURL(url); } catch (e2) {}
    }
    v.addEventListener('loadeddata', function () {
      try { v.currentTime = Math.min(0.25, (v.duration || 1) * 0.1); } catch (e) { snap(); }
    });
    v.addEventListener('seeked', snap);
    setTimeout(snap, 1500);
  } catch (e) {}
}

function addFiles(list) {
  if (!list || !state) return;
  if (expired()) return showExpired();
  var maxFiles = state.max_files || 20;
  for (var i = 0; i < list.length; i++) {
    if (items.length >= maxFiles) break;
    var f = list[i];
    var kind = classify(f);
    var it = { file: f, kind: kind, status: 'queued', pct: 0, url: null, err: null, id: nextItemId++, thumb: null };
    var allowedKinds = state.kinds && state.kinds.length ? state.kinds : ['image','video','audio','document'];
    if (!kind || allowedKinds.indexOf(kind) === -1) {
      it.status = 'error'; it.err = 'Unsupported file type';
    } else {
      var capMb = (state.max_mb && state.max_mb[kind]) || 50;
      if (f.size > capMb * 1024 * 1024) { it.status = 'error'; it.err = kind + ' files are limited to ' + capMb + 'MB'; }
      else makeThumb(it);
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
  fd.append('file', it.file, filenameFor(it));
  if (state.project_id) fd.append('project_id', state.project_id);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', state.upload_url, true);
  xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
  // A stalled upload used to sit at N% forever: there was no timeout and no
  // ontimeout/onabort handler, only onload/onerror. A file above the CDN body
  // cap in front of the API dies exactly this way — the edge sees Content-Length,
  // kills the connection a few percent in, and the browser never reports it, so
  // the row froze at 1% with no error and no retry. Watch PROGRESS rather than
  // total elapsed time, so a genuinely slow large upload is never punished.
  var STALL_MS = 90000;
  var lastTick = Date.now();
  var stalled = false;
  var watchdog = setInterval(function () {
    if (Date.now() - lastTick < STALL_MS) return;
    stalled = true;
    clearInterval(watchdog);
    try { xhr.abort(); } catch (e) {}
  }, 5000);
  function settle() { clearInterval(watchdog); }
  xhr.upload.onprogress = function (e) {
    lastTick = Date.now();
    if (e.lengthComputable) { it.pct = Math.round((e.loaded / e.total) * 100); renderRow(it); }
  };
  xhr.onabort = function () {
    settle();
    if (!stalled) return;
    active--;
    it.status = 'error';
    it.err = 'Upload stalled — the file may be too large for this connection';
    render();
    pump();
  };
  xhr.onload = function () {
    settle();
    active--;
    var res = null;
    try { res = JSON.parse(xhr.responseText); } catch (e) {}
    if (xhr.status >= 200 && xhr.status < 300 && res && res.success && res.media && res.media.url) {
      it.status = 'done';
      it.url = res.media.url;
      if (!it.thumb && res.media.thumbnail_url) it.thumb = res.media.thumbnail_url;
      try {
        window.kolbo.updateModelContext('Upload widget: "' + filenameFor(it) + '" (' + it.kind + ') uploaded to the Kolbo media library. URL: ' + it.url);
      } catch (e) {}
    } else {
      it.status = 'error';
      it.err = (res && res.error) || ('Upload failed (' + xhr.status + ')');
    }
    render();
    pump();
  };
  xhr.onerror = function () {
    settle();
    active--;
    it.status = 'error';
    it.err = 'Network error — try the full-screen uploader';
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
  var left = it.thumb
    ? '<img data-thumb="' + it.id + '" src="' + it.thumb + '" alt="" style="width:34px;height:34px;object-fit:cover;border-radius:7px;flex:none;border:1px solid var(--border);background:var(--surface)">'
    : '<span style="width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;background:var(--surface);border:1px solid var(--border);color:var(--text-muted)">' + icon + '</span>';
  return '<div id="row-' + it.id + '" style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--surface)">' +
    '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px">' +
    left +
    '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(filenameFor(it)) + '">' + esc(filenameFor(it)) + '</span>' +
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
  Array.prototype.forEach.call(el('rows').querySelectorAll('[data-thumb]'), function (img) {
    img.onerror = function () {
      var id = Number(img.getAttribute('data-thumb'));
      for (var i = 0; i < items.length; i++) {
        if (items[i].id !== id) continue;
        if (items[i].url && img.src !== items[i].url) { img.src = items[i].url; return; }
        items[i].thumb = null;
      }
      render();
    };
  });
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
    el('actions').innerHTML = '<button class="k-btn primary" id="btn-use" style="min-height:44px">Use ' + (done.length === 1 ? 'this file' : 'these ' + done.length + ' files') + '</button>' +
      '<button class="k-btn ghost" id="btn-more">Add more</button>' +
      '<button class="k-btn ghost" id="btn-external">' + ICONS.open + ' Full-screen</button>';
    el('btn-use').onclick = function () {
      if (sent) return;
      sent = true;
      var lines = done.map(function (i, idx) { return (idx + 1) + '. ' + filenameFor(i) + ' (' + i.kind + '): ' + i.url; });
      window.kolbo.sendMessage('I uploaded ' + done.length + ' file(s) to my Kolbo media library:\\n' + lines.join('\\n') + '\\nContinue with these files.');
      el('actions').innerHTML = '<span style="font-size:12px;color:var(--text-muted)">' + ICONS.check + ' Sent to Claude — continuing…</span>';
      window.kolbo.notifySize();
    };
    el('btn-more').onclick = function () {
      if (isMobileHost()) openExternalUploader();
      else armInlinePicker();
    };
    el('btn-external').onclick = function (e) { e.preventDefault(); openExternalUploader(); };
  } else if (!items.length) {
    // keep boot() actions (external / inline)
  } else if (!done.length || busy) {
    el('actions').style.display = '';
    el('actions').innerHTML = (busy ? '<span style="font-size:12px;color:var(--text-muted)">Uploading…</span>' : '') +
      '<button class="k-btn ghost" id="btn-external">' + ICONS.open + ' Full-screen uploader</button>';
    el('btn-external').onclick = function (e) { e.preventDefault(); openExternalUploader(); };
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
