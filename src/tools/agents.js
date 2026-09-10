/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { listResult } = require('../apps');

/**
 * Skills rename (2026-09-09). The product surface is called Skills; the original tools
 * were called *_agent. Because a published tool name can never be withdrawn (commandment
 * above), every tool is registered TWICE from one definition:
 *
 *   list_skill s/create_skill/update_skill/delete_skill  — current vocabulary
 *   list_agents/create_agent/update_agent/delete_agent   — original, still supported
 *
 * Same handler, same behaviour. Only the tool name, the id ARG name (`skill_id` vs the
 * original `agent_id`) and the prose differ — the legacy arg name must keep working
 * exactly as published, so it is not renamed, only shadowed by the new one.
 *
 * The server route is `/v1/skills`, which the backend also serves at `/v1/agents`.
 */
function registerAgentTools(server, client) {
  registerSkillCrud(server, client, { noun: 'skill', idArg: 'skill_id', suffix: 'skill', plural: 'skills' });
  registerSkillCrud(server, client, { noun: 'agent', idArg: 'agent_id', suffix: 'agent', plural: 'agents' });
}

function registerSkillCrud(server, client, { noun, idArg, suffix, plural }) {
  const legacyNote = noun === 'agent'
    ? ' NOTE: "agent" is the original name for this feature; the product now calls them Skills. New integrations should prefer list_skills/create_skill/update_skill/delete_skill — these keep working unchanged.'
    : '';
  const idDesc = `${noun[0].toUpperCase() + noun.slice(1)} id (from list_${plural}).`;

  // ─── list_skills / list_agents ─────────────────────────────
  server.tool(
    `list_${plural}`,
    `List the user's custom ${plural} (personal + any platform/org preset ${plural} visible to them). A ${noun} is a reusable, named persona for the chat tool — its \`description\` is the system instruction the model adopts. Use this to resolve a ${noun} NAME the user mentioned into its id, or to show what ${plural} exist. Returns id, name, description, emoji, is_global. Personal ${plural} (is_global:false) are editable/deletable; platform presets are not.${legacyNote}`,
    { search: z.string().optional().describe('Optional case-insensitive name filter.') },
    async ({ search }) => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const result = await client.get(`/v1/skills${qs}`);
      const agents = result.agents || [];
      const text = JSON.stringify({
        agents,
        count: result.count || agents.length
      }, null, 2);

      return listResult(text, {
        widget: 'list',
        title: noun === 'skill' ? 'Your Skills' : 'Your Agents',
        items: agents.map(a => ({
          id: a.id,
          title: (a.emoji ? a.emoji + ' ' : '') + a.name,
          subtitle: a.description,
          badge: a.is_global ? 'preset' : null,
          use_hint: `Use my "{TITLE}" ${noun} (${idArg}: {ID}) for this conversation.`
        })),
        total: agents.length
      });
    }
  );

  // ─── create_skill / create_agent ───────────────────────────
  server.tool(
    `create_${suffix}`,
    `Create a reusable custom ${noun} (a named persona for the chat tool). The \`description\` IS the ${noun}'s system instruction — write it as the persona + behavior you want ("You are a senior creative director. Turn any brief into a structured shot list…"). Use when the user wants a persistent, reusable assistant ("make me a creative-director ${noun}", "set up a support-triage bot"). For a ONE-OFF persona on a single conversation, pass \`system_prompt\` to chat_send_message instead — no need to create a ${noun}. Plan limits apply (server rejects when the ${noun} cap is reached).${legacyNote}`,
    {
      name: z.string().optional().describe(`${noun[0].toUpperCase() + noun.slice(1)} name. If omitted, a name is generated from the description.`),
      description: z.string().describe(`The ${noun} persona + instructions (max 2000 chars). This becomes the system prompt the model adopts in every conversation that uses the ${noun}.`),
      emoji: z.string().optional().describe('Optional emoji avatar (auto-picked if omitted).'),
      thumbnail: z.string().optional().describe('Optional thumbnail image URL.')
    },
    async ({ name, description, emoji, thumbnail }) => {
      const body = { description };
      if (name !== undefined) body.name = name;
      if (emoji !== undefined) body.emoji = emoji;
      if (thumbnail !== undefined) body.thumbnail = thumbnail;
      const result = await client.post('/v1/skills', body);
      return { content: [{ type: 'text', text: JSON.stringify({ agent: result.agent, _hint: `Reuse this ${noun} by selecting it in the chat tool. Its description is the system instruction applied to every conversation using it.` }, null, 2) }] };
    }
  );

  // ─── update_skill / update_agent ───────────────────────────
  server.tool(
    `update_${suffix}`,
    `Edit a custom ${noun} in place: name, description (persona/instructions), or emoji/thumbnail. NEVER delete and recreate a ${noun} to change its persona — conversations already reference this id. Only personal ${plural} you own can be edited — platform presets are protected. Resolve the id with list_${plural} first.${legacyNote}`,
    {
      [idArg]: z.string().describe(idDesc),
      name: z.string().optional().describe('New name.'),
      description: z.string().optional().describe('New persona/instructions (replaces the old description; max 2000 chars).'),
      emoji: z.string().optional().describe('New emoji avatar.'),
      thumbnail: z.string().optional().describe('New thumbnail image URL.')
    },
    async (args) => {
      const id = args[idArg];
      const { name, description, emoji, thumbnail } = args;
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (emoji !== undefined) body.emoji = emoji;
      if (thumbnail !== undefined) body.thumbnail = thumbnail;
      const result = await client.put(`/v1/skills/${encodeURIComponent(id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify({ agent: result.agent }, null, 2) }] };
    }
  );

  // ─── delete_skill / delete_agent ───────────────────────────
  server.tool(
    `delete_${suffix}`,
    `Delete a custom ${noun} you own. Platform preset ${plural} cannot be deleted. This removes the ${noun} config only — it does not touch any conversations that used it.${legacyNote}`,
    { [idArg]: z.string().describe(idDesc) },
    async (args) => {
      const result = await client.delete(`/v1/skills/${encodeURIComponent(args[idArg])}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerAgentTools };
