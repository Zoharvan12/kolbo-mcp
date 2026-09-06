#!/usr/bin/env node
'use strict';
/**
 * widget-gallery.js — every widget, every state, no credits.
 *
 * Builds a single self-contained HTML page (dist-gallery/index.html) that acts
 * as a fake MCP Apps host: it mounts each widget the server ships in an iframe
 * (same HTML the real hosts fetch, same CSP), completes the ui/initialize
 * handshake, pushes a fixture tool-input + tool-result, answers the card's own
 * tools/call polls from a scripted responder (so "generating" cards fill in
 * live), and logs every ui/* request a button makes (insert-text, message,
 * open-link, copy-text, attach-media, model-context) next to the card.
 *
 *   node scripts/widget-gallery.js           # build dist-gallery/index.html
 *   node scripts/widget-gallery.js --serve   # build + serve on :4877
 *
 * With KOLBO_API_KEY set, real sample media (an image, a video, an audio file)
 * is pulled from the account's media library so video/audio cards play;
 * without it, image placeholders on an allowlisted CDN host are used.
 */

const fs = require('fs');
const path = require('path');
const { UI, TOOL_WIDGETS, WIDGET_CSP, widgetHtml } = require('../src/apps');

const OUT_DIR = path.join(__dirname, '..', 'dist-gallery');
const OUT = path.join(OUT_DIR, 'index.html');

// ── sample media (allowlisted hosts only, or the CSP blanks them — by design) ─
const SAMPLE = {
  image: 'https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/presets/multi-shot/multi-shot-preset-thumb-v1.jpg',
  image2: 'https://media-dev.kolbo.ai/presets/image/thumbs/69864d1509aa97d30dd3605d-5a2409a29c4c.webp',
  video: null,
  audio: null,
  icon: 'https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/nano-banana.png',
};

async function loadLiveSamples() {
  try {
    const Client = require('../src/client');
    const c = new Client();
    for (const kind of ['image', 'video', 'audio']) {
      const r = await c.get(`/v1/media?type=${kind}&page_size=3&sort=created_desc`);
      const m = (r.media || r.items || []).find((x) => x.url);
      if (m) SAMPLE[kind] = m.url;
    }
    const models = await c.get('/v1/models?type=text_to_img&page_size=3');
    const mm = (models.models || []).find((x) => x.avatar);
    if (mm) SAMPLE.icon = /^https?:/.test(mm.avatar) ? mm.avatar : `https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/${mm.avatar}`;
  } catch (e) {
    console.warn('[gallery] live samples unavailable:', e.message);
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────
// A scenario = { tool, title, args (tool-input), result (structuredContent or
// null for "input only"), calls(name, args, n) → CallToolResult | null }.
const ids = (n, p) => Array.from({ length: n }, (_, i) => `${p}-${i + 1}`);

function build() {
  const IMG = SAMPLE.image, IMG2 = SAMPLE.image2;
  const VID = SAMPLE.video || IMG, AUD = SAMPLE.audio || IMG;
  const urlFor = (kind) => kind === 'video' ? VID : kind === 'audio' ? AUD : kind === '3d' ? 'https://media.kolbo.ai/sample/model.glb' : IMG;
  const status = (id, state, kind, extra) => ({
    structuredContent: Object.assign({
      phase: 'completed', widget: 'generation', kind: state === 'completed' ? kind : 'status', tool: 'get_generation_status',
      state, generation_id: id, urls: state === 'completed' ? [urlFor(kind)] : undefined,
      model: 'nano-banana-2', model_name: 'Nano Banana 2', model_icon: SAMPLE.icon, credits_used: state === 'completed' ? 1 : undefined,
      items: [{ id, state, url: state === 'completed' ? urlFor(kind) : undefined, urls: state === 'completed' ? [urlFor(kind)] : undefined, credits_used: 1 }],
    }, extra || {}),
    content: [{ type: 'text', text: '{}' }],
  });
  const multiStatus = (gids, doneCount, kind) => ({
    structuredContent: {
      phase: 'completed', widget: 'generation', kind: 'status', tool: 'get_generation_status',
      model: 'nano-banana-2', model_name: 'Nano Banana 2', model_icon: SAMPLE.icon,
      all_done: doneCount >= gids.length,
      items: gids.map((id, i) => i < doneCount
        ? { id, state: 'completed', url: i % 2 ? IMG2 : urlFor(kind), urls: [i % 2 ? IMG2 : urlFor(kind)], credits_used: 1, model_name: 'Nano Banana 2', model_icon: SAMPLE.icon }
        : { id, state: 'processing' }),
    },
    content: [{ type: 'text', text: '{}' }],
  });

  const GEN_TOOLS = {
    generate_image: 'image', generate_image_edit: 'image', edit_image: 'image', generate_creative_director: 'image',
    generate_character_sheet: 'image', generate_video: 'video', generate_video_from_image: 'video', generate_video_from_video: 'video',
    generate_elements: 'video', generate_first_last_frame: 'video', generate_lipsync: 'video', edit_video: 'video',
    generate_music: 'audio', generate_speech: 'audio', generate_sound: 'audio', generate_3d: '3d',
  };
  const PROMPT = 'Gritty photoreal documentary street photograph of a busy Israeli falafel stand, shot from behind the customer\'s shoulder at the counter, late afternoon light.';
  const settingsFor = (kind) => kind === 'video'
    ? { aspect_ratio: '16:9', resolution: '1080p', duration: 5 }
    : kind === 'audio' ? { duration: 30 } : { aspect_ratio: '4:3', resolution: '2K' };
  const baseGen = (tool, kind, id) => ({
    widget: 'generation', tool, kind, generation_id: id, prompt: PROMPT,
    model: 'nano-banana-2', model_name: 'Nano Banana 2', model_icon: SAMPLE.icon,
    settings: settingsFor(kind), session_id: 'sess-1', project_id: 'proj-1', open_url: 'https://app.kolbo.ai/',
    reference_images: tool === 'generate_image_edit' || tool === 'edit_image' ? [IMG2] : undefined,
    poll_tool: 'get_generation_status', status_args: { generation_id: id, wait: true },
  });

  const scenarios = [];
  for (const [tool, kind] of Object.entries(GEN_TOOLS)) {
    const args = { prompt: PROMPT, model: 'nano-banana-2', ...settingsFor(kind) };
    scenarios.push({ tool, title: 'pre-render (tool-input only)', args, result: null });
    scenarios.push({
      tool, title: 'generating → completes on 2nd poll', args,
      result: Object.assign(baseGen(tool, kind, `${tool}-live`), { phase: 'generating', count: 1 }),
      calls: { get_generation_status: [status(`${tool}-live`, 'processing', kind), status(`${tool}-live`, 'completed', kind)] },
    });
    scenarios.push({
      tool, title: 'completed', args,
      result: Object.assign(baseGen(tool, kind, `${tool}-done`), { phase: 'completed', urls: [urlFor(kind)], credits_used: 2 }),
    });
    scenarios.push({
      tool, title: 'failed', args,
      result: Object.assign(baseGen(tool, kind, `${tool}-fail`), { phase: 'failed', error: 'Provider rejected the prompt (content policy).' }),
    });
    scenarios.push({
      tool, title: 'generating → user presses Stop', args,
      result: Object.assign(baseGen(tool, kind, `${tool}-stop`), { phase: 'generating', count: 1 }),
      calls: {
        cancel_generation: [{ structuredContent: { cancelled: true, credits_refunded: 2 }, content: [{ type: 'text', text: '{}' }] }],
        get_generation_status: [status(`${tool}-stop`, 'processing', kind)],
      },
    });
    if (kind === 'image' || kind === 'video') {
      const gids = ids(4, `${tool}-b`);
      const prompts = ['wide shot of the harbor at dawn', 'the same harbor at noon, crowded', 'golden hour, fishing boats returning', 'blue hour, lights on'];
      scenarios.push({
        tool, title: 'batch of 4 (prompts[]) → fills per poll', args: { prompts, model: 'nano-banana-2' },
        result: Object.assign(baseGen(tool, kind, gids[0]), {
          phase: 'generating', count: 4, generation_ids: gids, prompts,
          status_args: { generation_ids: gids, wait: true },
        }),
        calls: { get_generation_status: [multiStatus(gids, 2, kind), multiStatus(gids, 4, kind)] },
      });
      scenarios.push({
        tool, title: 'timed-out batch (static status grid from the server) → goes live', args: { prompts, model: 'nano-banana-2' },
        result: {
          phase: 'completed', widget: 'generation', kind: 'status', tool, model: 'nano-banana-2', model_name: 'Nano Banana 2', model_icon: SAMPLE.icon,
          generation_id: gids[0], settings: {},
          items: gids.map((id, i) => ({ id, state: 'processing', title: prompts[i] })),
        },
        calls: { get_generation_status: [multiStatus(gids, 2, kind), multiStatus(gids, 4, kind)] },
      });
      scenarios.push({
        tool, title: 'timed-out single (plain text result) → goes live', args,
        result: { state: 'processing', generation_id: `${tool}-to`, _timed_out: true },
        calls: { get_generation_status: [status(`${tool}-to`, 'processing', kind), status(`${tool}-to`, 'completed', kind)] },
      });
    }
  }
  // Creative Director scenes + speech voice chip + DNA/moodboard chips + out-of-credits
  scenarios.push({
    tool: 'generate_creative_director', title: 'completed — 3 scenes', args: { prompt: PROMPT, scene_count: 3 },
    result: Object.assign(baseGen('generate_creative_director', 'scenes', 'cd-1'), {
      phase: 'completed', kind: 'scenes', credits_used: 6,
      scenes: [1, 2, 3].map((n) => ({ scene_number: n, title: 'Scene ' + n, image_urls: [n % 2 ? IMG : IMG2], video_urls: [] })),
    }),
  });
  scenarios.push({
    tool: 'generate_speech', title: 'completed — voice chip + portrait', args: { text: 'Welcome to Kolbo.', voice: 'Rachel' },
    result: Object.assign(baseGen('generate_speech', 'audio', 'sp-1'), {
      phase: 'completed', urls: [AUD], credits_used: 1, model: 'eleven_v3', model_name: 'ElevenLabs v3',
      voice_name: 'Rachel', voice_thumbnail: IMG2, settings: { voice: 'Rachel', language: 'en' },
    }),
  });
  scenarios.push({
    tool: 'generate_image', title: 'completed — Visual DNA + moodboard + preset chips', args: { prompt: '@Kobi at the market', visual_dna_ids: ['dna-1'] },
    result: Object.assign(baseGen('generate_image', 'image', 'img-dna'), {
      phase: 'completed', urls: [IMG], credits_used: 2,
      visual_dnas: [{ id: 'dna-1', name: 'Kobi', thumbnail: IMG2 }],
      moodboards: [{ id: 'mb-1', name: 'Tel Aviv Grit' }],
      settings: { aspect_ratio: '3:4', resolution: '2K', preset_id: 'p-1', preset_name: 'Street Doc', preset_thumbnail: IMG2 },
    }),
  });
  scenarios.push({
    tool: 'generate_image', title: 'out of credits → plans card', args: { prompt: PROMPT },
    widget: UI.plans,
    result: {
      widget: 'plans', reason: 'insufficient_credits', balance: 3, required: 12, shortfall: 9,
      current_plan: { name: 'Free' },
      plans: [{ name: 'Pro', price: 29, credits: 1500, url: 'https://app.kolbo.ai/pricing' }, { name: 'Studio', price: 99, credits: 6000 }],
      credit_packs: [{ name: '500 credits', price: 9 }],
      pricing_url: 'https://app.kolbo.ai/pricing',
    },
  });

  // media grids
  const gridItems = (n, kind) => Array.from({ length: n }, (_, i) => ({
    id: `m-${i + 1}`, title: `${kind}-${i + 1}.${kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png'}`,
    subtitle: kind + ' · 420KB', media_type: kind,
    thumbnail: kind === 'audio' ? null : (i % 2 ? IMG2 : IMG), url: urlFor(kind),
    preview_audio: kind === 'audio' ? AUD : undefined,
    use_hint: 'Use this media library asset in my next step:\nURL: {URL}\n(id: {ID})',
  }));
  const grid = (tool, title, items, extra) => ({
    tool, title, args: {},
    // Paging contract: page_tool + next_args; each page answers with the NEXT page's args (none on the last).
    result: Object.assign({ widget: 'media-grid', title, items, total: items.length, page_tool: tool, next_args: { page: 2 } }, extra || {}),
    calls: { [tool]: [2, 3].map((page) => ({ structuredContent: { widget: 'media-grid', items: gridItems(4, 'image').map((x, i) => Object.assign(x, { id: 'more-' + page + '-' + i })), page, next_args: page < 3 ? { page: page + 1 } : undefined }, content: [{ type: 'text', text: '{}' }] })) },
  });
  scenarios.push(grid('list_media', 'Media Library — images + video, Load more', gridItems(6, 'image').concat(gridItems(2, 'video')), { total: 24, shown: 8, page: 1, page_tool: 'list_media', query: { type: 'all' }, page_size: 8 }));
  scenarios.push(grid('list_media', 'Media Library — empty', [], { total: 0 }));
  scenarios.push(grid('list_presets', 'Presets — image', Array.from({ length: 12 }, (_, i) => ({ id: 'preset-' + i, title: 'Preset ' + (i + 1), subtitle: ['portrait', 'product', 'storyboard'][i % 3], thumbnail: i % 2 ? IMG2 : IMG, media_type: 'image', url: i % 2 ? IMG2 : IMG, use_hint: 'Use preset "{TITLE}" (preset_id: {ID})' })), { total: 146 }));
  scenarios.push(grid('list_voices', 'Voices — audio rows with preview', gridItems(5, 'audio').map((x, i) => Object.assign(x, { title: ['Rachel', 'Adam', 'Kore', 'Noa', 'Omer'][i], subtitle: 'ElevenLabs · en · female', thumbnail: IMG2 })), { total: 5 }));
  scenarios.push(grid('search_stock_media', 'Stock search — Pexels', gridItems(8, 'image').map((x) => Object.assign(x, { subtitle: 'Pexels · CC0' })), { total: 320, import_tool_hint: 'import via import_stock_asset' }));
  scenarios.push(grid('list_visual_dnas', 'Visual DNA', gridItems(4, 'image').map((x, i) => Object.assign(x, { title: ['Kobi', 'Noa', 'Brand kit', 'Studio B'][i], subtitle: 'character' })), { total: 4 }));
  scenarios.push(grid('list_moodboards', 'Moodboards', gridItems(3, 'image'), { total: 3 }));
  scenarios.push(grid('list_color_palettes', 'Color DNA', gridItems(2, 'image'), { total: 2 }));
  scenarios.push(grid('search_music_library', 'SYNCI music — previews', gridItems(4, 'audio').map((x, i) => Object.assign(x, { title: 'Track ' + (i + 1), subtitle: 'cinematic · 120bpm · 2:31' })), { total: 40 }));

  // lists
  const list = (tool, title, items, extra) => ({
    tool, title, args: {},
    result: Object.assign({ widget: 'list', title, items, total: items.length }, extra || {}),
    calls: { [tool]: [{ structuredContent: { widget: 'list', items: [{ id: 'p-more-1', title: 'Loaded page 2 item', subtitle: 'via next_args' }], next_args: undefined }, content: [{ type: 'text', text: '{}' }] }] },
  });
  scenarios.push(list('list_projects', 'Projects — paged (Load more)', [
    { id: 'proj-1', title: 'Falafel Campaign', subtitle: 'Owner · 12 sessions', badge: 'owner', meta: 'today', open_url: 'https://app.kolbo.ai/' },
    { id: 'proj-2', title: 'API Generations', subtitle: 'auto-created', badge: 'default', meta: '2d ago' },
    { id: 'proj-3', title: 'Shared with me', subtitle: 'edit access', badge: 'shared' },
  ], { total: 7, page_tool: 'list_projects', next_args: { page: 2, limit: 3 } }));
  scenarios.push(list('list_sessions', 'Sessions', [{ id: 's1', title: 'Hero Sequence', subtitle: '8 generations', thumbnail: IMG, meta: '1h ago' }, { id: 's2', title: 'Retakes', subtitle: '3 generations', thumbnail: IMG2 }]));
  scenarios.push(list('list_docs', 'AI Docs', [{ id: 'd1', title: 'Production bible', subtitle: 'Long description that should clamp after two lines because a DNA description or doc summary can be very long indeed and must not blow the row open.', badge: 'shared' }]));
  scenarios.push(list('list_agents', 'Agents', [{ id: 'a1', title: 'Copywriter', subtitle: 'Hebrew founder voice' }, { id: 'a2', title: 'QC', subtitle: 'Checks continuity' }]));
  scenarios.push(list('list_media_folders', 'Folders', [{ id: 'f1', title: 'Selects', subtitle: '42 items', badge: 'owner' }]));
  scenarios.push(list('list_projects', 'Projects — empty', []));

  // catalog
  const model = (n, i) => ({ identifier: 'model-' + i, name: n, description: 'Strengths: fast, photoreal, cheap. Weak: text.', icon: SAMPLE.icon, chips: ['1 credit', '2K', 'refs 4'] });
  scenarios.push({ tool: 'list_models', title: 'Catalog — compact (Browse row)', args: {}, result: { widget: 'catalog', compact: true, groups: [{ name: 'Image', models: [model('Nano Banana 2', 1), model('GPT Image 2', 2), model('Z-Image Turbo', 3)] }, { name: 'Video', models: [model('Seedance 2.5', 4), model('Veo 3.1', 5)] }] } });
  scenarios.push({ tool: 'list_models', title: 'Catalog — expanded', args: { type: 'text_to_img' }, result: { widget: 'catalog', compact: false, groups: [{ name: 'Image', models: [1, 2, 3, 4, 5, 6].map((i) => model('Image model ' + i, i)) }] } });

  // transcript
  scenarios.push({
    tool: 'transcribe_audio', title: 'transcribing → completes', args: { source: 'https://media.kolbo.ai/x.mp3', generate_srt: true },
    result: { widget: 'transcript', phase: 'generating', generation_id: 'tr-1', poll_tool: 'get_generation_status', status_args: { generation_id: 'tr-1', wait: true }, audio_url: AUD },
    calls: { get_generation_status: [{ structuredContent: { state: 'processing' }, content: [{ type: 'text', text: '{}' }] }, { structuredContent: { phase: 'completed', state: 'completed', widget: 'generation', kind: 'status', text: 'שלום, ברוכים הבאים לקולבו. This is the transcript text with a couple of lines.\nSecond paragraph.', srt_url: 'https://media.kolbo.ai/x.srt', txt_url: 'https://media.kolbo.ai/x.txt', audio_url: AUD, duration: 92, credits_used: 1 }, content: [{ type: 'text', text: '{}' }] }] },
  });

  // upload
  scenarios.push({ tool: 'media_upload_widget', title: 'upload card — images + video', args: {}, result: { widget: 'upload', title: 'Upload to Kolbo', kinds: ['image', 'video'], max_files: 20, upload_url: 'https://api.kolbo.ai/mcp/upload', token: 'gallery-token', expires_in: 900 } });
  scenarios.push({ tool: 'media_upload_widget', title: 'upload card — documents only', args: {}, result: { widget: 'upload', title: 'Upload a document', kinds: ['document'], max_files: 1, upload_url: 'https://api.kolbo.ai/mcp/upload', token: 'gallery-token' } });

  // plans (requested)
  scenarios.push({ tool: 'show_plans', title: 'plans — requested', args: {}, result: { widget: 'plans', reason: 'requested', balance: 412, current_plan: { name: 'Pro' }, plans: [{ name: 'Pro', price: 29, credits: 1500 }, { name: 'Studio', price: 99, credits: 6000 }], credit_packs: [{ name: '500 credits', price: 9 }], pricing_url: 'https://app.kolbo.ai/pricing' } });

  return scenarios;
}

// ── page ────────────────────────────────────────────────────────────────────
function cspMeta() {
  const res = (WIDGET_CSP.resourceDomains || []).join(' ');
  const con = (WIDGET_CSP.connectDomains || []).join(' ');
  const frames = (WIDGET_CSP.frameDomains || []).join(' ') || "'none'";
  // Mirrors what claude.ai derives from WIDGET_CSP: inline script/style allowed
  // (the widget is a single document), everything external allowlisted only.
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${res}; style-src 'unsafe-inline' ${res}; img-src data: blob: ${res}; media-src blob: ${res}; font-src ${res}; connect-src ${con} ${res}; frame-src ${frames}">`;
}

// JSON inside a <script> must not contain </script> (or <!--): the widget HTML does.
const embed = (v) => JSON.stringify(v).split('</').join('<\\/').split('<!--').join('<\\!--');

function render(scenarios) {
  const widgets = {};
  for (const uri of Object.values(UI)) {
    // Inject the CSP as the first thing in <head>, like a host would.
    widgets[uri] = widgetHtml(uri).replace(/<head>/i, '<head>' + cspMeta());
  }
  const cards = scenarios.map((s, i) => ({
    i, tool: s.tool, title: s.title, widget: s.widget || TOOL_WIDGETS[s.tool] || UI.generation,
    args: s.args || {}, result: s.result,
    calls: s.calls || null,
  }));
  const byWidget = {};
  cards.forEach((c) => { (byWidget[c.widget] = byWidget[c.widget] || []).push(c); });
  const nav = Object.entries(byWidget).map(([uri, cs]) => `<div class="nav-group"><div class="nav-h">${uri.replace('ui://kolbo/', '')} <span>${cs.length}</span></div>` +
    cs.map((c) => `<a href="#card-${c.i}"><b>${c.tool}</b> ${c.title}</a>`).join('') + '</div>').join('');
  const textOnly = Object.keys(require('../src/apps').TOOL_WIDGETS).length;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Kolbo MCP widget gallery</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font: 13px/1.4 system-ui, sans-serif; background:#f6f6f7; color:#111; display:grid; grid-template-columns: 300px 1fr; height:100vh; }
  body.dark { background:#141416; color:#eee; }
  nav { overflow:auto; border-right:1px solid #8884; padding:12px; }
  nav a { display:block; padding:3px 6px; border-radius:6px; color:inherit; text-decoration:none; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  nav a:hover { background:#8882; } nav a b { font-weight:600; margin-right:4px; }
  .nav-h { font-weight:700; margin:10px 0 4px; } .nav-h span { opacity:.5; font-weight:400; }
  main { overflow:auto; padding:16px 24px; }
  .bar { position:sticky; top:0; background:inherit; padding:8px 0 12px; display:flex; gap:12px; align-items:center; z-index:2; }
  .bar button { padding:6px 12px; border-radius:8px; border:1px solid #8886; background:#fff2; color:inherit; cursor:pointer; }
  .card { margin:0 0 28px; border:1px solid #8884; border-radius:12px; overflow:hidden; background:#fff; }
  body.dark .card { background:#1c1c1f; }
  .card-h { display:flex; gap:10px; align-items:baseline; padding:8px 12px; border-bottom:1px solid #8883; }
  .card-h code { font-size:12px; } .card-h .t { flex:1; } .card-h .w { opacity:.5; font-size:11px; }
  .frame { padding:12px; background:#f0f0f2; } body.dark .frame { background:#0f0f11; }
  iframe { width:100%; max-width:720px; height:160px; border:0; display:block; background:transparent; transition:height .15s; }
  .log { font: 11px/1.5 ui-monospace, monospace; padding:6px 12px; border-top:1px solid #8883; max-height:96px; overflow:auto; opacity:.85; white-space:pre-wrap; }
  .log:empty { display:none; }
  .log .ev { color:#0a7; } .log .call { color:#07c; } .log .err { color:#d33; }
</style></head>
<body>
<nav><div class="nav-h">Widgets <span>${cards.length} cards · ${textOnly} widget tools</span></div>${nav}</nav>
<main>
  <div class="bar">
    <strong>Kolbo MCP widget gallery</strong>
    <button id="theme">Toggle dark</button>
    <button id="reload">Re-mount all</button>
    <span style="opacity:.6">Cards mount when scrolled into view. Every host request a card makes is logged under it.</span>
  </div>
  ${cards.map((c) => `<section class="card" id="card-${c.i}" data-i="${c.i}">
    <div class="card-h"><code>${c.tool}</code><span class="t">${c.title}</span><span class="w">${c.widget.replace('ui://kolbo/', '')}</span></div>
    <div class="frame"></div><div class="log"></div>
  </section>`).join('\n')}
</main>
<script>
const WIDGETS = ${embed(widgets)};
const CARDS = ${embed(cards)};
let theme = 'light';
const live = new Map(); // contentWindow -> { card, iframe, calls, n, log }

function log(entry, cls, text) {
  const d = document.createElement('div'); d.className = cls; d.textContent = text; entry.log.appendChild(d); entry.log.scrollTop = 1e6;
}
function mount(section) {
  const c = CARDS[+section.dataset.i];
  const frame = section.querySelector('.frame'); frame.innerHTML = '';
  const logEl = section.querySelector('.log'); logEl.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.sandbox = 'allow-scripts allow-popups allow-forms';
  iframe.srcdoc = WIDGETS[c.widget];
  const entry = { card: c, iframe, n: {}, log: logEl, calls: c.calls };
  frame.appendChild(iframe);
  live.set(iframe.contentWindow, entry);
}
function post(win, msg) { win.postMessage(msg, '*'); }
window.addEventListener('message', (ev) => {
  const entry = live.get(ev.source); if (!entry) return;
  const m = ev.data; if (!m || m.jsonrpc !== '2.0') return;
  const win = ev.source; const c = entry.card;
  if (m.method === 'ui/initialize') {
    post(win, { jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'kolbo-gallery' }, hostContext: { theme, toolInfo: { name: c.tool, arguments: c.args } } } });
    return;
  }
  if (m.method === 'ui/notifications/initialized') {
    post(win, { jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { name: c.tool, arguments: c.args } });
    if (c.result) setTimeout(() => post(win, { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: c.result.widget || c.result.phase ? c.result : undefined, content: [{ type: 'text', text: JSON.stringify(c.result) }] } }), 400);
    return;
  }
  if (m.method === 'ui/notifications/size-changed') {
    const h = m.params && m.params.height; if (h) entry.iframe.style.height = Math.min(h, 1200) + 'px';
    return;
  }
  if (m.method === 'tools/call') {
    const name = m.params && m.params.name, args = (m.params && m.params.arguments) || {};
    const n = (entry.n[name] = (entry.n[name] || 0) + 1);
    log(entry, 'call', 'tools/call #' + n + ' ' + name + ' ' + JSON.stringify(args));
    const seq = entry.calls && entry.calls[name];
    const res = seq ? seq[Math.min(n - 1, seq.length - 1)] : null;
    setTimeout(() => post(win, { jsonrpc: '2.0', id: m.id, result: res || { isError: true, content: [{ type: 'text', text: 'gallery: no responder for ' + name }] } }), 1200);
    return;
  }
  if (m.method === 'ui/request-display-mode') { post(win, { jsonrpc: '2.0', id: m.id, result: { mode: 'inline' } }); log(entry, 'ev', 'request-display-mode ' + JSON.stringify(m.params)); return; }
  if (m.id != null) {
    const p = m.params || {};
    const text = p.text || (p.content && p.content[0] && p.content[0].text) || p.url || '';
    log(entry, 'ev', m.method.replace('ui/', '') + (text ? ': ' + String(text).slice(0, 300) : ''));
    post(win, { jsonrpc: '2.0', id: m.id, result: {} });
  }
});
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting && !e.target.dataset.mounted) { e.target.dataset.mounted = '1'; mount(e.target); }
}), { rootMargin: '300px' });
document.querySelectorAll('section.card').forEach((s) => io.observe(s));
document.getElementById('theme').onclick = () => {
  theme = theme === 'light' ? 'dark' : 'light';
  document.body.classList.toggle('dark', theme === 'dark');
  for (const [win] of live) post(win, { jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { hostContext: { theme } } });
};
document.getElementById('reload').onclick = () => document.querySelectorAll('section.card[data-mounted]').forEach((s) => mount(s));
</script>
</body></html>`;
}

async function main() {
  await loadLiveSamples();
  const scenarios = build();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, render(scenarios));
  console.log(`[gallery] ${scenarios.length} cards → ${OUT}` + (SAMPLE.video ? ' (live media samples)' : ' (placeholder media — no reachable Kolbo account for real video/audio)'));
  if (process.argv.includes('--serve')) {
    const http = require('http');
    const port = Number(process.env.GALLERY_PORT || 4877);
    http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(OUT));
    }).listen(port, () => console.log(`[gallery] http://localhost:${port}`));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
