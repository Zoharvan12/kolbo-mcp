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

test('lipsync card shows the face source and audio, uploading local files first', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kolbo-lipsync-refs-'));
  const video = path.join(dir, 'face.mp4');
  const audio = path.join(dir, 'voice.mp3');
  fs.writeFileSync(video, 'fixture');
  fs.writeFileSync(audio, 'fixture');
  let lipsync, submitted;
  try {
    registerGenerateTools({ tool(name, ...args) { if (name === 'generate_lipsync') lipsync = args.at(-1); } }, {
      async get() { return { models: [] }; },
      async postMultipart(route, form) { return { media: { url: `https://media.kolbo.ai/${form._streams.join('').includes('voice.mp3') ? 'voice.mp3' : 'face.mp4'}` } }; },
      async post(route, body) { submitted = body; return { generation_id: 'lipsync-refs' }; },
    }, { apps: true });
    const fromVideo = await lipsync({ source: video, audio, model: 'pixverse-lipsync' });
    assert.equal(submitted.source_url, 'https://media.kolbo.ai/face.mp4');
    assert.deepEqual(fromVideo.structuredContent.reference_videos, ['https://media.kolbo.ai/face.mp4']);
    assert.deepEqual(fromVideo.structuredContent.reference_audio, ['https://media.kolbo.ai/voice.mp3']);
    assert.equal(fromVideo.structuredContent.reference_images, undefined);
    const fromImage = await lipsync({ source: 'https://media.kolbo.ai/face.png', audio: 'https://media.kolbo.ai/a.mp3', model: 'pixverse-lipsync' });
    assert.deepEqual(fromImage.structuredContent.reference_images, ['https://media.kolbo.ai/face.png']);
    assert.deepEqual(fromImage.structuredContent.reference_audio, ['https://media.kolbo.ai/a.mp3']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
