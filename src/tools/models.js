/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { UI, uiResult, appsEnabled, resolveAvatarUrl } = require('../apps');

// type name → human group label for the catalog widget
const TYPE_GROUPS = {
  text_to_img: 'Image Generation',
  text_to_video: 'Video Generation',
  img_to_video: 'Video Generation',
  music_gen: 'Music',
  text_to_speech: 'Voice',
  image_editing: 'Image Editing',
  video_to_video: 'Video to Video',
  elements: 'Elements',
};

function groupNameFor(m) {
  const t = (Array.isArray(m.types) && m.types[0]) || m.type || '';
  if (TYPE_GROUPS[t]) return TYPE_GROUPS[t];
  if (t === 'three_d' || String(t).startsWith('3d_')) return '3D';
  return 'Other';
}

function modelChips(m) {
  const chips = [];
  if (Array.isArray(m.supported_resolutions) && m.supported_resolutions.length) {
    const highest = [...m.supported_resolutions]
      .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
      .pop();
    if (highest) chips.push(String(highest));
  }
  if (Array.isArray(m.supported_durations) && m.supported_durations.length) {
    const ds = [...m.supported_durations].sort((a, b) => a - b);
    chips.push(ds.length > 1 ? `${ds[0]}-${ds[ds.length - 1]}s` : `${ds[0]}s`);
  }
  if (m.supports_visual_dna) chips.push('DNA');
  if (m.new_model || m.newModel) chips.push('NEW');
  return chips.slice(0, 3);
}

// structuredContent for ui://kolbo/catalog.html — see src/apps/widgets/catalog.js
// Deliberately CURATED, not exhaustive: the widget is a picker, not a database.
// Each group shows the recommended/new models (max 6), and the total count
// chip tells the user how many exist overall. Smart Select / "Auto" rows are
// deliberately EXCLUDED — we always want a specific model chosen (server
// instruction #9): auto-routing hides the model choice and the generation
// metadata used to read just "Auto".
function buildCatalogStructured(models, type, compact) {
  const groups = [];
  const byName = new Map();
  const isAuto = (m) => /^auto$|smart.select/i.test(String(m.name || '')) || /smart-select|k_auto/i.test(String(m.identifier || ''));

  // Recommended + new models float to the top of each group.
  const ranked = [...models].filter((m) => !isAuto(m)).sort((a, b) => {
    const score = (m) => (m.recommended ? 2 : 0) + (m.new_model || m.newModel ? 1 : 0);
    return score(b) - score(a);
  });

  for (const m of ranked) {
    const name = groupNameFor(m);
    let g = byName.get(name);
    if (!g) { g = { name, models: [] }; byName.set(name, g); groups.push(g); }
    if (g.models.length >= 6) continue; // curated cap — full list lives in the text payload
    g.models.push({
      name: m.name,
      // The widget renders `name`; the AGENT reads the same rows (hosts hand it
      // structuredContent). Without the identifier the default call was a dead
      // end — it named six models and gave no way to pass any of them on.
      identifier: m.identifier,
      icon: resolveAvatarUrl(m.avatar),
      description: String(m.smartSelect_StrengthsSummary || m.summary || m.description || '').slice(0, 90),
      chips: modelChips(m),
      use_hint: `Generate with the "${m.name}" model — ask me what I want to create first.`,
    });
  }
  groups.sort((a, b) => (a.name === 'Other' ? 1 : b.name === 'Other' ? -1 : 0));
  return {
    widget: 'catalog',
    title: 'Kolbo AI Models' + (type ? ' — ' + type : ''),
    total_available: models.length,
    compact: compact === true,
    groups,
  };
}

// One row per model — every identifier, nothing else. ~90 bytes/model, so the
// whole 400+ model catalog fits in a payload an agent can actually read.
const identifierRow = (m) => ({
  identifier: m.identifier,
  name: m.name,
  types: m.types,
  credit: m.credit,
  ...(m.recommended ? { recommended: true } : {}),
  ...(m.new_model ? { new_model: true } : {}),
});

function registerModelTools(server, client, options = {}) {
  const ui = () => appsEnabled(server, options);
  // ─── list_models ───────────────────────────────────────────
  server.tool(
    'list_models',
    'List available AI models on Kolbo. Filter by `type` to narrow to a generation type, and pass `format: "json"` to enumerate the catalog with exact identifiers — `format: "json"` + `type` returns the full raw model documents (every constraint field, for programmatic comparison / cap validation before submitting a generation); `format: "json"` alone returns a compact index of EVERY model and its identifier. Default `format: "text"` returns the human-readable summary. NEVER guess a model identifier: call this tool.',
    {
      type: z.string().optional().describe('Filter by DB type name: "text_to_img", "image_editing", "text_to_video", "img_to_video", "draw_to_video", "video_to_video", "elements", "firstlastgenerations", "lipsync-image", "lipsync-video", "music_gen", "text_to_speech", "text_to_sound", "stt", "text". Legacy aliases also accepted: "image", "image_edit", "video", "video_from_image", "video_from_video", "music", "speech", "sound", "chat", "lipsync" (both lipsync types), "three_d" (all 3D types), "first_last_frame", "transcription". Omit for all models.'),
      format: z.enum(['text', 'json']).optional().describe('Output format. "text" (default) returns a human-readable summary with the most-used caps. "json" is the source of truth for identifiers and caps: with `type` it returns the raw model documents from the API (identifier, credit, supported_durations, supported_resolutions, supported_aspect_ratios, max_reference_images, max_visual_dna, max_video_duration, …) for EVERY model of that type; without `type` it returns a compact index of every model in the catalog and its exact identifier. Use it whenever you need an identifier you have not seen listed, or must verify a cap before passing a value that might exceed a model-specific limit.'),
      display_catalog: z.boolean().optional().describe('Set true when the USER explicitly asked to see/browse the available models — the visual catalog opens expanded. Leave unset for internal lookups (verifying a model name, checking caps before a generation): the catalog stays collapsed to a single row the user can tap to browse.')
    },
    async ({ type, format, display_catalog }) => {
      // The tool DECLARATION always carries widget meta, so hosts that mount
      // from tools/list (Claude Code desktop) prepare an iframe on EVERY call.
      // Returning plain text for internal lookups left that iframe with no
      // data — a dead, empty "Widget from Kolbo list_models" shell. Always
      // ship structuredContent; `compact` tells the widget to render a single
      // "Browse models" row (expandable) instead of the full catalog, which is
      // what display_catalog was really asking for.
      const showCatalog = display_catalog === true;
      const path = type ? `/v1/models?type=${encodeURIComponent(type)}` : '/v1/models';
      const result = await client.get(path);

      // ⚠️ Hosts that mount this widget (claude.ai, Claude Code desktop) hand the
      // MODEL `structuredContent` and DROP `content[].text`. So every payload the
      // agent needs has to ride in structuredContent — shipping it as text only
      // makes it invisible. That is exactly how `format: "json"` came to return
      // the curated 6-per-group picker instead of the raw documents: v1.53.1
      // (406a51e) flipped `if (ui() && showCatalog)` → `if (ui())` on all three
      // return paths, so the widget payload started shadowing the real answer and
      // the other 43 text_to_video identifiers became undiscoverable by any MCP
      // call. On 2026-08-09 that cost a wrong-model generation (minimax-h3).
      // `extra` (json mode) carries the data as structured fields; without it the
      // full text payload is attached verbatim. The widget ignores both.
      const respond = (text, extra) => (ui()
        ? uiResult(UI.catalog, text, {
            ...buildCatalogStructured(result.models, type, !showCatalog),
            ...(extra || { text }),
          })
        : { content: [{ type: 'text', text }] });

      // JSON mode — the authoritative shape; every constraint the agent might
      // need to validate a request lives here (durations, reference caps,
      // audio/video min/max, resolution multipliers, supports_* flags,
      // prompt-length limits, etc.).
      if (format === 'json') {
        // Raw documents once `type` narrows the set (~49 docs for a video type).
        // Unfiltered that is 400+ documents / hundreds of KB, so return the
        // complete IDENTIFIER INDEX instead: every model stays enumerable and
        // the full caps are one `type` away.
        const payload = type
          ? { count: result.count, models: result.models }
          : {
              count: result.count,
              models: result.models.map(identifierRow),
              note: 'Compact index — every model in the catalog and its exact identifier. Re-call with `type` for the full documents (all caps, credit costs, supported_* fields).',
            };
        return respond(JSON.stringify(payload, null, 2), payload);
      }

      // Split into auto-selectable (has summary) and named-only (no summary)
      const withSummary = result.models.filter(m => m.summary && m.summary.trim() !== '');
      const withoutSummary = result.models.filter(m => !m.summary || m.summary.trim() === '');

      // Format the per-model spec line. The agent NEEDS this — without it,
      // it has to guess `supported_resolutions`/`supported_durations` and
      // either invents values (then the API silently substitutes) or asks
      // the user to clarify what's only knowable from this list.
      //
      // Rendering rule: emit a line for EVERY known constraint that is
      // applicable for this model's type — even when the value is 0 / null.
      // Hiding "0 cap" lines used to mean the agent couldn't distinguish
      // "this model rejects DNA" (cap = 0) from "I don't know" (field
      // missing). Now an explicit `max_dna: 0 (DNA not supported)` says the
      // model says no, and absence means the API doesn't expose the field.
      const formatSpecs = m => {
        const parts = [];
        const types = Array.isArray(m.types) ? m.types : [];
        const isVideoType = types.some(t =>
          ['text_to_video', 'img_to_video', 'video_to_video', 'elements',
           'firstlastgenerations', 'lipsync-image', 'lipsync-video', 'draw_to_video'].includes(t)
        );
        const isElements = types.includes('elements');
        const isV2V = types.includes('video_to_video');
        const isLipsyncVideo = types.includes('lipsync-video');
        const isLipsyncImage = types.includes('lipsync-image');
        const isImageEdit = types.includes('image_editing');
        const isImage = types.includes('text_to_img') || isImageEdit;

        if (Array.isArray(m.supported_resolutions) && m.supported_resolutions.length) {
          const mult = m.resolution_multipliers || {};
          parts.push(
            'resolutions: ' +
              m.supported_resolutions
                .map(r => (mult[r] != null && mult[r] !== 1 ? `${r} (${mult[r]}×)` : r))
                .join(' · ')
          );
        }

        // Output durations (video gen output, not source video)
        if (Array.isArray(m.supported_durations) && m.supported_durations.length) {
          const ds = m.supported_durations;
          const sorted = [...ds].sort((a, b) => a - b);
          const isRange = sorted.length > 2 && sorted.every((v, i) => i === 0 || v - sorted[i - 1] === 1);
          parts.push(`durations: ${isRange ? `${sorted[0]}-${sorted[sorted.length - 1]}s` : sorted.join('/') + 's'}`);
        } else if (isVideoType && (m.min_output_duration != null || m.max_output_duration != null)) {
          parts.push(`duration_range: ${m.min_output_duration ?? '?'}-${m.max_output_duration ?? '?'}s${m.default_duration != null ? ` (default ${m.default_duration}s)` : ''}`);
        }

        // Aspect ratios — prefer per-type override if set
        const ratios = m.supported_aspect_ratios_by_type
          ? Object.entries(m.supported_aspect_ratios_by_type).map(([t, arr]) => `${t}: ${arr.join('/')}`)
          : null;
        if (ratios) {
          parts.push(`aspect (per-type): ${ratios.join(' | ')}`);
        } else if (Array.isArray(m.supported_aspect_ratios) && m.supported_aspect_ratios.length) {
          parts.push(`aspect: ${m.supported_aspect_ratios.join(', ')}${m.default_aspect_ratio ? ` (default ${m.default_aspect_ratio})` : ''}`);
        }

        // Reference-input caps — show the slot relevant for this model family.
        // The same conceptual "max reference images" lives under THREE field
        // names depending on the model type. Be explicit about which is which
        // so the agent reads the right one.
        if (isImage || isImageEdit) {
          parts.push(`max_reference_images: ${m.max_reference_images ?? 0}${(m.max_reference_images ?? 0) === 0 ? ' (no refs)' : ''}`);
        }
        if (isElements) {
          parts.push(`elements caps: imgs=${m.elements_max_images ?? 0} · vids=${m.elements_max_videos ?? 0} · audio=${m.elements_max_audio ?? 0}`);
        }
        if (isV2V) {
          parts.push(`v2v ref caps: imgs=${m.max_images ?? 0} · vids=${m.max_videos ?? 0} · elements=${m.max_elements ?? 0} · audio=${m.max_audio ?? 0}`);
        }

        // Visual DNA cap — always show for image / elements / video, even if 0.
        // Use the authoritative supports_visual_dna flag when available; fall
        // back to inferring from cap > 0 for older API responses.
        const dnaSupported = typeof m.supports_visual_dna === 'boolean'
          ? m.supports_visual_dna
          : (m.max_visual_dna ?? 0) > 0;
        if (isImage || isVideoType) {
          const cap = m.max_visual_dna;
          if (dnaSupported && cap != null && cap > 0) parts.push(`max_visual_dna: ${cap}`);
          else if (dnaSupported && cap == null) parts.push('visual_dna: supported (no cap published — confirm before passing >3)');
          else parts.push('visual_dna: not supported');
        }

        // Source-video duration constraints — only matter for tools that take
        // an INPUT video (lipsync-video, video_to_video).
        if (isLipsyncVideo || isV2V) {
          if (m.min_video_duration != null || m.max_video_duration != null) {
            parts.push(`source_video: ${m.min_video_duration ?? '?'}-${m.max_video_duration ?? '?'}s`);
          }
        }

        // Audio input — lipsync, elements, music-driven flows.
        if (m.max_audio_duration != null || m.min_audio_duration != null) {
          parts.push(`audio_input: ${m.min_audio_duration ?? '?'}-${m.max_audio_duration ?? '?'}s${m.audio_max_follows_video_duration ? ' (max follows video)' : ''}`);
        }
        if (Array.isArray(m.supported_audio_formats) && m.supported_audio_formats.length) {
          parts.push(`audio_formats: ${m.supported_audio_formats.join('/')}`);
        }

        // Native sound generation (video models that emit synced audio)
        if (m.sound_generation_type === 'native') {
          const mult = m.sound_credit_multiplier && m.sound_credit_multiplier !== 1
            ? ` (${m.sound_credit_multiplier}×)`
            : '';
          parts.push(`sound: native${mult}${m.sound_enabled_by_default ? ' on-by-default' : ''}`);
        }

        // Prompt constraints
        if (m.requires_prompt === false) parts.push('prompt: optional');
        if (m.min_prompt_length != null || m.max_prompt_length != null) {
          parts.push(`prompt_length: ${m.min_prompt_length ?? 0}-${m.max_prompt_length ?? '∞'} chars`);
        }

        // Upload cap (when present)
        if (m.max_file_size != null) {
          const mb = Math.round(m.max_file_size / (1024 * 1024));
          parts.push(`max_file_size: ${mb}MB`);
        }

        // Images-per-request (Midjourney-style fixed-N output)
        if (m.images_per_request != null && m.images_per_request !== 1) {
          parts.push(`images_per_request: ${m.images_per_request}`);
        }

        // Quality tiers (image models that support quality selection)
        if (Array.isArray(m.supported_qualities) && m.supported_qualities.length) {
          const qMult = m.quality_multipliers || {};
          const qParts = m.supported_qualities.map(q =>
            qMult[q] && qMult[q] !== 1 ? `${q}(${qMult[q]}×)` : q
          );
          parts.push(`quality: ${qParts.join(' · ')}${m.default_quality ? ` (default ${m.default_quality})` : ''}`);
        }

        // Fixed-price override (some models charge a flat rate per resolution instead of per-second)
        if (m.flat_credit_by_resolution && typeof m.flat_credit_by_resolution === 'object' && Object.keys(m.flat_credit_by_resolution).length) {
          const fp = Object.entries(m.flat_credit_by_resolution).map(([k, v]) => `${k}:${v}cr`).join(' · ');
          parts.push(`flat_price: ${fp}`);
        }

        // Estimated generation time (wall-clock at base settings)
        if (m.estimated_duration_seconds != null) {
          parts.push(`est_time: ~${m.estimated_duration_seconds}s`);
        }

        // NSFW flag
        if (m.nsfw_only) {
          parts.push('nsfw: required');
        }

        return parts.length ? `\n   ${parts.join(' | ')}` : '';
      };

      // The FULL catalog with every spec line measured 140,590 chars — past what
      // hosts accept, on the one discovery tool the skill tells the model to call
      // when it is unsure. Unfiltered, emit the one-line form (enough to choose a
      // model); once `type` narrows it, the set is small enough for full specs.
      const detailed = !!type;
      // Summaries run to a paragraph each; across the whole catalog that alone
      // is most of the payload. Unfiltered, one clause is enough to choose by.
      const brief = (s) => {
        if (!s) return '';
        const flat = String(s).replace(/\s+/g, ' ').trim();
        return flat.length > 130 ? flat.slice(0, 127).trimEnd() + '…' : flat;
      };
      // Text models bill per token — the flat `credit` is not what the user pays,
      // so show the real per-1K rates when the API supplies them. Without this the
      // "cheapest model that fits" rule is unusable for chat.
      const cost = m => (m.output_token_rate != null
        ? `${m.input_token_rate ?? '?'}/${m.output_token_rate} credits per 1K tokens (in/out)`
        : `${m.credit} credits`);
      const formatModel = m =>
        `${m.identifier} (${m.name}) - ${cost(m)}${m.recommended ? ' [RECOMMENDED]' : ''}${m.new_model ? ' [NEW]' : ''}${m.summary ? ` — ${detailed ? m.summary : brief(m.summary)}` : ''}${detailed ? formatSpecs(m) : ''}`;

      const sections = [];

      if (!detailed) {
        // The catalog is ~428 models. Listing all of them is both far past the
        // text budget AND useless to choose from — so unfiltered, surface the
        // curated picks and make the model narrow by `type` for the rest. This
        // matches the connector rule of steering to a CONCRETE model.
        const picks = result.models.filter(m => m.recommended || m.new_model);
        if (picks.length) {
          sections.push(`Recommended & new (${picks.length}):\n${picks.map(formatModel).join('\n')}`);
        }
        const text = `Kolbo model catalog — ${result.count} models total.\n\n`
          + `${sections.join('\n\n')}\n\n`
          + 'This shortlist is BADGE-BASED (recommended/new) — it is not a recommendation to '
          + 'use the newest or biggest model. To pick properly, re-call with `type` and choose by '
          + 'each model\'s strengths summary, taking the cheapest one that covers the task. '
          + 'To see everything in a '
          + 'category (with per-model resolutions, durations, aspect ratios and reference-image '
          + 'caps), re-call with `type`:\n'
          + '  text_to_img · image_editing · text_to_video · img_to_video · video_to_video ·\n'
          + '  first_last_frame · elements · lipsync · music_gen · text_to_speech ·\n'
          + '  text_to_sound · stt · three_d · text\n\n'
          + 'Use the "identifier" value as the "model" parameter in generate tools. '
          + 'For EVERY model + its exact identifier, re-call with format: "json" (compact index of the '
          + 'whole catalog). Add `type` to that call for the full raw documents with all caps.';
        return respond(text);
      }

      if (withSummary.length > 0) {
        sections.push(`Auto-selectable models (${withSummary.length}) — If the user already named a model/family (this turn or earlier), use that family — do not cheapest-swap. Otherwise CHOOSE BY THE SUMMARY after each "—": match it to what the user asked for, then take the CHEAPEST model that fits. Credit cost, [NEW] and [RECOMMENDED] are not reasons to pick a model:\n${withSummary.map(formatModel).join('\n')}`);
      }
      if (withoutSummary.length > 0) {
        sections.push(`Named-only models (${withoutSummary.length}) — only use if the user explicitly requests by name:\n${withoutSummary.map(formatModel).join('\n')}`);
      }

      const text = `Available ${type} models (${result.count}):\n\n${sections.join('\n\n')}\n\nEvery ${type} model in the catalog is listed above — both sections together are the complete set. Use the "identifier" value as the "model" parameter in generate tools. For the raw documents (programmatic cap validation), re-call with format: "json".`;
      return respond(text);
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

  // ─── get_session_usage ─────────────────────────────────────
  // Real, multiplier-adjusted credit spend tagged with the caller's
  // X-Kolbo-Caller-Session-Id (set automatically by the parent process —
  // no need to pass it). Use this to give the user an honest "you've spent
  // X credits in this app session" instead of estimating from base credits.
  server.tool(
    'get_session_usage',
    'Fetch real, multiplier-adjusted credit spend for the current Kolbo Code app session. Use when the user asks "how much did I spend?" or before/after a large bulk job so you can quote actual cost (not an estimate from base credits). Returns total + per-tool breakdown + per-model breakdown + a recent list. The caller-session-id is forwarded automatically by the MCP HTTP client. ONLY works when running under Kolbo Code — on the claude.ai connector and other hosts there is no per-app session to scope to; use check_credits there instead.',
    {},
    async () => {
      // Session scoping needs KOLBO_CALLER_SESSION_ID, which only the Kolbo Code
      // parent process sets. The remote connector serves every user from one
      // process, so it is never present there — calling anyway just returns a 400
      // telling the user to reconfigure a process they do not control.
      if (!process.env.KOLBO_CALLER_SESSION_ID) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              unavailable: 'Per-session usage is only tracked when running under Kolbo Code.',
              reason: 'This host does not scope tool calls to an app session, so there is no session to total.',
              use_instead: 'check_credits for the current balance, or the Usage page at https://app.kolbo.ai.'
            })
          }]
        };
      }
      try {
        const r = await client.get('/credit-usage/by-caller-session');
        // The endpoint returns { message, data: { total, count, by_tool, by_model, recent[] } }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(r.data || r, null, 2)
          }]
        };
      } catch (err) {
        // 400 from the endpoint means no caller-session-id was forwarded —
        // surface a clear hint instead of a generic API error.
        const hint = err?.status === 400
          ? 'No caller-session-id was forwarded. Ensure the parent process (Kolbo Code / desktop sidecar) sets KOLBO_CALLER_SESSION_ID in this MCP\'s env, or call again after at least one media generation has fired.'
          : err?.message || 'Failed to fetch session usage';
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: hint }, null, 2) }]
        };
      }
    }
  );
}

module.exports = { registerModelTools };
