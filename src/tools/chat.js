/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { pollOrTimedOut, creditFields, projectIdField } = require('./_shared');
const { canonicalModelId } = require('../apps');

function registerChatTools(server, client) {
  // ─── chat_send_message ─────────────────────────────────────
  server.tool(
    'chat_send_message',
    'Send a chat message to Kolbo AI. Starts a new conversation (omit session_id) or continues an existing one. Returns the assistant response when complete. Supports image/video/audio analysis via media_urls — pass public URLs and the model auto-routes to a vision-capable model (e.g. Gemini) when media is detected. Supports web search and deep think modes.',
    {
      message: z.string().describe('The user message to send'),
      model: z.string().optional().describe('Model identifier from list_models type="text". Identifiers resolve leniently, so the DISPLAY NAME that list_models shows works too ("Grok 4.5" → its identifier). Do NOT hardcode an id you have not seen in list_models — the text catalog turns over fast. Prefer passing a SPECIFIC model — omitting falls back to Smart Select auto-routing, which we avoid unless the user explicitly asks for auto-pick. Choose it by matching the task to each model\'s STRENGTHS SUMMARY in `list_models type="text"` — not by the newest/biggest name. Chat bills PER TOKEN, so the listed credit number is not the cost: a frontier model (Claude Fable 5, GPT-5.6 Sol, Pro-class) costs 5-30x a mid-tier one per reply. Default ordinary chat (writing, brainstorming, Q&A, summarising) to a balanced mid-tier model whose summary covers the task (Claude Sonnet, Gemini Flash, GPT nano/mini class) and reserve the frontier tier for hard reasoning or long-form code the user asked for. Exception: when media_urls contains video or audio, omitting is fine — routing goes to a Gemini vision model regardless of this field.'),
      session_id: z.string().optional().describe('Existing chat session ID to continue. Omit to start a new conversation.'),
      system_prompt: z.string().optional().describe('System prompt for the conversation. Only applied when creating a new session.'),
      web_search: z.boolean().optional().describe('Enable web search for this message. Default: false'),
      deep_think: z.boolean().optional().describe('Enable deep think (extended reasoning). Default: false'),
      thinking_level: z.string().optional().describe('Thinking effort ID from list_models type="text" thinkingLevels. The server uses the model catalog default when omitted or invalid. Separate from legacy deep_think; safeguards take precedence.'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: false — only pass true if the user explicitly asks to enhance/improve the prompt.'),
      media_urls: z.array(z.string()).optional().describe('Public URLs of images, videos, or audio files to analyze. The model auto-routes to a vision-capable model when media is present. For a local file, get a URL first via the LOCAL FILE route in this tool\'s description.'),
      project_id: projectIdField
    },
    async ({ message, model, session_id, system_prompt, web_search, deep_think, thinking_level, enhance_prompt = false, media_urls, project_id }) => {
      // Every generate_* tool resolves its model this way; chat was the one
      // `model` arg that went straight to the API, which has no fuzzy matching.
      // So the display names list_models hands back ("Claude Fable 5") came
      // back as a bare `Model not found: Claude Fable 5 [MODEL_NOT_FOUND]` —
      // discovery had no path to use.
      model = await canonicalModelId(client, model, 'text'); // lenient id resolution ("Grok 4.5" → its identifier)

      const gen = await client.post('/v1/chat', {
        message,
        model,
        session_id,
        system_prompt,
        web_search,
        deep_think,
        ...(thinking_level !== undefined ? { thinking_level } : {}),
        enhance_prompt,
        media_urls,
        project_id
      });

      // Return before host cutoff (150s) even for deep think / web search.
      // The LLM can call this tool again with the same session_id to continue.
      const timeout = 150000;

      const poll = await pollOrTimedOut(client, gen.message_id, {
        interval: (gen.poll_interval_hint || 2) * 1000,
        timeout
      });
      if (poll.timedOut) return poll.timedOut;
      const result = poll.result;

      // Chat status shape (from extractResult in kolbo-api sdk/controller.js):
      // { content, reasoning_content, image_urls?, video_urls?, audio_urls?, model, created_at }
      const r = result.result || {};
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            session_id: gen.session_id,
            message_id: gen.message_id,
            model: r.model || gen.model,
            content: r.content || '',
            reasoning_content: r.reasoning_content || null,
            image_urls: r.image_urls || null,
            video_urls: r.video_urls || null,
            audio_urls: r.audio_urls || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── chat_list_conversations ───────────────────────────────
  server.tool(
    'chat_list_conversations',
    'List the user\'s chat conversations across ALL projects, most-recent first. Returns session_id, name, project_id, and activity timestamps. Pass `project_id` to narrow to one project (resolve names via `list_projects`).',
    {
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Results per page, max 50. Default: 20'),
      project_id: z.string().optional().describe('Restrict to conversations in one project (Mongo ObjectId from `list_projects`). Omit to list across all projects.')
    },
    async ({ page, limit, project_id }) => {
      const params = new URLSearchParams();
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      if (project_id) params.set('project_id', project_id);

      const qs = params.toString();
      const result = await client.get(`/v1/chat/conversations${qs ? '?' + qs : ''}`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            conversations: result.conversations || [],
            pagination: result.pagination || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── chat_get_messages ─────────────────────────────────────
  server.tool(
    'chat_get_messages',
    'Fetch messages in a chat conversation. Returns role, content, model, and any media URLs attached to each message.',
    {
      session_id: z.string().describe('The chat session ID'),
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Messages per page, max 100. Default: 50')
    },
    async ({ session_id, page, limit }) => {
      const params = new URLSearchParams();
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));

      const qs = params.toString();
      const result = await client.get(
        `/v1/chat/conversations/${encodeURIComponent(session_id)}/messages${qs ? '?' + qs : ''}`
      );

      // Trim each message to avoid flooding context.
      const messages = (result.messages || []).map(m => ({
        role: m.role,
        content: m.content,
        model: m.model?.name || m.model?.identifier || null,
        status: m.status,
        created_at: m.createdAt || m.created_at,
        image_url: m.image_url || null,
        video_url: m.video_url || null,
        audio_url: m.audio_url || null
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            messages,
            pagination: result.pagination || null
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerChatTools };
