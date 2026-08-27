'use strict';

const assert = require('assert');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createServer, TOOL_WIDGETS } = require('../src');
const { WIDGET_CSP } = require('../src/apps');
const { TOOL_ANNOTATIONS } = require('../src/toolAnnotations');

const REQUIRED_HINTS = ['readOnlyHint', 'openWorldHint', 'destructiveHint'];

async function main() {
  const server = createServer({ apiKey: 'submission-contract-test', apps: true });
  const registeredNames = Object.keys(server._registeredTools).sort();
  const contractNames = Object.keys(TOOL_ANNOTATIONS).sort();
  assert.deepStrictEqual(contractNames, registeredNames, 'annotation contract must exactly match registered tools');

  for (const name of registeredNames) {
    const annotations = server._registeredTools[name].annotations;
    assert.ok(annotations, `${name}: annotations missing`);
    assert.deepStrictEqual(Object.keys(annotations).sort(), [...REQUIRED_HINTS].sort(), `${name}: unexpected annotation keys`);
    for (const hint of REQUIRED_HINTS) {
      assert.strictEqual(typeof annotations[hint], 'boolean', `${name}.${hint} must be boolean`);
    }
  }

  const staleWidgets = Object.keys(TOOL_WIDGETS).filter((name) => !server._registeredTools[name]);
  assert.deepStrictEqual(staleWidgets, [], `stale widget mappings: ${staleWidgets.join(', ')}`);

  const cspDomains = [...WIDGET_CSP.resourceDomains, ...WIDGET_CSP.connectDomains, ...(WIDGET_CSP.frameDomains || [])];
  assert.ok(cspDomains.every((domain) => !domain.includes('*')), 'widget CSP must not use wildcard domains');
  assert.ok(cspDomains.every((domain) => !/(dev|staging)/i.test(new URL(domain).hostname)), 'widget CSP must be production-only');
  assert.deepStrictEqual(WIDGET_CSP.connectDomains, ['https://api.kolbo.ai'], 'only the production MCP upload host may receive widget connections');
  assert.deepStrictEqual(WIDGET_CSP.frameDomains, ['https://app.kolbo.ai'], 'plans widget may iframe only the production app');

  // Exercise the real protocol serialization path. Internal registrations can
  // look correct while tools/list drops a property during SDK conversion.
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'kolbo-submission-contract', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    assert.strictEqual(listed.tools.length, registeredNames.length, 'tools/list count differs from registration count');
    for (const tool of listed.tools) {
      assert.deepStrictEqual(tool.annotations, TOOL_ANNOTATIONS[tool.name], `${tool.name}: protocol annotations differ`);
    }
  } finally {
    await client.close();
    await server.close();
  }

  const missingOutputSchemas = registeredNames.filter((name) => !server._registeredTools[name].outputSchema);
  console.log(`[submission-contract] ${registeredNames.length} tools carry exact safety annotations.`);
  console.log(`[submission-contract] ${Object.keys(TOOL_WIDGETS).length} widget mappings are current; CSP is exact and production-only.`);
  console.log(`[submission-contract] Warning: ${missingOutputSchemas.length} tools omit outputSchema (non-blocking; documented for review).`);
}

main().catch((error) => {
  console.error(`[submission-contract] FAILED: ${error.stack || error.message}`);
  process.exit(1);
});
