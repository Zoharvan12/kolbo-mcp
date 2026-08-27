'use strict';

const { widgetPage } = require('../html');

/**
 * Plans / upgrade widget — shown by `show_plans`, and by any generation the
 * server refused for credits.
 *
 * The live pricing UI lives on app.kolbo.ai. This card iframes
 * `/pricing/embed` (same PlanList / PricingCard as the site) so a price or
 * perk change does not require an MCP republish. Buy/Subscribe on that page
 * open https://app.kolbo.ai/pricing in a new tab — Stripe and the user's
 * session must not run inside a third-party host iframe.
 *
 * structuredContent contract:
 * {
 *   widget: 'plans',
 *   reason: 'insufficient_credits' | 'requested',
 *   balance, required, shortfall,     // when reason === 'insufficient_credits'
 *   current_plan: { key, name },
 *   plans:        [{ key, name, interval, credits, price, original_price,
 *                    discount_percent, promo_text, currency, top_up_discount }],
 *   credit_packs: [{ …, subscriber_price, is_subscriber }],
 *   pricing_url
 * }
 */

const BODY = `
<div class="k-card" id="card">
  <div class="k-head">
    <span class="k-logo" id="logo"></span>
    <span class="k-title" id="tool-title">Plans</span>
    <span class="k-spacer"></span>
    <span class="k-chip" id="balance-chip" style="display:none"></span>
  </div>
  <div class="k-body">
    <div class="k-error" id="notice" style="display:none"></div>
    <div id="stage"></div>
    <div class="k-actions" id="actions"></div>
  </div>
  <div class="k-footer">
    <span>Powered by <a href="#" id="kolbo-link">Kolbo.AI</a></span>
  </div>
</div>
`;

const SCRIPT = `
var state = null;
var PRICING_EMBED = 'https://app.kolbo.ai/pricing/embed';

el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink('https://app.kolbo.ai'); };

function pricingUrl() {
  return (state && state.pricing_url) || 'https://app.kolbo.ai/pricing';
}

function boot(sc) {
  if (!sc) return;
  state = sc;
  el('tool-title').textContent = sc.reason === 'insufficient_credits' ? 'Out of credits' : 'Plans';

  if (sc.balance != null) {
    var chip = el('balance-chip');
    chip.style.display = '';
    chip.innerHTML = ICONS.sparkle + ' ' + esc(String(sc.balance)) + ' credits left';
  }

  if (sc.reason === 'insufficient_credits') {
    var need = sc.shortfall != null ? sc.shortfall
      : (sc.required != null && sc.balance != null ? Math.max(0, sc.required - sc.balance) : null);
    el('notice').style.display = '';
    el('notice').innerHTML = ICONS.warn + ' ' +
      esc(need ? ('That generation needs ' + need + ' more credit' + (need === 1 ? '' : 's') + '.')
               : 'That generation needs more credits than you have left.');
  }

  el('stage').innerHTML = '<iframe class="k-pricing-frame" src="' + PRICING_EMBED +
    '" title="Kolbo plans" referrerpolicy="no-referrer-when-downgrade"></iframe>';
  var frame = el('stage').querySelector('iframe');
  if (frame) frame.onload = function () { window.kolbo.notifySize(); };
  renderActions();
  window.kolbo.notifySize();
}

function renderActions() {
  el('actions').innerHTML =
    '<button class="k-btn ghost" id="btn-pricing">See all plans ' + ICONS.open + '</button>';
  el('btn-pricing').onclick = function () { window.kolbo.openLink(pricingUrl()); };
}

window.kolbo.onToolResult(function (result) {
  var sc = result.structuredContent || structured(result);
  if (sc) boot(sc);
});
window.kolbo.onToolInput(function () {
  if (state) return;
  el('stage').innerHTML = '<div class="k-skel square" style="min-height:240px"></div>';
  window.kolbo.notifySize();
});
window.kolbo.ready(function (ctx) {
  var info = ctx && ctx.toolInfo;
  if (state || !info) return;
  var raw = info.result && (info.result.structuredContent || structured(info.result));
  if (raw) boot(raw);
});
`;

function plansWidgetHtml() {
  return widgetPage({ title: 'Kolbo Plans', body: BODY, script: SCRIPT });
}

module.exports = { plansWidgetHtml };
