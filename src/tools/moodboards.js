/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { UI, uiResult, appsEnabled } = require('../apps');

function registerMoodboardTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);
  // ─── list_moodboards ───────────────────────────────────────
  server.tool(
    'list_moodboards',
    'List moodboards. By default returns ALL (personal + system presets + organization). Use "scope" to filter: "personal" (user\'s own), "preset" or "global" (system presets), or "organization" (org-shared). Returns id, name, master_prompt, thumbnail, and image URLs for each.',
    {
      scope: z.enum(['all', 'personal', 'preset', 'global', 'organization']).optional().describe('Filter by scope. Default: "all" (everything accessible). "personal" = only your own. "preset"/"global" = system presets. "organization" = org-shared.')
    },
    async ({ scope } = {}) => {
      const params = new URLSearchParams();
      if (scope && scope !== 'all') params.set('scope', scope);
      const qs = params.toString();
      const result = await client.get(`/v1/moodboards${qs ? '?' + qs : ''}`);
      const moodboards = result.moodboards || [];
      const text = JSON.stringify({
        moodboards,
        count: result.count || 0
      }, null, 2);

      if (ui()) {
        return uiResult(UI.mediaGrid, text, {
          widget: 'media-grid',
          title: 'Moodboards',
          items: moodboards.slice(0, 24).map(mb => ({
            id: mb.id,
            title: mb.name,
            thumbnail: mb.thumbnail || (Array.isArray(mb.image_urls) ? mb.image_urls[0] : undefined),
            media_type: 'image',
            use_hint: 'Apply moodboard "{TITLE}" (moodboard_id: {ID}) to my next generation.'
          })),
          total: result.count || moodboards.length,
          has_more: moodboards.length > 24
        });
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  // ─── get_moodboard ─────────────────────────────────────────
  server.tool(
    'get_moodboard',
    'Fetch a single moodboard by ID. Returns the full moodboard including master_prompt, style_guide, and all image URLs.',
    {
      moodboard_id: z.string().describe('The moodboard ID')
    },
    async ({ moodboard_id }) => {
      const result = await client.get(`/v1/moodboards/${encodeURIComponent(moodboard_id)}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.moodboard || result, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerMoodboardTools };
