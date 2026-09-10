const test = require('node:test');
const assert = require('node:assert/strict');
const { registerGenerateTools } = require('../src/tools/generate');
const { registerModelTools } = require('../src/tools/models');
for (const name of ['generate_image', 'generate_image_edit']) {
  test(`${name} forwards OpenAI options including zero compression`, async () => {
    const tools = {}; const calls = [];
    registerGenerateTools({ tool(name, description, schema, handler) { tools[name] = { schema, handler }; } }, {
      async get() { throw new Error('catalog unavailable'); },
      async post(path, body) { calls.push({ path, body }); return { generation_id: 'test-image', status: 'processing' }; }
    }, { remote: true, asyncGenerations: true, apps: true });
    const options = { background: 'transparent', output_format: 'webp', output_compression: 0, moderation: 'low', mask_image_url: 'https://example.com/mask.png' };
    for (const [key, value] of Object.entries(options)) assert.equal(tools[name].schema[key].parse(value), value);
    assert.throws(() => tools[name].schema.output_compression.parse(101));
    const result = await tools[name].handler({ prompt: 'A cat', model: 'gpt-image-2.5-flare', source_images: ['https://example.com/source.png'], ...options });
    assert.equal(calls.length, 1);
    for (const [key, value] of Object.entries(options)) assert.equal(calls[0].body[key], value);
    assert.equal(result.structuredContent.settings.background, 'transparent');
    assert.equal(result.structuredContent.settings.output_format, 'webp');
  });
}

test('list_models keeps the transparent-background capability in compact discovery', async () => {
  const tools = {};
  registerModelTools({ tool(name, description, schema, handler) { tools[name] = { schema, handler }; } }, {
    async get() {
      return {
        count: 1,
        models: [{
          identifier: 'gpt-image-2.5-sunburst',
          name: 'GPT Image 2.5 Sunburst',
          types: ['text_to_img'],
          credit: 10,
          supports_transparent_background: true,
        }],
      };
    },
  }, { apps: true });

  const result = await tools.list_models.handler({ format: 'json' });
  assert.equal(result.structuredContent.models[0].supports_transparent_background, true);
});
