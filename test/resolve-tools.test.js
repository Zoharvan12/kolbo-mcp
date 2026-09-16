'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

const { createServer } = require('../src');
const { registerResolveTools } = require('../src/tools/resolve');

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
  registerResolveTools(server, client);
  return { tools, calls };
}

// Parse like the MCP SDK does, then invoke the handler.
async function call(h, name, args) {
  const tool = h.tools[name];
  const parsed = z.object(tool.schema).strict().parse(args);
  return tool.handler(parsed);
}

const RESOLVE_TOOLS = [
  'resolve_list_sessions', 'resolve_get_project', 'resolve_get_timeline', 'resolve_import_media',
  'resolve_edit_timeline', 'resolve_run_script', 'resolve_capture_frame', 'resolve_get_command_status',
];

test('registers the Resolve tool surface with honest annotations', () => {
  const server = createServer({ apiKey: 'test-key' });
  const registered = server._registeredTools || {};
  for (const name of RESOLVE_TOOLS) {
    const annotations = registered[name]?.annotations;
    assert.ok(annotations, `${name} is registered with annotations`);
    assert.equal(annotations.openWorldHint, true, `${name} crosses into a desktop host`);
    assert.equal(annotations.destructiveHint, ['resolve_edit_timeline', 'resolve_run_script'].includes(name), name);
    assert.equal(annotations.readOnlyHint, ['resolve_list_sessions', 'resolve_get_project', 'resolve_get_timeline', 'resolve_get_command_status'].includes(name), name);
  }
});

test('command tools post the exact relay envelope', async () => {
  const h = harness();
  await call(h, 'resolve_list_sessions', {});
  await call(h, 'resolve_get_timeline', { session_id: 'resolve-1', max_clips: 20 });
  await call(h, 'resolve_import_media', { media_id: 'media-1', kind: 'video' });
  await call(h, 'resolve_capture_frame', { time_seconds: 2.5, idempotency_key: 'cap-1' });
  await call(h, 'resolve_run_script', { code: 'return await project.GetName();', purpose: 'Read the project name' });
  await call(h, 'resolve_get_command_status', { command_id: 'command-123' });

  assert.deepEqual(h.calls[0], { method: 'GET', path: '/v1/resolve/sessions?page=1&page_size=25' });
  assert.deepEqual(h.calls[1].body, { session_id: 'resolve-1', command_type: 'timeline.get', payload: { max_clips: 20 } });
  assert.deepEqual(h.calls[2].body, { command_type: 'media.import', payload: { media_id: 'media-1', kind: 'video' } });
  assert.deepEqual(h.calls[3].body, { command_type: 'frame.capture', payload: { time_seconds: 2.5 }, idempotency_key: 'cap-1' });
  assert.deepEqual(h.calls[4].body, { command_type: 'script.run', payload: { code: 'return await project.GetName();', purpose: 'Read the project name' } });
  assert.deepEqual(h.calls[5], { method: 'GET', path: '/v1/resolve/commands/command-123' });
  for (const entry of h.calls.slice(1, 5)) assert.equal(entry.path, '/v1/resolve/commands');
});

test('resolve_edit_timeline posts one timeline.edit batch after validating media and fades', async () => {
  const h = harness();
  const operations = [
    { op: 'timeline.create', name: 'Kolbo Promo' },
    { op: 'clip.append', media_id: 'shot-1', track_index: 1, record_seconds: 0, trim_start_seconds: 0.5, duration_seconds: 6, media_type: 'video' },
    { op: 'clip.transition', track_index: 1, clip: 1, duration_seconds: 1 },
    { op: 'audio.fade', track_index: 1, clip: 1, fade_out_seconds: 2 },
    { op: 'title.add', track_index: 1, clip: 1, text: 'KOLBO\nx RESOLVE', position: [0.5, 0.2] },
    { op: 'marker.add', time_seconds: 6, color: 'Green', name: 'Hero' },
  ];
  await call(h, 'resolve_edit_timeline', { operations });
  assert.deepEqual(h.calls[0].body, { command_type: 'timeline.edit', payload: { operations } });

  await assert.rejects(call(h, 'resolve_edit_timeline', { operations: [{ op: 'clip.append', url: 'https://example.com/a.mp4' }] }), /Kolbo-owned/);
  await assert.rejects(call(h, 'resolve_edit_timeline', { operations: [{ op: 'clip.append', media_id: 'a', url: 'https://media.kolbo.ai/a.mp4' }] }), /exactly one of media_id or url/);
  assert.throws(() => z.object(h.tools.resolve_edit_timeline.schema).strict().parse({ operations: [{ op: 'audio.fade', track_index: 1, clip: 1 }] }), /fade_in_seconds or fade_out_seconds/);
  assert.throws(() => z.object(h.tools.resolve_edit_timeline.schema).strict().parse({ operations: [{ op: 'title.add', track_index: 1, clip: 1, text: 'Hi', position: [960, 540] }] }));
  assert.throws(() => z.object(h.tools.resolve_edit_timeline.schema).strict().parse({ operations: [{ op: 'clip.append', media_id: 'a', path: 'C:/a.mp4' }] }));
  assert.equal(h.calls.length, 1);
});
