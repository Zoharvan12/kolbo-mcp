/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg. Full rules: ../index.js top-of-file. */

const { z } = require('zod');
const { UI, uiResult, appsEnabled } = require('../apps');

function registerVoiceTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);
  // ─── list_voices ──────────────────────────────────────────────
  server.tool(
    'list_voices',
    'List available TTS voices for speech generation. Filter by language, gender, or provider to find the right voice. Returns voice_id, name, provider, language, gender, accent, description, styles, and preview_url for each voice.',
    {
      language: z.string().optional().describe('Filter by language name (e.g. "english", "hebrew", "spanish", "french"). Case-insensitive partial match.'),
      gender: z.enum(['male', 'female']).optional().describe('Filter by gender.'),
      provider: z.string().optional().describe('Filter by provider (e.g. "elevenlabs", "google"). Omit for all providers.')
    },
    async ({ language, gender, provider }) => {
      const params = new URLSearchParams();
      if (language) params.set('language', language);
      if (gender) params.set('gender', gender);
      if (provider) params.set('provider', provider);

      const path = `/v1/voices${params.toString() ? '?' + params.toString() : ''}`;
      const result = await client.get(path);

      const voices = result.voices || [];
      if (voices.length === 0) {
        return {
          content: [{ type: 'text', text: 'No voices found matching those filters.' }]
        };
      }

      const lines = voices.map(v => {
        const tags = [v.language, v.gender, v.accent].filter(Boolean).join(' · ');
        const styles = Array.isArray(v.styles) && v.styles.length ? ` | styles: ${v.styles.join(', ')}` : '';
        const v3 = v.v3_optimized ? ' [v3]' : '';
        return `${v.voice_id} — ${v.name} (${v.provider})${v3}\n   ${tags}${styles}${v.description ? `\n   ${v.description}` : ''}`;
      });

      const text = `Available voices (${voices.length}):\n\n${lines.join('\n\n')}\n\nUse the "voice_id" value in generate_speech calls.`;

      if (ui()) {
        return uiResult(UI.mediaGrid, text, {
          widget: 'media-grid',
          title: 'Voices',
          items: voices.slice(0, 24).map(v => ({
            id: v.voice_id,
            title: v.name,
            subtitle: [v.provider, v.language, v.gender, v.accent].filter(Boolean).join(' · '),
            media_type: 'audio',
            preview_audio: v.preview_url,
            use_hint: 'Use voice "{TITLE}" (voice_id: {ID}) for text-to-speech — ask me what text to speak.'
          })),
          total: voices.length,
          has_more: voices.length > 24
        });
      }

      return { content: [{ type: 'text', text }] };
    }
  );
}

module.exports = { registerVoiceTools };
