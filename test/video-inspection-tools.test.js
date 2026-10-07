'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerVideoInspectionTools } = require('../src/tools/video_inspection');
const { TOOL_ANNOTATIONS } = require('../src/toolAnnotations');
test('additive evidence tools route safely and emit pixels outside JSON text', async () => {
  const calls = []; const tools = new Map();
  registerVideoInspectionTools({ tool(name, description, schema, handler) { tools.set(name, { description, schema, handler }); } }, {
    async post(route, body, opts) { calls.push({ route, body, opts }); return { evidence_id: 'e'.repeat(24), images: [{ mime_type: 'image/jpeg', data: 'secret-pixel-base64', timestamps: [10] }] }; },
    async get(route) { calls.push({ route }); return { status: 'ready' }; },
  });
  assert.equal(tools.size, 6);
  for (const name of tools.keys()) assert.ok(TOOL_ANNOTATIONS[name]);
  const inspection_id = '11111111-1111-4111-8111-111111111111';
  const result = await tools.get('inspect_video').handler({ inspection_id, kind: 'frame', timestamps: [10], project_id: 'project' });
  assert.equal(result.content[1].type, 'image'); assert.equal(result.content[1].data, 'secret-pixel-base64');
  assert.equal(result.content[0].text.includes('secret-pixel-base64'), false);
  assert.equal(calls[0].body.project_id, undefined); assert.equal(calls[0].opts.timeoutMs, 115000);
  assert.equal(tools.get('inspect_video').schema.frame_count.safeParse(13).success, false);
  assert.equal(tools.get('inspect_video').schema.inspection_id.safeParse('../another-user').success, false);
  await tools.get('transcribe_video_evidence').handler({ inspection_id, evidence_id: 'a'.repeat(24), project_id: 'project' });
  assert.equal(calls.at(-1).body.focus, 'transcription'); assert.equal(calls.at(-1).body.project_id, 'project');
  for (const name of ['analyze_video_evidence', 'transcribe_video_evidence']) assert.equal(TOOL_ANNOTATIONS[name].destructiveHint, true);
});
