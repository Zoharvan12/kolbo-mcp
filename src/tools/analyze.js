/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { projectIdField } = require('./_shared');

function registerAnalyzeTools(server, client) {
  // ─── analyze_video ──────────────────────────────────────────
  // Kolbo's official video understanding. Sync — the server holds the socket for
  // long videos, so there is nothing to poll.
  server.tool(
    'analyze_video',
    'Understand a video with Kolbo\'s official video-understanding model (agentic Gemini: it navigates the timeline itself — frames, audio and transcript on demand — instead of sampling fixed frames, so long videos are cheap and timestamp / "when does X happen" / counting questions are answered directly). Pass a public https video URL or a YouTube URL plus an optional question in `prompt`; with no prompt you get an exhaustive description + verbatim transcript. Billed by the analyzer\'s real token usage. Local file → upload it first (create_upload_ticket / upload_media / media_upload_widget) and pass the returned URL. For subtitle files use transcribe_audio instead.',
    {
      video_url: z.string().optional().describe('Public https URL of the video (Kolbo media URL from upload_media / list_media, or any public file). Either this or youtube_url.'),
      youtube_url: z.string().optional().describe('A youtube.com / youtu.be link. Either this or video_url.'),
      prompt: z.string().optional().describe('The question or task about the video (e.g. "At what timestamp does the logo appear?", "Count how many people speak", "Summarize the three main arguments"). Omit for a full description + verbatim transcript.'),
      quality: z.enum(['standard', 'hq']).optional().describe('"standard" (default, Flash-Lite) or "hq" (Flash, higher accuracy, ~2.5x the token price). Use hq for short clips where precision matters.'),
      project_id: projectIdField,
    },
    async ({ video_url, youtube_url, prompt, quality, project_id }) => {
      if (!video_url && !youtube_url) {
        return { content: [{ type: 'text', text: 'Provide video_url or youtube_url. Local file? Upload it first (create_upload_ticket / upload_media / media_upload_widget) and pass the returned URL.' }], isError: true };
      }
      const result = await client.post('/v1/analyze/video', {
        ...(video_url ? { video_url } : {}),
        ...(youtube_url ? { youtube_url } : {}),
        ...(prompt ? { prompt } : {}),
        ...(quality ? { quality } : {}),
        ...(project_id ? { project_id } : {}),
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            analysis: result.analysis,
            model: result.model,
            agentic: result.agentic,
            usage: result.usage,
            credits_used: result.credits_used,
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerAnalyzeTools };
