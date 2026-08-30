'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../src');
const { registerBlenderTools } = require('../src/tools/blender');

function harness() {
  const tools = {};
  const calls = [];
  const server = {
    tool(name, description, schema, handler) {
      tools[name] = { description, schema, handler };
    },
  };
  const client = {
    async get(path) {
      calls.push({ method: 'GET', path });
      return { success: true, path };
    },
    async post(path, body) {
      calls.push({ method: 'POST', path, body });
      return { success: true, command_id: 'command-123', status: 'queued' };
    },
  };
  registerBlenderTools(server, client);
  return { tools, calls };
}

test('registers the complete additive Blender tool surface with fail-closed annotations', () => {
  const server = createServer({ apiKey: 'test-key' });
  const names = [
    'blender_list_sessions', 'blender_get_scene', 'blender_search_docs',
    'blender_capture_viewport', 'blender_apply_operations', 'blender_import_media',
    'blender_render', 'blender_undo', 'blender_file_operation',
    'blender_execute_python', 'blender_get_command_status',
  ];

  for (const name of names) {
    assert.ok(server._registeredTools[name], `${name} must be registered`);
    assert.deepEqual(
      Object.keys(server._registeredTools[name].annotations).sort(),
      ['destructiveHint', 'openWorldHint', 'readOnlyHint']
    );
    assert.equal(server._registeredTools[name].annotations.openWorldHint, true);
  }
  for (const name of ['blender_list_sessions', 'blender_get_scene', 'blender_search_docs', 'blender_get_command_status']) {
    assert.deepEqual(server._registeredTools[name].annotations, {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    });
  }
  assert.deepEqual(server._registeredTools.blender_capture_viewport.annotations, {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  });
  assert.deepEqual(server._registeredTools.blender_execute_python.annotations, {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
  });
  for (const name of [
    'blender_apply_operations', 'blender_import_media', 'blender_render',
    'blender_undo', 'blender_file_operation', 'blender_execute_python',
  ]) {
    assert.equal(server._registeredTools[name].annotations.destructiveHint, true);
  }
});

test('uses the stable command envelope and preserves the replay key', async () => {
  const { tools, calls } = harness();
  await tools.blender_apply_operations.handler({
    session_id: 'session-123',
    operations: [{ op: 'object.create', name: 'Cube', type: 'CUBE' }],
    idempotency_key: 'retry:create-cube:1',
  });

  assert.deepEqual(calls, [{
    method: 'POST',
    path: '/v1/blender/commands',
    body: {
      session_id: 'session-123',
      command_type: 'scene.apply_operations',
      payload: { operations: [{ op: 'object.create', name: 'Cube', type: 'CUBE' }] },
      idempotency_key: 'retry:create-cube:1',
    },
  }]);
});

test('structured operations use strict dotted contracts and reject legacy bags', () => {
  const server = createServer({ apiKey: 'test-key' });
  const schema = server._registeredTools.blender_apply_operations.inputSchema;
  assert.doesNotThrow(() => schema.parse({
    operations: [{
      op: 'material.set_principled',
      material: 'Kolbo Material',
      base_color: [0.1, 0.2, 0.3, 1],
      roughness: 0.4,
    }],
  }));
  assert.doesNotThrow(() => schema.parse({
    operations: [{
      op: 'object.create', type: 'LIGHT', light_type: 'AREA',
      energy: 1200, color: [1, 0.8, 0.6], shadow_soft_size: 2,
    }],
  }));
  assert.doesNotThrow(() => schema.parse({
    operations: [{ op: 'object.create', type: 'CAMERA', lens: 50 }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'create_object', params: { primitive: 'cube' } }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'object.delete', object: 'Cube', unexpected: true }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'object.transform', object: 'Cube' }],
  }));
  assert.doesNotThrow(() => schema.parse({
    operations: [{ op: 'object.duplicate', object: 'Cube', collection: 'Copies', location: [1, 2, 3] }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'object.create', type: 'CUBE', energy: 100 }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'object.create', type: 'LIGHT', lens: 50 }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'object.transform', object: 'Cube', location: [1_000_000_001, 0, 0] }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'world.set_color', color: [1.1, 0, 0] }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'modifier.add', object: 'Cube', type: 'subsurf' }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'modifier.configure', object: 'Cube', modifier: 'Bevel', properties: { name: 'blocked' } }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'modifier.configure', object: 'Cube', modifier: 'Bevel', properties: { width: 1_000_000_001 } }],
  }));
  assert.throws(() => schema.parse({
    operations: [{ op: 'animation.keyframe_insert', object: 'Cube', data_path: 'location', frame: 1_048_575 }],
  }));
});

test('import URLs use the exact Kolbo host allowlist and Python is capped at 64 KiB', () => {
  const server = createServer({ apiKey: 'test-key' });
  assert.throws(() => server._registeredTools.blender_import_media.inputSchema.parse({
    url: 'http://example.test/model.glb',
  }));
  assert.throws(() => server._registeredTools.blender_import_media.inputSchema.parse({
    url: 'https://example.test/model.glb',
  }));
  assert.throws(() => server._registeredTools.blender_import_media.inputSchema.parse({
    url: 'https://cdn.kolbo.ai.example.test/model.glb',
  }));
  assert.doesNotThrow(() => server._registeredTools.blender_import_media.inputSchema.parse({
    url: 'https://cdn.kolbo.ai/model.glb',
  }));
  assert.doesNotThrow(() => server._registeredTools.blender_import_media.inputSchema.parse({
    url: 'https://media-staging.kolbo.ai/model.glb',
  }));
  assert.doesNotThrow(() => server._registeredTools.blender_import_media.inputSchema.parse({
    url: 'https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/model.glb',
  }));
  assert.throws(() => server._registeredTools.blender_import_media.inputSchema.parse({
    media_id: 'media-1',
    kind: 'gltf',
  }));
  assert.throws(() => server._registeredTools.blender_execute_python.inputSchema.parse({
    code: 'x'.repeat(65_537),
    purpose: 'test cap',
  }));
  assert.throws(() => server._registeredTools.blender_execute_python.inputSchema.parse({
    code: '💡'.repeat(20_000),
    purpose: 'test byte cap',
  }));
});

test('structured operation payloads fail before REST delivery when oversized or too complex', () => {
  const server = createServer({ apiKey: 'test-key' });
  const schema = server._registeredTools.blender_apply_operations.inputSchema;
  const largeProperties = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`field_${index}`, 'x'.repeat(256)])
  );
  assert.throws(() => schema.parse({
    operations: Array.from({ length: 40 }, (_, index) => ({
      op: 'modifier.add', object: `Object_${index}`, type: 'BEVEL', properties: largeProperties,
    })),
  }), /256 KiB/);

  const manyProperties = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`field_${index}`, true])
  );
  assert.throws(() => schema.parse({
    operations: Array.from({ length: 100 }, (_, index) => ({
      op: 'modifier.add', object: `Object_${index}`, type: 'BEVEL', properties: manyProperties,
    })),
  }), /too complex/);
});

test('omits session_id so the backend enforces the single-session rule', async () => {
  const { tools, calls } = harness();
  await tools.blender_undo.handler({});
  assert.equal(Object.hasOwn(calls[0].body, 'session_id'), false);
  assert.equal(calls[0].body.command_type, 'scene.undo');
  assert.deepEqual(calls[0].body.payload, {});
});

test('requires exactly one import source before submitting a command', async () => {
  const { tools, calls } = harness();
  await assert.rejects(
    tools.blender_import_media.handler({}),
    /exactly one of media_id or url/
  );
  await assert.rejects(
    tools.blender_import_media.handler({ media_id: 'media-1', url: 'https://cdn.kolbo.ai/a.glb' }),
    /exactly one of media_id or url/
  );
  assert.equal(calls.length, 0);
});

test('command payloads match the backend allowlists exactly', async () => {
  const { tools, calls } = harness();
  await tools.blender_search_docs.handler({ query: 'bpy context', limit: 5 });
  await tools.blender_render.handler({ kind: 'still', upload_to_kolbo: true });
  await tools.blender_execute_python.handler({ code: 'print("ok")', purpose: 'Verify output capture' });

  assert.deepEqual(calls.map((call) => call.body.payload), [
    { query: 'bpy context', limit: 5 },
    { kind: 'still', upload_to_kolbo: true },
    { code: 'print("ok")', purpose: 'Verify output capture' },
  ]);
});

test('open and save-as reject missing paths before delivery', async () => {
  const { tools, calls } = harness();
  await assert.rejects(tools.blender_file_operation.handler({ operation: 'open', confirm_overwrite: false }), /requires path/);
  await assert.rejects(tools.blender_file_operation.handler({ operation: 'save_as', confirm_overwrite: false }), /requires path/);
  assert.equal(calls.length, 0);
});

test('render and viewport pixel caps fail before REST delivery', async () => {
  const { tools, calls } = harness();
  await assert.rejects(
    tools.blender_render.handler({ kind: 'still', width: 8192, height: 8192, upload_to_kolbo: false }),
    /40 megapixels/,
  );
  await assert.rejects(
    tools.blender_capture_viewport.handler({ format: 'png', width: 8192, height: 8192, upload_to_kolbo: false }),
    /40 megapixels/,
  );
  assert.equal(calls.length, 0);
});

test('render and status descriptions expose host limits and absolute expiry', () => {
  const { tools } = harness();
  assert.match(tools.blender_render.description, /250 scene frames/);
  assert.match(tools.blender_render.description, /100,000,000 pixel-frames/);
  assert.match(tools.blender_get_command_status.description, /absolute expires_at/);
  assert.match(tools.blender_get_command_status.description, /24 hours/);
});

test('command status uses an encoded path and never polls awaiting approval', async () => {
  const { tools, calls } = harness();
  await tools.blender_get_command_status.handler({ command_id: 'command/with space' });
  assert.deepEqual(calls, [{ method: 'GET', path: '/v1/blender/commands/command%2Fwith%20space' }]);
});
