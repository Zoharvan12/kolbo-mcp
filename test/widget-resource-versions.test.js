const test = require('node:test');
const assert = require('node:assert/strict');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { registerApps, UI, versionedUri } = require('../src/apps');

test('widget resources preserve old version addresses without broadening allowed paths', async () => {
  const server = new McpServer({ name: 'widget-test', version: '1.0' });
  registerApps(server);
  const client = new Client({ name: 'widget-test-client', version: '1.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const listed = (await client.listResources()).resources.map(r => r.uri);
    for (const uri of Object.values(UI)) {
      assert.ok(listed.includes(uri), uri);
      assert.ok(listed.includes(versionedUri(uri)), uri);
      const current = await client.readResource({ uri: versionedUri(uri) });
      for (const address of [uri, uri + '?v=0123456789', uri + '?v=abcdefabcd']) {
        const result = await client.readResource({ uri: address });
        assert.equal(result.contents[0].uri, address);
        assert.equal(result.contents[0].text, current.contents[0].text);
        assert.equal(result.contents[0].mimeType, current.contents[0].mimeType);
        assert.deepEqual(result.contents[0]._meta, current.contents[0]._meta);
      }
    }
    for (const uri of [
      'ui://kolbo/unknown.html?v=0123456789',
      'ui://other/generation.html?v=0123456789',
      'ui://kolbo/generation.html?v=invalid',
      'ui://kolbo/generation.html?v=0123456789&extra=1',
      'ui://kolbo/generation.html?v=0123456789#fragment',
      'ui://kolbo/generation.html?v=0123456789&v=abcdefabcd',
    ]) {
      await assert.rejects(client.readResource({ uri }), undefined, uri);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
