'use strict';

const { widgetPage } = require('../html');

/**
 * Generic list widget — for tools that return a flat list of named records
 * with no natural thumbnail (projects, sessions, agents, docs, folders,
 * knowledge-base sources). Reuses the exact row shell mediaGrid's audio rows
 * and catalog's model rows already use (`.k-audio-row` / `.k-audio-meta` /
 * `.k-chip` / `.k-btn` — no new CSS needed).
 *
 * structuredContent contract:
 * {
 *   widget: 'list',
 *   title: 'Your Projects',
 *   items: [{
 *     id, title, subtitle,        // main two lines
 *     thumbnail,                  // optional — real image; falls back to the letter monogram on
 *                                  // missing/failed load, same idiom as catalog.js model icons
 *     badge,                      // small pill, e.g. role/status ("owner", "default", "shared")
 *     meta,                       // small trailing text, e.g. a date or count
 *     open_url,                   // optional — renders an "Open" button (openLink)
 *     use_hint                    // unused — a click pastes `id` into the composer
 *   }],
 *   total
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

function boot(sc) {
  var list = listPayload(sc);
  if (!list) return false;
  state = list;
  el('title').textContent = list.title || 'List';
  var total = list.total != null ? list.total : list.items.length;
  el('count-chip').style.display = '';
  el('count-chip').textContent = total + (total === 1 ? ' item' : ' items');
  if (!list.items.length) {
    el('stage').classList.add('k-empty');
    el('stage').innerHTML = 'Nothing here yet';
    window.kolbo.notifySize();
    return true;
  }
  el('stage').innerHTML = list.items.slice(0, 40).map(itemHTML).join('');
  el('stage').classList.remove('k-empty');
  wire();
  window.kolbo.notifySize();
  return true;
}

function apply(result) {
  if (!result) return false;
  var inner = result.result || result;
  return boot(inner.structuredContent || structured(inner) || inner);
}

function itemHTML(item, i) {
  var clickable = !!item.id;
  var avatar = item.thumbnail
    ? '<img class="k-audio-art k-peek-hit" src="' + esc(item.thumbnail) + '" alt="" loading="lazy"'
      + peekAttrs(item.thumbnail, 'image', item.title)
      + ' onerror="this.outerHTML=monogram(\\'' + esc(item.title || '?').replace(/'/g, '') + '\\')">'
    : monogram(item.title || '?');
  return '<div class="k-audio-row" data-i="' + i + '"' + (clickable ? ' style="cursor:pointer"' : '') + '>' +
    avatar +
    '<div class="k-audio-meta"><div class="k-audio-title">' + esc(item.title || '') + '</div>' +
    (item.subtitle ? '<div class="k-audio-sub">' + esc(item.subtitle) + '</div>' : '') + '</div>' +
    (item.badge ? '<span class="k-chip" style="flex:none">' + esc(item.badge) + '</span>' : '') +
    (item.meta ? '<span style="flex:none;font-size:10.5px;color:var(--text-faint)">' + esc(item.meta) + '</span>' : '') +
    (item.open_url ? '<button class="k-btn" data-open="' + i + '">Open</button>' : '') +
    '</div>';
}

function wire() {
  bindPeekHits(el('stage'));
  Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      window.kolbo.openLink(state.items[+b.getAttribute('data-open')].open_url);
    };
  });
  Array.prototype.forEach.call(document.querySelectorAll('.k-audio-row'), function (row) {
    var item = state.items[+row.getAttribute('data-i')];
    if (!item || !item.id) return;
    row.onclick = function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-open],[data-peek]')) return;
      window.kolbo.insertText(String(item.id));
    };
  });
}

window.kolbo.onToolResult(function (result) {
  apply(result);
});
window.kolbo.ready(function (ctx) {
  var info = ctx && ctx.toolInfo;
  if (info && info.result) apply(info.result);
});
`;

function listWidgetHtml() {
  return widgetPage({ title: 'Kolbo List', body: BODY, script: SCRIPT });
}

module.exports = { listWidgetHtml };
