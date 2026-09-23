const test = require('node:test');
const assert = require('node:assert/strict');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { registerModelTools } = require('../src/tools/models');
const { UI, attachToolWidgetMeta, versionedUri } = require('../src/apps');

test('check_credits preserves text and provides complete balance data to widget hosts', async () => {
  const credits = { total: 12.75, plan_credits: 0, credit_pack: 12, redemption: 0.75 };
  const client = { get: async (path) => {
    assert.equal(path, '/v1/account/credits');
    return { credits };
  } };
  const results = [];
  for (const apps of [false, true]) {
    const server = new McpServer({ name: 'credits-test', version: '1.0' });
    registerModelTools(server, client, { apps });
    attachToolWidgetMeta(server);
    const tool = server._registeredTools.check_credits;
    assert.ok(JSON.stringify(tool).includes('credits.html'));
    results.push(await tool.handler({}));
    await server.close();
  }
  assert.deepEqual(results[0], { content: [{ type: 'text', text: 'Credit Balance:\n- Total: 12.75\n- Plan credits: 0\n- Credit pack: 12\n- Redemption: 0.75' }] });
  assert.deepEqual(results[1].content, results[0].content);
  assert.deepEqual(results[1].structuredContent.credits, credits);
  assert.equal(results[1]._meta['ui/resourceUri'], versionedUri(UI.credits));
});
