const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAvatarTools } = require('../src/tools/avatars');

test('retired portrait tools answer without calling the removed /portraits routes', async () => {
  const tools = {};
  const calls = [];
  const client = new Proxy({}, { get: (_t, method) => async (path) => { calls.push(`${method} ${path}`); return {}; } });
  registerAvatarTools({ tool: (name, _d, _s, fn) => { tools[name] = fn; } }, client);
  for (const [name, args] of [['regenerate_avatar_portraits', { avatar_id: 'a1' }], ['pick_avatar_portrait', { avatar_id: 'a1', url: 'https://x.test/p.png' }]]) {
    const out = JSON.parse((await tools[name](args)).content[0].text);
    assert.equal(out.changed, false);
  }
  assert.deepEqual(calls, []);
});
