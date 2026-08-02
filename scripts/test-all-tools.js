#!/usr/bin/env node
/**
 * test-all-tools.js — call EVERY registered MCP tool with a hard deadline and
 * report which ones hang, error, or return a payload too big for a host.
 *
 * The other test-*.js scripts hit kolbo-api ROUTES. This one drives the actual
 * registered tool callbacks, so it catches the failures users see: a tool that
 * never returns, and a tool that returns 128KB and blows the host's context.
 *
 * Tiers (opt in — default is read-only and free):
 *   read   list_/get_/search_/browse_/check_/*_estimate      — free, no writes
 *   write  create_/update_/delete_/move_/share_/bulk_...     — mutates data   (--write)
 *   spend  generate_/edit_/transcribe_/chat_send_message...  — costs credits  (--spend)
 *
 * Usage:
 *   KOLBO_API_KEY=kolbo_live_... node scripts/test-all-tools.js
 *   KOLBO_API_KEY=... node scripts/test-all-tools.js --deadline 60 --only list_media,get_media
 *   KOLBO_API_KEY=... node scripts/test-all-tools.js --write        # includes mutations
 *
 * Exit code is non-zero if any tool in the selected tiers hung or errored.
 *
 * Reading the results: HANG and OVERSIZE are always real. THROW needs a glance
 * first — tools with required args the bootstrap can't synthesize (a script, a
 * chat session id, a creative-director generation id) report a validation error
 * that is the tool working correctly. Treat a THROW as a finding only when the
 * bootstrap supplied a real id and it still failed, or the status is 5xx.
 */

const { createServer } = require('../src/index.js');

// ─── args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const DEADLINE_MS = Number(opt('deadline', 45)) * 1000;
const ONLY = opt('only', '') ? opt('only', '').split(',').map((s) => s.trim()) : null;
const TIERS = new Set(['read', ...(flag('write') ? ['write'] : []), ...(flag('spend') ? ['spend'] : [])]);
// A payload past this is a practical failure: hosts truncate or spill it to disk.
const OVERSIZE_CHARS = Number(opt('oversize', 20000));

// Auth resolves the same way the real server does: KOLBO_API_KEY, else the CLI
// auth store written by `kolbo auth login`. Requiring the env var specifically
// made this refuse to run on a machine that was already signed in.
if (!process.env.KOLBO_API_KEY) {
  const KolboClient = require('../src/client.js');
  let resolved = null;
  try { resolved = new KolboClient({ allowBrowserLogin: false }).apiKey; } catch (_) {}
  if (!resolved) {
    console.error('No Kolbo credentials. Set KOLBO_API_KEY, or run `kolbo auth login`.');
    process.exit(1);
  }
  console.log('Using credentials from the CLI auth store.\n');
}

// ─── tiering ─────────────────────────────────────────────────────────────────

const SPEND = /^(generate_|edit_|transcribe_|clone_voice|acquire_clean_music_track|import_music_track|chat_send_message|trim_video)/;
const WRITE = /^(create_|update_|delete_|move_|share_|unshare_|favorite_|unfavorite_|archive_|unarchive_|activate_|deactivate_|add_|remove_|bulk_|restore_|permanently_|publish_|import_|upload_|regenerate_|media_upload_widget)/;

const tierOf = (name) => (SPEND.test(name) ? 'spend' : WRITE.test(name) ? 'write' : 'read');

// ─── context pool: real ids so required args aren't garbage ──────────────────
//
// Calling get_media with a fake id tests the 404 path, not the tool. Bootstrap
// pulls real ids from the list_* tools first, then fills required args from here.

const ctx = {};

const BOOTSTRAP = [
  ['list_projects', {}, (r) => ({ project_id: pick(r, 'id') })],
  ['list_media', { page_size: 5 }, (r) => ({ media_id: pick(r, 'id') })],
  ['list_media_folders', {}, (r) => ({ folder_id: pick(r, 'id') })],
  ['list_visual_dnas', { scope: 'personal' }, (r) => ({ visual_dna_id: pick(r, 'id') })],
  ['list_visual_dna_folders', {}, (r) => ({ dna_folder_id: pick(r, 'id') })],
  ['list_moodboards', { scope: 'personal' }, (r) => ({ moodboard_id: pick(r, 'id') })],
  ['list_color_palettes', {}, (r) => ({ color_palette_id: pick(r, 'id') })],
  ['list_voices', {}, (r) => ({ voice_id: pick(r, 'id') })],
  ['list_agents', {}, (r) => ({ agent_id: pick(r, 'id') })],
  ['list_docs', { limit: 5 }, (r) => ({ doc_id: pick(r, 'id') })],
  ['list_sessions', { limit: 5 }, (r) => ({ session_id: pick(r, 'id') })],
  ['browse_music_library', { limit: 1 }, (r) => ({ track_id: pick(r, 'id') })],
];

// The tool results are text blobs (JSON or widget envelopes). Grab the first
// plausible id rather than modelling every response shape.
function pick(text, key) {
  const m = String(text).match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
  return m ? m[1] : null;
}

// Required-arg fills, by arg name. Anything unmapped stays undefined and the
// tool reports a validation error — which is itself a useful signal.
const ARG_FILL = {
  project_id: () => ctx.project_id,
  media_id: () => ctx.media_id,
  id: () => ctx.media_id,
  folder_id: () => ctx.folder_id,
  visual_dna_id: () => ctx.visual_dna_id,
  moodboard_id: () => ctx.moodboard_id,
  color_palette_id: () => ctx.color_palette_id,
  voice_id: () => ctx.voice_id,
  agent_id: () => ctx.agent_id,
  doc_id: () => ctx.doc_id,
  session_id: () => ctx.session_id,
  track_id: () => ctx.track_id,
  generation_id: () => ctx.generation_id,
  query: () => 'ocean',
  q: () => 'ocean',
  limit: () => 2,
  page_size: () => 2,
};

// ─── runner ──────────────────────────────────────────────────────────────────

function requiredArgs(tool) {
  const shape = tool.inputSchema && tool.inputSchema.shape;
  if (!shape) return [];
  return Object.entries(shape)
    .filter(([, v]) => !(v && typeof v.isOptional === 'function' && v.isOptional()))
    .map(([k]) => k);
}

function buildArgs(tool) {
  const args = {};
  for (const key of requiredArgs(tool)) {
    const fill = ARG_FILL[key];
    if (fill) {
      const v = fill();
      if (v !== undefined && v !== null) args[key] = v;
    }
  }
  // Always cap list sizes when the tool accepts it — an uncapped list is how a
  // "working" tool still ruins a host context.
  const shape = (tool.inputSchema && tool.inputSchema.shape) || {};
  if (shape.limit && args.limit === undefined) args.limit = 2;
  if (shape.page_size && args.page_size === undefined) args.page_size = 2;
  return args;
}

// The deadline is the whole point: an unresolved callback must not hang the run.
// Promise.race leaves the tool promise dangling — fine, we exit after the report.
function withDeadline(promise, ms) {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(Object.assign(new Error('DEADLINE'), { _deadline: true })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function textOf(result) {
  if (!result || !Array.isArray(result.content)) return '';
  return result.content.map((c) => (c && c.text) || '').join('');
}

async function callTool(tool, args) {
  // SDK stores the tool fn as `handler` (not `callback` — that's prompts/resources).
  const extra = { signal: new AbortController().signal, requestId: 'test-all-tools' };
  return tool.inputSchema ? tool.handler(args, extra) : tool.handler(extra);
}

async function main() {
  const server = createServer();
  const registered = server._registeredTools || {};
  const names = Object.keys(registered).sort();
  console.log(`Registered tools: ${names.length}\n`);

  // Bootstrap the id pool. Failures here are non-fatal — dependent tools just
  // report a missing-arg error instead of a false hang.
  for (const [name, args, extract] of BOOTSTRAP) {
    const tool = registered[name];
    if (!tool) continue;
    try {
      const res = await withDeadline(callTool(tool, args), DEADLINE_MS);
      Object.assign(ctx, Object.fromEntries(
        Object.entries(extract(textOf(res))).filter(([, v]) => v)
      ));
    } catch (_) { /* dependent tools will surface it */ }
  }
  console.log('Context: ' + (Object.keys(ctx).join(', ') || '(empty — dependent tools will fail)') + '\n');

  const rows = [];
  for (const name of names) {
    if (ONLY && !ONLY.includes(name)) continue;
    const tier = tierOf(name);
    if (!TIERS.has(tier)) { rows.push({ name, tier, status: 'SKIP', ms: 0, size: 0 }); continue; }

    const tool = registered[name];
    const args = buildArgs(tool);
    const t0 = Date.now();
    let status, size = 0, detail = '';
    try {
      const res = await withDeadline(callTool(tool, args), DEADLINE_MS);
      size = textOf(res).length;
      if (res && res.isError) { status = 'ERROR'; detail = textOf(res).slice(0, 120); }
      else if (size > OVERSIZE_CHARS) { status = 'OVERSIZE'; detail = `${size} chars`; }
      else status = 'OK';
    } catch (err) {
      status = err._deadline ? 'HANG' : 'THROW';
      detail = err._deadline ? `no response in ${DEADLINE_MS / 1000}s` : String(err.message).slice(0, 120);
    }
    const ms = Date.now() - t0;
    rows.push({ name, tier, status, ms, size, detail });
    const mark = { OK: '\x1b[32m✓\x1b[0m', OVERSIZE: '\x1b[33m▲\x1b[0m', ERROR: '\x1b[31m✗\x1b[0m', THROW: '\x1b[31m✗\x1b[0m', HANG: '\x1b[31m⏱\x1b[0m' }[status];
    console.log(`${mark} ${name.padEnd(34)} ${String(ms + 'ms').padStart(8)}  ${status}${detail ? '  ' + detail : ''}`);
  }

  const by = (s) => rows.filter((r) => r.status === s);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`ok ${by('OK').length}   oversize ${by('OVERSIZE').length}   error ${by('ERROR').length + by('THROW').length}   hang ${by('HANG').length}   skipped ${by('SKIP').length}`);

  for (const label of ['HANG', 'OVERSIZE', 'ERROR', 'THROW']) {
    const list = by(label);
    if (list.length) console.log(`\n${label}:\n` + list.map((r) => `  ${r.name} — ${r.detail}`).join('\n'));
  }

  // Dangling tool promises from HANG rows keep the loop alive; report is done.
  process.exit(by('HANG').length + by('ERROR').length + by('THROW').length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
