#!/usr/bin/env node
/**
 * smoke.js — load the MCP server and register all tools.
 * Catches schema/registration errors at dev time without hitting the network.
 *
 * Cross-platform alternative to `KOLBO_API_KEY=dummy node -e ...` which
 * doesn't work on Windows cmd.exe.
 */
process.env.KOLBO_API_KEY = process.env.KOLBO_API_KEY || 'dummy_smoke_test';
require('../src/index.js');
console.log('OK: MCP server loaded and all tools registered.');
