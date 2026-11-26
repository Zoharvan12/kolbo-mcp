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

  const brainBase = (projectId) => `/v1/brain/projects/${encodeURIComponent(projectId)}`;

  server.tool(
    'learn_from_feedback',
    'Keep the project brain up to date on its own. Call it, without being asked, whenever the user corrects a result or states how they want things in this project ("no, the logo goes bottom right", "always warmer light", "stop adding music"). Pass the user\'s own words; Kolbo keeps only lessons that will still hold next time, skips duplicates, and retires rules the new one replaces. Returns the rules it saved (often none, which is fine). Do not call it for plain approvals or one-off requests.',
    {
      project_id: z.string().describe('Project ObjectId the feedback is about.'),
      message: z.string().describe('The user\'s own words, verbatim (not your summary).'),
      context: z.string().optional().describe('What the feedback reacts to: the prompt or result you just produced (up to 4000 characters).'),
    },
    async ({ project_id, message, context }) => text(unwrap(await client.post(`${brainBase(project_id)}/learn`, { message, ...(context ? { context } : {}) })))
  );

  server.tool(
    'move_brain_rule',
    'Reorganize: move a project rule to the user\'s "about you" rules so Kobi follows it in every project ("I want this everywhere"). To regroup a rule inside the project use update_brain_rule with a new layer; to merge two rules, update one and delete the other.',
    {
      project_id: z.string().describe('Project ObjectId the rule is in.'),
      rule_id: z.string().describe('Project rule id from get_project_brain.'),
    },
    async ({ project_id, rule_id }) => text(unwrap(await client.post(`${brainBase(project_id)}/rules/${encodeURIComponent(rule_id)}/promote`, {})))
  );

  server.tool(
    'list_retired_brain_rules',
    'List project rules Kolbo merged away or replaced while tidying the brain. Use when the user asks where a rule went; bring one back with restore_brain_rule.',
    { project_id: z.string().describe('Project ObjectId.') },
    async ({ project_id }) => text(unwrap(await client.get(`${brainBase(project_id)}/rules/retired`)))
  );

  server.tool(
    'restore_brain_rule',
    'Bring back a retired project rule (ids from list_retired_brain_rules).',
    {
      project_id: z.string().describe('Project ObjectId.'),
      rule_id: z.string().describe('Retired rule id.'),
    },
    async ({ project_id, rule_id }) => text(unwrap(await client.post(`${brainBase(project_id)}/rules/${encodeURIComponent(rule_id)}/restore`, {})))
  );

  const KINDS = ['skill', 'agent', 'source'];

  server.tool(
    'list_brain_playbooks',
    'List the project\'s playbooks: skills (how to do a recurring job here, e.g. "how we cut a trailer"), agents (a named helper with its own brief) and sources (reference material Kobi reads). with_body returns the full text.',
    {
      project_id: z.string().describe('Project ObjectId.'),
      kind: z.enum(KINDS).optional().describe('Only this kind.'),
      with_body: z.boolean().optional().describe('Include the full text of each playbook.'),
    },
    async ({ project_id, kind, with_body }) => {
      const q = new URLSearchParams({ ...(kind ? { kind } : {}), ...(with_body ? { withBody: 'true' } : {}) }).toString();
      return text(unwrap(await client.get(`${brainBase(project_id)}/playbooks` + (q ? `?${q}` : ''))));
    }
  );

  server.tool(
    'get_brain_playbook',
    'Read one playbook in full (kind + slug from list_brain_playbooks).',
    {
      project_id: z.string().describe('Project ObjectId.'),
      kind: z.enum(KINDS).describe('skill, agent or source.'),
      slug: z.string().describe('Playbook slug.'),
    },
    async ({ project_id, kind, slug }) => text(unwrap(await client.get(`${brainBase(project_id)}/playbooks/${kind}/${encodeURIComponent(slug)}`)))
  );

  server.tool(
    'save_brain_playbook',
    'Create a playbook, or replace one with the same name/slug (earlier versions are kept). Use it when the user wants Kobi to remember a whole process, a helper brief or reference text for this project.',
    {
      project_id: z.string().describe('Project ObjectId.'),
      kind: z.enum(KINDS).describe('skill = how to do a job, agent = a named helper brief, source = reference material.'),
      name: z.string().describe('Short name (up to 80 characters).'),
      description: z.string().optional().describe('One line: when to use it.'),
      body: z.string().describe('The full text, in markdown.'),
      slug: z.string().optional().describe('Existing slug to replace that playbook (from list_brain_playbooks).'),
    },
    async ({ project_id, kind, name, description, body, slug }) => text(unwrap(await client.post(`${brainBase(project_id)}/playbooks`, { kind, name, body, ...(description ? { description } : {}), ...(slug ? { slug } : {}) })))
  );

  server.tool(
    'delete_brain_playbook',
    'Delete a playbook (id from list_brain_playbooks). Confirm with the user first.',
    {
      project_id: z.string().describe('Project ObjectId.'),
      playbook_id: z.string().describe('Playbook id.'),
    },
    async ({ project_id, playbook_id }) => text(unwrap(await client.delete(`${brainBase(project_id)}/playbooks/${encodeURIComponent(playbook_id)}`)))
  );
}

module.exports = { registerBrainTools };
