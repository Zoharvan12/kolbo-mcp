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
const MANAGED_FILE = '.kolbo-managed.json';
const PACKAGE_VERSION = require('../package.json').version;

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
    { name: 'Kolbo Code skill', root: path.join(home, '.kolbo'), dir: path.join(home, '.kolbo', 'skills', 'kolbo') },
  ];
}

function installSkill(t) {
  const src = path.join(__dirname, '..', 'skill');
  if (!fs.existsSync(src)) return { ...t, status: 'skill not bundled' };
  if (!fs.existsSync(t.root)) return { ...t, status: 'not found' };
  const tmp = `${t.dir}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    // Replace the generated tree so source deletions propagate too. A simple
    // recursive copy leaves obsolete references behind indefinitely.
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(t.dir), { recursive: true });
    fs.cpSync(src, tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, MANAGED_FILE), JSON.stringify({
      source: '@kolbo/mcp',
      skill: 'kolbo',
      version: fs.readFileSync(path.join(src, 'VERSION'), 'utf8').trim(),
      packageVersion: PACKAGE_VERSION,
    }, null, 2) + '\n');
    fs.rmSync(t.dir, { recursive: true, force: true });
    fs.renameSync(tmp, t.dir);
    return { ...t, status: 'installed' };
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ...t, status: `failed — ${e.message}` };
  }
}

// Local MCP launches refresh only installs created by Kolbo. A manually
// authored `kolbo` skill without the marker is never overwritten.
function refreshManagedSkills() {
  return skillTargets().map((t) => {
    const marker = path.join(t.dir, MANAGED_FILE);
    if (!fs.existsSync(marker)) return { ...t, status: 'unmanaged' };
    try {
      const installed = JSON.parse(fs.readFileSync(marker, 'utf8'));
      const skillVersion = fs.readFileSync(path.join(__dirname, '..', 'skill', 'VERSION'), 'utf8').trim();
      if (installed.packageVersion === PACKAGE_VERSION && installed.version === skillVersion) {
        return { ...t, status: 'current' };
      }
    } catch (_) {}
    return installSkill(t);
  });
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

async function runSkillOnly() {
  const out = (s = '') => process.stdout.write(s + '\n');
  const skills = skillTargets().map(installSkill);
  const ready = skills.filter((s) => s.status === 'installed');

  out();
  out('  Kolbo Skill — standalone install');
  out('  ────────────────────────────────');
  for (const s of skills) {
    out(`  ${s.status === 'installed' ? '✓' : '·'} ${s.name}: ${s.status}`);
  }
  out();

  if (ready.length === 0) {
    out('  No supported skill directory found (.claude or .agents).');
    out('  Install or open a compatible agent, then run this command again.');
    out();
    return 0;
  }

  out('  Done — the Kolbo Skill is installed.');
  out('  MCP settings were not changed. Restart your agent to load the skill.');
  out();
  return 0;
}

module.exports = { run, runSkillOnly, refreshManagedSkills, MANAGED_FILE };
