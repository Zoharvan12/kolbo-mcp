/*
 * Operation-specific model catalogs for edit_image / edit_video.
 *
 * The `kolbo_gateway_*` rows in video_to_video are navigation aliases used by
 * Kolbo's web picker. They are not provider engines. MCP callers must discover
 * and submit a concrete model from the operation's real DB type instead.
 */

const VIDEO_EDIT_MODEL_TYPES = Object.freeze({
  upscale: 'video_upscale',
  reframe: 'video_reframe',
  generate_audio: 'video_to_sound',
  remove_watermark: 'video_watermark_removal',
  face_swap: 'video_face_swap',
  extend: 'video_extend',
  magic_edit: 'video_to_video',
  lipsync: 'lipsync-video',
  remove_background: 'video_background_removal',
  inpaint: 'video_inpaint',
  retake: 'video_retake',
});

const IMAGE_EDIT_MODEL_TYPES = Object.freeze({
  upscale: 'image_upscale',
  clarity_upscale: 'image_upscale',
  reframe: 'image_reframe',
  zoom_out: 'image_zoom_out',
  inpaint: 'inpaint',
  erase: 'erase',
  face_swap: 'face_swap',
  background_remove: 'background_remove',
  removebg: 'background_remove',
  background_replace: 'background_replace',
  magic_edit: 'image_editing',
  camera_angle: 'image_editing',
  enhance_skin: 'skin_enhancer',
  enhance: 'graphics_enhance',
  // The API intentionally pins multi_shot to its dedicated engine.
  multi_shot: null,
  split_upscale: 'image_upscale',
  split: null,
});

function modelTypeForEditOperation(kind, operation) {
  const map = kind === 'image' ? IMAGE_EDIT_MODEL_TYPES : VIDEO_EDIT_MODEL_TYPES;
  return map[operation] || null;
}

function assertExecutableEditModel(model, kind, operation) {
  if (!model || !/^kolbo_gateway_/i.test(String(model))) return;
  const type = modelTypeForEditOperation(kind, operation);
  throw new Error(
    `"${model}" is a Kolbo navigation alias, not an executable AI model. ` +
    `Call list_models with type="${type || (kind === 'image' ? 'image_editing' : 'video_to_video')}" ` +
    `and pass one of the concrete model identifiers it returns.`
  );
}

module.exports = {
  VIDEO_EDIT_MODEL_TYPES,
  IMAGE_EDIT_MODEL_TYPES,
  modelTypeForEditOperation,
  assertExecutableEditModel,
};
