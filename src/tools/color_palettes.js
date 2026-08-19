/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { UI, uiResult, appsEnabled } = require('../apps');

/** SVG strip of the palette's colors as a data URI — every palette gets a real
 *  thumbnail in the media-grid widget even when it has no source images. */
function paletteStripThumbnail(colors = []) {
  const hexes = colors.map(c => c && c.hex).filter(Boolean).slice(0, 10);
  if (hexes.length === 0) return undefined;
  const w = 320, h = 180, seg = w / hexes.length;
  const rects = hexes.map((hex, i) =>
    `<rect x="${(i * seg).toFixed(1)}" y="0" width="${seg.toFixed(1)}" height="${h}" fill="${hex}"/>`).join('');
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rects}</svg>`)}`;
}

const STICKY_NOTE ='IMPORTANT: activating a palette is STICKY and ACCOUNT-WIDE — once active, it strict-grades EVERY generation (generate_image, generate_image_edit, generate_video, generate_video_from_image) automatically until deactivated, not just the next one. Always tell the user this before activating, and mention deactivate_color_palette / skip_color_palette (per-call opt-out) as the way out.';

function registerColorPaletteTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);
  // ─── list_color_palettes ───────────────────────────────────
  server.tool(
    'list_color_palettes',
    'List the user\'s Color DNA palettes (personal + org). Each has a name, 1-10 colors, and an is_active flag — at most one palette is active per account at a time, and the active one auto-applies to every generation.',
    {},
    async () => {
      const result = await client.get('/v1/color-palettes');
      const palettes = result.color_palettes || [];
      const text = JSON.stringify({ color_palettes: palettes, pagination: result.pagination }, null, 2);

      // Ship structuredContent UNCONDITIONALLY. Gating on ui() left every host that
      // renders widgets without advertising MCP Apps (Kolbo Code) with text-only rows
      // that carry no thumbnail field at all — and its BY_TOOL map still force-mounts
      // the media grid on them, so the card rendered one broken-file glyph per cell.
      // media.js and listResult() have always done it this way; these five lagged.
      {
        return uiResult(UI.mediaGrid, text, {
          widget: 'media-grid',
          title: 'Color DNA Palettes',
          items: palettes.slice(0, 24).map(p => ({
            id: p.id,
            title: p.is_active ? `${p.name} (active)` : p.name,
            // First source image when available, else an SVG strip of the palette itself.
            thumbnail: (Array.isArray(p.source_image_urls) && p.source_image_urls[0]) || paletteStripThumbnail(p.colors),
            media_type: 'image',
            use_hint: 'Activate Color DNA palette "{TITLE}" (color_palette_id: {ID}) so it grades my generations.'
          })),
          total: result.pagination?.total || palettes.length,
          has_more: palettes.length > 24
        });
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  // ─── analyze_color_palette ──────────────────────────────────
  server.tool(
    'analyze_color_palette',
    'Extract a color palette from 1-5 reference image URLs using fast local pixel analysis (no LLM, free). Does NOT save anything — pass the returned colors to create_color_palette to save + optionally activate it.',
    {
      image_urls: z.array(z.string()).min(1).max(5).describe('1-5 public image URLs to extract dominant colors from.')
    },
    async ({ image_urls }) => {
      const result = await client.post('/v1/color-palettes/analyze', { image_urls });
      return { content: [{ type: 'text', text: JSON.stringify({ name: result.name, colors: result.colors, _hint: 'Pass these colors (and optionally the name) to create_color_palette to save this palette.' }, null, 2) }] };
    }
  );

  // ─── create_color_palette ───────────────────────────────────
  server.tool(
    'create_color_palette',
    `Save a new Color DNA palette from manual colors or from analyze_color_palette output. ${STICKY_NOTE} Pass is_active: false to save without activating.`,
    {
      name: z.string().describe('Palette name (1-100 chars).'),
      colors: z.array(z.object({
        hex: z.string().describe('#RRGGBB hex code.'),
        name: z.string().optional().describe('Color name, e.g. "terracotta".'),
        role: z.enum(['dominant', 'secondary', 'accent', 'background']).optional().describe('Role of this color in the palette. Default: "accent".')
      })).min(1).max(10).describe('1-10 colors.'),
      source_image_urls: z.array(z.string()).max(5).optional().describe('Optional reference image URLs this palette was derived from.'),
      is_active: z.boolean().optional().describe('Activate immediately on save. Default: true (saving auto-activates and unsets any other active palette).')
    },
    async ({ name, colors, source_image_urls, is_active }) => {
      const result = await client.post('/v1/color-palettes', { name, colors, source_image_urls, is_active });
      return { content: [{ type: 'text', text: JSON.stringify({ color_palette: result.color_palette }, null, 2) }] };
    }
  );

  // ─── update_color_palette ───────────────────────────────────
  server.tool(
    'update_color_palette',
    'Rename a Color DNA palette and/or replace its colors. Owner only. Does not change is_active — use activate_color_palette / deactivate_color_palette for that.',
    {
      color_palette_id: z.string().describe('Palette id (from list_color_palettes).'),
      name: z.string().optional().describe('New name.'),
      colors: z.array(z.object({
        hex: z.string(),
        name: z.string().optional(),
        role: z.enum(['dominant', 'secondary', 'accent', 'background']).optional()
      })).min(1).max(10).optional().describe('Full replacement color set (1-10). Omit to keep current colors.'),
      source_image_urls: z.array(z.string()).max(5).optional()
    },
    async ({ color_palette_id, name, colors, source_image_urls }) => {
      const result = await client.put(`/v1/color-palettes/${encodeURIComponent(color_palette_id)}`, { name, colors, source_image_urls });
      return { content: [{ type: 'text', text: JSON.stringify({ color_palette: result.color_palette }, null, 2) }] };
    }
  );

  // ─── delete_color_palette ───────────────────────────────────
  server.tool(
    'delete_color_palette',
    'Permanently delete a Color DNA palette. Owner only. If it was the active palette, generations stop being color-graded.',
    { color_palette_id: z.string().describe('Palette id to delete.') },
    async ({ color_palette_id }) => {
      const result = await client.delete(`/v1/color-palettes/${encodeURIComponent(color_palette_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── activate_color_palette ─────────────────────────────────
  server.tool(
    'activate_color_palette',
    `Make this the account's sticky active Color DNA palette (unsets any other active palette first). ${STICKY_NOTE}`,
    { color_palette_id: z.string().describe('Palette id to activate.') },
    async ({ color_palette_id }) => {
      const result = await client.post(`/v1/color-palettes/${encodeURIComponent(color_palette_id)}/activate`, {});
      return { content: [{ type: 'text', text: JSON.stringify({ color_palette: result.color_palette }, null, 2) }] };
    }
  );

  // ─── deactivate_color_palette ───────────────────────────────
  server.tool(
    'deactivate_color_palette',
    'Clear whichever Color DNA palette is currently active for the account. Generations stop being auto color-graded until another palette is activated.',
    {},
    async () => {
      const result = await client.post('/v1/color-palettes/deactivate', {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerColorPaletteTools };
