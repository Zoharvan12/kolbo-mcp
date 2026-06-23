/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg. Full rules: ../index.js top-of-file. */

const { z } = require('zod');

// Format a normalized track into a compact human-readable line.
function trackLine(t) {
  const meta = [
    t.durationSeconds != null ? `${Math.round(t.durationSeconds)}s` : null,
    t.bpm != null ? `${t.bpm} BPM` : null,
    t.musicalKey || null,
    Array.isArray(t.genres) && t.genres.length ? t.genres.join('/') : t.genre,
    Array.isArray(t.moodTags) && t.moodTags.length ? t.moodTags.slice(0, 3).join(', ') : null,
  ].filter(Boolean).join(' · ');
  const flags = [t.hasStems ? 'stems' : null, t.hasLyrics ? 'lyrics' : null].filter(Boolean).join(', ');
  return `${t.id} — ${t.title}${t.artist ? ` by ${t.artist}` : ''}\n   ${meta}${flags ? `  [${flags}]` : ''}${t.audioUrl ? `\n   preview: ${t.audioUrl}` : ''}`;
}

function registerMusicLibraryTools(server, client) {
  // ─── search_music_library ─────────────────────────────────────
  server.tool(
    'search_music_library',
    'Search the Kolbo stock / production music library (licensed background tracks) by keyword with optional filters. Use this to FIND an existing ready-made track to score a video, ad, or voiceover — distinct from generate_music, which composes a brand-new song with Suno. Returns matching tracks with id, title, artist, duration, BPM, key, genres, moods, and preview/download URLs (128/320/wav). To turn a script into a good query first, call analyze_script_for_music.',
    {
      query: z.string().max(200).optional().describe('Keyword search, e.g. "uplifting corporate", "tense cinematic", "lofi hip hop". If omitted, falls back to the mood/genre filter as the search term.'),
      mood: z.string().optional().describe('Mood filter, e.g. "Emotional", "Energetic", "Tense". Use get_music_library_facets to see valid values.'),
      genre: z.string().optional().describe('Genre filter, e.g. "Soundtrack", "Corporate", "Hip Hop". Use get_music_library_facets to see valid values.'),
      bpmMin: z.number().optional().describe('Minimum beats-per-minute.'),
      bpmMax: z.number().optional().describe('Maximum beats-per-minute.'),
      durationMin: z.number().optional().describe('Minimum track duration in seconds.'),
      durationMax: z.number().optional().describe('Maximum track duration in seconds.'),
      hasStems: z.boolean().optional().describe('Only return tracks that have separated stems.'),
      hasLyrics: z.boolean().optional().describe('Only return tracks that have lyrics.'),
      sort: z.enum(['duration-asc', 'duration-desc', 'bpm-asc', 'bpm-desc', 'title']).optional().describe('Optional sort order. Omit for relevance order.'),
      limit: z.number().int().min(1).max(40).optional().describe('Results per page (max 40, default 20).'),
      offset: z.number().int().min(0).optional().describe('Pagination offset for loading more results.')
    },
    async (args) => {
      const result = await client.post('/v1/music-library/search', args);
      const tracks = result.tracks || [];
      if (tracks.length === 0) {
        return { content: [{ type: 'text', text: 'No tracks found matching those filters. Try a broader query or call get_music_library_facets for valid genres/moods.' }] };
      }
      const head = `Found ${tracks.length} track${tracks.length === 1 ? '' : 's'}${result.total ? ` (of ${result.total} sorted)` : ''}:`;
      return { content: [{ type: 'text', text: `${head}\n\n${tracks.map(trackLine).join('\n\n')}\n\nUse the track id with get_music_track_audio to get the downloadable 128/320/wav URLs.` }] };
    }
  );

  // ─── analyze_script_for_music ─────────────────────────────────
  server.tool(
    'analyze_script_for_music',
    'AI helper that turns a video or voiceover script into a music search. Returns { query, mood, genre, keywords } you can pass straight into search_music_library to find a fitting background track. Use this first when the user gives you a script/scene description rather than explicit music keywords.',
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
            _followup_hint: 'Pass query + mood + genre into search_music_library.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── browse_music_library ─────────────────────────────────────
  server.tool(
    'browse_music_library',
    'Browse the music library catalog without a search query (stable paginated listing). Use when the user just wants to see what is available. For a targeted search use search_music_library instead.',
    {
      sort: z.enum(['duration-asc', 'duration-desc', 'bpm-asc', 'bpm-desc', 'title']).optional().describe('Optional sort order.'),
      limit: z.number().int().min(1).max(50).optional().describe('Results per page (max 50, default 50).'),
      offset: z.number().int().min(0).optional().describe('Pagination offset for loading more results.')
    },
    async ({ sort, limit, offset }) => {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit != null) params.set('limit', String(limit));
      if (offset != null) params.set('offset', String(offset));
      const path = `/v1/music-library/catalog${params.toString() ? '?' + params.toString() : ''}`;
      const result = await client.get(path);
      const tracks = result.tracks || [];
      if (tracks.length === 0) {
        return { content: [{ type: 'text', text: 'No tracks returned.' }] };
      }
      return { content: [{ type: 'text', text: `Catalog (${tracks.length} track${tracks.length === 1 ? '' : 's'}):\n\n${tracks.map(trackLine).join('\n\n')}` }] };
    }
  );

  // ─── get_music_library_facets ─────────────────────────────────
  server.tool(
    'get_music_library_facets',
    'List the distinct genres, moods, and instruments available in the music library, plus the BPM and duration ranges. Use these values to build precise search_music_library filters.',
    {},
    async () => {
      const result = await client.get('/v1/music-library/facets');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            genres: result.genres || [],
            moods: result.moods || [],
            instruments: result.instruments || [],
            bpmRange: result.bpmRange || null,
            durationRange: result.durationRange || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── get_music_track_audio ────────────────────────────────────
  server.tool(
    'get_music_track_audio',
    'Get the downloadable audio URLs (128 kbps / 320 kbps / WAV) for a single music-library track by id. Call this after the user picks a track from search_music_library or browse_music_library.',
    {
      track_id: z.string().describe('The track id returned by search_music_library / browse_music_library.')
    },
    async ({ track_id }) => {
      const result = await client.get(`/v1/music-library/track/${encodeURIComponent(track_id)}/audio`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ id: result.id, urls: result.urls }, null, 2)
        }]
      };
    }
  );

  // ─── get_music_track_related ──────────────────────────────────
  server.tool(
    'get_music_track_related',
    'Get the stems and alternate versions of a music-library master track by id (e.g. instrumental, 30s cut, looped).',
    {
      track_id: z.string().describe('The master track id.')
    },
    async ({ track_id }) => {
      const result = await client.get(`/v1/music-library/track/${encodeURIComponent(track_id)}/related`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ stems: result.stems || [], versions: result.versions || [] }, null, 2)
        }]
      };
    }
  );

  // ─── get_music_track_lyrics ───────────────────────────────────
  server.tool(
    'get_music_track_lyrics',
    'Get the lyrics text, lyrical theme, and explicit flag for a single music-library track by id.',
    {
      track_id: z.string().describe('The track id.')
    },
    async ({ track_id }) => {
      const result = await client.get(`/v1/music-library/track/${encodeURIComponent(track_id)}/lyrics`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            hasLyrics: result.hasLyrics,
            lyrics: result.lyrics,
            lyricalTheme: result.lyricalTheme,
            explicit: result.explicit
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerMusicLibraryTools };
