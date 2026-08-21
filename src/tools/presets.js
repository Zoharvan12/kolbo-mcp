/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { UI, uiResult, appsEnabled } = require('../apps');
const { compactList } = require('./_shared');

function registerPresetTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);
  // ─── list_presets ──────────────────────────────────────────
  server.tool(
    'list_presets',
    'Resolve a generation preset and pass its exact id as preset_id. ALWAYS pass `search` when you already know the name (headless, bible, character sheet, a user preset) — that is a silent id lookup, not a catalog to show the user. Omit search only when they asked to browse. Custom instructions live on the preset, so prefer generate_image + preset_id over generate_character_sheet. Never invent an id.',
    {
      type: z.string().optional().describe('Filter by catalog: "image" | "image_edit" | "video" | "music" | "text_to_video". Omit for all.'),
      search: z.string().optional().describe('Name lookup, e.g. "headless", "bible", "character sheet". Required when resolving a named sheet/style — do not list the whole catalog.')
    },
    async ({ type, search }) => {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (search) params.set('search', search);
      const qs = params.toString();
      const result = await client.get(`/v1/presets${qs ? '?' + qs : ''}`);

      let presets = result.presets || [];
      if (search && !result.search) {
        const q = search.toLowerCase();
        presets = presets.filter((p) => `${p.name || ''} ${p.description || ''} ${p.category || ''}`.toLowerCase().includes(q));
      }
      const lookup = Boolean(search);
      // Full catalog measured 632,919 chars. A named lookup should return a handful of rows.
      const text = compactList(presets, {
        fields: ['id', 'name', 'category', 'type', 'description'],
        cap: lookup ? 8 : 12,
        total: result.count || presets.length,
        extra: {
          ...(result.warning ? { warning: result.warning } : {}),
          ...(lookup ? { _lookup: true } : {}),
        },
        note: lookup
          ? 'Pick the closest id and pass it as preset_id. Do not show this list to the user.'
          : 'Pass search next time if you already know the name. Pass the chosen exact id as preset_id.',
      });

      if (lookup) return { content: [{ type: 'text', text }] };

      return uiResult(UI.list, text, {
        widget: 'list',
        title: 'Presets' + (type ? ' — ' + type : ''),
        items: presets.slice(0, 8).map(p => ({
          id: p.id,
          title: p.name,
          subtitle: p.category,
          thumbnail: p.thumbnail_url || p.thumbnail,
          media_type: p.audio_url ? 'audio' : 'image',
          preview_audio: p.audio_url,
          url: p.thumbnail_url || p.thumbnail,
          use_hint: 'Use preset "{TITLE}" (preset_id: {ID}) for my next generation — ask me for the prompt.'
        })),
        total: result.count || presets.length,
        has_more: presets.length > 8
      });
    }
  );

  // ─── list_cinematic_presets ────────────────────────────────
  server.tool(
    'list_cinematic_presets',
    'List Kolbo "Cinema mode" presets for image generation/editing — a deliberate photographic ' +
    'treatment layered onto the prompt. Returns presets grouped by DIMENSION (data-driven from the ' +
    'live catalog; today: camera, lens, focal_length, aperture, angle, shot_type, color_palette, ' +
    'lighting). Each preset has id, name, description, thumbnail. ONLY call this when the user wants a ' +
    'specific cinematic look; then pass the chosen ids via the `cinematic` arg of generate_image / ' +
    'generate_image_edit — at most one id per dimension. "Auto" is the absence of a selection: omit a ' +
    'dimension (or the whole `cinematic` object) to let the enhancer decide. For an ordinary generation ' +
    'do not call this at all. Never hardcode ids — dimensions and presets change; always fetch here. ' +
    'Call with no args for a compact id+name index of every dimension, then pass `dimension` to get the ' +
    'full descriptions for just the one you are choosing from.',
    {
      dimension: z.string().optional().describe(
        'Return full detail (incl. descriptions) for ONE dimension only — e.g. "lighting", "camera", ' +
        '"looks". Omit for the compact index of all dimensions.'
      ),
    },
    async ({ dimension }) => {
      const result = await client.get('/v1/cinematic-presets');
      // The public route serves the raw grouped map ({ camera:[...], lens:[...] });
      // the SDK envelope wraps it as { dimensions:{...} }. Accept either shape.
      const dimensions = (result && result.dimensions) || result || {};
      const names = Object.keys(dimensions);

      // The full catalog pretty-printed is ~63K chars — past what hosts accept, so the
      // tool used to fail outright. thumbnail_url is dead weight on a text surface, and
      // descriptions are only needed for the dimension actually being chosen from.
      const slim = (p) => ({ id: p.id, name: p.name });
      const full = (p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        ...(p.bundle ? { bundle: p.bundle } : {}),
      });

      let payload;
      if (dimension && dimensions[dimension]) {
        payload = {
          dimension,
          presets: (dimensions[dimension] || []).map(full),
          available_dimensions: names,
        };
      } else {
        if (dimension) payload = { _note: `Unknown dimension "${dimension}" — showing the index.` };
        payload = {
          ...payload,
          dimensions: Object.fromEntries(names.map((k) => [k, (dimensions[k] || []).map(slim)])),
          available_dimensions: names,
          _detail_hint: 'Names only. Call again with `dimension: "<name>"` for descriptions.',
        };
      }

      payload._usage_hint = 'Include ONLY the dimensions the user actually wants; pass their ids as the ' +
        '`cinematic` arg on generate_image / generate_image_edit, e.g. {"camera":"<id>","lighting":"<id>"}. ' +
        'Every omitted/null dimension is Auto — the enhancer completes the look in the spirit of the ones ' +
        'you set. Omit the whole object for a non-cinematic generation. Ids are validated per-dimension server-side.';

      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
  );
}

module.exports = { registerPresetTools };
