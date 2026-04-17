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
      type: z.string().optional().describe('Filter by type: "image", "image_edit", "video", "video_from_image", "video_from_video", "music", "speech", "sound", "chat", "lipsync", "three_d", "elements", "first_last_frame", "transcription". Omit for all models.')
    },
    async ({ type }) => {
      const path = type ? `/v1/models?type=${encodeURIComponent(type)}` : '/v1/models';
      const result = await client.get(path);

      // Split into auto-selectable (has summary) and named-only (no summary)
      const withSummary = result.models.filter(m => m.summary && m.summary.trim() !== '');
      const withoutSummary = result.models.filter(m => !m.summary || m.summary.trim() === '');

      const formatModel = m =>
        `${m.identifier} (${m.name}) - ${m.credit} credits${m.recommended ? ' [RECOMMENDED]' : ''}${m.new_model ? ' [NEW]' : ''}${m.summary ? ` — ${m.summary}` : ''}`;

      const sections = [];
      if (withSummary.length > 0) {
        sections.push(`Auto-selectable models (${withSummary.length}) — safe to pick based on quality + cost:\n${withSummary.map(formatModel).join('\n')}`);
      }
      if (withoutSummary.length > 0) {
        sections.push(`Named-only models (${withoutSummary.length}) — only use if the user explicitly requests by name:\n${withoutSummary.map(formatModel).join('\n')}`);
      }

      return {
        content: [{
          type: 'text',
          text: `Available models (${result.count}):\n\n${sections.join('\n\n')}\n\nUse the "identifier" value as the "model" parameter in generate tools.`
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
