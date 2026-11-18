const test = require('node:test');
const assert = require('node:assert');
const { uiGenerating } = require('../src/tools/_shared');

const client = { get: async () => ({ state: 'completed', credits_used: 3, result: { urls: ['https://media.kolbo.ai/x.png'] } }) };
const base = { gen: { generation_id: 'g1' }, client, model: 'm', prompt: 'p', settings: {} };

test('a fast image returns the finished card, not a polling one', async () => {
  const r = await uiGenerating({ ...base, tool: 'generate_image', kind: 'image' });
  assert.strictEqual(r.structuredContent.phase, 'completed');
  assert.deepStrictEqual(r.structuredContent.urls, ['https://media.kolbo.ai/x.png']);
  assert.strictEqual(r.structuredContent.poll_tool, undefined);
});

test('video keeps the polling card', async () => {
  const r = await uiGenerating({ ...base, tool: 'generate_video', kind: 'video' });
  assert.strictEqual(r.structuredContent.phase, 'generating');
});
