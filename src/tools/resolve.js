'use strict';

const { z } = require('zod');
const { isTrustedMediaUrl } = require('./blender');

// DaVinci Resolve control through the Kolbo Resolve plugin relay. Same relay
// contract as Blender and Adobe (/v1/resolve mirrors /v1/adobe): commands are
// queued on the server, delivered to the open Kolbo plugin in Resolve Studio,
// approved there by the editor, and executed with Resolve's scripting API.

const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

const noControls = (max) => z.string().min(1).max(max).refine(
  (value) => value.trim().length > 0 && !/[\x00-\x1f]/.test(value),
  `Must be non-empty and contain no control characters (max ${max}).`,
);
const sessionId = z.string().min(1).max(128).regex(SAFE_ID).optional().describe(
  'Target Resolve session id from resolve_list_sessions. Omit only when exactly one DaVinci Resolve plugin is connected.'
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

// ─── resolve_edit_timeline operation schema (mirrors kolbo-api resolve/schemas.js) ───
const seconds = (min = 0, max = 4 * 3600) => z.number().finite().min(min).max(max);
const track = () => z.number().int().min(1).max(50);
const clipRef = z.union([z.number().int().min(1).max(10000), noControls(128)])
  .describe('Clip position on the track (1 = leftmost) or exact clip name');
const TITLE_CONTROL = new RegExp('[\\x00-\\x09\\x0b\\x0c\\x0e-\\x1f]');
const titleText = z.string().min(1).max(500).refine(
  (value) => value.trim().length > 0 && !TITLE_CONTROL.test(value),
  'Text must be 1-500 characters; newlines allowed, no other control characters.',
);
const unit = () => z.number().finite().min(0).max(1);

const timelineOperation = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('timeline.create'),
    name: noControls(128).describe('New empty timeline at the project frame rate and resolution; it becomes the current timeline.'),
  }).strict(),
  z.object({
    op: z.literal('clip.append'),
    media_id: mediaId,
    url: mediaUrl,
    kind: mediaKind,
    name: noControls(128).optional(),
    track_index: track().optional().describe('Target track (video and/or audio). Missing tracks are added. Default 1.'),
    record_seconds: seconds().optional().describe('Timeline position in seconds from the timeline start. Default: end of the timeline.'),
    trim_start_seconds: seconds().optional().describe('Seconds skipped at the head of the source clip. Default 0.'),
    duration_seconds: seconds(0.04).optional().describe('Length on the timeline. Default: rest of the source (stills: 5 s).'),
    media_type: z.enum(['video', 'audio', 'both']).optional().describe('Which part of the clip to place. Default both (video files) or audio (audio files).'),
  }).strict(),
  z.object({
    op: z.literal('clip.transition'),
    track_index: track().describe('Video track'),
    clip: clipRef,
    position: z.enum(['start', 'end']).optional().describe('Default end'),
    duration_seconds: seconds(0.04, 30).optional().describe('Default 1'),
    transition: z.enum(['Cross Dissolve', 'Dip To Color Dissolve', 'Smooth Cut', 'Additive Dissolve', 'Blur Dissolve']).optional().describe('Default Cross Dissolve'),
  }).strict(),
  z.object({
    op: z.literal('clip.delete'),
    track_type: z.enum(['video', 'audio']),
    track_index: track(),
    clip: clipRef,
    ripple: z.boolean().optional().describe('Close the gap. Default false.'),
  }).strict(),
  z.object({
    op: z.literal('audio.fade'),
    track_index: track().describe('Audio track'),
    clip: clipRef,
    fade_in_seconds: seconds(0, 600).optional(),
    fade_out_seconds: seconds(0, 600).optional(),
  }).strict(),
  z.object({
    op: z.literal('title.add'),
    track_index: track().describe('Video track of the clip the title sits on'),
    clip: clipRef,
    text: titleText,
    font: noControls(128).optional().describe('Font family. Default "Arial".'),
    size: unit().optional().describe('Text size relative to frame height, 0.01-1. Default 0.08.'),
    color: z.array(unit()).length(3).optional().describe('[r, g, b], each 0-1. Default white.'),
    position: z.array(unit()).length(2).optional().describe('[x, y] centre, 0-1; [0.5, 0.5] is the frame centre, y grows upward. Default [0.5, 0.5].'),
    fade_seconds: seconds(0, 10).optional().describe('Fade in at the clip start and out at its end. Default 0.5.'),
  }).strict(),
  z.object({
    op: z.literal('marker.add'),
    time_seconds: seconds().describe('Seconds from the timeline start'),
    color: z.enum(['Blue', 'Cyan', 'Green', 'Yellow', 'Red', 'Pink', 'Purple', 'Fuchsia', 'Rose', 'Lavender', 'Sky', 'Mint', 'Lemon', 'Sand', 'Cocoa', 'Cream']).optional(),
    name: noControls(128).optional(),
    note: noControls(1000).optional(),
    duration_seconds: seconds(0.04).optional(),
  }).strict(),
]);
const timelineOperations = z.array(timelineOperation).min(1).max(100)
  .superRefine((ops, ctx) => {
    ops.forEach((operation, index) => {
      if (operation.op === 'audio.fade' && operation.fade_in_seconds === undefined && operation.fade_out_seconds === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: 'audio.fade needs fade_in_seconds or fade_out_seconds' });
      }
    });
  })
  .refine((ops) => Buffer.byteLength(JSON.stringify(ops), 'utf8') <= 256 * 1024, 'Operations must be at most 256 KiB as JSON.');

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
  return client.post('/v1/resolve/commands', envelope(type, args, payload)).then(text);
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

function registerResolveTools(server, client) {
  server.tool(
    'resolve_list_sessions',
    'List the caller\'s DaVinci Resolve Studio windows that have the Kolbo plugin connected to AI agents. Call this before the first Resolve command. If none are listed, ask the user to open Workspace → Workflow Integrations → Kolbo AI in Resolve Studio and sign in.',
    {
      page: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(100).default(25),
    },
    async ({ page, page_size }) => text(await client.get(`/v1/resolve/sessions?page=${page}&page_size=${page_size}`))
  );

  server.tool(
    'resolve_get_project',
    'Queue a read-only inspection of the open DaVinci Resolve project: name, timelines, current timeline, frame rate, resolution and playhead. No approval is needed. Returns a command record; poll resolve_get_command_status for the result.',
    {
      session_id: sessionId,
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'project.get', args, {})
  );

  server.tool(
    'resolve_get_timeline',
    'Queue a read-only inspection of the current DaVinci Resolve timeline: frame rate, duration, playhead, markers and every clip per video/audio track (track, position, name, start_seconds, end_seconds). No approval is needed. The clip list is truncated to max_clips (default 200).',
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
    'resolve_import_media',
    'Import one Kolbo media item into the Kolbo.AI bin of the open DaVinci Resolve project\'s Media Pool without touching the timeline. The editor must approve it in the Kolbo plugin. Returns a command record; poll resolve_get_command_status.',
    {
      session_id: sessionId,
      media_id: mediaId,
      url: mediaUrl,
      kind: mediaKind,
      name: noControls(128).optional().describe('File name. Sanitized by the plugin.'),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'media.import', args, mediaSource(args, 'resolve_import_media'))
  );

  server.tool(
    'resolve_edit_timeline',
    'DaVinci Resolve. Apply a batch of structured timeline edits: create a timeline, place Kolbo media at exact times on chosen tracks with trims, add transitions, fade audio, put animated titles over a clip (built in its Fusion comp), add markers, or delete clips. Times are seconds from the timeline start. Clips are addressed by track plus position (1 = leftmost) or exact name. Operations run in order and stop at the first failure (earlier ones stay applied). The editor approves the whole batch once in the Kolbo plugin. Read workflows/davinci-resolve.md first; verify with resolve_get_timeline and resolve_capture_frame.',
    {
      session_id: sessionId,
      operations: timelineOperations,
      idempotency_key: idempotencyKey,
    },
    async (args) => {
      for (const operation of args.operations) {
        if (operation.op === 'clip.append') mediaSource(operation, 'resolve_edit_timeline clip.append');
      }
      return command(client, 'timeline.edit', args, { operations: args.operations });
    }
  );

  server.tool(
    'resolve_run_script',
    'Run JavaScript against DaVinci Resolve\'s scripting API inside the Kolbo plugin, for anything resolve_edit_timeline does not cover (colour, Fusion, render jobs, project settings). `code` is an ASYNC FUNCTION BODY with `resolve`, `project`, `timeline` and `log(...)` in scope; every Resolve API call returns a promise, so `await` it, and `return` a JSON-serialisable result. The editor sees the exact code in the Kolbo plugin and must approve it. Scripts have full access to the project and the computer, so never read or write files or touch the network unless the user explicitly asked.',
    {
      session_id: sessionId,
      code: z.string().min(1).max(64 * 1024).refine(
        (value) => value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= 64 * 1024,
        'Script must be non-empty and at most 64 KiB as UTF-8.',
      ),
      purpose: noControls(500).describe('Plain-language reason shown to the editor next to the code.'),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'script.run', args, { code: args.code, purpose: args.purpose })
  );

  server.tool(
    'resolve_capture_frame',
    'Export one frame of the current DaVinci Resolve timeline and save it to the Kolbo media library. The result carries the image `url` - look at it to check the edit or title before telling the user it is done. Moves the playhead to time_seconds when given. The editor approves it in the Kolbo plugin.',
    {
      session_id: sessionId,
      time_seconds: z.number().finite().min(0).max(4 * 3600).optional().describe('Seconds from the timeline start. Default: current playhead.'),
      project_id: z.string().min(1).max(128).regex(SAFE_ID).optional().describe('Kolbo project to file the capture in.'),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'frame.capture', args, {
      ...(args.time_seconds !== undefined ? { time_seconds: args.time_seconds } : {}),
      ...(args.project_id ? { project_id: args.project_id } : {}),
    })
  );

  server.tool(
    'resolve_get_command_status',
    'Read the state, expires_at and bounded result/error of one DaVinci Resolve command owned by the caller. awaiting_approval is not a polling state: stop and ask the user to approve or deny it in the Kolbo plugin.',
    {
      command_id: z.string().min(1).max(128).regex(SAFE_ID),
    },
    async ({ command_id: id }) => text(await client.get(`/v1/resolve/commands/${encodeURIComponent(id)}`))
  );
}

module.exports = { registerResolveTools };
