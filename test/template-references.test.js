const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerGenerateTools } = require('../src/tools/generate');

const thumbnail = 'https://media.kolbo.ai/template.png';
const output = 'https://media.kolbo.ai/output.png';
const preset = 'template-reference-test';

for (const tool of ['generate_image', 'generate_image_edit']) {
  for (const apps of [true, false]) {
    for (const batch of [true, false]) {
      test(`${tool} preserves template and uploaded references (apps=${apps}, batch=${batch})`, async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kolbo-template-'));
        const file = path.join(dir, 'reference.png');
        fs.writeFileSync(file, 'fixture');
        let handler, uploads = 0;
        const submitted = [];
        const cdn = 'https://media.kolbo.ai/uploaded.png';
        const remote = 'https://media.kolbo.ai/second.png';
        try {
          registerGenerateTools({ tool(name, ...args) { if (name === tool) handler = args.at(-1); } }, {
            async get(route) {
              if (route === '/v1/presets') return { presets: [{ id: preset, name: 'Character Sheet', thumbnail_url: thumbnail }] };
              if (route.includes('/status')) return { state: 'completed', result: { urls: [output] } };
              return { models: [] };
            },
            async postMultipart() { uploads++; return { media: { url: cdn } }; },
            async post(route, body) { submitted.push(body); return { generation_id: 'template-' + submitted.length }; },
          }, { apps });
          const args = { preset_id: preset, ...(batch ? { prompts: ['First', 'Second'] } : { prompt: 'Character sheet' }) };
          if (tool === 'generate_image_edit') {
            args.source_images = [file];
            args.reference_images = [remote];
          } else args.reference_images = [file, remote];
          const result = await handler(args);
          assert.equal(uploads, 1, 'one upload shared by every batch prompt');
          assert.equal(submitted.length, batch ? 2 : 1);
          assert.deepEqual(result.structuredContent.reference_images, [cdn, remote]);
          assert.equal(result.structuredContent.settings.preset_thumbnail, thumbnail);
          assert.equal(result.structuredContent.settings.preset_name, 'Character Sheet');
          assert.ok(!JSON.stringify(result.structuredContent).includes(file));
          for (const body of submitted) assert.ok(JSON.stringify(body).includes(cdn));
        } finally {
          fs.unlinkSync(file);
          fs.rmdirSync(dir);
        }
      });
    }
  }
}

test('standalone status resolves the template persisted by the API', async () => {
  let handler;
  registerGenerateTools({ tool(name, ...args) { if (name === 'get_generation_status') handler = args.at(-1); } }, {
    async get(route) {
      if (route === '/v1/presets') return { presets: [{ id: preset, name: 'Character Sheet', thumbnail_url: thumbnail }] };
      if (route.includes('/status')) return { generation_id: 'saved-template', state: 'completed', result: {
        urls: [output], preset: { id: preset, name: 'Character Sheet' }, reference_images: [thumbnail],
      } };
      return { models: [] };
    },
  }, { apps: true });
  const result = await handler({ generation_id: 'saved-template' });
  assert.equal(result.structuredContent.settings.preset_thumbnail, thumbnail);
  assert.deepEqual(result.structuredContent.reference_images, [thumbnail]);
});
