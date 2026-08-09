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
 *   2. Runs the generation widget against a tiny DOM stub and asserts the
 *      behaviours that regressed:
 *        - a prompts[] batch stays ONE grouped tile grid through completion,
 *          with each tile still captioned by the prompt that produced it;
 *        - an offscreen card does not call the status tool (or fetch media)
 *          until it scrolls into view;
 *        - a completed card reports the model and voice that ACTUALLY RAN,
 *          by clean name + icon/portrait — never a raw id ("google_tts",
 *          "he-IL-Chirp3-HD-…") and never the stale "Smart Select" guess the
 *          generating phase showed.
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

// One isolated widget instance (its own DOM, timers, IntersectionObserver and
// recorded tool calls) so independent scenarios cannot leak state into each
// other — the widget script keeps module-level state per card.
const genSrc = blocks(widgetHtml(UI.generation)).slice(1).join('\n'); // skip the host bridge
function mountWidget() {
  const ids = new Map();
  const calls = [];
  const timers = [];
  let ioCallback = null;

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

  new Function('window', 'document', 'setTimeout', 'clearTimeout', 'IntersectionObserver', genSrc)(
    window, document,
    (fn, ms) => timers.push({ fn, ms: ms || 0 }),
    () => {},
    window.IntersectionObserver
  );

  return {
    calls,
    html: (id) => document.getElementById(id).innerHTML,
    deliver: (structuredContent) => window.__onResult({ structuredContent }),
    status: (s) => { window.__status = s; },
    scrollIntoView: () => ioCallback([{ isIntersecting: true }]),
    // Only fire timers due within `maxMs` — the widget's own 8s never-observed
    // fallback must not stand in for a real scroll.
    drain(maxMs = 2000) {
      for (let i = 0; i < timers.length; i++) {
        if (timers[i].ms > maxMs) continue;
        timers.splice(i--, 1)[0].fn();
      }
    },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

async function batchStaysOneGrid() {
  const PROMPTS = ['a red fox in snow', 'a blue whale at dusk', 'a green hill at noon'];
  const IDS = ['gen-1', 'gen-2', 'gen-3'];
  const URLS = IDS.map((id) => `https://media.kolbo.ai/${id}.png`);

  const w = mountWidget();
  w.status({
    all_done: true,
    generations: IDS.map((id, i) => ({
      generation_id: id, state: 'completed', credits_used: 2,
      result: { urls: [URLS[i]] },
    })),
  });
  w.deliver({
    phase: 'generating', widget: 'generation', kind: 'image', tool: 'generate_image',
    generation_id: IDS[0], poll_tool: 'get_generation_status',
    status_args: { generation_ids: IDS, wait: true },
    generation_ids: IDS, prompts: PROMPTS, count: IDS.length,
    model: 'nano-banana-2', model_name: 'Nano Banana 2',
  });

  // Offscreen: the card rendered its skeletons but must not have touched the network.
  w.drain();
  assert.strictEqual(w.calls.length, 0, 'offscreen card polled before it was visible');

  w.scrollIntoView();
  w.drain();
  assert.strictEqual(w.calls.length, 1, 'visible card did not poll exactly once');
  assert.deepStrictEqual(w.calls[0].args.generation_ids, IDS, 'batch polled ids individually');

  await flush();
  const stage = w.html('stage');
  assert.strictEqual(
    (stage.match(/k-gen-grid/g) || []).length, 1,
    'completed batch did not render as ONE grouped grid'
  );
  assert.ok(!/k-thumbs/.test(stage), 'completed batch collapsed into the scenes carousel');
  URLS.forEach((u) => assert.ok(stage.includes(u), `batch grid dropped ${u}`));
  PROMPTS.forEach((p) => assert.ok(stage.includes(p), `batch grid lost the caption "${p}"`));
  assert.ok(/loading="lazy"/.test(stage), 'batch tiles are not lazy-loaded');
}

// A speech card submitted with NO model shows "Smart Select" while generating —
// the only honest answer at submit time. The completed status names the model
// that actually ran (raw `google_tts`) and the voice (raw `he-IL-Chirp3-HD-…`),
// both enriched server-side with the catalog's display name + icon/portrait.
// The finished card must show THOSE, and must never leak a raw id or keep the
// stale guess. Regression guard for the v1.58 speech-card audit.
async function completedCardNamesWhatActuallyRan() {
  const MP3 = 'https://media.kolbo.ai/speech-1.mp3';
  const ICON = 'https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/google-gemini-icon.svg';
  const PORTRAIT = 'https://media.kolbo.ai/voice-portrait.webp';
  const RAW_MODEL = 'google_tts';
  const RAW_VOICE = 'he-IL-Chirp3-HD-Rasalgethi';

  const w = mountWidget();
  w.status({
    state: 'completed',
    result: {
      urls: [MP3],
      model: RAW_MODEL, model_name: 'Google TTS', model_icon: ICON,
      voice: RAW_VOICE, voice_name: 'Or', voice_thumbnail: PORTRAIT,
    },
  });
  w.deliver({
    phase: 'generating', widget: 'generation', kind: 'audio', tool: 'generate_speech',
    generation_id: 'gen-speech', poll_tool: 'get_generation_status',
    status_args: { generation_id: 'gen-speech', wait: true },
    // No model was passed by the caller — the pre-completion guess.
    model: 'Smart Select', model_name: 'Smart Select', model_icon: null,
    prompt: 'Shalom', settings: { voice: RAW_VOICE },
  });

  const generatingChips = w.html('chips');
  assert.ok(generatingChips.includes('Smart Select'), 'generating card lost its model chip');

  w.scrollIntoView();
  w.drain();
  await flush();

  const chips = w.html('chips');
  assert.ok(chips.includes('Google TTS'), 'completed card did not show the model that actually ran');
  assert.ok(chips.includes(ICON), 'completed model chip has no icon');
  assert.ok(!chips.includes(RAW_MODEL), `completed card still shows the raw model id "${RAW_MODEL}"`);
  assert.ok(!chips.includes('Smart Select'), 'completed card kept the stale "Smart Select" chip');
  assert.ok(chips.includes('Or'), 'completed card did not show the voice display name');
  assert.ok(chips.includes(PORTRAIT), 'completed card did not show the voice thumbnail');
  assert.ok(!chips.includes(RAW_VOICE), `completed card still shows the raw voice id "${RAW_VOICE}"`);

  const stage = w.html('stage');
  assert.ok(stage.includes(MP3), 'completed speech card dropped its audio url');
  assert.ok(!stage.includes(RAW_MODEL), `audio row still shows the raw model id "${RAW_MODEL}"`);
  assert.ok(stage.includes('Google TTS'), 'audio row did not show the clean model name');
}

(async () => {
  await batchStaysOneGrid();
  await completedCardNamesWhatActuallyRan();
  console.log('✓ widget scripts parse; batch stays one grouped grid; offscreen cards stay idle; '
    + 'completed cards name the model + voice that actually ran');
})().catch((e) => { console.error(e); process.exit(1); });
