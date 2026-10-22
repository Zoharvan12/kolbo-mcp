const test = require('node:test');
const assert = require('node:assert/strict');
const { registerPresetTools } = require('../src/tools/presets');

// Hosts mount list_presets' grid from the tool declaration on every call, so
// the search lookup must ship structuredContent too — with real thumbnails and
// the filtered total, not the catalog total.
test('list_presets lookup ships thumbnails, ids and the filtered total', async () => {
  let handler;
  const presets = Array.from({ length: 74 }, (_, i) => ({
    id: 'p' + i, name: i < 2 ? 'Character Sheet ' + i : 'Other ' + i, category: 'image',
    thumbnail_url: 'https://cdn.kolbo.ai/p' + i + '.png',
  }));
  const client = { async get() { return { presets, count: 74 }; } };
  registerPresetTools({ tool(name, ...args) { if (name === 'list_presets') handler = args.at(-1); } }, client, { apps: true });
  const res = await handler({ type: 'image', search: 'character sheet' });
  const sc = res.structuredContent;
  assert.ok(sc, 'lookup must carry structuredContent');
  assert.equal(sc.total, 2);
  assert.deepEqual(sc.items.map(i => i.id), ['p0', 'p1']);
  assert.ok(sc.items.every(i => i.thumbnail && i.url));
  assert.match(sc.note, /preset_id/);
});
