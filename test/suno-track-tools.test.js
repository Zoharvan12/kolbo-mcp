'use strict';
// Suno track tools (2026-10-30): each tool hits its SDK route with the snake_case body the
// API reads, and generate_music forwards the new V6 fields untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerGenerateTools } = require('../src/tools/generate');
const { TOOL_ANNOTATIONS } = require('../src/toolAnnotations');
const { TOOL_WIDGETS } = require('../src');

function harness(reply) {
  const tools = new Map(); const requests = [];
  const stop = new Error('STOP_BEFORE_PAID_SUBMISSION');
  const record = (method) => async (url, body) => {
    requests.push({ method, url, body });
    if (reply) return reply(method, url, body);
    throw stop;
  };
  const client = { apiBase: `test-${Math.random()}`, get: record('GET'), post: record('POST') };
  registerGenerateTools({ tool(name, description, schema, handler) { tools.set(name, { description, schema, handler }); } }, client, { asyncGenerations: true });
  return { tools, requests, stop };
}

const GEN = '6a0000000000000000000001';

test('async Suno ops post to their SDK route with the snake_case body', async () => {
  const cases = [
    ['add_vocals', { generation_id: GEN, audio_id: 'a1', title: 'T', style: 'soul', variety: 2, vocal_gender: 'female' },
      '/v1/generate/music/add-vocals', { generation_id: GEN, audio_id: 'a1', title: 'T', style: 'soul', variety: 2, vocal_gender: 'female' }],
    ['add_instrumental', { audio_url: 'https://x/a.mp3', rights_confirmed: true, title: 'T', tags: 'piano' },
      '/v1/generate/music/add-instrumental', { audio_url: 'https://x/a.mp3', rights_confirmed: true, title: 'T', tags: 'piano' }],
    ['replace_music_section', { generation_id: GEN, audio_id: 'a1', start: 10, end: 25.5, lyrics: 'new', full_lyrics: 'all' },
      '/v1/generate/music/replace-section', { generation_id: GEN, audio_id: 'a1', start: 10, end: 25.5, lyrics: 'new', full_lyrics: 'all' }],
    ['export_music_wav', { generation_id: GEN, audio_id: 'a1' }, `/v1/music/${GEN}/wav`, { audio_id: 'a1' }],
    ['make_music_video', { generation_id: GEN, audio_id: 'a1', author: 'Me', domain_name: 'kolbo.ai' }, `/v1/music/${GEN}/video`, { audio_id: 'a1', author: 'Me', domain_name: 'kolbo.ai' }],
    ['generate_music_midi', { generation_id: GEN, audio_id: 'stem' }, `/v1/music/${GEN}/midi`, { audio_id: 'stem' }],
  ];
  for (const [name, args, url, body] of cases) {
    const { tools, requests, stop } = harness();
    await assert.rejects(tools.get(name).handler(args), (e) => e === stop, name);
    assert.equal(requests[0].method, 'POST', name);
    assert.equal(requests[0].url, url, name);
    assert.deepEqual(requests[0].body, body, name);
  }
});

test('async Suno ops return the submitted envelope pointing at get_generation_status', async () => {
  const { tools } = harness(() => ({ generation_id: 'g-new', session_id: 's1', poll_interval_hint: 8 }));
  const out = await tools.get('export_music_wav').handler({ generation_id: GEN, audio_id: 'a1' });
  assert.equal(out.structuredContent.status, 'submitted');
  assert.equal(out.structuredContent.generation_id, 'g-new');
  assert.equal(out.structuredContent.poll_tool, 'get_generation_status');
});

test('local guards: add_instrumental needs a style, replace needs prompt or lyrics (no request sent)', async () => {
  const { tools, requests } = harness();
  await assert.rejects(tools.get('add_instrumental').handler({ generation_id: GEN, audio_id: 'a', title: 'T' }), /tags/);
  await assert.rejects(tools.get('replace_music_section').handler({ generation_id: GEN, audio_id: 'a', start: 0, end: 20 }), /prompt or lyrics/);
  assert.equal(requests.length, 0);
});

test('sync tools: timed lyrics, personas', async () => {
  const { tools, requests } = harness((method, url) => ({ success: true, url }));
  await tools.get('get_timed_lyrics').handler({ generation_id: GEN, audio_id: 'a 1' });
  await tools.get('create_music_persona').handler({ generation_id: GEN, audio_id: 'a1', name: 'Nova', description: 'warm alto', vocal_start: 5, vocal_end: 20 });
  await tools.get('list_music_personas').handler({});
  await tools.get('list_music_personas').handler({ page: 2, limit: 10 });
  assert.deepEqual(requests.map((r) => `${r.method} ${r.url}`), [
    `GET /v1/music/${GEN}/timed-lyrics?audio_id=a%201`,
    'POST /v1/music/personas',
    'GET /v1/music/personas',
    'GET /v1/music/personas?page=2&limit=10',
  ]);
  assert.deepEqual(requests[1].body, { generation_id: GEN, audio_id: 'a1', name: 'Nova', description: 'warm alto', vocal_start: 5, vocal_end: 20 });
});

test('generate_music forwards variety, persona_voice_id and reference_* unchanged', async () => {
  const { tools, requests, stop } = harness();
  const tool = tools.get('generate_music');
  for (const k of ['variety', 'persona_voice_id', 'reference_images', 'reference_videos', 'reference_audios']) assert.ok(tool.schema[k], k);
  assert.equal(tool.schema.variety.safeParse(5).success, false);
  assert.equal(tool.schema.variety.safeParse(1.5).success, false);
  assert.equal(tool.schema.reference_images.safeParse(['1', '2', '3', '4', '5', '6']).success, false);
  assert.equal(tool.schema.reference_videos.safeParse(['1', '2']).success, false);
  await assert.rejects(tool.handler({ prompt: 'p', model: 'suno-v6', variety: 3, persona_voice_id: 'v1',
    reference_images: ['https://x/1.png'], reference_videos: ['https://x/v.mp4'], reference_audios: ['https://x/a.mp3'] }), (e) => e === stop);
  const body = requests.find((r) => r.url === '/v1/generate/music').body;
  assert.equal(body.variety, 3);
  assert.equal(body.persona_voice_id, 'v1');
  assert.deepEqual(body.reference_images, ['https://x/1.png']);
  assert.deepEqual(body.reference_videos, ['https://x/v.mp4']);
  assert.deepEqual(body.reference_audios, ['https://x/a.mp3']);
});

test('import_music_audio returns its JSON (was a ReferenceError on an undefined helper)', async () => {
  const { tools } = harness(() => ({ success: true, upload_id: 'u1' }));
  const out = await tools.get('import_music_audio').handler({ audio_url: 'https://x/a.mp3', rights_confirmed: true });
  assert.equal(JSON.parse(out.content[0].text).upload_id, 'u1');
});

test('every new tool has a safety annotation; card tools are widget-mapped, MIDI is not', () => {
  const names = ['add_vocals', 'add_instrumental', 'replace_music_section', 'export_music_wav', 'make_music_video',
    'generate_music_midi', 'get_timed_lyrics', 'create_music_persona', 'list_music_personas'];
  for (const n of names) assert.ok(TOOL_ANNOTATIONS[n], n);
  assert.equal(TOOL_ANNOTATIONS.list_music_personas.readOnlyHint, true);
  assert.equal(TOOL_ANNOTATIONS.get_timed_lyrics.readOnlyHint, false, 'paid once per track');
  for (const n of ['add_vocals', 'add_instrumental', 'replace_music_section', 'export_music_wav', 'make_music_video']) assert.ok(TOOL_WIDGETS[n], n);
  assert.equal(TOOL_WIDGETS.generate_music_midi, undefined);
});
