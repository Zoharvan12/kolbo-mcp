'use strict';

/**
 * Kolbo skill, served as standard MCP resources.
 *
 * Why: `skill/` is installed into a LOCAL agent by `npx @kolbo/mcp install`.
 * Connector clients (claude.ai / Claude Desktop) never run that install, so
 * they get the tools but none of the operating guidance — which is why models
 * on those surfaces write generation prompts without the `@VisualDNA` /
 * `#Moodboard` conventions the skill mandates.
 *
 * Serving the same files as resources closes that gap for every client without
 * duplicating the content: `skill/` stays the single source of truth (it is
 * auto-mirrored from kolbo-code — never hand-edit it).
 *
 * These are registered with the SDK's own `server.resource(...)`, NOT the
 * ext-apps `registerAppResource` used for widgets — widgets are deliberately
 * hidden from generic resource listings, whereas the skill must be discoverable.
 *
 * Shape mirrors how the skill already works: SKILL.md is the always-loaded core
 * with a routing index, and `references/**` are pulled on demand. Resources are
 * pull-based, so nothing costs tokens until the model actually reads it.
 */

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..', 'skill');
const URI_PREFIX = 'kolbo://skill/';

/** Every markdown file under skill/, as posix-style paths relative to skill/. */
function listSkillDocs(dir = SKILL_DIR, base = SKILL_DIR) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSkillDocs(full, base));
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** First markdown heading or frontmatter description, for the resource blurb. */
function describe(text, rel) {
  const heading = text.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim().slice(0, 160);
  return `Kolbo skill reference: ${rel}`;
}

function registerSkillResources(server) {
  const docs = listSkillDocs();
  if (!docs.length) return 0;

  for (const rel of docs) {
    const uri = URI_PREFIX + rel;
    const abs = path.join(SKILL_DIR, rel);
    // Name the core doc distinctly so it stands out in a resource list.
    const name = rel === 'SKILL.md'
      ? 'Kolbo skill — START HERE (core rules + routing index)'
      : `Kolbo skill — ${rel.replace(/^references\//, '').replace(/\.md$/, '')}`;

    let blurb;
    try {
      blurb = describe(fs.readFileSync(abs, 'utf8'), rel);
    } catch {
      blurb = `Kolbo skill reference: ${rel}`;
    }

    server.resource(
      name,
      uri,
      { mimeType: 'text/markdown', description: blurb },
      // Read lazily on each request so a mirrored skill update is picked up
      // without restarting the server.
      async () => ({
        contents: [{ uri, mimeType: 'text/markdown', text: fs.readFileSync(abs, 'utf8') }],
      })
    );
  }
  return docs.length;
}

module.exports = { registerSkillResources, listSkillDocs, SKILL_DIR, URI_PREFIX };
