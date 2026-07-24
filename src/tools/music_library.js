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
    'Playback URLs are watermarked previews. Use acquire_clean_music_track for final use; it consumes one SYNCI vendor credit.',
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
    'Search the licensed SYNCI catalog. Results contain watermarked preview audio only. For any download or timeline use, call acquire_clean_music_track, which consumes one SYNCI vendor credit.',
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
    'List SYNCI genres, moods, instruments, BPM, and duration filters.',
    {},
    async () => {
      const result = await client.get('/v1/music-library/facets');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
    'Acquire a clean, unwatermarked SYNCI MP3 or WAV for download or Adobe timeline use. This immediately consumes one SYNCI vendor credit with no confirmation dialog. Reuse request_id when retrying the same intended action.',
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
    'Acquire one clean SYNCI file and copy it into the Kolbo media library. This immediately consumes one SYNCI vendor credit unless the track is already in the library. Defaults to clean MP3.',
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
