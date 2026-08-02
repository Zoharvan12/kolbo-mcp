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
    // Claude Code reads user-scope MCP servers from ~/.claude.json — NOT from
    // ~/.claude/settings.json. settings.json accepts an mcpServers key without
    // complaint and Claude Code ignores it completely, so writing there made
    // `install` report success while the user got no Kolbo tools at all.
    // Verified with `claude mcp list`: only ~/.claude.json entries load.
    { name: 'Claude Code', file: path.join(home, '.claude.json'), restart: 'Restart Claude Code', probeDir: path.join(home, '.claude') },
    { name: 'Cursor', file: path.join(home, '.cursor', 'mcp.json'), restart: 'Restart Cursor' },
  ];
}

function configure(t) {
  const dir = path.dirname(t.file);
  const fileExists = fs.existsSync(t.file);
  // Only touch an app that looks installed (its config file or parent dir exists)
  // so we don't create configs for apps the user doesn't have. `probeDir` exists
  // for configs that live directly in $HOME (~/.claude.json) — dirname there is
  // the home dir, which always exists, so it would "detect" every app.
  const probe = t.probeDir || dir;
  if (!fileExists && !fs.existsSync(probe)) return { ...t, status: 'not found' };

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

// Versions before this fix wrote the Claude Code entry into
// ~/.claude/settings.json, where Claude Code silently ignores it. Anyone who ran
// those is left with a dead entry that makes it look configured. Detect and say
// so rather than editing a file we no longer own.
function staleClaudeCodeEntry() {
  const f = path.join(os.homedir(), '.claude', 'settings.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
    return cfg.mcpServers && cfg.mcpServers.kolbo ? f : null;
  } catch (_) {
    return null;
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

  const stale = staleClaudeCodeEntry();
  if (stale) {
    out('  Note: an older Kolbo entry is sitting in');
    out(`    ${stale}`);
    out('  Claude Code does not read MCP servers from that file, so it never did');
    out('  anything. Safe to delete the "kolbo" key there; the real one is now in');
    out(`    ${path.join(os.homedir(), '.claude.json')}`);
    out();
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
