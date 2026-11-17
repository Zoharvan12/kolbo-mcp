/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { projectIdField } = require('./_shared');

const UPLOAD_FIRST = 'Local file? Upload it first (create_upload_ticket / upload_media / media_upload_widget) and pass the returned URL.';
// The server holds these requests for the whole analysis (sdkLongRunning). The
// 120 s client default once cut a 2.5 min analysis off after the server had
// charged for it; stay just under the server's 10 min ceiling.
const LONG_RUN = { timeoutMs: 590000 };
const refreshField = z.boolean().optional().describe('true = run a new paid analysis even if the same file with the same settings was analyzed in the last 30 days. Default false: a saved result is returned for 0 credits (reused: true).');

function json(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

function registerAnalyzeTools(server, client) {
  // ─── analyze_video ──────────────────────────────────────────
  server.tool(
    'analyze_video',
    'Understand a video in one synchronous call (can take several minutes; nothing to poll). Pass a public https video URL or a YouTube URL plus an optional question in `prompt`; with no prompt you get a full breakdown. Returns `analysis` (readable text answer/description), `structured` (summary, answer, a shot list with start/end source timecodes, shot type, camera movement, subjects, action, setting, lighting, on-screen text and an audio note per shot, plus on-screen text, people, style, edit notes, prompt-ready recreate descriptions and a coverage note), `audio` (the full analyze_audio result for the soundtrack: measured duration, loudness, silence and BPM, a speech-recognition transcript with speakers and timings, music, timed sound effects, ambience; null when include_audio=false or for YouTube), `method` and `reused`. The server picks the method by length: short videos get one full pass; up to 20 minutes it detects cuts, builds contact sheets and analyzes segments, merged with source timecodes; over 20 minutes it refuses with MEDIA_TOO_LONG, so use the evidence workflow (prepare_video_inspection → inspect_video → analyze_extracted_clip / transcribe_extracted_clip) for long recordings. YouTube links go straight to the model: no measurements, no speech-recognition transcript, `audio: null`, and timecodes are the model\'s own. Billed by real usage (analysis tokens, plus per-minute transcription when the soundtrack is analyzed); the same file with the same settings within 30 days returns the saved result for 0 credits unless refresh=true. ' + UPLOAD_FIRST + ' For subtitle files (SRT) use transcribe_audio; for a sound-only file use analyze_audio.',
    {
      video_url: z.string().optional().describe('Public https URL of the video (Kolbo media URL from upload_media / list_media, or any public file). Either this or youtube_url.'),
      youtube_url: z.string().optional().describe('A youtube.com / youtu.be link. Either this or video_url. No measurements or speech-recognition transcript on this path.'),
      prompt: z.string().optional().describe('The question or task about the video (e.g. "At what timestamp does the logo appear?", "Count how many people speak", "Summarize the three main arguments"). Omit for a full breakdown.'),
      quality: z.enum(['standard', 'hq']).optional().describe('"standard" (default) or "hq" (higher accuracy, ~2.5x the token price). Use hq for short clips where precision matters.'),
      include_audio: z.boolean().optional().describe('Default true: also analyze the soundtrack (returned in `audio`, adds per-minute transcription cost). false = picture only.'),
      refresh: refreshField,
      project_id: projectIdField,
    },
    async ({ video_url, youtube_url, prompt, quality, include_audio, refresh, project_id }) => {
      if (!video_url && !youtube_url) {
        return { content: [{ type: 'text', text: 'Provide video_url or youtube_url. ' + UPLOAD_FIRST }], isError: true };
      }
      const result = await client.post('/v1/analyze/video', {
        ...(video_url ? { video_url } : {}),
        ...(youtube_url ? { youtube_url } : {}),
        ...(prompt ? { prompt } : {}),
        ...(quality ? { quality } : {}),
        ...(include_audio !== undefined ? { include_audio } : {}),
        ...(refresh !== undefined ? { refresh } : {}),
        ...(project_id ? { project_id } : {}),
      }, LONG_RUN);
      return json({
        analysis: result.analysis,
        structured: result.structured,
        audio: result.audio,
        method: result.method,
        model: result.model,
        agentic: result.agentic,
        usage: result.usage,
        credits_used: result.credits_used,
        reused: result.reused,
      });
    }
  );

  // ─── analyze_audio ──────────────────────────────────────────
  server.tool(
    'analyze_audio',
    'Understand a sound file, or the soundtrack of a video, in one synchronous call (can take several minutes; nothing to poll). Pass a public https `audio_url` or `video_url` (not YouTube) plus an optional question in `prompt`. The server MEASURES duration, loudness (LUFS, peaks), a silence map and BPM; the transcript always comes from speech recognition, with speakers and timings. A listening pass then describes the music (genre, mood, instruments, tempo, key, sections), every sound effect with start/end timecodes, ambience, room tone, technical quality, edit notes (cut points, beats) and prompt-ready descriptions to recreate the music, sound effects and voice. Every number is labelled `measured` or `estimated`: treat estimated values (key, genre, effect timings) as the model\'s judgement, not a measurement. All times are source seconds. Returns `analysis` { summary, answer, content_type, measurements, transcript, speakers, music, sfx_events, ambience, room_tone, technical, edit_notes, recreate, coverage }, `model`, `usage`, `credits_used`, `reused`. Limit 60 minutes of audio; longer files are refused with MEDIA_TOO_LONG, so cut them with the evidence workflow (prepare_video_inspection → inspect_video audio extraction → transcribe_extracted_clip / analyze_extracted_clip). Billed by real usage (analysis tokens + per-minute transcription); the same file with the same settings within 30 days returns the saved result for 0 credits unless refresh=true. ' + UPLOAD_FIRST + ' Need a subtitle file (SRT) or word-by-word captions as the deliverable? Use transcribe_audio instead.',
    {
      audio_url: z.string().optional().describe('Public https URL of the audio file (Kolbo media URL from upload_media / list_media, or any public file). Either this or video_url.'),
      video_url: z.string().optional().describe('Public https URL of a video file; its soundtrack is extracted and analyzed. Not YouTube. Either this or audio_url.'),
      prompt: z.string().max(2000).optional().describe('The question or task about the sound (e.g. "When does the beat drop?", "List every sound effect", "Describe the narrator\'s voice so I can recreate it"). Omit for the full breakdown. Max 2000 characters.'),
      refresh: refreshField,
      project_id: projectIdField,
    },
    async ({ audio_url, video_url, prompt, refresh, project_id }) => {
      if (!audio_url && !video_url) {
        return { content: [{ type: 'text', text: 'Provide audio_url or video_url. ' + UPLOAD_FIRST }], isError: true };
      }
      const result = await client.post('/v1/analyze/audio', {
        ...(audio_url ? { audio_url } : {}),
        ...(video_url ? { video_url } : {}),
        ...(prompt ? { prompt } : {}),
        ...(refresh !== undefined ? { refresh } : {}),
        ...(project_id ? { project_id } : {}),
      }, LONG_RUN);
      return json({
        analysis: result.analysis,
        model: result.model,
        usage: result.usage,
        credits_used: result.credits_used,
        reused: result.reused,
      });
    }
  );
}

module.exports = { registerAnalyzeTools };
