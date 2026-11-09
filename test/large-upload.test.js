'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerMediaTools } = require('../src/tools/media');
const { resolvePurpose, PART_PAGE } = require('../src/tools/large-upload');

function harness(reply) {
  const tools = new Map(), calls = [];
  const client = Object.fromEntries(['post', 'get', 'delete'].map(method => [method, async (...args) => {
    calls.push({ method, args });
    return reply(method, ...args);
  }]));
  registerMediaTools({ tool(name, description, schema, handler) { tools.set(name, { description, schema, handler }); } }, client);
  return { tools, calls };
}

const parts = (n) => Array.from({ length: n }, (_, i) => ({ part_number: i + 1, url: `https://bucket.example/p${i + 1}?sig` }));

test('purpose and retention resolve to one large-upload purpose', () => {
  assert.equal(resolvePurpose({ retention: 'temp' }), 'social-publish');
  assert.equal(resolvePurpose({ purpose: 'review', retention: 'persistent' }), 'review');
  assert.throws(() => resolvePurpose({ purpose: 'review', retention: 'temp' }));
  assert.throws(() => resolvePurpose({ retention: 'persistent' }));
  assert.throws(() => resolvePurpose({ purpose: 'nope' }));
});

test('create_upload_ticket with a large file starts a multipart upload and pages part URLs', async () => {
  const { tools, calls } = harness((method) => ({ success: true, data: {
    upload_id: 'u1', purpose: 'social-publish', retention: 'temp', size: 1730422908,
    part_size: 16777216, part_count: 104, parts: parts(104), parts_expire_in: 43200,
  } }));
  const out = JSON.parse((await tools.get('create_upload_ticket').handler({ retention: 'temp', filename: 'WN_v11_4k.mp4', size_bytes: 1730422908 })).content[0].text);
  assert.deepEqual(calls[0].args.slice(0, 2), ['/v1/uploads/large', {
    purpose: 'social-publish', filename: 'WN_v11_4k.mp4', size: 1730422908,
    review_asset_id: undefined, review_asset_name: undefined, project_id: undefined, review_collection_id: undefined, note: undefined,
  }]);
  assert.equal(out.upload_id, 'u1');
  assert.equal(out.parts.length, PART_PAGE, 'never dumps hundreds of URLs into context');
  assert.match(out.how_to_upload.more_parts, /finish_large_upload/);
  assert.match(out.how_to_upload.then, /publish_social_post/);
});

test('create_upload_ticket without large args is the old ticket, unchanged', async () => {
  const { tools, calls } = harness(() => ({ token: 't', upload_url: 'https://upload.kolbo.ai/mcp/upload', expires_in: 900 }));
  const out = JSON.parse((await tools.get('create_upload_ticket').handler({})).content[0].text);
  assert.equal(calls[0].args[0], '/v1/media/upload-ticket');
  assert.equal(out.status, 'upload_ticket_created');
});

test('finish_large_upload routes status / complete / cancel', async () => {
  const { tools, calls } = harness((method) => ({ data: { upload_id: 'u1', status: method === 'post' ? 'complete' : 'uploading', parts: parts(60), uploaded_parts: parts(40) } }));
  const finish = tools.get('finish_large_upload').handler;
  const st = JSON.parse((await finish({ upload_id: 'u1', action: 'status', part_numbers: [26, 27] })).content[0].text);
  assert.equal(calls[0].args[0], '/v1/uploads/large/u1?part_numbers=26,27');
  assert.equal(st.parts.length, PART_PAGE);
  assert.equal(st.uploaded_parts, 40);
  await finish({ upload_id: 'u1', action: 'complete' });
  assert.deepEqual(calls[1].args, ['/v1/uploads/large/u1/complete', {}]);
  await finish({ upload_id: 'u1', action: 'cancel' });
  assert.equal(calls[2].method, 'delete');
});

test('publish_social_post tells agents a large upload id is a valid media id', () => {
  const src = require('fs').readFileSync(require.resolve('../src/tools/social'), 'utf8');
  assert.match(src, /upload_id of a social-publish large upload/);
});
