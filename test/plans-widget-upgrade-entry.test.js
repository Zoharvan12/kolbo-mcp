const test = require('node:test');
const assert = require('node:assert/strict');
const { plansWidgetHtml } = require('../src/apps/widgets/plans');

const src = plansWidgetHtml().match(/function pricingUrl\(\) \{[\s\S]*?\r?\n\}/)[0];
const pricingUrl = (state) => new Function('state', src + '\nreturn pricingUrl();')(state);

test('plans card links tell the app which card started the purchase', () => {
  assert.equal(pricingUrl(null), 'https://app.kolbo.ai/pricing?upgrade_entry=mcp_plans_card');
  assert.equal(pricingUrl({ reason: 'requested' }), 'https://app.kolbo.ai/pricing?upgrade_entry=mcp_plans_card');
  assert.equal(pricingUrl({ reason: 'insufficient_credits', pricing_url: 'https://app.kolbo.ai/pricing?tab=packs' }),
    'https://app.kolbo.ai/pricing?tab=packs&upgrade_entry=mcp_out_of_credits_card');
  assert.equal(pricingUrl({ pricing_url: 'https://app.kolbo.ai/pricing?upgrade_entry=email_promo' }),
    'https://app.kolbo.ai/pricing?upgrade_entry=email_promo');
  assert.equal(pricingUrl({ pricing_url: 'not a url' }), 'not a url');
});
