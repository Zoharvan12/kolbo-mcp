'use strict';

const { widgetPage } = require('../html');

/**
 * Plans / upgrade widget — shown by `show_plans`, and by any generation the
 * server refused for credits.
 *
 * The buttons deep-link to app.kolbo.ai/pricing rather than a payment session:
 * promo pricing, tax, currency and saved payment methods live there, and a
 * checkout link minted on the API-key surface would drift from them the first
 * time a campaign changes. The prices below ARE the live promo-adjusted
 * numbers from /v1/account/plans, so the card never quotes a stale figure.
 *
 * structuredContent contract:
 * {
 *   widget: 'plans',
 *   reason: 'insufficient_credits' | 'requested',
 *   balance, required, shortfall,     // when reason === 'insufficient_credits'
 *   current_plan: { key, name },
 *   plans:        [{ key, name, interval, credits, price, original_price,
 *                    discount_percent, promo_text, currency }],
 *   credit_packs: [ same shape ],
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
    <div class="k-plan-toggle" id="toggle" style="display:none">
      <button type="button" class="k-toggle-btn" data-interval="month">Monthly</button>
      <button type="button" class="k-toggle-btn" data-interval="year">Annual</button>
    </div>
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
var interval = 'year';   // annual first — it is the better per-credit deal

el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink('https://app.kolbo.ai'); };

function pricingUrl() {
  return (state && state.pricing_url) || 'https://app.kolbo.ai/pricing';
}
function money(amount, currency) {
  if (amount == null) return '';
  var sym = String(currency || 'usd').toLowerCase() === 'usd' ? '$' : '';
  var n = Math.round(Number(amount) * 100) / 100;
  return sym + n + (sym ? '' : ' ' + String(currency || '').toUpperCase());
}
function perMonthNote(plan) {
  if (plan.interval !== 'year' || plan.price == null) return '';
  var monthly = Math.round((Number(plan.price) / 12) * 100) / 100;
  return money(monthly, plan.currency) + '/mo, billed annually';
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

  var plans = Array.isArray(sc.plans) ? sc.plans : [];
  var intervals = {};
  plans.forEach(function (p) { if (p.interval) intervals[p.interval] = true; });
  if (intervals.month && intervals.year) {
    el('toggle').style.display = '';
    if (!intervals[interval]) interval = intervals.year ? 'year' : 'month';
  } else {
    interval = intervals.year ? 'year' : 'month';
  }
  wireToggle();
  render();
  window.kolbo.notifySize();
}

function wireToggle() {
  Array.prototype.forEach.call(document.querySelectorAll('.k-toggle-btn'), function (b) {
    b.onclick = function () { interval = b.getAttribute('data-interval'); render(); window.kolbo.notifySize(); };
  });
}

function render() {
  Array.prototype.forEach.call(document.querySelectorAll('.k-toggle-btn'), function (b) {
    b.classList.toggle('active', b.getAttribute('data-interval') === interval);
  });

  var plans = (state.plans || []).filter(function (p) { return p.interval === interval; });
  // Cheapest first so the ladder reads left-to-right. A zero-price plan is not
  // an upgrade path, so it never takes a card slot.
  plans = plans.filter(function (p) { return Number(p.price) > 0; });
  plans.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });

  var current = state.current_plan && state.current_plan.key;
  var html = plans.length
    ? '<div class="k-plan-grid">' + plans.map(function (p) { return planCard(p, current); }).join('') + '</div>'
    : '<div class="k-empty">Plan details are on the pricing page</div>';

  var packs = (state.credit_packs || []).filter(function (p) { return Number(p.price) > 0; });
  if (packs.length) {
    packs.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
    html += '<div class="k-pack-head">One-time credit packs</div>' +
      packs.slice(0, 4).map(function (p) {
        return '<div class="k-audio-row k-pack-row"><div class="k-audio-meta">' +
          '<div class="k-audio-title">' + esc(p.name || '') + '</div>' +
          (p.credits != null ? '<div class="k-audio-sub">' + esc(String(p.credits)) + ' credits</div>' : '') +
          '</div><span class="k-chip">' + esc(money(p.price, p.currency)) + '</span></div>';
      }).join('');
  }

  el('stage').innerHTML = html;
  Array.prototype.forEach.call(el('stage').querySelectorAll('[data-buy]'), function (b) {
    b.onclick = function () { window.kolbo.openLink(pricingUrl()); };
  });
  renderActions();
}

function planCard(p, currentKey) {
  var isCurrent = currentKey && p.key === currentKey;
  var badges = '';
  if (p.discount_percent) badges += '<span class="k-plan-badge">' + esc(String(p.discount_percent)) + '% OFF</span>';
  if (isCurrent) badges += '<span class="k-plan-badge current">Current</span>';

  var price = '<span class="k-plan-price">' + esc(money(p.price, p.currency)) + '</span>';
  if (p.original_price && p.original_price > p.price) {
    price = '<span class="k-plan-was">' + esc(money(p.original_price, p.currency)) + '</span> ' + price;
  }
  var note = perMonthNote(p);

  return '<div class="k-plan' + (isCurrent ? ' current' : '') + '">' +
    '<div class="k-plan-top"><span class="k-plan-name">' + esc(p.name || p.key || '') + '</span>' + badges + '</div>' +
    (p.credits != null
      ? '<div class="k-plan-credits">' + ICONS.sparkle + ' ' + esc(String(p.credits)) + ' credits' +
        (p.interval === 'month' ? '/mo' : p.interval === 'year' ? '/yr' : '') + '</div>'
      : '') +
    '<div class="k-plan-pricing">' + price + '</div>' +
    (note ? '<div class="k-plan-note">' + esc(note) + '</div>' : '') +
    (p.promo_text ? '<div class="k-plan-note">' + esc(p.promo_text) + '</div>' : '') +
    (isCurrent
      ? '<button class="k-btn" disabled>Your plan</button>'
      : '<button class="k-btn primary" data-buy="' + esc(p.key || '') + '">Get ' + esc(p.name || 'plan') + '</button>') +
    '</div>';
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
  el('stage').innerHTML = '<div class="k-gen-grid n2"><div class="k-skel square" style="min-height:120px"></div>'
    + '<div class="k-skel square" style="min-height:120px"></div></div>';
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
