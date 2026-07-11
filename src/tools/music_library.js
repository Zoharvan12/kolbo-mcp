/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg. Full rules: ../index.js top-of-file.
 *
 * DEPRECATED FAMILY (2026-07-11): these tools originally fronted the dedicated
 * Synci-only /v1/music-library/* routes. The Synci partner key expired and the
 * unified STOCK LIBRARY covers music anyway (kolbo-ai catalog + Coverr + Synci
 * when its key is live), so every tool here is now a thin adapter over
 * /v1/stock/* — same tool names/args, better backend, and old cached installs
 * keep working. New integrations should use search_stock_media /
 * get_stock_asset with mediaType "music" directly.
 */

const { z } = require('zod');
const { UI, uiResult, appsEnabled } = require('../apps');

const DEPRECATION_NOTE = '[Deprecated — served by the unified Stock Library now; prefer search_stock_media / get_stock_asset with mediaType "music".] ';

// Format a stock music asset into a compact human-readable line.
function assetTrackLine(a) {
  const meta = [
    a.durationSeconds != null ? `${Math.round(a.durationSeconds)}s` : null,
    a.author?.name || null,
    a.source,
  ].filter(Boolean).join(' · ');
  const preview = a.previewUrl || a.downloadVariants?.[0]?.url || null;
  return `${a.source}:${a.sourceId} — ${a.title || '(untitled)'}\n   ${meta}${preview ? `\n   preview: ${preview}` : ''}`;
}

// Map a stock music asset onto the media-grid widget item contract.
function assetTrackItem(a) {
  return {
    id: `${a.source}:${a.sourceId}`,
    title: a.title || '(untitled)',
    subtitle: [
      a.author?.name || null,
      a.durationSeconds != null ? Math.round(a.durationSeconds) + 's' : null,
      a.source,
    ].filter(Boolean).join(' · '),
    thumbnail: a.thumbnailUrl || null,
    media_type: 'audio',
    preview_audio: a.previewUrl || a.downloadVariants?.[0]?.url || null,
    use_hint: 'Get download links for track "{TITLE}" (id: {ID}) via get_music_track_audio.'
  };
}

// Search the unified stock library for music. `query` may be empty (browse).
async function stockMusicSearch(client, query, limit, offset) {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  params.set('mediaType', 'music');
  params.set('source', 'all');
  params.set('perPage', String(Math.min(Math.max(limit || 20, 1), 40)));
  if (offset) params.set('page', String(Math.floor(offset / (limit || 20)) + 1));
  const result = await client.get(`/v1/stock/search?${params.toString()}`);
  return { assets: result.assets || [], total: result.total };
}

// "source:sourceId" (new) or a bare legacy id (assume synci — the old backend).
function parseTrackId(trackId) {
  const i = String(trackId).indexOf(':');
  if (i > 0) return { source: trackId.slice(0, i), id: trackId.slice(i + 1) };
  return { source: 'synci', id: trackId };
}

function musicResult(ui, args, assets, total, emptyText) {
  if (assets.length === 0) {
    return { content: [{ type: 'text', text: emptyText }] };
  }
  const head = `Found ${assets.length} track${assets.length === 1 ? '' : 's'}${total ? ` (of ${total})` : ''}:`;
  const text = `${head}\n\n${assets.map(assetTrackLine).join('\n\n')}\n\nUse the track id with get_music_track_audio to get downloadable URLs (or get_stock_asset directly).`;
  if (ui()) {
    return uiResult(UI.mediaGrid, text, {
      widget: 'media-grid',
      title: 'Music Library' + (args && args.query ? ' — "' + args.query + '"' : ''),
      items: assets.slice(0, 20).map(assetTrackItem),
      total: total != null ? total : assets.length
    });
  }
  return { content: [{ type: 'text', text }] };
}

function registerMusicLibraryTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);

  // ─── search_music_library (adapter → stock search) ─────────────
  server.tool(
    'search_music_library',
    DEPRECATION_NOTE + 'Search stock/production music by keyword. Mood/genre are folded into the semantic query (the Kolbo catalog matches by vibe, e.g. "uplifting corporate", "tense cinematic"). Returns tracks with id, title, duration, and preview/download URLs. For scripts, call analyze_script_for_music first.',
    {
      query: z.string().max(200).optional().describe('Keyword/vibe search, e.g. "uplifting corporate", "tense cinematic", "lofi hip hop". If omitted, falls back to the mood/genre filter as the search term.'),
      mood: z.string().optional().describe('Mood keyword, folded into the search query (e.g. "Emotional", "Energetic").'),
      genre: z.string().optional().describe('Genre keyword, folded into the search query (e.g. "Corporate", "Hip Hop").'),
      bpmMin: z.number().optional().describe('Legacy filter — accepted but no longer applied.'),
      bpmMax: z.number().optional().describe('Legacy filter — accepted but no longer applied.'),
      durationMin: z.number().optional().describe('Legacy filter — accepted but no longer applied.'),
      durationMax: z.number().optional().describe('Legacy filter — accepted but no longer applied.'),
      hasStems: z.boolean().optional().describe('Legacy filter — accepted but no longer applied.'),
      hasLyrics: z.boolean().optional().describe('Legacy filter — accepted but no longer applied.'),
      sort: z.enum(['duration-asc', 'duration-desc', 'bpm-asc', 'bpm-desc', 'title']).optional().describe('Legacy sort — accepted but no longer applied (relevance order).'),
      limit: z.number().int().min(1).max(40).optional().describe('Results per page (max 40, default 20).'),
      offset: z.number().int().min(0).optional().describe('Pagination offset for loading more results.')
    },
    async (args) => {
      const query = [args.query, args.mood, args.genre].filter(Boolean).join(' ').trim();
      const { assets, total } = await stockMusicSearch(client, query, args.limit, args.offset);
      return musicResult(ui, args, assets, total,
        'No tracks found matching that query. Try a broader vibe description, or use search_stock_media with mediaType="music".');
    }
  );

  // ─── analyze_script_for_music (unchanged — doesn't touch Synci) ─
  server.tool(
    'analyze_script_for_music',
    'AI helper that turns a video or voiceover script into a music search. Returns { query, mood, genre, keywords } you can pass straight into search_music_library (or search_stock_media with mediaType="music") to find a fitting background track. Use this first when the user gives you a script/scene description rather than explicit music keywords.',
    {
      script: z.string().min(1).describe('The video or voiceover script / scene description to analyze (up to ~8000 chars).')
    },
    async ({ script }) => {
      const result = await client.post('/v1/music-library/analyze-script', { script });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: result.query,
            mood: result.mood,
            genre: result.genre,
            keywords: result.keywords,
            _followup_hint: 'Pass query + mood + genre into search_music_library (or search_stock_media mediaType="music").'
          }, null, 2)
        }]
      };
    }
  );

  // ─── browse_music_library (adapter → stock browse feed) ────────
  server.tool(
    'browse_music_library',
    DEPRECATION_NOTE + 'Browse the music catalog without a search query (paginated feed). For targeted search use search_music_library or search_stock_media.',
    {
      sort: z.enum(['duration-asc', 'duration-desc', 'bpm-asc', 'bpm-desc', 'title']).optional().describe('Legacy sort — accepted but no longer applied (feed order).'),
      limit: z.number().int().min(1).max(50).optional().describe('Results per page (max 40 now, default 20).'),
      offset: z.number().int().min(0).optional().describe('Pagination offset for loading more results.')
    },
    async ({ limit, offset }) => {
      const { assets, total } = await stockMusicSearch(client, '', limit, offset);
      return musicResult(ui, null, assets, total, 'No tracks returned.');
    }
  );

  // ─── get_music_library_facets (adapter → stock categories) ─────
  server.tool(
    'get_music_library_facets',
    DEPRECATION_NOTE + 'List the music category/genre chips available in the stock library. The catalog matches semantically, so any natural-language vibe also works as a query.',
    {},
    async () => {
      let categories = [];
      try {
        const result = await client.get('/v1/stock/categories?mediaType=music');
        categories = (result.categories || []).map(c => c.name || c.providerParam).filter(Boolean);
      } catch (_) { /* categories are best-effort */ }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            genres: categories,
            moods: [],
            instruments: [],
            bpmRange: null,
            durationRange: null,
            _note: 'Semantic search: any natural-language mood/vibe works as a query — exact facet values are no longer required.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── get_music_track_audio (adapter → stock asset) ──────────────
  server.tool(
    'get_music_track_audio',
    DEPRECATION_NOTE + 'Get the downloadable audio URLs for a music track by id ("source:sourceId" from search results).',
    {
      track_id: z.string().describe('Track id from search_music_library / browse_music_library (format "source:sourceId").')
    },
    async ({ track_id }) => {
      const { source, id } = parseTrackId(track_id);
      // mediaType hint required for sources that share ids across types (kolbo-ai).
      const result = await client.get(`/v1/stock/asset/${encodeURIComponent(source)}/${encodeURIComponent(id)}?mediaType=music`);
      const a = result.asset || result;
      const urls = {};
      (a.downloadVariants || []).forEach(v => { if (v.url) urls[v.label || 'audio'] = v.url; });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ id: track_id, title: a.title, urls }, null, 2)
        }]
      };
    }
  );

  // ─── get_music_track_related (graceful stub — no stock equivalent) ─
  server.tool(
    'get_music_track_related',
    DEPRECATION_NOTE + 'Stems/alternate versions are not exposed by the unified stock library. Returns an empty set with guidance.',
    {
      track_id: z.string().describe('The master track id.')
    },
    async ({ track_id }) => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          stems: [], versions: [],
          _note: `Stems/alternate versions are not available via the stock library. Use get_music_track_audio ("${track_id}") for the downloadable variants, or generate_music to compose a custom track.`
        }, null, 2)
      }]
    })
  );

  // ─── get_music_track_lyrics (graceful stub — no stock equivalent) ─
  server.tool(
    'get_music_track_lyrics',
    DEPRECATION_NOTE + 'Lyrics metadata is not exposed by the unified stock library. Returns hasLyrics: false with guidance.',
    {
      track_id: z.string().describe('The track id.')
    },
    async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          hasLyrics: false, lyrics: null, lyricalTheme: null, explicit: null,
          _note: 'Lyrics metadata is not available via the stock library. For a song with specific lyrics, use generate_music with the lyrics field.'
        }, null, 2)
      }]
    })
  );
}

module.exports = { registerMusicLibraryTools };
