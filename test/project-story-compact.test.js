'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProjectTools } = require('../src/tools/projects');

test('get_project_story forwards the media list options, and sends none by default', async () => {
  let get;
  const calls = [];
  registerProjectTools({ tool(name, ...args) { if (name === 'get_project_story') get = args.at(-1); } }, {
    async get(url) { calls.push(url); return { success: true, story: { version: 1, blocks: [] } }; },
  });
  await get({ project_id: 'p1' });
  await get({ project_id: 'p1', media: 'none', media_type: 'video', search: '6addb3d6' });
  assert.equal(calls[0], '/v1/projects/p1/publish/story');
  assert.equal(calls[1], '/v1/projects/p1/publish/story?media=none&media_type=video&search=6addb3d6');
});
