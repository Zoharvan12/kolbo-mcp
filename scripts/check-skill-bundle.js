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
  'references/workflows/micro-drama.md',
  'references/workflows/micro-drama/chat.md',
  'references/workflows/micro-drama/series-bible.md',
  'references/workflows/micro-drama/writing.md',
  'references/workflows/micro-drama/cast-locations-voices.md',
  'references/workflows/micro-drama/shots-prompts.md',
  'references/workflows/micro-drama/render-qa.md',
  'references/workflows/micro-drama/edit-deliver.md',
  'scripts/micro-drama/cut.py',
  'scripts/micro-drama/media.py',
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

// skills/: the Kobi Code app skill set, mirrored from kolbo-code/packages/opencode/skills/<name> (all but kolbo).
const apps = path.join(root, 'skills');
let appSkills = 0;
if (fs.existsSync(apps)) {
  assert(fs.existsSync(path.join(apps, 'GENERATED.md')), 'skills/GENERATED.md provenance marker is missing');
  assert(!fs.existsSync(path.join(apps, 'kolbo')), 'skills/kolbo must not exist: the kolbo skill ships only in skill/');
  for (const name of fs.readdirSync(apps)) {
    if (name === 'GENERATED.md') continue;
    const file = path.join(apps, name, 'SKILL.md');
    assert(fs.existsSync(file), `skills/${name}/SKILL.md is missing`);
    const head = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert(head && /^description:/m.test(head[1]), `skills/${name}/SKILL.md needs frontmatter with a description`);
    appSkills++;
  }
}

console.log(`App skills: ${appSkills}.`);
console.log(`Skill bundle check OK — canonical kolbo skill v${version} is complete and provenance-marked.`);
