'use strict';

// The 3-up video grid overlapped its own tiles. `.k-skel.video` is
// `aspect-ratio: 16/9` + `min-height: 120px`; with no definite width the ratio
// transfers the wrong way — a 196px auto-fill column wants 110px of height,
// min-height clamps it to 120px, and the ratio back-computes the width as
// 120 * 16/9 = 213px. Every tile overflowed its track onto the next one.
// Both halves of the fix are pinned here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { KOLBO_CSS } = require('../src/apps/theme');
const GENERATION_JS = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'apps', 'widgets', 'generation.js'), 'utf8');

test('k-skel pins its width so aspect-ratio cannot inflate it past the column', () => {
  const block = KOLBO_CSS.match(/\.k-skel\s*\{[^}]*\}/);
  assert.ok(block, '.k-skel rule missing');
  assert.match(block[0], /width:\s*100%/,
    '.k-skel must carry width:100% — without it min-height + aspect-ratio widen the tile and it overlaps its neighbour');
});

test('every grid routes its column count through gridCols (videos cap at 2 per row)', () => {
  const calls = GENERATION_JS.match(/k-gen-grid n' \+ [^+]+/g) || [];
  assert.ok(calls.length >= 3, 'expected several k-gen-grid render sites');
  for (const c of calls) {
    assert.ok(/gridCols\(|n1"/.test(c) || /n' \+ gridCols/.test(c),
      'raw column count in grid render site: ' + c.trim());
  }
});

test('gridCols caps video at 2 columns and images at 4', () => {
  // eslint-disable-next-line no-new-func
  const gridCols = new Function(
    GENERATION_JS.match(/function gridCols\(count, kind\) \{[\s\S]*?\n\}/)[0] + '; return gridCols;')();
  assert.equal(gridCols(3, 'video'), 2);
  assert.equal(gridCols(8, 'video'), 2);
  assert.equal(gridCols(3, 'image'), 3);
  assert.equal(gridCols(8, 'image'), 4);
});
