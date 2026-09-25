'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { z } = require('zod');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createServer } = require('../src');
const { registerFlowTools } = require('../src/tools/flow');
const { operation, initialGraph, config } = require('../src/tools/flow-schema');
const contract = require('../src/tools/flow-contract.json');
const { TOOL_ANNOTATIONS } = require('../src/toolAnnotations');

function harness(response = { status: true, data: { flow_session_id: 'flow', revision: '2', operation_id: 'receipt' } }) {
  const tools = new Map(), requests = [];
  const client = Object.fromEntries(['get','post','patch'].map(method => [method, async (url, body) => {
    requests.push({ method, url, body }); return response;
  }]));
  registerFlowTools({ tool(name, description, schema, handler) { tools.set(name, { description, schema, handler }); } }, client);
  return { tools, requests };
}
const write = { flow_session_id: 'flow', expected_revision: '1', idempotency_key: 'same-request' };

test('all 27 registered node defaults and each typed operation parse without losing exact text', () => {
  assert.equal(contract.node_types.length, 27);
  for (const type of contract.node_types) {
    const fields = { label: type, config: contract.defaults[type] };
    assert.deepEqual(operation.parse({ op: 'node.add', node_id: type, type, fields }).fields, fields);
    config.parse(fields.config);
  }
  const operations = [
    { op: 'node.update', node_id: 'assistant', fields: { prompt: 'שלום\nsecond line\n', config: { systemPrompt: '' } }, unset: ['moodboardId'] },
    { op: 'node.remove', node_id: 'old' },
    { op: 'nodes.duplicate', node_ids: ['a','b'], offset: { x: -12, y: 80 } },
    { op: 'edge.add', edge_id: 'e', source: 'a', target: 'b', source_handle: 'text-output', target_handle: 'text-input' },
    { op: 'edge.update', edge_id: 'e', fields: { targetHandle: 'image-input', label: '' } },
    { op: 'edge.remove', edge_id: 'e' },
    { op: 'input.reorder', node_id: 'a', handle: 'image-input', edge_ids: ['e2','e1'] },
    { op: 'group.create', node_id: 'g', node_ids: ['a'] },
    { op: 'group.update', node_id: 'g', fields: { groupColor: '#123456' } },
    { op: 'group.set_members', node_id: 'g', node_ids: [] },
    { op: 'group.remove', node_id: 'g' },
    { op: 'layout.apply', node_ids: ['a'] },
    { op: 'session.update', fields: { instructions: '', isPinned: false } },
    { op: 'output.select', node_id: 'a', run_id: 'run', index: 0 },
  ];
  operations.forEach(value => assert.deepEqual(operation.parse(value), value));
});

test('reject arbitrary mutation operators, identity/runtime fields, unknown config and unsafe shapes', () => {
  for (const value of [
    { op: '$set', fields: { user_id: 'other' } },
    { op: 'node.update', node_id: 'a', fields: { id: 'replacement' } },
    { op: 'node.update', node_id: 'a', fields: { status: 'completed', result: { url: 'fake' } } },
    { op: 'node.update', node_id: 'a', fields: { config: { systemPrompt: 123 } } },
    { op: 'node.update', node_id: 'a', fields: { config: { arbitrary: true } } },
    { op: 'node.update', node_id: 'a', fields: { config: { referenceImages: [{ url: 'https://media.kolbo.ai/a.png', user_id: 'other' }] } } },
    { op: 'node.update', node_id: 'a', fields: {}, unset: ['position'] },
    { op: 'node.add', node_id: '../a', type: 'assistant' },
    { op: 'node.add', type: 'unregistered-node' },
    { op: 'output.select', node_id: 'a', run_id: 'r', index: -1 },
  ]) assert.equal(operation.safeParse(value).success, false, JSON.stringify(value));
  assert.equal(initialGraph.safeParse({ nodes: [], edges: [], user_id: 'other' }).success, false);
});

test('Flow tools use revisioned REST requests, preserve explicit empty/false values, and return compact receipts', async () => {
  const { tools, requests } = harness({ status: true, data: { flow_session_id: 'flow', revision: '2', operation_id: 'receipt', flow_data: { nodes: [{ data: { runs: ['large'] } }], edges: [] } } });
  assert.equal(tools.size, 17);
  const body = { ...write, operations: [{ op: 'node.update', node_id: 'assistant', fields: { prompt: '', config: { systemPrompt: 'שלום\nExactly.\n' } } }], dry_run: false };
  const out = await tools.get('update_flow_session').handler(body);
  assert.deepEqual(requests[0], { method: 'patch', url: '/v1/flows/flow', body: { expected_revision: '1', idempotency_key: 'same-request', operations: body.operations, dry_run: false } });
  assert.deepEqual(JSON.parse(out.content[0].text), { flow_session_id: 'flow', revision: '2', operation_id: 'receipt', graph_summary: { node_count: 1, edge_count: 0 } });
  await tools.get('update_flow_session').handler(body);
  assert.deepEqual(requests[1], requests[0], 'replays preserve request key and body');
  await assert.rejects(tools.get('update_flow_session').handler({ ...body, user_id: 'injected' }));
  await assert.rejects(tools.get('run_flow_session').handler({ ...write, max_credits: -1 }));
  await assert.rejects(tools.get('create_flow_session').handler({ name: 'No destination', idempotency_key: 'k' }));
});

test('list and targeted reads are bounded and encode IDs/query without dropping false flags', async () => {
  const { tools, requests } = harness();
  await tools.get('get_flow_schema').handler({ node_type: 'assistant' });
  await tools.get('list_flow_sessions').handler({ project_id: 'p', search: 'שם & name', include_archived: false, include_trashed: false, limit: 10, offset: 0 });
  await tools.get('get_flow_session').handler({ flow_session_id: 'a/b', node_ids: ['a','b'], include_history: false });
  assert.equal(requests[0].url, '/v1/flows/schema?node_type=assistant');
  assert.equal(requests[1].url, '/v1/flows?project_id=p&search=%D7%A9%D7%9D+%26+name&include_archived=false&include_trashed=false&limit=10&offset=0');
  assert.equal(requests[2].url, '/v1/flows/a%2Fb?node_ids=a%2Cb&include_history=false');
  await assert.rejects(tools.get('list_flow_sessions').handler({ project_id: 'p', limit: 101 }));
});

test('lifecycle and run tools bind exact session/run and retain budgets/idempotency', async () => {
  const { tools, requests } = harness();
  const scenarios = [
    ['create_flow_session', { project_id: 'p', name: 'New', idempotency_key: 'create-request', flow_data: { nodes: [], edges: [] } }, 'post', '/v1/flows'],
    ['validate_flow_session', { flow_session_id: 'flow' }, 'post', '/v1/flows/flow/validate'],
    ['duplicate_flow_session', { flow_session_id: 'flow', project_id: 'other', idempotency_key: 'copy-request' }, 'post', '/v1/flows/flow/duplicate'],
    ['undo_flow_edit', { ...write, operation_id: 'edit' }, 'post', '/v1/flows/flow/undo'],
    ['move_flow_session', { ...write, project_id: 'other' }, 'post', '/v1/flows/flow/move'],
    ['trash_flow_session', write, 'post', '/v1/flows/flow/trash'],
    ['restore_flow_session', write, 'post', '/v1/flows/flow/restore'],
    ['estimate_flow_run', { flow_session_id: 'flow', expected_revision: '1', scope: 'selected', node_ids: ['n'] }, 'post', '/v1/flows/flow/estimate'],
    ['run_flow_session', { ...write, max_credits: 0, scope: 'all' }, 'post', '/v1/flows/flow/runs'],
    ['get_flow_run', { flow_session_id: 'flow', run_id: 'run/a' }, 'get', '/v1/flows/flow/runs/run%2Fa'],
    ['list_flow_runs', { flow_session_id: 'flow', limit: 3, offset: 0 }, 'get', '/v1/flows/flow/runs?limit=3&offset=0'],
    ['cancel_flow_run', { flow_session_id: 'flow', run_id: 'r', idempotency_key: 'cancel-request' }, 'post', '/v1/flows/flow/runs/r/cancel'],
    ['retry_flow_run', { ...write, run_id: 'r', max_credits: 12.5, node_ids: ['failed-node'] }, 'post', '/v1/flows/flow/runs/r/retry'],
  ];
  for (const [name, args, method, url] of scenarios) {
    await tools.get(name).handler(args);
    const request = requests.at(-1);
    assert.equal(request.method, method, name);
    assert.equal(request.url, url, name);
    if (method !== 'get') {
      const { flow_session_id, run_id, ...body } = args;
      assert.deepEqual(request.body, body, name);
    }
  }
});

test('API failures never masquerade as saved receipts', async () => {
  const { tools } = harness({ status: false, code: 'REVISION_CONFLICT', message: 'Refresh the graph' });
  const out = await tools.get('update_flow_session').handler({ ...write, operations: [{ op: 'node.remove', node_id: 'a' }] });
  assert.equal(out.isError, true);
  assert.equal(JSON.parse(out.content[0].text).code, 'REVISION_CONFLICT');
});

test('real MCP discovery/calls cross HTTP client with bounded schemas, annotations and exact text', async t => {
  const requests = [];
  const api = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: true, data: { flow_session_id: 'flow', revision: '2', operation_id: 'saved' } }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => api.close(resolve)));
  const server = createServer({ apiKey: 'flow-test', apiBase: `http://127.0.0.1:${api.address().port}/api`, apps: false });
  const mcp = new Client({ name: 'flow-contract-test', version: '1.0.0' });
  const [a,b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), mcp.connect(b)]);
  t.after(async () => { await mcp.close(); await server.close(); });
  const listed = await mcp.listTools();
  const flows = listed.tools.filter(tool => tool.name.includes('_flow_') || tool.name === 'get_flow_schema');
  assert.equal(flows.length, 17);
  for (const tool of flows) {
    assert.deepEqual(tool.annotations, TOOL_ANNOTATIONS[tool.name]);
    assert.equal(tool.inputSchema.type, 'object');
  }
  assert.equal(TOOL_ANNOTATIONS.update_flow_session.readOnlyHint, false);
  assert.equal(TOOL_ANNOTATIONS.run_flow_session.destructiveHint, true);
  assert.equal(TOOL_ANNOTATIONS.estimate_flow_run.readOnlyHint, true);
  const args = { ...write, operations: [{ op: 'node.update', node_id: 'n', fields: { prompt: '', config: { systemPrompt: 'שלום\nLine 2' } } }] };
  const out = await mcp.callTool({ name: 'update_flow_session', arguments: args });
  assert.equal(out.isError, undefined);
  assert.equal(JSON.parse(out.content[0].text).operation_id, 'saved');
  assert.equal(requests[0].url, '/api/v1/flows/flow');
  assert.equal(requests[0].body.operations[0].fields.config.systemPrompt, 'שלום\nLine 2');
  const invalid = await mcp.callTool({ name: 'update_flow_session', arguments: { ...args, operations: [{ op: 'node.update', node_id: 'n', fields: { user_id: 'other' } }] } });
  assert.equal(invalid.isError, true);
  assert.equal(requests.length, 1, 'invalid fields never reach the API');
});

test('retry accepts bounded failed-node selection and rejects foreign run options', async () => {
  const { tools, requests } = harness();
  const args = { ...write, run_id: 'r', max_credits: 10, node_ids: ['failed-node'] };
  await tools.get('retry_flow_run').handler(args);
  assert.deepEqual(requests[0].body.node_ids, ['failed-node']);
  for (const patch of [{ node_ids: [] }, { node_ids: Array(501).fill('node') }, { node_ids: ['bad/node'] }, { scope: 'all' }, { prerequisites: 'run_missing' }]) {
    await assert.rejects(tools.get('retry_flow_run').handler({ ...args, ...patch }));
  }
  assert.equal(requests.length, 1);
});
