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
  // listPayload() normalises plain shapes; carry the paging contract through.
  if (sc && sc.page_tool && !list.page_tool) { list.page_tool = sc.page_tool; list.next_args = sc.next_args; list.page = sc.page; }
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
  // Render every item the server sent (the old slice(0, 40) silently dropped
  // rows, and nothing told the user). Load more only when the server said how.
  var h = list.items.map(itemHTML).join('');
  var shown = list.items.length;
  if (list.page_tool && list.next_args) {
    h += '<button class="k-btn" id="load-more" style="width:100%;margin-top:10px">Load more' +
      (total > shown ? ' (' + shown + ' of ' + total + ' shown)' : '') + '</button>';
  }
  el('stage').innerHTML = h;
  el('stage').classList.remove('k-empty');
  wire();
  var lm = el('load-more');
  if (lm) lm.onclick = function () { fetchNextPage(lm); };
  window.kolbo.notifySize();
  return true;
}

function fetchNextPage(btn) {
  if (!state || !state.page_tool || !state.next_args || btn.disabled) return;
  btn.disabled = true;
  var label = btn.textContent;
  btn.innerHTML = '<span class="k-spin"></span> Loading';
  window.kolbo.callTool(state.page_tool, state.next_args).then(function (res) {
    var sc = structured(res);
    var next = sc ? listPayload(sc) || sc : null;
    var more = (next && next.items) || [];
    if ((res && res.isError) || !next) { btn.disabled = false; btn.textContent = 'Could not load more — try again'; return; }
    if (!more.length) { btn.textContent = 'No more results'; return; }
    state.items = state.items.concat(more);
    state.next_args = sc.next_args;
    if (sc.total != null) state.total = sc.total;
    boot(Object.assign({}, state, { widget: 'list', page_tool: state.page_tool, next_args: state.next_args }));
  }).catch(function () { btn.disabled = false; btn.textContent = label; });
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
