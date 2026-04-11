/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');

function registerModelTools(server, client) {
  // ─── list_models ───────────────────────────────────────────
  server.tool(
    'list_models',
    'List available AI models on Kolbo. Filter by type to find models for a specific generation type.',
    {
      type: z.string().optional().describe('Filter by type: "image", "video", "video_from_image", "music", "speech", "sound". Omit for all models.')
    },
    async ({ type }) => {
      const path = type ? `/v1/models?type=${encodeURIComponent(type)}` : '/v1/models';
      const result = await client.get(path);

      // Format for readability
      const summary = result.models.map(m =>
        `${m.identifier} (${m.name}) - ${m.credit} credits${m.recommended ? ' [RECOMMENDED]' : ''}${m.new_model ? ' [NEW]' : ''}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `Available models (${result.count}):\n\n${summary}\n\nUse the "identifier" value as the "model" parameter in generate tools.`
        }]
      };
    }
  );

  // ─── check_credits ─────────────────────────────────────────
  server.tool(
    'check_credits',
    'Check your remaining Kolbo credit balance.',
    {},
    async () => {
      const result = await client.get('/v1/account/credits');

      return {
        content: [{
          type: 'text',
          text: `Credit Balance:\n- Total: ${result.credits.total}\n- Plan credits: ${result.credits.plan_credits}\n- Credit pack: ${result.credits.credit_pack}\n- Redemption: ${result.credits.redemption}`
        }]
      };
    }
  );
}

module.exports = { registerModelTools };
