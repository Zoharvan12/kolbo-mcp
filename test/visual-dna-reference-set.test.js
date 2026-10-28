/**
 * Visual DNA as one reference set: images, a video and a voice clip, in any mix
 * (2026-10-28, matching the web app and the API).
 *
 * Pins the MCP side:
 *   - create states that a video-only or voice-only DNA is valid (voice-only = character);
 *   - update can REMOVE a clip with `video: ""` / `audio: ""`, on both the JSON and the
 *     multipart path, and an empty string counts as "something to update";
 *   - the docs no longer claim the API auto-attaches a DNA's voice (it does not — the
 *     caller passes `audio_clips[0].url`; the server then labels it as the character).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'visual_dna.js'), 'utf8');
const toolBlock = (name) => {
  const start = src.indexOf(`'${name}',`);
  assert.notEqual(start, -1, `could not find tool ${name}`);
  const next = src.indexOf('server.tool(', start);
  return next === -1 ? src.slice(start) : src.slice(start, next);
};

test('create documents video-only and voice-only DNAs', () => {
  const block = toolBlock('create_visual_dna');
  assert.match(block, /ANY ONE of them is enough/);
  assert.match(block, /voice-only DNA \(dna_type must be \\?"character\\?"/);
  assert.doesNotMatch(block, /auto-attaches the clip/, 'claims an auto-attach the API does not do');
  assert.match(block, /audio_clips\[0\]\.url/);
});

test('update removes a clip with an empty string, on both request paths', () => {
  const block = toolBlock('update_visual_dna');
  assert.match(block, /const removeVideo = video === '';/);
  assert.match(block, /const removeAudio = audio === '';/);
  assert.match(block, /remove_character_sheet !== undefined \|\| removeVideo \|\| removeAudio/);
  assert.match(block, /if \(removeVideo\) body\.remove_video = true;/);
  assert.match(block, /if \(removeAudio\) body\.remove_audio = true;/);
  assert.match(block, /if \(removeVideo\) form\.append\('removeVideo', 'true'\);/);
  assert.match(block, /if \(removeAudio\) form\.append\('removeAudio', 'true'\);/);
});
