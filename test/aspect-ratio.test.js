'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { closestAspectRatio, normalizeAspectRatio, resolveCatalogAspectRatio } = require('../src/apps');

const SOUL = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2'];
const SEEDANCE = ['21:9', '16:9', '9:16', '1:1'];

test('normalizeAspectRatio: punctuation and aliases', () => {
  assert.equal(normalizeAspectRatio('21/9'), '21:9');
  assert.equal(normalizeAspectRatio('21x9'), '21:9');
  assert.equal(normalizeAspectRatio(' 16 : 9 '), '16:9');
  assert.equal(normalizeAspectRatio('widescreen'), '16:9');
  assert.equal(normalizeAspectRatio('portrait'), '9:16');
  assert.equal(normalizeAspectRatio('ultrawide'), '21:9');
  assert.equal(normalizeAspectRatio('AUTO'), 'auto');
});

test('closestAspectRatio: Soul 21:9 snaps to 16:9', () => {
  assert.equal(closestAspectRatio('21:9', SOUL), '16:9');
  assert.equal(closestAspectRatio('21/9', SOUL), '16:9');
  assert.equal(closestAspectRatio('ultrawide', SOUL), '16:9');
});

test('closestAspectRatio: Soul 9:21 snaps to 9:16', () => {
  assert.equal(closestAspectRatio('9:21', SOUL), '9:16');
  assert.equal(closestAspectRatio('portrait', SOUL), '9:16');
});

test('closestAspectRatio: exact match is unchanged', () => {
  assert.equal(closestAspectRatio('3:4', SOUL), '3:4');
});

test('closestAspectRatio: a model that publishes 21:9 keeps it', () => {
  assert.equal(closestAspectRatio('21:9', SEEDANCE), '21:9');
  assert.equal(closestAspectRatio('ultrawide', SEEDANCE), '21:9');
});

test('closestAspectRatio: auto and adaptive pass through', () => {
  assert.equal(closestAspectRatio('auto', SOUL), 'auto');
  assert.equal(closestAspectRatio('adaptive', SOUL), 'adaptive');
});

test('closestAspectRatio: empty catalog still normalizes', () => {
  assert.equal(closestAspectRatio('21/9', []), '21:9');
  assert.equal(closestAspectRatio('21:9', null), '21:9');
});

test('closestAspectRatio: Cast-only 16:9 snaps everything wide to 16:9', () => {
  assert.equal(closestAspectRatio('21:9', ['16:9']), '16:9');
  assert.equal(closestAspectRatio('1:1', ['16:9']), '16:9');
});

test('resolveCatalogAspectRatio: snaps any image/video model from catalog', async () => {
  const client = {
    apiBase: `test-aspects-any-model-${Date.now()}`,
    async request() {
      return {
        models: [
          {
            identifier: 'higgsfield-ai/soul/v2/standard',
            name: 'Higgsfield Soul V2',
            type: 'text_to_img',
            supported_aspect_ratios: SOUL,
          },
          {
            identifier: 'seedance-2',
            name: 'Seedance 2',
            types: ['text_to_video', 'img_to_video'],
            supported_aspect_ratios: SEEDANCE,
            supported_aspect_ratios_by_type: { text_to_video: SEEDANCE, img_to_video: ['16:9', '9:16'] },
          },
        ],
      };
    },
  };

  assert.equal(
    await resolveCatalogAspectRatio(client, 'higgsfield-ai/soul/v2/standard', '21:9', 'text_to_img'),
    '16:9',
  );
  assert.equal(
    await resolveCatalogAspectRatio(client, 'Higgsfield Soul V2', '21/9', 'text_to_img'),
    '16:9',
  );
  assert.equal(
    await resolveCatalogAspectRatio(client, 'seedance-2', '21:9', 'text_to_video'),
    '21:9',
  );
  assert.equal(
    await resolveCatalogAspectRatio(client, 'seedance-2', '21:9', 'img_to_video'),
    '16:9',
  );
  assert.equal(
    await resolveCatalogAspectRatio(client, 'unknown-hidden-id', '21/9', 'text_to_img'),
    '21:9',
  );
  assert.equal(
    await resolveCatalogAspectRatio(client, 'higgsfield-ai/soul/v2/standard', 'auto', 'text_to_img'),
    'auto',
  );
});

test('every image/video generate tool that takes aspect_ratio snaps it', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/tools/generate.js'), 'utf8');
  const tools = [...src.matchAll(/server\.tool\(\s*'([^']+)'/g)].map((m) => ({
    name: m[1],
    index: m.index,
  }));
  const missing = [];
  for (let i = 0; i < tools.length; i++) {
    const start = tools[i].index;
    const end = i + 1 < tools.length ? tools[i + 1].index : src.length;
    const body = src.slice(start, end);
    if (!/\baspect_ratio\b/.test(body)) continue;
    if (!body.includes('resolveCatalogAspectRatio')) missing.push(tools[i].name);
  }
  assert.deepEqual(missing, [], `tools take aspect_ratio but never snap it: ${missing.join(', ')}`);
});
