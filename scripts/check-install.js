#!/usr/bin/env node
/**
 * check-install.js — `npx @kolbo/mcp install` is the first thing a new user
 * runs. If it writes the config to a file the agent doesn't read, it prints
 * "✓ configured" and the user gets ZERO tools with no error to search for.
 * That shipped: the Claude Code entry went to ~/.claude/settings.json, which
 * accepts an mcpServers key and ignores it (`claude mcp list` confirms only
 * ~/.claude.json loads).
 *
 * Runs install against a sandboxed HOME and asserts it lands in the right files.
 * No network, no real config touched.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '..');

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }

function hasKolbo(file) {
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    return !!(cfg.mcpServers && cfg.mcpServers.kolbo);
  } catch (_) { return false; }
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kolbo-install-check-'));
  const realHome = os.homedir;
  const realAppData = process.env.APPDATA;
  const failures = [];

  try {
    // Pretend Claude Code + Cursor are installed; Claude Desktop is not.
    fs.mkdirSync(path.join(sandbox, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(sandbox, '.cursor'), { recursive: true });
    os.homedir = () => sandbox;
    process.env.APPDATA = path.join(sandbox, 'AppData');

    const installPath = path.join(PKG_ROOT, 'src', 'install.js');
    delete require.cache[require.resolve(installPath)];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true; // install prints a user-facing report
    try {
      await require(installPath).run();
    } finally {
      process.stdout.write = origWrite;
    }

    const claudeCode = path.join(sandbox, '.claude.json');
    const settings = path.join(sandbox, '.claude', 'settings.json');
    const cursor = path.join(sandbox, '.cursor', 'mcp.json');
    const desktop = path.join(sandbox, 'AppData', 'Claude', 'claude_desktop_config.json');
    const skill = path.join(sandbox, '.claude', 'skills', 'kolbo', 'SKILL.md');

    if (!hasKolbo(claudeCode)) {
      failures.push('Claude Code entry missing from ~/.claude.json — this is the ONLY user-scope file Claude Code reads for MCP servers');
    }
    if (fs.existsSync(settings)) {
      failures.push('install wrote ~/.claude/settings.json — Claude Code ignores mcpServers there, so the user would get no tools');
    }
    if (!hasKolbo(cursor)) failures.push('Cursor entry missing from ~/.cursor/mcp.json');
    if (fs.existsSync(desktop)) {
      failures.push('install created a Claude Desktop config for an app that is not installed');
    }
    if (fs.existsSync(path.join(PKG_ROOT, 'skill')) && !fs.existsSync(skill)) {
      failures.push('routing skill was not copied into ~/.claude/skills/kolbo');
    }

    // Re-running must be idempotent, never duplicated or clobbered.
    delete require.cache[require.resolve(installPath)];
    process.stdout.write = () => true;
    try { await require(installPath).run(); } finally { process.stdout.write = origWrite; }
    if (!hasKolbo(claudeCode)) failures.push('re-running install removed the existing entry (not idempotent)');
  } finally {
    os.homedir = realHome;
    if (realAppData === undefined) delete process.env.APPDATA; else process.env.APPDATA = realAppData;
    rmrf(sandbox);
  }

  if (failures.length) {
    console.error('Install check FAILED:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('Install check OK — config lands where each agent actually reads it, and is idempotent.');
}

main().catch((e) => { console.error(e); process.exit(1); });
