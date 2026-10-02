'use strict';

const { widgetPage } = require('../html');

const BODY = `
<style>
#loading[hidden], #balance[hidden], #error[hidden], #breakdown[hidden] { display: none !important; }
/* One line by default. Agents check the balance at session start and before
   big batches; a full-height balance card each time buried the chat. */
.k-credit-line { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.k-credit-total { font-size: 22px; font-weight: 650; letter-spacing: -0.5px; line-height: 1.2;
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.k-credit-label { color: var(--text-muted); font-size: 12px; }
.k-credit-line .k-text-btn { margin-left: auto; align-self: center; }
.k-credit-breakdown { margin: 10px 0 0; padding: 0; }
.k-credit-row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-top: 1px solid var(--border); font-size: 12.5px; }
.k-credit-row dt { color: var(--text-muted); }
.k-credit-row dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; text-align: right; }
</style>
<div class="k-card">
  <div class="k-head"><span class="k-logo" id="logo"></span><span class="k-title">Credits</span></div>
  <div class="k-body" aria-live="polite">
    <div id="loading" class="k-skel" style="min-height:0;height:28px" aria-label="Loading credit balance"></div>
    <div id="balance" hidden>
      <div class="k-credit-line">
        <span class="k-credit-total" id="total"></span>
        <span class="k-credit-label">available</span>
        <button type="button" class="k-text-btn" id="toggle" aria-expanded="false" aria-controls="breakdown">Details</button>
      </div>
      <dl class="k-credit-breakdown" id="breakdown" hidden>
        <div class="k-credit-row"><dt>Plan credits</dt><dd id="plan"></dd></div>
        <div class="k-credit-row"><dt>Credit pack</dt><dd id="pack"></dd></div>
        <div class="k-credit-row"><dt>Redemption</dt><dd id="redemption"></dd></div>
      </dl>
    </div>
    <div id="error" class="k-error" hidden>Credit balance unavailable. Please check again.</div>
  </div>
</div>`;

const SCRIPT = `
el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('toggle').onclick = function () {
  var open = el('breakdown').hidden;
  el('breakdown').hidden = !open;
  el('toggle').setAttribute('aria-expanded', String(open));
  el('toggle').textContent = open ? 'Hide' : 'Details';
  window.kolbo.notifySize();
};
function amount(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '\u2014';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 8 });
}
function render(result) {
  var sc = result.structuredContent || structured(result);
  var credits = sc && sc.credits;
  el('loading').hidden = true;
  el('error').hidden = !!credits && !result.isError;
  el('balance').hidden = !credits || !!result.isError;
  if (credits && !result.isError) {
    el('total').textContent = amount(credits.total);
    el('plan').textContent = amount(credits.plan_credits);
    el('pack').textContent = amount(credits.credit_pack);
    el('redemption').textContent = amount(credits.redemption);
  }
  window.kolbo.notifySize();
}
window.kolbo.onToolResult(render);
window.kolbo.ready(function (ctx) {
  if (ctx && ctx.toolInfo && ctx.toolInfo.result) render(ctx.toolInfo.result);
});
`;

function creditsWidgetHtml() {
  return widgetPage({ title: 'Kolbo Credit Balance', body: BODY, script: SCRIPT });
}

module.exports = { creditsWidgetHtml };
