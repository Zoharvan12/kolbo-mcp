/* Public MCP contract: keep existing tool and argument names backward compatible. */

const { z } = require('zod');
const { UI, uiResult, appsEnabled } = require('../apps');

function trackLine(track) {
  const meta = [
    track.durationSeconds != null ? `${Math.round(track.durationSeconds)}s` : null,
    track.artist || null,
    track.bpm ? `${track.bpm} BPM` : null,
    track.hqAvailable ? 'WAV available' : 'MP3 only',
  ].filter(Boolean).join(' · ');
  return `[${track.id}] ${track.title || '(untitled)'}${meta ? `\n   ${meta}` : ''}`;
}

function trackItem(track) {
  return {
    id: track.id,
    title: track.title || '(untitled)',
    subtitle: [track.artist, track.durationSeconds != null ? `${Math.round(track.durationSeconds)}s` : null]
      .filter(Boolean).join(' · '),
    thumbnail: track.artworkUrl || null,
    media_type: 'audio',
    preview_audio: track.previewAudioUrl || track.audioUrl || track.audioUrl128 || null,
    use_hint: `Acquire a clean track with acquire_clean_music_track track_id="${track.id}" format="mp3".`,
  };
}

function tracksResult(ui, title, tracks, total) {
  if (!tracks.length) return { content: [{ type: 'text', text: 'No SYNCI tracks found.' }] };
  const text = [
    `Found ${tracks.length} track${tracks.length === 1 ? '' : 's'}${total ? ` (of ${total})` : ''}.`,
    'Playback URLs are watermarked previews. Use acquire_clean_music_track for final use. ' + "Free for subscribers, org members and anyone who already bought the track; for everyone else it COSTS CREDITS (the search response carries the exact price in cleanTrackCredits, and cleanAccess:false means this caller will be charged). State the cost and get the user's agreement BEFORE calling it.",
    '',
    tracks.map(trackLine).join('\n\n'),
  ].join('\n');
  if (!ui()) return { content: [{ type: 'text', text }] };
  return uiResult(UI.mediaGrid, text, {
    widget: 'media-grid',
    title,
    items: tracks.slice(0, 20).map(trackItem),
    total: total != null ? total : tracks.length,
  });
}

function cleanResult(result, requestId) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        track_id: result.trackId,
        format: result.format,
        audio_url: result.audioUrl,
        download_url: result.downloadUrl,
        watermarked: false,
        credits_remaining: result.creditsRemaining,
        request_id: requestId,
        reused: !!result.reused,
      }, null, 2),
    }],
  };
}

function registerMusicLibraryTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);

  server.tool(
    'search_music_library',
    'Search the licensed SYNCI catalog — the PAID third-party option. ' +
    '⚠️ NOT the default for music. Kolbo has its OWN large AI music library that is FREE and ' +
    'is usually cheaper or free: call search_stock_media with source="kolbo-ai" and mediaType="music" ' +
    '(it also supports natural-language vibe search, e.g. "uplifting hopeful corporate background"). ' +
    'Reach for SYNCI only when the user explicitly asks for the licensed/SYNCI catalog, names a real ' +
    'artist or commercial track, or needs stems / a specific licensed cue. ' +
    'Results here contain watermarked preview audio only; any download or timeline use requires ' +
    'acquire_clean_music_track. ' + "Free for subscribers, org members and anyone who already bought the track; for everyone else it COSTS CREDITS (the search response carries the exact price in cleanTrackCredits, and cleanAccess:false means this caller will be charged). State the cost and get the user's agreement BEFORE calling it.",
    {
      query: z.string().max(200).optional(),
      mood: z.string().optional(),
      genre: z.string().optional(),
      bpmMin: z.number().optional(),
      bpmMax: z.number().optional(),
      durationMin: z.number().optional(),
      durationMax: z.number().optional(),
      hasStems: z.boolean().optional(),
      hasLyrics: z.boolean().optional(),
      sort: z.enum(['duration-asc', 'duration-desc', 'bpm-asc', 'bpm-desc', 'title']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async (args) => {
      const result = await client.post('/v1/music-library/search', args);
      return tracksResult(ui, `SYNCI — ${args.query || 'Search'}`, result.tracks || [], result.total);
    },
  );

  server.tool(
    'analyze_script_for_music',
    'Turn a script or scene description into a SYNCI music search.',
    { script: z.string().min(1).max(8000) },
    async ({ script }) => {
      const result = await client.post('/v1/music-library/analyze-script', { script });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'browse_music_library',
    'Browse the licensed SYNCI catalog. Playback remains watermarked; final use requires acquire_clean_music_track.',
    {
      sort: z.enum(['duration-asc', 'duration-desc', 'bpm-asc', 'bpm-desc', 'title']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ sort, limit, offset }) => {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit != null) params.set('limit', String(limit));
      if (offset != null) params.set('offset', String(offset));
      const result = await client.get(`/v1/music-library/catalog?${params.toString()}`);
      return tracksResult(ui, 'SYNCI Music Library', result.tracks || [], result.total);
    },
  );

  server.tool(
    'get_music_library_facets',
    'List SYNCI genres, moods, instruments, BPM, and duration filters. Returns the most-used values ' +
    'per facet (ranked by track count); raise `limit` if you need deeper coverage. Any value not ' +
    'listed still works as a free-text `query` on search_music_library.',
    {
      limit: z.number().optional().describe(
        'How many values to return per facet, ranked by track count. Default: 40. Max: 200.'
      ),
    },
    async ({ limit }) => {
      const result = await client.get('/v1/music-library/facets');

      // The raw response carries 169 genres and 1000 each of moods/instruments — ~128K
      // chars, which exceeds what hosts accept, so this tool used to fail outright. The
      // tail is single-digit-count noise; the head is what anyone actually filters on.
      const cap = Math.min(Math.max(Number(limit) || 40, 1), 200);
      const trim = (arr) => (Array.isArray(arr) ? arr.slice(0, cap) : arr);
      const omitted = (arr) => (Array.isArray(arr) ? Math.max(arr.length - cap, 0) : 0);

      const payload = {
        ...result,
        genres: trim(result.genres),
        moods: trim(result.moods),
        instruments: trim(result.instruments),
        _truncated: {
          genres: omitted(result.genres),
          moods: omitted(result.moods),
          instruments: omitted(result.instruments),
          hint: 'Values beyond these are long-tail. Pass a higher `limit`, or just use `query` on ' +
            'search_music_library — free text matches values not listed here.',
        },
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
  );

  server.tool(
    'get_music_track_audio',
    'Get watermarked preview URLs for a SYNCI track. These URLs are never licensed masters; call acquire_clean_music_track for final use.',
    { track_id: z.string().min(1).max(64) },
    async ({ track_id }) => {
      const result = await client.get(`/v1/music-library/track/${encodeURIComponent(track_id)}/audio`);
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, preview_only: true }, null, 2) }] };
    },
  );

  server.tool(
    'acquire_clean_music_track',
    'Acquire a clean, unwatermarked SYNCI MP3 or WAV for download or Adobe timeline use. Charges IMMEDIATELY with no confirmation dialog. ' + "Free for subscribers, org members and anyone who already bought the track; for everyone else it COSTS CREDITS (the search response carries the exact price in cleanTrackCredits, and cleanAccess:false means this caller will be charged). State the cost and get the user's agreement BEFORE calling it." + ' Once bought, the track is owned permanently: the other format, its stems and every re-download are free. Reuse request_id when retrying the same intended action.',
    {
      track_id: z.string().min(1).max(64),
      format: z.enum(['mp3', 'wav']).optional().describe('Default mp3. Use wav only when the search result reports hqAvailable=true.'),
      purpose: z.enum(['download', 'timeline']).optional(),
      request_id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).describe('Required idempotency key. Reuse it for retries of the same action.'),
      project_id: z.string().optional(),
    },
    async ({ track_id, format = 'mp3', purpose = 'download', request_id, project_id }) => {
      const requestId = request_id;
      const result = await client.post(`/v1/music-library/clean/${encodeURIComponent(track_id)}`, {
        format,
        purpose,
        requestId,
        projectId: project_id,
      });
      return cleanResult(result, requestId);
    },
  );

  server.tool(
    'import_music_track_to_library',
    'Acquire one clean SYNCI file and copy it into the Kolbo media library. Charges IMMEDIATELY unless the track is already in the library or already owned. ' + "Free for subscribers, org members and anyone who already bought the track; for everyone else it COSTS CREDITS (the search response carries the exact price in cleanTrackCredits, and cleanAccess:false means this caller will be charged). State the cost and get the user's agreement BEFORE calling it." + ' Defaults to clean MP3.',
    {
      track_id: z.string().min(1).max(64),
      format: z.enum(['mp3', 'wav']).optional(),
      request_id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).describe('Required idempotency key; reuse it for retries.'),
      project_id: z.string().optional(),
      track: z.record(z.string(), z.unknown()).optional().describe('Optional track snapshot from search_music_library.'),
    },
    async ({ track_id, format = 'mp3', request_id, project_id, track }) => {
      const requestId = request_id;
      const result = await client.post('/v1/music-library/import', {
        trackId: track_id,
        format,
        requestId,
        projectId: project_id,
        track,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, requestId }, null, 2) }] };
    },
  );

  server.tool(
    'get_music_track_related',
    'Get SYNCI stems and alternate versions metadata. Purchasing stems or alternate versions is not supported.',
    { track_id: z.string().min(1).max(64) },
    async ({ track_id }) => {
      const result = await client.get(`/v1/music-library/track/${encodeURIComponent(track_id)}/related`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_music_track_lyrics',
    'Get SYNCI lyrics metadata for a track.',
    { track_id: z.string().min(1).max(64) },
    async ({ track_id }) => {
      const result = await client.get(`/v1/music-library/track/${encodeURIComponent(track_id)}/lyrics`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}

module.exports = { registerMusicLibraryTools };
