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

const UI = {
  generation: 'ui://kolbo/generation.html',
  mediaGrid: 'ui://kolbo/media-grid.html',
  catalog: 'ui://kolbo/catalog.html',
  transcript: 'ui://kolbo/transcript.html',
};

const WIDGET_BUILDERS = {
  [UI.generation]: generationWidgetHtml,
  [UI.mediaGrid]: mediaGridWidgetHtml,
  [UI.catalog]: catalogWidgetHtml,
  [UI.transcript]: transcriptWidgetHtml,
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
    'https://*.kolbo.ai',                       // media.kolbo.ai CDN + app.kolbo.ai model icons
    'https://*.digitaloceanspaces.com',         // DO Spaces buckets (all envs)
    'https://*.cdn.digitaloceanspaces.com',     // DO Spaces CDN endpoints
    'https://fonts.googleapis.com',             // Inter / JetBrains Mono stylesheet
    'https://fonts.gstatic.com',                // font files
    'https://images.pexels.com',                // stock thumbnails
    'https://*.pexels.com',
    'https://*.pixabay.com',
    'https://*.sketchfab.com',
    'https://*.cloudfront.net',                 // provider-hosted previews
  ],
  connectDomains: [],
};

/** Register all Kolbo widget resources on an McpServer. */
function registerApps(server) {
  for (const [uri, name] of [
    [UI.generation, 'Kolbo Generation Widget'],
    [UI.mediaGrid, 'Kolbo Library Widget'],
    [UI.catalog, 'Kolbo Model Catalog Widget'],
    [UI.transcript, 'Kolbo Transcription Widget'],
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
    return getUiCapability(caps) !== undefined;
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
const infoCache = new Map(); // apiBase → { at, byKey: Map<lowername, {icon, eta}> }

/**
 * Resolve a Model.avatar value to an absolute URL. Avatars are bare filenames
 * (sometimes with spaces) living in the BACKEND's public assets folder —
 * `<api origin>/assets/<file>`. Do NOT use app.kolbo.ai for this: it's the SPA,
 * whose catch-all returns 200 text/html for any missing file, which renders as
 * a broken image in widgets.
 */
function resolveAvatarUrl(avatar, apiBase) {
  if (!avatar) return null;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  let origin = 'https://api.kolbo.ai';
  try {
    origin = new URL(apiBase || 'https://api.kolbo.ai/api').origin;
  } catch (_) { /* keep default */ }
  return `${origin}/assets/${encodeURIComponent(avatar)}`;
}

async function modelInfoMap(client) {
  const cacheKey = client.apiBase || 'default';
  const hit = infoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ICON_TTL_MS) return hit.byKey;
  const byKey = new Map();
  try {
    const res = await client.request('GET', '/v1/models');
    const models = res?.models || res?.data?.models || [];
    for (const m of models) {
      if (!m) continue;
      const icon = resolveAvatarUrl(m.avatar, client.apiBase);
      // Real p75 wall-clock estimate mined from production creditUsages —
      // the same source the in-app countdowns use. No estimate → no ETA shown.
      const eta = Number(m.estimatedDurationSeconds || m.estimated_duration_seconds) || null;
      const info = { icon, eta };
      if (m.name) byKey.set(String(m.name).toLowerCase(), info);
      if (m.identifier) byKey.set(String(m.identifier).toLowerCase(), info);
    }
  } catch (_) {
    /* fail open — widgets fall back to monogram chips, no ETA */
  }
  infoCache.set(cacheKey, { at: Date.now(), byKey });
  return byKey;
}

/** Resolve one model's { icon, eta }; missing → { icon: null, eta: null }. */
async function modelInfo(client, modelName) {
  if (!modelName) return { icon: null, eta: null };
  const map = await modelInfoMap(client);
  return map.get(String(modelName).toLowerCase()) || { icon: null, eta: null };
}

/** Back-compat shim (used by uiCompleted and older call sites). */
async function modelIcon(client, modelName) {
  return (await modelInfo(client, modelName)).icon;
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
  shorts_render: UI.generation,
  // transcript viewer
  transcribe_audio: UI.transcript,
  // model catalog
  list_models: UI.catalog,
  // media grid
  list_media: UI.mediaGrid,
  search_stock_media: UI.mediaGrid,
  get_stock_collections: UI.mediaGrid,
  search_music_library: UI.mediaGrid,
  browse_music_library: UI.mediaGrid,
  list_presets: UI.mediaGrid,
  list_voices: UI.mediaGrid,
  list_visual_dnas: UI.mediaGrid,
  list_moodboards: UI.mediaGrid,
  shorts_analyze: UI.mediaGrid,
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
  registerApps,
  attachToolWidgetMeta,
  uiMeta,
  uiResult,
  appsEnabled,
  modelIcon,
  modelInfo,
  modelInfoMap,
  resolveAvatarUrl,
  widgetHtml, // exported for smoke tests
};
