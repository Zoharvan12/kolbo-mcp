/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { UI, uiResult, appsEnabled } = require('../apps');
const { projectScopeReadField } = require('./_shared');

function registerMoodboardTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);
  // ─── list_moodboards ───────────────────────────────────────
  server.tool(
    'list_moodboards',
    'List moodboards. By default returns ALL (personal + system presets + organization). Use "scope" to filter: "personal" (user\'s own), "preset" or "global" (system presets), or "organization" (org-shared). Returns id, name, master_prompt, thumbnail, and image URLs for each.',
    {
      scope: z.enum(['all', 'personal', 'preset', 'global', 'organization']).optional().describe('Filter by scope. Default: "all" (everything accessible). "personal" = only your own. "preset"/"global" = system presets. "organization" = org-shared.'),
      project_id: projectScopeReadField
    },
    async ({ scope, project_id } = {}) => {
      const params = new URLSearchParams();
      if (scope && scope !== 'all') params.set('scope', scope);
      if (project_id) params.set('project_id', project_id);
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

  // ─── create_moodboard ──────────────────────────────────────
  server.tool(
    'create_moodboard',
    'Create a moodboard from 1–15 image URLs. The server analyzes the images and synthesizes a reusable master style prompt — then pass the returned moodboard id as `moodboard_id` on generation tools to apply the style. Use Kolbo URLs (generated images or `upload_media` output) or any public image URL. Typical flow: generate/upload reference images → create_moodboard → generate with moodboard_id.',
    {
      name: z.string().describe('Moodboard name (1–100 chars).'),
      image_urls: z.array(z.string()).min(1).max(15).describe('1–15 public image URLs. For local files, call upload_media first and use the returned URLs.'),
      style_guide: z.string().optional().describe('Optional style notes (max 500 chars) that steer the analysis, e.g. "focus on the color grading, not the subjects".')
    },
    async ({ name, image_urls, style_guide }) => {
      const body = {
        name,
        images: image_urls.map(u => ({ type: 'url', url: u })),
        ...(style_guide ? { style_guide } : {})
      };
      const result = await client.post('/v1/moodboards', body);
      return { content: [{ type: 'text', text: JSON.stringify({ moodboard: result.moodboard, _hint: 'Pass this id as moodboard_id on generate_image / generate_creative_director to apply the style.' }, null, 2) }] };
    }
  );

  // ─── update_moodboard ──────────────────────────────────────
  server.tool(
    'update_moodboard',
    'Update a moodboard\'s name, style guide, and/or images. Providing `image_urls` REPLACES the whole image set and re-analyzes the style (master prompt regenerates). Owner only.',
    {
      moodboard_id: z.string().describe('Moodboard id (from list_moodboards).'),
      name: z.string().optional().describe('New name.'),
      style_guide: z.string().optional().describe('New style notes (empty string clears them).'),
      image_urls: z.array(z.string()).min(1).max(15).optional().describe('Full replacement image set (1–15 URLs). Omit to keep current images.')
    },
    async ({ moodboard_id, name, style_guide, image_urls }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (style_guide !== undefined) body.style_guide = style_guide;
      if (image_urls) body.images = image_urls.map(u => ({ type: 'url', url: u }));
      const result = await client.put(`/v1/moodboards/${encodeURIComponent(moodboard_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.moodboard, null, 2) }] };
    }
  );

  // ─── delete_moodboard ──────────────────────────────────────
  server.tool(
    'delete_moodboard',
    'Permanently delete a moodboard (owner only; system presets cannot be deleted). The underlying image files stay in storage — only the board is removed. Confirm with the user before deleting boards they did not just create.',
    { moodboard_id: z.string().describe('Moodboard id to delete.') },
    async ({ moodboard_id }) => {
      const result = await client.delete(`/v1/moodboards/${encodeURIComponent(moodboard_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerMoodboardTools };
