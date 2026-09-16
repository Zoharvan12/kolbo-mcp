const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVideoPrompt } = require('../src/tools/video-prompt');
const { registerGenerateTools } = require('../src/tools/generate');

const prompt = 'Total: 7s / 1 shot / 9:16\nSingle continuous shot.\nSHOT 1 — 0s–7s\nZoom in, then dolly out.\nTotal: 7s / 1 shot / 9:16';

test('continuous hook matches the exact tool options and leaves prose untouched', () => {
  assert.doesNotThrow(() => validateVideoPrompt({ prompt, duration: 7, aspect_ratio: '9:16', multi_shots: false }));
});
test('legacy free-form prompts and omitted options remain supported', () => {
  assert.doesNotThrow(() => validateVideoPrompt({ prompt: 'A person walks through a field.', duration: 8 }));
  assert.doesNotThrow(() => validateVideoPrompt({ prompt }));
});
test('conflicting explicit options fail before submission', () => {
  for (const options of [{ duration: 8 }, { aspect_ratio: '16:9' }, { multi_shots: true }, { multi_shot_count: 2 }]) {
    assert.throws(() => validateVideoPrompt({ prompt, ...options }), /before submission/);
  }
  assert.throws(() => validateVideoPrompt({ prompt: prompt + '\nSHOT 2' }), /SHOT headings/);
  assert.throws(() => validateVideoPrompt({ prompt: prompt + '\nTotal: 8s / 1 shot / 9:16' }), /declarations disagree/);
});
test('Elements handler rejects contradictions before catalog lookup or billable calls', async () => {
  const handlers = {};
  registerGenerateTools({ tool(name, description, schema, handler) { handlers[name] = handler; } }, new Proxy({}, {
    get() { throw new Error('Unexpected API access'); },
  }));
  await assert.rejects(handlers.generate_elements({ prompt, duration: 8, model: 'seedance-2-5' }), /before submission/);
});
