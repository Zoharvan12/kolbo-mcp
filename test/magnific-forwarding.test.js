'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { registerGenerateTools } = require('../src/tools/generate');

function harness() {
  const tools = new Map(), requests = [];
  const stop = new Error('STOP_BEFORE_PAID_SUBMISSION');
  const client = { apiBase: `test-${Math.random()}`, get: async () => ({ models: [] }), request: async () => ({ models: [] }),
    post: async (url, body) => { requests.push({ url, body }); throw stop; } };
  registerGenerateTools({ tool(name, description, schema, handler) { tools.set(name, { schema, handler }); } }, client, { asyncGenerations: true });
  return { tools, requests, stop };
}

// Zod strips unknown keys, so a field missing from the schema never reaches the API.
const run = async (name, args) => {
  const { tools, requests, stop } = harness();
  const tool = tools.get(name);
  const parsed = z.object(tool.schema).parse(args);
  await assert.rejects(tool.handler(parsed), (e) => e === stop);
  return requests[0];
};

test('image_tools forwards the Magnific upscaler settings', async () => {
  const opts = { hdr: -3, fractality: 4, engine: 'magnific_sharpy', optimized_for: 'soft_portraits', creativity: -10, resemblance: 10,
    flavor: 'photo_denoiser', sharpen: 50, smart_grain: 7, ultra_detail: 30, scale: 16 };
  const req = await run('image_tools', { image_url: 'https://media.example.com/a.png', operation: 'upscale', model: 'magnific-upscaler-creative', ...opts });
  assert.equal(req.url, '/v1/edit/image');
  for (const [k, v] of Object.entries(opts)) assert.equal(req.body[k], v, k);
});

test('image_tools rejects a decimal Magnific hdr before submit', () => {
  const { tools } = harness();
  assert.throws(() => z.object(tools.get('image_tools').schema).parse({ image_url: 'https://x/a.png', operation: 'upscale', hdr: 1.5 }));
});

test('video_tools forwards the Magnific video upscaler settings', async () => {
  const opts = { creativity: 40, flavor: 'vivid', sharpen: 20, smart_grain: 5, fps_boost: true, strength: 60,
    output_format: 'prores_422_hq', frame_interpolation: 'chronos', noise: 0.3, resolution: '4k', target_fps: 60, enhancement_model: 'starlight_fast_2' };
  const req = await run('video_tools', { video_url: 'https://media.example.com/a.mp4', operation: 'upscale', model: 'magnific-video-upscaler', ...opts });
  assert.equal(req.url, '/v1/edit/video');
  for (const [k, v] of Object.entries(opts)) assert.equal(req.body[k], v, k);
});

test('generate_image forwards Magnific One draft and icon settings', async () => {
  const opts = { tiles: 16, style: 'outline', format: 'svg', num_inference_steps: 20, guidance_scale: 7 };
  const req = await run('generate_image', { prompt: 'a fox', model: 'magnific-text-to-icon', ...opts });
  assert.equal(req.url, '/v1/generate/image');
  for (const [k, v] of Object.entries(opts)) assert.equal(req.body[k], v, k);
});
