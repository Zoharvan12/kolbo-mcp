'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerEditorTools } = require('../src/tools/editor');
test('editor tools preserve snapshot job IDs and use additive SDK paths', async () => {
  const tools = new Map(), requests = [];
  registerEditorTools({ tool: (name, description, schema, handler) => tools.set(name, { schema, handler }) }, { post: async (url, body) => { requests.push({ url, body }); return { job_id: 'existing', pending: true }; } });
  assert.equal(tools.size, 6);
  const body = { session_id: 'owned', job_id: 'existing' };
  const out = await tools.get('export_video_editor_session').handler(body);
  assert.deepEqual(requests, [{ url: '/v1/editor/exports', body }]);
  assert.equal(JSON.parse(out.content[0].text).job_id, 'existing');
  await tools.get('create_video_editor_session').handler({ project_id: 'project', name: 'edit', clips: [{ url: 'https://media.kolbo.ai/file.jpg' }] });
  assert.equal(requests[1].url, '/v1/editor/sessions');
});

test('editor reads and edits dispatch to SDK without dropping captions or revisions', async () => {
  const { z } = require('zod');
  const tools = new Map(), requests = [];
  registerEditorTools({ tool: (name, description, schema, handler) => tools.set(name, { schema, handler }) }, {
    get: async url => { requests.push({ url }); return { success: true }; },
    patch: async (url, body) => { requests.push({ url, body }); return { revision: 'next' }; },
  });
  await tools.get('get_video_editor_schema').handler({});
  await tools.get('list_video_editor_sessions').handler({ project_id: 'project', limit: 10, offset: 20 });
  await tools.get('get_video_editor_session').handler({ session_id: 'a/b' });
  const body = { session_id: 'session', expected_revision: 'old', session_data: { name: 'Renamed' }, operations: [{ op: 'add_item', track_id: 'caption', item: { id: 'c', type: 'caption', startTime: 10.5, duration: 500, content: 'Hello', words: [{ text: 'Hello', startTime: 10.5, endTime: 510.5 }] } }] };
  const parsed = z.object(tools.get('update_video_editor_session').schema).parse(body);
  await tools.get('update_video_editor_session').handler(parsed);
  assert.deepEqual(requests.map(request => request.url), ['/v1/editor/schema', '/v1/editor/sessions?project_id=project&limit=10&offset=20', '/v1/editor/sessions/a%2Fb', '/v1/editor/sessions']);
  assert.deepEqual(requests[3].body, body);
  assert.throws(() => z.object(tools.get('update_video_editor_session').schema).parse({ session_id: 's' }));
  const advanced = z.object(tools.get('create_video_editor_session').schema).parse({ project_id: 'p', name: 'Blank', session_data: { tracks: [] } });
  assert.deepEqual(advanced.session_data.tracks, []);
});
