/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

// Morphious Styles: restyle a whole video into a look (Kolbo catalog or the user's own custom style).
// Apply one by passing its id as `style_id` to generate_video_from_video / generate_elements with
// model kolbo-morphious-motion. Contract: kolbo-api src/modules/morphiousStyles.

const { z } = require('zod');
const { UI, uiResult } = require('../apps');

const unwrap = r => (r && r.status === true && r.data !== undefined ? r.data : r);
const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

function registerMorphiousStyleTools(server, client) {
  server.tool(
    'list_morphious_styles',
    'List Morphious Styles: looks that restyle a WHOLE video (2D toon, painterly 3D, gouache, comic, clay, felt, yarn...). Returns the Kolbo catalog first, then the user\'s own custom styles (custom: true). To apply one, pass its id as style_id to generate_video_from_video with model "kolbo-morphious-motion" and the source video; no reference image or prompt is needed.',
    {},
    async () => {
      const styles = unwrap(await client.get('/v1/morphious-styles')).styles || [];
      return uiResult(UI.mediaGrid, JSON.stringify({ styles, count: styles.length }, null, 2), {
        widget: 'media-grid',
        title: 'Morphious Styles',
        items: styles.map(s => ({
          id: s.id,
          title: s.name,
          subtitle: s.custom ? 'Custom' : undefined,
          thumbnail: s.thumb || s.cover,
          url: s.preview || s.motion || s.cover,
          media_type: s.preview ? 'video' : 'image',
          use_hint: 'Restyle my video in the "{TITLE}" style (style_id: {ID}).',
        })),
        total: styles.length,
        has_more: false,
      });
    }
  );

  server.tool(
    'create_morphious_style',
    'Create a custom Morphious Style from 1-8 image URLs that show the look (an illustration style, a painting technique, a 3D render style). The images define the LOOK only, never the subject. Returns the style id to pass as style_id. Upload local files first with upload_media / create_upload_ticket.',
    {
      name: z.string().min(1).max(60).describe('Style name shown to the user, e.g. "Ink Wash".'),
      image_urls: z.array(z.string().url()).min(1).max(8).describe('1-8 https image URLs that show the look.'),
    },
    async ({ name, image_urls }) => text(unwrap(await client.post('/v1/morphious-styles/custom', { name, image_urls })))
  );

  server.tool(
    'delete_morphious_style',
    'Delete one of the user\'s own custom Morphious Styles. Catalog styles cannot be deleted. Past generations keep their result.',
    { style_id: z.string().min(1).max(64).describe('Custom style id from list_morphious_styles (custom: true).') },
    async ({ style_id }) => text(unwrap(await client.delete(`/v1/morphious-styles/custom/${encodeURIComponent(style_id)}`)))
  );
}

module.exports = { registerMorphiousStyleTools };
