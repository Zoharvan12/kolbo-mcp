/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');

function registerMoodboardTools(server, client) {
  // ─── list_moodboards ───────────────────────────────────────
  server.tool(
    'list_moodboards',
    'List moodboards available to you: your own, system presets, and any organization moodboards. Returns id, name, master_prompt, thumbnail, and image URLs for each.',
    {},
    async () => {
      const result = await client.get('/v1/moodboards');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            moodboards: result.moodboards || [],
            count: result.count || 0
          }, null, 2)
        }]
      };
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
