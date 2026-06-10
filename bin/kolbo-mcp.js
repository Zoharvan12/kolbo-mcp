#!/usr/bin/env node

// `npx @kolbo/mcp install` → one-command keyless setup (configures the user's
// agent). Anything else → run the MCP stdio server (the default).
if (process.argv[2] === 'install') {
  require('../src/install.js')
    .run()
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      console.error('Kolbo install failed:', err && err.message ? err.message : err);
      process.exit(1);
    });
} else {
  require('../src/index.js');
}
