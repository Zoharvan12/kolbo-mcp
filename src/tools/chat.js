/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { pollUntilDone } = require('../polling');

function registerChatTools(server, client) {
  // ─── chat_send_message ─────────────────────────────────────
  server.tool(
    'chat_send_message',
    'Send a chat message to Kolbo AI. Starts a new conversation (omit session_id) or continues an existing one. Returns the assistant response when complete. Supports web search and deep think modes.',
    {
      message: { type: 'string', description: 'The user message to send' },
      model: { type: 'string', description: 'Model identifier (e.g. "gpt-4o", "claude-sonnet-4-5"). Omit for Smart Select (auto).' },
      session_id: { type: 'string', description: 'Existing chat session ID to continue. Omit to start a new conversation.' },
      system_prompt: { type: 'string', description: 'System prompt for the conversation. Only applied when creating a new session.' },
      web_search: { type: 'boolean', description: 'Enable web search for this message. Default: false' },
      deep_think: { type: 'boolean', description: 'Enable deep think (extended reasoning). Default: false' },
      enhance_prompt: { type: 'boolean', description: 'Enhance the prompt. Default: true' }
    },
    async ({ message, model, session_id, system_prompt, web_search, deep_think, enhance_prompt }) => {
      const gen = await client.post('/v1/chat', {
        message,
        model,
        session_id,
        system_prompt,
        web_search,
        deep_think,
        enhance_prompt
      });

      // Deep think reasoning can run far longer than normal chat. Also grant
      // extra time when web_search is on (may fetch + analyze multiple pages).
      const timeout = deep_think ? 600000 : (web_search ? 240000 : 120000);

      const result = await pollUntilDone(client, gen.message_id, {
        interval: (gen.poll_interval_hint || 2) * 1000,
        timeout
      });

      // Chat status shape (from extractResult in kolbo-api sdk/controller.js):
      // { content, reasoning_content, image_urls?, video_urls?, audio_urls?, model, created_at }
      const r = result.result || {};
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
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
    'List your SDK chat conversations, most-recent first. Returns session_id, name, and activity timestamps.',
    {
      page: { type: 'number', description: 'Page number, 1-indexed. Default: 1' },
      limit: { type: 'number', description: 'Results per page, max 50. Default: 20' }
    },
    async ({ page, limit }) => {
      const params = new URLSearchParams();
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));

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
      session_id: { type: 'string', description: 'The chat session ID' },
      page: { type: 'number', description: 'Page number, 1-indexed. Default: 1' },
      limit: { type: 'number', description: 'Messages per page, max 100. Default: 50' }
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
