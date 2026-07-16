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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
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
  file: _svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>')
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
  return '<span class="k-mono-icon">' + esc(String(name).trim().charAt(0).toUpperCase()) + '</span>';
}
// Pull structuredContent out of a tools/call result (host bridge shape).
function structured(res) {
  if (!res) return null;
  if (res.structuredContent) return res.structuredContent;
  try {
    var t = (res.content || []).filter(function (c) { return c.type === 'text'; })[0];
    return t ? JSON.parse(t.text) : null;
  } catch (e) { return null; }
}
</script>
<script>${script}</script>
</body>
</html>`;
}

module.exports = { widgetPage };
