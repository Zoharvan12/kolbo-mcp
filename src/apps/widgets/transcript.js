'use strict';

const { widgetPage } = require('../html');

/**
 * Transcript widget — transcribe_audio results.
 *
 * structuredContent: {
 *   widget: 'transcript', phase: 'completed'|'generating'|'failed',
 *   generation_id, poll_tool, text, duration, audio_url, srt_url,
 *   word_by_word_srt_url, txt_url, credits_used, error,
 *   open_url  // "Open in Kolbo" session deep link (optional)
 * }
 */

const BODY = `
<div class="k-card">
  <div class="k-head">
    <span class="k-logo" id="logo"></span>
    <span class="k-title">Transcription</span>
    <span class="k-spacer"></span>
    <span class="k-chip" id="phase-chip" style="display:none"></span>
  </div>
  <div class="k-body">
    <div id="player"></div>
    <div id="stage" class="k-empty">Loading…</div>
    <div class="k-actions" id="actions"></div>
  </div>
  <div class="k-footer">
    <span>ElevenLabs Scribe v2 · <a href="#" id="kolbo-link">Kolbo.AI</a></span>
    <span class="k-credits" id="credits"></span>
  </div>
</div>
`;

const SCRIPT = `
el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink((state && state.open_url) || 'https://app.kolbo.ai'); };
var state = null, pollTimer = null;

function boot(sc) {
  if (!sc) return;
  state = sc;
  el('credits').textContent = sc.credits_used != null ? fmtCredits(sc.credits_used) : '';
  if (sc.phase === 'generating') {
    el('phase-chip').style.display = '';
    el('phase-chip').innerHTML = '<span class="k-spin"></span>Transcribing';
    el('stage').innerHTML = '<div class="k-skel video" style="min-height:80px"></div>';
    el('stage').classList.remove('k-empty');
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, 5000);
    window.kolbo.notifySize();
    return;
  }
  if (sc.phase === 'failed') {
    el('phase-chip').style.display = 'none';
    el('stage').innerHTML = '<div class="k-error">⚠ ' + esc(sc.error || 'Transcription failed') + '</div>';
    return;
  }
  el('phase-chip').style.display = '';
  el('phase-chip').textContent = sc.duration ? fmtDur(sc.duration) : 'Done';
  if (sc.audio_url) {
    el('player').innerHTML = '<audio src="' + esc(sc.audio_url) + '" controls style="width:100%;height:36px;margin-bottom:10px"></audio>';
  }
  el('stage').classList.remove('k-empty');
  el('stage').innerHTML = '<div style="max-height:280px;overflow-y:auto;padding:10px 12px;border-radius:10px;' +
    'background:var(--surface);border:1px solid var(--border);font-size:12.5px;color:var(--text-muted);white-space:pre-wrap">' +
    esc(sc.text || '(empty transcript)') + '</div>';
  var a = [];
  if (sc.srt_url) a.push('<button class="k-btn primary" data-url="' + esc(sc.srt_url) + '">⬇ SRT</button>');
  if (sc.word_by_word_srt_url) a.push('<button class="k-btn" data-url="' + esc(sc.word_by_word_srt_url) + '">⬇ Word-by-word SRT</button>');
  if (sc.txt_url) a.push('<button class="k-btn" data-url="' + esc(sc.txt_url) + '">⬇ TXT</button>');
  a.push('<button class="k-btn ghost" id="btn-copy">Copy text</button>');
  el('actions').innerHTML = a.join('');
  Array.prototype.forEach.call(el('actions').querySelectorAll('[data-url]'), function (b) {
    b.onclick = function () { window.kolbo.openLink(downloadUrl(b.getAttribute('data-url'))); };
  });
  var copyBtn = el('btn-copy');
  if (copyBtn) copyBtn.onclick = function () {
    try { navigator.clipboard.writeText(state.text || ''); copyBtn.textContent = 'Copied ✓'; } catch (e) {}
  };
  window.kolbo.notifySize();
}

function poll() {
  window.kolbo.callTool(state.poll_tool || 'get_generation_status', { generation_id: state.generation_id })
    .then(function (res) {
      var st = structured(res) || {};
      var s = st.state || st.phase;
      if (s === 'completed') {
        var r = st.result || st;
        boot(Object.assign({}, state, r, { phase: 'completed', credits_used: st.credits_used }));
      } else if (s === 'failed' || s === 'cancelled') {
        boot(Object.assign({}, state, { phase: 'failed', error: st.error }));
      } else { pollTimer = setTimeout(poll, 5000); }
    }).catch(function () { pollTimer = setTimeout(poll, 5000); });
}

window.kolbo.onToolResult(function (result) {
  var sc = result.structuredContent || structured(result);
  // Only boot on a real widget contract (phase present). A text-JSON
  // fallback like { status: 'submitted' } has no phase and would render a
  // bogus "(empty transcript)" completed view.
  if (sc && (sc.phase || sc.widget === 'transcript')) return boot(sc);
  var txt = '';
  try { txt = (result.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join(' '); } catch (e) {}
  if (result.isError || /error|failed/i.test(txt)) {
    el('phase-chip').style.display = 'none';
    el('stage').classList.remove('k-empty');
    el('stage').innerHTML = '<div class="k-error">⚠ ' + esc((txt || 'Transcription failed').slice(0, 300)) + '</div>';
    window.kolbo.notifySize();
    return;
  }
  // No usable data — collapse instead of a dead "Loading…" card.
  var card = document.querySelector('.k-card');
  if (card) card.style.display = 'none';
  window.kolbo.notifySize();
});
`;

function transcriptWidgetHtml() {
  return widgetPage({ title: 'Kolbo Transcription', body: BODY, script: SCRIPT });
}

module.exports = { transcriptWidgetHtml };
