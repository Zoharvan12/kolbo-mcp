/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { projectIdField } = require('./_shared');
const { UI, uiResult } = require('../apps');

const REVIEW_STATUS = z.enum(['in_progress', 'needs_review', 'approved', 'changes_requested']);
const APP = 'https://app.kolbo.ai';

// Owner-side app links. The API only returns guest share_url, so agents had no
// link to hand the user after an upload. Additive field — text shape otherwise unchanged.
const assetUrl = (a) => (a && a.id ? { ...a, open_url: `${APP}/review/asset/${a.id}` } : a);
const collectionUrl = (c) => (c && c.id
  ? { ...c, open_url: `${APP}/review${c.project_id ? `?project=${c.project_id}` : ''}` }
  : c);
function withLinks(result) {
  if (!result || typeof result !== 'object') return result;
  const out = { ...result };
  if (out.asset) out.asset = assetUrl(out.asset);
  if (Array.isArray(out.assets)) out.assets = out.assets.map(assetUrl);
  if (out.collection) out.collection = collectionUrl(out.collection);
  if (Array.isArray(out.collections)) out.collections = out.collections.map(collectionUrl);
  return out;
}
const linked = (result) => ({ content: [{ type: 'text', text: JSON.stringify(withLinks(result), null, 2) }] });
// Review player card (ui://kolbo/review.html). Hosts that mount widgets hand the
// model structuredContent instead of text, so the payload carries the full
// linked result plus widget keys; text stays byte-identical to `linked`.
const card = (tool, payload, extra) => uiResult(
  UI.review,
  JSON.stringify(payload, null, 2),
  { ...payload, ...(extra || {}), widget: 'review', tool }
);

function registerReviewTools(server, client) {
  // ─── get_review_storage_usage ────────────────────────────────
  server.tool(
    'get_review_storage_usage',
    'Get Kolbo Review storage usage for the API-key owner (5GB cap across all review versions).',
    {},
    async () => {
      const result = await client.get('/v1/review/storage-usage');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── list_review_assets ──────────────────────────────────────
  server.tool(
    'list_review_assets',
    'List review assets in a project (Frame.io-style client review). Pass `project_id` from `list_projects`. Optional filters: `collection_id`, `status`, pagination.',
    {
      project_id: projectIdField,
      collection_id: z.string().optional().describe('Filter to one review collection.'),
      status: REVIEW_STATUS.optional(),
      page: z.number().optional(),
      limit: z.number().optional(),
    },
    async ({ project_id, collection_id, status, page, limit }) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      if (collection_id) params.set('collection_id', collection_id);
      if (status) params.set('status', status);
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      const result = await client.get(`/v1/review/assets${qs ? '?' + qs : ''}`);
      return card('list_review_assets', withLinks(result));
    }
  );

  // ─── get_review_asset ────────────────────────────────────────
  server.tool(
    'get_review_asset',
    'Fetch one review asset with all versions, status, media URLs, and asset.open_url. On widget hosts this shows the review player, where the user watches the cut and leaves timestamped notes in chat — call it to "show the cut for review".',
    {
      asset_id: z.string().describe('Review asset ObjectId from list_review_assets or create_review_asset.'),
    },
    async ({ asset_id }) => {
      const result = await client.get(`/v1/review/assets/${encodeURIComponent(asset_id)}`);
      // Preload notes so the card paints them without a widget round trip.
      // Best effort: a failure here must not fail the asset read.
      const notes = await client.get(`/v1/review/assets/${encodeURIComponent(asset_id)}/comments`).catch(() => null);
      return card('get_review_asset', withLinks(result), notes && Array.isArray(notes.comments) ? { comments: notes.comments } : undefined);
    }
  );

  // ─── create_review_asset ─────────────────────────────────────
  server.tool(
    'create_review_asset',
    "WHICH REVIEW: one cut, edit, render or design the user (or their client) judges = create_review_asset (timestamped notes, versions, approve). MANY files to sort, pick or approve (a batch of images, takes, thumbnails, ad variants, a client delivery) = create_review_album, one call. Create a Kolbo Review asset with v1 media attached — use it proactively when you finish a cut, edit, or render the user should judge: they leave timestamped notes on the video and you read them back with list_review_comments. Result carries asset.open_url (owner link in the Kolbo app) — always hand it to the user as a clickable link. Media you already have a URL for (a generation result, list_media, any public link): pass `media_url` and never re-upload. Only a local file needs `upload_media`, `create_upload_ticket` or `media_upload_widget` first (then pass `media_id`). For a batch the user grades (an album), first create_review_collection with grading_enabled, then one create_review_asset per file with that collection_id. Requires `project_id` when the user named a project.",
    {
      name: z.string().describe('Display name for the review asset.'),
      media_id: z.string().optional().describe('MediaLibraryItem id from upload_media / list_media.'),
      media_url: z.string().optional().describe("Public URL of media you already have: any Kolbo media URL (a generation output, list_media item) or another public image/video/audio link. ALWAYS prefer this over re-uploading: your own Kolbo media is reused, any other public link is attached in place with no copy. Pass media_id OR media_url."),
      project_id: projectIdField,
      collection_id: z.string().optional().describe('Optional review collection folder id.'),
      version_note: z.string().optional().describe('Optional note on the first version (max 1000 chars).'),
    },
    async (args) => {
      const result = await client.post('/v1/review/assets', args);
      return card('create_review_asset', {
        ...withLinks(result),
        _hint: 'Asset created. ALWAYS give the user asset.open_url as a clickable link (or open it) so they can leave timestamped notes. On widget hosts the user can also leave notes right in the review card. For clients without a Kolbo account, create_review_share_link returns a guest share_url.',
      }, { comments: [] });
    }
  );

  // ─── create_review_album ─────────────────────────────────────
  server.tool(
    'create_review_album',
    "Share MANY files for review in one call: creates an album (a review collection with the Grade view on), adds every file as its own review asset, and optionally makes a guest share link. Use it proactively whenever you deliver a batch the user or their client should sort, pick or approve: generated images, video takes, thumbnails, ad variants, a client delivery. Each file gets Good/Bad, optional 1-5 stars, notes, pins and drawings, in the app and on the guest link. To group files (e.g. by character, location or round) give each item a `sub_album` name: the album opens on one card per sub-album, and one share link on the album shares them all. Read the verdicts back with get_review_grading. For ONE cut use create_review_asset instead. Pass `media_url` for media you already have a URL for (never re-upload); only a local file needs upload_media first (then `media_id`). Give the user album.open_url (owner Grade view) and, for clients, share_link.share_url.",
    {
      name: z.string().describe('Album name, e.g. "Hero shots - round 1".'),
      project_id: projectIdField,
      items: z.array(z.object({
        name: z.string().optional().describe('Display name; defaults to "File N".'),
        media_url: z.string().optional().describe('Public URL of media you already have (Kolbo output, list_media item or any public image/video/audio link). Preferred.'),
        media_id: z.string().optional().describe('MediaLibraryItem id from upload_media / list_media.'),
        sub_album: z.string().optional().describe('Sub-album name to group this file under (e.g. "Casting - Amalia"). Items with the same name share one sub-album; items without one sit in the album itself.'),
      })).min(1).max(200).describe('Files in display order. Each needs media_url or media_id.'),
      stars: z.boolean().optional().describe('Offer optional 1-5 stars next to Good/Bad (default true).'),
      share: z.boolean().optional().describe('Also create a guest share link for clients without a Kolbo account (default false).'),
      share_permissions: z.object({
        canComment: z.boolean().optional(),
        canDownload: z.boolean().optional(),
        canViewOtherComments: z.boolean().optional(),
      }).optional().describe('Guest link permissions when share is true. Commenting is also what lets a guest grade.'),
      role_label: z.string().optional().describe('Guest role label on the share link (e.g. Client).'),
    },
    async ({ name, project_id, items, stars, share, share_permissions, role_label }) => {
      const subNames = [...new Set(items.map((it) => (it.sub_album || '').trim()).filter(Boolean))];
      const created = await client.post('/v1/review/collections', {
        name,
        project_id,
        grading: { enabled: true, ...(stars !== undefined ? { stars } : {}) },
        ...(subNames.length ? { sections: subNames.map((n) => ({ name: n })) } : {}),
      });
      const collection = created && created.collection;
      if (!collection || !collection.id) throw new Error('The album could not be created.');
      const subAlbums = (created.sub_albums || []);
      const subIdByName = new Map(subAlbums.map((c) => [c.name, c.id]));
      // In order, so the Grade view (upload order) matches `items`.
      const assets = [];
      const failed = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        try {
          const r = await client.post('/v1/review/assets', {
            name: it.name || `File ${i + 1}`,
            media_url: it.media_url,
            media_id: it.media_id,
            project_id: project_id || collection.project_id,
            collection_id: subIdByName.get((it.sub_album || '').trim()) || collection.id,
          });
          if (r && r.asset) assets.push(assetUrl(r.asset));
        } catch (err) {
          failed.push({ index: i, name: it.name || `File ${i + 1}`, error: err.message });
        }
      }
      let share_link;
      if (share) {
        const r = await client.post(`/v1/review/collections/${encodeURIComponent(collection.id)}/share-links`, {
          ...(role_label ? { role_label } : {}),
          ...(share_permissions ? { permissions: share_permissions } : {}),
        });
        share_link = r && r.share_link;
      }
      const album = { ...collection, open_url: `${APP}/review/grade/${collection.id}` };
      const out = { success: failed.length === 0, album, ...(subAlbums.length ? { sub_albums: subAlbums } : {}), assets, ...(failed.length ? { failed } : {}), ...(share_link ? { share_link } : {}) };
      out._hint = 'Give the user album.open_url (their Grade view)' + (share_link ? ' and share_link.share_url for the client' : '') + '. Later, read the Good/Bad + stars and notes with get_review_grading({ collection_id: album.id }).';
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    }
  );

  // ─── update_review_asset ─────────────────────────────────────
  server.tool(
    'update_review_asset',
    'Rename a review asset, move it to a collection, or switch the active version index.',
    {
      asset_id: z.string(),
      name: z.string().optional(),
      collection_id: z.string().nullable().optional().describe('Collection id, or null to uncollected.'),
      current_version_index: z.number().optional(),
    },
    async ({ asset_id, ...body }) => {
      const result = await client.patch(`/v1/review/assets/${encodeURIComponent(asset_id)}`, body);
      return linked(result);
    }
  );

  // ─── add_review_version ──────────────────────────────────────
  server.tool(
    'add_review_version',
    'Append a new version to an existing review asset. Pass `media_url` for media you already have a URL for (no re-upload), or `media_id` for an uploaded file.',
    {
      asset_id: z.string(),
      media_id: z.string().optional(),
      media_url: z.string().optional().describe("Public URL of media you already have: any Kolbo media URL (a generation output, list_media item) or another public image/video/audio link. ALWAYS prefer this over re-uploading: your own Kolbo media is reused, any other public link is attached in place with no copy. Pass media_id OR media_url."),
      version_note: z.string().optional(),
    },
    async ({ asset_id, media_id, media_url, version_note }) => {
      const result = await client.post(`/v1/review/assets/${encodeURIComponent(asset_id)}/versions`, {
        media_id,
        media_url,
        version_note,
      });
      return card('add_review_version', withLinks(result), { comments: [] });
    }
  );

  // ─── set_review_status ───────────────────────────────────────
  server.tool(
    'set_review_status',
    'Update review workflow status on an asset (in_progress, needs_review, approved, changes_requested).',
    {
      asset_id: z.string(),
      review_status: REVIEW_STATUS,
    },
    async ({ asset_id, review_status }) => {
      const result = await client.post(`/v1/review/assets/${encodeURIComponent(asset_id)}/status`, {
        review_status,
      });
      return linked(result);
    }
  );

  // ─── delete_review_asset ─────────────────────────────────────
  server.tool(
    'delete_review_asset',
    'Soft-delete a review asset and its underlying review media.',
    { asset_id: z.string() },
    async ({ asset_id }) => {
      const result = await client.delete(`/v1/review/assets/${encodeURIComponent(asset_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Collections ─────────────────────────────────────────────
  server.tool(
    'list_review_collections',
    'List review collection folders in a project.',
    { project_id: projectIdField },
    async ({ project_id }) => {
      const qs = project_id ? `project_id=${encodeURIComponent(project_id)}` : '';
      const result = await client.get(`/v1/review/collections${qs ? '?' + qs : ''}`);
      return linked(result);
    }
  );

  server.tool(
    'create_review_collection',
    'Create a review collection folder inside a project. With grading_enabled it is an album: the user grades each file Good/Bad (plus optional 1-5 stars) and draws or pins notes; read the result with get_review_grading.',
    {
      name: z.string(),
      project_id: projectIdField,
      grading_enabled: z.boolean().optional().describe('Open this collection in the Grade view (an album).'),
      grading_stars: z.boolean().optional().describe('Offer optional 1-5 stars in the Grade view (default true).'),
      parent_id: z.string().optional().describe('Album id to create this inside as a sub-album (one level only; it inherits the album\'s grading and is shared with the album link).'),
    },
    async ({ grading_enabled, grading_stars, ...args }) => {
      if (grading_enabled !== undefined || grading_stars !== undefined) {
        args.grading = {};
        if (grading_enabled !== undefined) args.grading.enabled = grading_enabled;
        if (grading_stars !== undefined) args.grading.stars = grading_stars;
      }
      const result = await client.post('/v1/review/collections', args);
      return linked(result);
    }
  );

  server.tool(
    'update_review_collection',
    'Rename a review collection, turn its Grade view on/off (grading_enabled) and its optional 1-5 stars (grading_stars), or move it into an album as a sub-album (parent_id; null moves it back to the top level). Send at least one of name / grading_enabled / grading_stars / parent_id.',
    {
      collection_id: z.string(),
      name: z.string().optional(),
      grading_enabled: z.boolean().optional().describe('Show the Grade view (Good/Bad, stars, notes per image) for this collection. Turn on after uploading an image batch for the user to grade.'),
      grading_stars: z.boolean().optional().describe('Offer optional 1-5 stars in the Grade view (default true).'),
      parent_id: z.string().nullable().optional().describe('Album id to move this collection into as a sub-album, or null to move it back to the top level.'),
    },
    async ({ collection_id, name, grading_enabled, grading_stars, parent_id }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (parent_id !== undefined) body.parent_id = parent_id;
      if (grading_enabled !== undefined || grading_stars !== undefined) {
        body.grading = {};
        if (grading_enabled !== undefined) body.grading.enabled = grading_enabled;
        if (grading_stars !== undefined) body.grading.stars = grading_stars;
      }
      const result = await client.patch(`/v1/review/collections/${encodeURIComponent(collection_id)}`, body);
      return linked(result);
    }
  );

  // ─── Grading (Good/Bad, stars, notes with drawings, per image) ─
  server.tool(
    'get_review_grading',
    "Read how the user graded an image batch in a review collection: every image in upload order with its file name, the reader's own Good/Bad + 1-5 stars (my_mark), every reviewer's marks, and the notes with drawings (each drawing has a bbox in 0..1 and a mask_url; fetch the exact mask with get_review_comment_mask). An album with sub-albums covers all of them: sub_albums lists each with its counts and every image carries sub_album_id. After reading, propose fixes per image (what to change, which tool/model, credit cost) and WAIT for the user's yes before generating anything. Never regenerate automatically.",
    { collection_id: z.string() },
    async ({ collection_id }) => {
      const result = await client.get(`/v1/review/collections/${encodeURIComponent(collection_id)}/grading`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_review_comment_mask',
    "Get the drawing on a review comment as a mask PNG at the image's own size (white = painted area, black = rest) plus its pixel and 0..1 bounding box. Use it as an inpaint/edit mask or to crop the problem area. Image comments only.",
    { comment_id: z.string().describe('Comment id from get_review_grading notes[].id or list_review_comments.') },
    async ({ comment_id }) => {
      const result = await client.get(`/v1/review/comments/${encodeURIComponent(comment_id)}/mask`);
      const { mask_png_base64: png, ...meta } = result || {};
      const content = [{ type: 'text', text: JSON.stringify(meta, null, 2) }];
      if (png) content.push({ type: 'image', data: png, mimeType: 'image/png' });
      return { content };
    }
  );

  server.tool(
    'set_review_mark',
    "Grade one review asset for the reader: Good or Bad (verdict) and/or 1-5 stars. Pass null to clear. Only when the user asks you to grade for them.",
    {
      asset_id: z.string(),
      verdict: z.enum(['good', 'bad']).nullable().optional(),
      stars: z.number().int().min(1).max(5).nullable().optional(),
    },
    async ({ asset_id, ...body }) => {
      const result = await client.put(`/v1/review/assets/${encodeURIComponent(asset_id)}/mark`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_review_shot_votes',
    'Read likes / dislikes per shot of a review video (current version, or version_media_id): each shot by its start second with up, down and the reader\'s own vote.',
    { asset_id: z.string(), version_media_id: z.string().optional() },
    async ({ asset_id, version_media_id }) => {
      const qs = version_media_id ? `?version_media_id=${encodeURIComponent(version_media_id)}` : '';
      const result = await client.get(`/v1/review/assets/${encodeURIComponent(asset_id)}/shot-votes${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'set_review_shot_vote',
    "Like or dislike one shot of a review video for the reader (shot = its start second from get_review_asset versions[].shots). vote null clears it. Only when the user asks.",
    {
      asset_id: z.string(),
      start: z.number().describe('Shot start in seconds.'),
      vote: z.enum(['up', 'down']).nullable(),
      version_media_id: z.string().optional(),
    },
    async ({ asset_id, ...body }) => {
      const result = await client.put(`/v1/review/assets/${encodeURIComponent(asset_id)}/shot-votes`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'delete_review_collection',
    'Soft-delete a review collection (assets become uncollected).',
    { collection_id: z.string() },
    async ({ collection_id }) => {
      const result = await client.delete(`/v1/review/collections/${encodeURIComponent(collection_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Comments ────────────────────────────────────────────────
  server.tool(
    'list_review_comments',
    'List text comments on a review asset (default: current version media). Optional `version_media_id` for a specific version.',
    {
      asset_id: z.string(),
      version_media_id: z.string().optional(),
    },
    async ({ asset_id, version_media_id }) => {
      const qs = version_media_id ? `version_media_id=${encodeURIComponent(version_media_id)}` : '';
      const result = await client.get(`/v1/review/assets/${encodeURIComponent(asset_id)}/comments${qs ? '?' + qs : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'create_review_comment',
    'Add a comment on a review asset. Optional video timecodes: time_start / time_end (seconds). Optional `pin` puts the comment on a spot of the image or video frame; optional `annotations` adds pins or drawn strokes. Coordinates are 0..1 over the media (x from the left, y from the top).',
    {
      asset_id: z.string(),
      body: z.string(),
      time_start: z.number().optional(),
      time_end: z.number().optional(),
      version_media_id: z.string().optional(),
      pin: z.object({ x: z.number(), y: z.number() }).optional().describe('Pin this comment to one spot, 0..1 over the media.'),
      annotations: z.array(z.object({
        type: z.enum(['pin', 'stroke']),
        points: z.array(z.object({ x: z.number(), y: z.number() })).describe('0..1 over the media. A pin uses one point; a stroke is a freehand line through its points.'),
        color: z.string().optional().describe('Hex colour, e.g. #ef4444.'),
        width: z.number().optional().describe('Line width in 1/1000 of the frame (default 3).'),
      })).optional().describe('Pins and drawn strokes (max 50, 500 points each).'),
    },
    async ({ asset_id, ...body }) => {
      const result = await client.post(`/v1/review/assets/${encodeURIComponent(asset_id)}/comments`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'reply_review_comment',
    'Reply to an existing review comment (one level of threading).',
    {
      note_id: z.string().describe('Comment id from list_review_comments.'),
      body: z.string(),
    },
    async ({ note_id, body }) => {
      const result = await client.post(`/v1/review/comments/${encodeURIComponent(note_id)}/reply`, { body });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'edit_review_comment',
    'Edit your own review comment text and/or timecodes.',
    {
      note_id: z.string(),
      body: z.string().optional(),
      time_start: z.number().optional(),
      time_end: z.number().optional(),
    },
    async ({ note_id, ...body }) => {
      const result = await client.patch(`/v1/review/comments/${encodeURIComponent(note_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'delete_review_comment',
    'Delete a review comment (own comment, or any comment if you have full project access).',
    { note_id: z.string() },
    async ({ note_id }) => {
      const result = await client.delete(`/v1/review/comments/${encodeURIComponent(note_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'resolve_review_comment',
    'Mark a review comment thread as resolved.',
    { note_id: z.string() },
    async ({ note_id }) => {
      const result = await client.post(`/v1/review/comments/${encodeURIComponent(note_id)}/resolve`, {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'unresolve_review_comment',
    'Re-open a resolved review comment thread.',
    { note_id: z.string() },
    async ({ note_id }) => {
      const result = await client.post(`/v1/review/comments/${encodeURIComponent(note_id)}/unresolve`, {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Share links ─────────────────────────────────────────────
  server.tool(
    'create_review_share_link',
    'Create a guest review link for an asset or collection. Returns share_url for clients (no Kolbo account needed). On an album (a collection with grading on) the guest lands on the Grade view: Good/Bad, stars, notes, pins and drawings per file; read their marks with get_review_grading.',
    {
      target_type: z.enum(['asset', 'collection']),
      target_id: z.string(),
      role_label: z.string().optional().describe('Guest role label shown in the UI (e.g. Client).'),
      require_email: z.boolean().optional(),
      permissions: z.object({
        canComment: z.boolean().optional(),
        canDownload: z.boolean().optional(),
        canViewOtherComments: z.boolean().optional(),
        canResolveOwn: z.boolean().optional(),
        canSwitchVersions: z.boolean().optional(),
        canSetStatus: z.boolean().optional(),
      }).optional(),
      password: z.string().optional().describe('Optional NEW password to set on this guest review link. This is not the user\'s Kolbo password and must never contain an account credential.'),
      allowed_emails: z.array(z.string()).optional(),
      expires_at: z.string().optional().describe('ISO8601 expiry datetime.'),
    },
    async ({ target_type, target_id, ...body }) => {
      const path = target_type === 'collection'
        ? `/v1/review/collections/${encodeURIComponent(target_id)}/share-links`
        : `/v1/review/assets/${encodeURIComponent(target_id)}/share-links`;
      const result = await client.post(path, body);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'list_review_share_links',
    'List active share links for a review asset or collection.',
    {
      target_type: z.enum(['asset', 'collection']),
      target_id: z.string(),
    },
    async ({ target_type, target_id }) => {
      const params = new URLSearchParams({ target_type, target_id });
      const result = await client.get(`/v1/review/share-links?${params}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'revoke_review_share_link',
    'Revoke a guest review share link by link id.',
    { link_id: z.string() },
    async ({ link_id }) => {
      const result = await client.post(`/v1/review/share-links/${encodeURIComponent(link_id)}/revoke`, {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerReviewTools };
