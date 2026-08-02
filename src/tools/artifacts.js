/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { resolveToBuffer } = require('./_shared');

// An HTML/SVG/Mermaid document is text — cap well below the media limit.
const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;

function registerArtifactTools(server, client) {
  // ─── publish_html_artifact ─────────────────────────────────────
  server.tool(
    'publish_html_artifact',
    'Publish an HTML page (or SVG / Mermaid diagram) to kolbo.ai and return a public shareable URL. Use this when the user explicitly asks to share, publish, or deploy a built artifact so they can send the URL to someone. The content is hosted at https://sites.kolbo.ai/<slug>; the page is served with restrictive CSP (no fetch/XHR/form-action) so it cannot exfiltrate data. Pass `file_path` instead of `content` whenever the artifact already exists as a file — the server reads it, which avoids re-emitting the whole document into the tool call. Identical content uploaded twice returns the same URL (server dedup). To update a previously-published page in place (keeping the same URL), pass the `share_token` returned from the prior publish — the old content is preserved in version history.',
    {
      title: z.string().describe('Human-friendly title for the page (also used to generate the SEO slug). Keep under ~60 chars.'),
      content: z.string().optional().describe('The raw artifact body. For type="html" this is a full HTML document (DOCTYPE + html/head/body). For "svg" it is an <svg> document. For "mermaid" it is the Mermaid source text. Omit this when passing `file_path`.'),
      file_path: z.string().optional().describe('ALTERNATIVE to `content`: an ABSOLUTE local path (or https:// URL) to the artifact file. Strongly preferred for anything sizeable — the server reads the file itself, so you do not have to re-emit the whole document into this tool call. Local paths only work when the file is reachable from where the MCP server runs (local stdio installs), not over a remote connector.'),
      type: z.enum(['html', 'svg', 'mermaid']).optional().describe('Artifact type. Default: "html".'),
      allow_js: z.boolean().optional().describe('Allow inline <script> execution on the published page. Default: false. Required for Tailwind JIT, Chart.js, Three.js, React-from-CDN etc.'),
      share_token: z.string().optional().describe('Optional. Pass the `shareToken` returned from a previous publish to update that artifact in place. The public URL stays the same and the old content is moved into version history. Omit this on the first publish.'),
    },
    async ({ title, content, file_path, type, allow_js, share_token }) => {
      if (!title || !title.trim()) throw new Error('title is required');

      const hasContent = typeof content === 'string' && content.length > 0;
      const hasPath = typeof file_path === 'string' && file_path.trim().length > 0;
      if (!hasContent && !hasPath) throw new Error('one of `content` or `file_path` is required');
      if (hasContent && hasPath) throw new Error('pass either `content` or `file_path`, not both');

      let body_content = content;
      if (hasPath) {
        // resolveToBuffer gives us the absolute-path check, the SSRF guard for
        // https:// sources, and the remote-connector error message for free.
        const { buffer } = await resolveToBuffer(file_path.trim(), 'html', { maxBytes: MAX_ARTIFACT_BYTES });
        body_content = buffer.toString('utf8');
        if (!body_content.trim()) throw new Error(`File is empty: ${file_path}`);
      }

      const body = {
        title: title.trim(),
        content: body_content,
        type: type || 'html',
        allowJs: allow_js === true,
      };
      if (typeof share_token === 'string' && share_token.trim()) {
        body.shareToken = share_token.trim();
      }

      const result = await client.post('/artifact/quick-share', body);

      const artifact = result?.data || {};
      const slug = artifact.shareableSlug || artifact.shareToken;
      // Compose env-correct URL. sites.kolbo.ai only resolves in prod; for
      // dev/staging we serve straight from the kolbo-api host.
      const apiBase = client.baseUrl || 'https://api.kolbo.ai/api';
      const isProd = /(^|\/\/)api\.kolbo\.ai/i.test(apiBase);
      let url;
      if (isProd) {
        url = artifact.siteUrl || (slug ? `https://sites.kolbo.ai/${slug}` : null);
      }
      if (!url && artifact.shareToken) {
        url = `${apiBase}/shared-artifact-raw/${artifact.shareToken}`;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            url,
            shareToken: artifact.shareToken,
            shareableSlug: slug,
            duplicate: result?.duplicate === true,
            updated: result?.updated === true,
            title: artifact.title,
          }),
        }],
      };
    },
  );
}

module.exports = { registerArtifactTools };
