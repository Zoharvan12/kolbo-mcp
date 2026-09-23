const test = require('node:test');
const assert = require('node:assert/strict');
const { registerGenerateTools } = require('../src/tools/generate');

test('draft quote returns availability and credits without generation polling', async () => {
  let edit;
  const server = { tool(name, ...args) { if (name === 'edit_video') edit = args.at(-1); } };
  const calls = [];
  const quote = { status: true, data: { credits: 480, resolution: '1080p', supportedResolutions: ['1080p'] } };
  const client = {
    async get() { throw new Error('Quote must not poll a generation'); },
    async post(url, body) { calls.push({ url, body }); return quote; },
  };
  registerGenerateTools(server, client, { remote: true });
  const result = await edit({ operation: 'draft_quote', video_url: 'https://cdn.example/video.mp4', project_id: 'project', resolution: '1080p' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/v1/edit/video');
  assert.equal(calls[0].body.operation, 'draft_quote');
  assert.equal(calls[0].body.resolution, '1080p');
  assert.deepEqual(JSON.parse(result.content[0].text), quote);
});

test('draft finalization forwards source and resolution and returns completed billing', async () => {
  let edit;
  const server = { tool(name, ...args) { if (name === 'edit_video') edit = args.at(-1); } };
  const calls = [];
  const client = {
    async post(url, body) { calls.push({ url, body }); return { generation_id: 'draft-final', session_id: 'session' }; },
    async get() { return { state: 'completed', credits_used: 202, result: { urls: ['https://cdn.example/final.mp4'], duration: 4 } }; },
  };
  registerGenerateTools(server, client, { remote: true });
  const result = await edit({ operation: 'draft_enhance', video_url: 'https://cdn.example/draft.mp4', project_id: 'project', resolution: '1080p' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.operation, 'draft_enhance');
  assert.equal(calls[0].body.project_id, 'project');
  assert.equal(calls[0].body.resolution, '1080p');
  assert.match(JSON.stringify(result), /final\.mp4/);
  assert.match(JSON.stringify(result), /202/);
});
