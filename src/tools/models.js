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
      type: z.string().optional().describe('Filter by DB type name: "text_to_img", "image_editing", "text_to_video", "img_to_video", "draw_to_video", "video_to_video", "elements", "firstlastgenerations", "lipsync-image", "lipsync-video", "music_gen", "text_to_speech", "text_to_sound", "stt", "text". Legacy aliases also accepted: "image", "image_edit", "video", "video_from_image", "video_from_video", "music", "speech", "sound", "chat", "lipsync" (both lipsync types), "three_d" (all 3D types), "first_last_frame", "transcription". Omit for all models.')
    },
    async ({ type }) => {
      const path = type ? `/v1/models?type=${encodeURIComponent(type)}` : '/v1/models';
      const result = await client.get(path);

      // Split into auto-selectable (has summary) and named-only (no summary)
      const withSummary = result.models.filter(m => m.summary && m.summary.trim() !== '');
      const withoutSummary = result.models.filter(m => !m.summary || m.summary.trim() === '');

      // Format the per-model spec line. The agent NEEDS this — without it,
      // it has to guess `supported_resolutions`/`supported_durations` and
      // either invents values (then the API silently substitutes) or asks
      // the user to clarify what's only knowable from this list.
      const formatSpecs = m => {
        const parts = [];

        if (Array.isArray(m.supported_resolutions) && m.supported_resolutions.length) {
          const mult = m.resolution_multipliers || {};
          parts.push(
            'resolutions: ' +
              m.supported_resolutions
                .map(r => (mult[r] != null && mult[r] !== 1 ? `${r} (${mult[r]}×)` : r))
                .join(' · ')
          );
        }

        if (Array.isArray(m.supported_durations) && m.supported_durations.length) {
          const ds = m.supported_durations;
          // Compact ranges like 4-15 if it's a contiguous run.
          const sorted = [...ds].sort((a, b) => a - b);
          const isRange = sorted.length > 2 && sorted.every((v, i) => i === 0 || v - sorted[i - 1] === 1);
          parts.push(`durations: ${isRange ? `${sorted[0]}-${sorted[sorted.length - 1]}s` : sorted.join('/') + 's'}`);
        }

        if (Array.isArray(m.supported_aspect_ratios) && m.supported_aspect_ratios.length) {
          parts.push(`aspect: ${m.supported_aspect_ratios.join(', ')}`);
        }

        // Elements-type caps (only show when at least one is non-zero)
        const eImg = m.elements_max_images, eVid = m.elements_max_videos, eAud = m.elements_max_audio;
        if ((eImg ?? 0) > 0 || (eVid ?? 0) > 0 || (eAud ?? 0) > 0) {
          parts.push(`elements: ${eImg ?? 0} imgs / ${eVid ?? 0} vids / ${eAud ?? 0} audio`);
        }

        // Video-to-video / multi-input caps
        const mImg = m.max_images, mVid = m.max_videos, mElm = m.max_elements;
        if ((mImg ?? 0) > 0 || (mVid ?? 0) > 0 || (mElm ?? 0) > 0) {
          parts.push(`refs: ${mImg ?? 0} imgs / ${mVid ?? 0} vids / ${mElm ?? 0} elms`);
        }

        if ((m.max_visual_dna ?? 0) > 0) parts.push(`max_dna: ${m.max_visual_dna}`);

        // Sound (only show when sound costs more or is generated natively)
        if (m.sound_generation_type === 'native') {
          const mult = m.sound_credit_multiplier && m.sound_credit_multiplier !== 1
            ? ` (${m.sound_credit_multiplier}×)`
            : '';
          parts.push(`sound: native${mult}${m.sound_enabled_by_default ? ' on-by-default' : ''}`);
        }

        if (m.max_audio_duration != null) parts.push(`audio_max: ${m.max_audio_duration}s`);

        return parts.length ? `\n   ${parts.join(' | ')}` : '';
      };

      const formatModel = m =>
        `${m.identifier} (${m.name}) - ${m.credit} credits${m.recommended ? ' [RECOMMENDED]' : ''}${m.new_model ? ' [NEW]' : ''}${m.summary ? ` — ${m.summary}` : ''}${formatSpecs(m)}`;

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
