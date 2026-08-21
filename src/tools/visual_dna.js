/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { resolveToBuffer: sharedResolveToBuffer, VISUAL_DNA_MAX_BYTES, projectScopeReadField, compactList } = require('./_shared');
const { UI, uiResult, listResult } = require('../apps');

// Reference sheets are a blocking multi-panel render; the 120s client default
// aborted them mid-flight while the server finished and charged anyway.
const CHARACTER_SHEET_TIMEOUT_MS = Number(process.env.KOLBO_CHARACTER_SHEET_TIMEOUT_MS) || 600000;

// Visual DNA caps reference media at 25MB per file (stricter than the
// default _shared.resolveToBuffer cap — DNA profiles only need enough
// source signal to extract features, not full-quality media).
function resolveToBuffer(source, kind) {
  return sharedResolveToBuffer(source, kind, { maxBytes: VISUAL_DNA_MAX_BYTES });
}

function registerVisualDnaTools(server, client, options = {}) {
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
      audio: z.string().optional().describe('Optional audio source (URL or absolute local path) — the character\'s voice, 5-30s of clean speech. Stored on the DNA and used two ways: (1) as REFERENCE AUDIO in video generation — attaching this DNA to an image-to-video generation on a model with audio slots (Seedance 2.x, Wan 3.0) auto-attaches the clip and tells the model it is that character\'s voice; (2) as the source for a real speaking voice, but ONLY when you ask for one — see `voice_source`.'),
      voice_source: z.enum(['none', 'clone', 'assign', 'design']).optional().describe('What to do about a SPEAKING voice. **Pass "none" when the audio is just a reference clip** (the usual case for video work) — the clip is stored and usable as video reference audio, and nothing else happens. "clone" mints an ElevenLabs voice from the uploaded audio, which consumes a voice slot and may EVICT another of the user\'s voices to free one; it also makes the DNA addressable as `dna_<id>` in text-to-speech. "assign" points at an existing voice (pass `assigned_voice_id`). "design" generates a voice from the character\'s look. ⚠️ Omitting this while passing `audio` keeps the legacy behaviour and CLONES — pass "none" explicitly unless the user asked for a voice.'),
      assigned_voice_id: z.string().optional().describe('Voice to attach when voice_source="assign" — a `custom_<id>` from the user\'s clones or a voice_id from `list_voices`.'),
      character_sheet_url: z.string().optional().describe('URL of a reference sheet (from `generate_character_sheet`, any sheet_type) to set as the DNA\'s primary reference. Works for ALL DNA types — character turnaround, product detail sheet, location sheet, or style board — and is the single biggest consistency booster. Omit only when the user declines.')
    },
    async ({ name, dna_type, prompt_helper, images, video, audio, voice_source, assigned_voice_id, character_sheet_url }) => {
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
      // Omitted stays omitted: the server infers 'clone' from a present audio clip, which is the
      // long-standing behaviour older installs depend on. Only an explicit choice is forwarded.
      if (voice_source) form.append('voiceSource', voice_source);
      if (assigned_voice_id) form.append('assignedVoiceId', assigned_voice_id);

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
      // `has_voice_reference` rides along because it changes what a DNA DOES in a generation:
      // such a DNA brings its own voice as reference audio on models with audio slots. Without
      // it the model has to fetch each DNA in full just to find out.
      const text = compactList(dnas, {
        fields: ['id', 'name', 'type', 'dna_type', 'folder_id', 'tags', 'thumbnail', 'description', 'sheet_url', 'has_voice_reference'],
        cap: 60,
        total,
        note: 'Narrow with `search`, `tags`, or `collection`, or pass `page`/`limit` for the rest; get_visual_dna returns one in full.',
      });

      // Always ship structuredContent. Kolbo Code does NOT advertise MCP Apps, so
      // gating the grid payload on appsEnabled() sent it text only; the host then
      // rebuilt items from the compactList text, whose field names are
      // `filename`/`url` — not the `title`/`thumbnail` the grid renders — so every
      // tile came out black and unlabelled. Same reasoning as listResult().
      return uiResult(UI.mediaGrid, text, {
        widget: 'media-grid',
        title: 'Visual DNA Profiles',
        items: dnas.slice(0, 24).map(d => ({
          id: d.id,
          title: d.name,
          subtitle: (d.dna_type || '') + (Array.isArray(d.tags) && d.tags.length ? ' · ' + d.tags.slice(0, 3).join(', ') : ''),
          thumbnail: d.sheet_url || d.thumbnail_url || d.thumbnail,
          url: d.sheet_url || d.thumbnail_url || d.thumbnail,
          media_type: 'image',
          use_hint: 'Use Visual DNA "{TITLE}" (id: {ID}) in my next generation for character/style consistency.'
        })),
        total,
        has_more: result.has_more || dnas.length > 24
      });
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
    'STANDARD FIRST STEP OF THE ASSET PASS for any film/ad/scene: inventory the characters, locations and props the script needs, generate a sheet for each, create its Visual DNA from that sheet, confirm the whole set with the user, and only THEN generate video. Sheets for cinematic environments and invented characters run well on `mirage-film-2` (3cr); use `nano-banana-2` (10cr) or `gpt-image-2` (12cr) when reference fidelity or legible text matters. Generate a reference sheet for a Visual DNA from 1+ reference image URLs — the same step the in-app Visual DNA wizard offers, for EVERY DNA type via `sheet_type`: character = multi-angle turnaround, product = angles + branding/material/construction close-ups, environment = location angles + one signature detail, style = a style board (the same look applied to six varied subjects). The sheet is the single strongest consistency booster for a DNA, and it always preserves the reference\'s original art style (2D stays 2D, photo stays photo). CHARGES CREDITS, so when the user is about to create a DNA, OFFER this first ("want me to generate a reference sheet for stronger consistency? it costs a few credits") and only run it on a yes. Returns `character_sheet_url` — pass it as `character_sheet_url` to `create_visual_dna` with the matching `dna_type`.',
    {
      image_urls: z.array(z.string()).min(1).describe('Reference image URLs of the subject (for characters: front/side/varied angles work best). Use generated-image URLs or upload_media output.'),
      sheet_type: z.enum(['character', 'character_headless', 'character_bible', 'product', 'environment', 'style']).optional().describe('Sheet layout. character = front/back/face turnaround. character_headless = wardrobe/body refs with a headless front panel (use when clothing must change without fighting the face sheet). character_bible = denser production model-sheet (turnaround + faces + wardrobe + color swatches). product / environment / style = matching DNA types. Defaults to character. This IS the Character Sheet / Headless / Bible preset — do not call list_presets for those names.'),
      model: z.string().optional().describe('Image model for the sheet. Default nano-banana-2. Pass gpt-image-2 when the user names it.'),
      resolution: z.enum(['2K', '4K']).optional().describe('Sheet resolution. 2K or 4K only — never 1K. Default 2K. Use 4K for character_bible, high-detail leads, or when the user asks.')
    },
    async ({ image_urls, sheet_type, model, resolution }) => {
      // The endpoint is blocking and a 2K multi-panel sheet routinely runs past the
      // 120s default: the MCP aborted while kolbo-api kept going, finished, and
      // billed — the user saw "Failed" for a sheet they had already paid for.
      const result = await client.post(
        '/v1/visual-dna/character-sheet',
        {
          image_urls,
          ...(sheet_type ? { sheet_type } : {}),
          ...(model ? { model } : {}),
          ...(resolution ? { resolution } : {}),
        },
        { timeoutMs: CHARACTER_SHEET_TIMEOUT_MS },
      );
      // `urls` is NOT redundant with character_sheet_url. Every generation-card
      // reader keys on `urls` — the MCP's own widget (apps/widgets/generation.js),
      // kolbo-code's kolbo-operation.ts mediaUrls(), and its operation.js urlsOf().
      // Kolbo Code mounts a generation card for ANY tool named `generate_*`, so
      // returning only character_sheet_url gave the card zero URLs and it rendered
      // "No output received / Failed" on top of a sheet that generated fine and was
      // already billed — and "Try Again" then double-charged. `widget`/`phase` mark
      // the payload as a completed generation so the card stops falling back to the
      // stale `phase: "review"` envelope built before the tool ran.
      const urls = result.character_sheet_url ? [result.character_sheet_url] : [];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            character_sheet_url: result.character_sheet_url,
            urls,
            widget: 'generation',
            phase: 'completed',
            kind: 'image',
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
