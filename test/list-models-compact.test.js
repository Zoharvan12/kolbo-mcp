const test = require('node:test');
const assert = require('node:assert/strict');
const { registerModelTools } = require('../src/tools/models');

const models = [
  { identifier: 'img-a', name: 'Image A', types: ['text_to_img'], credit: 2, summary: 'Fast photoreal stills. '.repeat(20),
    supported_resolutions: ['1K', '2K'], supported_aspect_ratios: ['1:1', '9:16'], max_reference_images: 4 },
  { identifier: 'img-b', name: 'Image B', types: ['text_to_img'], credit: 5, summary: '',
    supported_resolutions: ['4K'], max_reference_images: 0 },
];

function listModels() {
  let handler;
  registerModelTools({ tool: (name, _d, _s, fn) => { if (name === 'list_models') handler = fn; } },
    { get: async () => ({ count: models.length, models }) });
  return handler;
}

test('a typed list carries one line per model and no spec lines', async () => {
  const { content: [{ text }] } = await listModels()({ type: 'text_to_img' });
  assert.match(text, /img-a \(Image A\) - 2 credits — Fast photoreal/);
  assert.match(text, /^img-b \(Image B\) - 5 credits$/m);
  assert.doesNotMatch(text, /resolutions:|max_reference_images:/);
  assert.ok(!text.includes(models[0].summary.trim()), 'full summary leaked into the list');
});

test('`model` returns that one model with its full summary and specs', async () => {
  const list = listModels();
  const { content: [{ text }] } = await list({ type: 'text_to_img', model: 'IMG-A' });
  assert.match(text, /resolutions: 1K · 2K/);
  assert.match(text, /max_reference_images: 4/);
  assert.ok(text.includes(models[0].summary));
  assert.doesNotMatch(text, /img-b/);

  const json = await list({ format: 'json', model: 'Image B' });
  assert.deepEqual(json.structuredContent.models.map(m => m.identifier), ['img-b']);

  const missing = await list({ model: 'nope' });
  assert.match(missing.content[0].text, /No model matches "nope"/);
});
