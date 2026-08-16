/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg. Full rules: ../index.js top-of-file.
 *
 * Audio stem separation — Kolbo's own pipeline, not a passthrough to one vendor.
 *
 * Demucs supplies the masks (its stems sum back to the original at −30 to −37 dB, so nothing
 * is resynthesised) and a speech classifier supplies the semantic gate Demucs lacks: a
 * "vocals" mask is NOT the same thing as dialogue, because engines, impacts and centred
 * ambience land there at full volume. When no words are actually spoken, that mask is folded
 * back into Effects rather than handed over mislabeled as Dialogue. That gate is why these
 * tools exist as their own surface instead of a `separate` operation on edit_video.
 *
 * These three routes answer INLINE — there is no job id and nothing to poll. Each call holds
 * its connection for the whole run, so they carry an explicit long request timeout rather
 * than the client default.
 */

const { z } = require('zod');
const { projectIdField } = require('./_shared');

// The API answers inline and its own socket ceiling is 10 minutes. Sit just above that so a
// server-side failure surfaces as the server's message instead of a client-side abort with
// no explanation. Matches the pattern used for other long single-request tools.
const STEMS_TIMEOUT_MS = 11 * 60 * 1000;

const SOURCE_HINT =
  'Either a public media URL (audio or video — a Kolbo generation, an upload_media result, '
  + 'or any direct link) OR `generation_id` of a Kolbo video you already generated. '
  + 'Pass exactly one.';

function summarize(result) {
  return {
    layers: (result.layers || []).map((l) => ({ type: l.type, label: l.label, url: l.url })),
    ...(result.generation_id ? { generation_id: result.generation_id } : {}),
    ...(typeof result.credits_used === 'number' ? { credits_used: result.credits_used } : {}),
  };
}

function textResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/** One source, two accepted shapes. Reject "both" rather than silently preferring one. */
function buildBody({ audio_url, generation_id, project_id }, label) {
  if (!audio_url && !generation_id) {
    throw new Error(`${label}: provide audio_url (a media URL) or generation_id (a Kolbo video).`);
  }
  if (audio_url && generation_id) {
    throw new Error(`${label}: pass audio_url OR generation_id, not both — they are different sources and the result would be ambiguous.`);
  }
  const body = generation_id ? { generation_id } : { audio_url };
  if (project_id) body.project_id = project_id;
  return body;
}

function registerAudioStemTools(server, client) {
  // ─── separate_audio_stems ─────────────────────────────────────
  server.tool(
    'separate_audio_stems',
    'Split a soundtrack into separate audio layers: Dialogue, Music, Effects, and a '
    + '"without dialogue" (M&E) track — Kolbo\'s own separation pipeline, built for dubbing, '
    + 'localisation, podcast cleanup and re-scoring. Use this whenever someone wants to '
    + 'remove/isolate speech, strip narration, mute the music, get a clean instrumental bed, '
    + 'or hand an editor stems. A speech classifier decides whether the vocal mask is really '
    + 'dialogue, so an engine roar or centred ambience is not mislabelled as speech — that is '
    + 'what makes this better than a plain vocal remover. Costs 5 credits. Runs inline and '
    + 'returns the finished layer URLs (usually 20–90 seconds); there is nothing to poll. '
    + 'Sources up to 15 minutes long — trim longer files first. NOTE: there is no cache on the '
    + 'URL form, so calling it twice on the same file separates twice and bills twice.',
    {
      audio_url: z.string().optional()
        .describe('Public URL of the audio or video to separate. ' + SOURCE_HINT),
      generation_id: z.string().optional()
        .describe('ID of a Kolbo video generation to separate instead of a URL. Layers are also saved onto that generation, so a repeat call is free.'),
      project_id: projectIdField,
    },
    async ({ audio_url, generation_id, project_id }) => {
      const body = buildBody({ audio_url, generation_id, project_id }, 'separate_audio_stems');
      const result = await client.post('/v1/audio/separate', body, { timeoutMs: STEMS_TIMEOUT_MS });
      return textResult({
        ...summarize(result),
        has_dialogue: result.has_dialogue,
        has_music: result.has_music,
        cached: result.cached || false,
        // The lane names are not self-explanatory to a caller seeing them for the first time.
        layer_guide: {
          dialogue: 'Speech only.',
          music: 'Score / song bed. Absent when the clip has no music.',
          sfx: 'Effects and Foley.',
          me: 'Everything except dialogue (M&E) — the track to dub over.',
          original: 'The untouched mix, for reference.',
        },
        next_steps: 'If voices are still faintly audible in the "me" layer, run clean_dialogue_leftovers on its URL. To pull room tone out of the Effects bed, run separate_ambience on it.',
      });
    },
  );

  // ─── clean_dialogue_leftovers ─────────────────────────────────
  server.tool(
    'clean_dialogue_leftovers',
    'Strip voices that are still faintly audible in a "without dialogue" (M&E) track produced '
    + 'by separate_audio_stems. Use it only when the user actually hears speech bleeding '
    + 'through — it is not part of the normal flow, and it trades fidelity to do its job '
    + '(the generative model that removes the leak reconstructs the bed less cleanly than the '
    + 'masking model that made it). Typical on dense crowd scenes; unnecessary on clean '
    + 'dialogue. Costs 17 credits, charged even when the track turns out to be already clean '
    + '(the analysis pass still runs) — the response says which happened. Runs inline.',
    {
      audio_url: z.string().optional()
        .describe('URL of the "me" / without-dialogue layer returned by separate_audio_stems.'),
      generation_id: z.string().optional()
        .describe('ID of a Kolbo video whose stems were already separated — cleans that generation\'s M&E layer in place.'),
      project_id: projectIdField,
    },
    async ({ audio_url, generation_id, project_id }) => {
      const body = buildBody({ audio_url, generation_id, project_id }, 'clean_dialogue_leftovers');
      const result = await client.post('/v1/audio/clean-dialogue', body, { timeoutMs: STEMS_TIMEOUT_MS });
      return textResult({
        ...summarize(result),
        ...(result.passes !== undefined && { cleanup_passes: result.passes }),
        ...(result.already_clean !== undefined && { already_clean: result.already_clean }),
        cached: result.cached || false,
      });
    },
  );

  // ─── separate_ambience ────────────────────────────────────────
  server.tool(
    'separate_ambience',
    'Pull room tone / atmosphere out of an Effects or Music bed, leaving the hard effects '
    + 'behind — a fourth lane on top of separate_audio_stems, for when someone wants the '
    + 'ambience of a location on its own, or wants it gone. Run separate_audio_stems first '
    + 'and pass the resulting "sfx" (or "music") layer URL. Costs 17 credits, charged even '
    + 'when the bed turns out to have no separable ambience — the response reports '
    + 'skipped: true in that case. Runs inline.',
    {
      audio_url: z.string().optional()
        .describe('URL of the Effects ("sfx") or Music layer returned by separate_audio_stems.'),
      source_type: z.enum(['sfx', 'music', 'me']).optional()
        .describe('Which lane audio_url came from, so the leftover is labelled correctly. Default: "sfx".'),
      generation_id: z.string().optional()
        .describe('ID of a Kolbo video whose stems were already separated — picks the right source lane automatically.'),
      project_id: projectIdField,
    },
    async ({ audio_url, source_type, generation_id, project_id }) => {
      const body = buildBody({ audio_url, generation_id, project_id }, 'separate_ambience');
      if (source_type && !generation_id) body.source_type = source_type;
      const result = await client.post('/v1/audio/ambience', body, { timeoutMs: STEMS_TIMEOUT_MS });
      return textResult({
        ...summarize(result),
        ...(result.skipped !== undefined && { skipped: result.skipped }),
        ...(result.levels && { levels_db: result.levels }),
        cached: result.cached || false,
      });
    },
  );
}

module.exports = { registerAudioStemTools };
