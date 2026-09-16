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

// ─── adobe_edit_composition operation schema (mirrors kolbo-api adobe/schemas.js) ───
const seconds = (min = 0) => z.number().finite().min(min).max(3600);
const color = () => z.array(z.number().finite().min(0).max(1)).length(3).describe('[r, g, b], each 0-1');
const point = () => z.array(z.number().finite().min(-100000).max(100000)).length(2).describe('[x, y] in composition pixels; [0, 0] is top-left');
const layerRef = z.union([z.number().int().min(1).max(10000), noControls(128)])
  .describe('Layer name (exact) or 1-based index, 1 = top layer');
// Titles may span lines; every other control character is refused.
const TITLE_CONTROL = new RegExp('[\\x00-\\x09\\x0b\\x0c\\x0e-\\x1f]');
const titleText = z.string().min(1).max(500).refine(
  (value) => value.trim().length > 0 && !TITLE_CONTROL.test(value),
  'Text must be 1-500 characters; newlines allowed, no other control characters.',
);

const compOperation = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('comp.create'),
    name: noControls(128),
    width: z.number().int().min(16).max(8192).optional().describe('Default 1920'),
    height: z.number().int().min(16).max(8192).optional().describe('Default 1080'),
    frame_rate: z.number().finite().min(1).max(120).optional().describe('Default 30'),
    duration_seconds: seconds(0.1),
    background_color: color().optional(),
  }).strict(),
  z.object({
    op: z.literal('comp.update'),
    name: noControls(128).optional(),
    duration_seconds: seconds(0.1).optional(),
    background_color: color().optional(),
  }).strict(),
  z.object({
    op: z.literal('layer.add_media'),
    media_id: mediaId,
    url: mediaUrl,
    kind: mediaKind,
    name: noControls(128).optional().describe('Layer name; defaults to the file name. Name layers you will animate later.'),
    start_seconds: seconds().optional().describe('Where the layer starts on the comp timeline. Default 0.'),
    trim_start_seconds: seconds().optional().describe('Seconds skipped at the head of the source clip. Default 0.'),
    duration_seconds: seconds(0.04).optional().describe('Visible length. Default: rest of the source (stills: rest of the comp).'),
    fit: z.enum(['cover', 'contain', 'none']).optional().describe('Scale to fill the frame (cover, default), fit inside it, or keep size.'),
  }).strict(),
  z.object({
    op: z.literal('layer.add_text'),
    text: titleText,
    name: noControls(128).optional(),
    start_seconds: seconds().optional(),
    duration_seconds: seconds(0.04),
    font: noControls(128).optional().describe('PostScript font name. Default "Arial-BoldMT".'),
    font_size: z.number().finite().min(4).max(1000).optional().describe('Default 100'),
    color: color().optional().describe('Default white'),
    stroke_color: color().optional().describe('Outline colour. Default black when stroke_width is set.'),
    stroke_width: z.number().finite().min(0).max(100).optional().describe('Outline in pixels. Use 2-6 whenever text sits over bright or busy footage.'),
    position: point().optional().describe('Centre of the text block. Default: centre of the comp.'),
  }).strict(),
  z.object({
    op: z.literal('layer.add_solid'),
    color: color(),
    name: noControls(128).optional(),
    start_seconds: seconds().optional(),
    duration_seconds: seconds(0.04).optional(),
  }).strict(),
  z.object({
    op: z.literal('layer.update'),
    layer: layerRef,
    new_name: noControls(128).optional(),
    start_seconds: seconds().optional(),
    trim_start_seconds: seconds().optional(),
    duration_seconds: seconds(0.04).optional(),
    position: point().optional(),
    scale: z.number().finite().min(0).max(10000).optional().describe('Percent, uniform'),
    opacity: z.number().finite().min(0).max(100).optional(),
    rotation: z.number().finite().min(-36000).max(36000).optional().describe('Degrees'),
    audio_levels: z.number().finite().min(-96).max(24).optional().describe('dB'),
    enabled: z.boolean().optional(),
  }).strict(),
  z.object({
    op: z.literal('layer.animate'),
    layer: layerRef,
    property: z.enum(['opacity', 'scale', 'position', 'rotation', 'audio_levels'])
      .describe('opacity 0-100, scale percent, rotation degrees, audio_levels dB, position [x, y]'),
    keyframes: z.array(z.object({
      time_seconds: seconds().describe('Comp time of this key'),
      value: z.union([z.number().finite().min(-36000).max(36000), point()]),
    }).strict()).min(1).max(50),
    easing: z.enum(['ease', 'linear']).optional().describe('Default ease'),
  }).strict(),
  z.object({
    op: z.literal('layer.delete'),
    layer: layerRef,
  }).strict(),
]);
const compOperations = z.array(compOperation).min(1).max(100)
  .superRefine((ops, ctx) => {
    ops.forEach((operation, opIndex) => {
      if (operation.op !== 'layer.animate') return;
      const wantsPoint = operation.property === 'position';
      operation.keyframes.forEach((key, index) => {
        if (Array.isArray(key.value) !== wantsPoint) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [opIndex, 'keyframes', index, 'value'],
            message: wantsPoint ? 'position keyframes need [x, y]' : `${operation.property} keyframes need a number`,
          });
        }
      });
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
    'adobe_edit_composition',
    'After Effects only. Apply a batch of structured edits to a composition as ONE undo step: create or update a comp, add Kolbo media (trimmed and timed), text titles and solids, change layer timing/transform/opacity/audio, animate with keyframes, or delete layers. Times are in seconds on the composition timeline. Layers are addressed by the exact name you gave them or by 1-based index (1 = top). New layers stack on top; solids go to the bottom. Operations run in order and stop at the first failure (earlier ones stay applied). The editor approves the whole batch once in the Kolbo panel. Read workflows/adobe.md before the first call; verify with adobe_get_timeline afterwards.',
    {
      session_id: sessionId,
      operations: compOperations,
      idempotency_key: idempotencyKey,
    },
    async (args) => {
      for (const operation of args.operations) {
        if (operation.op === 'layer.add_media') mediaSource(operation, 'adobe_edit_composition layer.add_media');
      }
      return command(client, 'comp.edit', args, { operations: args.operations });
    }
  );

  server.tool(
    'adobe_run_script',
    'Run ExtendScript inside the connected After Effects (or Premiere Pro) for real motion graphics: shape layers, trim paths, text animators, effects, masks, expressions, cameras, precomps. `code` is a FUNCTION BODY: use log(...) for progress and `return` a JSON-serialisable result. In After Effects the whole script is one undo step. The editor sees the exact code in the Kolbo panel and must approve it. Scripts have full access to the project and the computer, so never read or write files, call system.callSystem, or touch the network unless the user explicitly asked. Read workflows/after-effects-motion.md before writing motion graphics, then verify with adobe_capture_frame.',
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
    'adobe_capture_frame',
    'Render one frame of the active After Effects composition (PNG) or Premiere Pro sequence (JPEG) and save it to the Kolbo media library. The result carries the image `url` - look at it to check your motion graphics or edit before telling the user it is done. The editor approves it in the Kolbo panel.',
    {
      session_id: sessionId,
      time_seconds: z.number().finite().min(0).max(3600).optional().describe('Frame time. Default: current playhead / comp time.'),
      project_id: z.string().min(1).max(128).regex(SAFE_ID).optional().describe('Kolbo project to file the capture in.'),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'frame.capture', args, {
      ...(args.time_seconds !== undefined ? { time_seconds: args.time_seconds } : {}),
      ...(args.project_id ? { project_id: args.project_id } : {}),
    })
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
