const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalModelId } = require('../src/apps');

// Morphious rows can be unpublished (isHidden) in /v1/models while a visible kolbo-* model
// exists. The near-miss check used to throw "Unknown model identifier" before the request.
test('native Morphious/Genjutsu ids pass through a real catalog that omits them', async () => {
  const client = {
    apiBase: 'https://catalog-without-morphious.example',
    async request() { return { models: [{ identifier: 'kolbo-auto-smart', name: 'Kolbo Auto Smart', type: ['code'] }] }; },
  };
  for (const id of ['kolbo-morphious-motion', 'kolbo-morphious-swap', 'kolbo-morphious-reframe',
    'kolbo-morphious-lite-motion', 'kolbo-morphious-lite-swap', 'higgsfield-genjutsu-motion-transfer']) {
    assert.equal(await canonicalModelId(client, id, 'elements'), id);
  }
  await assert.rejects(canonicalModelId(client, 'kolbo-made-up-model', 'elements'), /Unknown model identifier/);
});
