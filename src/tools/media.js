/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { resolveToBuffer, DEFAULT_MAX_FILE_MB, compactList } = require('./_shared');
const { ownedUrl } = require('./owned-url');
const { UI, uiResult, listResult } = require('../apps');

// How many tiles the media grid renders. A rendering limit only — the text
// payload always carries the full page, and `total` reports the real library
// count, so a capped grid can never be mistaken for "that's everything".
const GRID_CAP = 24;

async function mintUploadTicket(client) {
  const ticket = await client.post('/v1/media/upload-ticket', {});
  if (!ticket || !ticket.token) throw new Error('Could not create an upload ticket — try again.');
  return ticket;
}

// Shape a /v1/media/upload-ticket response for a TEXT consumer (an agent that
// will POST the file itself). The widget path needs different keys (`expires_at`
// as an absolute ms timestamp for the countdown), so it builds its own payload.
//
// This carries the full recipe, not a pointer to it: both callers are agents
// holding a token they must use immediately, and telling one of them to go call
// another tool to learn the POST shape would spend the round trip this whole
// path exists to remove.
// The ticket is reusable for a whole batch, but the endpoint is rate limited —
// and a batch uploader that only learns that from the 41st POST has already
// stalled halfway through. kolbo-api sends the real numbers in `rate_limit`;
// this fallback covers an older deployment that predates that field.
const DEFAULT_UPLOAD_RATE = { max_uploads: 40, per_seconds: 60 };

function uploadTicketPayload(ticket) {
  const rate = ticket.rate_limit || DEFAULT_UPLOAD_RATE;
  return {
    upload_url: ticket.upload_url,
    token: ticket.token,
    expires_in_seconds: ticket.expires_in,
    max_file_mb: ticket.max_file_mb || DEFAULT_MAX_FILE_MB,
    accepted: ticket.accepted,
    rate_limit: rate,
    how_to_upload: {
      example: 'curl -X POST "<upload_url>" -H "Authorization: Bearer <token>" -F "file=@/absolute/path/to/file.mp3;type=audio/mpeg"',
      // curl types the part from ITS mime table and falls back to
      // application/octet-stream for anything missing from it (.mp3 included).
      // Newer servers resolve that from the extension, older ones answer
      // "File type not supported: application/octet-stream" — so the example
      // above declares the type and this says why, rather than leaving the
      // caller to rediscover it from a 415.
      mime_note: 'Append `;type=<mime>` to the file part (audio/mpeg, audio/wav, video/mp4, image/png, application/pdf …). Without it curl declares application/octet-stream and the upload can be rejected as an unsupported type.',
      optional_fields: ['project_id', 'description'],
      response: 'JSON — the stable CDN URL is at media.url. One POST per file; reuse the ticket for a batch.',
      pacing: `RATE LIMIT: ${rate.max_uploads} uploads per ${rate.per_seconds}s. For a batch larger than that, pace it (e.g. sleep ${Math.max(1, Math.ceil(rate.per_seconds / rate.max_uploads))}s between files) instead of firing them back to back. Over the limit you get HTTP 429 with a Retry-After header and retry_after_seconds in the body — wait that long, then continue; do not guess a backoff and do not treat it as a failed upload.`,
      // Git Bash hands curl a POSIX-style /c/Users/... path that Windows curl
      // cannot open (exit 26). Real trap — it cost a round trip to find.
      windows_note: 'Give curl a native path (C:/Users/...) — a Git Bash /c/Users/... path fails to open.',
    },
    // The one thing the server cannot detect: a caller with no shell that got
    // here anyway. Without this it is left holding a token it can never use.
    if_you_cannot_run_shell_or_http: 'Discard this ticket and call `media_upload_widget` instead so the user can pick the file.',
  };
}

function registerMediaTools(server, client, options = {}) {
  // `opts.apps` is set only by kolbo-api's per-request server (see createServer
  // in ../index.js), which makes it a TRANSPORT signal — deliberately not
  // `appsEnabled()`, which also returns true for stdio hosts that advertise UI.
  // Transport is what decides whether a local path can resolve at all, so state
  // it in the descriptions rather than making the model infer it. What the
  // server still cannot know is whether the CALLER has a shell (one connector
  // serves both claude.ai and Claude Code), hence the fallback hint in the
  // ticket payload.
  const isRemoteConnector = options.apps === true;

  const ticketRouting = isRemoteConnector
    ? 'You are reached over a REMOTE connector: this server cannot read the caller\'s disk, so `upload_media` with a local path will always fail here — do not try it. If you can run shell commands or issue HTTP requests yourself, this tool is the right path. If you cannot (claude.ai web/mobile), ignore this tool and call `media_upload_widget` so the user picks the file.'
    : 'You are a LOCAL (stdio) install: server and client share a filesystem, so for an ordinary local file prefer `upload_media` with the absolute path — one call, no ticket needed. Use this tool only when you specifically want to stream files up yourself (large batches, CI, an external uploader).';

  // ─── media_upload_widget ───────────────────────────────────
  server.tool(
    'media_upload_widget',
    'Open an interactive file-upload card in the chat so the user can upload LOCAL files (images, videos, audio, documents) into their Kolbo media library. USE THIS IMMEDIATELY whenever a claude.ai (browser/mobile) user wants to use a local file, or references a file they attached to the chat — remote MCP tools CANNOT read chat attachments, so the user must re-upload through this widget; do not ask them to re-attach the file in chat. Each uploaded file gets a stable Kolbo CDN URL that arrives in a follow-up user message — then pass those URLs to generation tools (generate_image_edit, generate_video_from_image, generate_lipsync, transcribe_audio, visual DNA, etc.). ROUTING depends on where the SERVER runs, not on which client you are: `upload_media` with a local path only works on a LOCAL (stdio) install, where server and client share a filesystem. Over a remote connector a local path is unreachable however capable the client is — there, if you can run shell commands, call `create_upload_ticket` and POST the file yourself (no user interaction needed); use this widget when you cannot reach the filesystem (claude.ai web/mobile) or when the user should choose the file.',
    {
      purpose: z.string().optional().describe('Short title shown on the card, e.g. "Upload the photo to animate". Helps the user know what to drop.'),
      media_types: z.array(z.enum(['image', 'video', 'audio', 'document'])).optional().describe('Restrict which file kinds the widget accepts. Omit to accept all types.'),
      max_files: z.number().optional().describe('Maximum number of files the user may upload (default 10, max 20). LEAVE UNSET in almost all cases so the user can drop multiple files — only set this (e.g. to 1) if the task genuinely requires exactly one file. Do not restrict to 1 just because the current step uses one image; the user may want to upload several.'),
      project_id: z.string().optional().describe('Project ObjectId to file the uploads into (resolve names via `list_projects`).')
    },
    async ({ purpose, media_types, max_files, project_id }) => {
      const ticket = await mintUploadTicket(client);

      const info = {
        status: 'upload_widget_opened',
        instructions: 'An upload card is now shown to the user. WAIT for them to upload — the uploaded file URLs will arrive in a follow-up message (or in the model context). Do not guess URLs.',
        accepted: ticket.accepted,
        expires_in_seconds: ticket.expires_in,
      };

      // Always ship structuredContent. Kolbo Code does NOT advertise MCP Apps, so
      // gating the grid payload on appsEnabled() sent it text only; the host then
      // rebuilt items from the compactList text, whose field names are
      // `filename`/`url` — not the `title`/`thumbnail` the grid renders — so every
      // tile came out black and unlabelled. Same reasoning as listResult().
      // upload_ui_url: top-level page for Claude iOS/Android — in-iframe
      // <input type=file> selections are dropped by WebKit (see upload widget).
      const uploadUiUrl = ticket.upload_ui_url
        || String(ticket.upload_url || '').replace(/\/upload\/?$/, '/upload-ui');
      return uiResult(UI.upload, JSON.stringify(info, null, 2), {
        widget: 'upload',
        title: purpose || 'Upload media',
        upload_url: ticket.upload_url,
        upload_ui_url: uploadUiUrl,
        token: ticket.token,
        expires_at: Date.now() + (ticket.expires_in || 900) * 1000,
        kinds: media_types && media_types.length ? media_types : undefined,
        max_files: Math.min(Math.max(Number(max_files) || 10, 1), 20),
        max_mb: ticket.max_file_mb || DEFAULT_MAX_FILE_MB,
        ...(project_id ? { project_id } : {}),
      });

      // Text-only host (Claude Code, Codex CLI, Cursor): no iframe to render —
      // but these are exactly the hosts that CAN reach a filesystem, so hand
      // back the ticket already minted instead of dead-ending. Additive fields
      // only; `status` is unchanged for any existing consumer.
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'widget_unavailable',
            hint: 'This host cannot render the upload card, but it can usually reach the filesystem. Upload the file yourself by POSTing it to upload_url with this ticket — the recipe is below. On a LOCAL stdio install you can also just call upload_media with the absolute path.',
            ...uploadTicketPayload(ticket),
          }, null, 2)
        }]
      };
    }
  );

  // ─── create_upload_ticket ──────────────────────────────────
  server.tool(
    'create_upload_ticket',
    'Get a short-lived ticket for uploading LOCAL files straight into the user\'s Kolbo media library, with NO upload card and no user interaction. ' + ticketRouting + ' Why it exists: when the server cannot read the caller\'s disk, the only other ways in are making the user click an upload card (`media_upload_widget`) or inlining the file as base64 via `upload_media` — base64 is slow and burns context in proportion to file size, so do not use it for anything but a tiny file. Returns `upload_url` + `token`; POST each file as multipart field `file` with header `Authorization: Bearer <token>` and read the CDN URL from `media.url` in the response. One POST per file; the ticket is reusable until it expires. The endpoint is RATE LIMITED (the exact cap and window come back in the ticket\'s `rate_limit` field — currently 40 uploads/minute): pace a batch bigger than that rather than firing every file at once, and on HTTP 429 honour the `Retry-After` header / `retry_after_seconds` body field instead of guessing a backoff. Then pass those URLs to any generation tool (transcribe_audio, generate_image_edit, generate_video_from_image, generate_lipsync, visual DNA, …).',
    {},
    async () => {
      const ticket = await mintUploadTicket(client);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'upload_ticket_created',
            ...uploadTicketPayload(ticket),
          }, null, 2)
        }]
      };
    }
  );

  // ─── upload_media ──────────────────────────────────────────
  server.tool(
    'upload_media',
    'Upload a LOCAL file (or a NON-Kolbo remote URL) to the user\'s Kolbo media library and get back a stable Kolbo CDN URL. NEVER call this on a URL that is already Kolbo-hosted: generate_* / list_media / prior upload_media results, media.kolbo.ai, *.kolbo.ai, or DigitalOcean Spaces. Those URLs are already usable — pass them as-is to generate_* as reference_images / source_images / image_url. Use this only for a path on disk or an external (non-Kolbo) URL that needs re-hosting. Auto-detects media type from the file extension.',
    {
      source: z.string().optional().describe('Absolute local path, or a NON-Kolbo URL to re-host. Do not pass a media.kolbo.ai / generate_* / list_media URL — those are already hosted and this tool will refuse to duplicate them. Provide this OR source_base64.'),
      source_base64: z.string().optional().describe('Raw file content as base64 (no data: prefix) — fallback for hosts with no filesystem or public URL (e.g. small images on claude.ai when the upload widget is unavailable). Requires `filename`. Keep under ~10MB; for larger files use media_upload_widget.'),
      filename: z.string().optional().describe('Original filename WITH extension (e.g. photo.png) — required with source_base64; the extension determines the media type.'),
      description: z.string().optional().describe('Optional description / caption for the uploaded media'),
      project_id: z.string().optional().describe('Project ObjectId to file the upload into. Call `list_projects` to resolve a name → id. When the user is working in a named project, pass it here too — omitting it files the upload outside that project.')
    },
    async ({ source, source_base64, filename, description, project_id }) => {
      if (!source && !source_base64) throw new Error('Provide source (URL or absolute local path) OR source_base64 (+ filename)');

      if (source && ownedUrl(source)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              reused: true,
              url: source,
              hint: 'This URL is already on Kolbo CDN. Pass it as-is to generate_* (reference_images / source_images / image_url / files). Do not upload again.',
            }, null, 2),
          }],
        };
      }

      if (source_base64) {
        if (!filename || !/\.[a-z0-9]{2,5}$/i.test(filename)) {
          throw new Error('source_base64 requires a `filename` with an extension (e.g. photo.png)');
        }
        const buffer = Buffer.from(source_base64, 'base64');
        if (!buffer.length) throw new Error('source_base64 decoded to an empty file');
        // Backend routes by mimetype (video/audio must NOT hit the image
        // optimizer) — derive it from the extension, never octet-stream.
        const ext = filename.split('.').pop().toLowerCase();
        const MIME = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', avif: 'image/avif',
          mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v', mkv: 'video/x-matroska',
          mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac',
          pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        };
        const form = new FormData();
        form.append('file', buffer, { filename, contentType: MIME[ext] || 'application/octet-stream' });
        if (description) form.append('description', description);
        if (project_id) form.append('project_id', project_id);
        const result = await client.postMultipart('/v1/media/upload', form);
        return { content: [{ type: 'text', text: JSON.stringify(result.media || result, null, 2) }] };
      }

      // Even for URL input we download-and-reupload — that's the whole point
      // of upload_media (getting a stable Kolbo-owned URL). For ephemeral
      // pass-through, the generation tools accept URLs directly.
      const kind = /\.(mp4|mov|webm|mkv|avi|m4v)(\?|$)/i.test(source) ? 'video'
                 : /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(source) ? 'audio'
                 : 'image';
      const resolved = await resolveToBuffer(source, kind);

      const form = new FormData();
      form.append('file', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
      if (description) form.append('description', description);
      if (project_id) form.append('project_id', project_id);

      const result = await client.postMultipart('/v1/media/upload', form);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.media || result, null, 2)
        }]
      };
    }
  );

  // ─── list_media ────────────────────────────────────────────
  server.tool(
    'list_media',
    'Browse the user\'s Kolbo media library — both uploaded files AND AI-generated outputs they have saved. Powerful filtering: scope to a single project (`project_id`), a user folder (`folder_id`), a "section" / category (`category`: ai / uploaded / edited / favorites / training-lab), a media type (`type`: image / video / audio), or generation provenance (`source_type`). Combine filters freely. Use this to discover what the user already has before generating something new, to retrieve a specific past creation, or to list everything in a project for downstream batch work.',
    {
      project_id: z.string().optional().describe('Restrict to a single project (Mongo ObjectId). Use `list_projects` to discover IDs. Omit to list across all the user\'s media.'),
      folder_id: z.string().optional().describe('Restrict to a user folder (Mongo ObjectId). Discover folder IDs via `list_media_folders`. Takes precedence over project_id when both are set.'),
      type: z.enum(['image', 'video', 'audio', 'all']).optional().describe('Filter by media type. Default: all types.'),
      category: z.enum(['ai', 'uploaded', 'edited', 'favorites', 'training-lab', 'all']).optional().describe('Filter by "section" (matches the Kolbo desktop app sidebar): `ai` = AI-generated, `uploaded` = files the user uploaded, `edited` = AI-edited variants, `favorites` = items the user starred, `training-lab` = training-lab assets. Default: all sections.'),
      source_type: z.enum(['uploaded', 'generated', 'chat-generated']).optional().describe('Lower-level provenance filter. Use `category` for the common case; use `source_type` for fine-grained distinction (e.g. only chat-generated images).'),
      sort: z.enum(['created_desc', 'created_asc', 'name_asc', 'name_desc']).optional().describe('Sort order. Default: created_desc (newest first).'),
      page: z.number().optional().describe('1-indexed page number. Default: 1'),
      page_size: z.number().optional().describe('Items per page. Default: 50, max 200.'),
      search: z.string().optional().describe('Free-text match against filename + original prompt.')
    },
    async ({ project_id, folder_id, type, category, source_type, sort, page, page_size, search }) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      if (folder_id)  params.set('folder_id', folder_id);
      if (type)       params.set('type', type);
      if (category)   params.set('category', category);
      if (source_type) params.set('source_type', source_type);
      if (sort)       params.set('sort', sort);
      if (page)       params.set('page', String(page));
      if (page_size)  params.set('page_size', String(page_size));
      if (search)     params.set('search', search);

      const qs = params.toString();
      const result = await client.get(`/v1/media${qs ? '?' + qs : ''}`);

      const media = result.media || [];
      const pagination = result.pagination || null;
      // A default page of 50 items measured 119,847 chars — every row carries a
      // full metadata object and the original prompt. Keep what identifies and
      // locates an item; get_media returns one in full.
      const text = compactList(media, {
        fields: ['id', 'filename', 'media_type', 'url', 'thumbnail_url', 'size', 'project_id', 'created_at'],
        cap: 50,
        total: pagination ? (pagination.total_items != null ? pagination.total_items : pagination.total) : media.length,
        extra: pagination ? { pagination } : undefined,
        note: 'Narrow with `type`, `category`, `project_id`, `folder_id`, or `search`; get_media returns one item in full.',
      });

      // Always ship structuredContent. Kolbo Code does NOT advertise MCP Apps, so
      // gating the grid payload on appsEnabled() sent it text only; the host then
      // rebuilt items from the compactList text, whose field names are
      // `filename`/`url` — not the `title`/`thumbnail` the grid renders — so every
      // tile came out black and unlabelled. Same reasoning as listResult().
      // The SDK envelope reports `total_items` (see sdk/controller.js listMedia);
      // reading `total` always came back undefined, so the grid claimed the page
      // size was the whole library. Accept either, then fall back.
      const totalItems = pagination
        ? (pagination.total_items != null ? pagination.total_items : pagination.total)
        : null;
      const items = media.slice(0, GRID_CAP).map((m) => ({
        id: m.id,
        title: m.filename,
        subtitle: m.media_type + (m.size ? ' · ' + Math.round(m.size / 1024) + 'KB' : ''),
        thumbnail: m.media_type === 'image' ? m.url : (m.thumbnail_url || null),
        media_type: m.media_type,
        url: m.url,
        use_hint: 'Use this media library asset in my next step:\nURL: {URL}\n(id: {ID})'
      }));
      return uiResult(UI.mediaGrid, text, {
        widget: 'media-grid',
        title: 'Media Library',
        items,
        total: totalItems != null ? totalItems : media.length,
        shown: Math.min(media.length, GRID_CAP),
        // Everything "Load more" needs to fetch page N+1 ITSELF. The button used
        // to send a chat message asking the model to run the next page, on the
        // belief that a widget cannot invoke a tool — it can
        // (window.kolbo.callTool, the same call every generation card polls
        // with). Worse, the payload carried no page and no filters, so the model
        // could not reconstruct the query either and typically re-ran page 1.
        page_tool: 'list_media',
        page: page || 1,
        page_size: page_size || 50,
        query: { project_id, folder_id, type, category, source_type, sort, search }
      });
    }
  );

  // ─── favorite_media ────────────────────────────────────────
  server.tool(
    'favorite_media',
    'Mark a media item as a favorite for the user. Idempotent — calling on an already-favorited item is a no-op. Requires the media `id` from `list_media`. After favoriting, the item shows up in `list_media` with `category=favorites` and in the desktop app sidebar\'s Favorites section. Use this when the user explicitly says "favorite this", "save this to favorites", "star this", or similar.',
    {
      media_id: z.string().describe('The MediaLibraryItem id (returned as `id` from `list_media`).')
    },
    async ({ media_id }) => {
      const result = await client.post(`/v1/media/${encodeURIComponent(media_id)}/favorite`, {});
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  // ─── unfavorite_media ──────────────────────────────────────
  server.tool(
    'unfavorite_media',
    'Remove a media item from the user\'s favorites. Idempotent — calling on an item that isn\'t favorited is a no-op. Requires the media `id` from `list_media`. Use this when the user says "unfavorite", "remove from favorites", "unstar", or similar.',
    {
      media_id: z.string().describe('The MediaLibraryItem id (returned as `id` from `list_media`).')
    },
    async ({ media_id }) => {
      const result = await client.delete(`/v1/media/${encodeURIComponent(media_id)}/favorite`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  // ─── list_media_folders ────────────────────────────────────
  server.tool(
    'list_media_folders',
    'List the user\'s media folders (their own + folders shared with them). Folders are user-scoped and can span multiple projects — they\'re a way for the user to group media across the library independent of project structure. Use this to discover folder IDs to pass into `list_media` via `folder_id`, or to show the user what folders exist before suggesting where to look.',
    {},
    async () => {
      const result = await client.get('/v1/media/folders');
      const folders = result.folders || [];
      const text = JSON.stringify({ folders, count: result.count || 0 }, null, 2);

      return listResult(text, {
        widget: 'list',
        title: 'Media Folders',
        items: folders.map(f => ({
          id: f.id,
          title: f.name,
          subtitle: f.description,
          meta: (f.item_count || 0) + (f.item_count === 1 ? ' item' : ' items'),
          use_hint: 'List media in my "{TITLE}" folder (folder_id: {ID}).'
        })),
        total: folders.length
      });
    }
  );

  // ─── create_media_folder ───────────────────────────────────
  server.tool(
    'create_media_folder',
    'Create a new media folder for the user. Folders are user-scoped (span all projects) and useful for grouping related assets. Returns the new folder id — pass it as `folder_id` to `list_media`, `add_media_to_folder`, etc.',
    {
      name: z.string().describe('Folder name (1–100 characters).'),
      description: z.string().optional().describe('Optional description (up to 500 characters).'),
      color: z.string().optional().describe('Optional hex color like "#3B82F6" for UI tinting. Default: Kolbo blue.'),
      icon: z.string().optional().describe('Optional Lucide icon name (e.g. "folder", "star", "image"). Default: "folder".')
    },
    async ({ name, description, color, icon }) => {
      const result = await client.post('/v1/media/folders', { name, description, color, icon });
      return { content: [{ type: 'text', text: JSON.stringify(result.folder || result, null, 2) }] };
    }
  );

  // ─── update_media_folder ───────────────────────────────────
  server.tool(
    'update_media_folder',
    'Rename a folder or update its color / icon / description. Owner only. Any subset of fields may be provided — fields omitted are left unchanged.',
    {
      folder_id: z.string().describe('Folder id from `list_media_folders` or `create_media_folder`.'),
      name: z.string().optional().describe('New folder name (1–100 characters).'),
      description: z.string().optional().describe('New description (up to 500 characters). Pass "" to clear.'),
      color: z.string().optional().describe('New hex color like "#3B82F6".'),
      icon: z.string().optional().describe('New Lucide icon name.')
    },
    async ({ folder_id, name, description, color, icon }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (color !== undefined) body.color = color;
      if (icon !== undefined) body.icon = icon;
      const result = await client.put(`/v1/media/folders/${encodeURIComponent(folder_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.folder || result, null, 2) }] };
    }
  );

  // ─── delete_media_folder ───────────────────────────────────
  server.tool(
    'delete_media_folder',
    'Delete a folder (soft delete — items inside are detached but NOT deleted from the user\'s media library). Owner only. ALWAYS ask the user to confirm before calling this — folder deletion is not surfaced in any "undo" flow.',
    {
      folder_id: z.string().describe('Folder id to delete.')
    },
    async ({ folder_id }) => {
      const result = await client.delete(`/v1/media/folders/${encodeURIComponent(folder_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── add_media_to_folder ───────────────────────────────────
  server.tool(
    'add_media_to_folder',
    'Add one or more media items to a folder. Caller must own the folder or be a shared member. Idempotent — items already in the folder are skipped silently. Up to 500 items per call.',
    {
      folder_id: z.string().describe('Target folder id.'),
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids (from `list_media`). Up to 500.')
    },
    async ({ folder_id, media_ids }) => {
      const result = await client.post(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/items`,
        { media_ids }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── remove_media_from_folder ──────────────────────────────
  server.tool(
    'remove_media_from_folder',
    'Remove one or more media items from a folder. Caller must own the folder or be a shared member. Items themselves remain in the library. Up to 500 items per call.',
    {
      folder_id: z.string().describe('Folder id.'),
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids to remove from the folder.')
    },
    async ({ folder_id, media_ids }) => {
      const result = await client.delete(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/items`,
        { media_ids }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── share_media_folder ────────────────────────────────────
  server.tool(
    'share_media_folder',
    'Share a folder with one or more users by email. Owner only. Users must already have a Kolbo account; emails not found are returned in `not_found`. Shared members can list folder contents, add and remove items, but cannot delete the folder or reshare it.',
    {
      folder_id: z.string().describe('Folder id to share.'),
      user_emails: z.array(z.string()).describe('Array of email addresses to grant access to. Up to 50 per call.')
    },
    async ({ folder_id, user_emails }) => {
      const result = await client.post(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/share`,
        { user_emails }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── get_media ─────────────────────────────────────────────
  server.tool(
    'get_media',
    'Fetch one media item\'s full details by id. Returns the same shape as items in `list_media` plus extra metadata. Use this when the user references a specific item ("tell me about this generation", "what prompt did I use for [item]").',
    {
      media_id: z.string().describe('MediaLibraryItem id (from `list_media`). Generation ids are also accepted as a fallback.')
    },
    async ({ media_id }) => {
      const result = await client.get(`/v1/media/${encodeURIComponent(media_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result.media || result, null, 2) }] };
    }
  );

  // ─── delete_media ──────────────────────────────────────────
  server.tool(
    'delete_media',
    'Soft-delete a media item — moves it to the user\'s trash where it can be restored for 30 days. Owner only. Idempotent. Use this for "delete this image / video / song" — NOT for `permanently_delete_media`, which is irreversible.',
    {
      media_id: z.string().describe('MediaLibraryItem id to soft-delete.')
    },
    async ({ media_id }) => {
      const result = await client.delete(`/v1/media/${encodeURIComponent(media_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── restore_media ─────────────────────────────────────────
  server.tool(
    'restore_media',
    'Restore a soft-deleted (trashed) media item back to the user\'s active library. Owner only. Use after `delete_media` if the user changes their mind, or when the user explicitly asks "restore [item] from trash".',
    {
      media_id: z.string().describe('MediaLibraryItem id to restore from trash.')
    },
    async ({ media_id }) => {
      const result = await client.post(`/v1/media/${encodeURIComponent(media_id)}/restore`, {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── permanently_delete_media ──────────────────────────────
  server.tool(
    'permanently_delete_media',
    'PERMANENTLY delete a media item — removes it from MongoDB, deletes the file from S3, removes from all folders, and deletes the source generation record. NOT REVERSIBLE — there is no recovery flow. Owner only. ALWAYS ask the user to explicitly confirm before calling this; use `delete_media` for normal "delete" intent.',
    {
      media_id: z.string().describe('MediaLibraryItem id to permanently delete. Cannot be undone.')
    },
    async ({ media_id }) => {
      const result = await client.delete(`/v1/media/${encodeURIComponent(media_id)}/permanent`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── move_media ────────────────────────────────────────────
  server.tool(
    'move_media',
    'Move a media item to a different project. Caller must own the item AND have access to the target project. Items in shared projects from other members cannot be moved by you. Use this when the user says "move this to project X" or wants to reorganize.',
    {
      media_id: z.string().describe('MediaLibraryItem id to move.'),
      project_id: z.string().describe('Target project id (use `list_projects` to discover ids).')
    },
    async ({ media_id, project_id }) => {
      const result = await client.patch(
        `/v1/media/${encodeURIComponent(media_id)}/project`,
        { project_id }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── bulk_delete_media ─────────────────────────────────────
  server.tool(
    'bulk_delete_media',
    'Soft-delete up to 1000 media items in one call. Items go to trash (30-day recovery). Owner only — items not owned by the user are silently skipped (count returned in response). Use this for "clean up all my old [type]" or "delete the failed generations from yesterday".',
    {
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids. Up to 1000 per call.')
    },
    async ({ media_ids }) => {
      const result = await client.post('/v1/media/bulk/delete', { media_ids });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── bulk_restore_media ────────────────────────────────────
  server.tool(
    'bulk_restore_media',
    'Restore up to 1000 trashed media items at once. Owner only. Returns the count restored and how many ids weren\'t in trash (already active or not owned).',
    {
      media_ids: z.array(z.string()).describe('Array of trashed MediaLibraryItem ids to restore. Up to 1000.')
    },
    async ({ media_ids }) => {
      const result = await client.post('/v1/media/bulk/restore', { media_ids });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── bulk_permanently_delete_media ─────────────────────────
  server.tool(
    'bulk_permanently_delete_media',
    'PERMANENTLY delete up to 1000 media items. NOT REVERSIBLE — removes from MongoDB, S3, folders, and source generation records. Owner only. ALWAYS confirm with the user before calling; this is the bulk equivalent of `permanently_delete_media`.',
    {
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids to permanently delete. Up to 1000. Cannot be undone.')
    },
    async ({ media_ids }) => {
      const result = await client.post('/v1/media/bulk/permanent', { media_ids });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── bulk_move_media ───────────────────────────────────────
  server.tool(
    'bulk_move_media',
    'Move up to 1000 media items to a different project in a single call. Caller must own ALL items AND have access to the target project — if any item isn\'t owned by the caller, the entire operation is rejected (atomic).',
    {
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids to move. Up to 1000.'),
      project_id: z.string().describe('Target project id.')
    },
    async ({ media_ids, project_id }) => {
      const result = await client.post('/v1/media/bulk/move', { media_ids, project_id });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── move_folder_contents ──────────────────────────────────
  server.tool(
    'move_folder_contents',
    'Move every media item inside a folder to a different project. Caller must own ALL items in the folder AND have access to the target project. Shared folder members cannot use this — only the item owner can move items between projects.',
    {
      folder_id: z.string().describe('Folder id whose contents will be moved.'),
      project_id: z.string().describe('Target project id.')
    },
    async ({ folder_id, project_id }) => {
      const result = await client.post(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/move-contents`,
        { project_id }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── get_media_stats ───────────────────────────────────────
  server.tool(
    'get_media_stats',
    'Get counts and total storage size of the user\'s media (or a specific project\'s media). Returns `{ total, images, videos, audio, total_size_bytes }`. Use this for "how many videos do I have", "what\'s my storage usage", or before bulk operations to estimate scope.',
    {
      project_id: z.string().optional().describe('Optional project id to scope stats to one project. Omit for the user\'s personal library across all projects.')
    },
    async ({ project_id }) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      const qs = params.toString();
      const result = await client.get(qs ? `/v1/media/stats?${qs}` : '/v1/media/stats');
      return { content: [{ type: 'text', text: JSON.stringify(result.stats || result, null, 2) }] };
    }
  );

  // ─── unshare_media_folder ──────────────────────────────────
  server.tool(
    'unshare_media_folder',
    'Revoke a single user\'s access to a folder. Owner only. The user keeps any media they uploaded — only the folder access is removed.',
    {
      folder_id: z.string().describe('Folder id.'),
      user_id: z.string().describe('User id to revoke (from the folder\'s `shared_with` array).')
    },
    async ({ folder_id, user_id }) => {
      const result = await client.delete(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/share/${encodeURIComponent(user_id)}`
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerMediaTools };
