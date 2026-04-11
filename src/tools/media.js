/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { resolveToBuffer } = require('./_shared');

function registerMediaTools(server, client) {
  // ─── upload_media ──────────────────────────────────────────
  server.tool(
    'upload_media',
    'Upload a local file (or remote URL) to the user\'s Kolbo media library and get back a stable Kolbo CDN URL. Use this when the user wants to reference a local file in multiple subsequent generation calls — upload once, then pass the returned URL to generate_image / generate_video / visual_dna / etc. Auto-detects media type (image / video / audio) from the file extension. For a single-use reference where you already have a public URL, you can skip this and pass the URL directly to the generation tool.',
    {
      source: z.string().describe('URL or absolute local path to the file to upload. For local files this is the primary mode; for URLs, this re-hosts the file on Kolbo CDN for stability.'),
      description: z.string().optional().describe('Optional description / caption for the uploaded media')
    },
    async ({ source, description }) => {
      if (!source) throw new Error('source is required (URL or absolute local path)');

      // Even for URL input we download-and-reupload — that's the whole point
      // of upload_media (getting a stable Kolbo-owned URL). For ephemeral
      // pass-through, the generation tools accept URLs directly.
      const kind = /\.(mp4|mov|webm|mkv|avi|m4v)(\?|$)/i.test(source) ? 'video'
                 : /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(source) ? 'audio'
                 : 'image';
      const resolved = await resolveToBuffer(source, kind);

      const form = new FormData();
      form.append('file', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
      if (description) form.append('description', description);

      const result = await client.postMultipart('/v1/media/upload', form);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.media || result, null, 2)
        }]
      };
    }
  );

  // ─── list_media ────────────────────────────────────────────
  server.tool(
    'list_media',
    'List the user\'s uploaded media from their Kolbo media library. Supports filtering by type (image / video / audio) and pagination. Returns items with stable URLs, names, sizes, and upload timestamps. Use this to discover what the user has previously uploaded before deciding whether to create new content.',
    {
      type: z.string().optional().describe('Filter by type: "image" | "video" | "audio". Omit for all types.'),
      page: z.number().optional().describe('Page number (1-indexed). Default: 1'),
      page_size: z.number().optional().describe('Items per page. Default: 20, max 100'),
      search: z.string().optional().describe('Optional full-text search term matched against media names and descriptions')
    },
    async ({ type, page, page_size, search }) => {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (page) params.set('page', String(page));
      if (page_size) params.set('pageSize', String(page_size));
      if (search) params.set('searchTerm', search);

      const qs = params.toString();
      const result = await client.get(`/v1/media${qs ? '?' + qs : ''}`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            media: result.media || [],
            pagination: result.pagination || null
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerMediaTools };
