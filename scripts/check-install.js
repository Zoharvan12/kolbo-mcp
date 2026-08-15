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
const { spawnSync } = require('child_process');

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
  const skillSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kolbo-skill-install-check-'));
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

    // Skill-only must install the bundled skill without touching any MCP config.
    fs.mkdirSync(path.join(skillSandbox, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(skillSandbox, '.agents'), { recursive: true });
    fs.mkdirSync(path.join(skillSandbox, '.kolbo'), { recursive: true });
    fs.mkdirSync(path.join(skillSandbox, '.cursor'), { recursive: true });
    os.homedir = () => skillSandbox;
    process.env.APPDATA = path.join(skillSandbox, 'AppData');
    delete require.cache[require.resolve(installPath)];
    process.stdout.write = () => true;
    try { await require(installPath).runSkillOnly(); } finally { process.stdout.write = origWrite; }

    const claudeSkill = path.join(skillSandbox, '.claude', 'skills', 'kolbo', 'SKILL.md');
    const agentsSkill = path.join(skillSandbox, '.agents', 'skills', 'kolbo', 'SKILL.md');
    const kolboCodeSkill = path.join(skillSandbox, '.kolbo', 'skills', 'kolbo', 'SKILL.md');
    const managed = path.join(skillSandbox, '.agents', 'skills', 'kolbo', '.kolbo-managed.json');
    if (!fs.existsSync(claudeSkill)) failures.push('skill-only install did not copy the Claude skill');
    if (!fs.existsSync(agentsSkill)) failures.push('skill-only install did not copy the shared Agents skill');
    if (!fs.existsSync(kolboCodeSkill)) failures.push('skill-only install did not copy the Kolbo Code skill');
    if (!fs.existsSync(managed)) failures.push('skill-only install did not mark the tree for safe automatic updates');
    if (fs.existsSync(path.join(skillSandbox, '.claude.json'))) failures.push('skill-only install changed Claude Code MCP config');
    if (fs.existsSync(path.join(skillSandbox, '.cursor', 'mcp.json'))) failures.push('skill-only install changed Cursor MCP config');
    if (fs.existsSync(path.join(skillSandbox, 'AppData', 'Claude', 'claude_desktop_config.json'))) failures.push('skill-only install changed Claude Desktop MCP config');

    const stale = path.join(skillSandbox, '.agents', 'skills', 'kolbo', 'obsolete-reference.md');
    fs.writeFileSync(stale, 'must be removed on refresh');
    const marker = JSON.parse(fs.readFileSync(managed, 'utf8'));
    marker.packageVersion = '0.0.0';
    fs.writeFileSync(managed, JSON.stringify(marker, null, 2) + '\n');
    const unmanagedMarker = path.join(skillSandbox, '.claude', 'skills', 'kolbo', '.kolbo-managed.json');
    const unmanagedFile = path.join(skillSandbox, '.claude', 'skills', 'kolbo', 'user-owned.md');
    fs.rmSync(unmanagedMarker);
    fs.writeFileSync(unmanagedFile, 'must never be overwritten');
    delete require.cache[require.resolve(installPath)];
    require(installPath).refreshManagedSkills();
    if (fs.existsSync(stale)) failures.push('managed skill refresh left a file removed from the canonical package');
    if (!fs.existsSync(unmanagedFile)) failures.push('managed refresh overwrote an unmarked user-owned skill');

    const binPath = path.join(PKG_ROOT, 'bin', 'kolbo-mcp.js');
    for (const alias of ['skill', 'install-skill']) {
      const result = spawnSync(process.execPath, [binPath, alias], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: skillSandbox,
          USERPROFILE: skillSandbox,
          APPDATA: path.join(skillSandbox, 'AppData'),
        },
      });
      if (result.status !== 0 || !result.stdout.includes('Kolbo Skill — standalone install')) {
        failures.push(`CLI alias "${alias}" did not run the standalone skill installer`);
      }
    }
  } finally {
    os.homedir = realHome;
    if (realAppData === undefined) delete process.env.APPDATA; else process.env.APPDATA = realAppData;
    rmrf(sandbox);
    rmrf(skillSandbox);
  }

  if (failures.length) {
    console.error('Install check FAILED:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('Install check OK — combined setup is idempotent; skill-only installs the skill without touching MCP config.');
}

main().catch((e) => { console.error(e); process.exit(1); });
