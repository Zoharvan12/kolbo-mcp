const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { BRIDGE_JS } = require('../src/apps/bridge');

function bridge(openai) {
  let listener, next = 0;
  const timers = new Map(), sent = [];
  const window = { openai, parent: { postMessage: m => sent.push(m) },
    addEventListener(name, fn) { if (name === 'message') listener = fn; } };
  vm.runInNewContext(BRIDGE_JS, { window, console, navigator: {},
    document: { querySelector: () => null, documentElement: {}, body: {}, addEventListener() {} },
    MutationObserver: class { observe() {} },
    setTimeout(fn, ms) { timers.set(++next, { fn, ms }); return next; },
    clearTimeout(id) { timers.delete(id); } });
  return { window, sent, timers,
    reply(id, result) { listener({ data: { jsonrpc: '2.0', id, result } }); },
    fire(ms) { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); } } };
}
const flush = () => new Promise(r => setImmediate(r));

test('JSON-RPC stalled status rejects, discards late reply, and allows recovery', async () => {
  const b = bridge(); b.reply(b.sent[0].id, {}); await flush();
  const p = b.window.kolbo.callTool('get_generation_status', { generation_id: 'existing', wait: true });
  const id = b.sent.at(-1).id;
  const rejected = assert.rejects(p, { code: 'KOLBO_HOST_TIMEOUT' });
  b.fire(240000); await rejected;
  b.reply(id, { structuredContent: { state: 'completed' } });
  const retry = b.window.kolbo.callTool('get_generation_status', { generation_id: 'existing' });
  b.reply(b.sent.at(-1).id, { structuredContent: { state: 'completed' } });
  assert.equal((await retry).structuredContent.state, 'completed');
  assert.equal([...b.timers.values()].filter(t => t.ms === 240000).length, 0);
});

test('requests queued before missing handshake expire without later submission', async () => {
  const b = bridge();
  const p = b.window.kolbo.callTool('get_generation_status', {});
  const rejected = assert.rejects(p, { code: 'KOLBO_HOST_TIMEOUT' });
  b.fire(240000); await rejected; await flush();
  b.reply(b.sent[0].id, {}); await flush();
  assert.equal(b.sent.filter(m => m.method === 'tools/call').length, 0);
});

for (const mode of ['stalled', 'success', 'throws']) test('OpenAI host: ' + mode, async () => {
  const b = bridge({ callTool() {
    if (mode === 'throws') throw new Error('host unavailable');
    return mode === 'stalled' ? new Promise(() => {}) : Promise.resolve({ state: 'completed' });
  } });
  b.fire(0); await flush();
  const p = b.window.kolbo.callTool('get_generation_status', {});
  if (mode === 'stalled') {
    const rejected = assert.rejects(p, { code: 'KOLBO_HOST_TIMEOUT' });
    b.fire(240000); await rejected;
  } else if (mode === 'throws') await assert.rejects(p, /host unavailable/);
  else assert.equal((await p).structuredContent.state, 'completed');
});

// Reuse the existing widget DOM fixture, exercising the actual generated scripts.
const harness = fs.readFileSync(require.resolve('../scripts/check-widget-render.js'), 'utf8')
  .split('// Out of credits:')[0].replace(/^#!.*\n/, '');
const { mountWidget, blocks, widgetHtml, UI } = new Function('require', harness + '\nreturn { mountWidget, blocks, widgetHtml, UI };')(require);
for (const kind of ['generation', 'transcript']) test(kind + ' backs off through host errors, pauses at the cap, completes after fresh status', async () => {
  const w = mountWidget(blocks(widgetHtml(UI[kind])).slice(1).join('\n'));
  const live = { widget: kind, phase: 'generating', kind: 'image', generation_id: 'existing' };
  w.status(() => Promise.reject(Object.assign(new Error('Host did not answer'), { code: 'KOLBO_HOST_TIMEOUT' })));
  w.deliver(live); if (kind === 'generation') w.scrollIntoView();
  // One error must NOT pause: the card keeps retrying.
  w.drain(0); await flush();
  assert.doesNotMatch(w.html('stage'), /Tracking paused/);
  for (let i = 0; i < 40; i++) { w.drain(30000); await flush(); }
  assert.match(w.html('stage'), /Tracking paused after repeated connection errors/);
  assert.match(w.html('actions'), /Check status/);
  const count = w.calls.length; w.drain(5000); await flush();
  assert.equal(w.calls.length, count, 'paused card must not resubmit or poll');
  w.status({ state: 'completed', result: { text: 'Recovered transcript', urls: ['https://cdn.kolbo.ai/test.png'] } });
  // Check status resumes tracking in the card itself — no chat round trip.
  w.click(kind === 'generation' ? 'status-btn' : 'transcript-status'); w.drain(5000); await flush();
  assert.doesNotMatch(w.html('stage'), /Tracking paused/);
  if (kind === 'transcript') assert.match(w.html('stage'), /Recovered transcript/);
  assert.ok(w.calls.every(c => c.name === 'get_generation_status'));
  // Every wait window fits a host request timeout that ignores progress ticks.
  assert.ok(w.calls.every(c => c.args.wait_seconds === 45));
});

