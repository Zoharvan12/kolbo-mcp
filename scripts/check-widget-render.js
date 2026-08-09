#!/usr/bin/env node
/**
 * check-widget-render.js
 *
 * The widget UIs are browser JS carried inside template strings, so nothing in
 * the normal Node path ever parses or runs them — a broken escape or a broken
 * render path ships silently and only shows up as a dead card in claude.ai.
 *
 * This does two things:
 *   1. Parses every <script> block of every widget (syntax guard).
 *   2. Runs the generation widget against a tiny DOM stub and asserts the two
 *      behaviours that regressed:
 *        - a prompts[] batch stays ONE grouped tile grid through completion,
 *          with each tile still captioned by the prompt that produced it;
 *        - an offscreen card does not call the status tool (or fetch media)
 *          until it scrolls into view.
 *
 *   node scripts/check-widget-render.js
 */

const assert = require('assert');
const { widgetHtml, UI } = require('../src/apps');

const blocks = (html) => html.split('<script>').slice(1).map((s) => s.split('</script>')[0]);

// ── 1. syntax guard ─────────────────────────────────────────────────────────
for (const uri of Object.values(UI)) {
  blocks(widgetHtml(uri)).forEach((src, i) => {
    try { new Function(src); }
    catch (e) { throw new Error(`${uri} script block ${i} does not parse: ${e.message}`); }
  });
}

// ── 2. generation widget behaviour ──────────────────────────────────────────
function stubEl() {
  const e = {
    innerHTML: '', textContent: '', title: '', value: '', disabled: false,
    placeholder: '', style: { setProperty() {} }, attrs: {},
    scrollHeight: 0, clientHeight: 0, scrollWidth: 0, clientWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { e.attrs[k] = v; }, getAttribute: (k) => e.attrs[k] ?? null,
    addEventListener() {}, focus() {}, pause() {},
    getBoundingClientRect: () => ({ bottom: 0 }),
    querySelector: () => stubEl(), querySelectorAll: () => [],
  };
  return e;
}

const ids = new Map();
const calls = [];
let ioCallback = null;
const timers = [];

const document = {
  documentElement: { classList: { toggle() {} } },
  getElementById: (id) => (ids.has(id) || ids.set(id, stubEl()), ids.get(id)),
  querySelector: () => stubEl(),
  addEventListener() {},
};
const window = {
  IntersectionObserver: class { constructor(cb) { ioCallback = cb; } observe() {} disconnect() {} },
  kolbo: {
    ready: (f) => f(null),
    onToolResult(f) { window.__onResult = f; },
    onToolInput() {}, onThemeChange() {},
    callTool(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(window.__status) }] });
    },
    sendMessage() {}, openLink() {}, updateModelContext() {}, notifySize() {},
    requestDisplayMode: () => Promise.resolve({ mode: 'inline' }),
  },
};

const src = blocks(widgetHtml(UI.generation)).slice(1).join('\n'); // skip the host bridge
new Function('window', 'document', 'setTimeout', 'clearTimeout', 'IntersectionObserver', src)(
  window, document,
  (fn, ms) => timers.push({ fn, ms: ms || 0 }),
  () => {},
  window.IntersectionObserver
);

const PROMPTS = ['a red fox in snow', 'a blue whale at dusk', 'a green hill at noon'];
const IDS = ['gen-1', 'gen-2', 'gen-3'];
const URLS = IDS.map((id) => `https://media.kolbo.ai/${id}.png`);

window.__status = {
  all_done: true,
  generations: IDS.map((id, i) => ({
    generation_id: id, state: 'completed', credits_used: 2,
    result: { urls: [URLS[i]] },
  })),
};

window.__onResult({
  structuredContent: {
    phase: 'generating', widget: 'generation', kind: 'image', tool: 'generate_image',
    generation_id: IDS[0], poll_tool: 'get_generation_status',
    status_args: { generation_ids: IDS, wait: true },
    generation_ids: IDS, prompts: PROMPTS, count: IDS.length, model: 'nano-banana-2',
  },
});

// Offscreen: the card rendered its skeletons but must not have touched the
// network. Only fire timers due within `maxMs` — the widget's own 8s
// never-observed fallback must not stand in for a real scroll.
function drain(maxMs = 2000) {
  for (let i = 0; i < timers.length; i++) {
    if (timers[i].ms > maxMs) continue;
    timers.splice(i--, 1)[0].fn();
  }
}
drain();
assert.strictEqual(calls.length, 0, 'offscreen card polled before it was visible');

// Scroll into view → polling starts.
ioCallback([{ isIntersecting: true }]);
drain();
assert.strictEqual(calls.length, 1, 'visible card did not poll exactly once');
assert.deepStrictEqual(calls[0].args.generation_ids, IDS, 'batch polled ids individually');

setImmediate(() => {
  const stage = document.getElementById('stage').innerHTML;
  assert.strictEqual(
    (stage.match(/k-gen-grid/g) || []).length, 1,
    'completed batch did not render as ONE grouped grid'
  );
  assert.ok(!/k-thumbs/.test(stage), 'completed batch collapsed into the scenes carousel');
  URLS.forEach((u) => assert.ok(stage.includes(u), `batch grid dropped ${u}`));
  PROMPTS.forEach((p) => assert.ok(stage.includes(p), `batch grid lost the caption "${p}"`));
  assert.ok(/loading="lazy"/.test(stage), 'batch tiles are not lazy-loaded');
  console.log('✓ widget scripts parse; batch stays one grouped grid; offscreen cards stay idle');
});
