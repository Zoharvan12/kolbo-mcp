'use strict';

const { widgetPage } = require('../html');

/**
 * Media grid widget — media library, stock search, presets, voices, moodboards,
 * visual DNAs, music library.
 *
 * structuredContent contract:
 * {
 *   widget: 'media-grid',
 *   title: 'Stock Search — "rain on window"',
 *   items: [{
 *     id, title, subtitle, thumbnail, media_type: 'image'|'video'|'audio'|'3d',
 *     url,                 // full asset / playback URL
 *     preview_audio,       // audio preview URL (voices, music)
 *     use_hint             // message template sent when "Use" clicked, {URL}/{ID}/{TITLE} substituted
 *   }],
 *   total, has_more,
 *   import_tool_hint       // e.g. 'import via import_stock_asset' — shown on Use
 * }
 */

const BODY = `
<div class="k-card">
  <div class="k-head">
    <span class="k-logo" id="logo"></span>
    <span class="k-title" id="title"></span>
    <span class="k-spacer"></span>
    <span class="k-chip" id="count-chip" style="display:none"></span>
  </div>
  <div class="k-body"><div id="stage" class="k-empty">Loading…</div></div>
  <div class="k-footer"><span>Powered by <a href="#" id="kolbo-link">Kolbo.AI</a></span></div>
</div>
`;

const SCRIPT = `
el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink('https://app.kolbo.ai'); };
var state = null;
var playing = null;

function boot(sc) {
  if (!sc || !sc.items) return;
  state = sc;
  el('title').textContent = sc.title || 'Library';
  if (sc.total != null) { el('count-chip').style.display = ''; el('count-chip').textContent = sc.total + ' results'; }
  if (!sc.items.length) { el('stage').innerHTML = '<div class="k-empty">No results</div>'; return; }
  var audioItems = sc.items.filter(function (i) { return i.media_type === 'audio'; });
  var visualItems = sc.items.filter(function (i) { return i.media_type !== 'audio'; });
  var h = '';
  if (visualItems.length) {
    h += '<div class="k-grid">' + visualItems.slice(0, 24).map(cellHTML).join('') + '</div>';
  }
  if (audioItems.length) {
    h += audioItems.slice(0, 12).map(audioRowHTML).join('');
  }
  el('stage').innerHTML = h;
  el('stage').classList.remove('k-empty');
  wire();
  window.kolbo.notifySize();
}

function cellHTML(item, i) {
  var idx = state.items.indexOf(item);
  var media = item.thumbnail
    ? '<img src="' + esc(item.thumbnail) + '" loading="lazy" alt="">'
    : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-faint);font-size:20px">' +
      ({ video: '🎬', '3d': '🧊' }[item.media_type] || '🖼') + '</div>';
  return '<div class="k-cell" data-i="' + idx + '">' +
    '<div class="k-cell-media">' + media + '</div>' +
    '<div class="k-cell-label">' + esc(item.title || '') + '</div>' +
    (item.subtitle ? '<div class="k-cell-sub">' + esc(item.subtitle) + '</div>' : '') +
    '</div>';
}

function audioRowHTML(item) {
  var idx = state.items.indexOf(item);
  return '<div class="k-audio-row" data-i="' + idx + '">' +
    (item.thumbnail ? '<img class="k-audio-art" src="' + esc(item.thumbnail) + '">' : '<div class="k-audio-art"></div>') +
    '<div class="k-audio-meta"><div class="k-audio-title">' + esc(item.title || '') + '</div>' +
    '<div class="k-audio-sub">' + esc(item.subtitle || '') + '</div></div>' +
    (item.preview_audio || item.url
      ? '<button class="k-play" data-play="' + esc(item.preview_audio || item.url) + '">▶</button>' : '') +
    '<button class="k-btn" data-use="' + idx + '">Use</button></div>';
}

function wire() {
  Array.prototype.forEach.call(document.querySelectorAll('.k-cell'), function (c) {
    c.onclick = function () { useItem(+c.getAttribute('data-i')); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-use]'), function (b) {
    b.onclick = function (e) { e.stopPropagation(); useItem(+b.getAttribute('data-use')); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-play]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      var url = b.getAttribute('data-play');
      if (playing && playing.src === url && !playing.paused) { playing.pause(); b.textContent = '▶'; return; }
      if (playing) playing.pause();
      Array.prototype.forEach.call(document.querySelectorAll('[data-play]'), function (x) { x.textContent = '▶'; });
      playing = new Audio(url);
      playing.play();
      b.textContent = '⏸';
      playing.onended = function () { b.textContent = '▶'; };
    };
  });
}

function useItem(i) {
  var item = state.items[i];
  if (!item) return;
  var msg = item.use_hint
    ? item.use_hint.replace('{URL}', item.url || '').replace('{ID}', item.id || '').replace('{TITLE}', item.title || '')
    : 'Use this asset: "' + (item.title || item.id) + '"\\nURL: ' + (item.url || '') + (item.id ? '\\nID: ' + item.id : '');
  window.kolbo.sendMessage(msg);
}

window.kolbo.onToolResult(function (result) {
  var sc = result.structuredContent || structured(result);
  if (sc && sc.items) return boot(sc);
  // No grid data (empty result set, error, or timeout path returned plain
  // text) — collapse instead of showing a dead "Loading…" card forever.
  var card = document.querySelector('.k-card');
  if (card) card.style.display = 'none';
  window.kolbo.notifySize();
});
`;

function mediaGridWidgetHtml() {
  return widgetPage({ title: 'Kolbo Library', body: BODY, script: SCRIPT });
}

module.exports = { mediaGridWidgetHtml };
