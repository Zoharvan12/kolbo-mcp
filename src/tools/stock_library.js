/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg. Full rules: ../index.js top-of-file. */

const { z } = require('zod');

// Compact one-line render of a normalized stock asset.
function assetLine(a) {
  const dims = a.width && a.height ? `${a.width}x${a.height}` : null;
  const dur = a.durationSeconds != null ? `${Math.round(a.durationSeconds)}s` : null;
  const meta = [a.mediaType, dims, dur].filter(Boolean).join(' · ');
  const by = a.author?.name ? ` by ${a.author.name}` : '';
  const variants = Array.isArray(a.downloadVariants) ? a.downloadVariants.map((v) => v.label).join('/') : '';
  return `[${a.source}:${a.sourceId}] ${a.title || '(untitled)'}${by}\n   ${meta}${variants ? `  variants: ${variants}` : ''}${a.thumbnailUrl ? `\n   thumb: ${a.thumbnailUrl}` : ''}`;
}

// Returns the raw querystring (no leading '?'). Callers inline it as
// `${q ? '?' + q : ''}` so the parity checker recognizes it as a querystring.
function buildQuery(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') p.set(k, String(v));
  return p.toString();
}

function registerStockLibraryTools(server, client) {
  // ─── search_stock_media ───────────────────────────────────────
  server.tool(
    'search_stock_media',
    'Search the Kolbo unified stock media library and return matching assets. Covers external providers (Pexels photos/videos, Pixabay, Sketchfab 3D, licensed Music) AND Kolbo\'s OWN AI-generated library: thousands of SOUND EFFECTS (mediaType="sfx") and MUSIC tracks (source="kolbo-ai"). Use this to FIND ready-made photos, videos, 3D models, music, or sound effects as b-roll/references/project assets — distinct from generate_* tools which create new content.\n\nFor SOUND EFFECTS or MUSIC, Kolbo supports SEMANTIC "VIBE" SEARCH: pass a natural-language description of the feeling/use ("tense ominous build-up for a horror reveal", "uplifting hopeful corporate background", "retro arcade coin pickup") with source="kolbo-ai" and mediaType="sfx" (or "music") — it matches by meaning, not just keywords. For external visual providers, use concrete keywords.\n\nsource="all" interleaves providers for the requested media type; or pick a single source. Returns assets with source, sourceId, mediaType, dimensions, author, attribution, thumbnail, and downloadable variants. To turn a script into queries first, call analyze_script_for_stock.',
    {
      query: z.string().max(200).optional().describe('For visual providers: concrete keywords ("city skyline sunset"). For Kolbo SFX/music (source="kolbo-ai"): a natural-language VIBE works great ("eerie suspenseful drone", "emotional sad piano"). Omit to browse.'),
      source: z.enum(['all', 'kolbo-ai', 'pexels', 'pixabay', 'sketchfab', 'music', 'freesound']).optional().describe('Provider. "all" (default) interleaves. "kolbo-ai" = Kolbo\'s own AI SFX + music (best for vibe search). "freesound" = external CC sound effects.'),
      mediaType: z.enum(['image', 'illustration', 'vector', 'video', '3d', 'music', 'sfx']).optional().describe('Asset type (default "image"). "sfx" = sound effects, "music" = music tracks. Not every source supports every type — call get_stock_sources.'),
      category: z.string().optional().describe('Category/group chip value (providerParam) from get_stock_categories. For Kolbo SFX these are 77 Soundly-style top-level groups (e.g. Ambience, Animals, Vehicles, Weapons, Water, Designed, Magic, UI) — call get_stock_categories to list them all.'),
      subcategory: z.string().optional().describe('Kolbo SFX sub-filter within a group (providerParam from get_stock_categories, e.g. Weapons>sword, Water>splash, Footsteps>concrete, Designed>riser). 623 sub-filters across the 77 groups.'),
      packId: z.string().optional().describe('Filter to one Kolbo themed pack id (from get_stock_collections, kind="pack").'),
      collectionId: z.string().optional().describe('Filter to one Kolbo collection id (from get_stock_collections).'),
      orientation: z.enum(['horizontal', 'vertical', 'landscape', 'portrait', 'square']).optional().describe('Orientation filter (provider-dependent).'),
      color: z.string().optional().describe('Color filter (Pixabay named color, or Pexels named/hex color).'),
      order: z.enum(['popular', 'latest']).optional().describe('Sort order (Pixabay).'),
      cursor: z.string().optional().describe('Opaque pagination cursor for Sketchfab single-source browse (from a previous response).'),
      page: z.number().int().min(1).optional().describe('1-based page number (default 1).'),
      perPage: z.number().int().min(1).max(80).optional().describe('Results per page (default 24, max 80).')
    },
    async (args) => {
      const q = buildQuery(args);
      const result = await client.get(`/v1/stock/search${q ? '?' + q : ''}`);
      const assets = result.assets || [];
      if (!assets.length) return { content: [{ type: 'text', text: 'No assets found. Try a broader query, a different source/mediaType, or call get_stock_sources.' }] };
      const head = `Found ${assets.length} asset${assets.length === 1 ? '' : 's'}${result.total ? ` (≈${result.total} total)` : ''}${result.hasMore ? ' — more available (increment page)' : ''}:`;
      return { content: [{ type: 'text', text: `${head}\n\n${assets.map(assetLine).join('\n\n')}\n\nUse [source:sourceId] with get_stock_asset for full variants, or import_stock_asset to copy it into the media library.` }] };
    }
  );

  // ─── get_stock_sources ────────────────────────────────────────
  server.tool(
    'get_stock_sources',
    'List the enabled stock providers and which media types + filters each supports. Call this to know whether a source supports image/video/illustration/vector/3d/music before searching.',
    {},
    async () => {
      const result = await client.get('/v1/stock/sources');
      return { content: [{ type: 'text', text: JSON.stringify({ mediaTypes: result.mediaTypes, sources: result.sources }, null, 2) }] };
    }
  );

  // ─── get_stock_categories ─────────────────────────────────────
  server.tool(
    'get_stock_categories',
    'List the dynamic category chips for stock sources. For external providers: Pixabay/Sketchfab categories + curated Pexels topics. For Kolbo SFX (source="kolbo-ai", mediaType="sfx"): the 77 Soundly-style top-level groups (group=null) AND their 623 sub-filters (each has a `group` pointing to its parent). Pass a row\'s `providerParam` as `category` (groups) or `subcategory` (sub-filters) to search_stock_media.',
    {
      source: z.enum(['kolbo-ai', 'pexels', 'pixabay', 'sketchfab']).optional().describe('Restrict to one source. Use "kolbo-ai" to list the SFX groups + sub-filters.'),
      mediaType: z.string().optional().describe('Restrict to one media type (e.g. "image", "video", "3d", "sfx").')
    },
    async (args) => {
      const q = buildQuery(args);
      const result = await client.get(`/v1/stock/categories${q ? '?' + q : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify({ count: result.count, categories: result.categories }, null, 2) }] };
    }
  );

  // ─── get_stock_collections ────────────────────────────────────
  server.tool(
    'get_stock_collections',
    'List Kolbo\'s own SFX collections — the category collections AND the curated themed packs (kind="pack": e.g. Trailer Hits, Horror & Tension, Gaming FX, Foley Essentials). Use the returned `id` as `packId` or `collectionId` in search_stock_media to browse one pack/collection. Each has a cover image.',
    {
      mediaType: z.string().optional().describe('Media type (default "sfx").'),
      kind: z.enum(['category', 'pack']).optional().describe('Filter to category collections or themed packs only.')
    },
    async (args) => {
      const q = buildQuery(args);
      const result = await client.get(`/v1/stock/collections${q ? '?' + q : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify({ count: result.count, collections: result.collections }, null, 2) }] };
    }
  );

  // ─── get_stock_asset ──────────────────────────────────────────
  server.tool(
    'get_stock_asset',
    'Get a single normalized stock asset with all downloadable variants, author, license, and attribution, by source + id. Call after search_stock_media to resolve the exact download URLs (incl. WAV master + MP3 for Kolbo SFX/music).',
    {
      source: z.enum(['kolbo-ai', 'pexels', 'pixabay', 'sketchfab', 'music', 'freesound']).describe('The asset source.'),
      id: z.string().describe('The provider asset id (sourceId).'),
      mediaType: z.string().optional().describe('Media type hint (e.g. "video") — needed for sources that share ids across types.')
    },
    async ({ source, id, mediaType }) => {
      const q = buildQuery({ mediaType });
      const result = await client.get(`/v1/stock/asset/${encodeURIComponent(source)}/${encodeURIComponent(id)}${q ? '?' + q : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify(result.asset, null, 2) }] };
    }
  );

  // ─── analyze_script_for_stock ─────────────────────────────────
  server.tool(
    'analyze_script_for_stock',
    'AI helper that turns a video/voiceover script into stock b-roll search terms. Returns { queries[], mediaType, keywords } you can feed into search_stock_media to auto-source matching footage/photos. Use this first when the user gives you a script rather than explicit search keywords.',
    {
      script: z.string().min(1).describe('The video/voiceover script or scene description to analyze (up to ~8000 chars).')
    },
    async ({ script }) => {
      const result = await client.post('/v1/stock/analyze-script', { script });
      return { content: [{ type: 'text', text: JSON.stringify({ queries: result.queries, mediaType: result.mediaType, keywords: result.keywords, _followup_hint: 'Run each query through search_stock_media (source="all", mediaType=result.mediaType).' }, null, 2) }] };
    }
  );

  // ─── import_stock_asset ───────────────────────────────────────
  server.tool(
    'import_stock_asset',
    "Copy a stock asset into the account's Kolbo media library (downloaded to Kolbo's CDN with a stable URL) so it can be used in projects/generations. Free. Returns the created media library item. Works for Kolbo SFX (source='kolbo-ai', mediaType='sfx') and external visual/audio sources. Licensed Music (source='music') is not importable here (use the music-library tools).",
    {
      source: z.enum(['kolbo-ai', 'pexels', 'pixabay', 'sketchfab', 'freesound']).describe('The asset source.'),
      id: z.string().describe('The provider asset id (sourceId).'),
      mediaType: z.string().optional().describe('Media type hint (e.g. "video", "image", "vector", "3d").'),
      variant: z.string().optional().describe('Which download variant label to import (from get_stock_asset). Defaults to the best/largest available.'),
      project_id: z.string().optional().describe('Optional project id to associate the imported item with.')
    },
    async (args) => {
      const result = await client.post('/v1/stock/import', args);
      const it = result.libraryItem || {};
      return { content: [{ type: 'text', text: `${result.alreadyImported ? 'Already in library' : 'Imported'}: ${it.url || '(no url)'}\n${JSON.stringify({ id: it._id, mediaType: it.mediaType, filename: it.filename, url: it.url }, null, 2)}` }] };
    }
  );
}

module.exports = { registerStockLibraryTools };
