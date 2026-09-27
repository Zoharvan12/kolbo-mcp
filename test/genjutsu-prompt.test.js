const test = require('node:test');
const assert = require('node:assert/strict');
const { registerGenerateTools } = require('../src/tools/generate');
const { validateVideoPrompt } = require('../src/tools/video-prompt');

function fixture() {
  const tools = {};
  const calls = [];
  registerGenerateTools({ tool(name, description, schema, handler) { tools[name] = { description, schema, handler }; } }, {
    async get() { throw new Error('catalog unavailable'); },
    async post(path, body) { calls.push({ path, body }); return { generation_id: 'native-test', status: 'processing' }; },
  }, { remote: true, asyncGenerations: true, apps: true });
  return { tools, calls };
}

test('native Elements accepts omitted prompt and forwards source references without duration/aspect defaults', async () => {
  const { tools, calls } = fixture();
  assert.equal(tools.generate_elements.schema.prompt.parse(undefined), undefined);
  assert.doesNotThrow(() => validateVideoPrompt({}));
  await tools.generate_elements.handler({ model: 'higgsfield-genjutsu-motion-transfer', reference_videos: ['https://cdn.example/source.mp4'], reference_images: ['https://cdn.example/character.png'], resolution: '480p' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/v1/generate/elements');
  assert.equal(calls[0].body.prompt, '');
  assert.equal(calls[0].body.duration, undefined);
  assert.equal(calls[0].body.aspect_ratio, undefined);
  assert.deepEqual(calls[0].body.reference_videos, ['https://cdn.example/source.mp4']);
});

test('other Elements models still reject missing/empty prompt before generation submission', async () => {
  for (const model of ['seedance-2-5', 'seedance-2-5-multilingual', 'kolbo-morphious-unknown', undefined]) {
    const { tools, calls } = fixture();
    for (const prompt of [undefined, '']) await assert.rejects(tools.generate_elements.handler({ model, prompt }), /prompt is required/);
    assert.equal(calls.length, 0);
  }
});

test('native DNA-only input and explicit prompt remain untouched', async () => {
  const { tools, calls } = fixture();
  await tools.generate_elements.handler({ model: 'higgsfield-genjutsu-motion-transfer', prompt: 'Keep the motion.', reference_videos: ['https://cdn.example/source.mp4'], visual_dna_ids: ['owned-dna'], resolution: '720p' });
  assert.equal(calls[0].body.prompt, 'Keep the motion.');
  assert.deepEqual(calls[0].body.visual_dna_ids, ['owned-dna']);
  assert.match(tools.generate_elements.description, /higgsfield-genjutsu-motion-transfer and higgsfield-genjutsu-object-swap accept an omitted prompt/);
  assert.match(tools.generate_video_from_video.schema.prompt.description, /higgsfield-genjutsu-motion-transfer/);
});

test('native Object Swap accepts omitted Elements and V2V prompts with unchanged reference identity', async () => {
  const { tools, calls } = fixture();
  const model = 'higgsfield-genjutsu-object-swap';
  await tools.generate_elements.handler({ model, reference_videos: ['https://cdn.example/source.mp4'], visual_dna_ids: ['owned-dna'], resolution: '480p' });
  assert.equal(calls[0].body.model, model);
  assert.equal(calls[0].body.prompt, '');
  assert.deepEqual(calls[0].body.visual_dna_ids, ['owned-dna']);
  await tools.generate_video_from_video.handler({ model, source_video: 'https://cdn.example/source.mp4', reference_images: ['https://cdn.example/object.png'], resolution: '720p' });
  assert.equal(calls[1].path, '/v1/generate/video-from-video');
  assert.equal(calls[1].body.model, model);
  assert.equal(calls[1].body.prompt, undefined);
  assert.equal(calls[1].body.duration, undefined);
  assert.equal(calls[1].body.aspect_ratio, undefined);
  assert.match(tools.generate_video_from_video.schema.prompt.description, /higgsfield-genjutsu-object-swap/);
});

for (const model of ['kolbo-morphious-motion', 'kolbo-morphious-swap', 'kolbo-morphious-reframe', 'kolbo-morphious-lite-motion', 'kolbo-morphious-lite-swap']) {
  test(`${model} accepts blank or written prompts through Elements and V2V without local synthesis`, async () => {
    const { tools, calls } = fixture();
    for (const prompt of [undefined, '', 'Replace only the cup. Keep the people unchanged.']) {
      const references = model.endsWith('reframe') ? [] : ['https://cdn.example/reference.png'];
      await tools.generate_elements.handler({ model, prompt, reference_videos: ['https://cdn.example/source.mp4'], reference_images: references, resolution: model.endsWith('reframe') ? '540p' : '480p' });
      const elements = calls.at(-1);
      assert.equal(elements.path, '/v1/generate/elements');
      assert.equal(elements.body.prompt, prompt ?? '');
      assert.deepEqual(elements.body.reference_images || [], references);
      assert.equal(elements.body.duration, undefined);
      await tools.generate_video_from_video.handler({ model, prompt, source_video: 'https://cdn.example/source.mp4', reference_images: references });
      assert.equal(calls.at(-1).path, '/v1/generate/video-from-video');
      assert.equal(calls.at(-1).body.prompt, prompt);
      assert.equal(calls.at(-1).body.model, model);
    }
    assert.match(tools.generate_elements.description, /Morphious only/);
    assert.match(tools.generate_elements.schema.prompt.description, /kolbo-morphious/);
  });
}
