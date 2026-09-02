const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { rehostLocalPaths, withLocalRehost, looksLikeLocalFile } = require('../src/tools/local-rehost');

const tmp = path.join(os.tmpdir(), `kolbo-rehost-${process.pid}.png`);
fs.writeFileSync(tmp, Buffer.from('89504e470d0a1a0a', 'hex'));
test.after(() => fs.rmSync(tmp, { force: true }));

const fakeClient = () => {
  const uploads = [];
  return {
    uploads,
    async postMultipart(route, form) { uploads.push(route); return { media: { url: `https://media.kolbo.ai/u/${uploads.length}.png` } }; },
    async post(route, body) { return { route, body }; },
  };
};

test('local paths anywhere in the body become CDN URLs; URLs and text are untouched', async () => {
  const client = fakeClient();
  const body = await rehostLocalPaths(client, {
    prompt: tmp, // free text is never stat()ed even when it looks like a path
    image_url: tmp,
    mask_image_url: 'https://cdn.example.com/mask.png',
    additional_images: [tmp, 'https://cdn.example.com/b.png'],
    items: [{ image_url: tmp }],
    project_id: 'p1',
  });
  assert.equal(body.prompt, tmp);
  assert.match(body.image_url, /^https:\/\/media\.kolbo\.ai\//);
  assert.equal(body.mask_image_url, 'https://cdn.example.com/mask.png');
  assert.equal(body.additional_images[1], 'https://cdn.example.com/b.png');
  assert.match(body.items[0].image_url, /^https:/);
  assert.equal(client.uploads.length, 1, 'the same file is uploaded once');
});

test('missing files and non-path strings pass through', async () => {
  const client = fakeClient();
  const body = await rehostLocalPaths(client, { image_url: 'C:/nope/missing.png', resolution: '1080p', model: 'kling-video/v2.6/pro' });
  assert.deepEqual(body, { image_url: 'C:/nope/missing.png', resolution: '1080p', model: 'kling-video/v2.6/pro' });
  assert.equal(client.uploads.length, 0);
});

test('remote connector: a local path throws the routing hint instead of reaching the API', async () => {
  const client = fakeClient();
  await assert.rejects(
    rehostLocalPaths(client, { image_url: 'C:/Users/me/shot.png' }, { allowLocalFiles: false }),
    /Upload the file|unreachable|absolute/i
  );
});

test('withLocalRehost wraps post() and inherits the rest of the client', async () => {
  const client = fakeClient();
  const wrapped = withLocalRehost(client);
  const res = await wrapped.post('/v1/edit/image', { image_url: tmp, operation: 'face_swap' });
  assert.match(res.body.image_url, /^https:/);
  assert.equal(typeof wrapped.postMultipart, 'function');
  assert.equal(looksLikeLocalFile('/tmp/a.mp4'), true);
  assert.equal(looksLikeLocalFile('kling-video/v2.6/pro'), false);
});
