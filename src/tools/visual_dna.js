/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { resolveToBuffer: sharedResolveToBuffer, VISUAL_DNA_MAX_BYTES, projectScopeReadField, compactList } = require('./_shared');
const { UI, uiResult, listResult, appsEnabled } = require('../apps');

// Visual DNA caps reference media at 25MB per file (stricter than the
// default _shared.resolveToBuffer cap — DNA profiles only need enough
// source signal to extract features, not full-quality media).
function resolveToBuffer(source, kind) {
  return sharedResolveToBuffer(source, kind, { maxBytes: VISUAL_DNA_MAX_BYTES });
}

function registerVisualDnaTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);
  // ─── create_visual_dna ─────────────────────────────────────
  server.tool(
    'create_visual_dna',
    'Create a Visual DNA profile from reference media. Each item in images/video/audio can be a public URL or an absolute local file path. Max 4 images, 1 video, 1 audio. Files capped at 25MB each. For EVERY DNA type, a reference sheet dramatically improves consistency (character turnaround / product details / location angles / style board) — offer to generate one with `generate_character_sheet` (matching `sheet_type`) first, then pass its URL as `character_sheet_url` here (see that tool).',
    {
      name: z.string().describe('Name of the Visual DNA profile. **Pick a short, lowercase, no-space single token** (e.g. `maya`, `tokyo_neon`, `brand_red`, `esther_model`) — never names with spaces (`Sarah Johnson` ❌). The user/LLM types this as `@<name>` inside generation prompts, and the @ parser stops at the first space, so `@Sarah Johnson` matches only `Sarah` and the binding silently drops. Multi-word concepts should use underscores or be a single token. Names are case-insensitive on lookup, but **reserved** values rejected on creation: `Image1`, `Image2`, …, `Video1`, …, `Audio1`, … (any-language characters allowed; max 100 chars).'),
      dna_type: z.string().optional().describe('Type: "character", "style", "product", "scene", "environment". Default: "character"'),
      prompt_helper: z.string().optional().describe('Optional description/notes to guide DNA extraction'),
      images: z.array(z.string()).optional().describe('Array of image sources (URLs or absolute local paths). Max 4.'),
      video: z.string().optional().describe('Optional video source (URL or absolute local path)'),
      audio: z.string().optional().describe('Optional audio source (URL or absolute local path)'),
      character_sheet_url: z.string().optional().describe('URL of a reference sheet (from `generate_character_sheet`, any sheet_type) to set as the DNA\'s primary reference. Works for ALL DNA types — character turnaround, product detail sheet, location sheet, or style board — and is the single biggest consistency booster. Omit only when the user declines.')
    },
    async ({ name, dna_type, prompt_helper, images, video, audio, character_sheet_url }) => {
      if (!name || !name.trim()) {
        throw new Error('name is required');
      }

      const imageList = Array.isArray(images) ? images.filter(Boolean) : [];
      if (imageList.length > 4) {
        throw new Error('Maximum 4 images allowed');
      }
      if (imageList.length === 0 && !video && !audio) {
        throw new Error('At least one media reference (image, video, or audio) is required');
      }

      // Resolve all sources to buffers in parallel.
      const [imageFiles, videoFile, audioFile] = await Promise.all([
        Promise.all(imageList.map(src => resolveToBuffer(src, 'image'))),
        video ? resolveToBuffer(video, 'video') : Promise.resolve(null),
        audio ? resolveToBuffer(audio, 'audio') : Promise.resolve(null)
      ]);

      const form = new FormData();
      form.append('name', name);
      if (dna_type) form.append('dnaType', dna_type);
      if (prompt_helper) form.append('promptHelper', prompt_helper);
      if (character_sheet_url) form.append('characterSheetUrl', character_sheet_url);

      for (const f of imageFiles) {
        form.append('images', f.buffer, { filename: f.filename, contentType: f.contentType });
      }
      if (videoFile) {
        form.append('videos', videoFile.buffer, { filename: videoFile.filename, contentType: videoFile.contentType });
      }
      if (audioFile) {
        form.append('audio', audioFile.buffer, { filename: audioFile.filename, contentType: audioFile.contentType });
      }

      const result = await client.postMultipart('/v1/visual-dna', form);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.visual_dna || result, null, 2)
        }]
      };
    }
  );

  // ─── list_visual_dnas ──────────────────────────────────────
  server.tool(
    'list_visual_dnas',
    'List the user\'s OWN Visual DNA profiles. This is almost always what you want — "my characters", '
    + '"which DNAs do I have", picking a DNA for a generation. Pass `project_id` to also include a shared '
    + 'project\'s DNAs (teammates\' assets on that project). '
    + 'Kolbo ALSO ships a large library of ~1000 global cast/preset DNAs — those are NOT returned by default '
    + 'because dumping them buries the user\'s own handful. Only pass scope="global" (optionally with '
    + '`collection` and `search`) when the user explicitly wants to BROWSE the preset cast — e.g. "find me a '
    + 'character", "show me street style models", "I need a location DNA" — and they have not named one of '
    + 'their own. Use scope="all" only if the user genuinely wants both at once. '
    + 'The response reports `total` and `_truncated`; when there are more matches than one '
    + 'page holds, raise `limit` or walk `page` — do not tell the user the extras do not exist.',
    {
      scope: z.enum(['all', 'personal', 'global', 'organization']).optional().describe('Default: "personal" — the user\'s own DNAs (plus a shared project\'s when project_id is set). "global" = the ~1000 system cast/preset DNAs, for browsing when the user needs a character and has none of their own. "organization" = org-shared. "all" = everything, rarely wanted.'),
      search: z.string().optional().describe('Search by name, tags, or description (case-insensitive). Matches at WORD STARTS, so "man" finds "Man"/"Manager" but not "woman" or "romantic". Name matches are ranked first.'),
      collection: z.string().optional().describe('Filter global presets by collection: cast, influencers, props, locations, styles, glamour, street'),
      tags: z.string().optional().describe('Comma-separated tags to filter by (OR logic)'),
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1. Needed to reach the global cast beyond the first page.'),
      limit: z.number().optional().describe('Results per page, max 100. Default: 50'),
      project_id: projectScopeReadField
    },
    async ({ scope, search, collection, tags, page, limit, project_id } = {}) => {
      const params = new URLSearchParams();
      // Default to the user's OWN DNAs. The API defaults to "all", which pulls
      // in ~1000 global cast presets and buries the handful the user actually
      // made. Global is opt-in via scope="global" (browse the preset cast).
      // Shared-project assets still come through project_id, independently.
      const effectiveScope = scope || 'personal';
      if (effectiveScope !== 'all') params.set('scope', effectiveScope);
      if (search) params.set('search', search);
      if (collection) params.set('collection', collection);
      if (tags) params.set('tags', tags);
      // Always paged. Without these the ~1000-item global cast came back whole and
      // was silently cut to the display cap, so nothing past the first screen was
      // reachable through this tool at all.
      params.set('page', String(page && page > 0 ? Math.floor(page) : 1));
      params.set('limit', String(limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 50));
      if (project_id) params.set('project_id', project_id);
      const qs = params.toString();
      const result = await client.get(`/v1/visual-dna${qs ? '?' + qs : ''}`);
      const dnas = result.visual_dnas || [];
      const total = result.total != null ? result.total : (result.count || dnas.length);
      // Full profiles measured 74,310 chars — the embedded analysis/description
      // blobs are large and the model only needs enough to pick an id.
      const text = compactList(dnas, {
        fields: ['id', 'name', 'type', 'folder_id', 'tags', 'thumbnail'],
        cap: 60,
        total,
        note: 'Narrow with `search`, `tags`, or `collection`, or pass `page`/`limit` for the rest; get_visual_dna returns one in full.',
      });

      if (ui()) {
        return uiResult(UI.mediaGrid, text, {
          widget: 'media-grid',
          title: 'Visual DNA Profiles',
          items: dnas.slice(0, 24).map(d => ({
            id: d.id,
            title: d.name,
            subtitle: (d.dna_type || '') + (Array.isArray(d.tags) && d.tags.length ? ' · ' + d.tags.slice(0, 3).join(', ') : ''),
            thumbnail: d.thumbnail_url || d.thumbnail,
            media_type: 'image',
            use_hint: 'Use Visual DNA "{TITLE}" (id: {ID}) in my next generation for character/style consistency.'
          })),
          total,
          has_more: result.has_more || dnas.length > 24
        });
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  // ─── get_visual_dna ────────────────────────────────────────
  server.tool(
    'get_visual_dna',
    'Fetch a single Visual DNA profile by ID. Returns the full profile including system_prompt and all reference images. To fetch a teammate\'s Visual DNA that lives in a shared project, pass project_id (you need edit+ on it).',
    {
      visual_dna_id: z.string().describe('The Visual DNA profile ID'),
      project_id: projectScopeReadField
    },
    async ({ visual_dna_id, project_id }) => {
      const suffix = project_id ? `?project_id=${encodeURIComponent(project_id)}` : '';
      const result = await client.get(`/v1/visual-dna/${encodeURIComponent(visual_dna_id)}` + suffix);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.visual_dna || result, null, 2)
        }]
      };
    }
  );

  // ─── delete_visual_dna ─────────────────────────────────────
  server.tool(
    'delete_visual_dna',
    'Delete a Visual DNA profile by ID. Only the owner can delete.',
    {
      visual_dna_id: z.string().describe('The Visual DNA profile ID to delete')
    },
    async ({ visual_dna_id }) => {
      const result = await client.delete(`/v1/visual-dna/${encodeURIComponent(visual_dna_id)}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: result.message || 'Visual DNA deleted'
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_character_sheet ──────────────────────────────
  server.tool(
    'generate_character_sheet',
    'Generate a reference sheet for a Visual DNA from 1+ reference image URLs — the same step the in-app Visual DNA wizard offers, for EVERY DNA type via `sheet_type`: character = multi-angle turnaround, product = angles + branding/material/construction close-ups, environment = location angles + one signature detail, style = a style board (the same look applied to six varied subjects). The sheet is the single strongest consistency booster for a DNA, and it always preserves the reference\'s original art style (2D stays 2D, photo stays photo). CHARGES CREDITS, so when the user is about to create a DNA, OFFER this first ("want me to generate a reference sheet for stronger consistency? it costs a few credits") and only run it on a yes. Returns `character_sheet_url` — pass it as `character_sheet_url` to `create_visual_dna` with the matching `dna_type`.',
    {
      image_urls: z.array(z.string()).min(1).describe('Reference image URLs of the subject (for characters: front/side/varied angles work best). Use generated-image URLs or upload_media output.'),
      sheet_type: z.enum(['character', 'character_headless', 'character_bible', 'product', 'environment', 'style']).optional().describe('Sheet layout. character = front/back/face turnaround. character_headless = wardrobe/body refs with a headless front panel (use when clothing must change without fighting the face sheet). character_bible = denser production model-sheet (turnaround + faces + wardrobe + color swatches). product / environment / style = matching DNA types. Defaults to character.')
    },
    async ({ image_urls, sheet_type }) => {
      const result = await client.post('/v1/visual-dna/character-sheet', { image_urls, ...(sheet_type ? { sheet_type } : {}) });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            character_sheet_url: result.character_sheet_url,
            credits_used: result.credits_used,
            _hint: 'Show the sheet to the user, then pass character_sheet_url to create_visual_dna as that DNA\'s reference.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── Visual DNA folders (organize characters) ──────────────
  // Folders are user-scoped and flat. Only PERSONAL Visual DNAs can live in
  // folders — global/organization presets are rejected by the server.

  server.tool(
    'list_visual_dna_folders',
    'List the user\'s Visual DNA folders with per-folder item counts. Use to organize large character casts: find the right folder before moving a DNA, or show the user how their characters are grouped. To list the DNAs INSIDE a folder, call `list_visual_dnas` and filter by the `folder_id` field on each profile.',
    {},
    async () => {
      const result = await client.get('/v1/visual-dna/folders');
      const folders = result.folders || [];
      const text = JSON.stringify({ folders, count: result.count || 0 }, null, 2);

      return listResult(text, {
        widget: 'list',
        title: 'Visual DNA Folders',
        items: folders.map(f => ({
          id: f.id,
          title: f.name,
          meta: f.item_count != null ? (f.item_count + (f.item_count === 1 ? ' DNA' : ' DNAs')) : null,
          use_hint: 'List Visual DNAs in my "{TITLE}" folder (folder_id: {ID}).'
        })),
        total: folders.length
      });
    }
  );

  server.tool(
    'create_visual_dna_folder',
    'Create a Visual DNA folder for organizing characters (e.g. "Main Cast", "Villains", "Film X Characters"). Folder names are unique per user (409 on duplicates). Then use `move_visual_dna_to_folder` to file DNAs into it.',
    {
      name: z.string().describe('Folder name (max 100 chars, unique per user).'),
      color: z.string().optional().describe('Optional hex color for the folder chip, e.g. "#FF5733".')
    },
    async ({ name, color }) => {
      const body = { name };
      if (color) body.color = color;
      const result = await client.post('/v1/visual-dna/folders', body);
      return { content: [{ type: 'text', text: JSON.stringify(result.folder, null, 2) }] };
    }
  );

  server.tool(
    'update_visual_dna_folder',
    'Rename and/or recolor a Visual DNA folder.',
    {
      folder_id: z.string().describe('The folder id (from list_visual_dna_folders).'),
      name: z.string().describe('New folder name (required by the server — pass the current name to keep it).'),
      color: z.string().optional().describe('New hex color, e.g. "#00AA00".')
    },
    async ({ folder_id, name, color }) => {
      const body = { name };
      if (color !== undefined) body.color = color;
      const result = await client.put(`/v1/visual-dna/folders/${encodeURIComponent(folder_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.folder, null, 2) }] };
    }
  );

  server.tool(
    'delete_visual_dna_folder',
    'Delete a Visual DNA folder. The DNAs inside are NOT deleted — they move back to the root level (response includes items_moved_to_root). Safe to call without confirmation for empty folders; mention the contents-move when the folder has items.',
    {
      folder_id: z.string().describe('The folder id to delete.')
    },
    async ({ folder_id }) => {
      const result = await client.delete(`/v1/visual-dna/folders/${encodeURIComponent(folder_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'move_visual_dna_to_folder',
    'Move a Visual DNA into a folder, or back to root. Personal DNAs only — global presets must be imported first, and organization DNAs cannot go in personal folders. When creating many characters for a project, create a folder first and file each DNA as you go.',
    {
      visual_dna_id: z.string().describe('The Visual DNA profile id to move.'),
      folder_id: z.string().nullable().describe('Target folder id (from list_visual_dna_folders), or null to move the DNA back to root.')
    },
    async ({ visual_dna_id, folder_id }) => {
      const result = await client.put(`/v1/visual-dna/${encodeURIComponent(visual_dna_id)}/folder`, { folder_id: folder_id ?? null });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerVisualDnaTools };
