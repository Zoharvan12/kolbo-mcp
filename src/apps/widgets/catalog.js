'use strict';

const { widgetPage } = require('../html');

/**
 * Model catalog widget — list_models.
 *
 * structuredContent: {
 *   widget: 'catalog', title,
 *   groups: [{ name: 'Video Generation', models: [{ name, icon, description,
 *     chips: ['5–12s', '4K', 'audio'], use_hint }] }]
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
  <div class="k-body" id="stage"><div class="k-empty">Loading…</div></div>
  <div class="k-footer"><span>Powered by <a href="#" id="kolbo-link">Kolbo.AI</a></span></div>
</div>
`;

const SCRIPT = `
el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink('https://app.kolbo.ai'); };
var state = null;

function boot(sc) {
  if (!sc || !sc.groups) return;
  state = sc;
  el('title').textContent = sc.title || 'AI Models';
  var total = sc.groups.reduce(function (n, g) { return n + g.models.length; }, 0);
  el('count-chip').style.display = '';
  el('count-chip').textContent = total + ' models';
  el('stage').innerHTML = sc.groups.map(function (g, gi) {
    return '<div style="margin-bottom:14px">' +
      '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">' + esc(g.name) + '</div>' +
      g.models.map(function (m, mi) {
        return '<div class="k-audio-row" data-g="' + gi + '" data-m="' + mi + '" style="cursor:pointer">' +
          (m.icon ? '<img class="k-audio-art" style="width:32px;height:32px" src="' + esc(m.icon) + '" onerror="this.outerHTML=monogram(\\'' + esc(m.name).replace(/'/g, '') + '\\')">'
                  : '<span style="flex:none">' + monogram(m.name) + '</span>') +
          '<div class="k-audio-meta"><div class="k-audio-title">' + esc(m.name) + '</div>' +
          (m.description ? '<div class="k-audio-sub">' + esc(m.description) + '</div>' : '') + '</div>' +
          '<div style="display:flex;gap:4px;flex:none">' + (m.chips || []).slice(0, 3).map(function (c) {
            return '<span class="k-chip">' + esc(c) + '</span>';
          }).join('') + '</div></div>';
      }).join('') + '</div>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('[data-g]'), function (row) {
    row.onclick = function () {
      var m = state.groups[+row.getAttribute('data-g')].models[+row.getAttribute('data-m')];
      window.kolbo.sendMessage(m.use_hint || ('Generate something with the "' + m.name + '" model — ask me what I want to make.'));
    };
  });
  window.kolbo.notifySize();
}

window.kolbo.onToolResult(function (result) {
  var sc = result.structuredContent || structured(result);
  if (sc) boot(sc);
});
`;

function catalogWidgetHtml() {
  return widgetPage({ title: 'Kolbo Models', body: BODY, script: SCRIPT });
}

module.exports = { catalogWidgetHtml };
