const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('public MCP pricing guidance matches the API encoder-padding policy', () => {
  const sources = [
    read('skill/SKILL.md'),
    read('skill/references/workflows/cost-and-validation.md'),
    read('src/tools/generate.js'),
    read('src/tools/models.js'),
  ].join('\n');

  assert.match(sources, /0\.15s/);
  assert.match(sources, /nominal input/i);
  assert.doesNotMatch(sources, /sum\s*\(\s*ceil\s*\(\s*each input/i);
});
