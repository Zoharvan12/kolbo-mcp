/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { pollUntilDone } = require('../polling');
const { resolveToBuffer, creditFields, projectIdField, inlineImageBlocks, buildOpenUrl, uiGenerating, uiCompleted, appsEnabled } = require('./_shared');
const { UI, uiResult, canonicalModelId } = require('../apps');

// ─── Cinematic Dimensions schema (shared by generate_image + generate_image_edit) ───
// Kolbo's "Cinema mode": eight independent photographic dimensions, each an OPTIONAL
// preset id fetched from list_cinematic_presets. Any dimension left unset = "Auto" (the
// enhancer decides). Applies ONLY when the user explicitly wants a deliberate cinematic
// look — omit the whole object for a normal generation. Ids are validated server-side
// against their dimension (passing a lighting id in the camera slot is a 400). The
// selected fragments are woven into the prompt before enhancement.
// NOTE: dimensions are data-driven — always call list_cinematic_presets for the live set
// and valid ids; the keys below mirror the current catalog (Genre was removed).
const cinematicDim = (label) => z.string().nullable().optional()
  .describe(`${label} preset id from list_cinematic_presets. Omit or null for Auto.`);
const CINEMATIC_SCHEMA = z.object({
  camera:        cinematicDim('Camera body/format (e.g. ARRI Alexa, 16mm film, smartphone)'),
  lens:          cinematicDim('Lens character (e.g. anamorphic, vintage prime, macro)'),
  focal_length:  cinematicDim('Focal length / field of view (e.g. 24mm wide, 85mm portrait)'),
  aperture:      cinematicDim('Aperture / depth of field (e.g. f/1.4 shallow, f/8 deep)'),
  angle:         cinematicDim('Camera angle (e.g. low angle, birds-eye, eye level)'),
  shot_type:     cinematicDim('Shot type / framing (e.g. close-up, wide shot, full shot)'),
  color_palette: cinematicDim('Color grade (e.g. teal & orange, technicolor, classic B&W)'),
  lighting:      cinematicDim('Lighting technique (e.g. rim light, golden hour, low-key)'),
}).optional().describe(
  'Cinema mode — an optional deliberate photographic treatment. Pass preset ids obtained from ' +
  'list_cinematic_presets (at most one per dimension). Only include a dimension the user actually ' +
  'wants; every omitted/null dimension is Auto (the enhancer completes the look in the spirit of the ' +
  'ones you set). Omit the whole object entirely for an ordinary, non-cinematic generation. Ids are ' +
  'validated against their dimension server-side. Dimensions are data-driven — never hardcode ids.'
);

function registerGenerateTools(server, client, options = {}) {
  // Only enabled by hosts that explicitly opt in (the remote HTTP connector).
  // stdio hosts (Kolbo Code, Claude Desktop, Cursor) leave this false, so their
  // tool output is unchanged: a text block with the image URL.
  const inlineImages = !!options.inlineImages;
  // MCP Apps hosts (claude.ai remote connector, Claude Desktop) get an instant
  // "submitted" response + a live ui://kolbo/generation.html widget that polls
  // get_generation_status itself. Text-only hosts never take this branch.
  const ui = () => appsEnabled(server, options);
  // ─── generate_image ────────────────────────────────────────
  server.tool(
    'generate_image',
    'Generate image(s) from a text prompt using Kolbo AI. Supports Visual DNA profiles (for character/style/product consistency), moodboards (for style direction), reference images (for composition guidance), batch generation (num_images), and web-search grounding. For EDITING an existing image, use generate_image_edit instead. For a coordinated multi-scene set (storyboard, ad campaign), use generate_creative_director. Returns the final image URL(s) when complete.',
    {
      prompt: z.string().describe('Text description of the image to generate'),
      model: z.string().optional().describe('Model identifier — REQUIRED in practice: pick a specific model, do NOT omit (omitting = Smart Select auto-pick, which we avoid). Strong current defaults: "nano-banana-2" (versatile, text rendering, multilingual) or "gpt-image-2" (photoreal, infographics). Call list_models type="text_to_img" to see all options and pick per the user\'s intent.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "1:1", "16:9", "9:16"). Must be a value present in the model\'s `supported_aspect_ratios` from list_models — pass an unsupported value and the API rejects. Default: "1:1"'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt for better results. Default: true'),
      num_images: z.number().optional().describe('Number of images to generate in one call. Default: 1. Note: some models (Midjourney etc.) have a fixed `images_per_request` and ignore this — check list_models.'),
      reference_images: z.array(z.string()).optional().describe('STYLE/COMPOSITION inspiration only — does NOT embed reference pixels. Array of image URLs used to guide the look-and-feel of a brand-new generation. The model interprets the references and regenerates approximations conditioned on them. It will NOT copy pixels from these images into the output. **Cap: pass at most `max_reference_images` URLs from list_models for the chosen model — exceeding it is a deterministic 400.** To embed a specific logo, icon, watermark, or asset pixel-accurately, use generate_image_edit with the asset in source_images. To EDIT an existing image, also use generate_image_edit.'),
      visual_dna_ids: z.array(z.string()).optional().describe('Visual DNA profile IDs (from create_visual_dna / list_visual_dnas) for character / style / product / scene consistency. **Cap: pass at most `max_visual_dna` IDs from list_models — if the field is null/0 or `supports_visual_dna: false`, the model rejects DNA entirely (silently ignored in some paths).** How DNA works: the server fetches the DNA\'s reference images AND always injects its `description` field into the prompt as plaintext (by design — independent of enhance_prompt). Practical implication: do NOT also write physical descriptors of the same subject in your own prompt — they will compete with the DNA description text. For pixel-accurate face anchoring of a specific person, prefer passing the DNA\'s reference image directly via source_images on generate_image_edit and OMIT visual_dna_ids. visual_dna_ids is best for style / scene / product DNAs and for soft consistency across a set.'),
      moodboard_id: z.string().optional().describe('Moodboard ID (from list_moodboards / get_moodboard) whose master_prompt and style_guide should be applied to this generation.'),
      enable_web_search: z.boolean().optional().describe('Enable web-search grounding for the prompt (useful for current events, brand references, real-world accuracy). Default: false'),
      resolution: z.string().optional().describe('Image resolution tier: "1K" (~1024px), "2K" (Full HD), "3K" (QHD), or "4K" (UHD). Model-dependent — call list_models and read supported_resolutions on the chosen model. Read resolution_multipliers on the same model to predict credit cost. Omit to use the model default.'),
      quality: z.string().optional().describe('Quality tier for models that support it (e.g. "low", "medium", "high", "auto"). Check list_models → supported_qualities on the chosen model. "auto" is normalised to "medium" on gpt-image-2. Omit to use the model default.'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="image" to apply a saved style preset to this generation.'),
      cinematic: CINEMATIC_SCHEMA,
      project_id: projectIdField
    },
    async ({ prompt, model, aspect_ratio, enhance_prompt, num_images, reference_images, visual_dna_ids, moodboard_id, enable_web_search, resolution, quality, preset_id, cinematic, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const gen = await client.post('/v1/generate/image', {
        prompt, model, aspect_ratio, enhance_prompt, num_images,
        reference_images, visual_dna_ids, moodboard_id, enable_web_search, resolution, quality, preset_id, cinematic, project_id
      });

      if (ui()) return uiGenerating({
        tool: 'generate_image', kind: 'image', gen, client, model, prompt,
        count: num_images, settings: { resolution, aspect_ratio },
        reference_image: reference_images?.[0]
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 3) * 1000,
        timeout: 120000
      });

      const images = await inlineImageBlocks(result.result.urls, { enabled: inlineImages });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            model: result.result.model,
            prompt_used: result.result.prompt_used,
            _followup_hint: 'If the user asks to edit/change/modify this image next (scene, lighting, objects, style, color — any content edit), pass urls[0] to generate_image_edit. Use edit_image ONLY for mechanical ops (upscale/reframe/removebg/enhance_skin). Do NOT call generate_image again.'
          }, null, 2)
        }, ...images]
      };
    }
  );

  // ─── generate_image_edit ──────────────────────────────────
  server.tool(
    'generate_image_edit',
    'THE tool for ANY prompt-driven / content edit of an existing image — changing the scene ("make it night", "change the sky to sunset"), adding/removing/replacing objects, restyling, recoloring, compositing, or any "edit this image to…" request. This is the image-editing equivalent of generate_image and runs on strong dedicated editing models (nano-banana-2, gpt-image-2). Provide the source image URL(s) in `source_images` and the instruction in `prompt`. Supports Visual DNA profiles and moodboards for style-consistent edits. Do NOT use `edit_image` for these — that tool is only for mechanical enhancements (upscale/reframe/remove-background/skin). For a brand-new image from scratch, use generate_image. Returns the edited image URL(s) when complete.',
    {
      prompt: z.string().describe('Description of the edit to apply (e.g., "remove the background", "change the sky to sunset")'),
      model: z.string().optional().describe('Model identifier — REQUIRED in practice: pick a specific IMAGE-EDITING model, do NOT omit (omitting = Smart Select auto-pick, which we avoid). Strong current defaults: "nano-banana-pro/edit" (best general prompt editor), "gpt-image/1.5-image-to-image" (photoreal), or "flux-2/edit". NOTE: text-to-image ids like "nano-banana-2"/"gpt-image-2" are NOT editors — don\'t use them here. Call list_models type="image_editing" to see all options and pick per the user\'s intent.'),
      source_images: z.array(z.string()).describe('PIXEL-ACCURATE compositing. Array of source image URLs whose pixel content is composited into the output. **Cap: pass at most `max_reference_images` URLs from list_models for the chosen model — exceeding it is a deterministic 400.** Three modes the model auto-detects from input shape: (1) Single image → edit/transform that image. (2) Multiple images, one base + others → composite the others into the base. (3) Multiple images with no clear base → generate a new scene that pixel-accurately embeds the supplied images at positions described in the prompt. Mode 3 is the canonical pattern for thumbnails / branded compositions where exact-pixel logo + face fidelity matter. Refer to source images in the prompt by ordinal position ("FIRST source image", "SECOND source image") or use @image1/@image2 tags. Add "composite AS-IS, do not redraw or restyle" to lock pixels.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio (e.g., "1:1", "16:9", "9:16"). Must be in the chosen model\'s `supported_aspect_ratios` from list_models. Default: "1:1"'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt for better results. Default: true'),
      num_images: z.number().optional().describe('Number of output images. Default: 1'),
      visual_dna_ids: z.array(z.string()).optional().describe('Visual DNA profile IDs for character / style / product consistency. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model.** How DNA works: the server fetches the DNA\'s reference images AND always injects its `description` field into the prompt as plaintext (by design — independent of enhance_prompt). For pixel-accurate face anchoring of a specific person on this tool, the PREFERRED pattern is to pass the face photo directly via source_images and OMIT visual_dna_ids — that way the face pixels anchor the output and no description text competes. Do NOT pass visual_dna_ids if source_images already contains the same person\'s face (face averaging). visual_dna_ids is best here for style / product DNAs.'),
      moodboard_id: z.string().optional().describe('Moodboard ID whose master_prompt and style_guide should be applied.'),
      enable_web_search: z.boolean().optional().describe('Enable web-search grounding. Default: false'),
      resolution: z.string().optional().describe('Image resolution tier: "1K" / "2K" / "3K" / "4K". Model-dependent — call list_models and read supported_resolutions. Default: "1K" for most edit models.'),
      cinematic: CINEMATIC_SCHEMA,
      project_id: projectIdField
    },
    async ({ prompt, model, source_images, aspect_ratio, enhance_prompt, num_images, visual_dna_ids, moodboard_id, enable_web_search, resolution, cinematic, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const gen = await client.post('/v1/generate/image-edit', {
        prompt, model, source_images, aspect_ratio, enhance_prompt, num_images,
        visual_dna_ids, moodboard_id, enable_web_search, resolution, cinematic, project_id
      });

      if (ui()) return uiGenerating({
        tool: 'generate_image_edit', kind: 'image', gen, client, model, prompt,
        count: num_images, settings: { resolution, aspect_ratio },
        reference_image: source_images?.[0]
      });

      // Multi-source compositing or DNA-anchored edits routinely exceed 120s
      // server-side. Extend the polling window in those cases to avoid forcing
      // every call into the timeout-and-recover path via get_generation_status.
      const heavy = (source_images && source_images.length > 1) || (visual_dna_ids && visual_dna_ids.length > 0);
      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 3) * 1000,
        timeout: heavy ? 240000 : 120000
      });

      const images = await inlineImageBlocks(result.result.urls, { enabled: inlineImages });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            model: result.result.model,
            prompt_used: result.result.prompt_used,
            _followup_hint: 'If the user asks for another edit on this output, pass urls[0] back into generate_image_edit as source_images. For targeted ops (upscale/reframe/removebg/enhance_skin) use edit_image instead. Do NOT call generate_image from scratch.'
          }, null, 2)
        }, ...images]
      };
    }
  );

  // ─── generate_creative_director ─────────────────────────────
  server.tool(
    'generate_creative_director',
    'Generate 2–8 related images or videos as one coherent set from a single creative brief. Use scene_count (NOT num_images) to set the number of scenes (1–8, default 4). Use this when the user gives a general brief ("make 4 product shots", "create a storyboard") and you are planning the scenes — it handles style consistency and runs scenes in parallel. If the user explicitly provides separate prompts for each image, use parallel generate_image calls instead. Supports image and video modes (workflow_type). Visual DNA and moodboard references keep character/style consistent across every scene.',
    {
      prompt: z.string().describe('Creative brief or concept describing the full set of scenes to generate'),
      scene_count: z.number().optional().describe('Number of scenes/images to generate, 1–8. Default: 4. Use this — NOT num_images — to control how many outputs are created.'),
      model: z.string().optional().describe('Model identifier applied to every scene. Pick a SPECIFIC model — do NOT omit (omitting = Smart Select auto-pick, which we avoid); call list_models for this type and choose the model that best fits the user\'s intent.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio applied to every scene (e.g., "1:1", "16:9", "9:16"). Must be in the chosen model\'s `supported_aspect_ratios` from list_models. Default: "1:1"'),
      workflow_type: z.string().optional().describe('"image" (default) or "video"'),
      duration: z.number().optional().describe('Duration in seconds per scene (video mode only). Must be a value in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. E.g., 5 or 10.'),
      enhance_prompt: z.boolean().optional().describe('Enhance prompts per scene. Default: true'),
      reference_images: z.array(z.string()).optional().describe('Array of reference image URLs to guide style/composition of every scene. **Cap: pass at most `max_reference_images` URLs from list_models for the chosen model.**'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply consistently across every scene. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model.** This is the ideal way to keep a character or product looking the same in all scenes of a campaign.'),
      moodboard_id: z.string().optional().describe('A single moodboard ID whose master_prompt and style_guide should shape every scene.'),
      moodboard_ids: z.array(z.string()).optional().describe('Multiple moodboard IDs when blending styles. Prefer `moodboard_id` for single moodboards.'),
      resolution: z.string().optional().describe('Resolution tier applied to every scene. Images: "1K" / "2K" / "3K" / "4K". Videos: "720p" / "1080p" / "1440p" / "2160p". Values are model-dependent — call list_models and read supported_resolutions on the target model. Multiplied across every scene.'),
      project_id: projectIdField
    },
    async ({ prompt, scene_count, model, aspect_ratio, workflow_type, duration, enhance_prompt, reference_images, visual_dna_ids, moodboard_id, moodboard_ids, resolution, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const gen = await client.post('/v1/generate/creative-director', {
        prompt, scene_count, model, aspect_ratio, workflow_type, duration,
        enhance_prompt, reference_images, visual_dna_ids, moodboard_id, moodboard_ids, resolution, project_id
      });

      const cdStatusUrl = `/v1/generate/creative-director/${gen.generation_id}/status`;
      // Video mode runs N scenes as parallel video generations, each of which
      // can take several minutes — a whole batch routinely exceeds the 10-min
      // image window. Give video batches 30 min (the server watchdog finalizes
      // stuck batches around 15-30 min, so this aligns client + server).
      const cdTimeout = workflow_type === 'video' ? 1800000 : 600000;

      let result;
      try {
        result = await pollUntilDone(client, gen.generation_id, {
          interval: (gen.poll_interval_hint || 5) * 1000,
          timeout: cdTimeout,
          statusUrl: cdStatusUrl
        });
      } catch (err) {
        // On a client-side poll timeout the batch is almost always STILL
        // running (or already finished) on the server. Don't lose the work:
        // return whatever scenes have landed plus the exact re-check path,
        // instead of throwing an opaque timeout at the agent.
        if (err && err.timedOut) {
          let partial = null;
          try { partial = await client.get(cdStatusUrl); } catch (_) { /* ignore */ }
          const doneScenes = (partial?.scenes || []).filter(s => s.status === 'completed').map(s => ({
            scene_number: s.scene_number, title: s.title, image_urls: s.image_urls, video_urls: s.video_urls
          }));
          return { content: [{ type: 'text', text: JSON.stringify({
            state: partial?.state || 'processing',
            generation_id: gen.generation_id,
            scenes: doneScenes,
            total_scenes: partial?.scenes?.length || 0,
            completed_scenes: doneScenes.length,
            _timed_out: true,
            _hint: `Still running after the poll window. Call get_creative_director_status with generation_id="${gen.generation_id}" to keep checking until state="completed" — do NOT re-run generate_creative_director.`
          }, null, 2) }] };
        }
        throw err;
      }

      const scenes = (result.scenes || [])
        .filter(s => s.status === 'completed')
        .map(s => ({
          scene_number: s.scene_number,
          title: s.title,
          image_urls: s.image_urls,
          video_urls: s.video_urls
        }));

      const cdText = JSON.stringify({
        ...creditFields(result),
        scenes,
        total_scenes: result.scenes?.length || 0,
        completed_scenes: scenes.length,
        _followup_hint: 'Each scene is a separate asset. If the user asks to edit one scene, find that scene by scene_number/title and pass its image_urls[0] (or video_urls[0]) to generate_image_edit / edit_image / edit_video / generate_video_from_video. Do NOT re-run generate_creative_director unless the user explicitly wants a brand-new set.'
      }, null, 2);

      // Creative Director polls a dedicated status route the widget can't reach
      // through get_generation_status, so it stays blocking on UI hosts too and
      // renders the completed scene gallery.
      if (ui()) return uiCompleted({
        tool: 'generate_creative_director', kind: 'scenes', gen, client, model, prompt,
        settings: { duration, resolution, mode: workflow_type }, scenes,
        credits_used: creditFields(result).credits_used
      }, cdText);

      return { content: [{ type: 'text', text: cdText }] };
    }
  );

  // ─── get_creative_director_status ──────────────────────────
  // Creative Director uses a DEDICATED status route (per-scene state + all
  // scene image/video URLs). The generic get_generation_status hits
  // /v1/generate/:id/status and CANNOT read a CD batch — so a long or
  // backgrounded CD run (especially parallel VIDEO scenes that exceed the
  // blocking poll window) needs this tool to be re-checked until done.
  server.tool(
    'get_creative_director_status',
    'Check the status of a Creative Director batch (from generate_creative_director) by its generation_id. Returns overall state ("processing" until EVERY scene is terminal, then "completed"/"failed") plus each scene\'s number, title, per-scene status, and image_urls/video_urls. Use this to resume checking a batch that was still running when generate_creative_director returned `_timed_out: true` — poll it until state="completed" to collect ALL parallel scene outputs at once. Do NOT use the generic get_generation_status for Creative Director ids; it points at the wrong endpoint.',
    {
      generation_id: z.string().describe('The Creative Director generation_id returned by generate_creative_director.')
    },
    async ({ generation_id }) => {
      const status = await client.get(`/v1/generate/creative-director/${encodeURIComponent(generation_id)}/status`);
      const scenes = (status.scenes || []).map(s => ({
        scene_number: s.scene_number,
        status: s.status,
        title: s.title,
        image_urls: s.image_urls || null,
        video_urls: s.video_urls || null
      }));
      const completed = scenes.filter(s => s.status === 'completed').length;
      return { content: [{ type: 'text', text: JSON.stringify({
        state: status.state,
        generation_id,
        progress: status.progress,
        scenes,
        total_scenes: scenes.length,
        completed_scenes: completed,
        _hint: status.state === 'completed'
          ? 'All scenes terminal. Every completed scene\'s image_urls/video_urls are final.'
          : 'Still running — call get_creative_director_status again in a few seconds until state="completed".'
      }, null, 2) }] };
    }
  );

  // ─── generate_video ────────────────────────────────────────
  // NOTE: text-to-video does NOT support Visual DNA — the textToVideoGeneration
  // controller in kolbo-api never reads visualDnaIds. For character-consistent
  // video, use generate_elements (which DOES honor visual_dna_ids) or animate a
  // DNA-locked still via generate_video_from_image.
  server.tool(
    'generate_video',
    'Generate a video from a text prompt using Kolbo AI. For animating an existing still image into motion, use generate_video_from_image instead. For a coordinated multi-scene video campaign, use generate_creative_director with workflow_type="video". Supports reference images (for style/composition guidance). Does NOT support Visual DNA — for character-consistent video use generate_elements or animate a DNA-locked still via generate_video_from_image. Returns the final video URL when complete.',
    {
      prompt: z.string().describe('Text description of the video to generate'),
      model: z.string().optional().describe('Model identifier — pick a SPECIFIC model, do NOT omit (omitting = Smart Select auto-pick, which we avoid). Strong current defaults: "seedance-2" (versatile) or "veo3" (Veo 3.1, cinematic + native audio); the Kling family (call list_models for exact ids like kling-video/v3/pro/text-to-video) is strongest for motion. Call list_models type="text_to_video" to see all options + check supported_durations / supported_aspect_ratios, and choose per the user\'s intent.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "16:9", "9:16", "1:1"). Must be in the chosen model\'s `supported_aspect_ratios` from list_models. Default: "16:9"'),
      duration: z.number().optional().describe('Duration in seconds. Must be a value in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration` (whichever the model exposes). Default: 5'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      reference_images: z.array(z.string()).optional().describe('Array of image URLs used as visual references (style / composition / subject). **Cap: pass at most `max_reference_images` URLs from list_models for the chosen model — exceeding it is a deterministic 400.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Some models use labels like "512P"/"1024P"/"768P"/"1080P". Model-dependent — call list_models and read supported_resolutions. Read resolution_multipliers to predict cost.'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="video" to apply a saved motion/style preset to this generation.'),
      sound_enabled: z.boolean().optional().describe('Enable (`true`) or disable (`false`) AI-generated synced audio on the output video. Only honored by models with `sound_generation_type: "native"` from list_models (e.g. Veo 3.1, Kling V3/2.6, PixVerse V6). On `sound_generation_type: "none"` models the flag has no effect. Omit to use the model\'s `sound_enabled_by_default`. Pass `false` when the user says no sound / silent / mute / without audio. Enabling sound may apply `sound_credit_multiplier` to cost.'),
      project_id: projectIdField
    },
    async ({ prompt, model, aspect_ratio, duration, enhance_prompt, reference_images, resolution, preset_id, sound_enabled, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const gen = await client.post('/v1/generate/video', {
        prompt, model, aspect_ratio, duration, enhance_prompt, reference_images, resolution, preset_id, sound_enabled, project_id
      });

      if (ui()) return uiGenerating({
        tool: 'generate_video', kind: 'video', gen, client, model, prompt,
        settings: { duration, resolution, aspect_ratio },
        reference_image: reference_images?.[0]
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            model: result.result.model,
            duration: result.result.duration,
            thumbnail_url: result.result.thumbnail_url,
            prompt_used: result.result.prompt_used,
            _followup_hint: 'If the user asks to edit/restyle/extend this video next, pass urls[0] to edit_video (upscale/reframe/face_swap/extend/generate_audio/lipsync/magic_edit) or generate_video_from_video (restyle). Do NOT call generate_video from scratch.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_video_from_image ─────────────────────────────
  server.tool(
    'generate_video_from_image',
    'Animate an existing still image into a video using Kolbo AI. The image comes from `image_url`; `prompt` describes the motion (not the subject — the subject is already in the image). For generating a video from scratch, use generate_video. Returns the final video URL when complete.',
    {
      image_url: z.string().describe('URL of the source image to animate'),
      prompt: z.string().describe('Text description of the desired MOTION (e.g., "camera slowly pans right while the character walks forward")'),
      model: z.string().optional().describe('Model identifier — pick a SPECIFIC model, do NOT omit (omitting = Smart Select auto-pick, which we avoid). Strong current defaults: "seedance-2" (versatile) or "veo3" (Veo 3.1, cinematic + native audio); the Kling family (call list_models for exact ids like kling-video/v3/pro/image-to-video) is strongest for motion. Call list_models type="img_to_video" to see all options and choose per the user\'s intent.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio (e.g., "16:9", "9:16", "1:1"). Must be in the chosen model\'s `supported_aspect_ratios` from list_models. Default: "16:9"'),
      duration: z.number().optional().describe('Duration in seconds. Must be in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. Default: 5'),
      enhance_prompt: z.boolean().optional().describe('Enhance the motion prompt. Default: true'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to maintain consistency with prior characters / styles. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model; if `supports_visual_dna: false` the model ignores DNA entirely.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Some models use labels like "512P"/"1024P"/"768P"/"1080P". Model-dependent — call list_models and read supported_resolutions.'),
      sound_enabled: z.boolean().optional().describe('Enable (`true`) or disable (`false`) AI-generated synced audio on the output video. Only honored by models with `sound_generation_type: "native"` from list_models (e.g. Veo 3.1 Lite, Kling V3 4K, PixVerse V6, Kling 2.6/v3). On `sound_generation_type: "none"` models the flag has no effect. Omit to use the model\'s `sound_enabled_by_default`. Pass `false` when the user says no sound / silent / mute / without audio. Enabling sound may apply `sound_credit_multiplier` to cost.'),
      project_id: projectIdField
    },
    async ({ image_url, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids, resolution, sound_enabled, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const gen = await client.post('/v1/generate/video/from-image', {
        image_url, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids, resolution, sound_enabled, project_id
      });

      if (ui()) return uiGenerating({
        tool: 'generate_video_from_image', kind: 'video', gen, client, model, prompt,
        settings: { duration, resolution, aspect_ratio },
        reference_image: image_url
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            model: result.result.model,
            duration: result.result.duration,
            thumbnail_url: result.result.thumbnail_url,
            _followup_hint: 'If the user asks to edit/restyle/extend this video next, pass urls[0] to edit_video or generate_video_from_video. Do NOT re-run generate_video_from_image unless they want a fresh animation from a different source image.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_music ────────────────────────────────────────
  server.tool(
    'generate_music',
    'Generate music from a text description using Kolbo AI. Supports instrumental mode, custom lyrics, style direction, vocal gender, negative tags, song length, and Suno fine-controls (style weight, weirdness, audio weight, persona/singing voice). Default model is Suno. Some controls are Suno-only; the engine ignores controls that do not apply to the chosen model. Returns the final audio URL when complete.',
    {
      prompt: z.string().describe('Text description of the music to generate (e.g., "upbeat electronic dance track with synthesizers")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="music_gen" to see options. Omit for Suno (default).'),
      style: z.string().optional().describe('Music style / genre (e.g., "pop", "rock", "lo-fi", "electronic", "jazz")'),
      title: z.string().optional().describe('Song title. If omitted, one is generated.'),
      instrumental: z.boolean().optional().describe('Generate instrumental only, no vocals. Default: false'),
      lyrics: z.string().optional().describe('Custom lyrics for the song. If omitted, lyrics are generated automatically from the prompt unless instrumental is true.'),
      vocal_gender: z.string().optional().describe('Preferred vocal gender: "male" or "female". Only applies when instrumental is false.'),
      negative_tags: z.string().optional().describe('Styles / sounds to EXCLUDE, comma-separated (e.g. "heavy metal, screaming, distortion"). Suno.'),
      duration_seconds: z.number().optional().describe('Target song length in seconds (length-capable models like ElevenLabs Music). Clamped 5–300. Omit for the model default.'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="music" to apply a saved music style preset.'),
      // ── Suno fine controls ──
      style_weight: z.number().optional().describe('Suno: how strongly the style/genre is applied, 0–1.'),
      weirdness: z.number().optional().describe('Suno: creativity / weirdness constraint, 0–1. Higher = more experimental.'),
      audio_weight: z.number().optional().describe('Suno: influence of an audio/persona reference, 0–1.'),
      persona_id: z.string().optional().describe('Suno persona id — reuse a saved singing voice/persona.'),
      use_composition_plan: z.boolean().optional().describe('Suno: enable structured composition planning (verse/chorus structure).'),
      singing_dna_id: z.string().optional().describe('Visual DNA character id whose singing voice to use (must be owned by the caller).'),
      singing_voice_id: z.string().optional().describe('Custom cloned singing-voice id (must be owned by the caller).'),
      project_id: projectIdField
    },
    async ({ prompt, model, style, title, instrumental, lyrics, vocal_gender, negative_tags, duration_seconds, enhance_prompt, preset_id, style_weight, weirdness, audio_weight, persona_id, use_composition_plan, singing_dna_id, singing_voice_id, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const gen = await client.post('/v1/generate/music', {
        prompt, model, style, title, instrumental, lyrics, vocal_gender, negative_tags,
        duration_seconds, enhance_prompt, preset_id,
        style_weight, weirdness, audio_weight, persona_id, use_composition_plan,
        singing_dna_id, singing_voice_id, project_id
      });

      if (ui()) return uiGenerating({
        tool: 'generate_music', kind: 'audio', gen, client, model: model || 'Suno', prompt,
        settings: { mode: instrumental ? 'instrumental' : (style || undefined) },
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            title: result.result.title,
            duration: result.result.duration,
            lyrics: result.result.lyrics
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_speech ───────────────────────────────────────
  server.tool(
    'generate_speech',
    'Convert text to speech using Kolbo AI. Default provider is ElevenLabs. To pick a specific voice by language/gender, call list_voices first and pass the returned voice_id (or a voice display name — both work). Every voice belongs to a provider (ElevenLabs, DeepDub, MiniMax, Google/Gemini, OpenAI, Zonos) and each provider exposes its own expressive/style controls below — the engine ignores any control that does not apply to the chosen voice\'s provider, so it is safe to pass only what you need. Returns the final audio URL when complete.',
    {
      text: z.string().describe('The text to convert to speech'),
      voice: z.string().optional().describe('Voice ID (from list_voices) or voice display name (e.g., "Rachel", "Adam"). Default: "Rachel"'),
      model: z.string().optional().describe('Model identifier. Use list_models type="text_to_speech" to see options. Default: eleven_v3'),
      language: z.string().optional().describe('Language code (e.g., "en-US", "he-IL", "es-ES"). Default: "en-US"'),
      // ── Expressive style / emotion (provider-specific) ──
      style_instructions: z.string().optional().describe('Google/Gemini voices ONLY. Free-form natural-language voice direction, e.g. "whisper conspiratorially, slightly amused" or "excited sports announcer". Max 500 chars. Ignored by other providers.'),
      selected_style: z.string().optional().describe('DeepDub & MiniMax voices. Preset expressive style/emotion. DeepDub supports: reading, conversational, angry, breathy, panic, amused, sad, whisper, singing, shout, scream, mumbling, excited. Ignored by other providers.'),
      emotion: z.string().optional().describe('MiniMax voices. Emotion: happy, sad, angry, fearful, disgusted, surprised, calm, fluent, whisper.'),
      speaking_speed: z.number().optional().describe('Speech speed 0.5 (slow) – 2.0 (fast). Default 1.0. Applies to ElevenLabs / OpenAI / Google.'),
      // ── ElevenLabs voice settings ──
      similarity_boost: z.number().optional().describe('ElevenLabs voice similarity, 0–1. Default 0.75. Higher hews closer to the original voice.'),
      style: z.number().optional().describe('ElevenLabs style exaggeration, 0–1. Default 0.5. Higher = more expressive/dramatic.'),
      use_speaker_boost: z.boolean().optional().describe('ElevenLabs speaker boost. Default true.'),
      // ── DeepDub controls ──
      variance: z.number().optional().describe('DeepDub voice variance, 0–1. Default 0.2. Higher = more takes/variation.'),
      tempo: z.number().optional().describe('DeepDub tempo multiplier, 0–2. Default 1.0.'),
      promptBoost: z.boolean().optional().describe('DeepDub prompt-fidelity boost. Default true.'),
      seed: z.number().optional().describe('Reproducibility seed (DeepDub / Zonos). Same seed + inputs → same output.'),
      accentControl: z.object({
        accentBaseLocale: z.string().describe('Base accent locale, e.g. "en-US".'),
        accentLocale: z.string().describe('Target accent locale, e.g. "en-GB".'),
        accentRatio: z.number().optional().describe('Blend ratio 0–1. Default 0.5.')
      }).optional().describe('DeepDub accent steering. Provide both base and target locale to blend an accent.'),
      voiceTitle: z.string().optional().describe('DeepDub display title for a custom/cloned voice.'),
      // ── MiniMax fine controls ──
      minimax_pitch: z.number().optional().describe('MiniMax pitch, −12 to 12. Default 0.'),
      minimax_vol: z.number().optional().describe('MiniMax volume, 0–10. Default 1.'),
      minimax_intensity: z.number().optional().describe('MiniMax voice intensity.'),
      minimax_timbre: z.number().optional().describe('MiniMax voice timbre.'),
      project_id: projectIdField
    },
    async ({ text, voice, model, language, style_instructions, selected_style, emotion, speaking_speed, similarity_boost, style, use_speaker_boost, variance, tempo, promptBoost, seed, accentControl, voiceTitle, minimax_pitch, minimax_vol, minimax_intensity, minimax_timbre, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const gen = await client.post('/v1/generate/speech', {
        text, voice, model, language,
        style_instructions, selected_style, emotion, speaking_speed,
        similarity_boost, style, use_speaker_boost,
        variance, tempo, promptBoost, seed, accentControl, voiceTitle,
        minimax_pitch, minimax_vol, minimax_intensity, minimax_timbre,
        project_id
      });

      if (ui()) return uiGenerating({
        tool: 'generate_speech', kind: 'audio', gen, client, model, prompt: text,
        settings: { voice: voice || 'Rachel', style: selected_style || emotion || style_instructions }
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 120000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            voice: result.result.voice,
            duration: result.result.duration
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_sound ────────────────────────────────────────
  server.tool(
    'generate_sound',
    'Generate sound effects (not music, not speech) from a text description using Kolbo AI. Use this for ambient sounds, foley, impacts, atmospheres, UI sounds, etc. For music use generate_music; for voice use generate_speech. Beyond the core prompt/duration, per-provider controls are available (Stable Audio guidance, Kie loop/tempo/key, Seed-Audio voice/speed/volume/pitch + reference audio/image); the engine ignores controls that do not apply to the chosen model. Returns the final audio URL when complete.',
    {
      prompt: z.string().describe('Text description of the sound effect (e.g., "thunder clap with rain", "door creaking open", "futuristic UI beep")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="text_to_sound" to see options. Default: elevenlabs-sound-effects-v1'),
      duration: z.number().optional().describe('Duration in seconds. Omit for automatic duration.'),
      prompt_influence: z.number().optional().describe('ElevenLabs: how strongly the prompt guides the generation (0–1). Default: 0.5. Lower = more creative freedom; higher = more literal.'),
      // ── FAL Stable Audio / mmaudio ──
      cfg_strength: z.number().optional().describe('FAL (Stable Audio 3 / mmaudio): classifier-free guidance strength. Higher hews closer to the prompt.'),
      // ── Kie ──
      sound_loop: z.boolean().optional().describe('Kie: generate a seamlessly looping sound.'),
      sound_tempo: z.number().optional().describe('Kie: tempo control.'),
      sound_key: z.string().optional().describe('Kie: musical key / scale.'),
      // ── FAL Seed Audio ──
      seed_voice: z.string().optional().describe('FAL Seed-Audio: voice to use.'),
      seed_speed: z.number().optional().describe('FAL Seed-Audio: speed multiplier, 0.5–2.0.'),
      seed_volume: z.number().optional().describe('FAL Seed-Audio: volume, 0–1.'),
      seed_pitch: z.number().optional().describe('FAL Seed-Audio: pitch shift in semitones.'),
      seed_reference_audio_urls: z.array(z.string()).optional().describe('FAL Seed-Audio: up to 3 reference audio URLs to condition the sound.'),
      seed_reference_image_url: z.string().optional().describe('FAL Seed-Audio: a reference image URL to condition the sound.'),
      project_id: projectIdField
    },
    async ({ prompt, model, duration, prompt_influence, cfg_strength, sound_loop, sound_tempo, sound_key, seed_voice, seed_speed, seed_volume, seed_pitch, seed_reference_audio_urls, seed_reference_image_url, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const gen = await client.post('/v1/generate/sound', {
        prompt, model, duration, prompt_influence,
        cfg_strength, sound_loop, sound_tempo, sound_key,
        seed_voice, seed_speed, seed_volume, seed_pitch,
        seed_reference_audio_urls, seed_reference_image_url, project_id
      });

      if (ui()) return uiGenerating({
        tool: 'generate_sound', kind: 'audio', gen, client, model, prompt,
        settings: { duration }
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 120000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            duration: result.result.duration
          }, null, 2)
        }]
      };
    }
  );

  // ─── get_generation_status ─────────────────────────────────
  server.tool(
    'get_generation_status',
    'Check the status of one or more generations. Use after a generation tool returned "submitted" (widget hosts) or timed out. Tracking SEVERAL concurrent generations? Pass them ALL in generation_ids — one call returns an all_done summary. Need the final result? Set wait=true and the server blocks until every generation finishes (up to ~3 min). NEVER call this tool repeatedly in a loop — one wait=true call replaces the whole loop.',
    {
      generation_id: z.string().optional().describe('A single generation ID to check'),
      generation_ids: z.array(z.string()).optional().describe('Multiple generation IDs to check in ONE call. Returns { all_done, pending, generations[] } — always prefer this over checking IDs one by one.'),
      wait: z.boolean().optional().describe('If true, block until every generation reaches a terminal state (completed/failed), up to ~3 minutes, then return the final results. Use this instead of re-calling the tool in a loop.')
    },
    async ({ generation_id, generation_ids, wait }) => {
      const ids = (generation_ids && generation_ids.length > 0)
        ? generation_ids
        : (generation_id ? [generation_id] : []);
      if (ids.length === 0) throw new Error('Provide generation_id or generation_ids');

      // One status check (or blocking poll) per id. Never let one bad id
      // reject the whole batch — surface it as a failed entry instead.
      const checkOne = async (id) => {
        try {
          if (wait) {
            const result = await pollUntilDone(client, id, { interval: 5000, timeout: 180000 });
            return { generation_id: id, ...result };
          }
          const result = await client.get(`/v1/generate/${encodeURIComponent(id)}/status`);
          return { generation_id: id, ...result };
        } catch (err) {
          if (err.timedOut) {
            return { generation_id: id, state: 'processing', note: 'Still running after 3 min of waiting — call get_generation_status again with wait=true.' };
          }
          if (err.name === 'GenerationFailedError') {
            return { generation_id: id, state: 'failed', error: err.message };
          }
          return { generation_id: id, state: 'unknown', error: err.message };
        }
      };

      const results = await Promise.all(ids.map(checkOne));

      const pending = results.filter(r => r.state !== 'completed' && r.state !== 'failed' && r.state !== 'cancelled');
      const doneHint = 'ALL generations are in a final state — do NOT poll again. Report the results to the user.';
      const pendingHint = wait
        ? 'Some generations are still running after the wait window. Call get_generation_status ONCE more with wait=true and the remaining generation_ids — do not spin without wait.'
        : 'Some generations are still processing. Do NOT re-call this tool in a loop — call it ONCE with wait=true (and all pending generation_ids) to block until they finish.';

      // Single-id calls keep the original flat shape — the generation widget
      // polls this tool with { generation_id } and reads state/result at the
      // top level.
      if (!generation_ids || generation_ids.length === 0) {
        const single = results[0];
        single._hint = pending.length === 0
          ? 'This generation is in a FINAL state — do not poll it again.'
          : pendingHint;
        return {
          content: [{ type: 'text', text: JSON.stringify(single, null, 2) }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            all_done: pending.length === 0,
            completed: results.filter(r => r.state === 'completed').length,
            failed: results.filter(r => r.state === 'failed' || r.state === 'cancelled').length,
            still_processing: pending.map(r => r.generation_id),
            _hint: pending.length === 0 ? doneHint : pendingHint,
            generations: results
          }, null, 2)
        }]
      };
    }
  );

  // ═════════════════════════════════════════════════════════════
  // ─── 2026-04 SDK Expansion Batch ─────────────────────────────
  // ═════════════════════════════════════════════════════════════

  // ─── generate_elements ─────────────────────────────────────
  server.tool(
    'generate_elements',
    'Generate a video from reference elements (images, videos, and/or audio) + a text prompt. Use when the user wants to animate specific uploaded/referenced assets — e.g. "animate this product", "put these 3 characters into a scene". IMPORTANT: different models accept different numbers of inputs — call list_models type="elements" and read elements_max_images / elements_max_videos / elements_max_audio on the chosen model before generating. For text-only → video use generate_video instead. For animating a single still image use generate_video_from_image. Returns the final video URL when complete.',
    {
      prompt: z.string().describe('Text description of the desired video / animation'),
      model: z.string().optional().describe('Model identifier. Use list_models type="elements" to see options (Seedance 2, Kling O3 Reference, Grok Imagine, Veo 3.1, etc.). Check elements_max_images / elements_max_videos / elements_max_audio on the model. Pick a SPECIFIC model — do NOT omit (omitting = Smart Select auto-pick, which we avoid); call list_models for this type and choose the model that best fits the user\'s intent.'),
      reference_images: z.array(z.string()).optional().describe('Array of public image URLs used as reference elements (product shots, character references, etc.). **Cap: pass at most `elements_max_images` URLs from list_models for the chosen model — exceeding it is a deterministic 400.**'),
      reference_videos: z.array(z.string()).optional().describe('Array of reference video URLs for models that accept video inputs. **Cap: pass at most `elements_max_videos` URLs from list_models — if the cap is 0 the model rejects videos.**'),
      audio_url: z.string().optional().describe('URL of a reference audio track. **Audio constraints: `elements_max_audio` from list_models gates whether audio is accepted at all; audio duration must fall within `min_audio_duration`-`max_audio_duration`; format must be in `supported_audio_formats` (if specified).**'),
      files: z.array(z.string()).optional().describe('Array of URLs or absolute local paths — alternative to reference_images. Use this when you have local files to upload. Each item can be a URL OR a local path. **Total count across files + reference_images still capped by `elements_max_images`.**'),
      duration: z.number().optional().describe('Output duration in seconds. Must be in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. Default: 5'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "16:9", "9:16", "1:1"). Must be in `supported_aspect_ratios` from list_models. Default: "16:9"'),
      motion: z.string().optional().describe('Motion style / intensity hint (optional)'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="video" (optional)'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply for character/style consistency across outputs. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Model-dependent — call list_models and read supported_resolutions.'),
      project_id: projectIdField
    },
    async ({ prompt, model, reference_images, reference_videos, audio_url, files, duration, aspect_ratio, motion, preset_id, enhance_prompt, visual_dna_ids, resolution, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      if (!prompt) throw new Error('prompt is required');

      let startResponse;
      if (files && files.length > 0) {
        // Multipart mode: resolve each file source to a buffer and upload.
        const resolved = await Promise.all(files.map(src => resolveToBuffer(src, 'image')));
        const form = new FormData();
        form.append('prompt', prompt);
        if (model) form.append('model', model);
        if (duration !== undefined) form.append('duration', String(duration));
        if (aspect_ratio) form.append('aspect_ratio', aspect_ratio);
        if (motion) form.append('motion', motion);
        if (preset_id) form.append('preset_id', preset_id);
        if (enhance_prompt !== undefined) form.append('enhance_prompt', String(enhance_prompt));
        if (visual_dna_ids) form.append('visual_dna_ids', JSON.stringify(visual_dna_ids));
        if (reference_images) form.append('reference_images', JSON.stringify(reference_images));
        if (reference_videos) form.append('reference_videos', JSON.stringify(reference_videos));
        if (audio_url) form.append('audio_url', audio_url);
        if (resolution) form.append('resolution', resolution);
        if (project_id) form.append('project_id', project_id);
        for (const f of resolved) {
          form.append('files', f.buffer, { filename: f.filename, contentType: f.contentType });
        }
        startResponse = await client.postMultipart('/v1/generate/elements', form);
      } else {
        // URL-only mode: plain JSON.
        startResponse = await client.post('/v1/generate/elements', {
          prompt, model, reference_images, reference_videos, audio_url, duration, aspect_ratio, motion, preset_id, enhance_prompt, visual_dna_ids, resolution, project_id
        });
      }

      if (ui()) return uiGenerating({
        tool: 'generate_elements', kind: 'video', gen: startResponse, client, model, prompt,
        settings: { duration, resolution, aspect_ratio },
        reference_image: reference_images?.[0]
      });

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_first_last_frame ─────────────────────────────
  server.tool(
    'generate_first_last_frame',
    'Generate a video that morphs / interpolates from a FIRST frame to a LAST frame. Provide the two frames as URLs (first_frame_url + last_frame_url) OR as local file paths (first_frame + last_frame). Optional prompt describes the desired motion/transition. Do NOT mix URL and file inputs. Returns the final video URL when complete.',
    {
      first_frame_url: z.string().optional().describe('Public URL of the first frame image (URL mode)'),
      last_frame_url: z.string().optional().describe('Public URL of the last frame image (URL mode)'),
      first_frame: z.string().optional().describe('URL or absolute local path to the first frame (file mode — alternative to first_frame_url)'),
      last_frame: z.string().optional().describe('URL or absolute local path to the last frame (file mode — alternative to last_frame_url)'),
      prompt: z.string().optional().describe('Optional description of the desired motion between the two frames (e.g. "smooth camera dolly in")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="firstlastgenerations" to see options. Pick a SPECIFIC model — do NOT omit (omitting = Smart Select auto-pick, which we avoid); call list_models for this type and choose the model that best fits the user\'s intent.'),
      duration: z.number().optional().describe('Duration in seconds. Must be in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. Default: 5'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (auto-detected from first frame if not provided). Must be in `supported_aspect_ratios` from list_models when set. Default: "16:9"'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model; if `supports_visual_dna: false`, DNA is silently ignored.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Model-dependent — call list_models and read supported_resolutions.'),
      project_id: projectIdField
    },
    async ({ first_frame_url, last_frame_url, first_frame, last_frame, prompt, model, duration, aspect_ratio, enhance_prompt, visual_dna_ids, resolution, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      const urlMode = first_frame_url && last_frame_url;
      const fileMode = first_frame && last_frame;
      if (!urlMode && !fileMode) {
        throw new Error('Provide either both first_frame_url + last_frame_url OR both first_frame + last_frame (URL/local path).');
      }
      if (urlMode && fileMode) {
        throw new Error('Do not mix URL and file inputs. Provide either URLs OR file sources, not both.');
      }

      let startResponse;
      if (fileMode) {
        const [firstResolved, lastResolved] = await Promise.all([
          resolveToBuffer(first_frame, 'image'),
          resolveToBuffer(last_frame, 'image')
        ]);
        const form = new FormData();
        form.append('files', firstResolved.buffer, { filename: firstResolved.filename, contentType: firstResolved.contentType });
        form.append('files', lastResolved.buffer, { filename: lastResolved.filename, contentType: lastResolved.contentType });
        if (prompt) form.append('prompt', prompt);
        if (model) form.append('model', model);
        if (duration !== undefined) form.append('duration', String(duration));
        if (aspect_ratio) form.append('aspect_ratio', aspect_ratio);
        if (enhance_prompt !== undefined) form.append('enhance_prompt', String(enhance_prompt));
        if (visual_dna_ids) form.append('visual_dna_ids', JSON.stringify(visual_dna_ids));
        if (resolution) form.append('resolution', resolution);
        if (project_id) form.append('project_id', project_id);
        startResponse = await client.postMultipart('/v1/generate/first-last-frame', form);
      } else {
        startResponse = await client.post('/v1/generate/first-last-frame', {
          first_frame_url, last_frame_url, prompt, model, duration, aspect_ratio, enhance_prompt, visual_dna_ids, resolution, project_id
        });
      }

      if (ui()) return uiGenerating({
        tool: 'generate_first_last_frame', kind: 'video', gen: startResponse, client, model, prompt,
        settings: { duration, resolution, aspect_ratio },
        reference_image: first_frame_url || undefined
      });

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_lipsync ──────────────────────────────────────
  server.tool(
    'generate_lipsync',
    'Lipsync an audio track to a source image or video. Both `source` (image or video) and `audio` can be provided as URLs or as absolute local file paths. Pass a text_prompt only if the model supports it (some lipsync models do character performance from a prompt). **Validate before submitting: for `lipsync-video` sources, the input video duration must fall within `min_video_duration`-`max_video_duration` from list_models; audio duration must fall within `min_audio_duration`-`max_audio_duration` (and if `audio_max_follows_video_duration: true`, audio is also capped at the video duration); audio format must be in `supported_audio_formats` when specified.** Returns a lipsynced video URL.',
    {
      source: z.string().describe('URL or absolute local path to the source image or video (the face to animate). For lipsync-video: duration must fall within `min_video_duration`-`max_video_duration` from list_models.'),
      audio: z.string().describe('URL or absolute local path to the audio track (the voice to sync to). Duration must fall within `min_audio_duration`-`max_audio_duration` from list_models; format must be in `supported_audio_formats` (when set).'),
      text_prompt: z.string().optional().describe('Optional text prompt (for performance-capable models). For Sync-3 this is the free-text emotion/acting prompt, e.g. "speaking with excitement, calm and serious".'),
      model: z.string().optional().describe('Model identifier. Use list_models type="lipsync-image" or type="lipsync-video" to see options. Pick a SPECIFIC model — do NOT omit (omitting = Smart Select auto-pick, which we avoid); call list_models for this type and choose the model that best fits the user\'s intent.'),
      bounding_box_target: z.array(z.number()).optional().describe('Optional bounding box [x, y, w, h] for multi-face inputs (Hedra Character3 style). Leave empty for single-face.'),
      // Sync-3 (fal-ai/sync-lipsync/v3) only; ignored by other models.
      sync_mode: z.enum(['cut_off', 'loop', 'bounce', 'silence', 'remap']).optional().describe('Sync-3 / sync-lipsync family: how to reconcile an audio/video length mismatch. Default cut_off.'),
      model_mode: z.enum(['lips', 'face', 'head', 'lipsync', 'emotion', 'talking_head']).optional().describe('Sync-3 only: which region drives the sync.'),
      emotion: z.enum(['neutral', 'happy', 'sad', 'angry', 'disgusted', 'surprised']).optional().describe('Sync-3 only: quick emotion shortcut. A free-text text_prompt overrides this and gives finer control.'),
      temperature: z.number().min(0).max(1).optional().describe('Sync-3 only: expressiveness 0 (subtle) .. 1 (energetic).'),
      occlusion_detection_enabled: z.boolean().optional().describe('Sync-3 only: handle objects passing in front of the face.'),
      active_speaker_detection: z.object({
        auto_detect: z.boolean().optional().describe('Auto-detect and sync the active speaker.'),
        v3: z.boolean().optional().describe('Use Sync.so v3 detection engine.'),
        frame_number: z.number().int().min(0).optional().describe('Frame index the coordinates refer to.'),
        coordinates: z.array(z.number().int()).length(2).optional().describe('[x, y] PIXEL point on the speaker face (source-video resolution).'),
        bounding_boxes: z.array(z.array(z.number().int())).optional().describe('Per-frame face boxes [x1,y1,x2,y2].'),
        bounding_boxes_url: z.string().optional().describe('URL to a JSON file with per-frame boxes.'),
        face_image: z.string().optional().describe('Base64-encoded reference face image.')
      }).optional().describe('Sync-3 only: choose which speaker gets synced in a multi-person video. Use auto_detect:true for automatic, or coordinates + frame_number to pin a specific face.'),
      project_id: projectIdField
    },
    async ({ source, audio, text_prompt, model, bounding_box_target, sync_mode, model_mode, emotion, temperature, occlusion_detection_enabled, active_speaker_detection, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      if (!source) throw new Error('source is required (URL or absolute local path to image/video)');
      if (!audio) throw new Error('audio is required (URL or absolute local path to audio file)');

      const sourceIsUrl = typeof source === 'string' && /^https?:\/\//i.test(source);
      const audioIsUrl = typeof audio === 'string' && /^https?:\/\//i.test(audio);

      let startResponse;
      if (sourceIsUrl && audioIsUrl) {
        // URL mode
        startResponse = await client.post('/v1/generate/lipsync', {
          source_url: source,
          audio_url: audio,
          prompt: text_prompt,
          model,
          bounding_box_target,
          // Sync-3 advanced options (additive; ignored by other models)
          sync_mode,
          model_mode,
          emotion,
          temperature,
          occlusion_detection_enabled,
          active_speaker_detection,
          project_id
        });
      } else {
        // File mode (or mixed — resolve any local paths, pass URLs through as body fields)
        const form = new FormData();
        if (!sourceIsUrl) {
          const resolved = await resolveToBuffer(source, /\.(mp4|mov|webm|mkv)$/i.test(source) ? 'video' : 'image');
          // Decide field name by kind — lipsync controller uses .fields() with image/video/audio.
          const isVideo = /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(resolved.filename);
          form.append(isVideo ? 'video' : 'image', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        } else {
          form.append('source_url', source);
        }
        if (!audioIsUrl) {
          const resolved = await resolveToBuffer(audio, 'audio');
          form.append('audio', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        } else {
          form.append('audio_url', audio);
        }
        if (text_prompt) form.append('prompt', text_prompt);
        if (model) form.append('model', model);
        if (bounding_box_target) form.append('bounding_box_target', JSON.stringify(bounding_box_target));
        // Sync-3 advanced options (additive — ignored by other models)
        if (sync_mode) form.append('sync_mode', sync_mode);
        if (model_mode) form.append('model_mode', model_mode);
        if (emotion) form.append('emotion', emotion);
        if (temperature !== undefined) form.append('temperature', String(temperature));
        if (occlusion_detection_enabled !== undefined) form.append('occlusion_detection_enabled', String(occlusion_detection_enabled));
        if (active_speaker_detection) form.append('active_speaker_detection', JSON.stringify(active_speaker_detection));
        if (project_id) form.append('project_id', project_id);
        startResponse = await client.postMultipart('/v1/generate/lipsync', form);
      }

      if (ui()) return uiGenerating({
        tool: 'generate_lipsync', kind: 'video', gen: startResponse, client, model,
        prompt: text_prompt, settings: { mode: 'lipsync' },
        reference_image: sourceIsUrl && !/\.(mp4|mov|webm|mkv|avi|m4v)(\?|$)/i.test(source) ? source : undefined,
      });

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_video_from_video ─────────────────────────────
  server.tool(
    'generate_video_from_video',
    'Restyle / transform an existing video (video-to-video). Use for style transfer, scene restyling, subject swap, motion transfer, character replacement, or burning in styled subtitles (VEED Subtitles). Source video can be a URL or absolute local path. `prompt` is OPTIONAL: most models need it, but prompt-less models (VEED Subtitles, Act Two, Wan Animate, Kling Motion Control) ignore it. For VEED Subtitles, pass a `preset` style and optional `source_language` / `translation_language` instead of a prompt. IMPORTANT: different models support different extra inputs — call list_models type="video_to_video" and read max_images / max_videos / max_elements on the chosen model before generating. Pass reference_images for models with max_images > 0 (e.g. Kling O1/O3, Aleph, WAN VACE), reference_videos for models with max_videos > 1 (e.g. WAN 2.6 reference-to-video accepts up to 3), and elements for models with max_elements > 0. For animating a still image use generate_video_from_image instead. For text-only → video use generate_video.',
    {
      source_video: z.string().describe('URL or absolute local path to the primary source video to restyle. **Source duration must fall within `min_video_duration`-`max_video_duration` from list_models for the chosen model** — videos outside that range are rejected (or silently truncated by some upstream providers). For models that use reference_videos as their primary input (e.g. WAN 2.6 reference-to-video), pass the first reference video here and also include it in reference_videos.'),
      prompt: z.string().optional().describe('Text description of the desired restyle / transformation. Required by most video-to-video models; omit for prompt-less models (VEED Subtitles, Act Two, Wan Animate, Kling Motion Control).'),
      model: z.string().optional().describe('Model identifier. Use list_models type="video_to_video" to see options and check max_images / max_videos / max_elements / max_video_duration per model. Pick a SPECIFIC model — do NOT omit (omitting = Smart Select auto-pick, which we avoid); call list_models for this type and choose the model that best fits the user\'s intent.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio. Must be in `supported_aspect_ratios` from list_models when set. Default: matches source'),
      duration: z.number().optional().describe('Output duration in seconds. Must be in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. Default: matches source'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply for character/style consistency. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model; if `supports_visual_dna: false`, DNA is silently ignored.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Model-dependent — call list_models and read supported_resolutions.'),
      reference_images: z.array(z.string()).optional().describe('Array of reference image URLs for models that support additional image inputs. **Cap: pass at most `max_images` URLs from list_models — if `max_images === 0` the model does not accept image refs.** Examples: character reference images for Kling O1/O3, style reference for Aleph/gen4_aleph, character image for WAN VACE video-edit.'),
      reference_videos: z.array(z.string()).optional().describe('Array of additional reference video URLs for models that support multiple video inputs. **Cap: pass at most `max_videos` URLs from list_models — if `max_videos <= 1` only the source_video is accepted.** Example: WAN 2.6 reference-to-video accepts 1–3 reference videos.'),
      elements: z.array(z.string()).optional().describe('Array of element image URLs. **Cap: pass at most `max_elements` URLs from list_models — if `max_elements === 0` the model does not accept elements.** Elements are style or character reference assets alongside the main video.'),
      // VEED Subtitles (model: veed/subtitles) — burns styled subtitles into the video
      preset: z.string().optional().describe('VEED Subtitles only: caption style preset (e.g. "glass", "whisper", "fusion", "simple", "vegas"). Call list_models type="video_to_video" for the veed/subtitles model. Ignored by other models.'),
      source_language: z.string().optional().describe('VEED Subtitles only: BCP-47 code of the spoken language to improve transcription accuracy (e.g. "en-US", "es-ES", "he-IL"). Omit to auto-detect.'),
      translation_language: z.string().optional().describe('VEED Subtitles only: BCP-47 code to translate the subtitles into (e.g. "en-US", "fr-FR"). Omit to keep the original spoken language.'),
      srt_content: z.string().optional().describe('VEED Subtitles only: raw .srt subtitle text to burn in. When set, auto-transcription is skipped.'),
      srt_file_url: z.string().optional().describe('VEED Subtitles only: URL to a .srt subtitle file. Alternative to srt_content. When set, auto-transcription is skipped.'),
      vocabulary: z.array(z.object({
        word: z.string().describe('Correct spelling to enforce'),
        replaces: z.array(z.string()).describe('Mis-transcriptions to replace with `word`'),
      })).optional().describe('VEED Subtitles only: brand names / jargon to help transcription (e.g. [{"word":"Kolbo","replaces":["colbo","kolboo"]}]). Ignored when srt_content / srt_file_url is set.'),
      customization: z.object({
        position: z.enum(['top', 'center', 'bottom']).optional().describe('Caption vertical position. Ignored by complex animated presets.'),
        shadow: z.enum(['none', 'min', 'mid', 'max']).optional().describe('Text shadow intensity.'),
        text_customizations: z.object({
          baseline: z.object({ font: z.string().optional(), weight: z.number().int().min(100).max(900).optional(), color: z.string().optional() }).optional().describe('All words: Google font name, weight 100-900, hex colour.'),
          highlighted: z.object({ font: z.string().optional(), weight: z.number().int().min(100).max(900).optional(), color: z.string().optional() }).optional().describe('Highlighted word tier styling.'),
        }).optional(),
      }).optional().describe('VEED Subtitles only: style overrides. Any omitted field keeps the preset default. Best supported by Basic presets.'),
      project_id: projectIdField
    },
    async ({ source_video, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids, resolution, reference_images, reference_videos, elements, preset, source_language, translation_language, srt_content, srt_file_url, vocabulary, customization, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      if (!source_video) throw new Error('source_video is required');

      const isUrl = /^https?:\/\//i.test(source_video);
      let startResponse;
      if (isUrl) {
        startResponse = await client.post('/v1/generate/video-from-video', {
          video_url: source_video, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids, resolution,
          reference_images, reference_videos, elements, preset, source_language, translation_language,
          srt_content, srt_file_url, vocabulary, customization, project_id
        });
      } else {
        const resolved = await resolveToBuffer(source_video, 'video');
        const form = new FormData();
        form.append('files', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        if (prompt) form.append('prompt', prompt);
        if (preset) form.append('preset', preset);
        if (source_language) form.append('source_language', source_language);
        if (translation_language) form.append('translation_language', translation_language);
        if (srt_content) form.append('srt_content', srt_content);
        if (srt_file_url) form.append('srt_file_url', srt_file_url);
        if (vocabulary) form.append('vocabulary', JSON.stringify(vocabulary));
        if (customization) form.append('customization', JSON.stringify(customization));
        if (model) form.append('model', model);
        if (aspect_ratio) form.append('aspect_ratio', aspect_ratio);
        if (duration !== undefined) form.append('duration', String(duration));
        if (enhance_prompt !== undefined) form.append('enhance_prompt', String(enhance_prompt));
        if (visual_dna_ids) form.append('visual_dna_ids', JSON.stringify(visual_dna_ids));
        if (resolution) form.append('resolution', resolution);
        if (reference_images) form.append('reference_images', JSON.stringify(reference_images));
        if (reference_videos) form.append('reference_videos', JSON.stringify(reference_videos));
        if (elements) form.append('elements', JSON.stringify(elements));
        if (project_id) form.append('project_id', project_id);
        startResponse = await client.postMultipart('/v1/generate/video-from-video', form);
      }

      if (ui()) return uiGenerating({
        tool: 'generate_video_from_video', kind: 'video', gen: startResponse, client, model,
        prompt: prompt || (preset ? `Subtitles preset: ${preset}` : undefined),
        settings: { duration, resolution, aspect_ratio, mode: preset ? 'subtitles' : 'restyle' },
        reference_image: reference_images?.[0]
      });

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── transcribe_audio ──────────────────────────────────────
  server.tool(
    'transcribe_audio',
    'Transcribe audio or video into text + SRT subtitles. Source can be a URL or an absolute local file path. Returns the full text, SRT content, duration, and download URLs for .srt/.txt files. Works on both audio-only files (mp3, wav, m4a) and videos with audio tracks (mp4, mov, webm). Supports language selection, speaker diarization, audio-event tagging, and SRT subtitle formatting controls.',
    {
      source: z.string().describe('URL or absolute local path to the audio / video file to transcribe'),
      language: z.string().optional().describe('Language code of the speech (e.g. "en", "he", "es"). Omit to auto-detect.'),
      diarize: z.boolean().optional().describe('Detect and label distinct speakers. Default: false.'),
      tag_audio_events: z.boolean().optional().describe('Tag non-speech audio events (laughter, applause, music) in the transcript. Default: false.'),
      remove_punctuation: z.boolean().optional().describe('Strip punctuation from the transcript. Default: false.'),
      generate_srt: z.boolean().optional().describe('Produce SRT + word-by-word SRT subtitle files. Default: true.'),
      words_per_line: z.number().optional().describe('SRT: max words per subtitle line, 1–18. Default: 12.'),
      lines_per_subtitle: z.number().optional().describe('SRT: max lines per subtitle cue, 1–4. Default: 2.'),
      stretch_captions: z.boolean().optional().describe('SRT: extend each cue\'s end time to the next cue\'s start (gap-free subtitles). Default: true.'),
      project_id: projectIdField
    },
    async ({ source, language, diarize, tag_audio_events, remove_punctuation, generate_srt, words_per_line, lines_per_subtitle, stretch_captions, project_id }) => {
      if (!source) throw new Error('source is required (URL or absolute local path)');

      // Advanced transcription controls forwarded when provided (undefined keys are dropped by the client).
      const opts = {
        language, diarize, tag_audio_events, remove_punctuation,
        generate_srt, words_per_line, lines_per_subtitle, stretch_captions, project_id
      };

      const isUrl = /^https?:\/\//i.test(source);
      let startResponse;
      if (isUrl) {
        startResponse = await client.post('/v1/transcribe', { audio_url: source, ...opts });
      } else {
        const resolved = await resolveToBuffer(source, 'audio');
        const form = new FormData();
        form.append('file', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        for (const [k, v] of Object.entries(opts)) {
          if (v !== undefined && v !== null) form.append(k, typeof v === 'boolean' ? String(v) : v);
        }
        startResponse = await client.postMultipart('/v1/transcribe', form);
      }

      if (ui()) {
        return uiResult(UI.transcript, JSON.stringify({
          status: 'submitted',
          generation_id: startResponse.generation_id,
          _widget_note: 'A live Kolbo transcription widget is rendering above — it shows progress, the transcript text, and SRT/TXT download buttons. Tell the user it is transcribing. If you need the transcript text for a follow-up step, call get_generation_status ONCE with this generation_id and wait=true — it blocks until done; do NOT poll in a loop.',
        }, null, 2), {
          widget: 'transcript', phase: 'generating',
          generation_id: startResponse.generation_id,
          poll_tool: 'get_generation_status',
          audio_url: isUrl ? source : undefined,
          open_url: buildOpenUrl('transcribe_audio', startResponse),
        });
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 5) * 1000,
        timeout: 1800000 // 30 minutes — long podcasts are a thing
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            text: result.result?.text || '',
            srt_url: result.result?.srt_url || null,
            word_by_word_srt_url: result.result?.word_by_word_srt_url || null,
            txt_url: result.result?.txt_url || null,
            duration: result.result?.duration || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_3d ───────────────────────────────────────────
  server.tool(
    'generate_3d',
    'Generate a 3D model from a text prompt, a single reference image, or multiple reference images (for multi-view reconstruction). Returns model URLs in multiple formats (GLB, FBX, OBJ, USDZ). Modes: "text" (prompt-only), "single" (one image), "multi" (multiple images for better quality). The mode is auto-detected from the inputs if not specified.',
    {
      prompt: z.string().optional().describe('Text description of the 3D object to generate (used in text mode and also as a hint in image modes)'),
      reference_images: z.array(z.string()).optional().describe('Array of public image URLs. 1 image → single mode, 2+ → multi mode.'),
      mode: z.string().optional().describe('Explicitly set mode: "text" | "single" | "multi". Auto-detected from reference_images if omitted.'),
      texture_prompt: z.string().optional().describe('Optional prompt to guide texture generation'),
      model: z.string().optional().describe('Model identifier. Use list_models type="three_d" to see all 3D options, or filter by sub-type: "3d_text_to_model", "3d_image_to_model", "3d_multi_image_to_model", "3d_world".'),
      topology: z.string().optional().describe('Topology preset (optional, model-specific)'),
      target_polycount: z.number().optional().describe('Target polygon count (optional, model-specific)'),
      enable_tpose: z.boolean().optional().describe('Force T-pose for character models (optional)'),
      enable_pbr: z.boolean().optional().describe('Enable PBR textures (optional)'),
      project_id: projectIdField
    },
    async ({ prompt, reference_images, mode, texture_prompt, model, topology, target_polycount, enable_tpose, enable_pbr, project_id }) => {
      model = await canonicalModelId(client, model); // lenient id resolution ("z-image" → "z-image/turbo")
      if (!prompt && !(reference_images && reference_images.length > 0)) {
        throw new Error('Provide prompt (text mode) or reference_images (single/multi mode)');
      }

      const startResponse = await client.post('/v1/generate/3d', {
        mode,
        prompt,
        reference_images,
        texture_prompt,
        model,
        topology,
        target_polycount,
        enable_tpose,
        enable_pbr,
        project_id
      });

      if (ui()) return uiGenerating({
        tool: 'generate_3d', kind: '3d', gen: startResponse, client, model, prompt,
        settings: { mode: mode || (reference_images?.length > 1 ? 'multi' : reference_images?.length === 1 ? 'single' : 'text') },
        reference_image: reference_images?.[0]
      });

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 900000 // 15 minutes — 3D generation is slow
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            mode: result.result?.mode || null,
            prompt_used: result.result?.prompt_used || null
          }, null, 2)
        }]
      };
    }
  );
  // ─── edit_image ────────────────────────────────────────────
  server.tool(
    'edit_image',
    'Apply a targeted AI edit to an existing image. Covers mechanical enhancements (upscale, reframe, remove background, skin retouching) AND creative operations (inpaint, erase, face swap, background replace, camera angle, zoom out, multi-shot grid, split/upscale). ⚠️ For open-ended PROMPT-DRIVEN content edits — "make it night", restyling, adding/removing objects — use `generate_image_edit` instead; it runs on stronger dedicated editing models and produces better results.',
    {
      image_url: z.string().describe('URL of the primary source image to edit.'),

      operation: z.enum([
        'upscale', 'clarity_upscale',
        'reframe', 'zoom_out',
        'removebg', 'background_replace',
        'enhance_skin',
        'inpaint', 'erase',
        'face_swap',
        'camera_angle',
        'split', 'split_upscale',
        'multi_shot',
        'magic_edit'
      ]).describe([
        'Edit operation:',
        '"upscale" — increase resolution by 2×, 3×, or 4× (use `scale`). "clarity_upscale" — AI-powered clarity upscale with detail enhancement (use `resolution`).',
        '"reframe" — change aspect ratio (requires `aspect_ratio`, e.g. "16:9" or "9:16").',
        '"zoom_out" — expand the image outward, filling new areas with AI-generated content.',
        '"removebg" — remove the image background, output is transparent PNG.',
        '"background_replace" — remove background and replace it with AI-generated content from `prompt`.',
        '"enhance_skin" — portrait skin retouching (use `skin_strength`: "subtle" | "realistic" | "pimple" | "freckle").',
        '"inpaint" — paint over a masked area using `mask_image_url` (B&W mask, white = fill area) and optional `prompt`. Add reference images via `additional_images`.',
        '"erase" — erase an object defined by `mask_image_url` (white = erase area).',
        '"face_swap" — swap the face in `image_url` with the face from `mask_image_url` (required).',
        '"camera_angle" — generate the image from a different camera angle. Set `generate_all_angles=true` for a full set. Use `prompt` to guide the angle.',
        '"split" — split the image into a 3×3 grid of tiles. "split_upscale" — split into a grid and upscale each tile.',
        '"multi_shot" — generate a 3×3 multi-shot grid of scenes (uses `additional_images` as reference shots). Use `resolution` for output quality.',
        '"magic_edit" (DEPRECATED) — prompt-driven content edit. Prefer `generate_image_edit` for better results.',
      ].join(' ')),

      model: z.string().optional()
        .describe('Model identifier override. Omit to use the platform default for the operation.'),

      // ── upscale ────────────────────────────────────────────
      scale: z.number().optional()
        .describe('Upscale factor: 2, 3, or 4. Used with operation="upscale". Default: 2.'),

      resolution: z.string().optional()
        .describe('Target output resolution (e.g. "4k", "2k", "1080p"). Used with "clarity_upscale", "split_upscale", "multi_shot".'),

      // ── reframe ────────────────────────────────────────────
      aspect_ratio: z.string().optional()
        .describe('Target aspect ratio (e.g. "16:9", "9:16", "1:1", "4:3"). Required for operation="reframe".'),

      // ── enhance_skin ───────────────────────────────────────
      skin_strength: z.enum(['subtle', 'realistic', 'pimple', 'freckle']).optional()
        .describe('Skin enhancement preset. Used with operation="enhance_skin". Default: "realistic".'),

      // ── inpaint / erase / face_swap / background_replace / zoom_out / camera_angle / magic_edit ──
      prompt: z.string().optional()
        .describe('Text instruction guiding the edit. Required for "background_replace". Used with "inpaint", "zoom_out", "camera_angle", and the deprecated "magic_edit".'),

      mask_image_url: z.string().optional()
        .describe('URL of a mask image (black & white; white = affected area). Required for "inpaint" and "erase". For "face_swap", this is the face reference image.'),

      additional_images: z.array(z.string()).optional()
        .describe('Extra reference image URLs (up to 8). For "inpaint": reference images that guide style/content. For "multi_shot": the set of scene reference shots. For "magic_edit": additional source images for composite edits.'),

      // ── camera_angle ───────────────────────────────────────
      generate_all_angles: z.boolean().optional()
        .describe('When true, generates a full set of camera angles instead of just one. Only used with operation="camera_angle".'),

      // ── quality / prompt enhancement ───────────────────────
      quality: z.string().optional()
        .describe('Output quality preset (e.g. "high", "standard"). Applies where the underlying model supports quality tiers.'),

      ai_optimize: z.boolean().optional()
        .describe('Whether to let Kolbo AI enhance your prompt before sending to the model. Default: true. Set false to use your prompt exactly as written.'),

      project_id: projectIdField
    },
    async ({
      image_url, operation, model, scale, aspect_ratio, skin_strength, prompt,
      mask_image_url, additional_images, generate_all_angles, resolution, quality, ai_optimize,
      project_id
    }) => {
      model = await canonicalModelId(client, model);

      // Basic validation
      if (operation === 'reframe' && !aspect_ratio) throw new Error('aspect_ratio is required for reframe');
      if (operation === 'background_replace' && !prompt) throw new Error('prompt is required for background_replace');
      if (operation === 'face_swap' && !mask_image_url && !(additional_images && additional_images.length > 0)) {
        throw new Error('mask_image_url (face reference) is required for face_swap');
      }

      const gen = await client.post('/v1/edit/image', {
        image_url, operation, model, scale, aspect_ratio, skin_strength, prompt,
        mask_image_url, additional_images, generate_all_angles, resolution, quality, ai_optimize,
        project_id
      });

      if (ui()) return uiGenerating({
        tool: 'edit_image', kind: 'image', gen, client, model,
        prompt: prompt || operation,
        settings: { mode: operation, aspect_ratio, scale, resolution },
        reference_image: image_url
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 300000 // 5 min — split_upscale and multi_shot can take longer
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            edit_type: result.result?.edit_type || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── edit_video ────────────────────────────────────────────
  server.tool(
    'edit_video',
    'Apply a targeted AI edit to an existing video. Covers both mechanical edits (upscale, reframe, remove watermark, remove background) and creative operations (generate audio, face swap, extend, lipsync, inpaint, retake, magic edit). Returns the edited video URL when complete.',
    {
      video_url: z.string().describe('URL of the source video to edit.'),

      operation: z.enum([
        'upscale', 'reframe',
        'generate_audio', 'remove_watermark',
        'face_swap', 'extend', 'magic_edit',
        'lipsync', 'remove_background',
        'inpaint', 'retake'
      ]).describe([
        'Edit operation:',
        '"upscale" — boost to 4K/2K resolution (use `scale` for factor, `resolution` for target, `target_fps` for frame rate).',
        '"reframe" — change aspect ratio (requires `aspect_ratio`; use `grid_position_x`/`grid_position_y` to control where the original sits).',
        '"generate_audio" — add AI-generated audio from `prompt`. Optionally split into `sound_effect_prompt` and `background_music_prompt`. Set `original_sound=true` to keep original audio alongside.',
        '"remove_watermark" — AI-powered watermark removal.',
        '"face_swap" — replace the face in the video with the face from `image_url` (required).',
        '"extend" — lengthen the video at `mode` ("start" or "end") by `duration` seconds. Optional `prompt` and `context` guide the generated content.',
        '"magic_edit" — restyle or transform the video with `prompt` (required).',
        '"lipsync" — sync a face to audio. Provide `audio_url` (audio file) OR `text_prompt` (will synthesize speech).',
        '"remove_background" — remove or greenscreen the video background. Use `refine_edges=true` for cleaner cutouts, `subject_is_person=true` for portrait-optimized mode.',
        '"inpaint" — replace a region of the video. Provide `mask_video_url` (B&W mask, white=fill area), `prompt` for what to generate, and optionally `object_prompt` (what to replace) and `video_strength` (0–1, how strongly to follow the original).',
        '"retake" — regenerate a segment of the video. Use `start_time` (seconds) + `duration` + optional `prompt`.',
      ].join(' ')),

      model: z.string().optional()
        .describe('Model identifier override. Omit to use the platform default for the operation.'),

      // ── upscale ────────────────────────────────────────────
      scale: z.number().optional()
        .describe('Upscale factor (e.g. 2, 4). Used with operation="upscale".'),
      resolution: z.string().optional()
        .describe('Target resolution (e.g. "4k", "2k", "1080p"). Used with "upscale" and "reframe".'),
      target_fps: z.number().optional()
        .describe('Target frame rate (e.g. 24, 30, 60). Used with operation="upscale".'),

      // ── reframe ────────────────────────────────────────────
      aspect_ratio: z.string().optional()
        .describe('Target aspect ratio (e.g. "16:9", "9:16", "1:1"). Required for operation="reframe".'),
      grid_position_x: z.number().optional()
        .describe('Horizontal position (0.0–1.0) of the original content within the reframed canvas. Used with "reframe". Default: 0.5 (center).'),
      grid_position_y: z.number().optional()
        .describe('Vertical position (0.0–1.0) of the original content within the reframed canvas. Used with "reframe". Default: 0.5 (center).'),

      // ── generate_audio ─────────────────────────────────────
      prompt: z.string().optional()
        .describe('Text prompt. Required for "magic_edit". Used with "generate_audio", "extend", "inpaint", "retake", and optionally "lipsync" (for text-to-speech instead of audio_url).'),
      sound_effect_prompt: z.string().optional()
        .describe('Separate prompt for sound effects layer. Used with operation="generate_audio" when you want to specify SFX and music independently.'),
      background_music_prompt: z.string().optional()
        .describe('Separate prompt for background music layer. Used with operation="generate_audio" alongside `sound_effect_prompt`.'),
      original_sound: z.boolean().optional()
        .describe('When true, keeps the original video audio and mixes in the generated audio. Used with "generate_audio". Default: false.'),
      cfg_strength: z.number().optional()
        .describe('Guidance strength for audio generation (higher = follows prompt more strictly). Used with "generate_audio".'),

      // ── face_swap ──────────────────────────────────────────
      image_url: z.string().optional()
        .describe('URL of the reference face image. Required for operation="face_swap".'),

      // ── extend ─────────────────────────────────────────────
      duration: z.number().optional()
        .describe('Seconds of content to generate. Used with "extend" (required) and "retake" (optional). Typical range: 1–20.'),
      mode: z.string().optional()
        .describe('Extension direction: "start" or "end". Used with "extend". For "retake": replacement mode (default: "replace_audio_and_video"). Default: "end".'),
      context: z.string().optional()
        .describe('Additional context to guide what gets generated in the extended segment. Used with "extend".'),

      // ── lipsync ────────────────────────────────────────────
      audio_url: z.string().optional()
        .describe('URL of the audio track to sync to the face. Required for "lipsync" unless `text_prompt` is provided.'),
      text_prompt: z.string().optional()
        .describe('Text to synthesize as speech and sync to the face. Used with "lipsync" as an alternative to `audio_url`.'),

      // ── remove_background ──────────────────────────────────
      refine_edges: z.boolean().optional()
        .describe('Apply edge refinement for cleaner background removal. Used with "remove_background". Default: false.'),
      subject_is_person: z.boolean().optional()
        .describe('Optimize background removal for a human subject (portrait mode). Used with "remove_background". Default: false.'),

      // ── inpaint ────────────────────────────────────────────
      mask_video_url: z.string().optional()
        .describe('URL of a mask video (B&W; white = area to fill). Used with operation="inpaint".'),
      object_prompt: z.string().optional()
        .describe('Description of the object being replaced (helps the model understand what to remove). Used with "inpaint".'),
      video_strength: z.number().optional()
        .describe('How closely to follow the original video (0.0–1.0; higher = closer to original). Used with "inpaint".'),

      // ── retake ─────────────────────────────────────────────
      start_time: z.number().optional()
        .describe('Start time in seconds of the segment to retake. Used with operation="retake".'),

      project_id: projectIdField
    },
    async ({
      video_url, operation, model, aspect_ratio, scale, prompt,
      image_url, audio_url, duration, mode,
      target_fps, resolution,
      grid_position_x, grid_position_y,
      sound_effect_prompt, background_music_prompt, original_sound, cfg_strength,
      refine_edges, subject_is_person,
      text_prompt, context,
      mask_video_url, object_prompt, video_strength,
      start_time,
      project_id
    }) => {
      model = await canonicalModelId(client, model);

      // Validation
      if (operation === 'magic_edit'    && !prompt)      throw new Error('prompt is required for magic_edit');
      if (operation === 'generate_audio'&& !prompt)      throw new Error('prompt is required for generate_audio');
      if (operation === 'reframe'       && !aspect_ratio)throw new Error('aspect_ratio is required for reframe');
      if (operation === 'face_swap'     && !image_url)   throw new Error('image_url (reference face) is required for face_swap');
      if (operation === 'lipsync' && !audio_url && !text_prompt) throw new Error('audio_url or text_prompt is required for lipsync');
      if (operation === 'extend'        && !duration)    throw new Error('duration is required for extend');

      const gen = await client.post('/v1/edit/video', {
        video_url, operation, model, aspect_ratio, scale, prompt,
        image_url, audio_url, duration, mode,
        target_fps, resolution,
        grid_position_x, grid_position_y,
        sound_effect_prompt, background_music_prompt, original_sound, cfg_strength,
        refine_edges, subject_is_person,
        text_prompt, context,
        mask_video_url, object_prompt, video_strength,
        start_time,
        project_id
      });

      if (ui()) return uiGenerating({
        tool: 'edit_video', kind: 'video', gen, client, model,
        prompt: prompt || operation,
        settings: { mode: operation, duration, aspect_ratio, resolution },
        reference_image: image_url
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            download_url: result.result?.download_url || null,
            edit_type: result.result?.edit_type || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── trim_video ────────────────────────────────────────────
  server.tool(
    'trim_video',
    'Cut a section out of a video by start/end time (frame-accurate server-side trim, no credits for AI generation — pure processing). Source must be a Kolbo-hosted video URL (generated output or upload_media result). The tool waits for the job to finish (usually seconds) and returns the trimmed video URL.',
    {
      video_url: z.string().describe('Kolbo-hosted URL of the source video.'),
      start_time: z.number().describe('Trim start, in seconds (>= 0).'),
      end_time: z.number().describe('Trim end, in seconds (> start_time, max 3600).'),
      project_id: z.string().optional().describe('Project to file the trimmed video into (from list_projects).')
    },
    async ({ video_url, start_time, end_time, project_id }) => {
      const body = { video_url, start_time, end_time };
      if (project_id) body.project_id = project_id;
      const submit = await client.post('/v1/video/trim', body);
      const jobId = submit.jobId || submit.generationId;
      if (!jobId) return { content: [{ type: 'text', text: JSON.stringify(submit, null, 2) }] };
      // Poll the dedicated trim progress endpoint until done (~seconds).
      const deadline = Date.now() + 180000;
      let last = submit;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 4000));
        last = await client.get(`/v1/video/trim/${encodeURIComponent(jobId)}`);
        if (last.status === 'completed' || last.url || last.videoUrl) break;
        if (last.status === 'failed') break;
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            job_id: jobId,
            status: last.status || 'processing',
            video_url: last.url || last.videoUrl || null
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerGenerateTools };
