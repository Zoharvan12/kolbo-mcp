#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'skill');
const core = path.join(dir, 'SKILL.md');
const versionFile = path.join(dir, 'VERSION');
const generated = path.join(dir, 'GENERATED.md');

assert(fs.existsSync(core), 'skill/SKILL.md is missing');
assert(fs.existsSync(versionFile), 'skill/VERSION is missing');
assert(fs.existsSync(generated), 'skill/GENERATED.md provenance marker is missing');

const text = fs.readFileSync(core, 'utf8');
const version = fs.readFileSync(versionFile, 'utf8').trim();
const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
assert(frontmatter, 'skill/SKILL.md must start with YAML frontmatter');
assert(/^name:\s*kolbo\s*$/m.test(frontmatter[1]), 'skill name must be kolbo');
assert(new RegExp(`^version:\\s*${version.replace(/\./g, '\\.')}\\s*$`, 'm').test(frontmatter[1]), 'SKILL.md version must match skill/VERSION');
assert(text.split(/\r?\n/).length <= 500, 'SKILL.md exceeds the 500-line hard package limit');

for (const rel of [
  'references/workflows/filmmaking.md',
  'references/models/seedance25.md',
  'references/filmmaking/blocking-continuity.md',
  'assets/filmmaking/production-bible.template.json',
  'scripts/filmmaking/lint_prompt.py',
]) {
  assert(fs.existsSync(path.join(dir, rel)), `canonical skill file missing from package: ${rel}`);
}

const provenance = fs.readFileSync(generated, 'utf8');
assert(/kolbo-code@[0-9a-f]{7,40}/.test(provenance), 'GENERATED.md must name the canonical kolbo-code commit');
assert(provenance.includes('single source of truth'), 'GENERATED.md must identify kolbo-code as the single source of truth');

console.log(`Skill bundle check OK — canonical kolbo skill v${version} is complete and provenance-marked.`);
