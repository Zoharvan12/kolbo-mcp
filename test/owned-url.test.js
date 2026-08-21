const test = require('node:test');
const assert = require('node:assert/strict');
const { ownedUrl } = require('../src/tools/owned-url');

test('ownedUrl: Kolbo CDN and Spaces are already hosted', () => {
  assert.equal(ownedUrl('https://media.kolbo.ai/kolboai-media/gen/shot.png'), true);
  assert.equal(ownedUrl('https://media-dev.kolbo.ai/x.jpg'), true);
  assert.equal(ownedUrl('https://app.kolbo.ai/unused'), true);
  assert.equal(ownedUrl('https://kolboai-production.ams3.digitaloceanspaces.com/kolboai-media/x.jpg'), true);
});

test('ownedUrl: local paths and foreign hosts are not hosted', () => {
  assert.equal(ownedUrl('C:/Users/me/shot.png'), false);
  assert.equal(ownedUrl('/tmp/shot.png'), false);
  assert.equal(ownedUrl('https://cdn.example.com/shot.png'), false);
  assert.equal(ownedUrl(''), false);
});
