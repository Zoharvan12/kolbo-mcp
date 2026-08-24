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
const { widgetHtml, UI, listResult } = require('../src/apps');

{
  const result = listResult('{"sessions":[]}', {
    widget: 'list', title: 'Sessions', items: [], total: 0,
  });
  assert.ok(result.structuredContent && result.structuredContent.widget === 'list',
    'listResult must always ship structuredContent so Kolbo Code can leave Loading');
  assert.ok(result._meta, 'listResult must carry the list.html widget URI');
}

const blocks = (html) => html.split('<script>').slice(1).map((s) => s.split('</script>')[0]);

// ── 1. syntax guard ─────────────────────────────────────────────────────────
for (const uri of Object.values(UI)) {
  blocks(widgetHtml(uri)).forEach((src, i) => {
    try { new Function(src); }
    catch (e) { throw new Error(`${uri} script block ${i} does not parse: ${e.message}`); }
  });
}

// Generated and catalog media must preserve the complete frame. Square host
// cells are common even when the output is 3:4 or 16:9; cover crops heads,
// captions, and product edges. Small navigational thumbnails may still cover.
const generationHtml = widgetHtml(UI.generation);
const mediaGridHtml = widgetHtml(UI.mediaGrid);
assert.ok(/\.k-cell-fill\s*\{[^}]*object-fit:\s*contain/s.test(generationHtml),
  'generation batch media is cropped with object-fit: cover');
assert.ok(/\.k-media img, \.k-media video\s*\{[^}]*object-fit:\s*contain/s.test(generationHtml),
  'generation media tiles do not preserve the full frame');
assert.ok(/insertText\(String\(item.id\)\)/.test(mediaGridHtml),
  'media-grid Use must paste the item id, not send a prompt sentence');
assert.ok(/object-fit:contain;background:#000/.test(mediaGridHtml),
  'in-place media grid video playback is cropped');

const listHtml = widgetHtml(UI.list);
assert.ok(/-webkit-line-clamp:\s*2/.test(listHtml),
  'list subtitles must clamp so a DNA description cannot blow the row open');
assert.ok(/insertText\(String\(item.id\)\)/.test(listHtml),
  'list Use/click must paste the item id, not send a prompt sentence');
assert.ok(/k-text-tools/.test(generationHtml), 'prompt toolbar class missing');
assert.ok(/data-act=.copy/.test(generationHtml), 'copy control missing');
assert.ok(/data-act=.expand/.test(generationHtml), 'expand control missing');
assert.ok(!/\.k-prompt\.k-clamped, \.k-caption\.k-clamped \{ cursor: pointer; \}/.test(generationHtml),
  'clamped prompt still uses pointer cursor / click-to-expand');

// ── 2. generation widget behaviour ──────────────────────────────────────────
function stubEl() {
  const e = {
    innerHTML: '', textContent: '', title: '', value: '', disabled: false,
    placeholder: '', style: { setProperty() {} }, attrs: {},
    scrollHeight: 0, clientHeight: 0, scrollWidth: 0, clientWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { e.attrs[k] = v; }, getAttribute: (k) => e.attrs[k] ?? null,
    removeAttribute(k) { delete e.attrs[k]; },
    addEventListener() {}, focus() {}, pause() {},
    getBoundingClientRect: () => ({ bottom: 0 }),
    querySelector: () => stubEl(), querySelectorAll: () => [],
    appendChild(child) { return child; },
  };
  e.parentNode = {
    insertBefore(node) { e._tools = node; return node; },
    removeChild(node) { if (e._tools === node) e._tools = null; return node; },
  };
  Object.defineProperty(e, 'nextSibling', { get() { return e._tools || null; } });
  return e;
}

// One isolated widget instance (its own DOM, timers, IntersectionObserver and
// recorded tool calls) so independent scenarios cannot leak state into each
// other — the widget script keeps module-level state per card.
const genSrc = blocks(widgetHtml(UI.generation)).slice(1).join('\n'); // skip the host bridge
function mountWidget() {
  const ids = new Map();
  const calls = [];
  const links = [];
  const timers = [];
  let ioCallback = null;

  const document = {
    documentElement: { classList: { toggle() {} } },
    getElementById: (id) => (ids.has(id) || ids.set(id, stubEl()), ids.get(id)),
    querySelector: () => stubEl(),
    createElement: () => stubEl(),
    addEventListener() {},
    body: stubEl(),
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
      sendMessage() {}, insertText() { return Promise.resolve(); },
      openLink(url) { links.push(url); },
      copyText() { return Promise.resolve(); },
      updateModelContext() {}, notifySize() {},
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
    links,
    html: (id) => document.getElementById(id).innerHTML,
    node: (id) => document.getElementById(id),
    click: (id) => { const n = document.getElementById(id); if (n && n.onclick) n.onclick(); },
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

// Runs for BOTH batch shapes: generate_image's prompts[] (image tiles) and
// generate_video_from_image's items[] (video tiles, one image_url per item).
// Same widget contract — generation_ids + prompts — so the grouping invariant
// must hold identically; a video batch that falls through to the scenes
// carousel is the same regression, just harder to notice.
async function batchStaysOneGrid({ kind, tool, ext }) {
  const PROMPTS = ['a red fox in snow', 'a blue whale at dusk', 'a green hill at noon'];
  const IDS = ['gen-1', 'gen-2', 'gen-3'];
  const URLS = IDS.map((id) => `https://media.kolbo.ai/${id}.${ext}`);

  const w = mountWidget();
  w.status({
    all_done: true,
    generations: IDS.map((id, i) => ({
      generation_id: id, state: 'completed', credits_used: 2,
      result: { urls: [URLS[i]] },
    })),
  });
  w.deliver({
    phase: 'generating', widget: 'generation', kind, tool,
    generation_id: IDS[0], poll_tool: 'get_generation_status',
    status_args: { generation_ids: IDS, wait: true },
    generation_ids: IDS, prompts: PROMPTS, count: IDS.length,
    model: 'nano-banana-2', model_name: 'Nano Banana 2',
  });

  // Offscreen: the card rendered its skeletons but must not have touched the network.
  w.drain();
  assert.strictEqual(w.calls.length, 0, `[${tool}] offscreen card polled before it was visible`);

  w.scrollIntoView();
  w.drain();
  assert.strictEqual(w.calls.length, 1, `[${tool}] visible card did not poll exactly once`);
  assert.deepStrictEqual(w.calls[0].args.generation_ids, IDS, `[${tool}] batch polled ids individually`);

  await flush();
  const stage = w.html('stage');
  assert.strictEqual(
    (stage.match(/k-gen-grid/g) || []).length, 1,
    `[${tool}] completed batch did not render as ONE grouped grid`
  );
  assert.ok(!/k-thumbs/.test(stage), `[${tool}] completed batch collapsed into the scenes carousel`);
  URLS.forEach((u) => assert.ok(stage.includes(u), `[${tool}] batch grid dropped ${u}`));
  PROMPTS.forEach((p) => assert.ok(stage.includes(p), `[${tool}] batch grid lost the caption "${p}"`));
  if (kind === 'video') assert.ok(/<video/.test(stage), `[${tool}] video batch rendered its tiles as images`);
  else assert.ok(/loading="lazy"/.test(stage), `[${tool}] batch tiles are not lazy-loaded`);
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

function cardShowsEveryReferenceImage() {
  const refs = [
    'https://media.kolbo.ai/first.png',
    'https://media.kolbo.ai/middle.png',
    'https://media.kolbo.ai/last.png',
  ];
  const w = mountWidget();
  w.deliver({
    phase: 'generating', widget: 'generation', kind: 'video',
    tool: 'generate_elements', generation_id: 'gen-refs',
    poll_tool: 'get_generation_status', reference_images: refs,
  });
  const chips = w.html('chips');
  refs.forEach((url, i) => {
    assert.ok(chips.includes(url), `reference thumbnail ${i + 1} was dropped`);
    assert.ok(chips.includes(`Reference image ${i + 1} of ${refs.length}`), `reference thumbnail ${i + 1} lost its position label`);
  });
  assert.strictEqual((chips.match(/k-ref-thumb/g) || []).length, refs.length, 'widget did not render one thumbnail per reference image');

  const legacy = mountWidget();
  legacy.deliver({
    phase: 'generating', widget: 'generation', kind: 'image',
    tool: 'generate_image', generation_id: 'gen-legacy-ref',
    poll_tool: 'get_generation_status', reference_image: refs[0],
  });
  assert.ok(legacy.html('chips').includes(refs[0]), 'legacy reference_image fallback stopped rendering');
}

function stopNeedsASecondClick() {
  const w = mountWidget();
  w.deliver({
    phase: 'generating', widget: 'generation', kind: 'image',
    tool: 'generate_image', generation_id: 'gen-stop',
    poll_tool: 'get_generation_status',
  });
  const cancelled = () => w.calls.filter((c) => c.name === 'cancel_generation').length;
  const before = cancelled();
  w.node('stop-btn').onclick();
  assert.strictEqual(cancelled(), before, 'first Stop click cancelled without confirmation');
  assert.ok(/Stop this generation/.test(w.html('actions')), 'confirm prompt missing');
  w.node('stop-keep').onclick();
  assert.ok(!/Stop this generation/.test(w.html('actions')), 'Keep did not dismiss the confirm row');
  assert.strictEqual(cancelled(), before, 'Keep cancelled the generation');
  w.node('stop-btn').onclick();
  w.node('stop-btn').onclick();
  assert.ok(cancelled() > before, 'confirm Stop did not cancel');
}

function promptToolsStayOffTheText() {
  const w = mountWidget();
  const prompt = w.node('prompt');
  prompt.scrollHeight = 80;
  prompt.clientHeight = 32;
  w.deliver({
    phase: 'generating', widget: 'generation', kind: 'image',
    tool: 'generate_image', generation_id: 'gen-prompt',
    poll_tool: 'get_generation_status',
    prompt: 'a long cinematic prompt about a red fox walking through snow at dusk',
  });
  assert.strictEqual(prompt.onclick, null, 'prompt text still toggles expand on click');
  assert.ok(prompt._tools, 'prompt toolbar was not inserted');
  assert.ok(/Copy/.test(prompt._tools.innerHTML), 'copy button missing');
  assert.ok(/Expand/.test(prompt._tools.innerHTML), 'expand button missing on overflowing prompt');

  const short = mountWidget();
  short.deliver({
    phase: 'generating', widget: 'generation', kind: 'image',
    tool: 'generate_image', generation_id: 'gen-short',
    poll_tool: 'get_generation_status',
    prompt: 'short',
  });
  assert.strictEqual(short.node('prompt').onclick, null, 'short prompt is still click-to-toggle');
  assert.ok(/Copy/.test(short.node('prompt')._tools.innerHTML), 'copy button missing on short prompt');
  assert.ok(!/Expand/.test(short.node('prompt')._tools.innerHTML), 'expand button shown when text does not overflow');
}

function generatingCardShowsNamedChipsAndPeek() {
  const thumb = 'https://media.kolbo.ai/rock.jpg';
  const ref = 'https://media.kolbo.ai/ref.png';
  const w = mountWidget();
  w.deliver({
    phase: 'generating', widget: 'generation', kind: 'image',
    tool: 'generate_image', generation_id: 'gen-chips',
    model: 'gpt-image-2', model_name: 'GPT Image 2',
    model_icon: 'https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/chatgpt-icon.svg',
    settings: { preset_id: 'bible-1', preset_name: 'Character Bible', visual_dna_ids: ['dna_rock'] },
    visual_dnas: [{ id: 'dna_rock', name: 'Rock Lead', thumbnail: thumb }],
    reference_images: [ref],
  });
  const chips = w.html('chips');
  assert.ok(chips.includes('Character Bible'), 'preset chip did not show the preset name');
  assert.ok(!/k-chip"[^>]*>preset</.test(chips) || chips.includes('Character Bible'), 'preset chip still shows the bare word preset');
  assert.ok(chips.includes('Rock Lead'), 'DNA chip lost the DNA name');
  assert.ok(chips.includes(thumb), 'generating DNA chip has no thumbnail');
  assert.ok(chips.includes('data-peek'), 'reference / DNA thumbs are not clickable');
  const html = widgetHtml(UI.generation);
  assert.ok(html.includes('function openPeek'), 'generation widget has no in-card preview popup');
  const grid = widgetHtml(UI.mediaGrid);
  assert.ok(grid.includes('function openPeek') && grid.includes('data-peek'), 'media-grid tiles are not previewable');
  const list = widgetHtml(UI.list);
  assert.ok(list.includes('function openPeek') && list.includes('data-peek'), 'list thumbs are not previewable');
}

function mountList() {
  const ids = new Map();
  let readyFn = null;
  const document = {
    documentElement: { classList: { toggle() {} } },
    getElementById: (id) => (ids.has(id) || ids.set(id, stubEl()), ids.get(id)),
    querySelector: () => stubEl(),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const window = {
    kolbo: {
      ready(f) { readyFn = f; },
      onToolResult(f) { window.__onResult = f; },
      onToolInput() {}, onThemeChange() {},
      sendMessage() {}, insertText() { return Promise.resolve(); }, openLink() {}, notifySize() {},
    },
  };
  const src = blocks(widgetHtml(UI.list)).slice(1).join('\n');
  new Function('window', 'document', src)(window, document);
  return {
    title: () => document.getElementById('title').textContent,
    stage: () => document.getElementById('stage').innerHTML,
    deliver: (result) => window.__onResult(result),
    handshake: (result) => readyFn && readyFn({ toolInfo: { tool: { name: 'list_sessions' }, result } }),
  };
}

function listWidgetLeavesLoading() {
  const sessions = {
    sessions: [
      { session_id: 's1', name: 'Hero Sequence', types: ['video'], project_id: 'p1', updated_at: '2026-08-16T10:00:00Z' },
    ],
    pagination: null,
  };

  const fromText = mountList();
  fromText.deliver({ content: [{ type: 'text', text: JSON.stringify(sessions) }] });
  assert.ok(fromText.stage().includes('Hero Sequence'), 'list widget did not render sessions[] from content text');
  assert.ok(!fromText.stage().includes('Loading'), 'list widget stayed on Loading after sessions[] text');
  assert.strictEqual(fromText.title(), 'Sessions');

  const fromReady = mountList();
  fromReady.handshake({ structuredContent: { widget: 'list', title: 'Sessions (1)', items: [{ id: 's1', title: 'Hero Sequence', subtitle: 's1' }], total: 1 } });
  assert.ok(fromReady.stage().includes('Hero Sequence'), 'list widget did not boot from initialize hostContext');
  assert.ok(!fromReady.stage().includes('Loading'), 'list widget stayed on Loading after ready()');

  const gens = mountList();
  gens.deliver({ content: [{ type: 'text', text: JSON.stringify({
    session: { name: 'Clip A' },
    generations: [{ id: 'g1', prompt: 'wide shot of the harbor', status: 'completed', output_count: 2 }],
  }) }] });
  assert.ok(gens.stage().includes('wide shot of the harbor'), 'list widget did not render generations[] from content text');

  const empty = mountList();
  empty.deliver({ structuredContent: { widget: 'list', title: 'Sessions', items: [], total: 0 } });
  assert.ok(empty.stage().includes('Nothing here yet'), 'empty list did not show the empty state');

  const genHost = mountWidget();
  genHost.deliver(sessions);
  assert.ok(genHost.html('stage').includes('Hero Sequence'), 'generation fallback did not render sessions[] as a list');
}

async function openInKolboOpensTheSession() {
  const MP4 = 'https://media.kolbo.ai/clip.mp4';
  const SID = '64aaaaaaaaaaaaaaaaaaaaaa';
  const w = mountWidget();
  w.status({ state: 'completed', result: { urls: [MP4] } });
  w.deliver({
    phase: 'generating', widget: 'generation', kind: 'video',
    tool: 'generate_elements', generation_id: 'gen-el',
    poll_tool: 'get_generation_status',
    session_id: SID, project_id: 'proj-1',
    open_url: 'https://app.kolbo.ai/video-tools?session=' + SID + '&tool=image-to-video&mode=elements&project=proj-1',
  });
  w.scrollIntoView();
  w.drain();
  await flush();
  w.click('btn-open');
  assert.ok(w.links[0] && w.links[0].includes('session=' + SID),
    'Open in Kolbo lost the session after the status poll merged in');
  assert.ok(w.links[0].includes('mode=elements'), 'Open in Kolbo dropped the elements mode');

  const rebuilt = mountWidget();
  rebuilt.deliver({
    phase: 'completed', widget: 'generation', kind: 'video',
    tool: 'generate_elements', urls: [MP4], session_id: SID,
  });
  rebuilt.click('btn-open');
  assert.strictEqual(
    rebuilt.links[0],
    'https://app.kolbo.ai/video-tools?session=' + SID + '&tool=image-to-video&mode=elements',
    'Open in Kolbo did not rebuild the session URL from session_id'
  );

  const home = mountWidget();
  home.deliver({
    phase: 'completed', widget: 'generation', kind: 'video',
    tool: 'generate_elements', urls: [MP4],
  });
  home.click('btn-open');
  assert.strictEqual(home.links[0], 'https://app.kolbo.ai', 'missing session still falls back to the app home');
}

{
  const { buildOpenUrl } = require('../src/tools/_shared');
  const sid = '64bbbbbbbbbbbbbbbbbbbbbb';
  assert.ok(buildOpenUrl('generate_elements', { session_id: sid }).includes('mode=elements'),
    'elements Open in Kolbo URL is missing mode=elements');
  assert.ok(buildOpenUrl('get_generation_status', { session_id: sid, type: 'elements' }).includes('session=' + sid),
    'status poll cannot rebuild Open in Kolbo from SDK type');
  assert.equal(buildOpenUrl('generate_elements', {}), undefined);
}

(async () => {
  await batchStaysOneGrid({ kind: 'image', tool: 'generate_image', ext: 'png' });
  await batchStaysOneGrid({ kind: 'video', tool: 'generate_video_from_image', ext: 'mp4' });
  await completedCardNamesWhatActuallyRan();
  cardShowsEveryReferenceImage();
  generatingCardShowsNamedChipsAndPeek();
  promptToolsStayOffTheText();
  stopNeedsASecondClick();
  listWidgetLeavesLoading();
  await openInKolboOpensTheSession();
  console.log('✓ widget scripts parse; image + image-to-video batches stay one grouped grid; offscreen cards stay idle; '
    + 'completed cards name the model + voice that actually ran; all reference images render; '
    + 'list widgets leave Loading from sessions[] / generations[] / hostContext; '
    + 'long prompts expand from a button, not a click on the text; '
    + 'Open in Kolbo deep-links the generation session');
})().catch((e) => { console.error(e); process.exit(1); });
