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
 *   settings: { duration, resolution, aspect_ratio, quality, audio, voice, mode,
 *               enhance_prompt, web_search, visual_dna, moodboard, preset, cinematic },
 *   reference_image,                   // thumbnail URL (optional)
 *   urls, thumbnail_url, title, duration, credits_used,
 *   tracks: [{ title, duration, thumbnail_url, model }], // optional audio metadata by URL index
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
      <button class="k-btn ghost" id="action-cancel" aria-label="Cancel"></button>
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
var originTool = null;
var originArgs = {};

el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('action-cancel').innerHTML = ICONS.x;
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

// Long text is clamped by CSS (.k-prompt 2 lines / .k-caption 1 line). When it
// actually overflows, make it click-to-expand so the full prompt is readable.
function makeExpandable(node) {
  if (!node) return;
  node.classList.remove('k-clamped');
  // Synchronous layout read — rAF would never fire in a hidden/backgrounded
  // iframe, leaving long prompts stuck without the expand affordance.
  if (node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2) {
    node.classList.add('k-clamped');
    node.title = node.title || 'Show full text';
    node.onclick = function () {
      node.classList.toggle('expanded');
      node.title = node.classList.contains('expanded') ? 'Collapse' : 'Show full text';
      window.kolbo.notifySize();
    };
  }
}

function boot(sc) {
  if (!sc) return;
  state = sc;
  el('tool-title').textContent = TOOL_TITLES[sc.tool] || 'Generation';
  el('prompt').textContent = sc.prompt || '';
  el('prompt').style.display = sc.prompt ? '' : 'none';
  makeExpandable(el('prompt'));
  renderChips(sc);
  el('credits').textContent = sc.credits_used != null ? fmtCredits(sc.credits_used) : '';
  if (sc.phase === 'generating') renderGenerating(sc);
  else if (sc.phase === 'failed') renderError(sc.error || 'Generation failed');
  else renderResult(sc);
  window.kolbo.notifySize();
}

// model_name / voice_name are the CLEAN catalog names, resolved server-side
// (src/tools/_shared.js on submit, get_generation_status on completion). The raw
// ids stay in sc.model / sc.voice for Recreate + model context — never for display.
function modelLabel(sc) { return sc.model_name || sc.model; }
function voiceLabel(sc) { return sc.voice_name || sc.voice || (sc.settings || {}).voice; }

function renderChips(sc) {
  var h = modelChipHTML(modelLabel(sc), sc.model_icon);
  var s = sc.settings || {};
  if (sc.kind) h += chip(iconFor(sc.kind) + ' ' + sc.kind);
  if (s.duration) h += chip(ICONS.clock + ' ' + fmtDur(s.duration));
  if (s.resolution) h += chip(esc(s.resolution));
  if (s.aspect_ratio) h += chip(esc(s.aspect_ratio));
  if (s.quality) h += chip(esc(s.quality) + ' quality');
  if (s.enhance_prompt) h += chip(ICONS.sparkle + ' enhanced');
  if (s.web_search) h += chip('web search');
  if (s.visual_dna) h += chip(s.visual_dna + ' Visual DNA');
  if (s.moodboard) h += chip('moodboard');
  if (s.preset) h += chip('preset');
  if (s.cinematic) h += chip('cinematic');
  if (s.audio) h += chip(ICONS.sound + ' audio');
  var voice = voiceLabel(sc);
  if (voice) {
    var face = sc.voice_thumbnail
      ? '<img class="k-voice-thumb" src="' + esc(sc.voice_thumbnail) + '" alt="" loading="lazy" onerror="this.style.display=\\'none\\'">'
      : ICONS.mic;
    h += chip(face + ' ' + esc(voice));
  }
  if (s.mode) h += chip(esc(s.mode));
  if (sc.count > 1) h += chip('×' + sc.count);
  if (sc.reference_image) h += '<img class="k-ref-thumb" src="' + esc(sc.reference_image) + '" alt="" loading="lazy" title="Reference image" onerror="this.style.display=\\'none\\'">';
  el('chips').innerHTML = h;
}
function chip(inner) { return '<span class="k-chip">' + inner + '</span>'; }
function iconFor(kind) {
  switch (kind) {
    case 'image': return ICONS.image;
    case 'video': case 'scenes': return ICONS.video;
    case 'audio': return ICONS.audio;
    case '3d': return ICONS.cube;
    default: return ICONS.sparkle;
  }
}

/* ---------- generating ---------- */
function isBatch(sc) { return !!(sc && sc.generation_ids && sc.generation_ids.length > 1); }

function renderGenerating(sc) {
  setPhaseChip('Generating', true);
  var n = Math.min(sc.count || 1, isBatch(sc) ? 8 : 4);
  var shape = sc.kind === 'video' || sc.kind === 'scenes' ? 'video' : (sc.kind === 'audio' ? 'video' : 'square');
  var cells = '';
  for (var i = 0; i < n; i++) {
    var cap = (sc.prompts && sc.prompts[i])
      ? '<span class="k-skel-cap" title="' + esc(sc.prompts[i]) + '">' + esc(sc.prompts[i]) + '</span>' : '';
    cells += '<div class="k-skel ' + shape + '" data-cell="' + i + '">' +
      (i === 0 ? '<span class="k-gen-badge"><span class="k-spin"></span>Generating</span>' : '') + cap + '</div>';
  }
  // Grid class caps at n4 — the auto-fill rule handles any larger batch count.
  el('stage').innerHTML = '<div class="k-gen-grid n' + Math.min(n, 4) + '">' + cells + '</div>';
  renderStopButton(sc);
  schedulePoll(sc);
}

/* ---------- cancel ----------
   Shorts run on their own job collection and have their own cancel tool;
   everything else is SdkGeneration-tracked and goes through cancel_generation.
   Returns null when the card has no id to cancel (nothing to offer). */
function cancelSpec(sc) {
  if (sc.poll_tool === 'shorts_status') {
    var jobId = (sc.status_args && sc.status_args.job_id) || sc.generation_id;
    return jobId ? { tool: 'shorts_cancel', args: { job_id: jobId } } : null;
  }
  if (isBatch(sc)) return { batch: sc.generation_ids };
  if (!sc.generation_id) return null;
  return { tool: 'cancel_generation', args: { generation_id: sc.generation_id } };
}

function renderStopButton(sc) {
  var spec = cancelSpec(sc);
  if (!spec) { el('actions').innerHTML = ''; return; }
  el('actions').innerHTML = '<button class="k-btn ghost" id="stop-btn">' + ICONS.x + ' Stop</button>';
  el('stop-btn').onclick = function () {
    var btn = el('stop-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="k-spin"></span> Stopping';
    // Stop polling immediately so a long-wait status call that lands mid-cancel
    // cannot repaint the card back into "Generating".
    cancelRequested = true;
    clearTimeout(pollTimer);
    // Batch: cancel every id; report combined refund. Entries that already
    // finished return cancelled:false — only resume polling if ALL did.
    var call = spec.batch
      ? Promise.all(spec.batch.map(function (id) {
          return window.kolbo.callTool('cancel_generation', { generation_id: id })
            .then(function (r) { return structured(r) || {}; })
            .catch(function () { return {}; });
        })).then(function (sts) {
          var refund = 0;
          sts.forEach(function (s) { if (s.credits_refunded) refund += s.credits_refunded; });
          return {
            cancelled: sts.some(function (s) { return s.cancelled !== false; }),
            credits_refunded: refund || undefined
          };
        })
      : window.kolbo.callTool(spec.tool, spec.args).then(function (r) { return structured(r) || {}; });
    call.then(function (st) {
      if (st.cancelled === false) {
        // Already terminal — let the normal poll path report the real outcome
        // instead of claiming a cancel that did not happen.
        cancelRequested = false;
        btn.disabled = false;
        btn.innerHTML = ICONS.x + ' Stop';
        return schedulePoll(sc);
      }
      renderCancelled(st.credits_refunded);
    }).catch(function (e) {
      cancelRequested = false;
      btn.disabled = false;
      btn.innerHTML = ICONS.x + ' Stop';
      schedulePoll(sc);
    });
  };
}

function renderCancelled(creditsRefunded) {
  clearTimeout(pollTimer);
  setPhaseChip('Cancelled', false);
  var note = creditsRefunded ? ' ' + creditsRefunded + ' credits refunded.' : '';
  el('stage').innerHTML = '<div class="k-error">' + ICONS.x + ' Generation cancelled.' + esc(note) + '</div>';
  el('actions').innerHTML = '<button class="k-btn" id="retry-btn">' + ICONS.retry + ' Try Again</button>';
  el('retry-btn').onclick = function () {
    var what = (state && TOOL_TITLES[state.tool]) || 'generation';
    window.kolbo.sendMessage('Run that ' + what.toLowerCase() + ' again — I cancelled the previous one.');
  };
  // Tell the model, so it does not go on to report the generation as running.
  try {
    window.kolbo.updateModelContext('The user cancelled generation ' +
      ((state && (state.generation_ids || [state.generation_id]).filter(Boolean).join(', ')) || '') + '.' + note +
      ' Do not poll it or report it as in progress.');
  } catch (e) {}
  window.kolbo.notifySize();
}

// Poll ceilings so the card never spins forever. Losing widget-side tracking
// is not a generation failure: keep retries disabled because the paid server
// job may still complete.
var MAX_POLL_MS = 35 * 60 * 1000;
var MAX_POLL_ERRORS = 30;
var pollStart = 0, pollErrors = 0;
var cancelRequested = false;   // set by the Stop button; freezes the poll loop

/* ---------- offscreen gate ----------
   The host mounts one of these iframes per generation, and re-delivers the
   ORIGINAL "submitted" (phase:generating) result on every conversation open —
   so a 50-generation session used to fire 50 status tools/call round trips plus
   50+ full-resolution media downloads before the user had scrolled to any of
   them. Hold the FIRST poll (and therefore every media request the result
   produces) until the card is actually on screen. Once a card has been seen it
   polls normally forever — a live generation the user scrolls away from still
   finishes and still reports back. */
var seen = false, whenSeenFns = [];
function releaseSeen() {
  if (seen) return;
  seen = true;
  var fns = whenSeenFns; whenSeenFns = [];
  fns.forEach(function (f) { try { f(); } catch (e) {} });
}
(function () {
  var card = document.querySelector('.k-card');
  if (!window.IntersectionObserver || !card) return releaseSeen();
  var fired = false;
  var io = new IntersectionObserver(function (entries) {
    fired = true;
    if (!entries.some(function (e) { return e.isIntersecting; })) return;
    io.disconnect();
    releaseSeen();
  // IO clips against ancestor frames, so this is true parent-viewport
  // visibility. rootMargin starts the work just before the card scrolls in.
  }, { rootMargin: '400px' });
  io.observe(card);
  // A host where IO never reports at all must not strand the card forever.
  setTimeout(function () { if (!fired) releaseSeen(); }, 8000);
})();

function schedulePoll(sc) {
  if (cancelRequested) return;
  if (!seen) { whenSeenFns.push(function () { schedulePoll(sc); }); return; }
  // The call itself long-waits server-side (normally up to three minutes).
  // This short pause only separates successive wait windows — the FIRST call
  // goes out immediately, so a card revealed by scrolling resolves at once.
  var delay = pollStart ? 1500 : 0;
  if (!pollStart) pollStart = Date.now();
  clearTimeout(pollTimer);
  pollTimer = setTimeout(function () { poll(sc); }, delay);
}
function poll(sc) {
  if (cancelRequested) return;
  if (pollStart && (Date.now() - pollStart) > MAX_POLL_MS) {
    return renderTrackingIssue('This is still running longer than the tracking window. Do not retry it — any completed result will appear in your Kolbo library.');
  }
  var args = sc.status_args || { generation_id: sc.generation_id, wait: true };
  window.kolbo.callTool(sc.poll_tool || 'get_generation_status', args).then(function (res) {
    var st = structured(res) || {};
    var stateName = st.state || st.phase || st.status;
    // A failed status CALL (tool error / not-found / {success:false}) is not a
    // generation state — count it toward the consecutive-error cap so a record
    // that can't be resolved errors out fast instead of polling forever.
    if ((res && res.isError) || st.success === false || (st.error && !stateName)) {
      if (++pollErrors >= MAX_POLL_ERRORS) return renderTrackingIssue(st.error || 'Tracking paused. The generation may still be running.');
      return schedulePoll(sc);
    }
    // Batch (prompts[] fan-out): multi-id status shape { all_done, generations[] }.
    if (isBatch(sc) && Array.isArray(st.generations)) {
      return handleBatchStatus(sc, st);
    }
    if (stateName === 'completed') {
      pollErrors = 0;
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
        var completedUrls = (done.urls || []).slice();
        (done.scenes || []).forEach(function (scene) {
          completedUrls = completedUrls.concat(scene.image_urls || [], scene.video_urls || []);
        });
        window.kolbo.updateModelContext(
          'Generation ' + (sc.generation_id || '') + ' completed (' + (sc.tool || '') + ').' +
          '\\nOutput URLs:\\n' + completedUrls.join('\\n') +
          (done.credits_used != null ? '\\nCredits used: ' + done.credits_used : ''));
      } catch (e) {}
    } else if (stateName === 'failed' || stateName === 'error' || stateName === 'cancelled') {
      renderError(st.error || 'Generation ' + stateName);
    } else {
      pollErrors = 0; // a valid in-progress response resets the failure streak
      schedulePoll(sc);
    }
  }).catch(function () {
    if (++pollErrors >= MAX_POLL_ERRORS) return renderTrackingIssue('Tracking paused after repeated connection errors. The generation may still be running.');
    schedulePoll(sc);
  });
}

/* ---------- batch (prompts[] fan-out) ---------- */
// Each poll round resolves when every id has completed or its wait window
// closed (~3 min), so finished cells fill in per round while the rest keep
// their skeleton. When all_done the SAME grid is re-rendered from the resolved
// set — a batch is one grouped card end to end. It must NOT fall through to the
// scenes carousel: that collapses eight tiles into one big image plus a thumb
// strip, which is where the grouping (and the per-tile prompt caption) was lost.
function handleBatchStatus(sc, st) {
  pollErrors = 0;
  var gens = st.generations || [];
  gens.forEach(function (g, i) {
    if (g.state === 'completed') fillBatchCell(sc, i, g);
  });
  if (!st.all_done) return schedulePoll(sc);

  var scenes = [], failedCount = 0, credits = 0, haveCredits = false, allUrls = [];
  gens.forEach(function (g, i) {
    var r = g.result || g;
    var urls = (r && r.urls) || [];
    if (g.state !== 'completed' || !urls.length) { failedCount++; return; }
    allUrls = allUrls.concat(urls);
    var c = g.credits_used != null ? g.credits_used : (r.credits_used != null ? r.credits_used : null);
    if (c != null) { credits += c; haveCredits = true; }
    scenes.push({
      scene_number: i + 1,
      title: (sc.prompts && sc.prompts[i]) || '',
      image_urls: sc.kind === 'video' ? [] : urls,
      video_urls: sc.kind === 'video' ? urls : []
    });
  });
  if (!scenes.length) return renderError('All ' + gens.length + ' generations failed');

  var done = Object.assign({}, sc, {
    phase: 'completed', kind: 'scenes', batch: true, scenes: scenes, urls: [],
    credits_used: haveCredits ? credits : sc.credits_used
  });
  state = done;
  el('credits').textContent = done.credits_used != null ? fmtCredits(done.credits_used) : '';
  renderResult(done);
  // After renderResult — it resets the chip, so setting this first erased it.
  if (failedCount) setPhaseChip(failedCount + ' failed', false);
  try {
    window.kolbo.updateModelContext(
      'Batch generation completed (' + (sc.tool || '') + '): ' + scenes.length + ' of ' + gens.length + ' succeeded.' +
      '\\nOutput URLs:\\n' + allUrls.join('\\n') +
      (failedCount ? '\\nFailed: ' + failedCount : '') +
      (haveCredits ? '\\nCredits used: ' + credits : ''));
  } catch (e) {}
}

function fillBatchCell(sc, i, g) {
  var cell = el('stage').querySelector('[data-cell="' + i + '"]');
  if (!cell || cell.getAttribute('data-done')) return;
  var r = g.result || g;
  var u = (r.urls || [])[0];
  if (!u) return;
  cell.setAttribute('data-done', '1');
  cell.classList.add('done');
  var cap = (sc.prompts && sc.prompts[i])
    ? '<span class="k-skel-cap" title="' + esc(sc.prompts[i]) + '">' + esc(sc.prompts[i]) + '</span>' : '';
  cell.innerHTML = (sc.kind === 'video'
    ? '<video class="k-cell-fill" src="' + esc(u) + '"' + (r.thumbnail_url ? ' poster="' + esc(r.thumbnail_url) + '"' : '') + ' muted playsinline preload="metadata"></video>'
    : '<img class="k-cell-fill" src="' + esc(u) + '" alt="">') + cap;
  window.kolbo.notifySize();
}

/* ---------- results ---------- */
function renderResult(sc) {
  clearTimeout(pollTimer);

  // Repaint the chips: the generating phase only knew what the CALLER asked for
  // (often nothing → "Smart Select"). The completed status carries the model and
  // voice that actually ran, so the finished card must not keep the guess.
  renderChips(sc);
  setPhaseChip('', false);
  if (sc.batch && sc.scenes && sc.scenes.length) return renderBatchGrid(sc);
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
      return '<div class="k-thumb' + (i === selected ? ' active' : '') + '" data-i="' + i + '"><img src="' + esc(u) + '" alt="" loading="lazy"></div>';
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
  // preload="none" behind a poster: the card shows the still until the user
  // hits play, instead of pulling the video header on mount.
  el('stage').innerHTML = '<div class="k-viewer"><video id="main-video" src="' + esc(urls[0]) + '"' +
    (sc.thumbnail_url ? ' poster="' + esc(sc.thumbnail_url) + '" preload="none"' : ' preload="metadata"') + ' controls playsinline></video>' +
    dlBtnHTML(urls[0]) + '</div>';
  wireDlButtons(el('stage'));
}

function renderAudio(sc, urls) {
  el('stage').innerHTML = urls.map(function (u, i) {
    var track = (sc.tracks && sc.tracks[i]) || {};
    var titleBase = track.title || sc.title || (TOOL_TITLES[sc.tool] || 'Audio');
    var title = titleBase + (urls.length > 1 ? ' — Track ' + (i + 1) : '');
    var duration = track.duration != null ? track.duration : sc.duration;
    var artwork = track.thumbnail_url || sc.thumbnail_url;
    return '<div class="k-audio-row k-generated-audio">' +
      (artwork ? '<img class="k-audio-art" src="' + esc(artwork) + '" alt="" loading="lazy">' :
        '<div class="k-audio-art k-audio-placeholder">' + ICONS.audio + '</div>') +
      '<div class="k-audio-meta"><div class="k-audio-title">' + esc(title) + '</div>' +
      // Resolved name first: a per-track model field is the raw id, and every
      // track in one generation came from the same model anyway.
      '<div class="k-audio-sub">' + esc(modelLabel(sc) || track.model || '') +
      (duration ? ' · ' + fmtDur(duration) : '') + '</div></div>' +
      '<button class="k-btn k-audio-download" data-audio-download="' + esc(u) +
      '" aria-label="Download ' + esc(title) + '">' + ICONS.download + ' Download</button>' +
      '<audio class="k-audio-player" src="' + esc(u) + '" controls preload="none" aria-label="Play ' +
      esc(title) + '"></audio></div>';
  }).join('');
  Array.prototype.forEach.call(el('stage').querySelectorAll('[data-audio-download]'), function (b) {
    b.onclick = function () {
      window.kolbo.openLink(downloadUrl(b.getAttribute('data-audio-download')));
    };
  });
  var players = el('stage').querySelectorAll('.k-audio-player');
  Array.prototype.forEach.call(players, function (player) {
    player.addEventListener('play', function () {
      Array.prototype.forEach.call(players, function (other) {
        if (other !== player) other.pause();
      });
    });
  });
}

function render3d(sc, urls) {
  el('stage').innerHTML = (sc.thumbnail_url
    ? '<div class="k-viewer"><img src="' + esc(sc.thumbnail_url) + '" alt="" loading="lazy"></div>' : '') +
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
  return '<button class="k-dl" data-dl="' + esc(u) + '" title="Download" aria-label="Download">' + ICONS.download + '</button>';
}
function wireDlButtons(root) {
  Array.prototype.forEach.call((root || document).querySelectorAll('.k-dl[data-dl]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      window.kolbo.openLink(downloadUrl(b.getAttribute('data-dl')));
    };
  });
}

// CD scenes render as the SAME viewer+thumbnail carousel as image batches —
// a stacked column of full-size scenes buried the card (and the chat).
function sceneItems(sc) {
  var items = [];
  (sc.scenes || []).forEach(function (scene) {
    // Batch sets carry the raw user prompt as title — no "Scene N" framing.
    var label = sc.batch
      ? (scene.title || 'Prompt ' + scene.scene_number)
      : 'Scene ' + scene.scene_number + (scene.title ? ' — ' + scene.title : '');
    (scene.image_urls || []).forEach(function (u) { items.push({ url: u, type: 'image', label: label }); });
    (scene.video_urls || []).forEach(function (u) { items.push({ url: u, type: 'video', label: label }); });
  });
  return items;
}

// Batch (prompts[] fan-out) result: the SAME tile grid the generating phase
// showed, each tile still captioned with the prompt that produced it. Downloads
// are per-tile (a batch has no single "current" url); click a tile to focus it.
function renderBatchGrid(sc) {
  var items = sceneItems(sc);
  if (!items.length) return renderError('No completed results received');
  var shape = items[0].type === 'video' ? 'video' : 'square';
  el('stage').innerHTML = '<div class="k-gen-grid n' + Math.min(items.length, 4) + '">' +
    items.map(function (it, i) {
      return '<div class="k-skel done ' + shape + '" data-focus="' + i + '">' +
        (it.type === 'video'
          ? '<video class="k-cell-fill" src="' + esc(it.url) + '" controls playsinline preload="metadata"></video>'
          : '<img class="k-cell-fill" src="' + esc(it.url) + '" alt="" loading="lazy" style="cursor:zoom-in">') +
        (it.label ? '<span class="k-skel-cap" title="' + esc(it.label) + '">' + esc(it.label) + '</span>' : '') +
        dlBtnHTML(it.url) + '</div>';
    }).join('') + '</div>';
  wireDlButtons(el('stage'));
  Array.prototype.forEach.call(el('stage').querySelectorAll('[data-focus]'), function (cell) {
    var it = items[+cell.getAttribute('data-focus')];
    if (it.type !== 'image') return; // <video controls> owns its own clicks
    cell.onclick = function () { focusMedia(it.url); };
  });
  renderActions(sc);
  window.kolbo.notifySize();
}

function renderScenes(sc) {
  var items = sceneItems(sc);
  if (!items.length) return renderError('No completed scenes received');
  selected = Math.min(selected, items.length - 1);
  var it = items[selected];
  var mediaHtml = it.type === 'video'
    ? '<video id="scene-main" src="' + esc(it.url) + '" controls playsinline></video>'
    : '<img id="scene-main" src="' + esc(it.url) + '" alt="" style="cursor:zoom-in">';
  var thumbs = '<div class="k-thumbs">' + items.map(function (t, i) {
    var inner = t.type === 'video'
      ? '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:rgba(255,255,255,0.06);font-size:22px">' + ICONS.play + '</span>'
      : '<img src="' + esc(t.url) + '" alt="" loading="lazy">';
    return '<div class="k-thumb' + (i === selected ? ' active' : '') + '" data-i="' + i + '" title="' + esc(t.label) + '">' + inner + '</div>';
  }).join('') + '</div>';
  el('stage').innerHTML =
    '<div class="k-viewer">' + mediaHtml + dlBtnHTML(it.url) + '</div>' +
    '<div class="k-caption" id="scene-cap">' + esc(it.label) + '</div>' +
    thumbs;
  makeExpandable(el('scene-cap'));
  wireDlButtons(el('stage'));
  if (it.type === 'image') {
    var main = el('scene-main');
    if (main) main.onclick = function () { focusMedia(it.url); };
  }
  Array.prototype.forEach.call(el('stage').querySelectorAll('.k-thumb'), function (t) {
    t.onclick = function () { selected = +t.getAttribute('data-i'); renderScenes(sc); window.kolbo.notifySize(); };
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
  renderResult(state); // restore whichever multi-item view we came from
  window.kolbo.notifySize();
}

function renderError(msg) {
  clearTimeout(pollTimer);

  setPhaseChip('Failed', false);
  el('stage').innerHTML = '<div class="k-error">' + ICONS.warn + ' ' + esc(msg) + '</div>';
  el('actions').innerHTML = '<button class="k-btn" id="retry-btn">' + ICONS.retry + ' Try Again</button>';
  el('retry-btn').onclick = function () {
    var what = (state && TOOL_TITLES[state.tool]) || 'generation';
    window.kolbo.sendMessage('Please retry that ' + what.toLowerCase() + ' — it failed with: ' + msg);
  };
  window.kolbo.notifySize();
}

function renderTrackingIssue(msg) {
  clearTimeout(pollTimer);
  setPhaseChip('Still working', false);
  el('stage').innerHTML = '<div class="k-error">' + ICONS.clock + ' ' + esc(msg) + '</div>';
  el('actions').innerHTML = '<button class="k-btn primary" id="status-btn">' + ICONS.clock + ' Check status</button>' +
    '<button class="k-btn ghost" id="tracking-open">Open in Kolbo ' + ICONS.open + '</button>';
  el('status-btn').onclick = function () {
    window.kolbo.sendMessage('Check the existing Kolbo generation status without retrying it.' +
      (state && state.generation_id ? '\\nGeneration ID: ' + state.generation_id : ''));
  };
  el('tracking-open').onclick = function () {
    window.kolbo.openLink((state && state.open_url) || 'https://app.kolbo.ai');
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
  if (window.kolbo.setFullscreen) window.kolbo.setFullscreen(on);
  var c = el('phase-chip');
  if (on) {
    c.style.display = '';
    c.innerHTML = ICONS.x + ' ' + esc('Exit');
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
    a.push('<button class="k-btn primary" id="btn-animate">' + ICONS.video + ' Animate</button>');
    a.push('<button class="k-btn" id="btn-edit">' + ICONS.edit + ' Edit</button>');
  }
  if (sc.kind === 'video') {
    a.push('<button class="k-btn primary" id="btn-download">' + ICONS.download + ' Download</button>');
  } else if (hasSingleUrl && sc.kind !== 'audio') {
    // Scenes (Creative Director) have no single "current" url — per-item hover
    // download buttons cover them instead. Audio has a visible download button
    // on every track so multi-output generations never download only track 1.
    a.push('<button class="k-btn" id="btn-download">' + ICONS.download + ' Download</button>');
  }
  a.push('<button class="k-btn" id="btn-recreate">' + ICONS.retry + ' Recreate</button>');
  a.push('<button class="k-btn ghost" id="btn-open">Open in Kolbo ' + ICONS.open + '</button>');
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
    openPromptRow('Describe the motion (optional)…', function (text) {
      window.kolbo.sendMessage('Animate this image into a short video' +
        '\\n🎬 Reference image: ' + currentUrl() +
        '\\nModel: pick a specific image-to-video model that best fits this image (do NOT use Smart Select / auto)' +
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
  if (toolName) originTool = toolName;
  if (args) originArgs = args;
  if (state) return; // real data already arrived
  el('tool-title').textContent = TOOL_TITLES[toolName] || 'Generation';
  if (args && (args.prompt || args.text || (Array.isArray(args.prompts) && args.prompts.length))) {
    el('prompt').textContent = args.prompt || args.text ||
      (args.prompts.length + ' prompts — ' + args.prompts.join(' · '));
    el('prompt').style.display = '';
    makeExpandable(el('prompt'));
  }
  setPhaseChip('Preparing', true);
  if (!el('stage').innerHTML) {
    el('stage').innerHTML = '<div class="k-gen-grid n1"><div class="k-skel video" style="min-height:100px;max-height:140px"></div></div>';
  }
  window.kolbo.notifySize();
}

function kindFromTool(tool, sc) {
  if (sc && sc.scenes) return 'scenes';
  if (/video|lipsync|elements|first_last/i.test(tool || '')) return 'video';
  if (/music|speech|sound/i.test(tool || '')) return 'audio';
  if (/3d/i.test(tool || '')) return '3d';
  var firstUrl = sc && Array.isArray(sc.urls) ? String(sc.urls[0] || '').split('?')[0].toLowerCase() : '';
  if (/\\.(mp4|mov|webm|mkv)$/.test(firstUrl)) return 'video';
  if (/\\.(mp3|wav|m4a|aac|ogg|flac)$/.test(firstUrl)) return 'audio';
  if (/\\.(glb|gltf|fbx|obj|usdz)$/.test(firstUrl)) return '3d';
  return 'image';
}

// Recover a successful legacy/text result when a host mounted the iframe from
// declaration metadata but the server did not recognize its Apps capability.
function completedFromPlain(sc) {
  if (!sc || (!Array.isArray(sc.urls) && !Array.isArray(sc.scenes))) return null;
  return Object.assign({}, sc, {
    widget: 'generation',
    phase: 'completed',
    tool: originTool,
    kind: kindFromTool(originTool, sc),
    prompt: originArgs.prompt || originArgs.text || sc.prompt_used || '',
    model: sc.model || originArgs.model,
    settings: {
      duration: sc.duration || originArgs.duration,
      resolution: originArgs.resolution,
      aspect_ratio: originArgs.aspect_ratio,
      quality: originArgs.quality
    },
    urls: sc.urls || []
  });
}

/* ---------- wire host events ---------- */
window.kolbo.onToolResult(function (result) {
  var sc = result.structuredContent || structured(result);
  if (sc && (sc.phase || sc.widget)) return boot(sc);
  var recovered = completedFromPlain(sc);
  if (recovered) return boot(recovered);
  // Tool errored (or returned plain text): show it instead of a dead blank card.
  var txt = '';
  try { txt = (result.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join(' '); } catch (e) {}
  if (/timed out|timeout/i.test(txt)) {
    return renderTrackingIssue((txt || 'Tracking timed out. The generation may still be running.').slice(0, 300));
  }
  if (result.isError || /error|failed/i.test(txt)) {
    renderError((txt || 'The request failed.').slice(0, 300));
  }
});
window.kolbo.onToolInput(function (args, info) { bootPre(info && info.name, args); });
window.kolbo.ready(function (ctx) {
  var info = ctx && ctx.toolInfo;
  if (!state && info) {
    originTool = (info.tool && info.tool.name) || originTool;
    if (info.result && info.result.structuredContent) return boot(info.result.structuredContent);
    bootPre(originTool, null);
  }
});
`;

function generationWidgetHtml() {
  return widgetPage({ title: 'Kolbo Generation', body: BODY, script: SCRIPT });
}

module.exports = { generationWidgetHtml };
