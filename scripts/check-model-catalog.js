#!/usr/bin/env node
/**
 * check-model-catalog.js — the model catalog must be fully enumerable through MCP.
 *
 * Regression guard for the 2026-08-09 defect: `list_models` shipped the curated
 * 6-per-group widget payload as `structuredContent` on EVERY call, including
 * `format: "json"`. Hosts hand the model `structuredContent` and drop
 * `content[].text`, so the raw documents never arrived: `total_available: 49`
 * with six models and not one `identifier` field. The other 43 text_to_video
 * identifiers were undiscoverable by any MCP call, which cost a wrong-model
 * generation (agent guessed "minimax-hailuo-3"; the real id is "minimax-h3")
 * and ~19 credits of Flux identifier probing.
 *
 * Asserts, with no network:
 *   1. format:"json" + type   → every model of that type, each with an identifier
 *                               and its caps, reachable in structuredContent.
 *   2. format:"json"          → compact index of the ENTIRE catalog + identifiers.
 *   3. format:"text" + type   → the full text payload survives into structuredContent.
 *   4. canonicalModelId       → separator-insensitive resolution, and an
 *                               actionable error naming near misses.
 *   5. canonicalModelId       → MODALITY awareness, and every generate tool
 *                               actually passing its type (see below).
 *
 * (5) guards the 2026-08-10 defect: display names are shared by a whole family
 * of per-modality variants ("Kling 2.6 Pro" is BOTH …/text-to-video and
 * …/image-to-video), and the name→id map kept the shortest identifier — the
 * TEXT-to-video one. So `generate_video_from_image` with model "Kling 2.6 Pro"
 * submitted the t2v endpoint with an image attached, and billed the t2v SKU.
 */

process.env.KOLBO_MCP_APPS = '1'; // force the widget path — the broken one

const assert = require('assert');
const { registerModelTools } = require('../src/tools/models');
const { registerGenerateTools } = require('../src/tools/generate');
const { canonicalModelId } = require('../src/apps');

/* ---------------------------------------------------------------- fixtures */

// Known-good identifiers confirmed against the production catalog.
const KNOWN_GOOD = ['minimax-h3', 'flux-2/flash', 'seedance-2', 'gpt-image-2', 'z-image/turbo'];

const videoModel = (identifier, name, extra = {}) => ({
  identifier, name, types: ['text_to_video'], credit: 20,
  supported_durations: [5, 10], supported_resolutions: ['720p', '1080p'],
  supported_aspect_ratios: ['16:9', '9:16'], max_reference_images: 0,
  max_visual_dna: null, supports_visual_dna: false, summary: '', ...extra,
});

// 49 text_to_video models — the exact count the broken tool reported while
// returning six. Only 6 carry a summary, so the auto-selectable/named-only
// split that hid the rest is reproduced faithfully.
const VIDEO_MODELS = [
  // Seedance/Veo publish ONE doc that carries both modalities — the name must
  // keep resolving to it from either tool.
  videoModel('seedance-2', 'Seedance 2.0', { types: ['text_to_video', 'img_to_video'], recommended: true, summary: 'Best in class for multi-shot.' }),
  videoModel('seedance-2-fast', 'Seedance 2.0 Fast', { types: ['text_to_video', 'img_to_video'], summary: 'Faster, cheaper Seedance tier.' }),
  videoModel('kling-video/v3/pro/text-to-video', 'Kling 3.0 Pro', { summary: 'Decent at multi-cut scenes.' }),
  videoModel('kling-video/o3/pro/text-to-video', 'Kling O3 Pro', { summary: 'Better physical understanding.' }),
  videoModel('kling-video/v2.6/pro/text-to-video', 'Kling 2.6 Pro', { summary: 'Supports sound.' }),
  videoModel('kling-video/v2.5-turbo/pro/text-to-video', 'Kling 2.5 Turbo Pro', { summary: 'The go-to model.' }),
  videoModel('minimax-h3', 'MiniMax H3', { supported_durations: [4, 15], supported_resolutions: ['2K'] }),
  videoModel('veo3', 'Veo 3.1', { types: ['text_to_video', 'img_to_video'] }),
  videoModel('flux-2/video', 'Flux 2 Video'),
  ...Array.from({ length: 40 }, (_, i) => videoModel(`filler-model-${i}/text-to-video`, `Filler ${i}`)),
];
assert.strictEqual(VIDEO_MODELS.length, 49, 'fixture must reproduce the reported 49');

// Per-modality SIBLINGS that share a display name with a VIDEO_MODELS entry.
// Every one of these identifiers is LONGER than its text-to-video twin, which
// is precisely why the shortest-identifier tiebreak always handed back the t2v
// variant. Kept out of VIDEO_MODELS so the "49 text_to_video" assertions hold.
const SIBLING_MODELS = [
  videoModel('kling-video/v3/pro/image-to-video', 'Kling 3.0 Pro', { types: ['img_to_video'] }),
  videoModel('kling-video/o3/pro/image-to-video', 'Kling O3 Pro', { types: ['img_to_video'] }),
  videoModel('kling-video/v2.6/pro/image-to-video', 'Kling 2.6 Pro', { types: ['img_to_video'] }),
  videoModel('kling-video/v2.5-turbo/pro/image-to-video', 'Kling 2.5 Turbo Pro', { types: ['img_to_video'] }),
  videoModel('kling-video/v3/pro/video-to-video', 'Kling 3.0 Pro', { types: ['video_to_video'] }),
];

const OTHER_MODELS = [
  { identifier: 'flux-2/flash', name: 'Flux 2 Flash', types: ['text_to_img'], credit: 4, summary: '' },
  { identifier: 'flux-2/flex', name: 'Flux 2 Flex', types: ['text_to_img'], credit: 15, summary: '' },
  { identifier: 'flux-2/pro', name: 'Flux 2 Pro', types: ['text_to_img'], credit: 10, summary: '' },
  { identifier: 'gpt-image-2', name: 'GPT Image 2', types: ['text_to_img'], credit: 6, summary: '' },
  { identifier: 'z-image/turbo', name: 'Z Image Turbo', types: ['text_to_img'], credit: 2, summary: '' },
  { identifier: 'kolbo_smart_select_router', name: 'Smart Select', types: ['text_to_img'], credit: 0, summary: '' },
  // The image-side twin of the same defect (named in src/apps/index.js).
  { identifier: 'nano-banana-2', name: 'Nano Banana 2', types: ['text_to_img'], credit: 8, summary: '' },
  { identifier: 'nano-banana-2-image-editing', name: 'Nano Banana 2', types: ['image_editing'], credit: 8, summary: '' },
];
const ALL_MODELS = [...VIDEO_MODELS, ...SIBLING_MODELS, ...OTHER_MODELS];

const client = {
  apiBase: 'https://test.invalid',
  async get(path) {
    const models = /type=text_to_video/.test(path) ? VIDEO_MODELS : ALL_MODELS;
    return { count: models.length, models };
  },
  // modelInfoMap()'s channel — always the unfiltered catalog.
  async request() { return { models: ALL_MODELS }; },
};

function listModels() {
  let handler;
  registerModelTools({ tool: (name, _d, _s, fn) => { if (name === 'list_models') handler = fn; } }, client);
  assert.ok(handler, 'list_models did not register');
  return handler;
}

/* ------------------------------------------------------------------ checks */

async function main() {
  const list = listModels();
  const failures = [];
  const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (e) { failures.push(label); console.log(`  FAIL ${label}\n       ${e.message}`); }
  };

  // 1. format:"json" + type — the reported call. Must expose all 49 identifiers.
  const json = await list({ type: 'text_to_video', format: 'json' });
  const sc = json.structuredContent;
  await check('json+type: structuredContent carries the models array', () => {
    assert.ok(Array.isArray(sc.models), 'structuredContent.models missing — the widget payload is still shadowing the answer');
  });
  await check('json+type: all 49 models present (not the 6-model widget list)', () => {
    assert.strictEqual(sc.models.length, 49);
    assert.strictEqual(sc.count, 49);
  });
  await check('json+type: every model has an identifier', () => {
    const missing = sc.models.filter((m) => !m.identifier);
    assert.strictEqual(missing.length, 0, `${missing.length} models without an identifier`);
  });
  await check('json+type: minimax-h3 is discoverable with its caps', () => {
    const m = sc.models.find((x) => x.identifier === 'minimax-h3');
    assert.ok(m, 'minimax-h3 not enumerable');
    assert.deepStrictEqual(m.supported_durations, [4, 15]);
    assert.deepStrictEqual(m.supported_resolutions, ['2K']);
    assert.strictEqual(typeof m.credit, 'number');
  });
  await check('json+type: caps survive (supported_aspect_ratios, max_reference_images)', () => {
    const m = sc.models.find((x) => x.identifier === 'seedance-2');
    assert.deepStrictEqual(m.supported_aspect_ratios, ['16:9', '9:16']);
    assert.strictEqual(m.max_reference_images, 0);
  });

  // 2. format:"json" unfiltered — the whole catalog, every identifier.
  const all = await list({ format: 'json' });
  await check('json (unfiltered): compact index covers the entire catalog', () => {
    assert.strictEqual(all.structuredContent.models.length, ALL_MODELS.length);
    assert.ok(all.structuredContent.note, 'no note pointing at `type` for full docs');
  });
  await check('json (unfiltered): known-good identifiers all enumerable', () => {
    const ids = new Set(all.structuredContent.models.map((m) => m.identifier));
    const missing = KNOWN_GOOD.filter((id) => !ids.has(id));
    assert.strictEqual(missing.length, 0, `not enumerable: ${missing.join(', ')}`);
  });

  // 3. format:"text" + type — the text payload must reach the model too.
  const text = await list({ type: 'text_to_video' });
  await check('text+type: full listing survives into structuredContent', () => {
    assert.ok(typeof text.structuredContent.text === 'string', 'structuredContent.text missing');
    const missing = VIDEO_MODELS.filter((m) => !text.structuredContent.text.includes(m.identifier));
    assert.strictEqual(missing.length, 0, `${missing.length} identifiers absent from the delivered payload`);
  });

  // 4. Lenient resolution + actionable failure.
  for (const id of KNOWN_GOOD) {
    await check(`canonicalModelId: "${id}" resolves to itself`, async () => {
      assert.strictEqual(await canonicalModelId(client, id), id);
    });
  }
  const lenient = [
    ['flux-2-flash', 'flux-2/flash'],   // separator swap — burned credits on 2026-08-09
    ['flux 2 flash', 'flux-2/flash'],   // display name with spaces
    ['z-image', 'z-image/turbo'],       // unique prefix, as the tool description promises
    ['MiniMax H3', 'minimax-h3'],       // display name → identifier
    ['gpt image 2', 'gpt-image-2'],
  ];
  for (const [input, want] of lenient) {
    await check(`canonicalModelId: "${input}" → "${want}"`, async () => {
      assert.strictEqual(await canonicalModelId(client, input), want);
    });
  }
  await check('canonicalModelId: smart-select aliases pass through untouched', async () => {
    assert.strictEqual(await canonicalModelId(client, 'auto'), 'auto');
    assert.strictEqual(await canonicalModelId(client, 'smart-select'), 'smart-select');
  });
  await check('canonicalModelId: "minimax-hailuo-3" errors and names minimax-h3', async () => {
    let threw = null;
    try { await canonicalModelId(client, 'minimax-hailuo-3'); } catch (e) { threw = e; }
    assert.ok(threw, 'resolution silently passed an unknown identifier through to the API');
    assert.ok(/minimax-h3/.test(threw.message), `error did not name the real id: ${threw.message}`);
  });
  await check('canonicalModelId: unknown id with NO candidates still passes through', async () => {
    assert.strictEqual(await canonicalModelId(client, 'zzz-unpublished-xyz'), 'zzz-unpublished-xyz');
  });

  // 5a. MODALITY: one display name, one identifier per calling tool's type.
  const modality = [
    ['Kling 2.6 Pro', 'img_to_video', 'kling-video/v2.6/pro/image-to-video'], // the 2026-08-10 report
    ['Kling 2.6 Pro', 'text_to_video', 'kling-video/v2.6/pro/text-to-video'],
    ['Kling 3.0 Pro', 'img_to_video', 'kling-video/v3/pro/image-to-video'],
    ['Kling 3.0 Pro', 'video_to_video', 'kling-video/v3/pro/video-to-video'],
    ['Kling O3 Pro', 'img_to_video', 'kling-video/o3/pro/image-to-video'],
    ['Kling 2.5 Turbo Pro', 'img_to_video', 'kling-video/v2.5-turbo/pro/image-to-video'],
    ['Nano Banana 2', 'image_editing', 'nano-banana-2-image-editing'],
    ['Nano Banana 2', 'text_to_img', 'nano-banana-2'],
    // Dual-type single docs must still resolve from BOTH sides.
    ['Seedance 2.0', 'img_to_video', 'seedance-2'],
    ['Seedance 2.0 Fast', 'img_to_video', 'seedance-2-fast'],
    ['Veo 3.1', 'img_to_video', 'veo3'],
    // A type the model does not carry must never silently drop the match.
    ['MiniMax H3', 'img_to_video', 'minimax-h3'],
  ];
  for (const [input, type, want] of modality) {
    await check(`canonicalModelId: "${input}" + ${type} → "${want}"`, async () => {
      assert.strictEqual(await canonicalModelId(client, input, type), want);
    });
  }
  await check('canonicalModelId: an explicit identifier is never re-pointed by type', async () => {
    const id = 'kling-video/v2.6/pro/text-to-video';
    assert.strictEqual(await canonicalModelId(client, id, 'img_to_video'), id);
  });
  await check('canonicalModelId: array type (lipsync/3D tools) matches any member', async () => {
    assert.strictEqual(
      await canonicalModelId(client, 'Kling 2.6 Pro', ['lipsync-image', 'img_to_video']),
      'kling-video/v2.6/pro/image-to-video'
    );
  });

  // 5b. The generate TOOLS must actually pass their type — a correct resolver
  //     that no call site feeds is the same bug wearing a different hat.
  const posted = [];
  const toolClient = {
    apiBase: 'https://test.invalid',
    async request() { return { models: ALL_MODELS }; },
    async post(path, body) { posted.push({ path, body }); return { generation_id: 'gen_1', poll_interval_hint: 1 }; },
  };
  const tools = {};
  registerGenerateTools(
    { tool: (name, _d, _s, fn) => { tools[name] = fn; } },
    toolClient,
    { apps: true } // return at submit — never poll
  );
  const wiring = [
    ['generate_video', { prompt: 'p', model: 'Kling 2.6 Pro' }, 'kling-video/v2.6/pro/text-to-video'],
    ['generate_video_from_image', { image_url: 'https://x/i.png', prompt: 'p', model: 'Kling 2.6 Pro' }, 'kling-video/v2.6/pro/image-to-video'],
    ['generate_video_from_video', { source_video: 'https://x/v.mp4', prompt: 'p', model: 'Kling 3.0 Pro' }, 'kling-video/v3/pro/video-to-video'],
    ['generate_image', { prompt: 'p', model: 'Nano Banana 2' }, 'nano-banana-2'],
    ['generate_image_edit', { prompt: 'p', source_images: ['https://x/i.png'], model: 'Nano Banana 2' }, 'nano-banana-2-image-editing'],
  ];
  for (const [tool, args, want] of wiring) {
    await check(`${tool}: "${args.model}" reaches the API as "${want}"`, async () => {
      assert.ok(tools[tool], `${tool} did not register`);
      posted.length = 0;
      await tools[tool](args);
      assert.strictEqual(posted.length, 1, `expected exactly one submit, got ${posted.length}`);
      assert.strictEqual(posted[0].body.model, want);
    });
  }

  if (failures.length) {
    console.error(`\n[check-model-catalog] FAILED (${failures.length}):\n  - ${failures.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('\n[check-model-catalog] OK — the full catalog is enumerable with identifiers.');
}

main().catch((err) => { console.error('[check-model-catalog] FAILED:', err); process.exit(1); });
