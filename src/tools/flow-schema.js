'use strict';

// Additive public schema snapshot. Refresh from the API's Flow graph contract when
// adding writable fields; the API remains authoritative for per-node validation.
const { z } = require('zod');
const contract = require('./flow-contract.json');
const nodeType = z.enum(contract.node_types);
const nodeId = z.string().regex(/^[\w-]{1,100}$/);
const text = z.string().max(100000);
const scalar = z.union([z.string().max(1000), z.number().finite()]);
const position = z.object({ x: z.number().finite().min(-1000000).max(1000000), y: z.number().finite().min(-1000000).max(1000000) }).strict();
const ids = z.array(nodeId).max(500);
const reference = z.union([z.string().max(4096), z.object({
  id: z.string().max(128).optional(), mediaId: z.string().max(128).optional(),
  url: z.string().max(4096).optional(), name: z.string().max(500).optional(),
  type: z.enum(['image','video','audio']).optional(),
}).strict()]);
const voice = z.union([z.string().max(256), z.object({
  id: z.string().max(128).optional(), voice_id: z.string().max(128).optional(),
  name: z.string().max(500).optional(), type: z.string().max(128).optional(),
}).strict()]);
const booleanConfig = new Set('instrumental preservePitch resolved enhancePrompt soundEnabled sound_enabled showLyrics includeAudio loop reverse'.split(' '));
const numberConfig = new Set('scale frameCount quantity startTime endTime speed timestamp speaking_speed promptInfluence creativity resemblance movement upscaleFactor targetFps extendDuration skinIntensity start end cropX cropY cropWidth cropHeight x y width height fps frameTime seed temperature maxTokens volume'.split(' '));
const modelConfig = new Set('model t2iModel i2iModel t2vModel i2vModel flModel modelId engineId'.split(' '));
const configShape = Object.fromEntries(contract.config_fields.map(field => {
  let schema = text;
  if (booleanConfig.has(field)) schema = z.boolean();
  if (numberConfig.has(field)) schema = z.number().finite();
  if (field === 'duration' || field === 'resolution' || field === 'quality') schema = scalar;
  if (field === 'quantity' || field === 'frameCount') schema = z.number().int().min(1).max(100);
  if (modelConfig.has(field)) schema = z.string().max(200).nullable();
  if (field === 'voice' || field === 'selectedVoice') schema = voice.nullable();
  if (/^reference(Images|Videos|Audios)$/.test(field)) schema = z.array(reference).max(100);
  if (field === 'visualDnaIds') schema = z.array(z.string().max(128)).max(100);
  if (field === 'moodboardId' || field === 'presetId') schema = z.string().max(128).nullable();
  if (Object.values(contract.defaults).some(defaults => defaults[field] === null)) schema = schema.nullable();
  return [field, schema.optional()];
}));
const config = z.object(configShape).strict();
const settings = z.object(Object.fromEntries(contract.settings_fields.map(key => {
  let value = z.union([text, z.number().finite(), z.boolean()]);
  if (key === 'previewInfo') value = z.object({ width: z.number().optional(), height: z.number().optional(), duration: z.number().optional(), type: text.optional(), size: z.number().optional(), format: text.optional(), url: text.optional() }).strict().nullable();
  return [key,value.optional()];
}))).strict();
const nodeFieldShape = Object.fromEntries(contract.node_fields.map(field => {
  let schema = text;
  if (field === 'config') schema = config;
  if (field === 'settings') schema = settings;
  if (field === 'gridColumns') schema = z.number().int().min(1).max(20);
  if (field === 'clipOrder') schema = z.array(z.string().max(200)).max(500);
  if (field === 'textFormat') schema = z.object({ bold:z.boolean().optional(),italic:z.boolean().optional(),underline:z.boolean().optional(),strikethrough:z.boolean().optional() }).strict();
  if (field === 'mediaLibraryItems') schema = z.array(z.object({id:z.string().max(200),url:z.string().max(4096),thumbUrl:z.string().max(4096).optional(),type:z.enum(['image','video','audio'])}).strict()).max(500);
  if (field === 'comments') schema = z.array(z.object({id:z.string().max(200),userId:z.string().max(128),authorName:z.string().max(200),authorAvatar:z.string().max(4096),text,timestamp:z.number().finite()}).strict()).max(500);
  if (field === 'position') schema = position;
  if (['width','height','nodeWidth','nodeHeight'].includes(field)) schema = z.number().finite().min(1).max(20000);
  if (field === 'fontSize') schema = z.number().finite().min(1).max(2000);
  if (field === 'currentFlatIndex') schema = z.number().int().min(0);
  if (field === 'parentId') schema = nodeId;
  if (['locked','resolved','keepItems'].includes(field)) schema = z.boolean();
  if (['visualDnaIds','selectedMediaIds'].includes(field)) schema = z.array(z.string().max(128)).max(500);
  if (field === 'items') schema = z.array(z.string().max(4096)).max(500);
  if (field === 'moodboardId' || field === 'presetId') schema = z.string().max(128).nullable();
  return [field, schema.optional()];
}));
const fields = z.object(nodeFieldShape).strict();
const unset = z.array(z.enum(contract.node_fields.filter(k => !['position','label'].includes(k)))).max(contract.node_fields.length).optional();
const op = (name, shape) => z.object({ op: z.literal(name), ...shape }).strict();
const operation = z.discriminatedUnion('op', [
  op('node.add', { node_id: nodeId.optional(), type: nodeType, fields: fields.optional() }),
  op('node.update', { node_id: nodeId, fields: fields.optional(), unset }),
  op('node.remove', { node_id: nodeId }),
  op('nodes.duplicate', { node_ids: ids.min(1), offset: position.optional() }),
  op('edge.add', { edge_id: nodeId.optional(), source: nodeId, target: nodeId, source_handle: nodeId, target_handle: nodeId }),
  op('edge.update', { edge_id: nodeId, fields: z.object({ source: nodeId.optional(), target: nodeId.optional(), sourceHandle: nodeId.optional(), targetHandle: nodeId.optional(), label: text.optional() }).strict() }),
  op('edge.remove', { edge_id: nodeId }),
  op('input.reorder', { node_id: nodeId, handle: nodeId, edge_ids: z.array(nodeId).max(2500) }),
  op('group.create', { node_id: nodeId.optional(), node_ids: ids, fields: fields.optional() }),
  op('group.update', { node_id: nodeId, fields: fields.optional(), unset }),
  op('group.set_members', { node_id: nodeId, node_ids: ids }),
  op('group.remove', { node_id: nodeId }),
  op('layout.apply', { node_ids: ids.min(1).optional() }),
  op('session.update', { fields: z.object({ name: z.string().min(1).max(200).optional(), instructions: z.string().max(10000).optional(), isPinned: z.boolean().optional(), isArchived: z.boolean().optional() }).strict() }),
  op('output.select', { node_id: nodeId, run_id: z.string().min(1).max(128), handle:nodeId.optional(), index: z.number().int().min(0) }),
]);
const { position: ignoredPosition, width: ignoredWidth, height: ignoredHeight, parentId: ignoredParent, ...dataShape } = nodeFieldShape;
const initialGraph = z.object({
  nodes: z.array(z.object({ id: nodeId, type: nodeType, position,
    width: nodeFieldShape.width, height: nodeFieldShape.height, parentId: nodeFieldShape.parentId,
    data: z.object(dataShape).strict(),
  }).strict()).max(500),
  edges: z.array(z.object({ id: nodeId, source: nodeId, target: nodeId, sourceHandle: nodeId, targetHandle: nodeId, label: text.optional() }).strict()).max(2500),
}).strict();

module.exports = { operation, initialGraph, nodeType, fields, config };
