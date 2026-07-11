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

module.exports = {
  UI,
  registerApps,
  uiMeta,
  uiResult,
  appsEnabled,
  modelIcon,
  modelIconMap,
  widgetHtml, // exported for smoke tests
};
