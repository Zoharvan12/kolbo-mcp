'use strict';

const { widgetPage } = require('../html');

/**
 * Universal generation widget — used by every generate_ / edit_ tool.
 *
 * structuredContent contract (set by src/tools/*):
 * {
 *   phase: 'generating' | 'completed' | 'failed',
 *   kind: 'image' | 'video' | 'audio' | '3d' | 'scenes',
 *   tool: 'generate_image',            // originating MCP tool name
 *   generation_id, poll_tool,          // when phase === 'generating'
 *   status_args,                       // extra args for the poll tool (optional)

 *   model, model_icon, prompt, count,
 *   settings: { duration, resolution, aspect_ratio, audio, voice, mode },
 *   reference_image,                   // thumbnail URL (optional)
 *   urls, thumbnail_url, title, duration, credits_used,
 *   scenes: [{ scene_number, title, image_urls, video_urls }],
 *   error,
 *   open_url                           // "Open in Kolbo" target (optional)
 * }
 */

const BODY = `
<div class="k-card" id="card">
  <div class="k-head">
    <span class="k-logo" id="logo"></span>
    <span class="k-title" id="tool-title"></span>
    <span class="k-spacer"></span>
    <span class="k-chip" id="phase-chip" style="display:none"></span>
  </div>
  <div class="k-body">
    <div class="k-prompt" id="prompt"></div>
    <div class="k-chips" id="chips"></div>
    <div id="stage"></div>
    <div class="k-prompt-row" id="prompt-row">
      <input class="k-input" id="action-input" placeholder="">
      <button class="k-btn primary" id="action-send">Send</button>
      <button class="k-btn ghost" id="action-cancel">✕</button>
    </div>
    <div class="k-actions" id="actions"></div>
  </div>
  <div class="k-footer">
    <span>Powered by <a href="#" id="kolbo-link">Kolbo.AI</a></span>
    <span class="k-credits" id="credits"></span>
  </div>
</div>
`;

const SCRIPT = `
var state = null;          // current structuredContent
var selected = 0;          // selected result index
var pollTimer = null;

el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink('https://app.kolbo.ai'); };

var TOOL_TITLES = {
  generate_image: 'Image Generation', generate_image_edit: 'Image Edit',
  generate_video: 'Video Generation', generate_video_from_image: 'Image to Video',
  generate_video_from_video: 'Video to Video', generate_elements: 'Elements Video',
  generate_first_last_frame: 'First–Last Frame', generate_lipsync: 'Lipsync',
  generate_music: 'Music Generation', generate_speech: 'Text to Speech',
  generate_sound: 'Sound Effect', generate_3d: '3D Generation',
  generate_creative_director: 'Creative Director', edit_image: 'Image Edit', edit_video: 'Video Edit'
};

function boot(sc) {
  if (!sc) return;
  state = sc;
  el('tool-title').textContent = TOOL_TITLES[sc.tool] || 'Generation';
  el('prompt').textContent = sc.prompt || '';
  el('prompt').style.display = sc.prompt ? '' : 'none';
  renderChips(sc);
  el('credits').textContent = sc.credits_used != null ? fmtCredits(sc.credits_used) : '';
  if (sc.phase === 'generating') renderGenerating(sc);
  else if (sc.phase === 'failed') renderError(sc.error || 'Generation failed');
  else renderResult(sc);
  window.kolbo.notifySize();
}

function renderChips(sc) {
  var h = modelChipHTML(sc.model, sc.model_icon);
  var s = sc.settings || {};
  if (sc.kind) h += chip(iconFor(sc.kind) + ' ' + sc.kind);
  if (s.duration) h += chip('⏱ ' + fmtDur(s.duration));
  if (s.resolution) h += chip(esc(s.resolution));
  if (s.aspect_ratio) h += chip(esc(s.aspect_ratio));
  if (s.audio) h += chip('🔊 audio');
  if (s.voice) h += chip('🎤 ' + esc(s.voice));
  if (s.mode) h += chip(esc(s.mode));
  if (sc.count > 1) h += chip('×' + sc.count);
  if (sc.reference_image) h += '<img class="k-ref-thumb" src="' + esc(sc.reference_image) + '" alt="" title="Reference image" onerror="this.style.display=\\'none\\'">';
  el('chips').innerHTML = h;
}
function chip(inner) { return '<span class="k-chip">' + inner + '</span>'; }
function iconFor(kind) {
  return { image: '🖼', video: '🎬', audio: '🎵', '3d': '🧊', scenes: '🎞' }[kind] || '✨';
}

/* ---------- generating ---------- */
function renderGenerating(sc) {
  setPhaseChip('Generating', true);
  var n = Math.min(sc.count || 1, 4);
  var shape = sc.kind === 'video' || sc.kind === 'scenes' ? 'video' : (sc.kind === 'audio' ? 'video' : 'square');
  var cells = '';
  for (var i = 0; i < n; i++) {
    cells += '<div class="k-skel ' + shape + '">' +
      (i === 0 ? '<span class="k-gen-badge"><span class="k-spin"></span>Generating</span>' : '') + '</div>';
  }
  el('stage').innerHTML = '<div class="k-gen-grid n' + n + '">' + cells + '</div>';
  el('actions').innerHTML = '';
  schedulePoll(sc);
}

function schedulePoll(sc) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(function () { poll(sc); }, 4000);
}
function poll(sc) {
  var args = sc.status_args || { generation_id: sc.generation_id };
  window.kolbo.callTool(sc.poll_tool || 'get_generation_status', args).then(function (res) {
    var st = structured(res) || {};
    var stateName = st.state || st.phase || st.status;
    if (stateName === 'completed') {
      var r = st.result || st;

      var done = Object.assign({}, sc, r, {
        phase: 'completed',
        urls: r.urls || st.urls || [],
        credits_used: st.credits_used != null ? st.credits_used : sc.credits_used
      });
      state = done;
      el('credits').textContent = done.credits_used != null ? fmtCredits(done.credits_used) : '';
      renderResult(done);
      // Let the model know the outcome without it having to poll.
      try {
        window.kolbo.updateModelContext(
          'Generation ' + (sc.generation_id || '') + ' completed (' + (sc.tool || '') + ').' +
          '\\nOutput URLs:\\n' + (done.urls || []).join('\\n') +
          (done.credits_used != null ? '\\nCredits used: ' + done.credits_used : ''));
      } catch (e) {}
    } else if (stateName === 'failed' || stateName === 'error' || stateName === 'cancelled') {
      renderError(st.error || 'Generation ' + stateName);
    } else {
      schedulePoll(sc);
    }
  }).catch(function () { schedulePoll(sc); });
}

/* ---------- results ---------- */
function renderResult(sc) {
  clearTimeout(pollTimer);

  setPhaseChip('', false);
  if (sc.kind === 'scenes' && sc.scenes && sc.scenes.length) return renderScenes(sc);
  var urls = sc.urls || [];
  if (!urls.length) return renderError('No output received');
  if (sc.kind === 'image') renderImages(sc, urls);
  else if (sc.kind === 'video') renderVideo(sc, urls);
  else if (sc.kind === 'audio') renderAudio(sc, urls);
  else if (sc.kind === '3d') render3d(sc, urls);
  else renderLinks(urls);
  renderActions(sc);
  window.kolbo.notifySize();
}

function renderImages(sc, urls) {
  selected = Math.min(selected, urls.length - 1);
  // If the host CSP still blocks the image, degrade to open-in-browser rows
  // instead of a broken empty viewer.
  var viewer = '<div class="k-viewer"><img id="main-img" src="' + esc(urls[selected]) + '" alt="" onerror="window.__imgFail && window.__imgFail()">' + dlBtnHTML(urls[selected]) + '</div>';
  window.__imgFail = function () { renderLinks(urls); window.kolbo.notifySize(); };
  // Click → expand into an in-Claude fullscreen viewer (all actions stay
  // available); click again (or Exit) collapses back. Hosts that refuse
  // fullscreen fall back to opening the original in a new tab.
  setTimeout(function () {
    var img = el('main-img');
    if (img) img.onclick = toggleFullscreen;
  }, 0);
  var thumbs = '';
  if (urls.length > 1) {
    thumbs = '<div class="k-thumbs">' + urls.map(function (u, i) {
      return '<div class="k-thumb' + (i === selected ? ' active' : '') + '" data-i="' + i + '"><img src="' + esc(u) + '" alt=""></div>';
    }).join('') + '</div>';
  }
  el('stage').innerHTML = viewer + thumbs;
  wireDlButtons(el('stage'));
  Array.prototype.forEach.call(el('stage').querySelectorAll('.k-thumb'), function (t) {
    t.onclick = function () {
      selected = +t.getAttribute('data-i');
      el('main-img').src = state.urls[selected];
      // Keep the viewer's hover download pointing at the newly selected image.
      var dl = el('stage').querySelector('.k-viewer .k-dl');
      if (dl) dl.setAttribute('data-dl', state.urls[selected]);
      Array.prototype.forEach.call(el('stage').querySelectorAll('.k-thumb'), function (x) { x.classList.remove('active'); });
      t.classList.add('active');
    };
  });
}

function renderVideo(sc, urls) {
  el('stage').innerHTML = '<div class="k-viewer"><video id="main-video" src="' + esc(urls[0]) + '"' +
    (sc.thumbnail_url ? ' poster="' + esc(sc.thumbnail_url) + '"' : '') + ' controls playsinline></video>' +
    dlBtnHTML(urls[0]) + '</div>';
  wireDlButtons(el('stage'));
}

function renderAudio(sc, urls) {
  el('stage').innerHTML = urls.map(function (u, i) {
    var title = sc.title || ((TOOL_TITLES[sc.tool] || 'Audio') + (urls.length > 1 ? ' ' + (i + 1) : ''));
    return '<div class="k-audio-row">' +
      (sc.thumbnail_url ? '<img class="k-audio-art" src="' + esc(sc.thumbnail_url) + '">' : '<div class="k-audio-art"></div>') +
      '<div class="k-audio-meta"><div class="k-audio-title">' + esc(title) + '</div>' +
      '<div class="k-audio-sub">' + esc(sc.model || '') + (sc.duration ? ' · ' + fmtDur(sc.duration) : '') + '</div></div>' +
      '<audio src="' + esc(u) + '" controls style="height:32px;max-width:260px"></audio></div>';
  }).join('');
}

function render3d(sc, urls) {
  el('stage').innerHTML = (sc.thumbnail_url
    ? '<div class="k-viewer"><img src="' + esc(sc.thumbnail_url) + '" alt=""></div>' : '') +
    urls.map(function (u) {
      var extMatch = u.split('?')[0].match(/\\.(\\w+)$/);
      var ext = extMatch ? extMatch[1].toUpperCase() : 'FILE';
      return '<div class="k-audio-row"><div class="k-audio-art" style="display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">' + esc(ext) + '</div>' +
        '<div class="k-audio-meta"><div class="k-audio-title">3D Model (' + esc(ext) + ')</div></div>' +
        '<button class="k-btn" data-url="' + esc(u) + '">Download</button></div>';
    }).join('');
  Array.prototype.forEach.call(el('stage').querySelectorAll('.k-btn[data-url]'), function (b) {
    b.onclick = function () { window.kolbo.openLink(downloadUrl(b.getAttribute('data-url'))); };
  });
}

function renderLinks(urls) {
  el('stage').innerHTML = urls.map(function (u) {
    return '<div class="k-audio-row"><div class="k-audio-meta"><div class="k-audio-title" style="word-break:break-all">' + esc(u) + '</div></div>' +
      '<button class="k-btn" data-url="' + esc(u) + '">Open</button></div>';
  }).join('');
  Array.prototype.forEach.call(el('stage').querySelectorAll('.k-btn[data-url]'), function (b) {
    b.onclick = function () { window.kolbo.openLink(b.getAttribute('data-url')); };
  });
}

// Small hover download button attached to a media cell (per-item downloads —
// batch grids and CD scenes have no single "current" url for the action row).
function dlBtnHTML(u) {
  return '<button class="k-dl" data-dl="' + esc(u) + '" title="Download" aria-label="Download">⬇</button>';
}
function wireDlButtons(root) {
  Array.prototype.forEach.call((root || document).querySelectorAll('.k-dl[data-dl]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      window.kolbo.openLink(downloadUrl(b.getAttribute('data-dl')));
    };
  });
}

function renderScenes(sc) {
  el('stage').innerHTML = sc.scenes.map(function (scene) {
    var media = (scene.video_urls || []).map(function (u) {
      return '<div class="k-media"><video src="' + esc(u) + '" controls playsinline></video>' + dlBtnHTML(u) + '</div>';
    }).join('') + (scene.image_urls || []).map(function (u) {
      return '<div class="k-media" data-focus="' + esc(u) + '"><img src="' + esc(u) + '" alt="">' + dlBtnHTML(u) + '</div>';
    }).join('');
    return '<div style="margin-bottom:14px"><div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">Scene ' +
      esc(scene.scene_number) + (scene.title ? ' — ' + esc(scene.title) : '') + '</div>' +
      '<div class="k-gen-grid n2">' + media + '</div></div>';
  }).join('');
  wireDlButtons(el('stage'));
  // Click a scene image → fullscreen focus on THAT image (videos keep their
  // native controls; clicking them shouldn't hijack playback).
  Array.prototype.forEach.call(el('stage').querySelectorAll('.k-media[data-focus]'), function (m) {
    m.style.cursor = 'zoom-in';
    m.onclick = function () { focusMedia(m.getAttribute('data-focus')); };
  });
  renderActions(sc);
}

// Fullscreen a single item out of a multi-item grid (Creative Director
// scenes). Exit restores the grid.
function focusMedia(url) {
  window.kolbo.requestDisplayMode('fullscreen').then(function (res) {
    if (!(res && res.mode === 'fullscreen')) return window.kolbo.openLink(url);
    isFullscreen = true;
    el('stage').innerHTML = '<div class="k-viewer"><img id="focus-img" src="' + esc(url) + '" alt="" style="cursor:zoom-out">' + dlBtnHTML(url) + '</div>';
    wireDlButtons(el('stage'));
    el('focus-img').onclick = exitFocus;
    applyFullscreen(true, exitFocus);
    window.kolbo.notifySize();
  }).catch(function () { window.kolbo.openLink(url); });
}
function exitFocus() {
  window.kolbo.requestDisplayMode('inline').catch(function () {});
  isFullscreen = false;
  applyFullscreen(false);
  renderScenes(state); // restore the grid
  window.kolbo.notifySize();
}

function renderError(msg) {
  clearTimeout(pollTimer);

  setPhaseChip('Failed', false);
  el('stage').innerHTML = '<div class="k-error">⚠ ' + esc(msg) + '</div>';
  el('actions').innerHTML = '<button class="k-btn" id="retry-btn">↻ Try Again</button>';
  el('retry-btn').onclick = function () {
    var what = (state && TOOL_TITLES[state.tool]) || 'generation';
    window.kolbo.sendMessage('Please retry that ' + what.toLowerCase() + ' — it failed with: ' + msg);
  };
  window.kolbo.notifySize();
}

/* ---------- fullscreen viewer ---------- */
var isFullscreen = false;
function toggleFullscreen() {
  var want = isFullscreen ? 'inline' : 'fullscreen';
  window.kolbo.requestDisplayMode(want).then(function (res) {
    var granted = res && res.mode;
    if (granted === 'fullscreen') { isFullscreen = true; applyFullscreen(true); }
    else if (granted === 'inline' || isFullscreen) { isFullscreen = false; applyFullscreen(false); }
    else if (!isFullscreen) {
      // Host refused fullscreen — degrade to opening the original file.
      window.kolbo.openLink(state.urls && state.urls[selected]);
    }
  }).catch(function () {
    if (!isFullscreen) window.kolbo.openLink(state.urls && state.urls[selected]);
  });
}
function applyFullscreen(on, exitHandler) {
  document.documentElement.classList.toggle('k-fullscreen', on);
  var c = el('phase-chip');
  if (on) {
    c.style.display = '';
    c.innerHTML = '✕ ' + esc('Exit');
    c.style.cursor = 'pointer';
    c.onclick = exitHandler || toggleFullscreen;
  } else {
    c.style.display = 'none';
    c.onclick = null;
    c.style.cursor = '';
  }
  window.kolbo.notifySize();
}

function setPhaseChip(text, spinning) {
  var c = el('phase-chip');
  if (!text) { c.style.display = 'none'; return; }
  c.style.display = '';
  c.innerHTML = (spinning ? '<span class="k-spin"></span>' : '') + esc(text);
}

/* ---------- actions ---------- */
function currentUrl() {
  return (state.urls && state.urls[state.kind === 'image' ? selected : 0]) || '';
}

function renderActions(sc) {
  var a = [];
  var hasSingleUrl = !!(sc.urls && sc.urls.length);
  if (sc.kind === 'image') {
    a.push('<button class="k-btn primary" id="btn-animate">🎬 Animate</button>');
    a.push('<button class="k-btn" id="btn-edit">✏️ Edit</button>');
  }
  if (sc.kind === 'video') {
    a.push('<button class="k-btn primary" id="btn-download">⬇ Download</button>');
    a.push('<button class="k-btn" id="btn-analyze">📊 Analyze</button>');
  } else if (hasSingleUrl) {
    // Scenes (Creative Director) have no single "current" url — per-item hover
    // download buttons cover them instead.
    a.push('<button class="k-btn" id="btn-download">⬇ Download</button>');
  }
  a.push('<button class="k-btn" id="btn-recreate">↻ Recreate</button>');
  a.push('<button class="k-btn ghost" id="btn-open">Open in Kolbo ↗</button>');
  el('actions').innerHTML = a.join('');

  bind('btn-download', function () { window.kolbo.openLink(downloadUrl(currentUrl())); });
  bind('btn-open', function () { window.kolbo.openLink(state.open_url || 'https://app.kolbo.ai'); });
  bind('btn-recreate', function () {
    window.kolbo.sendMessage('Recreate this with the same settings' +
      (state.model ? '\\nModel: ' + state.model : '') +
      (state.prompt ? '\\nPrompt: ' + state.prompt : '') +
      '\\n(from the ' + (TOOL_TITLES[state.tool] || 'generation') + ' widget)');
  });
  bind('btn-animate', function () {
    openPromptRow('Describe the motion (optional — Smart Select picks the best video model)…', function (text) {
      window.kolbo.sendMessage('Animate this image into a short video' +
        '\\n🎬 Reference image: ' + currentUrl() +
        '\\nModel: smart select — pick the best image-to-video model' +
        (text ? '\\nMotion prompt: ' + text : '\\nMotion prompt: subtle cinematic motion, slow push-in'));
    });
  });
  bind('btn-edit', function () {
    openPromptRow('Describe the edit — e.g. "make the background a beach at sunset"…', function (text) {
      if (!text) return;
      window.kolbo.sendMessage('Edit this image' +
        '\\n🖼 Reference image: ' + currentUrl() +
        '\\nEdit instruction: ' + text);
    });
  });
  bind('btn-analyze', function () {
    window.kolbo.sendMessage('Analyze this video and give me an engagement/virality read — hook strength, pacing, retention risks, and concrete improvement tips:\\n' + currentUrl());
  });
}
function bind(id, fn) { var b = el(id); if (b) b.onclick = fn; }

function openPromptRow(placeholder, onSend) {
  var row = el('prompt-row');
  row.classList.add('open');
  var input = el('action-input');
  input.placeholder = placeholder;
  input.value = '';
  input.focus();
  el('action-send').onclick = function () { row.classList.remove('open'); onSend(input.value.trim()); };
  input.onkeydown = function (e) { if (e.key === 'Enter') el('action-send').onclick(); };
  el('action-cancel').onclick = function () { row.classList.remove('open'); };
  window.kolbo.notifySize();
}

/* ---------- pre-result "Preparing" state ----------
   The host mounts this iframe as soon as the tool is CALLED; the result can
   take many seconds (model resolution, file upload, submit). Show a live
   shell immediately instead of a blank card. */
function bootPre(toolName, args) {
  if (state) return; // real data already arrived
  el('tool-title').textContent = TOOL_TITLES[toolName] || 'Generation';
  if (args && (args.prompt || args.text)) {
    el('prompt').textContent = args.prompt || args.text;
    el('prompt').style.display = '';
  }
  setPhaseChip('Preparing', true);
  if (!el('stage').innerHTML) {
    el('stage').innerHTML = '<div class="k-gen-grid n1"><div class="k-skel video" style="min-height:100px;max-height:140px"></div></div>';
  }
  window.kolbo.notifySize();
}

/* ---------- wire host events ---------- */
window.kolbo.onToolResult(function (result) {
  var sc = result.structuredContent || structured(result);
  if (sc && (sc.phase || sc.widget)) return boot(sc);
  // Tool errored (or returned plain text): show it instead of a dead blank card.
  var txt = '';
  try { txt = (result.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join(' '); } catch (e) {}
  if (result.isError || /error|failed/i.test(txt)) {
    renderError((txt || 'The request failed.').slice(0, 300));
  }
});
window.kolbo.onToolInput(function (args) { bootPre(null, args); });
window.kolbo.ready(function (ctx) {
  var info = ctx && ctx.toolInfo;
  if (!state && info) {
    if (info.result && info.result.structuredContent) return boot(info.result.structuredContent);
    bootPre(info.tool && info.tool.name, null);
  }
});
`;

function generationWidgetHtml() {
  return widgetPage({ title: 'Kolbo Generation', body: BODY, script: SCRIPT });
}

module.exports = { generationWidgetHtml };
