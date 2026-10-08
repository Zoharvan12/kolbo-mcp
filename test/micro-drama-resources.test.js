'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerSkillResources } = require('../src/skillResources');

test('MCP exposes the micro-drama router and every stage as readable resources', async () => {
  const resources = new Map();
  registerSkillResources({ resource(name, uri, metadata, read) { resources.set(uri, read); } });
  for (const rel of ['micro-drama.md', ...['chat', 'series-bible', 'writing', 'cast-locations-voices', 'shots-prompts', 'render-qa', 'edit-deliver'].map(name => `micro-drama/${name}.md`)]) {
    const uri = `kolbo://skill/references/workflows/${rel}`;
    assert.ok(resources.has(uri), `Missing ${uri}`);
    const result = await resources.get(uri)();
    assert.equal(result.contents[0].uri, uri);
    assert.ok(result.contents[0].text.length > 100);
  }
});
