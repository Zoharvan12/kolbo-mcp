#!/usr/bin/env node
/**
 * check-skill-tools.js — the skill tree is what teaches the LLM which tools to
 * call. If it names a tool that isn't registered, the agent calls it and the
 * user sees "tool not found" — the single worst first-run experience, and one
 * that no amount of testing the SERVER catches, because the server is fine.
 *
 * Two directions, both real failures:
 *   PHANTOM  — skill names a tool the server does not register (agent breaks)
 *   UNTAUGHT — server registers a tool the skill never mentions (dead feature)
 *
 * Usage: node scripts/check-skill-tools.js [--skill <dir>]
 * Exit 1 on any phantom. Untaught tools warn only — not everything needs a
 * routing row, but a long list means the skill has drifted behind the server.
 */

const fs = require('fs');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const skillArg = argv.indexOf('--skill');
const SKILL_DIR = skillArg >= 0 && argv[skillArg + 1]
  ? path.resolve(argv[skillArg + 1])
  : path.join(PKG_ROOT, 'skill');

// Tools the skill may legitimately name without the server registering them:
// nothing today. Add here with a reason if that ever changes.
const ALLOWED_PHANTOMS = new Set([]);

// Registered tools that don't need a skill mention — internal/self-evident.
const UNTAUGHT_OK = new Set([]);

// Backticked snake_case identifiers that are RESPONSE fields, not tools. Args
// and enum values are harvested from the schemas automatically; response shapes
// can't be introspected, so they live here.
const NOT_TOOLS = new Set([
  'upload_url',   // field on create_upload_ticket's response
  'share_token',  // field on publish_html_artifact's response
  'session_id',   // returned by generation tools
  'generation_id',
  'deployment_url',
]);

function inspectServer() {
  process.env.KOLBO_API_KEY = process.env.KOLBO_API_KEY || 'check-skill-dummy';
  const { createServer } = require(path.join(PKG_ROOT, 'src', 'index.js'));
  const reg = createServer()._registeredTools || {};
  // Arg names share the snake_case shape of tool names (`media_urls`,
  // `upload_url`), so name-shape alone can't tell them apart. Harvest the real
  // arg names off the schemas and exclude them — precise, and self-maintaining
  // as tools change.
  const args = new Set();
  for (const tool of Object.values(reg)) {
    const shape = tool.inputSchema && tool.inputSchema.shape;
    if (!shape) continue;
    for (const [k, v] of Object.entries(shape)) {
      args.add(k);
      // Enum VALUES look exactly like tool names too — `remove_background` is an
      // edit_video operation, not a tool. Unwrap optional/default/array
      // wrappers to reach the underlying enum.
      let node = v;
      for (let depth = 0; node && node._def && depth < 6; depth++) {
        const d = node._def;
        if (Array.isArray(d.values)) { for (const val of d.values) args.add(String(val)); break; }
        node = d.innerType || d.type || d.schema || null;
      }
    }
  }
  return { tools: new Set(Object.keys(reg)), args };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function main() {
  if (!fs.existsSync(SKILL_DIR)) {
    console.log(`No skill tree at ${SKILL_DIR} — nothing to check.`);
    process.exit(0);
  }

  const { tools: registered, args: argNames } = inspectServer();
  const files = walk(SKILL_DIR);

  // Only trust backticked identifiers — prose mentions a tool's name loosely
  // ("the generate tools"), and matching those produces noise, not findings.
  // A trailing _* is a documented family (e.g. `bulk_*_media`), expand to a test.
  const mentions = new Map(); // tool -> Set(file)
  const reTick = /`([a-z][a-z0-9_]*(?:_\*)?[a-z0-9_*]*)`/g;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = reTick.exec(src)) !== null) {
      const name = m[1];
      // Heuristic: tool names are snake_case with at least one underscore, and
      // are not obviously an arg (args appear as `project_id`, `aspect_ratio`).
      if (!name.includes('_')) continue;
      if (!mentions.has(name)) mentions.set(name, new Set());
      mentions.get(name).add(path.relative(SKILL_DIR, file));
    }
  }

  // A mention is a TOOL reference if it matches a registered tool, or if it
  // looks like a tool family/verb-led name that no registered tool satisfies.
  const VERBS = /^(list|get|create|update|delete|generate|edit|search|browse|import|upload|move|share|unshare|publish|analyze|transcribe|check|clone|trim|favorite|unfavorite|archive|unarchive|activate|deactivate|add|remove|bulk|restore|permanently|regenerate|chat|acquire|media|app|shorts|resolve)_/;

  const phantoms = [];
  for (const [name, where] of mentions) {
    if (registered.has(name)) continue;
    if (ALLOWED_PHANTOMS.has(name)) continue;
    if (argNames.has(name) || NOT_TOOLS.has(name)) continue; // arg, enum value, or response field
    if (!VERBS.test(name)) continue;

    // Wildcard family: `bulk_*_media` / `app_builder_*` — satisfied if ANY
    // registered tool matches the pattern.
    if (name.includes('*')) {
      const re = new RegExp('^' + name.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      if ([...registered].some(t => re.test(t))) continue;
    }
    phantoms.push({ name, where: [...where] });
  }

  const mentionedNames = new Set([...mentions.keys()]);
  const untaught = [...registered]
    .filter(t => !mentionedNames.has(t) && !UNTAUGHT_OK.has(t))
    .filter(t => ![...mentionedNames].some(n => n.includes('*') &&
      new RegExp('^' + n.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(t)));

  console.log(`Skill tree:        ${path.relative(PKG_ROOT, SKILL_DIR) || SKILL_DIR}`);
  console.log(`Markdown files:    ${files.length}`);
  console.log(`Registered tools:  ${registered.size}\n`);

  if (phantoms.length) {
    console.log(`\x1b[31mPHANTOM — skill names ${phantoms.length} tool(s) the server does NOT register:\x1b[0m`);
    for (const p of phantoms) console.log(`  ✗ ${p.name}  (in: ${p.where.join(', ')})`);
    console.log('\n  The agent will call these and get "tool not found". Remove them from the');
    console.log('  skill, or register the tool.\n');
  } else {
    console.log('\x1b[32m✓ No phantom tools — every tool the skill names is registered.\x1b[0m\n');
  }

  if (untaught.length) {
    console.log(`\x1b[33m⚠ ${untaught.length} registered tool(s) never mentioned in the skill:\x1b[0m`);
    console.log('  ' + untaught.join(', '));
    console.log('  (Not fatal — but the LLM has no routing guidance for these.)\n');
  } else {
    console.log('\x1b[32m✓ Every registered tool appears somewhere in the skill.\x1b[0m\n');
  }

  process.exit(phantoms.length ? 1 : 0);
}

main();
