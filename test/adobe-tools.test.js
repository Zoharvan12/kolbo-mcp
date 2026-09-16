'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

const { createServer } = require('../src');
const { registerAdobeTools } = require('../src/tools/adobe');

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
      return { success: true, command_id: 'command-123', status: 'delivered' };
    },
  };
  registerAdobeTools(server, client);
  return { tools, calls };
}

// Parse like the MCP SDK does, then invoke the handler.
async function call(h, name, args) {
  const tool = h.tools[name];
  const parsed = z.object(tool.schema).strict().parse(args);
  return tool.handler(parsed);
}

const ADOBE_TOOLS = [
  'adobe_list_sessions', 'adobe_get_project', 'adobe_get_timeline', 'adobe_import_media',
  'adobe_place_on_timeline', 'adobe_create_sequence', 'adobe_import_captions', 'adobe_get_command_status',
  'adobe_edit_composition', 'adobe_run_script', 'adobe_capture_frame',
];

test('registers the Adobe tool surface with honest annotations', () => {
  const server = createServer({ apiKey: 'test-key' });
  const registered = server._registeredTools || {};
  for (const name of ADOBE_TOOLS) {
    const annotations = registered[name]?.annotations;
    assert.ok(annotations, `${name} is registered with annotations`);
    assert.equal(annotations.openWorldHint, true, `${name} crosses into a desktop host`);
    // Only the composition editor can delete (layer.delete); everything else is additive.
    assert.equal(annotations.destructiveHint, ['adobe_edit_composition', 'adobe_run_script'].includes(name), name);
  }
  for (const name of ['adobe_list_sessions', 'adobe_get_project', 'adobe_get_timeline', 'adobe_get_command_status']) {
    assert.equal(registered[name].annotations.readOnlyHint, true, name);
  }
  for (const name of ['adobe_import_media', 'adobe_place_on_timeline', 'adobe_create_sequence', 'adobe_import_captions', 'adobe_edit_composition', 'adobe_run_script', 'adobe_capture_frame']) {
    assert.equal(registered[name].annotations.readOnlyHint, false, name);
  }
});

test('every command tool posts the exact relay envelope', async () => {
  const h = harness();
  await call(h, 'adobe_list_sessions', { page: 2, page_size: 10 });
  await call(h, 'adobe_get_project', { session_id: 'sess-1', include_items: true });
  await call(h, 'adobe_get_timeline', { max_clips: 50, idempotency_key: 'k-1' });
  await call(h, 'adobe_import_media', { media_id: 'media-1', bin: 'Kolbo' });
  await call(h, 'adobe_place_on_timeline', { url: 'https://media.kolbo.ai/kolboai-media/a.mp4', kind: 'video' });
  await call(h, 'adobe_create_sequence', { name: 'Kolbo Cut' });
  await call(h, 'adobe_import_captions', { url: 'https://cdn.kolbo.ai/captions/a.srt' });
  await call(h, 'adobe_get_command_status', { command_id: 'command-123' });

  assert.deepEqual(h.calls, [
    { method: 'GET', path: '/v1/adobe/sessions?page=2&page_size=10' },
    { method: 'POST', path: '/v1/adobe/commands', body: { session_id: 'sess-1', command_type: 'project.get', payload: { include_items: true } } },
    { method: 'POST', path: '/v1/adobe/commands', body: { command_type: 'timeline.get', payload: { max_clips: 50 }, idempotency_key: 'k-1' } },
    { method: 'POST', path: '/v1/adobe/commands', body: { command_type: 'media.import', payload: { media_id: 'media-1' } } },
    { method: 'POST', path: '/v1/adobe/commands', body: { command_type: 'timeline.place', payload: { url: 'https://media.kolbo.ai/kolboai-media/a.mp4', kind: 'video' } } },
    { method: 'POST', path: '/v1/adobe/commands', body: { command_type: 'sequence.create', payload: { name: 'Kolbo Cut' } } },
    { method: 'POST', path: '/v1/adobe/commands', body: { command_type: 'captions.import', payload: { url: 'https://cdn.kolbo.ai/captions/a.srt' } } },
    { method: 'GET', path: '/v1/adobe/commands/command-123' },
  ]);
});

test('media tools require exactly one Kolbo-owned source before any request', async () => {
  const h = harness();
  await assert.rejects(call(h, 'adobe_import_media', {}), /exactly one of media_id or url/);
  await assert.rejects(
    call(h, 'adobe_import_media', { media_id: 'm', url: 'https://media.kolbo.ai/a.mp4' }),
    /exactly one of media_id or url/,
  );
  for (const url of ['https://evil.example.com/a.mp4', 'http://media.kolbo.ai/a.mp4', 'https://media.kolbo.ai.evil.com/a.mp4']) {
    await assert.rejects(call(h, 'adobe_place_on_timeline', { url }), /Kolbo-owned/, url);
  }
  await assert.rejects(call(h, 'adobe_import_captions', { url: 'https://evil.example.com/c.srt' }), /Kolbo-owned/);
  assert.equal(h.calls.length, 0);
});

test('schemas reject script-shaped and unsupported fields', () => {
  const h = harness();
  const strict = (name) => z.object(h.tools[name].schema).strict();
  assert.throws(() => strict('adobe_get_project').parse({ script: 'app.quit()' }));
  assert.throws(() => strict('adobe_place_on_timeline').parse({ media_id: 'm', track: 2 }));
  assert.throws(() => strict('adobe_create_sequence').parse({}));
  assert.throws(() => strict('adobe_create_sequence').parse({ name: 'bad\u0000name' }));
  assert.throws(() => strict('adobe_get_command_status').parse({ command_id: '../../etc' }));
  // The only script tool is the approval-gated adobe_run_script; no eval/execute backdoors.
  assert.deepEqual(Object.keys(h.tools).filter((name) => /script|execute|eval/.test(name)), ['adobe_run_script']);
});

test('adobe_edit_composition posts one comp.edit batch and validates media and keyframes first', async () => {
  const h = harness();
  const operations = [
    { op: 'comp.create', name: 'Promo', duration_seconds: 15 },
    { op: 'layer.add_media', media_id: 'media-1', name: 'Shot 1', start_seconds: 0, trim_start_seconds: 0.5, duration_seconds: 6, fit: 'cover' },
    { op: 'layer.add_text', text: 'Line one\nLine two', duration_seconds: 3, stroke_width: 4 },
    { op: 'layer.animate', layer: 'Shot 1', property: 'position', keyframes: [{ time_seconds: 0, value: [960, 540] }] },
    { op: 'layer.animate', layer: 2, property: 'opacity', easing: 'linear', keyframes: [{ time_seconds: 0, value: 0 }, { time_seconds: 1, value: 100 }] },
    { op: 'layer.delete', layer: 'Old' },
  ];
  await call(h, 'adobe_edit_composition', { session_id: 'sess-ae', operations });
  assert.deepEqual(h.calls, [
    { method: 'POST', path: '/v1/adobe/commands', body: { session_id: 'sess-ae', command_type: 'comp.edit', payload: { operations } } },
  ]);

  await assert.rejects(
    call(h, 'adobe_edit_composition', { operations: [{ op: 'layer.add_media', url: 'https://evil.example.com/a.mp4' }] }),
    /Kolbo-owned/,
  );
  await assert.rejects(call(h, 'adobe_edit_composition', { operations: [{ op: 'layer.add_media' }] }), /exactly one of media_id or url/);
  const strict = z.object(h.tools.adobe_edit_composition.schema).strict();
  assert.throws(() => strict.parse({ operations: [] }));
  assert.throws(() => strict.parse({ operations: [{ op: 'script.run', code: 'app.quit()' }] }));
  assert.throws(() => strict.parse({ operations: [{ op: 'layer.add_media', media_id: 'm', file_path: 'C:/evil.jsx' }] }));
  assert.throws(() => strict.parse({ operations: [{ op: 'layer.animate', layer: 1, property: 'opacity', keyframes: [{ time_seconds: 0, value: [1, 2] }] }] }), /opacity keyframes need a number/);
  assert.throws(() => strict.parse({ operations: [{ op: 'layer.animate', layer: 1, property: 'position', keyframes: [{ time_seconds: 0, value: 5 }] }] }), /position keyframes need/);
  assert.equal(h.calls.length, 1);
});

test('adobe_run_script and adobe_capture_frame post the relay contract', async () => {
  const h = harness();
  const code = 'var comp = app.project.activeItem;' + String.fromCharCode(10) + 'return comp.name;';
  await call(h, 'adobe_run_script', { session_id: 'sess-ae', code, purpose: 'Read the comp name' });
  await call(h, 'adobe_capture_frame', { time_seconds: 2.5 });
  await call(h, 'adobe_capture_frame', {});
  assert.deepEqual(h.calls, [
    { method: 'POST', path: '/v1/adobe/commands', body: { session_id: 'sess-ae', command_type: 'script.run', payload: { code, purpose: 'Read the comp name' } } },
    { method: 'POST', path: '/v1/adobe/commands', body: { command_type: 'frame.capture', payload: { time_seconds: 2.5 } } },
    { method: 'POST', path: '/v1/adobe/commands', body: { command_type: 'frame.capture', payload: {} } },
  ]);
  const script = z.object(h.tools.adobe_run_script.schema).strict();
  assert.throws(() => script.parse({ code: 'return 1;' }), /purpose/);
  assert.throws(() => script.parse({ code: '   ', purpose: 'x' }));
  assert.throws(() => script.parse({ code: 'x'.repeat(64 * 1024 + 1), purpose: 'x' }));
  const capture = z.object(h.tools.adobe_capture_frame.schema).strict();
  assert.throws(() => capture.parse({ path: 'C:/x.png' }));
  assert.throws(() => capture.parse({ time_seconds: -1 }));
});
