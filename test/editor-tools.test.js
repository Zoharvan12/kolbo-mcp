'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerEditorTools } = require('../src/tools/editor');
test('editor tools preserve snapshot job IDs and use additive SDK paths', async () => {
  const tools = new Map(), requests = [];
  registerEditorTools({ tool: (name, description, schema, handler) => tools.set(name, { schema, handler }) }, { post: async (url, body) => { requests.push({ url, body }); return { job_id: 'existing', pending: true }; } });
  assert.equal(tools.size, 2);
  const body = { session_id: 'owned', job_id: 'existing' };
  const out = await tools.get('export_video_editor_session').handler(body);
  assert.deepEqual(requests, [{ url: '/v1/editor/exports', body }]);
  assert.equal(JSON.parse(out.content[0].text).job_id, 'existing');
  await tools.get('create_video_editor_session').handler({ project_id: 'project', name: 'edit', clips: [{ url: 'https://media.kolbo.ai/file.jpg' }] });
  assert.equal(requests[1].url, '/v1/editor/sessions');
});
