/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');

function registerProjectTools(server, client) {
  // ─── list_projects ─────────────────────────────────────────
  server.tool(
    'list_projects',
    'List the user\'s projects (owned + shared with edit/full/owner permission). Use this to resolve a project NAME the user mentioned ("put this in my Acme Campaign project") into the project ObjectId you pass back as `project_id` on any generation tool. The tool the user mentions a project by name OR by location, you MUST call this first — the generation tools accept only ObjectIds, not names. Returns id, name, role, and is_default. The project flagged `is_default: true` is the auto-created "API Generations" bucket every SDK generation lands in when project_id is omitted.',
    {},
    async () => {
      const result = await client.get('/v1/projects');
      const projects = (result.projects || []).map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        is_default: !!p.is_default
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            projects,
            count: projects.length,
            _hint: 'Pass the chosen `id` as `project_id` on any generate_* tool to drop the generation into that project. Omit project_id to use the project flagged is_default:true.'
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerProjectTools };
