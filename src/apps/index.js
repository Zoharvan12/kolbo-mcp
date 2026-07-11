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

/** Register all Kolbo widget resources on an McpServer. */
function registerApps(server) {
  for (const [uri, name] of [
    [UI.generation, 'Kolbo Generation Widget'],
    [UI.mediaGrid, 'Kolbo Library Widget'],
    [UI.catalog, 'Kolbo Model Catalog Widget'],
    [UI.transcript, 'Kolbo Transcription Widget'],
  ]) {
    registerAppResource(server, name, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: widgetHtml(uri) }],
    }));
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
const iconCache = new Map(); // apiBase → { at, byKey: Map<lowername, url> }

async function modelIconMap(client) {
  const cacheKey = client.apiBase || 'default';
  const hit = iconCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ICON_TTL_MS) return hit.byKey;
  const byKey = new Map();
  try {
    const res = await client.request('GET', '/v1/models');
    const models = res?.models || res?.data?.models || [];
    for (const m of models) {
      if (!m || !m.avatar) continue;
      // The API usually resolves avatars to absolute URLs; bare filenames (older
      // deployments / internal calls) resolve against the app's public icon dir.
      const url = /^https?:\/\//i.test(m.avatar)
        ? m.avatar
        : `https://app.kolbo.ai/models_icons/${encodeURIComponent(m.avatar)}`;
      if (m.name) byKey.set(String(m.name).toLowerCase(), url);
      if (m.identifier) byKey.set(String(m.identifier).toLowerCase(), url);
    }
  } catch (_) {
    /* fail open — widgets fall back to monogram chips */
  }
  iconCache.set(cacheKey, { at: Date.now(), byKey });
  return byKey;
}

/** Resolve one model's icon URL; null → widget renders a monogram. */
async function modelIcon(client, modelName) {
  if (!modelName) return null;
  const map = await modelIconMap(client);
  return map.get(String(modelName).toLowerCase()) || null;
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
  modelIconMap,
  widgetHtml, // exported for smoke tests
};
