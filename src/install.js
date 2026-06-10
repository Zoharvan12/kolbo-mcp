'use strict';

/**
 * `npx @kolbo/mcp install` — one-command, keyless setup.
 *
 * Detects the MCP config of every supported local agent (Claude Desktop,
 * Claude Code, Cursor) that's actually installed, and adds the Kolbo MCP server
 * to it — to the RIGHT file, merging instead of clobbering. No API key (the
 * server logs in via the browser on first use). This exists because having an
 * agent hand-edit settings.json is fragile (wrong file, JSON breakage, and
 * Claude Code's self-modification guard) — one deterministic command is not.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const KOLBO_ENTRY = { command: 'npx', args: ['-y', '@kolbo/mcp@latest'] };

function targets() {
  const home = os.homedir();
  let desktop;
  if (process.platform === 'darwin') {
    desktop = path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (process.platform === 'win32') {
    desktop = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  } else {
    desktop = path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
  return [
    { name: 'Claude Desktop', file: desktop, restart: 'Fully quit and reopen Claude Desktop' },
    { name: 'Claude Code', file: path.join(home, '.claude', 'settings.json'), restart: 'Restart Claude Code' },
    { name: 'Cursor', file: path.join(home, '.cursor', 'mcp.json'), restart: 'Restart Cursor' },
  ];
}

function configure(t) {
  const dir = path.dirname(t.file);
  const fileExists = fs.existsSync(t.file);
  // Only touch an app that looks installed (its config file or parent dir exists)
  // so we don't create configs for apps the user doesn't have.
  if (!fileExists && !fs.existsSync(dir)) return { ...t, status: 'not found' };

  let cfg = {};
  if (fileExists) {
    try {
      cfg = JSON.parse(fs.readFileSync(t.file, 'utf8'));
    } catch (_) {
      return { ...t, status: 'skipped — existing config is not valid JSON' };
    }
  }
  cfg.mcpServers = cfg.mcpServers || {};
  if (cfg.mcpServers.kolbo) return { ...t, status: 'already set up' };

  cfg.mcpServers.kolbo = { ...KOLBO_ENTRY };
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(t.file, JSON.stringify(cfg, null, 2) + '\n');
    return { ...t, status: 'configured' };
  } catch (e) {
    return { ...t, status: `failed — ${e.message}` };
  }
}

// The Kolbo routing skill is bundled at <package>/skill/ — copy it into the
// agent's skills dir so the agent gets the routing brain (correct model ids,
// defaults, "never hardcode model names"), not just the raw tools.
function skillTargets() {
  const home = os.homedir();
  return [
    { name: 'Claude Code skill', root: path.join(home, '.claude'), dir: path.join(home, '.claude', 'skills', 'kolbo') },
    { name: 'Agents skill (Cursor/Codex)', root: path.join(home, '.agents'), dir: path.join(home, '.agents', 'skills', 'kolbo') },
  ];
}

function installSkill(t) {
  const src = path.join(__dirname, '..', 'skill');
  if (!fs.existsSync(src)) return { ...t, status: 'skill not bundled' };
  if (!fs.existsSync(t.root)) return { ...t, status: 'not found' };
  try {
    fs.mkdirSync(t.dir, { recursive: true });
    fs.cpSync(src, t.dir, { recursive: true });
    return { ...t, status: 'installed' };
  } catch (e) {
    return { ...t, status: `failed — ${e.message}` };
  }
}

async function run() {
  const out = (s = '') => process.stdout.write(s + '\n');
  const results = targets().map(configure);
  const skills = skillTargets().map(installSkill);
  const newlyConfigured = results.filter((r) => r.status === 'configured');
  const ready = results.filter((r) => r.status === 'configured' || r.status === 'already set up');

  out();
  out('  Kolbo MCP — keyless setup');
  out('  ─────────────────────────');
  for (const r of results) {
    const ok = r.status === 'configured' || r.status === 'already set up';
    out(`  ${ok ? '✓' : '·'} ${r.name}: ${r.status}${ok ? `  (${r.file})` : ''}`);
  }
  for (const s of skills) {
    if (s.status === 'not found' || s.status === 'skill not bundled') continue;
    out(`  ${s.status === 'installed' ? '✓' : '·'} ${s.name}: ${s.status}`);
  }
  out();

  if (ready.length === 0) {
    out('  No supported agent found (Claude Desktop / Claude Code / Cursor).');
    out('  Add this to your agent\'s MCP config manually, then restart it:');
    out('    {"mcpServers":{"kolbo":{"command":"npx","args":["-y","@kolbo/mcp@latest"]}}}');
    out();
    return 0;
  }

  out('  Done — no API key needed.');
  if (newlyConfigured.length) {
    const steps = [...new Set(newlyConfigured.map((r) => r.restart))];
    out(`  Next: ${steps.join('; ')}.`);
  }
  out('  On your first Kolbo generation, a login opens in your browser — click Allow.');
  out();
  return 0;
}

module.exports = { run };
