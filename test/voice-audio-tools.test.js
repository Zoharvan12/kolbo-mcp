const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAnalyzeTools } = require('../src/tools/analyze');
const { registerGenerateTools } = require('../src/tools/generate');

function tools(post) {
  const t = {};
  const server = { tool: (name, _d, _s, handler) => { t[name] = { handler }; }, _registeredTools: {} };
  const client = { post, get: async () => ({ status: 'completed', result: { urls: ['https://cdn.test/out.mp3'] } }) };
  registerAnalyzeTools(server, client);
  registerGenerateTools(server, client, { asyncGenerations: true });
  return t;
}

test('analyze_audio posts to /v1/analyze/audio and needs a source', async () => {
  const calls = [];
  const t = tools(async (path, body) => { calls.push({ path, body }); return { analysis: 'ok' }; });
  assert.equal((await t.analyze_audio.handler({})).isError, true);
  await t.analyze_audio.handler({ audio_url: 'https://x.test/a.mp3', prompt: 'mood?' });
  assert.deepEqual(calls, [{ path: '/v1/analyze/audio', body: { audio_url: 'https://x.test/a.mp3', prompt: 'mood?' } }]);
});

test('change_voice needs exactly one target and posts to /v1/audio/voice-change', async () => {
  const calls = [];
  const t = tools(async (path, body) => { calls.push({ path, body }); return { generation_id: 'g1' }; });
  assert.equal((await t.change_voice.handler({ audio_url: 'https://x.test/a.mp3' })).isError, true);
  assert.equal((await t.change_voice.handler({ audio_url: 'https://x.test/a.mp3', visual_dna_id: 'd', target_audio_url: 'https://x.test/v.mp3' })).isError, true);
  assert.equal(calls.length, 0);
  await t.change_voice.handler({ audio_url: 'https://x.test/a.mp3', target_audio_url: 'https://x.test/v.mp3' }).catch(() => {});
  assert.equal(calls[0].path, '/v1/audio/voice-change');
});
