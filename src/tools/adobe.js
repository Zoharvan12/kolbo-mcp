'use strict';

const { z } = require('zod');
const { isTrustedMediaUrl } = require('./blender');

// Adobe Premiere Pro / After Effects control through the Kolbo panel relay.
// Same relay contract as Blender (/v1/adobe mirrors /v1/blender): commands are
// queued on the server, delivered to the open Kolbo panel, approved there by the
// editor, and executed with the panel's fixed ExtendScript entry points. There
// is no raw ExtendScript tool by design.

const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

const noControls = (max) => z.string().min(1).max(max).refine(
  (value) => value.trim().length > 0 && !/[\x00-\x1f]/.test(value),
  `Must be non-empty and contain no control characters (max ${max}).`,
);
const sessionId = z.string().min(1).max(128).regex(SAFE_ID).optional().describe(
  'Target Adobe session id from adobe_list_sessions. Omit only when exactly one Premiere Pro or After Effects panel is connected.'
);
const idempotencyKey = z.string()
  .min(1)
  .max(128)
  .regex(SAFE_ID)
  .optional()
  .describe('Optional replay-safe key. Reuse it only when retrying the same command.');
const mediaId = z.string().min(1).max(128).regex(SAFE_ID).optional()
  .describe('Kolbo media library id (preferred). Provide exactly one of media_id or url.');
const mediaUrl = z.string().url().max(4096).optional()
  .describe('Kolbo-owned HTTPS media URL. Third-party hosts are rejected; import them into Kolbo first.');
const mediaKind = z.enum(['video', 'image', 'audio']).optional()
  .describe('Media kind. Inferred from the Kolbo record or file extension when omitted.');

function text(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function envelope(type, args, payload) {
  return {
    ...(args.session_id ? { session_id: args.session_id } : {}),
    command_type: type,
    payload,
    ...(args.idempotency_key ? { idempotency_key: args.idempotency_key } : {}),
  };
}

function command(client, type, args, payload) {
  return client.post('/v1/adobe/commands', envelope(type, args, payload)).then(text);
}

function mediaSource(args, toolName) {
  if (Boolean(args.media_id) === Boolean(args.url)) {
    throw new Error(`${toolName} requires exactly one of media_id or url.`);
  }
  if (args.url && !isTrustedMediaUrl(args.url)) {
    throw new Error(`${toolName} accepts only Kolbo-owned HTTPS media URLs. Import third-party files into Kolbo first.`);
  }
  return {
    ...(args.media_id ? { media_id: args.media_id } : { url: args.url }),
    ...(args.kind ? { kind: args.kind } : {}),
    ...(args.name ? { name: args.name } : {}),
  };
}

function registerAdobeTools(server, client) {
  server.tool(
    'adobe_list_sessions',
    'List the caller\'s Premiere Pro and After Effects windows that have the Kolbo panel connected to AI agents. Call this before the first Adobe command. If none are listed, ask the user to open the Kolbo panel and click the AI agents button in its header.',
    {
      page: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(100).default(25),
    },
    async ({ page, page_size }) => text(await client.get(`/v1/adobe/sessions?page=${page}&page_size=${page_size}`))
  );

  server.tool(
    'adobe_get_project',
    'Queue a read-only inspection of the open Premiere Pro or After Effects project. No approval is needed. Returns a command record; poll adobe_get_command_status for the result.',
    {
      session_id: sessionId,
      include_items: z.boolean().optional().describe('Include project items when the host reports them.'),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'project.get', args, {
      ...(args.include_items !== undefined ? { include_items: args.include_items } : {}),
    })
  );

  server.tool(
    'adobe_get_timeline',
    'Queue a read-only inspection of the active Premiere Pro sequence or After Effects composition. No approval is needed. Premiere returns size, duration, playhead_seconds, tracks and a clip list (track, name, start_seconds, end_seconds) sorted earliest first; After Effects returns the comp and its layers. The list is truncated to max_clips (default 200) with the full count in clips_total / layers_total.',
    {
      session_id: sessionId,
      max_clips: z.number().int().min(1).max(1000).optional(),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'timeline.get', args, {
      ...(args.max_clips ? { max_clips: args.max_clips } : {}),
    })
  );

  server.tool(
    'adobe_import_media',
    'Import one Kolbo media item into the open Premiere Pro or After Effects project. It lands in the Kolbo.AI / My Media bin for its type (Videos, Images, Audio). The editor must approve it in the Kolbo panel. Returns a command record; poll adobe_get_command_status.',
    {
      session_id: sessionId,
      media_id: mediaId,
      url: mediaUrl,
      kind: mediaKind,
      name: noControls(128).optional().describe('Display/file name. Sanitized by the panel.'),
      // Kept for backward compatibility with cached clients (never remove an arg).
      bin: noControls(128).optional().describe('Ignored. The panel always files imports under Kolbo.AI / My Media by media type.'),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'media.import', args, {
      ...mediaSource(args, 'adobe_import_media'),
    })
  );

  server.tool(
    'adobe_place_on_timeline',
    'Import one Kolbo media item and place it on the Premiere Pro work sequence (free track at the playhead) or the active After Effects composition. There is no time or track parameter. The editor must approve it in the Kolbo panel.',
    {
      session_id: sessionId,
      media_id: mediaId,
      url: mediaUrl,
      kind: mediaKind,
      name: noControls(128).optional(),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'timeline.place', args, mediaSource(args, 'adobe_place_on_timeline'))
  );

  server.tool(
    'adobe_create_sequence',
    'Create and open a new Premiere Pro sequence without any dialog. It copies the settings of the sequence open in the timeline (a 1080p 25 fps preset when none is open) and becomes the active sequence. Premiere Pro only; After Effects sessions fail with UNSUPPORTED_HOST. The editor must approve it in the Kolbo panel.',
    {
      session_id: sessionId,
      name: noControls(128),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'sequence.create', args, { name: args.name })
  );

  server.tool(
    'adobe_import_captions',
    'Import an SRT caption file hosted on Kolbo storage onto the active Premiere Pro sequence. Premiere Pro only. The editor must approve it in the Kolbo panel. Create the SRT with transcribe_audio first when needed.',
    {
      session_id: sessionId,
      url: z.string().url().max(4096).describe('Kolbo-owned HTTPS URL of the .srt file.'),
      name: noControls(128).optional(),
      idempotency_key: idempotencyKey,
    },
    async (args) => {
      if (!isTrustedMediaUrl(args.url)) {
        throw new Error('adobe_import_captions accepts only Kolbo-owned HTTPS caption URLs.');
      }
      return command(client, 'captions.import', args, {
        url: args.url,
        ...(args.name ? { name: args.name } : {}),
      });
    }
  );

  server.tool(
    'adobe_get_command_status',
    'Read the state, expires_at and bounded result/error of one Adobe command owned by the caller. awaiting_approval is not a polling state: stop and ask the user to approve or deny it in the Kolbo panel.',
    {
      command_id: z.string().min(1).max(128).regex(SAFE_ID),
    },
    async ({ command_id: id }) => text(await client.get(`/v1/adobe/commands/${encodeURIComponent(id)}`))
  );
}

module.exports = { registerAdobeTools };
