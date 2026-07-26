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
 *     badge,                      // small pill, e.g. role/status ("owner", "default", "shared")
 *     meta,                       // small trailing text, e.g. a date or count
 *     open_url,                   // optional — renders an "Open" button (openLink)
 *     use_hint                    // optional — row becomes clickable, sends this on click
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
  if (!sc || !sc.items) return;
  state = sc;
  el('title').textContent = sc.title || 'List';
  var total = sc.total != null ? sc.total : sc.items.length;
  el('count-chip').style.display = '';
  el('count-chip').textContent = total + (total === 1 ? ' item' : ' items');
  if (!sc.items.length) { el('stage').innerHTML = '<div class="k-empty">Nothing here yet</div>'; return; }
  el('stage').innerHTML = sc.items.slice(0, 40).map(itemHTML).join('');
  el('stage').classList.remove('k-empty');
  wire();
  window.kolbo.notifySize();
}

function itemHTML(item, i) {
  var clickable = !!item.use_hint;
  return '<div class="k-audio-row" data-i="' + i + '"' + (clickable ? ' style="cursor:pointer"' : '') + '>' +
    monogram(item.title || '?') +
    '<div class="k-audio-meta"><div class="k-audio-title">' + esc(item.title || '') + '</div>' +
    (item.subtitle ? '<div class="k-audio-sub">' + esc(item.subtitle) + '</div>' : '') + '</div>' +
    (item.badge ? '<span class="k-chip" style="flex:none">' + esc(item.badge) + '</span>' : '') +
    (item.meta ? '<span style="flex:none;font-size:10.5px;color:var(--text-faint)">' + esc(item.meta) + '</span>' : '') +
    (item.open_url ? '<button class="k-btn" data-open="' + i + '">Open</button>' : '') +
    '</div>';
}

function wire() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      window.kolbo.openLink(state.items[+b.getAttribute('data-open')].open_url);
    };
  });
  Array.prototype.forEach.call(document.querySelectorAll('.k-audio-row'), function (row) {
    var item = state.items[+row.getAttribute('data-i')];
    if (!item || !item.use_hint) return;
    row.onclick = function () {
      var msg = item.use_hint.replace('{TITLE}', item.title || '').replace('{ID}', item.id || '');
      window.kolbo.sendMessage(msg);
    };
  });
}

window.kolbo.onToolResult(function (result) {
  var sc = result.structuredContent || structured(result);
  if (sc && sc.items) return boot(sc);
  var card = document.querySelector('.k-card');
  if (card) card.style.display = 'none';
  window.kolbo.notifySize();
});
`;

function listWidgetHtml() {
  return widgetPage({ title: 'Kolbo List', body: BODY, script: SCRIPT });
}

module.exports = { listWidgetHtml };
