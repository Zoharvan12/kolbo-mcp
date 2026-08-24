#!/usr/bin/env node
/**
 * check-widget-fields.js
 *
 * Companion to check-parity.js. That script checks that MCP tools call routes
 * the SDK actually exposes; this one checks that the widget mappers read FIELD
 * NAMES the SDK actually returns.
 *
 * Why this exists: every media-grid widget renders from `thumbnail` and
 * `preview_audio`. Four mappers were reading keys the SDK never emits
 * (`p.thumbnail` vs `thumbnail_url`, `p.audio_preview_url` vs `audio_url`,
 * `mb.image_urls` vs `images`). JSON.stringify silently drops undefined, so
 * there was no error anywhere — the tools just returned tiles with no image,
 * and every Kolbo widget in Claude Desktop rendered as a blank grey box.
 * A route-level parity check cannot catch that. This one can.
 *
 *   node scripts/check-widget-fields.js
 *
 * Exits 1 if a mapper reads a field the SDK controller does not emit.
 */

const fs = require('fs');
const path = require('path');

const MCP_REPO = path.resolve(__dirname, '..');
const KOLBO_API = process.env.KOLBO_API_PATH
  || path.resolve(MCP_REPO, '..', 'kolbo-api');
const SDK_CONTROLLER = path.join(KOLBO_API, 'src', 'modules', 'sdk', 'controller.js');

// tool file → { exportName: the sdk controller fn that shapes the response,
//               reads: field names the widget mapper pulls off each item }
// Keep `reads` in sync when you add a field to a media-grid mapper.
const CONTRACTS = [
  { file: 'src/tools/presets.js',       exportName: 'listPresets',    reads: ['thumbnail_url', 'audio_url'] },
  { file: 'src/tools/visual_dna.js',    exportName: 'listVisualDnas', reads: ['thumbnail_url'] },
  { file: 'src/tools/moodboards.js',    exportName: 'listMoodboards', reads: ['thumbnail_url', 'images'] },
  { file: 'src/tools/voices.js',        exportName: 'listVoices',     reads: ['thumbnail', 'preview_url'] },
  { file: 'src/tools/media.js',         exportName: 'listMedia',      reads: ['thumbnail_url'] },
  // Not a media grid: the generation card resolves the model/voice that ACTUALLY
  // RAN into a clean name + icon/portrait through these two catalogs (cached in
  // src/apps/index.js). If either stops emitting a field, the chip silently
  // regresses to the raw id ("google_tts", "he-IL-Chirp3-HD-Rasalgethi").
  { file: 'src/apps/index.js',          exportName: 'listVoices',     reads: ['voice_id', 'name', 'thumbnail'] },
  { file: 'src/apps/index.js',          exportName: 'listModels',     reads: ['identifier', 'name', 'avatar'] },
];

// CI clones only this repo, so there is no kolbo-api checkout to diff against.
// Skip with a warning instead of failing — matches check-parity.js, and local
// runs plus the prepublishOnly hook on a dev machine still enforce the check.
// (Hard-failing here broke the v1.51.0 npm publish.)
if (!fs.existsSync(SDK_CONTROLLER)) {
  console.log(`WARN: kolbo-api not found at ${SDK_CONTROLLER}`);
  console.log('Skipping widget field check (likely running in CI without the private kolbo-api repo).');
  console.log('Local runs will still enforce it via prepublishOnly.');
  process.exit(0);
}
const sdkSrc = fs.readFileSync(SDK_CONTROLLER, 'utf8');

/** Grab the body of `exports.<name> = async (...) => { ... }` up to the next top-level export. */
function sdkBody(exportName) {
  const start = sdkSrc.indexOf(`exports.${exportName} =`);
  if (start === -1) return null;
  const body = sdkSrc.slice(start, (() => {
    const next = sdkSrc.indexOf('\nexports.', start + 1);
    return next === -1 ? sdkSrc.length : next;
  })());
  // A responder can emit fields via a projection helper defined elsewhere in
  // the file (`..._sdkVisualDnaMedia(vd)`, `const media = _sdkVisualDnaMedia(vd)`)
  // — append the body of every locally-defined function the responder calls
  // (one level), so moving a field into a shared helper doesn't read as
  // "never emitted". Only names that resolve to a top-level `function NAME(`
  // in this same file are followed, so res.json / require / etc. are ignored.
  let out = body;
  const seen = new Set();
  for (const m of body.matchAll(/\b(_?[A-Za-z]\w*)\s*\(/g)) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const idx = sdkSrc.indexOf(`function ${name}(`);
    if (idx === -1) continue;
    const stops = [sdkSrc.indexOf('\nfunction ', idx + 1), sdkSrc.indexOf('\nexports.', idx + 1)]
      .filter((i) => i !== -1);
    out += sdkSrc.slice(idx, stops.length ? Math.min(...stops) : sdkSrc.length);
  }
  return out;
}

let failures = 0;

for (const { file, exportName, reads } of CONTRACTS) {
  const body = sdkBody(exportName);
  if (body === null) {
    console.error(`FAIL ${file}: kolbo-api no longer exports ${exportName} — mapper points at a dead responder.`);
    failures++;
    continue;
  }
  const toolSrc = fs.readFileSync(path.join(MCP_REPO, file), 'utf8');

  for (const field of reads) {
    // The SDK must emit it...
    if (!new RegExp(`\\b${field}\\s*:`).test(body)) {
      console.error(`FAIL ${file}: reads "${field}" but ${exportName} in kolbo-api never emits it.`);
      failures++;
    }
    // ...and the mapper must actually read it.
    if (!toolSrc.includes(field)) {
      console.error(`FAIL ${file}: declared contract field "${field}" is not read by the mapper.`);
      failures++;
    }
  }
}

if (failures) {
  console.error(`\n${failures} widget field mismatch(es). Widgets would render blank tiles.`);
  process.exit(1);
}
console.log(`Widget field parity OK (${CONTRACTS.length} mappers checked).`);
