/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { projectIdField } = require('./_shared');

const REVIEW_STATUS = z.enum(['in_progress', 'needs_review', 'approved', 'changes_requested']);

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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── get_review_asset ────────────────────────────────────────
  server.tool(
    'get_review_asset',
    'Fetch one review asset with all versions, status, and media URLs.',
    {
      asset_id: z.string().describe('Review asset ObjectId from list_review_assets or create_review_asset.'),
    },
    async ({ asset_id }) => {
      const result = await client.get(`/v1/review/assets/${encodeURIComponent(asset_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── create_review_asset ─────────────────────────────────────
  server.tool(
    'create_review_asset',
    'Create a Kolbo Review asset with v1 media attached. Upload first via `upload_media`, `create_upload_ticket`, or `media_upload_widget`, then pass the returned `media_id`. Requires `project_id` when the user named a project.',
    {
      name: z.string().describe('Display name for the review asset.'),
      media_id: z.string().describe('MediaLibraryItem id from upload_media / list_media.'),
      project_id: projectIdField,
      collection_id: z.string().optional().describe('Optional review collection folder id.'),
      version_note: z.string().optional().describe('Optional note on the first version (max 1000 chars).'),
    },
    async (args) => {
      const result = await client.post('/v1/review/assets', args);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            _hint: 'Asset created. Share with clients via create_review_share_link, or add feedback with create_review_comment.',
          }, null, 2),
        }],
      };
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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── add_review_version ──────────────────────────────────────
  server.tool(
    'add_review_version',
    'Append a new version to an existing review asset from an uploaded `media_id`.',
    {
      asset_id: z.string(),
      media_id: z.string(),
      version_note: z.string().optional(),
    },
    async ({ asset_id, media_id, version_note }) => {
      const result = await client.post(`/v1/review/assets/${encodeURIComponent(asset_id)}/versions`, {
        media_id,
        version_note,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'create_review_collection',
    'Create a review collection folder inside a project.',
    {
      name: z.string(),
      project_id: projectIdField,
    },
    async (args) => {
      const result = await client.post('/v1/review/collections', args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'update_review_collection',
    'Rename a review collection.',
    {
      collection_id: z.string(),
      name: z.string(),
    },
    async ({ collection_id, name }) => {
      const result = await client.patch(`/v1/review/collections/${encodeURIComponent(collection_id)}`, { name });
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
    'Add a text comment on a review asset. Optional video timecodes: time_start / time_end (seconds).',
    {
      asset_id: z.string(),
      body: z.string(),
      time_start: z.number().optional(),
      time_end: z.number().optional(),
      version_media_id: z.string().optional(),
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
    'Create a guest review link for an asset or collection. Returns share_url for clients (no Kolbo account needed).',
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
      password: z.string().optional(),
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
