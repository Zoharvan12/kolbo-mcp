'use strict';

const { widgetPage } = require('../html');

/**
 * Generic list widget — for tools that return a flat list of named records
 * with no natural thumbnail (projects, sessions, agents, docs, folders,
 * knowledge-base sources). Reuses the exact row shell mediaGrid's audio rows
 * and catalog's model rows already use (`.k-audio-row` / `.k-audio-meta` /
 * `.k-chip` / `.k-btn` — no new CSS needed), and the same pager the media grid
 * uses, so a long list is a fixed-height page instead of a card that grows.
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
var page = 0;
var PAGE = 8;

function pageCount() { return Math.max(1, Math.ceil(((state && state.items) || []).length / PAGE)); }
function hasMore() { return !!(state && state.page_tool && state.next_args); }

function boot(sc) {
  var list = listPayload(sc);
  if (!list) return false;
  // listPayload() normalises plain shapes; carry the paging contract through.
  if (sc && sc.page_tool && !list.page_tool) { list.page_tool = sc.page_tool; list.next_args = sc.next_args; list.page = sc.page; }
  state = list;
  page = 0;
  el('title').textContent = list.title || 'List';
  render();
  return true;
}

function render() {
  var total = state.total != null ? state.total : state.items.length;
  el('count-chip').style.display = '';
  el('count-chip').textContent = total + (total === 1 ? ' item' : ' items');
  if (!state.items.length) {
    el('stage').classList.add('k-empty');
    el('stage').innerHTML = 'Nothing here yet';
    window.kolbo.notifySize();
    return;
  }
  if (page > pageCount() - 1) page = pageCount() - 1;
  var h = state.items.slice(page * PAGE, page * PAGE + PAGE).map(itemHTML).join('') + pagerHTML();
  el('stage').innerHTML = h;
  el('stage').classList.remove('k-empty');
  wire();
  window.kolbo.notifySize();
}

function pagerHTML() {
  var n = pageCount();
  var more = hasMore();
  if (n <= 1 && !more) return '';
  var mid;
  if (n <= 8) {
    var dots = '';
    for (var i = 0; i < n; i++) {
      dots += '<button class="k-dot' + (i === page ? ' on' : '') + '" data-page="' + i + '" aria-label="Page ' + (i + 1) + '"></button>';
    }
    if (more) dots += '<span class="k-dot ghost"></span>';
    mid = '<div class="k-dots">' + dots + '</div>';
  } else {
    mid = '<span class="k-pager-label">' + (page + 1) + ' / ' + n + (more ? '+' : '') + '</span>';
  }
  return '<div class="k-pager">' +
    '<button class="k-pager-btn" id="page-prev" aria-label="Previous"' + (page === 0 ? ' disabled' : '') + '>' + ICONS.chevronLeft + '</button>' +
    mid +
    '<button class="k-pager-btn" id="page-next" aria-label="Next"' + (page >= n - 1 && !more ? ' disabled' : '') + '>' + ICONS.chevronRight + '</button>' +
    '</div>';
}

function fetchNextPage(btn) {
  if (!state || !state.page_tool || !state.next_args || btn.disabled) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="k-spin"></span>';
  window.kolbo.callTool(state.page_tool, state.next_args).then(function (res) {
    var sc = structured(res);
    var next = sc ? listPayload(sc) || sc : null;
    var more = (next && next.items) || [];
    if ((res && res.isError) || !next) {
      btn.disabled = false;
      btn.innerHTML = ICONS.chevronRight;
      btn.title = 'Could not load more — try again';
      return;
    }
    if (!more.length) { state.next_args = undefined; render(); return; }
    state.items = state.items.concat(more);
    state.next_args = sc.next_args;
    if (sc.total != null) state.total = sc.total;
    page = page + 1;
    render();
  }).catch(function () { btn.disabled = false; btn.innerHTML = ICONS.chevronRight; });
}

function apply(result) {
  if (!result) return false;
  var inner = result.result || result;
  return boot(inner.structuredContent || structured(inner) || inner);
}

function itemHTML(item) {
  var i = state.items.indexOf(item);
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
  var stage = el('stage');
  bindPeekHits(stage);
  Array.prototype.forEach.call(stage.querySelectorAll('[data-open]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      window.kolbo.openLink(state.items[+b.getAttribute('data-open')].open_url);
    };
  });
  Array.prototype.forEach.call(stage.querySelectorAll('.k-audio-row'), function (row) {
    var item = state.items[+row.getAttribute('data-i')];
    if (!item || !item.id) return;
    row.onclick = function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-open],[data-peek]')) return;
      window.kolbo.insertText(String(item.id));
    };
  });
  Array.prototype.forEach.call(stage.querySelectorAll('[data-page]'), function (d) {
    d.onclick = function () { var p = +d.getAttribute('data-page'); if (p !== page) { page = p; render(); } };
  });
  var prev = el('page-prev');
  if (prev) prev.onclick = function () { if (page > 0) { page--; render(); } };
  var next = el('page-next');
  if (next) next.onclick = function () {
    if (page < pageCount() - 1) { page++; render(); return; }
    fetchNextPage(next);
  };
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
