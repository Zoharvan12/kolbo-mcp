/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg. Full rules: ../index.js top-of-file. */

const { z } = require('zod');
const FormData = require('form-data');
const { resolveToBuffer } = require('./_shared');
const { UI, uiResult, appsEnabled } = require('../apps');

function registerVoiceTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);
  // ─── list_voices ──────────────────────────────────────────────
  server.tool(
    'list_voices',
    'List available TTS voices for speech generation. Filter by language, gender, or provider to find the right voice. Returns voice_id, name, provider, language, gender, accent, description, styles, and preview_url for each voice. The catalogue runs to hundreds of voices, so results are paginated: filter first, then use `page` to walk the rest.',
    {
      language: z.string().optional().describe('Filter by language name (e.g. "english", "hebrew", "spanish", "french") or locale code ("he", "he-IL"). Case-insensitive partial match.'),
      gender: z.enum(['male', 'female']).optional().describe('Filter by gender.'),
      provider: z.string().optional().describe('Filter by provider (e.g. "elevenlabs", "google"). Omit for all providers.'),
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Results per page, max 200. Default: 60')
    },
    async ({ language, gender, provider, page, limit }) => {
      const params = new URLSearchParams();
      if (gender) params.set('gender', gender);
      if (provider) params.set('provider', provider);
      const withoutLanguage = `/v1/voices${params.toString() ? '?' + params.toString() : ''}`;

      const qs = new URLSearchParams(params);
      if (language) qs.set('language', language);
      const result = await client.get(`/v1/voices${qs.toString() ? '?' + qs.toString() : ''}`);

      let voices = result.voices || [];
      // Safety net for a server whose `language` matching is narrower than this
      // arg promises (it was once an exact match, so "he" / "heb" returned
      // nothing). An empty list reads to the model as "Kolbo has no Google
      // Hebrew voices at all", which is how a whole provider goes missing.
      // Retry ONCE, unfiltered, and match locally — only on the empty path, so
      // the normal call still costs one request.
      if (voices.length === 0 && language) {
        const l = language.toLowerCase();
        const all = await client.get(withoutLanguage);
        voices = (all.voices || []).filter(v =>
          [v.language, v.language_code, v.languageCode]
            .some(x => String(x || '').toLowerCase().includes(l)));
      }
      if (voices.length === 0) {
        return {
          content: [{ type: 'text', text: 'No voices found matching those filters.' }]
        };
      }

      // The unfiltered catalog measured 190,286 chars — past what hosts accept — so
      // only a slice can ever come back. Page it instead of truncating it: the API
      // returns the whole filtered set, the window is picked here. Without `page`
      // every voice past the first 60 was simply unreachable.
      const VOICE_CAP = 60;
      const perPage = Math.min(Math.max(Math.trunc(limit) || VOICE_CAP, 1), 200);
      const pageNum = Math.max(Math.trunc(page) || 1, 1);
      const pageCount = Math.ceil(voices.length / perPage);
      const start = (pageNum - 1) * perPage;
      const shownVoices = voices.slice(start, start + perPage);

      if (shownVoices.length === 0) {
        return {
          content: [{ type: 'text', text: `Page ${pageNum} is past the end — ${voices.length} voice(s) match those filters (${pageCount} page(s) at ${perPage} per page).` }]
        };
      }

      const lines = shownVoices.map(v => {
        const tags = [v.language, v.gender, v.accent].filter(Boolean).join(' · ');
        const styles = Array.isArray(v.styles) && v.styles.length ? ` | styles: ${v.styles.join(', ')}` : '';
        const v3 = v.v3_optimized ? ' [v3]' : '';
        return `${v.voice_id} — ${v.name} (${v.provider})${v3}\n   ${tags}${styles}${v.description ? `\n   ${v.description}` : ''}`;
      });

      const more = voices.length - (start + shownVoices.length);
      const narrowHint = more > 0
        ? `\n\n…and ${more} more. Pass \`page: ${pageNum + 1}\` for the next ${perPage}, or narrow with \`language\` / \`gender\` / \`provider\`.`
        : '';
      const range = `${start + 1}–${start + shownVoices.length}`;
      const text = `Available voices (showing ${range} of ${voices.length}, page ${pageNum}/${pageCount}):\n\n${lines.join('\n\n')}${narrowHint}\n\nUse the "voice_id" value in generate_speech calls.`;

      // Ship structuredContent UNCONDITIONALLY. Gating on ui() left every host that
      // renders widgets without advertising MCP Apps (Kolbo Code) with text-only rows
      // that carry no thumbnail field at all — and its BY_TOOL map still force-mounts
      // the media grid on them, so the card rendered one broken-file glyph per cell.
      // media.js and listResult() have always done it this way; these five lagged.
      {
        return uiResult(UI.mediaGrid, text, {
          widget: 'media-grid',
          title: 'Voices',
          items: shownVoices.map(v => ({
            id: v.voice_id,
            title: v.name,
            subtitle: [v.provider, v.language, v.gender, v.accent].filter(Boolean).join(' · '),
            media_type: 'audio',
            thumbnail: v.thumbnail || null,
            preview_audio: v.preview_url,
            use_hint: 'Use voice "{TITLE}" (voice_id: {ID}) for text-to-speech — ask me what text to speak.'
          })),
          total: voices.length,
          has_more: more > 0
        });
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  // ─── clone_voice ───────────────────────────────────────────
  server.tool(
    'clone_voice',
    'Clone a custom TTS voice from an audio sample (the user\'s voice or any voice they own the rights to). Costs credits (provider-dependent) — confirm with the user before firing. Providers: "elevenlabs" (recommended, 2s–180s sample) or "deepdub" (2s–300s). After cloning, the voice appears in `list_voices` and can be used with generate_speech. Free plan caps at 3 custom voices.',
    {
      audio: z.string().describe('URL or absolute local path of the voice sample audio (any common format; converted server-side).'),
      voice_name: z.string().describe('Name for the cloned voice.'),
      provider: z.enum(['elevenlabs', 'deepdub']).optional().describe('Cloning provider. Default: elevenlabs (recommended).'),
      language: z.string().optional().describe('Optional language hint (auto-detected when omitted).'),
      project_id: z.string().optional().describe('Project to associate the voice with (from list_projects). Omit for the default project.')
    },
    async ({ audio, voice_name, provider, language, project_id }) => {
      const resolved = await resolveToBuffer(audio, 'audio');
      const form = new FormData();
      form.append('audioFile', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
      form.append('voiceName', voice_name);
      form.append('provider', provider || 'elevenlabs');
      if (language) form.append('language', language);
      if (project_id) form.append('project_id', project_id);
      const result = await client.postMultipart('/v1/voices/clone', form);
      return { content: [{ type: 'text', text: JSON.stringify({ voice: result.voice || result, _hint: 'Use this voice with generate_speech (find it via list_voices).' }, null, 2) }] };
    }
  );

  // ─── import_elevenlabs_voice ───────────────────────────────
  server.tool(
    'import_elevenlabs_voice',
    'Import a voice from the ElevenLabs voice library into the user\'s Kolbo voices by its ElevenLabs voice ID. Use when the user already has/knows a specific ElevenLabs voice they want available for generate_speech.',
    {
      elevenlabs_voice_id: z.string().describe('The ElevenLabs voice ID to import.'),
      project_id: z.string().optional().describe('Project to associate the voice with. Omit for the default project.')
    },
    async ({ elevenlabs_voice_id, project_id }) => {
      const body = { elevenLabsVoiceId: elevenlabs_voice_id };
      if (project_id) body.project_id = project_id;
      const result = await client.post('/v1/voices/import-elevenlabs', body);
      return { content: [{ type: 'text', text: JSON.stringify(result.voice || result, null, 2) }] };
    }
  );

  // ─── delete_voice ──────────────────────────────────────────
  server.tool(
    'delete_voice',
    'Delete one of the user\'s custom cloned voices (owner only, soft delete). Preset/platform voices cannot be deleted. Confirm with the user first.',
    { voice_id: z.string().describe('The custom voice id to delete (from list_voices — custom voices only).') },
    async ({ voice_id }) => {
      const result = await client.delete(`/v1/voices/${encodeURIComponent(voice_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerVoiceTools };
