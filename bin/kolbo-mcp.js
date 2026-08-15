#!/usr/bin/env node

// Installer commands are additive aliases on the same public package:
//   `npx @kolbo/mcp install`       → MCP configuration + bundled skill
//   `npx @kolbo/mcp skill`         → bundled skill only
//   `npx @kolbo/mcp install-skill` → readable alias for skill-only
// Anything else runs the MCP stdio server (the default).
const command = process.argv[2];
if (command === 'install' || command === 'skill' || command === 'install-skill') {
  const installer = require('../src/install.js');
  const run = command === 'install' ? installer.run : installer.runSkillOnly;
  run()
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      console.error('Kolbo install failed:', err && err.message ? err.message : err);
      process.exit(1);
    });
} else {
  // Keep official managed skill installs on the exact tree bundled with the
  // MCP package selected by `@latest`. Unmanaged/user-authored skills are left
  // alone. This is silent because stdout belongs to the MCP JSON transport.
  require('../src/install.js').refreshManagedSkills();
  require('../src/index.js');
}
