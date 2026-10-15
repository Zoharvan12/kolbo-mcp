const test = require('node:test');
const assert = require('node:assert/strict');
const { withUpgradeEntry } = require('../src/tools/models');

test('show_plans pricing link tells the app which surface started the purchase', () => {
  assert.equal(withUpgradeEntry('https://app.kolbo.ai/pricing', 'mcp_plans_card'),
    'https://app.kolbo.ai/pricing?upgrade_entry=mcp_plans_card');
  assert.equal(withUpgradeEntry('https://app.kolbo.ai/pricing?category=one_time', 'mcp_plans_card'),
    'https://app.kolbo.ai/pricing?category=one_time&upgrade_entry=mcp_plans_card');
  assert.equal(withUpgradeEntry('https://app.kolbo.ai/pricing?upgrade_entry=email_promo', 'mcp_plans_card'),
    'https://app.kolbo.ai/pricing?upgrade_entry=email_promo');
  assert.equal(withUpgradeEntry('not a url', 'mcp_plans_card'), 'not a url');
});
