const test = require('node:test');
const assert = require('node:assert/strict');
const { uiCompleted } = require('../src/tools/_shared');
const base = { client: { get: async () => ({ models: [] }) }, tool: 'get_generation_status', kind: 'video', model: 'test' };
test('completed status preserves server-resolved DNA chips', async () => {
  const result = await uiCompleted({ ...base, visual_dnas: [{ id: 'dna1', name: 'Nova' }] }, '{}');
  assert.equal(result.structuredContent.visual_dnas[0].name, 'Nova');
});
test('unknown reference metadata does not erase previously shown DNA chips', async () => {
  const result = await uiCompleted(base, '{}');
  assert.equal(Object.hasOwn(result.structuredContent, 'visual_dnas'), false);
});
