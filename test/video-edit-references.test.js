const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerGenerateTools } = require('../src/tools/generate');

for (const apps of [true, false]) {
  test(`video edit preserves source, mask, face and audio references (apps=${apps})`, async () => {
    let edit;
    const client = {
      async get() { return { state: 'completed', result: { urls: ['https://media.kolbo.ai/output.mp4'] } }; },
      async post() { return { generation_id: 'edit-refs' }; },
    };
    registerGenerateTools({ tool(name, ...args) { if (name === 'edit_video') edit = args.at(-1); } }, client, { apps, remote: true });
    const result = await edit({ operation: 'upscale', video_url: 'https://media.kolbo.ai/source.mp4',
      mask_video_url: 'https://media.kolbo.ai/mask.mp4', image_url: 'https://media.kolbo.ai/face.png',
      audio_url: 'https://media.kolbo.ai/voice.mp3' });
    assert.deepEqual(result.structuredContent.reference_videos, ['https://media.kolbo.ai/source.mp4', 'https://media.kolbo.ai/mask.mp4']);
    assert.deepEqual(result.structuredContent.reference_images, ['https://media.kolbo.ai/face.png']);
    assert.deepEqual(result.structuredContent.reference_audio, ['https://media.kolbo.ai/voice.mp3']);
  });
}

test('local edit source is uploaded once and its CDN URL reaches both API and widget', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kolbo-edit-refs-'));
  const source = path.join(dir, 'source.mp4');
  fs.writeFileSync(source, 'fixture');
  let edit, submitted, uploads = 0;
  const cdn = 'https://media.kolbo.ai/uploaded.mp4';
  try {
    registerGenerateTools({ tool(name, ...args) { if (name === 'edit_video') edit = args.at(-1); } }, {
      async get() { return { models: [] }; },
      async postMultipart() { uploads++; return { media: { url: cdn } }; },
      async post(route, body) { submitted = body; return { generation_id: 'local-edit' }; },
    }, { apps: true });
    const result = await edit({ operation: 'upscale', video_url: source });
    assert.equal(uploads, 1);
    assert.equal(submitted.video_url, cdn);
    assert.deepEqual(result.structuredContent.reference_videos, [cdn]);
    assert.ok(!JSON.stringify(result.structuredContent).includes(source));
  } finally {
    fs.unlinkSync(source);
    fs.rmdirSync(dir);
  }
});
