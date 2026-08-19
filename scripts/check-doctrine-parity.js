#!/usr/bin/env node
/**
 * check-doctrine-parity.js — the same fact, stated in several places, must not drift.
 *
 * WHY THIS EXISTS (2026-08-19). The production doctrine lives on five surfaces:
 * the canonical skill (kolbo-code), its generated mirror in `skill/`, this
 * package's tool descriptions, kolbo-api's systemPrompt.js, and the help
 * widget's prompts. Only ONE of those links is automated (canonical -> mirror).
 * The rest were held together by a `<!-- PARITY -->` comment, and they drifted:
 *
 *   - "Dialogue may be in ANY language (Hebrew included)" was false — Hebrew
 *     does not work at all — and lived in THREE places. An agent read it and
 *     offered a user "Hebrew dialogue directly (Recommended)".
 *   - The Seedance 2.5 prompt cap was documented as 30,000 characters in NINE
 *     places, one marked "do not contradict". The catalog says 15,000. We were
 *     advertising double the real budget; a prompt written to that ceiling gets
 *     rejected or truncated.
 *   - `sound_generation_type: "none"` was never explained, so a planner read it
 *     as "silent" and routed dialogue the model performs itself through TTS +
 *     lipsync — the single most expensive planning mistake available.
 *
 * Every one of those was a doc claim that no test could see. This is the test.
 *
 * Offline assertions ALWAYS run so CI cannot flake. Catalog verification (the
 * part that would have caught 30,000 vs 15,000) runs only when KOLBO_API_KEY is
 * present, and says loudly when it is skipped — a silent skip is how a guard
 * quietly stops guarding.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'skill');
const TOOLS_DIR = path.join(ROOT, 'src', 'tools');

/* --------------------------------------------------------------- surfaces */

function walk(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, test, out);
    else if (test(entry.name)) out.push(full);
  }
  return out;
}

const surfaces = [
  ...walk(SKILL_DIR, (n) => n.endsWith('.md')),
  ...walk(TOOLS_DIR, (n) => n.endsWith('.js')),
].map((file) => ({ file: path.relative(ROOT, file), text: fs.readFileSync(file, 'utf8') }));

assert.ok(surfaces.length > 20, `expected the skill mirror + tools to be present, found ${surfaces.length} files`);

// A banned claim and the rule BANNING it share vocabulary: "Never offer a user
// 'Hebrew dialogue directly'" contains the very phrase it forbids. Match per
// LINE and ignore any line that negates itself, or this guard fails on the fix.
const NEGATED = /\b(never|not|no longer|does not|do not|cannot|avoid|instead of|rather than|was documented|used to)\b/i;

function claimHits(re) {
  const found = [];
  for (const s of surfaces) {
    const bad = s.text.split(/\r?\n/).some((line) => {
      const m = line.match(re);
      if (!m) return false;
      // Only the words leading INTO the match may negate it. Testing the whole
      // line let "…is 15,000. It was documented as 30,000 for months" excuse a
      // genuine 30,000 claim sitting earlier on that same line — which is how
      // this guard passed its own regression test the first time it was run.
      // Look BOTH ways. "other languages, Hebrew included, are not reliably
      // performed" negates AFTER the match; "never offer Hebrew dialogue
      // directly" negates BEFORE it. Checking one side flagged the correct
      // wording as a violation.
      const around = line.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      return !NEGATED.test(around);
    });
    if (bad) found.push(s.file);
  }
  return found;
}

/* ------------------------------------------------- 1. claims that are FALSE */
//
// Each entry killed a real generation plan. A match means some surface is
// teaching the model something the models cannot do.

const BANNED = [
  {
    re: /(any|all|every)\s+languages?[^.\n]{0,40}Hebrew|Hebrew\s+dialogue\s+directly|dialogue\s+in\s+Hebrew\s+directly/i,
    why: 'Seedance does not perform Hebrew — it returns accented gibberish or English-shaped mouth movement. '
       + 'This exact claim made an agent recommend "Hebrew dialogue directly" to a user.',
  },
  {
    re: /30,000[- ]character|30,000 characters|cap 30000|≤30,000 characters/i,
    why: 'The Seedance 2.5 prompt cap is 15,000 characters (2.0 is 10,000) — `max_prompt_length` in the catalog. '
       + '30,000 was documented for months and is double the real budget.',
  },
];

for (const { re, why } of BANNED) {
  const found = claimHits(re);
  assert.deepStrictEqual(found, [], `\n  FALSE CLAIM still present in: ${found.join(', ')}\n  ${why}\n`);
}

/* ------------------------------------------- 2. rules that MUST be present */
//
// The inverse failure: a true rule that exists in one surface and not the
// others. Tool descriptions matter most — they are what an LLM reads when no
// skill is loaded at all.

const generate = fs.readFileSync(path.join(TOOLS_DIR, 'generate.js'), 'utf8');

const REQUIRED = [
  {
    where: 'src/tools/generate.js',
    text: generate,
    re: /generate_speech[\s\S]{0,4000}?(NOT the route for|not the route for)[\s\S]{0,400}?dialogue/i,
    why: 'generate_speech must state it is not the route for scene dialogue. Without it, a planner with no skill '
       + 'loaded reaches for TTS and pays twice for a voice the video model already performs.',
  },
  {
    where: 'src/tools/generate.js',
    text: generate,
    re: /sound_generation_type[\s\S]{0,600}?(sound_baked_in|still emit|does not mean|NOT mean|never a reason)/i,
    why: 'The catalog reports sound_generation_type:"none" for Seedance 2/2.5 (there is no in-app toggle; '
       + 'sound_baked_in is true). Unexplained, that field reads as "silent" and sends the planner to TTS.',
  },
];

for (const { where, text, re, why } of REQUIRED) {
  assert.ok(re.test(text), `\n  MISSING RULE in ${where}\n  ${why}\n`);
}

// The asset-first flow has to be reachable, not merely written down.
const skillMd = path.join(SKILL_DIR, 'SKILL.md');
if (fs.existsSync(skillMd)) {
  const core = fs.readFileSync(skillMd, 'utf8');
  assert.ok(
    fs.existsSync(path.join(SKILL_DIR, 'references', 'workflows', 'production-planning.md')),
    'skill/references/workflows/production-planning.md is missing — the asset-first doctrine has no home',
  );
  assert.ok(
    /production-planning\.md/.test(core),
    'SKILL.md does not route to production-planning.md. A reference nothing points at is a reference nobody reads — '
    + 'this is exactly how the Seedance length guidance went unused while the inline shape got followed.',
  );
}

/* ------------------------------------ 3. one number, stated the same everywhere */
//
// Drift usually starts as one surface being updated and the others not. Any
// prompt-cap figure that appears anywhere must agree with every other one.

const CAP_RE = /prompt[^.\n]{0,40}?cap[^.\n]{0,40}?([\d,]{4,7})\s*characters/gi;
const caps = new Map();
for (const s of surfaces) {
  for (const m of s.text.matchAll(CAP_RE)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (!caps.has(n)) caps.set(n, []);
    caps.get(n).push(s.file);
  }
}
if (caps.size > 1) {
  const detail = [...caps.entries()].map(([n, files]) => `    ${n} in ${files.join(', ')}`).join('\n');
  assert.fail(`\n  CONFLICTING prompt caps stated across surfaces:\n${detail}\n`);
}

/* ------------------------------------------- 4. the catalog is the authority */
//
// The offline checks above only prove the surfaces AGREE. They cannot prove the
// agreed number is TRUE — 30,000 was perfectly consistent for months. Only the
// live catalog settles that.

// The cap the DOCS actually state, extracted above — not a constant restated
// here. Comparing a hardcoded copy against the catalog is theatre: the docs
// could drift to any number and both sides of the assertion would still agree.
// This check shipped that way for one revision, and its own regression test
// caught it — a 12,000 in the docs passed clean.
const DOCUMENTED_CAP = caps.size === 1 ? [...caps.keys()][0] : null;
const CAP_MODEL = 'seedance-2-5';

async function verifyAgainstCatalog() {
  const Client = require('../src/client');
  let client;
  try {
    client = new Client();          // env var OR the auth store, same as every other tool
    if (!client.apiKey) throw new Error('no credentials');
  } catch (_) {
    console.log('[doctrine-parity] NOTE: no API credentials — skipped the live catalog check.');
    console.log('[doctrine-parity]       Offline consistency passed, but a number every surface agrees on');
    console.log('[doctrine-parity]       can still be wrong. Run authenticated before publishing.');
    return false;
  }
  const res = await client.get('/v1/models?type=elements&limit=500');
  const byId = new Map((res.models || []).map((m) => [m.identifier, m]));

  const model = byId.get(CAP_MODEL);
  if (!model) {
    console.log(`[doctrine-parity] ${CAP_MODEL} not in the catalog right now — skipping the cap check.`);
  } else if (DOCUMENTED_CAP === null) {
    console.log('[doctrine-parity] no prompt cap stated in any surface — nothing to verify.');
  } else {
    assert.strictEqual(
      DOCUMENTED_CAP, model.max_prompt_length,
      `\n  ${CAP_MODEL}: the docs state ${DOCUMENTED_CAP} characters, the catalog says ${model.max_prompt_length}.\n`
      + '  The catalog wins. Update every surface that states it, not just the one you noticed.\n',
    );
  }
  return true;
}

verifyAgainstCatalog()
  .then((online) => {
    console.log(`[doctrine-parity] OK — ${surfaces.length} surfaces carry no false claims and agree on the numbers`
      + `${online ? ', verified against the live catalog' : ' (offline only)'}.`);
  })
  .catch((err) => {
    console.error('[doctrine-parity] FAILED:', err.message);
    process.exit(1);
  });
