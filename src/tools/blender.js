'use strict';

const { z } = require('zod');

const MAX_COMMAND_BYTES = 256 * 1024;
const MAX_ABSOLUTE_NUMBER = 1_000_000_000;
const MAX_RENDER_PIXELS = 40_000_000;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const SAFE_MODIFIER_TYPE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const BLOCKED_PROPERTY_KEYS = new Set(['name', 'rna_type', 'type', 'bl_rna']);

// Keep exact parity with kolbo_blender/cache.py::_TRUSTED_MEDIA_HOSTS. This
// duplicated fail-closed boundary prevents an agent from proposing a URL that
// the desktop host will (correctly) reject later.
const TRUSTED_MEDIA_HOSTS = new Set([
  'api.kolbo.ai',
  'cdn.kolbo.ai',
  'media.kolbo.ai',
  'media-dev.kolbo.ai',
  'media-staging.kolbo.ai',
  'kolbo-general-media.fra1.cdn.digitaloceanspaces.com',
  'kolbo-general-media.fra1.digitaloceanspaces.com',
  'kolboai-production.ams3.cdn.digitaloceanspaces.com',
  'kolboai-production.ams3.digitaloceanspaces.com',
  'kolboai-staging.ams3.cdn.digitaloceanspaces.com',
  'kolboai-staging.ams3.digitaloceanspaces.com',
  'kolboai-development.ams3.cdn.digitaloceanspaces.com',
  'kolboai-development.ams3.digitaloceanspaces.com',
  'kolboai-media.ams3.cdn.digitaloceanspaces.com',
  'kolboai-media.ams3.digitaloceanspaces.com',
]);

function isTrustedMediaUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && TRUSTED_MEDIA_HOSTS.has(parsed.hostname.replace(/\.$/, '').toLowerCase());
  } catch (_) {
    return false;
  }
}

const noControls = (max) => z.string().min(1).max(max).refine(
  (value) => value.trim().length > 0 && !/[\x00-\x1f]/.test(value),
  `Must be non-empty and contain no control characters (max ${max}).`,
);
const sessionId = z.string().min(1).max(128).regex(SAFE_ID).optional().describe(
  'Target Blender session id from blender_list_sessions. Omit only when exactly one active session exists.'
);
const idempotencyKey = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)
  .optional()
  .describe('Optional replay-safe key. Reuse it only when retrying the same command.');
const name = noControls(128);
const boundedNumber = z.number().finite().min(-MAX_ABSOLUTE_NUMBER).max(MAX_ABSOLUTE_NUMBER);
const vector = z.tuple([boundedNumber, boundedNumber, boundedNumber]);
const colorComponent = z.number().finite().min(0).max(1);
const color = z.union([
  z.tuple([colorComponent, colorComponent, colorComponent]),
  z.tuple([colorComponent, colorComponent, colorComponent, colorComponent]),
]);
const propertyScalar = z.union([
  noControls(256),
  boundedNumber,
  z.boolean(),
]);
const properties = z.record(z.union([propertyScalar, z.array(propertyScalar).max(16)]))
  .refine((value) => Object.keys(value).length <= 30, 'A modifier may contain at most 30 properties.')
  .refine(
    (value) => Object.keys(value).every((key) => SAFE_PROPERTY_KEY.test(key) && !BLOCKED_PROPERTY_KEYS.has(key)),
    'Modifier property names must use the editable property allowlist.',
  )
  .refine(
    (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 16 * 1024,
    'Modifier properties must be at most 16 KiB as JSON.',
  );
const transform = {
  location: vector.optional(),
  rotation_euler: vector.optional(),
  scale: vector.optional(),
};
const operation = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('object.create'),
    name: name.optional(),
    type: z.enum(['CUBE', 'SPHERE', 'CYLINDER', 'CONE', 'PLANE', 'EMPTY', 'CAMERA', 'LIGHT']),
    light_type: z.enum(['POINT', 'SUN', 'SPOT', 'AREA']).optional(),
    energy: z.number().finite().min(0).max(MAX_ABSOLUTE_NUMBER).optional(),
    color: color.optional(),
    shadow_soft_size: z.number().finite().min(0).max(MAX_ABSOLUTE_NUMBER).optional(),
    lens: z.number().finite().min(1).max(10_000).optional(),
    collection: name.optional(),
    ...transform,
  }).strict(),
  z.object({ op: z.literal('object.transform'), object: name, ...transform }).strict(),
  z.object({ op: z.literal('object.rename'), object: name, new_name: name }).strict(),
  z.object({ op: z.literal('object.delete'), object: name }).strict(),
  z.object({
    op: z.literal('object.duplicate'),
    object: name,
    new_name: name.optional(),
    collection: name.optional(),
    ...transform,
  }).strict(),
  z.object({ op: z.literal('object.set_parent'), object: name, parent: name.nullable().optional() }).strict(),
  z.object({ op: z.literal('collection.create'), name, parent: name.nullable().optional() }).strict(),
  z.object({ op: z.literal('collection.delete'), collection: name }).strict(),
  z.object({ op: z.literal('collection.link_object'), collection: name, object: name }).strict(),
  z.object({
    op: z.literal('material.create'),
    name,
    base_color: color.optional(),
    roughness: z.number().min(0).max(1).optional(),
    metallic: z.number().min(0).max(1).optional(),
    alpha: z.number().min(0).max(1).optional(),
    emission_color: color.optional(),
    emission_strength: z.number().finite().min(0).max(MAX_ABSOLUTE_NUMBER).optional(),
  }).strict(),
  z.object({ op: z.literal('material.assign'), object: name, material: name, replace: z.boolean().optional() }).strict(),
  z.object({
    op: z.literal('material.set_principled'),
    material: name,
    base_color: color.optional(),
    roughness: z.number().min(0).max(1).optional(),
    metallic: z.number().min(0).max(1).optional(),
    alpha: z.number().min(0).max(1).optional(),
    emission_color: color.optional(),
    emission_strength: z.number().finite().min(0).max(MAX_ABSOLUTE_NUMBER).optional(),
  }).strict(),
  z.object({ op: z.literal('world.set_color'), color }).strict(),
  z.object({
    op: z.literal('modifier.add'),
    object: name,
    type: z.string().regex(SAFE_MODIFIER_TYPE),
    name: name.optional(),
    properties: properties.optional(),
  }).strict(),
  z.object({ op: z.literal('modifier.configure'), object: name, modifier: name, properties }).strict(),
  z.object({ op: z.literal('modifier.remove'), object: name, modifier: name }).strict(),
  z.object({ op: z.literal('camera.set_active'), object: name }).strict(),
  z.object({
    op: z.literal('animation.keyframe_insert'),
    object: name,
    data_path: name,
    frame: z.number().int().min(-1_048_574).max(1_048_574),
    index: z.number().int().min(-1).max(1024).optional(),
  }).strict(),
  z.object({
    op: z.literal('animation.delete_keyframe'),
    object: name,
    data_path: name,
    frame: z.number().int().min(-1_048_574).max(1_048_574),
    index: z.number().int().min(-1).max(1024).optional(),
  }).strict(),
]).superRefine((value, ctx) => {
  if (value.op === 'object.transform' && !['location', 'rotation_euler', 'scale'].some((field) => value[field] !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'object.transform requires at least one transform field.' });
  }
  if (value.op === 'material.set_principled' && ![
    'base_color', 'roughness', 'metallic', 'alpha', 'emission_color', 'emission_strength',
  ].some((field) => value[field] !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'material.set_principled requires at least one material property.' });
  }
  if (value.op === 'object.create') {
    if (value.type !== 'LIGHT' && ['light_type', 'energy', 'color', 'shadow_soft_size'].some((field) => value[field] !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Light settings require object.create type LIGHT.' });
    }
    if (value.type !== 'CAMERA' && value.lens !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'lens requires object.create type CAMERA.' });
    }
  }
});

function countJsonNodes(value, limit = 2500) {
  let count = 0;
  const visit = (entry) => {
    count += 1;
    if (count > limit || entry === null || typeof entry !== 'object') return;
    if (Array.isArray(entry)) entry.forEach(visit);
    else Object.values(entry).forEach(visit);
  };
  visit(value);
  return count;
}

const operations = z.array(operation).min(1).max(100)
  .refine(
    (value) => Buffer.byteLength(JSON.stringify({ operations: value }), 'utf8') <= MAX_COMMAND_BYTES,
    'Structured operations payload must be at most 256 KiB as JSON.',
  )
  .refine(
    (value) => countJsonNodes({ operations: value }) <= 2500,
    'Structured operations payload is too complex.',
  );

function assertPixelBounds(width, height, context) {
  if (width !== undefined && height !== undefined && width * height > MAX_RENDER_PIXELS) {
    throw new Error(`${context} dimensions may not exceed 40 megapixels.`);
  }
}

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
  return client.post('/v1/blender/commands', envelope(type, args, payload)).then(text);
}

function registerBlenderTools(server, client) {
  server.tool(
    'blender_list_sessions',
    'List only the caller\'s currently registered Blender processes. Use this before any Blender command when more than one Blender window may be connected.',
    {
      page: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(100).default(25),
    },
    async ({ page, page_size }) => text(await client.get(`/v1/blender/sessions?page=${page}&page_size=${page_size}`))
  );

  server.tool(
    'blender_get_scene',
    'Queue a read-only scene inspection in Blender. Returns a command record; if status is queued or running, use blender_get_command_status. If approval is required, stop and let the user approve in Blender.',
    {
      session_id: sessionId,
      detail: z.enum(['summary', 'full']).default('summary').describe('Summary is compact; full includes bounded object details.'),
      include: z.array(z.enum([
        'objects', 'collections', 'render', 'data',
      ])).max(4).optional().describe('Scene sections to include. Omit for the standard summary.'),
      include_hidden: z.boolean().default(false),
      max_objects: z.number().int().min(1).max(500).optional(),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'scene.get', args, {
      detail: args.detail,
      ...(args.include ? { include: args.include } : {}),
      include_hidden: args.include_hidden,
      ...(args.max_objects ? { max_objects: args.max_objects } : {}),
    })
  );

  server.tool(
    'blender_search_docs',
    'Inspect the connected Blender runtime and return relevant official Blender API/manual URLs. The extension does not fetch those documentation pages or execute returned code.',
    {
      session_id: sessionId,
      query: noControls(200).describe('Specific Blender API or manual question.'),
      limit: z.number().int().min(1).max(50).default(5),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'docs.search', args, {
      query: args.query,
      limit: args.limit,
    })
  );

  server.tool(
    'blender_capture_viewport',
    'Capture the active Blender viewport to the extension-managed cache and optionally add it to the caller\'s Kolbo media library. This creates a file/media record but does not modify the scene.',
    {
      session_id: sessionId,
      format: z.enum(['png', 'jpeg']).default('png'),
      width: z.number().int().min(16).max(8192).optional(),
      height: z.number().int().min(16).max(8192).optional(),
      upload_to_kolbo: z.boolean().default(true),
      project_id: noControls(128).optional().describe('Optional Kolbo project id for the uploaded capture.'),
      idempotency_key: idempotencyKey,
    },
    async (args) => {
      assertPixelBounds(args.width, args.height, 'Viewport capture');
      return command(client, 'viewport.capture', args, {
        format: args.format,
        ...(args.width ? { width: args.width } : {}),
        ...(args.height ? { height: args.height } : {}),
        upload_to_kolbo: args.upload_to_kolbo,
        ...(args.project_id ? { project_id: args.project_id } : {}),
      });
    }
  );

  server.tool(
    'blender_apply_operations',
    'Apply a bounded list of structured Blender operations. This changes the scene and may delete data; preview the exact operations and obtain user approval in Blender when requested.',
    {
      session_id: sessionId,
      operations: operations.describe(
        'Strict top-level operation objects. Use the exact dotted op and only fields accepted by that operation.'
      ),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'scene.apply_operations', args, { operations: args.operations })
  );

  server.tool(
    'blender_import_media',
    'Import one Kolbo media item or Kolbo-owned HTTPS media/CDN asset into Blender. URLs are restricted to the extension\'s exact v1 host allowlist and revalidated after redirects. GLB imports as a named collection; images support plane/material/world; video imports to the sequencer.',
    {
      session_id: sessionId,
      media_id: noControls(128).optional(),
      url: z.string().url().max(4096)
        .refine(isTrustedMediaUrl, 'Only Kolbo-owned HTTPS media/CDN URLs are accepted.')
        .optional(),
      kind: z.enum(['model', '3d', 'glb', 'image', 'video']).optional(),
      import_mode: z.enum(['plane', 'active_material', 'world', 'sequencer', 'collection']).optional(),
      name: name.optional(),
      idempotency_key: idempotencyKey,
    },
    async (args) => {
      if (Boolean(args.media_id) === Boolean(args.url)) {
        throw new Error('Provide exactly one of media_id or url.');
      }
      return command(client, 'media.import', args, {
        ...(args.media_id ? { media_id: args.media_id } : { url: args.url }),
        ...(args.kind ? { kind: args.kind } : {}),
        ...(args.import_mode ? { import_mode: args.import_mode } : {}),
        ...(args.name ? { name: args.name } : {}),
      });
    }
  );

  server.tool(
    'blender_render',
    'Start a Blender still or animation render. V1 animation renders are host-enforced at 250 scene frames and 100,000,000 pixel-frames. Rendering can consume substantial machine resources and writes managed output files; approval may be required in Blender.',
    {
      session_id: sessionId,
      kind: z.enum(['still', 'animation']).default('still'),
      engine: z.enum(['BLENDER_EEVEE_NEXT', 'CYCLES', 'BLENDER_WORKBENCH']).optional(),
      width: z.number().int().min(16).max(8192).optional(),
      height: z.number().int().min(16).max(8192).optional(),
      percentage: z.number().int().min(1).max(100).optional(),
      frame: z.number().int().min(-1_048_574).max(1_048_574).optional(),
      upload_to_kolbo: z.boolean().default(true),
      project_id: noControls(128).optional(),
      idempotency_key: idempotencyKey,
    },
    async (args) => {
      assertPixelBounds(args.width, args.height, 'Render');
      return command(client, 'render.start', args, {
        kind: args.kind,
        ...(args.engine ? { engine: args.engine } : {}),
        ...(args.width ? { width: args.width } : {}),
        ...(args.height ? { height: args.height } : {}),
        ...(args.percentage ? { percentage: args.percentage } : {}),
        ...(args.frame !== undefined ? { frame: args.frame } : {}),
        upload_to_kolbo: args.upload_to_kolbo,
        ...(args.project_id ? { project_id: args.project_id } : {}),
      });
    }
  );

  server.tool(
    'blender_undo',
    'Undo the most recent Blender change in the selected session. Undo is itself state-changing and can discard later work, so do not call it speculatively.',
    {
      session_id: sessionId,
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'scene.undo', args, {})
  );

  server.tool(
    'blender_file_operation',
    'Perform a sensitive Blender file operation. Opening, replacing, or writing an arbitrary path can overwrite data and always requires explicit in-Blender approval unless the user enabled trusted mode for this process.',
    {
      session_id: sessionId,
      operation: z.enum(['new', 'open', 'save', 'save_as']),
      path: noControls(4096).optional(),
      confirm_overwrite: z.boolean().default(false),
      idempotency_key: idempotencyKey,
    },
    async (args) => {
      if (['open', 'save_as'].includes(args.operation) && !args.path) {
        throw new Error(`${args.operation} requires path.`);
      }
      return command(client, 'file.operation', args, {
        operation: args.operation,
        ...(args.path ? { path: args.path } : {}),
        confirm_overwrite: args.confirm_overwrite,
      });
    }
  );

  server.tool(
    'blender_execute_python',
    'Execute Python inside Blender with full machine-level authority. The code can read files, access the network, run processes, and alter the scene. Show the exact code to the user first; it always requires in-Blender approval unless trusted mode is visibly active.',
    {
      session_id: sessionId,
      code: z.string().min(1).max(65_536).refine(
        (value) => Buffer.byteLength(value, 'utf8') <= 65_536,
        'Python code must be at most 64 KiB as UTF-8.',
      ),
      purpose: noControls(500).describe('Plain-language reason shown with the exact code in Blender approval.'),
      idempotency_key: idempotencyKey,
    },
    async (args) => command(client, 'python.execute', args, {
      code: args.code,
      purpose: args.purpose,
    })
  );

  server.tool(
    'blender_get_command_status',
    'Read the current state, absolute expires_at, and bounded result/error for one Blender command owned by the caller. Commands and idempotency claims expire after 24 hours. awaiting_approval is not a polling state: stop and wait for the user to approve or deny it in Blender.',
    {
      command_id: z.string().min(1).max(128).regex(SAFE_ID),
    },
    async ({ command_id: id }) => text(await client.get(`/v1/blender/commands/${encodeURIComponent(id)}`))
  );
}

module.exports = { registerBlenderTools, envelope };
