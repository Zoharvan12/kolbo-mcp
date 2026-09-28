#!/usr/bin/env node
/**
 * check-tool-contract.js — tool names are a public contract; they only grow.
 *
 * claude.ai / ChatGPT cache a connector's tools/list. A tool that disappears
 * or is renamed breaks every existing connection until each user manually
 * disconnects and reconnects — which they read as "Kolbo stopped working".
 * Adding a tool is harmless (clients pick it up on their next refresh).
 *
 * tool-contract.json lists every tool the remote connector has ever shipped.
 * This check fails the build if any of them is missing from the current
 * server. New tools are appended with `--update`; that is the ONLY way the
 * file changes. To retire a tool, keep the name registered and make the
 * handler return a helpful "use X instead" message.
 *
 * Runs in prepublishOnly and CI.
 */

const fs = require('fs');
const path = require('path');
const { createServer } = require('../src/index.js');

const CONTRACT = path.join(__dirname, '..', 'tool-contract.json');

// The remote connector profile (api.kolbo.ai/mcp) — what claude.ai caches.
const server = createServer({
  apiKey: 'kolbo_live_contract_check',
  apiBase: 'https://api.kolbo.ai/api',
  inlineImages: true,
  apps: true,
  commerce: true,
  allowBrowserLogin: false,
});
const current = Object.keys(server._registeredTools).sort();
const locked = fs.existsSync(CONTRACT) ? JSON.parse(fs.readFileSync(CONTRACT, 'utf8')).tools : [];

const missing = locked.filter(name => !current.includes(name));
if (missing.length) {
  console.error(`✗ tool contract broken — ${missing.length} published tool(s) no longer registered:`);
  for (const name of missing) console.error(`    ${name}`);
  console.error('  Removing or renaming a tool breaks every cached connector. Keep the old name registered (it can forward or explain the replacement).');
  process.exit(1);
}

const added = current.filter(name => !locked.includes(name));
if (process.argv.includes('--update')) {
  const tools = [...locked, ...added].sort();
  fs.writeFileSync(CONTRACT, JSON.stringify({ note: 'Append-only. See scripts/check-tool-contract.js.', tools }, null, 2) + '\n');
  console.log(`✓ tool contract updated: ${tools.length} tools (+${added.length})`);
} else if (added.length) {
  console.error(`✗ ${added.length} new tool(s) not in tool-contract.json: ${added.join(', ')}`);
  console.error('  Run `npm run check-tool-contract -- --update` and commit tool-contract.json.');
  process.exit(1);
} else {
  console.log(`✓ tool contract holds: ${current.length} tools`);
}
