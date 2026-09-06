'use strict';

const { widgetPage } = require('../html');

/**
 * Plans / upgrade widget — shown by `show_plans`, and by any generation the
 * server refused for credits.
 *
 * Rendered NATIVELY from structuredContent. It used to iframe
 * app.kolbo.ai/pricing/embed, which needs `frameDomains` in the widget CSP —
 * OpenAI rejected the ChatGPT app for exactly that on 2026-09-06 ("frameDomains
 * is reserved for limited cases where embedding a third-party experience is
 * essential"). Prices here are the live, promo-adjusted numbers the server
 * fetched from /v1/account/plans at call time; Buy/Subscribe open
 * https://app.kolbo.ai/pricing in a new tab — Stripe and the user's session
 * never run inside a host iframe.
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
var interval = 'month';

el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('kolbo-link').onclick = function (e) { e.preventDefault(); window.kolbo.openLink('https://app.kolbo.ai'); };

function pricingUrl() {
  return (state && state.pricing_url) || 'https://app.kolbo.ai/pricing';
}
function money(v, currency) {
  if (v == null || isNaN(v)) return '';
  var sym = { usd: '$', eur: '\u20ac', gbp: '\u00a3', ils: '\u20aa' }[String(currency || 'usd').toLowerCase()] || '';
  var n = Number(v);
  return sym + (Math.round(n) === n ? String(n) : n.toFixed(2));
}
function fmtCredits(n) { return n == null ? '' : Number(n).toLocaleString('en-US'); }
function isAnnual(p) { return /^(year|annual|yearly)/i.test(String(p.interval || '')); }

function planCard(p, opts) {
  var current = state.current_plan && ((state.current_plan.key && state.current_plan.key === p.key) || (state.current_plan.name && state.current_plan.name === p.name));
  var pricing = '<div class="k-plan-pricing"><span class="k-plan-price">' + esc(money(p.price, p.currency)) + '</span>' +
    (p.original_price != null && p.original_price !== p.price ? '<span class="k-plan-was">' + esc(money(p.original_price, p.currency)) + '</span>' : '') +
    (opts.pack ? '' : '<span class="k-plan-note">/ ' + (isAnnual(p) ? 'year' : 'month') + '</span>') + '</div>';
  var badge = current ? '<span class="k-plan-badge current">Current plan</span>'
    : (p.discount_percent ? '<span class="k-plan-badge">' + esc(String(p.discount_percent)) + '% off</span>' : '');
  var note = p.promo_text ? '<div class="k-plan-note">' + esc(p.promo_text) + '</div>'
    : (opts.pack && p.is_subscriber && p.subscriber_price != null ? '<div class="k-plan-note">Subscriber price applied</div>' : '')
      + (!opts.pack && p.top_up_discount ? '<div class="k-plan-note">Cheaper credit packs included</div>' : '');
  var cta = current ? '' : '<button class="k-btn ' + (opts.pack ? 'ghost' : 'primary') + '" data-open="1">' + (opts.pack ? 'Buy pack' : 'Upgrade') + ' ' + ICONS.open + '</button>';
  return '<div class="k-plan' + (current ? ' current' : '') + '">' +
    '<div class="k-plan-top"><span class="k-plan-name">' + esc(p.name || p.key || 'Plan') + '</span>' + badge + '</div>' +
    (p.credits != null ? '<div class="k-plan-credits">' + ICONS.sparkle + ' ' + esc(fmtCredits(p.credits)) + ' credits' + (opts.pack ? '' : ' / ' + (isAnnual(p) ? 'year' : 'month')) + '</div>' : '') +
    pricing + note + cta + '</div>';
}

function renderStage() {
  var plans = (state.plans || []).filter(function (p) { return p && (p.price != null || p.credits != null); });
  var packs = (state.credit_packs || []).filter(function (p) { return p && p.price != null; });
  var monthly = plans.filter(function (p) { return !isAnnual(p); });
  var annual = plans.filter(isAnnual);
  var hasToggle = monthly.length && annual.length;
  var shown = hasToggle ? (interval === 'year' ? annual : monthly) : plans;
  var html = '';
  if (hasToggle) {
    html += '<div class="k-plan-toggle">' +
      '<button class="k-toggle-btn' + (interval === 'month' ? ' active' : '') + '" data-interval="month">Monthly</button>' +
      '<button class="k-toggle-btn' + (interval === 'year' ? ' active' : '') + '" data-interval="year">Annual</button></div>';
  }
  if (shown.length) html += '<div class="k-plan-grid">' + shown.map(function (p) { return planCard(p, {}); }).join('') + '</div>';
  if (packs.length) {
    html += '<div class="k-pack-head">Credit packs</div><div class="k-plan-grid">' +
      packs.map(function (p) { return planCard(p, { pack: true }); }).join('') + '</div>';
  }
  if (!html) html = '<div class="k-plan-note">Live plans and prices are on the Kolbo pricing page.</div>';
  el('stage').innerHTML = html;
  var btns = el('stage').querySelectorAll('[data-interval]');
  for (var i = 0; i < btns.length; i++) btns[i].onclick = function () { interval = this.getAttribute('data-interval'); renderStage(); window.kolbo.notifySize(); };
  var opens = el('stage').querySelectorAll('[data-open]');
  for (var j = 0; j < opens.length; j++) opens[j].onclick = function () { window.kolbo.openLink(pricingUrl()); };
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

  renderStage();
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
