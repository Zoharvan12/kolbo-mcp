const test = require('node:test');
const assert = require('node:assert');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createServer } = require('../src/index.js');

test('renamed tools: old names are callable but not listed', async () => {
  const server = createServer({ apiKey: 'kolbo_live_test', apiBase: 'http://127.0.0.1:9/api' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(b);

  const names = (await client.listTools()).tools.map(t => t.name);
  assert.ok(names.includes('image_tools') && names.includes('synci_search'));
  assert.ok(!names.includes('edit_image') && !names.includes('search_music_library'));

  // An unknown name fails with "not found"; an alias reaches the real tool,
  // which then fails on argument validation instead.
  const unknown = await client.callTool({ name: 'no_such_tool', arguments: {} }).catch(e => ({ isError: true, content: [{ text: e.message }] }));
  assert.match(JSON.stringify(unknown), /not found/i);
  const old = await client.callTool({ name: 'edit_image', arguments: {} }).catch(e => ({ isError: true, content: [{ text: e.message }] }));
  assert.doesNotMatch(JSON.stringify(old), /not found/i);
  assert.equal(server._registeredTools.edit_image, server._registeredTools.image_tools);

  await client.close();
});
