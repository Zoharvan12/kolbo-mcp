'use strict';

/**
 * MCP Apps integration (io.modelcontextprotocol/ui) — Kolbo interactive widgets.
 *
 * Registers the ui://kolbo/* HTML resources and provides the helpers tool files
 * use to attach widgets to results. Everything here is ADDITIVE: text-only hosts
 * (Claude Code, Cursor, old clients) ignore `_meta` + `structuredContent` and see
 * exactly the same text responses as before.
 */

const {
  registerAppResource,
  getUiCapability,
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
} = require('@modelcontextprotocol/ext-apps/server');

const { generationWidgetHtml } = require('./widgets/generation');
const { mediaGridWidgetHtml } = require('./widgets/mediaGrid');
const { catalogWidgetHtml } = require('./widgets/catalog');
const { transcriptWidgetHtml } = require('./widgets/transcript');
const { uploadWidgetHtml } = require('./widgets/upload');
const { listWidgetHtml } = require('./widgets/list');

const UI = {
  generation: 'ui://kolbo/generation.html',
  mediaGrid: 'ui://kolbo/media-grid.html',
  catalog: 'ui://kolbo/catalog.html',
  transcript: 'ui://kolbo/transcript.html',
  upload: 'ui://kolbo/upload.html',
  list: 'ui://kolbo/list.html',
};

const WIDGET_BUILDERS = {
  [UI.generation]: generationWidgetHtml,
  [UI.mediaGrid]: mediaGridWidgetHtml,
  [UI.catalog]: catalogWidgetHtml,
  [UI.transcript]: transcriptWidgetHtml,
  [UI.upload]: uploadWidgetHtml,
  [UI.list]: listWidgetHtml,
};

// Widgets are pure functions of source — build once per process.
const htmlCache = new Map();
function widgetHtml(uri) {
  if (!htmlCache.has(uri)) htmlCache.set(uri, WIDGET_BUILDERS[uri]());
  return htmlCache.get(uri);
}

// Hosts apply a deny-by-default CSP to widget iframes — without this
// declaration EVERY external asset (generated images/videos on the CDN, model
// icons, Google Fonts) is silently blocked. resourceDomains maps to
// img/script/style/font/media-src; connectDomains to connect-src.
const WIDGET_CSP = {
  resourceDomains: [
    // Public production hosts owned by Kolbo.
    'https://api.kolbo.ai',
    'https://app.kolbo.ai',
    'https://media.kolbo.ai',
    'https://cdn.kolbo.ai',
    'https://kolboai-production.ams3.digitaloceanspaces.com',
    'https://kolboai-production.ams3.cdn.digitaloceanspaces.com',
    'https://kolbo-general-media.fra1.digitaloceanspaces.com',
    'https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com',

    // Fonts used by the shared widget shell.
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',

    // Exact preview hosts returned by the production stock integrations.
    'https://images.pexels.com',
    'https://videos.pexels.com',
    'https://images.unsplash.com',
    'https://plus.unsplash.com',
    'https://pixabay.com',
    'https://cdn.pixabay.com',
    'https://coverr.co',
    'https://cdn.coverr.co',
    'https://freesound.org',
    'https://cdn.freesound.org',
    'https://sketchfab.com',
    'https://media.sketchfab.com',
    'https://cdn.sketchfab.com',
    'https://assets.sketchfab.com',
    'https://sketchfab-prod-media.s3.amazonaws.com',

    // Default SYNCI catalog project. Any production override must be reviewed
    // and added here as an exact hostname before deployment.
    'https://gfbpxdkripkbbrcvoyeh.supabase.co',
  ],
  // connect-src — XHR/fetch FROM widget iframes. Used by the upload widget to
  // POST files to /mcp/upload with its short-lived ticket.
  connectDomains: [
    'https://api.kolbo.ai',
  ],
};

/** Register all Kolbo widget resources on an McpServer. */
function registerApps(server) {
  for (const [uri, name] of [
    [UI.generation, 'Kolbo Generation Widget'],
    [UI.mediaGrid, 'Kolbo Library Widget'],
    [UI.catalog, 'Kolbo Model Catalog Widget'],
    [UI.transcript, 'Kolbo Transcription Widget'],
    [UI.upload, 'Kolbo Upload Widget'],
    [UI.list, 'Kolbo List Widget'],
  ]) {
    registerAppResource(
      server, name, uri,
      { mimeType: RESOURCE_MIME_TYPE, _meta: { csp: WIDGET_CSP, ui: { csp: WIDGET_CSP } } },
      async () => ({
        contents: [{
          uri, mimeType: RESOURCE_MIME_TYPE, text: widgetHtml(uri),
          _meta: { csp: WIDGET_CSP, ui: { csp: WIDGET_CSP } },
        }],
      })
    );
  }
}

/** `_meta` for a tool RESULT (and optionally for tool registration). */
function uiMeta(uri) {
  return { [RESOURCE_URI_META_KEY]: uri, ui: { resourceUri: uri } };
}

/**
 * Should this server instance produce widget results?
 * - `opts.apps === true` — set by the kolbo-api remote connector (claude.ai),
 *   where the stateless transport makes client capabilities unavailable per-call.
 * - stdio hosts (Claude Desktop) — detected from the initialize handshake.
 * - `KOLBO_MCP_APPS=1|0` env — manual override for local testing.
 */
function appsEnabled(server, opts = {}) {
  if (process.env.KOLBO_MCP_APPS === '0') return false;
  if (opts.apps === true || process.env.KOLBO_MCP_APPS === '1') return true;
  try {
    const caps = server?.server?.getClientCapabilities?.();
    if (getUiCapability(caps) !== undefined) return true;

    // Codex Desktop currently mounts MCP App resources from tool `_meta`, but
    // its initialize handshake identifies as `codex-mcp-client` with an empty
    // capabilities object. Without this compatibility path the host mounts a
    // "Preparing" card while the tool takes the blocking/text fallback, so the
    // completed media never reaches the iframe as structuredContent.
    //
    // Keep the desktop-origin check: Codex CLI uses the same client name but is
    // a text surface, where returning immediately would remove the final URLs.
    const info = server?.server?.getClientVersion?.();
    const origin = process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE || '';
    return info?.name === 'codex-mcp-client' && /codex desktop/i.test(origin);
  } catch (_) {
    return false;
  }
}

/**
 * Build a widget-carrying tool result. `text` stays the LLM-facing source of
 * truth; `structured` goes to the widget only.
 */
function uiResult(uri, text, structured) {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured,
    _meta: uiMeta(uri),
  };
}

/* ------------------------------------------------------------------ */
/* Model icon lookup (name/identifier → absolute avatar URL)           */
/* ------------------------------------------------------------------ */

const ICON_TTL_MS = 10 * 60 * 1000;
const infoCache = new Map(); // apiBase → { at, byKey: Map<lowername, info>, all: info[] }

/**
 * Resolve a Model.avatar value to an absolute URL. Avatars are bare filenames
 * (sometimes with spaces). They're mirrored from kolbo-api/assets to the
 * public DO Spaces CDN by kolbo-api scripts/infra/upload-model-icons-cdn.js —
 * the CDN is the ONLY host that reliably loads inside claude.ai's sandboxed
 * widget iframes (api.kolbo.ai sits behind Cloudflare bot rules that block
 * sandbox image requests; app.kolbo.ai is the SPA whose catch-all returns
 * 200 text/html for missing files).
 */
const ICON_CDN_BASE = 'https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons';

function resolveAvatarUrl(avatar) {
  if (!avatar) return null;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  return `${ICON_CDN_BASE}/${encodeURIComponent(avatar)}`;
}

async function modelCatalog(client) {
  const cacheKey = client.apiBase || 'default';
  const hit = infoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ICON_TTL_MS) return hit;
  const byKey = new Map();
  const all = [];
  try {
    const res = await client.request('GET', '/v1/models');
    const models = res?.models || res?.data?.models || [];
    for (const m of models) {
      if (!m) continue;
      const icon = resolveAvatarUrl(m.avatar, client.apiBase);
      // Real p75 wall-clock estimate mined from production creditUsages —
      // the same source the in-app countdowns use. No estimate → no ETA shown.
      const eta = Number(m.estimatedDurationSeconds || m.estimated_duration_seconds) || null;
      // `name` is the CLEAN display name ("Google TTS"); it is what widgets show.
      // Without it the model chip fell back to whatever raw string the caller or
      // the status endpoint supplied ("google_tts", "fal-ai/bytedance/omnihuman/v1.5").
      // `types` is the catalog `type` array ("text_to_video", "img_to_video", …) —
      // the ONLY thing that tells two same-named variants apart. See canonicalModelId.
      const raw = m.types !== undefined ? m.types : m.type;
      const types = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(String);
      const info = { icon, eta, id: m.identifier || null, name: m.name || null, types };
      all.push(info);
      // Display names collide across variants ("Nano Banana 2" names both the
      // t2i model and its editing sibling) — on collision keep the model with
      // the SHORTEST identifier (the base model), deterministically. This map is
      // for ICONS/ETAs, where the variant doesn't matter; identifier resolution
      // must NOT use it (that is what made "Kling 2.6 Pro" always mean the t2v one).
      const setName = (k) => {
        const prev = byKey.get(k);
        if (!prev || !prev.id || (info.id && info.id.length < prev.id.length)) byKey.set(k, info);
      };
      if (m.name) setName(String(m.name).toLowerCase());
      if (m.identifier) byKey.set(String(m.identifier).toLowerCase(), info);
    }
  } catch (_) {
    /* fail open — widgets fall back to monogram chips, no ETA */
  }
  const entry = { at: Date.now(), byKey, all };
  // Never cache an empty map: the first request in a fresh worker (typical
  // right after a deploy restart) can fail transiently, and caching that
  // failure blanks every model icon for the TTL window.
  if (byKey.size > 0) infoCache.set(cacheKey, entry);
  return entry;
}

async function modelInfoMap(client) {
  return (await modelCatalog(client)).byKey;
}

/** Resolve one model's { icon, eta, name }; missing → all null. */
async function modelInfo(client, modelName) {
  if (!modelName) return { icon: null, eta: null, name: null };
  const map = await modelInfoMap(client);
  return map.get(String(modelName).toLowerCase()) || { icon: null, eta: null, name: null };
}

/* ------------------------------------------------------------------ */
/* Voice lookup (voice_id / display name → { id, name, thumbnail })    */
/* ------------------------------------------------------------------ */

// Same shape and TTL as the model catalog above: the voice catalog is stable,
// and a per-generation /v1/voices round trip would be paid on every speech card.
const voiceCache = new Map(); // apiBase → { at, byKey }

async function voiceInfoMap(client) {
  const cacheKey = client.apiBase || 'default';
  const hit = voiceCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ICON_TTL_MS) return hit.byKey;
  const byKey = new Map();
  try {
    const res = await client.request('GET', '/v1/voices');
    for (const v of res?.voices || []) {
      if (!v || !v.voice_id) continue;
      // thumbnail/preview come from the catalog record — NEVER templated from
      // the id, so a change to the CDN path scheme cannot silently 404 the card.
      const info = { id: v.voice_id, name: v.name || v.voice_id, thumbnail: v.thumbnail || null };
      byKey.set(String(v.voice_id).toLowerCase(), info);
      // Display names are not unique across locales (the same Gemini voice is
      // catalogued per language). First one wins; the id lookup above is exact.
      const nameKey = String(info.name).toLowerCase();
      if (v.name && !byKey.has(nameKey)) byKey.set(nameKey, info);
    }
  } catch (_) {
    /* fail open — cards fall back to the raw voice string */
  }
  if (byKey.size > 0) voiceCache.set(cacheKey, { at: Date.now(), byKey });
  return byKey;
}

/** Resolve a voice id OR display name to { id, name, thumbnail }; null if unknown. */
async function voiceInfo(client, voice) {
  if (!voice) return null;
  const map = await voiceInfoMap(client);
  return map.get(String(voice).toLowerCase().trim()) || null;
}

/** Back-compat shim (used by uiCompleted and older call sites). */
async function modelIcon(client, modelName) {
  return (await modelInfo(client, modelName)).icon;
}

// Separator-insensitive key. Catalog keys carry their own punctuation — the
// NAME is keyed "minimax h3", the IDENTIFIER "flux-2/flash" — so both sides
// must be flattened before comparing. Normalising only the input (the old
// `key.replace(/\s+/g, '-')`) is why "flux-2-flash" never found "flux-2/flash".
const normId = (s) => String(s || '').toLowerCase().replace(/[\s._/-]+/g, '');

// The API maps these to Smart Select itself. They are never typos, so they must
// never be "corrected" or reported as unknown.
const AUTO_ALIASES = new Set([
  'auto', 'autoselect', 'smartselect', 'kolbosmartselectrouter', 'default', 'none',
]);

/**
 * Narrow several models that answer to the same string down to one identifier.
 * The CALLING TOOL's catalog type decides: a display name like "Kling 2.6 Pro"
 * names one model PER MODALITY (…/text-to-video and …/image-to-video), and only
 * the caller knows which it wants. No type match (or no type given) → shortest
 * identifier, the same deterministic tiebreak the icon map uses.
 */
function pickForType(candidates, types) {
  if (!candidates.length) return null;
  const typed = types.length
    ? candidates.filter((i) => i.types.some((t) => types.includes(t)))
    : [];
  const pool = typed.length ? typed : candidates;
  return pool.reduce((a, b) => (b.id.length < a.id.length ? b : a)).id;
}

// Strip modality tokens so a t2v id and its i2v sibling share one family key
// (grok-imagine-text-to-video ↔ grok-imagine-image-to-video; kling …/text-to-video
// ↔ …/image-to-video). Version tokens stay (1.5 ≠ 1.0).
function fam(s) {
  return normId(s).replace(
    /texttovideo|imagetovideo|imgtovideo|texttoimage|imagetoimage|imageediting|imageedit|referencetovideo|videotovideo|videoedit|editvideo|firstlastframe|firstlast/g,
    '',
  );
}

function sibling(models, hit, types) {
  if (!hit || !types.length) return hit;
  const row = models.find((i) => i.id === hit);
  if (row && row.types.some((t) => types.includes(t))) return hit;
  const key = fam(hit);
  const sibs = models.filter((i) => fam(i.id) === key && i.types.some((t) => types.includes(t)));
  if (!sibs.length) return hit;
  return sibs.reduce((a, b) => (b.id.length < a.id.length ? b : a)).id;
}

/**
 * Lenient model-identifier resolution for LLM-supplied model args.
 * Users say "z-image"; the real identifier is "z-image/turbo" — the backend
 * has no fuzzy matching on generation routes and fails deep in credit
 * reservation. Resolve here: exact name/identifier hit → its identifier;
 * else a separator-insensitive hit ("flux-2-flash" → "flux-2/flash"); else a
 * UNIQUE prefix match ("z-image" → "z-image/turbo").
 *
 * `type` is the calling tool's catalog type (a string, or an array when the
 * tool spans several — lipsync, 3D). It is what makes resolution MODALITY-AWARE:
 * without it, "Kling 2.6 Pro" from generate_video_from_image resolved to
 * kling-video/v2.6/pro/text-to-video (2026-08-10), so the image-to-video
 * pipeline submitted the TEXT-to-video endpoint and billed against it.
 * An explicit t2v identifier on an i2v tool remaps to the unique same-family
 * sibling (grok-imagine-text-to-video → grok-imagine-image-to-video). No
 * sibling → the id is passed through unchanged (MiniMax H3).
 *
 * Still unresolved: throw with the near misses named. The API answers a bad
 * identifier with a bare INVALID_*_MODEL and no hint, which on 2026-08-09 sent
 * an agent guessing "minimax-hailuo-3" (real id: "minimax-h3") and then
 * substituting a far more expensive model. Only throws when the catalog is
 * healthy AND actually offers candidates — otherwise it passes through
 * unchanged, so identifiers the catalog does not publish (hidden models) still
 * reach the API and it stays the source of truth.
 */
async function canonicalModelId(client, input, type) {
  if (!input || typeof input !== 'string') return input;
  const key = input.toLowerCase().trim();
  const want = normId(key);
  if (!want || AUTO_ALIASES.has(want)) return input;

  let all;
  try {
    all = (await modelCatalog(client)).all;
  } catch (_) {
    return input; // fail open — never block a generation on a catalog hiccup
  }
  const models = (all || []).filter((i) => i.id);
  if (!models.length) return input;

  const types = (Array.isArray(type) ? type : [type]).filter(Boolean);
  const dashed = key.replace(/\s+/g, '-');

  // 1. exact name / identifier hit
  const exact = sibling(models, pickForType(models.filter((i) => [i.id, i.name].some(
    (k) => k && (k.toLowerCase() === key || k.toLowerCase() === dashed)
  )), types), types);
  if (exact) return exact;

  // 2. separator-insensitive exact ("flux-2-flash" → "flux-2/flash")
  const loose = sibling(models, pickForType(models.filter((i) => normId(i.id) === want || normId(i.name) === want), types), types);
  if (loose) return loose;

  // 3. unique prefix ("z-image" → "z-image/turbo") — the modality filter runs
  //    FIRST, so a stem shared by a t2v/i2v pair is no longer ambiguous.
  const prefixed = models.filter((i) => normId(i.id).startsWith(want) || normId(i.name).startsWith(want));
  const narrowed = types.length ? prefixed.filter((i) => i.types.some((t) => types.includes(t))) : [];
  const ids = new Set((narrowed.length ? narrowed : prefixed).map((i) => i.id));
  if (ids.size === 1) return [...ids][0];

  // 4. unknown — name the near misses instead of dead-ending at the API.
  const stem = normId(key.split(/[\s._/-]+/).filter(Boolean)[0] || key);
  const near = [...new Set(
    models
      .filter((i) => stem && (normId(i.id).startsWith(stem) || normId(i.name).startsWith(stem)))
      .map((i) => (i.name ? `${i.id} (${i.name})` : i.id))
  )].sort().slice(0, 12);
  if (!near.length) return input;
  throw new Error(
    `Unknown model identifier "${input}". Did you mean: ${near.join(', ')}? `
    + 'Never guess an identifier — call list_models with the matching `type` and `format: "json"` '
    + 'to get the exact identifiers and caps.'
  );
}

/* ------------------------------------------------------------------ */
/* Declaration-level widget metadata                                    */
/* ------------------------------------------------------------------ */

// Hosts (claude.ai) decide whether to prepare a widget iframe from the TOOL
// DECLARATION in tools/list — result-level `_meta` alone is not enough. The
// legacy server.tool() registration API has no _meta parameter, so we attach
// it post-registration via the SDK's registered-tool objects (tools/list
// serves `tool._meta` verbatim; verified against SDK 1.29.0).
const TOOL_WIDGETS = {
  // generation card
  generate_image: UI.generation,
  generate_image_edit: UI.generation,
  generate_creative_director: UI.generation,
  generate_video: UI.generation,
  generate_video_from_image: UI.generation,
  generate_video_from_video: UI.generation,
  generate_elements: UI.generation,
  generate_first_last_frame: UI.generation,
  generate_lipsync: UI.generation,
  generate_music: UI.generation,
  generate_speech: UI.generation,
  generate_sound: UI.generation,
  generate_3d: UI.generation,
  edit_image: UI.generation,
  edit_video: UI.generation,
  // transcript viewer
  transcribe_audio: UI.transcript,
  // model catalog
  list_models: UI.catalog,
  // media grid
  list_media: UI.mediaGrid,
  search_stock_media: UI.mediaGrid,
  search_music_library: UI.mediaGrid,
  browse_music_library: UI.mediaGrid,
  get_stock_collections: UI.mediaGrid,
  list_presets: UI.mediaGrid,
  list_voices: UI.mediaGrid,
  list_visual_dnas: UI.mediaGrid,
  list_moodboards: UI.mediaGrid,
  // NOTE: list_color_palettes' handler has always called uiResult(UI.mediaGrid, ...)
  // (see color_palettes.js) but was missing here — hosts that prepare the widget
  // iframe from the tool DECLARATION (claude.ai reads tools/list, not the result)
  // never saw it as widget-carrying. Result-level _meta alone isn't enough.
  list_color_palettes: UI.mediaGrid,
  // upload widget
  media_upload_widget: UI.upload,
  // generic list widget — flat record lists with no natural thumbnail
  list_projects: UI.list,
  // Must stay list.html — mapping this to generation.html mounts "Kolbo Generation /
  // Preparing" empty cards for every session row.
  list_sessions: UI.list,
  list_session_generations: UI.list,
  list_project_context: UI.list,
  list_agents: UI.list,
  list_docs: UI.list,
  list_media_folders: UI.list,
  list_visual_dna_folders: UI.list,
};

function attachToolWidgetMeta(server) {
  const registered = server && server._registeredTools;
  if (!registered) return;
  for (const [name, uri] of Object.entries(TOOL_WIDGETS)) {
    const tool = registered[name];
    if (!tool) continue;
    tool._meta = { ...(tool._meta || {}), ...uiMeta(uri) };
  }
}

module.exports = {
  UI,
  WIDGET_CSP,
  TOOL_WIDGETS,
  registerApps,
  attachToolWidgetMeta,
  uiMeta,
  uiResult,
  appsEnabled,
  modelIcon,
  modelInfo,
  modelInfoMap,
  voiceInfo,
  canonicalModelId,
  resolveAvatarUrl,
  widgetHtml, // exported for smoke tests
};
