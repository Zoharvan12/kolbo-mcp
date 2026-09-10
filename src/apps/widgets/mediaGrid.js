'use strict';

const { widgetPage } = require('../html');

/**
 * Media grid widget — media library, stock search, presets, voices, moodboards,
 * visual DNAs, music library.
 *
 * Layout: a contact sheet, not a list. One PAGE of square tiles at a time with
 * a pager underneath, so the card keeps a constant height no matter how many
 * results there are. Forward past the last loaded page still goes through the
 * server's own paging contract (page_tool + next_args) — the pages already
 * fetched just stay in state so Back is instant.
 *
 * structuredContent contract:
 * {
 *   widget: 'media-grid',
 *   title: 'Stock Search — "rain on window"',
 *   items: [{
 *     id, title, subtitle, thumbnail, media_type: 'image'|'video'|'audio'|'3d',
 *     url,                 // full asset / playback URL
 *     preview_audio,       // audio preview URL (voices, music)
 *     use_hint             // unused — Use pastes `id` into the composer
 *   }],
 *   total, has_more,
 *   page_tool, next_args,  // paging contract — the server names its own args
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
var page = 0;

function isAudio(item) { return item && item.media_type === 'audio'; }
// Audio comes down as full-width rows (a name + a player), so half a dozen of
// those already fill the card where a dozen square tiles do.
function pageSize() {
  var items = (state && state.items) || [];
  var audio = items.filter(isAudio).length;
  return audio > items.length / 2 ? 6 : 12;
}
function pageCount() { return Math.max(1, Math.ceil(((state && state.items) || []).length / pageSize())); }
// Only a tool that told us HOW to page can go past what is already loaded.
// Every other grid used to render a Load more that did nothing.
function hasMore() {
  if (!state) return false;
  var shown = (state.items || []).length;
  var flagged = typeof state.has_next === 'boolean' ? state.has_next : (state.total != null && state.total > shown);
  return !!(flagged && state.page_tool && (state.next_args || state.query || state.page));
}

function boot(sc) {
  if (!sc || !sc.items) return;
  state = sc;
  page = 0;
  el('title').textContent = sc.title || 'Library';
  if (sc.total != null && sc.total >= 0) { el('count-chip').style.display = ''; el('count-chip').textContent = sc.total + ' results'; }
  else { el('count-chip').style.display = 'none'; }
  render();
}

function render() {
  var items = (state && state.items) || [];
  if (!items.length) {
    el('stage').classList.add('k-empty');
    el('stage').innerHTML = 'No results';
    window.kolbo.notifySize();
    return;
  }
  var size = pageSize();
  if (page > pageCount() - 1) page = pageCount() - 1;
  var slice = items.slice(page * size, page * size + size);
  var visual = slice.filter(function (i) { return !isAudio(i); });
  var audio = slice.filter(isAudio);
  var h = '';
  if (visual.length) h += '<div class="k-grid">' + visual.map(tileHTML).join('') + '</div>';
  if (audio.length) h += '<div' + (visual.length ? ' style="margin-top:8px"' : '') + '>' + audio.map(audioRowHTML).join('') + '</div>';
  h += pagerHTML();
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
    // A dimmed trailing dot says "there is more behind Next" without claiming
    // to know how much — the server only ever promises the NEXT page.
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

function tileHTML(item) {
  var idx = state.items.indexOf(item);
  var isVideo = item.media_type === 'video' && item.url;
  // onerror matters: a thumbnail that 404s / expires / can't be fetched by the
  // host webview left a BLACK tile with no glyph and no label hint — visually
  // identical to "corrupted media". Fall back to the same kind icon a
  // thumbnail-less item gets, so a dead URL degrades instead of looking broken.
  // outerHTML, not parentNode.innerHTML: the parent is now the whole tile, and
  // wiping it would take the caption and the Use/Download buttons with it.
  var fallback = '<div class="k-tile-fb">' + kindIcon(item.media_type) + '</div>';
  var peekUrl = item.url || item.thumbnail;
  var media = item.thumbnail
    ? '<img class="k-peek-hit" src="' + esc(item.thumbnail) + '" loading="lazy" alt=""'
      + peekAttrs(peekUrl, item.media_type === 'video' ? 'video' : 'image', item.title)
      + ' onerror="this.outerHTML=this.getAttribute(\\'data-fb\\')" data-fb="' + esc(fallback) + '">'
    : fallback;
  var cap = (item.title || item.subtitle)
    ? '<div class="k-tile-cap">' +
      (item.title ? '<div class="k-tile-t">' + esc(item.title) + '</div>' : '') +
      (item.subtitle ? '<div class="k-tile-s">' + esc(item.subtitle) + '</div>' : '') +
      '</div>'
    : '';
  // Clicking the tile sends the id, but nothing on a bare thumbnail signals
  // that — the explicit buttons keep the affordance visible (and on touch
  // hosts CSS keeps them permanently on, since there is no hover there).
  var acts = '<div class="k-tile-acts">' +
    '<button class="k-tile-act" data-use="' + idx + '" title="Use" aria-label="Use">' + ICONS.arrowRight + '</button>' +
    (item.url ? '<button class="k-tile-act" data-dl="' + esc(item.url) + '" title="Download" aria-label="Download">' + ICONS.download + '</button>' : '') +
    '</div>';
  return '<div class="k-tile" data-i="' + idx + '" title="' + esc(item.title || '') + '">' + media +
    (isVideo ? '<button class="k-play k-tile-play" data-video-play="' + esc(item.url) + '">' + ICONS.play + '</button>' : '') +
    cap + acts + '</div>';
}

function audioRowHTML(item) {
  var idx = state.items.indexOf(item);
  var src = item.preview_audio || item.url;
  // Same onerror contract as tileHTML, and for the same reason: a thumbnail the
  // host cannot fetch (CSP, 404, expired) otherwise renders the browser's
  // broken-image glyph. this.outerHTML, NOT this.parentNode.innerHTML: here the
  // <img> IS the art and its parent is the whole row, so wiping the parent would
  // erase the title, subtitle, Use button and player along with it.
  var artFallback = '<div class="k-audio-art k-audio-art-fallback">' + kindIcon('audio') + '</div>';
  return '<div class="k-audio-row k-generated-audio" data-i="' + idx + '">' +
    (item.thumbnail
      ? '<img class="k-audio-art k-peek-hit" src="' + esc(item.thumbnail) + '" alt=""'
        + peekAttrs(item.thumbnail, 'image', item.title)
        + ' onerror="this.outerHTML=this.getAttribute(\\'data-fb\\')" data-fb="' + esc(artFallback) + '">'
      : artFallback) +
    '<div class="k-audio-meta"><div class="k-audio-title">' + esc(item.title || '') + '</div>' +
    '<div class="k-audio-sub">' + esc(item.subtitle || '') + '</div></div>' +
    '<button class="k-btn" data-use="' + idx + '">Use</button>' +
    (src ? '<audio class="k-audio-player" src="' + esc(src) + '" controls preload="none" aria-label="Play ' + esc(item.title || '') + '"></audio>' : '') +
    '</div>';
}

function wire() {
  var stage = el('stage');
  bindPeekHits(stage);
  Array.prototype.forEach.call(stage.querySelectorAll('.k-tile, .k-audio-row'), function (c) {
    c.onclick = function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-peek],[data-use],[data-dl],[data-video-play]')) return;
      useItem(+c.getAttribute('data-i'));
    };
  });
  Array.prototype.forEach.call(stage.querySelectorAll('[data-use]'), function (b) {
    b.onclick = function (e) { e.stopPropagation(); useItem(+b.getAttribute('data-use')); };
  });
  Array.prototype.forEach.call(stage.querySelectorAll('.k-tile-act[data-dl]'), function (b) {
    b.onclick = function (e) { e.stopPropagation(); window.kolbo.openLink(downloadUrl(b.getAttribute('data-dl'))); };
  });
  Array.prototype.forEach.call(stage.querySelectorAll('[data-page]'), function (d) {
    d.onclick = function () { var p = +d.getAttribute('data-page'); if (p !== page) { page = p; render(); } };
  });
  // Native <audio controls> already gives play/pause + a seek bar + duration;
  // just stop clicks on it from bubbling up to the row's "Use" handler, and
  // pause any other preview when a new one starts.
  var players = stage.querySelectorAll('.k-audio-player');
  Array.prototype.forEach.call(players, function (player) {
    player.onclick = function (e) { e.stopPropagation(); };
    player.addEventListener('play', function () {
      Array.prototype.forEach.call(players, function (other) { if (other !== player) other.pause(); });
    });
  });
  // Video tiles stay a static thumbnail until the play overlay is clicked, then
  // swap the <img> for a native <video controls>. Replace only the image — the
  // caption goes because the control bar lands in exactly that strip.
  Array.prototype.forEach.call(stage.querySelectorAll('[data-video-play]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      var tile = b.parentNode;
      var v = document.createElement('video');
      v.src = b.getAttribute('data-video-play');
      v.controls = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute('style', 'width:100%;height:100%;object-fit:contain;background:#000');
      v.onclick = function (ev) { ev.stopPropagation(); };
      var img = tile.querySelector('img');
      if (img) tile.replaceChild(v, img); else tile.insertBefore(v, tile.firstChild);
      var cap = tile.querySelector('.k-tile-cap');
      if (cap && cap.parentNode) cap.parentNode.removeChild(cap);
      if (b.parentNode) b.parentNode.removeChild(b);
    };
  });
  var prev = el('page-prev');
  if (prev) prev.onclick = function () { if (page > 0) { page--; render(); } };
  var next = el('page-next');
  if (next) next.onclick = function () {
    if (page < pageCount() - 1) { page++; render(); return; }
    fetchNextPage(next);
  };
}

// Fetch the next page IN the widget and append it.
//
// This used to sendMessage() a request for "the next page of this same media
// search", on the stated belief that a widget has no way to invoke a tool. It
// does — window.kolbo.callTool, the same bridge call every generation card
// polls status with. And the message could not have worked anyway: the payload
// carried no page number and none of the filters, so the model had nothing to
// reconstruct the query from and would re-run page 1 or something else.
function fetchNextPage(btn) {
  if (!state || !state.page_tool || btn.disabled) return;
  var nextPage = (state.page || 1) + 1;
  btn.disabled = true;
  btn.innerHTML = '<span class="k-spin"></span>';
  // The server knows its own paging arg names (page/limit, offset, cursor…):
  // when it shipped next_args, send exactly that. The query+page shape is the
  // legacy fallback list_media has always used.
  var args = {};
  if (state.next_args) {
    for (var nk in state.next_args) { if (state.next_args[nk] !== undefined && state.next_args[nk] !== null) args[nk] = state.next_args[nk]; }
  } else {
    var q = state.query || {};
    for (var k in q) { if (q[k] !== undefined && q[k] !== null && q[k] !== '') args[k] = q[k]; }
    args.page = nextPage;
    if (state.page_size) args.page_size = state.page_size;
  }

  window.kolbo.callTool(state.page_tool, args).then(function (res) {
    var sc = structured(res);
    if (res && res.isError) {
      btn.disabled = false;
      btn.innerHTML = ICONS.chevronRight;
      btn.title = 'Could not load more — try again';
      return;
    }
    var more = (sc && sc.items) || [];
    if (!more.length) {
      // Nothing came back: retire the control rather than leaving a Next that
      // still looks like it has pages behind it.
      state.has_next = false;
      state.next_args = undefined;
      render();
      return;
    }
    state.items = (state.items || []).concat(more);
    state.page = (sc && sc.page) || nextPage;
    // The next page's args come from THIS response; none means this was the last page.
    state.next_args = sc && sc.next_args;
    if (sc && sc.total != null && sc.total >= 0) state.total = sc.total;
    state.has_next = sc && typeof sc.has_next === 'boolean' ? sc.has_next : undefined;
    page = page + 1;
    render();
  }).catch(function () {
    btn.disabled = false;
    btn.innerHTML = ICONS.chevronRight;
  });
}

function useItem(i) {
  var item = state.items[i];
  if (!item || !item.id) return;
  window.kolbo.insertText(String(item.id));
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
