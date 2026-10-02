'use strict';

const { BRIDGE_JS } = require('./bridge');
const { KOLBO_CSS, KOLBO_LOGO_SVG, KOLBO_LOGO_IMG } = require('./theme');

/**
 * Assemble a self-contained widget page. No build step — each widget module
 * provides a body skeleton + its script; we wrap with theme, bridge, and the
 * shared runtime helpers (theme sync, escaping, chips, formatting).
 */
function widgetPage({ title, body, script }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<style>${KOLBO_CSS}</style>
</head>
<body>
${body}
<script>${BRIDGE_JS}</script>
<script>
// ---- shared widget runtime ----
var KOLBO_LOGO_FALLBACK = ${JSON.stringify(KOLBO_LOGO_SVG)};
var KOLBO_LOGO = ${JSON.stringify(KOLBO_LOGO_IMG)};
// ---- shared inline SVG icon set (currentColor, 1em; replaces emoji so glyphs
// render identically in every host iframe instead of tofu boxes) ----
function _svg(inner, o) {
  o = o || {};
  var f = o.fill ? o.fill : 'none';
  var s = o.fill ? 'none' : 'currentColor';
  return '<svg class="k-ic" viewBox="0 0 24 24" width="1em" height="1em" fill="' + f + '" stroke="' + s +
    '" stroke-width="' + (o.w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
}
var ICONS = {
  upload: _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
  download: _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  play: _svg('<path d="M8 5v14l11-7z"/>', { fill: 'currentColor', w: 1 }),
  pause: _svg('<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>', { fill: 'currentColor', w: 1 }),
  check: _svg('<path d="M20 6 9 17l-5-5"/>', { w: 2.4 }),
  x: _svg('<path d="M18 6 6 18M6 6l12 12"/>', { w: 2.4 }),
  warn: _svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  retry: _svg('<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>'),
  edit: _svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  open: _svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>'),
  arrowRight: _svg('<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>'),
  sparkle: _svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10z"/>', { fill: 'currentColor', w: 1 }),
  clock: _svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  sound: _svg('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>'),
  mic: _svg('<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10a7 7 0 0 1-14 0"/><path d="M12 19v3"/>'),
  image: _svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
  video: _svg('<path d="M23 7l-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
  audio: _svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  document: _svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/>'),
  cube: _svg('<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
  file: _svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  copy: _svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  chevronDown: _svg('<path d="M6 9l6 6 6-6"/>'),
  chevronLeft: _svg('<path d="M15 18l-6-6 6-6"/>'),
  chevronRight: _svg('<path d="M9 18l6-6-6-6"/>'),
  chevronUp: _svg('<path d="M18 15l-6-6-6 6"/>'),
  expand: _svg('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>')
};
// Media-kind → icon (accepts model kind / media_type strings).
function kindIcon(kind) {
  switch (String(kind || '').toLowerCase()) {
    case 'image': return ICONS.image;
    case 'video': return ICONS.video;
    case 'audio': case 'music': case 'sound': case 'speech': return ICONS.audio;
    case 'document': case 'doc': return ICONS.document;
    case '3d': case 'three_d': case 'model': return ICONS.cube;
    default: return ICONS.file;
  }
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function el(id) { return document.getElementById(id); }
// Force-download via the api.kolbo.ai proxy (CDN files open inline otherwise —
// browsers display images/videos instead of saving them).
function downloadUrl(u) {
  if (!u) return u;
  return 'https://api.kolbo.ai/mcp/download?url=' + encodeURIComponent(u);
}
// Copy from a sandboxed widget iframe. Order: Clipboard API (Kolbo Code
// grants clipboard-write) → execCommand → host ui/copy-text (parent clipboard).
function writeClipboard(text) {
  text = String(text || '');
  function fallback() {
    if (!document.body) return false;
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }
  function host() {
    if (!window.kolbo || !window.kolbo.copyText) return Promise.resolve(false);
    return window.kolbo.copyText(text).then(function () { return true; }).catch(function () { return false; });
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
      return fallback() ? Promise.resolve(true) : host();
    });
  }
  if (fallback()) return Promise.resolve(true);
  return host();
}
function fmtCredits(n) { return (n == null) ? '' : (Math.round(n * 100) / 100) + ' cr'; }
function fmtDur(s) { if (s == null) return ''; s = Math.round(s); return s >= 60 ? Math.floor(s/60) + 'm ' + (s%60) + 's' : s + 's'; }
function applyTheme(ctx) {
  try {
    var theme = ctx && (ctx.theme || (ctx.styles && ctx.styles.theme));
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else if (theme === 'dark') document.documentElement.removeAttribute('data-theme');
  } catch (e) {}
}
window.kolbo.ready(function (ctx) { applyTheme(ctx); window.kolbo.notifySize(); });
// The header mark is the way into the app (the footer link is no longer shown).
document.addEventListener('click', function (e) {
  if (e.target && e.target.closest && e.target.closest('#logo')) window.kolbo.openLink('https://app.kolbo.ai');
});
window.kolbo.onThemeChange(applyTheme);

// Model chip: real icon when the API provided one, brand monogram fallback.
function modelChipHTML(name, iconUrl) {
  if (!name) return '';
  var inner = iconUrl
    ? '<img src="' + esc(iconUrl) + '" onerror="this.outerHTML=monogram(\\'' + esc(name).replace(/'/g, '') + '\\')" alt="">'
    : monogram(name);
  return '<span class="k-chip brand">' + inner + esc(name) + '</span>';
}
function monogram(name) {
  var ch = String(name || '').replace(/^[@#]+/, '').trim().charAt(0) || '?';
  return '<span class="k-mono-icon">' + esc(ch.toUpperCase()) + '</span>';
}
// In-widget lightbox — every card (generation results, chips, media grid, list
// rows) opens media here. It shows inside the card at once, then asks the host
// for fullscreen: granted, it fills the host viewport; refused or unanswered,
// the in-card popup still works (a click never depends on the host answering).
// Any [data-peek] node opens it through ONE delegated listener, and the
// lightbox pages through the other [data-peek] items in the same #stage.
function ensurePeek() {
  if (el('peek')) return el('peek');
  var card = document.querySelector('.k-card') || document.body;
  var box = document.createElement('div');
  box.id = 'peek';
  box.className = 'k-peek';
  box.hidden = true;
  box.innerHTML = '<div class="k-peek-bar"><span class="k-peek-cap" id="peek-cap"></span>'
    + '<span class="k-peek-count" id="peek-count"></span>'
    + '<button type="button" class="k-peek-btn" id="peek-dl" aria-label="Download"></button>'
    + '<button type="button" class="k-peek-btn" id="peek-close" aria-label="Close"></button></div>'
    + '<div class="k-peek-stage" id="peek-stage"><img id="peek-img" alt="">'
    // nofullscreen: host iframes are never granted allow="fullscreen", so the
    // native button is always greyed out. The lightbox IS the fullscreen view.
    + '<video id="peek-video" playsinline controls controlslist="nofullscreen"></video></div>'
    + '<div class="k-peek-strip" id="peek-strip" hidden></div>'
    + '<button type="button" class="k-peek-nav prev" id="peek-prev" aria-label="Previous"></button>'
    + '<button type="button" class="k-peek-nav next" id="peek-next" aria-label="Next"></button>';
  card.appendChild(box);
  el('peek-close').innerHTML = ICONS.x;
  el('peek-dl').innerHTML = ICONS.download;
  el('peek-prev').innerHTML = ICONS.chevronLeft;
  el('peek-next').innerHTML = ICONS.chevronRight;
  el('peek-close').onclick = function (e) { e.stopPropagation(); closePeek(); };
  el('peek-prev').onclick = function (e) { e.stopPropagation(); stepPeek(-1); };
  el('peek-next').onclick = function (e) { e.stopPropagation(); stepPeek(1); };
  el('peek-dl').onclick = function (e) {
    e.stopPropagation();
    var it = peekList[peekIndex];
    if (it) window.kolbo.openLink(downloadUrl(it.dl || it.url));
  };
  box.onclick = function (e) { if (e.target === box || e.target === el('peek-stage')) closePeek(); };
  // Touch hosts have no arrow keys: a horizontal swipe pages.
  var x0 = null;
  box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', function (e) {
    if (x0 == null) return;
    var dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) stepPeek(dx < 0 ? 1 : -1);
  }, { passive: true });
  return box;
}
function peekAttrs(url, kind, cap) {
  if (!url) return '';
  return ' data-peek="' + esc(url) + '" data-peek-kind="' + esc(kind || 'image') + '" data-peek-cap="' + esc(cap || '') + '"';
}
function peekItem(node) {
  return {
    url: node.getAttribute('data-peek'),
    kind: node.getAttribute('data-peek-kind') || 'image',
    cap: node.getAttribute('data-peek-cap') || '',
    dl: node.getAttribute('data-peek-dl') || ''
  };
}
document.addEventListener('click', function (e) {
  var node = e.target && e.target.closest && e.target.closest('[data-peek]');
  if (!node || node.closest('#peek')) return;
  // A control INSIDE a previewable tile (download, use, a player) keeps its own job.
  var ctl = e.target.closest('button, a, audio, video[controls]');
  if (ctl && ctl !== node && node.contains(ctl)) return;
  e.preventDefault();
  e.stopPropagation();
  var scope = node.closest('#stage') || node.parentNode;
  var seen = {};
  var list = [];
  Array.prototype.forEach.call(scope.querySelectorAll('[data-peek]'), function (n) {
    var it = peekItem(n);
    if (!it.url || seen[it.url]) return;
    seen[it.url] = 1;
    list.push(it);
  });
  var at = peekItem(node);
  openPeek(at.url, at.kind, at.cap, { list: list, time: +node.getAttribute('data-peek-time') || 0 });
}, true);
var peekList = [];
var peekIndex = 0;
// Whether THIS peek took the iframe fullscreen — only then does closing it
// hand the display mode back.
var peekWentFullscreen = false;
function showPeekItem(time) {
  var it = peekList[peekIndex];
  var img = el('peek-img');
  var vid = el('peek-video');
  if (it.kind === 'video') {
    img.removeAttribute('src');
    vid.setAttribute('src', it.url);
    if (time) vid.addEventListener('loadedmetadata', function () { try { vid.currentTime = time; } catch (e) {} }, { once: true });
    var p = vid.play && vid.play();
    if (p && p.catch) p.catch(function () {});
  } else {
    try { vid.pause(); } catch (e) {}
    vid.removeAttribute('src');
    img.setAttribute('src', it.url);
  }
  el('peek-cap').textContent = it.cap || '';
  var many = peekList.length > 1;
  el('peek-count').textContent = many ? (peekIndex + 1) + ' / ' + peekList.length : '';
  el('peek-prev').hidden = !many;
  el('peek-next').hidden = !many;
  var strip = el('peek-strip');
  strip.hidden = !many;
  Array.prototype.forEach.call(strip.children, function (t, i) {
    t.classList.toggle('on', i === peekIndex);
    if (i === peekIndex && t.scrollIntoView) { try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
  });
}
// Filmstrip under the lightbox: every item in the set, current one outlined.
function buildPeekStrip() {
  var strip = el('peek-strip');
  strip.innerHTML = peekList.length > 1 ? peekList.map(function (it, i) {
    var inner = it.kind === 'video'
      ? '<video src="' + esc(it.url) + '#t=0.1" muted playsinline preload="metadata"></video>'
      : it.kind === 'image' ? '<img src="' + esc(it.url) + '" alt="" loading="lazy">' : kindIcon(it.kind);
    return '<button type="button" class="k-peek-thumb" data-strip="' + i + '" aria-label="Item ' + (i + 1) + '">' + inner + '</button>';
  }).join('') : '';
  Array.prototype.forEach.call(strip.children, function (t) {
    t.onclick = function (e) { e.stopPropagation(); peekIndex = +t.getAttribute('data-strip'); showPeekItem(0); };
  });
}
function stepPeek(d) {
  var box = el('peek');
  if (!box || box.hidden || peekList.length < 2) return;
  peekIndex = (peekIndex + d + peekList.length) % peekList.length;
  showPeekItem(0);
}
function openPeek(url, kind, cap, opts) {
  if (!url) return;
  opts = opts || {};
  var box = ensurePeek();
  peekList = [{ url: url, kind: kind || 'image', cap: cap || '' }];
  peekIndex = 0;
  (opts.list || []).forEach(function (it, i) { if (it.url === url) { peekList = opts.list; peekIndex = i; } });
  // Pause inline players so two soundtracks never overlap.
  Array.prototype.forEach.call(document.querySelectorAll('video'), function (v) {
    if (v.id !== 'peek-video') { try { v.pause(); } catch (e) {} }
  });
  buildPeekStrip();
  showPeekItem(opts.time || 0);
  box.hidden = false;
  document.documentElement.classList.add('k-peek-open');
  if (window.kolbo && window.kolbo.notifySize) window.kolbo.notifySize();
  if (peekWentFullscreen || !window.kolbo || !window.kolbo.requestDisplayMode) return;
  try {
    window.kolbo.requestDisplayMode('fullscreen').then(function (res) {
      if (!(res && res.mode === 'fullscreen')) return;
      // Closed before the host answered — hand the grant straight back.
      if (box.hidden) { window.kolbo.requestDisplayMode('inline').catch(function () {}); return; }
      peekWentFullscreen = true;
      document.documentElement.classList.add('k-peek-fs');
      if (window.kolbo.setFullscreen) window.kolbo.setFullscreen(true);
    }).catch(function () {});
  } catch (e) {}
}
function closePeek(hostExited) {
  var box = el('peek');
  if (!box || box.hidden) return;
  box.hidden = true;
  document.documentElement.classList.remove('k-peek-open');
  el('peek-img').removeAttribute('src');
  el('peek-strip').innerHTML = '';
  var vid = el('peek-video');
  if (vid) { try { vid.pause(); } catch (e) {} vid.removeAttribute('src'); }
  if (peekWentFullscreen) {
    peekWentFullscreen = false;
    document.documentElement.classList.remove('k-peek-fs');
    if (hostExited !== true) { try { window.kolbo.requestDisplayMode('inline').catch(function () {}); } catch (e) {} }
    if (window.kolbo.setFullscreen) window.kolbo.setFullscreen(false);
  }
  if (window.kolbo && window.kolbo.notifySize) window.kolbo.notifySize();
}
// The host's own exit control (claude.ai's fullscreen X / Esc) drops the card
// back to inline without asking us — close the lightbox along with it.
window.kolbo.onThemeChange(function (ctx) {
  if (peekWentFullscreen && ctx && ctx.displayMode && ctx.displayMode !== 'fullscreen') closePeek(true);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closePeek();
  else if (e.key === 'ArrowLeft') stepPeek(-1);
  else if (e.key === 'ArrowRight') stepPeek(1);
});
// Every inline <video controls> gets an Expand button (and double-click) that
// opens the lightbox at the current time; the native fullscreen button is
// hidden because the host iframe can never honour it. A MutationObserver
// covers every render path (results, batch/status grids, scenes, media-grid
// play swap) with no per-widget wiring.
function wireVideoExpand(root) {
  if (!root || !root.querySelectorAll) return;
  var vids = root.tagName === 'VIDEO' ? [root] : root.querySelectorAll('video[controls]');
  Array.prototype.forEach.call(vids, function (v) {
    if (v.id === 'peek-video' || !v.controls || v.getAttribute('data-expand') || !v.parentNode) return;
    var src = v.getAttribute('src');
    if (!src) return;
    v.setAttribute('data-expand', '1');
    v.setAttribute('controlslist', 'nofullscreen');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'k-vexpand';
    b.title = 'Expand';
    b.setAttribute('aria-label', 'Expand video');
    b.innerHTML = ICONS.expand;
    b.setAttribute('data-peek', src);
    b.setAttribute('data-peek-kind', 'video');
    var holder = v.parentNode.closest && v.parentNode.closest('[title]');
    if (holder) b.setAttribute('data-peek-cap', holder.getAttribute('title'));
    // Resume where the inline player was.
    function mark() { b.setAttribute('data-peek-time', String(v.currentTime || 0)); }
    b.addEventListener('pointerdown', mark);
    b.addEventListener('keydown', mark);
    v.addEventListener('dblclick', function (e) { e.preventDefault(); mark(); b.click(); });
    v.parentNode.insertBefore(b, v.nextSibling);
  });
}
if (window.MutationObserver) {
  new MutationObserver(function (muts) {
    muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, wireVideoExpand); });
  }).observe(document.documentElement, { childList: true, subtree: true });
}
// Pull structuredContent out of a tools/call result (host bridge shape).
function structured(res) {
  if (!res) return null;
  if (res.structuredContent) return res.structuredContent;
  if (res.result) return structured(res.result);
  try {
    var t = (res.content || []).filter(function (c) { return c.type === 'text'; })[0];
    return t ? JSON.parse(t.text) : null;
  } catch (e) { return null; }
}
// Hosts that do not advertise MCP Apps (Kolbo Code) get plain JSON
// ({ sessions }, { generations }, { projects }, …) with no items[].
// Normalize those shapes so list.html and the generation fallback can
// leave Loading on first paint without waiting for a newer host.
function listPayload(sc) {
  if (!sc || typeof sc !== 'object') return null;
  if (sc.widget && sc.widget !== 'list') return null;
  if (sc.phase || sc.generation_id || sc.generation_ids) return null;
  if (Array.isArray(sc.items)) {
    return {
      widget: 'list',
      title: sc.title || 'List',
      items: sc.items,
      total: sc.total != null ? sc.total : sc.items.length
    };
  }
  var key = sc.sessions ? 'sessions' : sc.projects ? 'projects' : sc.generations ? 'generations'
    : sc.agents ? 'agents' : sc.docs ? 'docs' : sc.folders ? 'folders' : sc.sources ? 'sources' : '';
  var rows = key ? sc[key] : null;
  if (!Array.isArray(rows)) return null;
  var titles = {
    sessions: 'Sessions', projects: 'Projects', generations: 'Generations',
    agents: 'Agents', docs: 'Docs', folders: 'Folders', sources: 'Knowledge Base'
  };
  return {
    widget: 'list',
    title: sc.title || titles[key] || 'List',
    items: rows.map(function (row) {
      var types = Array.isArray(row.types)
        ? row.types.filter(function (x) { return typeof x === 'string'; })
        : String(row.type || '').split('|').filter(Boolean);
      var id = row.session_id || row.id || row.generation_id || row.file_key;
      var name = row.name || row.title || (row.prompt ? String(row.prompt).slice(0, 80) : '') || types[0] || 'Item';
      return {
        id: id,
        title: name,
        subtitle: [
          types.join(', ') || row.role || row.status || row.description,
          id,
          row.project_id ? 'project ' + row.project_id : null,
          row.updated_at ? String(row.updated_at).slice(0, 10) : null,
          row.output_count ? row.output_count + ' outputs' : null
        ].filter(Boolean).join(' · '),
        badge: types[0] || row.role || row.status,
        open_url: row.open_url || row.share_url || null,
        meta: row.item_count != null ? String(row.item_count) : undefined
      };
    }),
    total: sc.total != null ? sc.total : (sc.count != null ? sc.count : rows.length)
  };
}
</script>
<script>${script}</script>
</body>
</html>`;
}

module.exports = { widgetPage };
