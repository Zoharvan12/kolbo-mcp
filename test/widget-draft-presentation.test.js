const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { generationWidgetHtml } = require('../src/apps/widgets/generation');
const html = generationWidgetHtml();
const source = html.slice(html.indexOf('function resolutionLabel(sc)'), html.indexOf('function renderChips(sc)'));
const context = {}; vm.runInNewContext(source, context);
test('draft tier labels stay distinct from ordinary 480p and finalization', () => {
  const label = context.resolutionLabel;
  assert.equal(label({ settings: { resolution: '480p-draft' }, model: 'seedance-2-5' }), '480p Draft');
  assert.equal(label({ settings: { resolution: '480p' }, model: 'seedance-2-5-draft' }), '480p Draft');
  assert.equal(label({ settings: { resolution: '480p' }, model: 'seedance-2-5' }), '480p');
  assert.equal(label({ settings: { resolution: '1080p' }, model: 'seedance-2-5-draft-enhance' }), '1080p');
});
test('long prompt can expand even when host iframe reports zero layout', () => {
  let tools;
  const node = { id: 'prompt', classList: { remove() {}, add() {} }, removeAttribute() {},
    scrollHeight: 0, clientHeight: 0, scrollWidth: 0, clientWidth: 0,
    parentNode: { insertBefore(value) { tools = value; } } };
  const sandbox = { document: { createElement: () => ({ querySelector: () => null }) }, ICONS: { copy: '', chevronDown: '' }, stripTools() {} };
  const start = html.indexOf('function makeExpandable(node, raw)');
  const end = html.indexOf('function renderList(sc)', start);
  vm.runInNewContext(html.slice(start, end), sandbox);
  sandbox.makeExpandable(node, 'Full prompt '.repeat(100));
  assert.match(tools.innerHTML, /data-act="expand"/);
  assert.match(html, /white-space: pre-wrap/);
});

test('Elements submits the explicit draft tier and preserves full prompt in its widget', async () => {
  const { registerGenerateTools } = require('../src/tools/generate');
  let generate;
  const server = { tool(name, ...args) { if (name === 'generate_elements') generate = args.at(-1); } };
  const calls = [];
  const client = {
    async get() { return { models: [] }; },
    async post(url, body) { calls.push({ url, body }); return { generation_id: 'draft-widget', session_id: 'session' }; },
  };
  registerGenerateTools(server, client, { remote: true, apps: true });
  const prompt = '1 shot, 7s total, 9:16. ' + 'A quiet documentary shot. '.repeat(150);
  const result = await generate({ prompt, model: 'seedance-2-5', resolution: '480p-draft', duration: 7, aspect_ratio: '9:16' });
  assert.equal(calls[0].body.resolution, '480p-draft');
  assert.equal(result.structuredContent.settings.resolution, '480p-draft');
  assert.equal(result.structuredContent.prompt, prompt);
});
