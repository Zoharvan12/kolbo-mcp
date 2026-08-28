const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  VIDEO_EDIT_MODEL_TYPES,
  IMAGE_EDIT_MODEL_TYPES,
  modelTypeForEditOperation,
  assertExecutableEditModel,
} = require('../src/tools/editModelCatalog');

test('every edit_video operation resolves to its concrete catalog type', () => {
  assert.deepEqual(VIDEO_EDIT_MODEL_TYPES, {
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
});

test('image edit aliases resolve to the same engine families as the API', () => {
  assert.equal(modelTypeForEditOperation('image', 'upscale'), 'image_upscale');
  assert.equal(modelTypeForEditOperation('image', 'clarity_upscale'), 'image_upscale');
  assert.equal(modelTypeForEditOperation('image', 'split_upscale'), 'image_upscale');
  assert.equal(modelTypeForEditOperation('image', 'removebg'), 'background_remove');
  assert.equal(modelTypeForEditOperation('image', 'reframe'), 'image_reframe');
  assert.equal(modelTypeForEditOperation('image', 'zoom_out'), 'image_zoom_out');
  assert.equal(modelTypeForEditOperation('image', 'enhance'), 'graphics_enhance');
  assert.equal(modelTypeForEditOperation('image', 'multi_shot'), null);
  assert.equal(modelTypeForEditOperation('image', 'split'), null);
  assert.ok(Object.keys(IMAGE_EDIT_MODEL_TYPES).length >= 15);
});

test('gateway navigation aliases are rejected before an edit is submitted', () => {
  assert.throws(
    () => assertExecutableEditModel('kolbo_gateway_upscale', 'video', 'upscale'),
    /type="video_upscale"/
  );
  assert.throws(
    () => assertExecutableEditModel('kolbo_gateway_reframe', 'video', 'reframe'),
    /not an executable AI model/
  );
  assert.doesNotThrow(() =>
    assertExecutableEditModel('blackforestlabs/flux-video-upscale', 'video', 'upscale')
  );
});

test('both edit tools use operation-aware resolution and the gateway guard', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/tools/generate.js'), 'utf8');
  assert.match(source, /modelTypeForEditOperation\('image', operation\)/);
  assert.match(source, /modelTypeForEditOperation\('video', operation\)/);
  assert.equal((source.match(/assertExecutableEditModel\(model, 'image', operation\)/g) || []).length, 2);
  assert.equal((source.match(/assertExecutableEditModel\(model, 'video', operation\)/g) || []).length, 2);
  assert.match(source, /canonicalModelId\(client, model, editModelType \|\| undefined\)/);
  assert.match(source, /assertModelSupportsType\(client, model, editModelType \|\| undefined\)/);
  assert.match(source, /audio_format:\s*z\.enum\(\['wav', 'mp3', 'aac', 'flac'\]\)/);
  assert.match(source, /audio_format, segments,[\s\S]*?project_id, session_id/);
});
