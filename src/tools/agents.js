/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');

function registerAgentTools(server, client) {
  // ─── list_agents ───────────────────────────────────────────
  server.tool(
    'list_agents',
    'List the user\'s custom chat agents (personal + any global/org preset agents visible to them). A custom agent is a reusable, named persona for the chat tool — its `description` is the system instruction the model adopts. Use this to resolve an agent NAME the user mentioned into its id, or to show what agents exist. Returns id, name, description, emoji, is_global. Personal agents (is_global:false) are editable/deletable; global presets are not.',
    { search: z.string().optional().describe('Optional case-insensitive name filter.') },
    async ({ search }) => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const result = await client.get(`/v1/agents${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify({
        agents: result.agents || [],
        count: result.count || (result.agents || []).length
      }, null, 2) }] };
    }
  );

  // ─── create_agent ──────────────────────────────────────────
  server.tool(
    'create_agent',
    'Create a reusable custom chat agent (a named persona for the chat tool). The `description` IS the agent\'s system instruction — write it as the persona + behavior you want ("You are a senior creative director. Turn any brief into a structured shot list…"). Use when the user wants a persistent, reusable assistant ("make me a creative-director agent", "set up a support-triage bot"). For a ONE-OFF persona on a single conversation, pass `system_prompt` to chat_send_message instead — no need to create an agent. Plan limits apply (server rejects when the custom-agent cap is reached).',
    {
      name: z.string().optional().describe('Agent name. If omitted, a name is generated from the description.'),
      description: z.string().describe('The agent persona + instructions (max 2000 chars). This becomes the system prompt the model adopts in every conversation that uses the agent.'),
      emoji: z.string().optional().describe('Optional emoji avatar (auto-picked if omitted).'),
      thumbnail: z.string().optional().describe('Optional thumbnail image URL.')
    },
    async ({ name, description, emoji, thumbnail }) => {
      const body = { description };
      if (name !== undefined) body.name = name;
      if (emoji !== undefined) body.emoji = emoji;
      if (thumbnail !== undefined) body.thumbnail = thumbnail;
      const result = await client.post('/v1/agents', body);
      return { content: [{ type: 'text', text: JSON.stringify({ agent: result.agent, _hint: 'Reuse this agent by selecting it in the chat tool. Its description is the system instruction applied to every conversation using it.' }, null, 2) }] };
    }
  );

  // ─── update_agent ──────────────────────────────────────────
  server.tool(
    'update_agent',
    'Update a custom chat agent\'s name, description (persona/instructions), or emoji/thumbnail. Only personal agents you own can be edited — global preset agents are protected. Resolve the agent id with list_agents first.',
    {
      agent_id: z.string().describe('Agent id (from list_agents).'),
      name: z.string().optional().describe('New name.'),
      description: z.string().optional().describe('New persona/instructions (replaces the old description; max 2000 chars).'),
      emoji: z.string().optional().describe('New emoji avatar.'),
      thumbnail: z.string().optional().describe('New thumbnail image URL.')
    },
    async ({ agent_id, name, description, emoji, thumbnail }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (emoji !== undefined) body.emoji = emoji;
      if (thumbnail !== undefined) body.thumbnail = thumbnail;
      const result = await client.put(`/v1/agents/${encodeURIComponent(agent_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify({ agent: result.agent }, null, 2) }] };
    }
  );

  // ─── delete_agent ──────────────────────────────────────────
  server.tool(
    'delete_agent',
    'Delete a custom chat agent you own. Global preset agents cannot be deleted. This removes the agent config only — it does not touch any conversations that used it.',
    { agent_id: z.string().describe('Agent id (from list_agents).') },
    async ({ agent_id }) => {
      const result = await client.delete(`/v1/agents/${encodeURIComponent(agent_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerAgentTools };
