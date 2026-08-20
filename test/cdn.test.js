const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteUrl, rewriteTree } = require('../src/cdn');

test('rewriteUrl: production origin → media.kolbo.ai', () => {
  const raw = 'https://kolboai-production.ams3.digitaloceanspaces.com/kolboai-media/visual-dna/images/6929be4f6ed537f05feab19b/temp-1787234820270/environment-sheet-1787234820270-27a510d9.jpg';
  assert.equal(
    rewriteUrl(raw),
    'https://media.kolbo.ai/kolboai-media/visual-dna/images/6929be4f6ed537f05feab19b/temp-1787234820270/environment-sheet-1787234820270-27a510d9.jpg',
  );
});

test('rewriteUrl: DO edge CDN → custom domain', () => {
  assert.equal(
    rewriteUrl('https://kolboai-production.ams3.cdn.digitaloceanspaces.com/kolboai-media/x.jpg'),
    'https://media.kolbo.ai/kolboai-media/x.jpg',
  );
});

test('rewriteTree does not rewrite upload_url or signed PUTs', () => {
  const origin = 'https://kolboai-production.ams3.digitaloceanspaces.com/kolboai-media/put.jpg';
  const out = rewriteTree({
    upload_url: origin,
    url: origin,
  });
  assert.equal(out.upload_url, origin);
  assert.equal(out.url, 'https://media.kolbo.ai/kolboai-media/put.jpg');
});

test('rewriteTree walks MCP visual-dna payloads', () => {
  const out = rewriteTree({
    character_sheet_url: 'https://kolboai-production.ams3.digitaloceanspaces.com/kolboai-media/x.jpg',
    urls: ['https://kolboai-development.ams3.digitaloceanspaces.com/kolboai-media/y.jpg'],
  });
  assert.equal(out.character_sheet_url, 'https://media.kolbo.ai/kolboai-media/x.jpg');
  assert.equal(out.urls[0], 'https://media-dev.kolbo.ai/kolboai-media/y.jpg');
});
