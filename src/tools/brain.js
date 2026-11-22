/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

// The project brain: the rules Kobi follows for a project (and the "about you" rules it follows
// everywhere), read and edited by the user through any MCP client. Zohar 2026-11-22: users read
// and edit their own brain through the MCP; a requirement from the start.

const { z } = require('zod');

const LAYERS = ['story', 'cast', 'look', 'staging', 'process'];
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const ruleView = (r) => ({ id: r.id, rule: r.content, layer: r.layer || null, pinned: !!r.pinned, ...(r.learned ? { learned: true } : {}), ...(r.dnaIds?.length ? { cast_ids: r.dnaIds } : {}) });
// Brain routes answer { status, success, data }.
const unwrap = (r) => (r && typeof r === 'object' && 'data' in r ? r.data : r);
const ruleBase = (projectId) => (projectId ? `/v1/brain/projects/${encodeURIComponent(projectId)}/rules` : '/v1/brain/me/rules');

function registerBrainTools(server, client) {
  server.tool(
    'get_project_brain',
    'Read the project brain: the rules Kolbo\'s agent follows in this project (project rules, sorted into story / cast / look / staging / process), the "about you" rules it follows in every project, the project profile and its cast. Learned rules (learned: true) were picked up from the user\'s own feedback. Use it before working in a project, and when the user asks what Kobi knows or remembers.',
    { project_id: z.string().describe('Project ObjectId (from list_projects).') },
    async ({ project_id }) => {
      const b = unwrap(await client.get(`/v1/brain/projects/${encodeURIComponent(project_id)}`)) || {};
      return text({
        project_id: b.projectId, project_name: b.projectName, can_edit: b.canEdit,
        profile: b.profile || '', rules: (b.rules || []).map(ruleView), about_you_rules: (b.globalRules || []).map(ruleView),
        cast: (b.cast || []).map((c) => ({ id: c.id, name: c.name, type: c.type })),
      });
    }
  );

  server.tool(
    'add_brain_rule',
    'Teach Kobi a rule. With project_id it is a rule for that project only ("the logo is always bottom right"); without it, an "about you" rule Kobi follows in every project ("always answer in Hebrew"). One short instruction per rule, in the user\'s own words. Only add what the user asked to remember.',
    {
      content: z.string().describe('The rule, one short instruction (3-500 characters).'),
      project_id: z.string().optional().describe('Project ObjectId. Omit for an "about you" rule that applies everywhere.'),
      layer: z.enum(LAYERS).optional().describe('Project rules: what the rule is about (story, cast, look, staging, process).'),
      pinned: z.boolean().optional().describe('Pinned rules always reach Kobi first.'),
    },
    async ({ content, project_id, layer, pinned }) => text(ruleView(unwrap(await client.post(ruleBase(project_id), { content, ...(layer ? { layer } : {}), ...(pinned !== undefined ? { pinned } : {}) }))))
  );

  server.tool(
    'update_brain_rule',
    'Change one brain rule: its wording, layer or pin. Pass project_id for a project rule; omit it for an "about you" rule. Rule ids come from get_project_brain.',
    {
      rule_id: z.string().describe('Rule id from get_project_brain.'),
      project_id: z.string().optional().describe('Project ObjectId for a project rule. Omit for an "about you" rule.'),
      content: z.string().optional().describe('New wording.'),
      layer: z.enum(LAYERS).optional().describe('New layer (project rules).'),
      pinned: z.boolean().optional().describe('Pin or unpin.'),
    },
    async ({ rule_id, project_id, content, layer, pinned }) => {
      const body = { ...(content !== undefined ? { content } : {}), ...(layer ? { layer } : {}), ...(pinned !== undefined ? { pinned } : {}) };
      if (!Object.keys(body).length) throw new Error('Pass content, layer or pinned.');
      return text(ruleView(unwrap(await client.patch(`${ruleBase(project_id)}/${encodeURIComponent(rule_id)}`, body))));
    }
  );

  server.tool(
    'delete_brain_rule',
    'Remove one brain rule so Kobi stops following it. Pass project_id for a project rule; omit it for an "about you" rule. Confirm with the user first.',
    {
      rule_id: z.string().describe('Rule id from get_project_brain.'),
      project_id: z.string().optional().describe('Project ObjectId for a project rule. Omit for an "about you" rule.'),
    },
    async ({ rule_id, project_id }) => text(unwrap(await client.delete(`${ruleBase(project_id)}/${encodeURIComponent(rule_id)}`)))
  );

  server.tool(
    'search_brain_memory',
    'Search what Kobi remembers about the user and their work (rules, facts, notes), optionally inside one project. Use when the user asks "what do you know about X" or before redoing something they set up before.',
    {
      query: z.string().describe('What to look for.'),
      project_id: z.string().optional().describe('Limit to one project.'),
    },
    async ({ query, project_id }) => text(unwrap(await client.post('/v1/brain/memory/search', { query, ...(project_id ? { projectId: project_id } : {}) })))
  );
}

module.exports = { registerBrainTools };
