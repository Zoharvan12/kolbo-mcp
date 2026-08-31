/**
 * `description` must be accepted wherever `prompt_helper` is.
 *
 * Every Visual DNA tool REPORTS the notes field as `description` — create returns it,
 * get_visual_dna returns it, list_visual_dnas puts it in the compact list. So a caller
 * that reads a DNA and writes it back naturally passes `description`. The zod object
 * schema strips unknown keys silently, so that text was dropped on the floor: the call
 * returned 200 with the old notes intact and nothing said the edit had not landed.
 *
 * Accepting the alias is what keeps the read shape and the write shape the same name.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'tools', 'visual_dna.js'),
  'utf8'
);

const toolBlock = (name) => {
  const start = src.indexOf(`'${name}',`);
  assert.notEqual(start, -1, `could not find tool ${name}`);
  const next = src.indexOf('server.tool(', start);
  return next === -1 ? src.slice(start) : src.slice(start, next);
};

for (const name of ['create_visual_dna', 'update_visual_dna']) {
  test(`${name} accepts description as an alias for prompt_helper`, () => {
    const block = toolBlock(name);

    // Declared in the schema, or zod strips it before the handler ever sees it.
    assert.match(block, /description: z\.string\(\)\.optional\(\)/,
      `${name} dropped the description alias from its schema`);

    // Destructured, coalesced, and it is the coalesced value that gets sent —
    // not the raw prompt_helper, which is what made the alias a no-op before.
    assert.match(block, /prompt_helper, description,/,
      `${name} stopped destructuring description`);
    assert.match(block, /const helper = prompt_helper !== undefined \? prompt_helper : description;/,
      `${name} stopped coalescing description into prompt_helper`);
    assert.doesNotMatch(block, /form\.append\('promptHelper', prompt_helper\)/,
      `${name} sends the raw prompt_helper again, so description is ignored`);
    assert.match(block, /form\.append\('promptHelper', helper\)/,
      `${name} no longer sends the coalesced value`);
  });
}

test('update gates its metadata-only path on the coalesced value', () => {
  const block = toolBlock('update_visual_dna');
  // hasMeta decides whether a description-only edit is even sent. Checking
  // prompt_helper here would reject `{description}` as "nothing to update".
  assert.match(block, /const hasMeta = name !== undefined \|\| dna_type !== undefined \|\| helper !== undefined/);
  assert.match(block, /if \(helper !== undefined\) body\.prompt_helper = helper;/);
});
