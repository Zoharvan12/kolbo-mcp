'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerMediaTools } = require('../src/tools/media');

test('URL download tools submit once and use dedicated status/cancellation routes', async () => {
  const tools = new Map(), calls = [];
  const client = Object.fromEntries(['post', 'get', 'delete'].map(method => [method, async (...args) => {
    calls.push({ method, args });
    return method === 'post' ? { jobId: 'job-1', status: 'pending' } : { status: method === 'get' ? 'completed' : 'cancelled', resultUrl: 'https://media.kolbo.ai/video.mp4' };
  }]));
  registerMediaTools({ tool(name, description, schema, handler) { tools.set(name, { description, schema, handler }); } }, client);
  const start = tools.get('download_media_from_url');
  const result = JSON.parse((await start.handler({ url: 'https://youtube.com/watch?v=fixture' })).content[0].text);
  assert.equal(result.job_id, 'job-1');
  assert.equal(result.next_tool, 'get_download_status');
  assert.equal(result.status, 'pending');
  assert.deepEqual(calls[0], { method: 'post', args: ['/v1/downloads', { url: 'https://youtube.com/watch?v=fixture', quality: 'best', outputType: 'video' }] });
  await tools.get('get_download_status').handler({ job_id: 'job/1' });
  await tools.get('cancel_download').handler({ job_id: 'job-1' });
  assert.equal(calls[1].args[0], '/v1/downloads/job%2F1');
  assert.equal(calls[2].method, 'delete');
  assert.ok(tools.has('upload_media'), 'existing upload tool must remain available');
  assert.throws(() => start.schema.quality.parse('100000'));
});

test('new download tools carry complete safety annotations in the real server', async () => {
  const { createServer } = require('../src');
  const server = createServer({ apiKey: 'test-only', apps: false });
  const tools = server._registeredTools;
  assert.equal(tools.download_media_from_url.annotations.openWorldHint, true);
  assert.equal(tools.download_media_from_url.annotations.readOnlyHint, false);
  assert.equal(tools.get_download_status.annotations.readOnlyHint, true);
  assert.equal(tools.cancel_download.annotations.destructiveHint, true);
  await server.close();
});
