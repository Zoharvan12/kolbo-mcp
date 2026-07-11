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
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function el(id) { return document.getElementById(id); }
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
