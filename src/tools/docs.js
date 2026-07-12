/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { projectIdField } = require('./_shared');

const CONTENT_GUIDE = 'HTML body content. Use clean semantic HTML the in-app editor understands: <h1>-<h3>, <p>, <ul>/<ol>/<li>, <table>, <blockquote>, <strong>/<em>, <a>. No <script>/<style>/<iframe> (stripped server-side). Write the FULL document yourself — this is where you author the doc.';

function registerDocTools(server, client) {
  // ─── create_doc ────────────────────────────────────────────
  server.tool(
    'create_doc',
    'Create an AI Doc (Magic Pad document) in the user\'s Kolbo workspace. YOU author the document: write complete, well-structured HTML content (plans, briefs, scripts, research summaries, meeting notes…) and save it here so the user can read and edit it in the Kolbo app. Docs are project-scoped — when the user is working in a named project, resolve it with `list_projects` and pass `project_id`. Returns the doc id; use `share_doc` afterwards if the user wants a public link.',
    {
      title: z.string().describe('Document title (shown in the app sidebar).'),
      content: z.string().describe(CONTENT_GUIDE),
      project_id: projectIdField
    },
    async ({ title, content, project_id }) => {
      const body = { title, content };
      if (project_id) body.project_id = project_id;
      const result = await client.post('/v1/docs', body);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            doc: result.doc,
            _hint: 'Doc created. The user can open it in the Kolbo app under the project\'s AI Docs. Call share_doc with shared:true to get a public link.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── list_docs ─────────────────────────────────────────────
  server.tool(
    'list_docs',
    'List the user\'s AI Docs (Magic Pad documents) across all projects, most recently updated first. Pass `project_id` (from `list_projects`) to narrow to one project. Returns id, title, project_id, share state, and timestamps — use `get_doc` to read a doc\'s content.',
    {
      project_id: z.string().optional().describe('Restrict to docs in one project (ObjectId from `list_projects`). Omit to list across all projects.'),
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Results per page, max 50. Default: 20')
    },
    async ({ project_id, page, limit }) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      const result = await client.get(`/v1/docs${qs ? '?' + qs : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify({ docs: result.docs || [], pagination: result.pagination || null }, null, 2) }] };
    }
  );

  // ─── get_doc ───────────────────────────────────────────────
  server.tool(
    'get_doc',
    'Fetch one AI Doc including its full HTML content. Use before editing an existing doc (read → modify → `update_doc`).',
    {
      doc_id: z.string().describe('The doc ObjectId (from create_doc or list_docs).')
    },
    async ({ doc_id }) => {
      const result = await client.get(`/v1/docs/${encodeURIComponent(doc_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result.doc, null, 2) }] };
    }
  );

  // ─── update_doc ────────────────────────────────────────────
  server.tool(
    'update_doc',
    'Update an AI Doc\'s title and/or content. Content REPLACES the whole document — call `get_doc` first, apply the user\'s edits to the full HTML, and send the complete result back.',
    {
      doc_id: z.string().describe('The doc ObjectId to update.'),
      title: z.string().optional().describe('New title. Omit to keep the current one.'),
      content: z.string().optional().describe('Full replacement ' + CONTENT_GUIDE)
    },
    async ({ doc_id, title, content }) => {
      const body = {};
      if (title !== undefined) body.title = title;
      if (content !== undefined) body.content = content;
      const result = await client.put(`/v1/docs/${encodeURIComponent(doc_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.doc, null, 2) }] };
    }
  );

  // ─── share_doc ─────────────────────────────────────────────
  server.tool(
    'share_doc',
    'Enable or disable public sharing of an AI Doc. When enabling, returns a stable public link (app.kolbo.ai/shared/magicpad/…) anyone can open — give it to the user. Set `editable` to also let link visitors edit the doc.',
    {
      doc_id: z.string().describe('The doc ObjectId.'),
      shared: z.boolean().describe('true = publicly shared, false = private again (the link stops working).'),
      editable: z.boolean().optional().describe('Whether link visitors can edit. Default: unchanged (false for new shares).')
    },
    async ({ doc_id, shared, editable }) => {
      const body = { shared };
      if (editable !== undefined) body.editable = editable;
      const result = await client.patch(`/v1/docs/${encodeURIComponent(doc_id)}/share`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.doc, null, 2) }] };
    }
  );

  // ─── delete_doc ────────────────────────────────────────────
  server.tool(
    'delete_doc',
    'Delete an AI Doc (soft delete — recoverable from the app\'s trash flow). Owner only. Confirm with the user before deleting anything they did not just create in this conversation.',
    {
      doc_id: z.string().describe('The doc ObjectId to delete.')
    },
    async ({ doc_id }) => {
      const result = await client.delete(`/v1/docs/${encodeURIComponent(doc_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerDocTools };
