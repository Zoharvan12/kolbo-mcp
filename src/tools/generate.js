/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { pollUntilDone } = require('../polling');
const { resolveToBuffer } = require('./_shared');

function registerGenerateTools(server, client) {
  // ─── generate_image ────────────────────────────────────────
  server.tool(
    'generate_image',
    'Generate image(s) from a text prompt using Kolbo AI. Supports Visual DNA profiles (for character/style/product consistency), moodboards (for style direction), reference images (for composition guidance), batch generation (num_images), and web-search grounding. For EDITING an existing image, use generate_image_edit instead. For a coordinated multi-scene set (storyboard, ad campaign), use generate_creative_director. Returns the final image URL(s) when complete.',
    {
      prompt: z.string().describe('Text description of the image to generate'),
      model: z.string().optional().describe('Model identifier. Use list_models type="image" to see options. Omit for Smart Select.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "1:1", "16:9", "9:16"). Default: "1:1"'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt for better results. Default: true'),
      num_images: z.number().optional().describe('Number of images to generate in one call. Default: 1'),
      reference_images: z.array(z.string()).optional().describe('Array of image URLs used as composition/style references (NOT as source images for editing — use generate_image_edit for that).'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs (from create_visual_dna / list_visual_dnas) to apply for character / style / product / scene consistency. Pass the `id` field of each profile. Use this when the user wants to keep the same character or style across multiple images.'),
      moodboard_id: z.string().optional().describe('Moodboard ID (from list_moodboards / get_moodboard) whose master_prompt and style_guide should be applied to this generation.'),
      enable_web_search: z.boolean().optional().describe('Enable web-search grounding for the prompt (useful for current events, brand references, real-world accuracy). Default: false')
    },
    async ({ prompt, model, aspect_ratio, enhance_prompt, num_images, reference_images, visual_dna_ids, moodboard_id, enable_web_search }) => {
      const gen = await client.post('/v1/generate/image', {
        prompt, model, aspect_ratio, enhance_prompt, num_images,
        reference_images, visual_dna_ids, moodboard_id, enable_web_search
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 3) * 1000,
        timeout: 120000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            urls: result.result.urls,
            model: result.result.model,
            prompt_used: result.result.prompt_used
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_image_edit ──────────────────────────────────
  server.tool(
    'generate_image_edit',
    'Edit or transform an existing image using AI. Provide the source image URL(s) in `source_images` and describe the edit in `prompt` (e.g., "remove the background", "change the car color to red", "add sunglasses to the person"). Supports Visual DNA profiles and moodboards for style-consistent edits. For creating a brand new image from scratch, use generate_image. Returns the edited image URL(s) when complete.',
    {
      prompt: z.string().describe('Description of the edit to apply (e.g., "remove the background", "change the sky to sunset")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="image_edit" to see options. Omit for Smart Select.'),
      source_images: z.array(z.string()).describe('Array of source image URLs to edit. Typically one, but some models accept multiple for compositing.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio (e.g., "1:1", "16:9", "9:16"). Default: "1:1"'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt for better results. Default: true'),
      num_images: z.number().optional().describe('Number of output images. Default: 1'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply for consistency with an existing character / style / product.'),
      moodboard_id: z.string().optional().describe('Moodboard ID whose master_prompt and style_guide should be applied.'),
      enable_web_search: z.boolean().optional().describe('Enable web-search grounding. Default: false')
    },
    async ({ prompt, model, source_images, aspect_ratio, enhance_prompt, num_images, visual_dna_ids, moodboard_id, enable_web_search }) => {
      const gen = await client.post('/v1/generate/image-edit', {
        prompt, model, source_images, aspect_ratio, enhance_prompt, num_images,
        visual_dna_ids, moodboard_id, enable_web_search
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 3) * 1000,
        timeout: 120000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            urls: result.result.urls,
            model: result.result.model,
            prompt_used: result.result.prompt_used
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_creative_director ─────────────────────────────
  server.tool(
    'generate_creative_director',
    'Generate a multi-scene coordinated set from ONE creative brief. Use this INSTEAD of calling generate_image/generate_video multiple times when the user wants a storyboard, multi-scene ad, product showcase, or any set of related outputs that should share visual language. Produces 1–8 scenes in a single request with consistent style. Supports image mode and video mode (`workflow_type`). Visual DNA and moodboard references keep character/style consistent across every scene.',
    {
      prompt: z.string().describe('Creative brief or concept describing the full set of scenes to generate'),
      scene_count: z.number().optional().describe('Number of scenes to generate, 1–8. Default: 4'),
      model: z.string().optional().describe('Model identifier applied to every scene. Omit for Smart Select.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio applied to every scene (e.g., "1:1", "16:9", "9:16"). Default: "1:1"'),
      workflow_type: z.string().optional().describe('"image" (default) or "video"'),
      duration: z.number().optional().describe('Duration in seconds per scene (video mode only). E.g., 5 or 10.'),
      enhance_prompt: z.boolean().optional().describe('Enhance prompts per scene. Default: true'),
      reference_images: z.array(z.string()).optional().describe('Array of reference image URLs to guide style/composition of every scene.'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply consistently across every scene. This is the ideal way to keep a character or product looking the same in all scenes of a campaign.'),
      moodboard_id: z.string().optional().describe('A single moodboard ID whose master_prompt and style_guide should shape every scene.'),
      moodboard_ids: z.array(z.string()).optional().describe('Multiple moodboard IDs when blending styles. Prefer `moodboard_id` for single moodboards.')
    },
    async ({ prompt, scene_count, model, aspect_ratio, workflow_type, duration, enhance_prompt, reference_images, visual_dna_ids, moodboard_id, moodboard_ids }) => {
      const gen = await client.post('/v1/generate/creative-director', {
        prompt, scene_count, model, aspect_ratio, workflow_type, duration,
        enhance_prompt, reference_images, visual_dna_ids, moodboard_id, moodboard_ids
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 600000,
        statusUrl: `/v1/generate/creative-director/${gen.generation_id}/status`
      });

      const scenes = (result.scenes || [])
        .filter(s => s.status === 'completed')
        .map(s => ({
          scene_number: s.scene_number,
          title: s.title,
          image_urls: s.image_urls,
          video_urls: s.video_urls
        }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            scenes,
            total_scenes: result.scenes?.length || 0,
            completed_scenes: scenes.length
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_video ────────────────────────────────────────
  server.tool(
    'generate_video',
    'Generate a video from a text prompt using Kolbo AI. For animating an existing still image into motion, use generate_video_from_image instead. For a coordinated multi-scene video campaign, use generate_creative_director with workflow_type="video". Supports Visual DNA profiles (for character consistency) and reference images (for style guidance). Returns the final video URL when complete.',
    {
      prompt: z.string().describe('Text description of the video to generate'),
      model: z.string().optional().describe('Model identifier. Use list_models type="video" to see options. Check supported_durations and supported_aspect_ratios.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "16:9", "9:16", "1:1"). Default: "16:9"'),
      duration: z.number().optional().describe('Duration in seconds. Must be a value the chosen model supports — check supported_durations from list_models. Default: 5'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      reference_images: z.array(z.string()).optional().describe('Array of image URLs used as visual references (style / composition / subject).'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to keep a character / style consistent with prior generations.')
    },
    async ({ prompt, model, aspect_ratio, duration, enhance_prompt, reference_images, visual_dna_ids }) => {
      const gen = await client.post('/v1/generate/video', {
        prompt, model, aspect_ratio, duration, enhance_prompt, reference_images, visual_dna_ids
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            urls: result.result.urls,
            model: result.result.model,
            duration: result.result.duration,
            thumbnail_url: result.result.thumbnail_url,
            prompt_used: result.result.prompt_used
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
      model: z.string().optional().describe('Model identifier. Use list_models type="video_from_image" to see options.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio (e.g., "16:9", "9:16", "1:1"). Default: "16:9"'),
      duration: z.number().optional().describe('Duration in seconds. Must be a value the chosen model supports. Default: 5'),
      enhance_prompt: z.boolean().optional().describe('Enhance the motion prompt. Default: true'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to maintain consistency with prior characters / styles.')
    },
    async ({ image_url, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids }) => {
      const gen = await client.post('/v1/generate/video/from-image', {
        image_url, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            urls: result.result.urls,
            model: result.result.model,
            duration: result.result.duration,
            thumbnail_url: result.result.thumbnail_url
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_music ────────────────────────────────────────
  server.tool(
    'generate_music',
    'Generate music from a text description using Kolbo AI. Supports instrumental mode, custom lyrics, style direction, and vocal gender. Default model is Suno. Returns the final audio URL when complete.',
    {
      prompt: z.string().describe('Text description of the music to generate (e.g., "upbeat electronic dance track with synthesizers")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="music" to see options. Omit for Suno (default).'),
      style: z.string().optional().describe('Music style / genre (e.g., "pop", "rock", "lo-fi", "electronic", "jazz")'),
      instrumental: z.boolean().optional().describe('Generate instrumental only, no vocals. Default: false'),
      lyrics: z.string().optional().describe('Custom lyrics for the song. If omitted, lyrics are generated automatically from the prompt unless instrumental is true.'),
      vocal_gender: z.string().optional().describe('Preferred vocal gender: "male" or "female". Only applies when instrumental is false.'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true')
    },
    async ({ prompt, model, style, instrumental, lyrics, vocal_gender, enhance_prompt }) => {
      const gen = await client.post('/v1/generate/music', {
        prompt, model, style, instrumental, lyrics, vocal_gender, enhance_prompt
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
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
    'Convert text to speech using Kolbo AI. Default provider is ElevenLabs. To pick a specific voice by language/gender, call list_voices first and pass the returned voice_id (or a voice display name — both work). Returns the final audio URL when complete.',
    {
      text: z.string().describe('The text to convert to speech'),
      voice: z.string().optional().describe('Voice ID (from list_voices) or voice display name (e.g., "Rachel", "Adam"). Default: "Rachel"'),
      model: z.string().optional().describe('Model identifier. Use list_models type="speech" to see options. Default: eleven_v3'),
      language: z.string().optional().describe('Language code (e.g., "en-US", "he-IL", "es-ES"). Default: "en-US"')
    },
    async ({ text, voice, model, language }) => {
      const gen = await client.post('/v1/generate/speech', {
        text, voice, model, language
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 120000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
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
    'Generate sound effects (not music, not speech) from a text description using Kolbo AI. Use this for ambient sounds, foley, impacts, atmospheres, UI sounds, etc. For music use generate_music; for voice use generate_speech. Returns the final audio URL when complete.',
    {
      prompt: z.string().describe('Text description of the sound effect (e.g., "thunder clap with rain", "door creaking open", "futuristic UI beep")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="sound" to see options. Default: elevenlabs-sound-effects-v1'),
      duration: z.number().optional().describe('Duration in seconds. Omit for automatic duration.')
    },
    async ({ prompt, model, duration }) => {
      const gen = await client.post('/v1/generate/sound', {
        prompt, model, duration
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 120000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            urls: result.result.urls,
            duration: result.result.duration
          }, null, 2)
        }]
      };
    }
  );

  // ─── list_voices ─────────────────────────────────────────────
  server.tool(
    'list_voices',
    'List available TTS voices for generate_speech. Returns preset voices and the user\'s own cloned/designed voices. Filter by provider, language, or gender to find the right voice. Use the returned `voice_id` as the `voice` parameter in generate_speech.',
    {
      provider: z.string().optional().describe('Filter by provider (e.g., "elevenLabs", "google")'),
      language: z.string().optional().describe('Filter by language name or code (e.g., "English", "en-US")'),
      gender: z.string().optional().describe('Filter by gender (e.g., "Female", "Male")')
    },
    async ({ provider, language, gender }) => {
      const params = new URLSearchParams();
      if (provider) params.set('provider', provider);
      if (language) params.set('language', language);
      if (gender) params.set('gender', gender);

      const qs = params.toString();
      const result = await client.get(`/v1/voices${qs ? '?' + qs : ''}`);

      // Summarize for context window efficiency
      const voices = (result.voices || []).map(v => ({
        voice_id: v.voice_id,
        name: v.name,
        provider: v.provider,
        language: v.language,
        gender: v.gender,
        custom: v.custom
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ voices, count: result.count }, null, 2)
        }]
      };
    }
  );

  // ─── get_generation_status ─────────────────────────────────
  server.tool(
    'get_generation_status',
    'Check the status of a generation. Use this as a FALLBACK when a generation tool returned a timeout error — the generation is probably still running on the server. Pass the generation_id from the timeout error (or from any prior generation response).',
    {
      generation_id: z.string().describe('The generation ID to check')
    },
    async ({ generation_id }) => {
      const result = await client.get(`/v1/generate/${encodeURIComponent(generation_id)}/status`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
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
    'Generate a video from reference elements (images and/or videos) + a text prompt. Use when the user wants to animate specific uploaded/referenced assets — e.g. "animate this product", "put these 3 characters into a scene". Supports Visual DNA for character consistency. For text-only → video use generate_video instead. For animating a single still image use generate_video_from_image. Returns the final video URL when complete.',
    {
      prompt: z.string().describe('Text description of the desired video / animation'),
      model: z.string().optional().describe('Model identifier. Use list_models type="video" to see options. Omit for Smart Select.'),
      reference_images: z.array(z.string()).optional().describe('Array of public image URLs used as reference elements (product shots, character references, etc.). URL mode.'),
      files: z.array(z.string()).optional().describe('Array of URLs or absolute local paths — alternative to reference_images. Use this when you have local files to upload. Each item can be a URL OR a local path.'),
      duration: z.number().optional().describe('Duration in seconds. Default: 5'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "16:9", "9:16", "1:1"). Default: "16:9"'),
      motion: z.string().optional().describe('Motion style / intensity hint (optional)'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="video" (optional)'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply for character/style consistency across outputs.')
    },
    async ({ prompt, model, reference_images, files, duration, aspect_ratio, motion, preset_id, enhance_prompt, visual_dna_ids }) => {
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
        for (const f of resolved) {
          form.append('files', f.buffer, { filename: f.filename, contentType: f.contentType });
        }
        startResponse = await client.postMultipart('/v1/generate/elements', form);
      } else {
        // URL-only mode: plain JSON.
        startResponse = await client.post('/v1/generate/elements', {
          prompt, model, reference_images, duration, aspect_ratio, motion, preset_id, enhance_prompt, visual_dna_ids
        });
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
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
      model: z.string().optional().describe('Model identifier. Use list_models type="video_from_image" to see options. Omit for Smart Select.'),
      duration: z.number().optional().describe('Duration in seconds. Default: 5'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (auto-detected from first frame if not provided). Default: "16:9"'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply.')
    },
    async ({ first_frame_url, last_frame_url, first_frame, last_frame, prompt, model, duration, aspect_ratio, enhance_prompt, visual_dna_ids }) => {
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
        startResponse = await client.postMultipart('/v1/generate/first-last-frame', form);
      } else {
        startResponse = await client.post('/v1/generate/first-last-frame', {
          first_frame_url, last_frame_url, prompt, model, duration, aspect_ratio, enhance_prompt, visual_dna_ids
        });
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
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
    'Lipsync an audio track to a source image or video. Both `source` (image or video) and `audio` can be provided as URLs or as absolute local file paths. Pass a text_prompt only if the model supports it (some lipsync models do character performance from a prompt). Returns a lipsynced video URL.',
    {
      source: z.string().describe('URL or absolute local path to the source image or video (the face to animate)'),
      audio: z.string().describe('URL or absolute local path to the audio track (the voice to sync to)'),
      text_prompt: z.string().optional().describe('Optional text prompt (for performance-capable models)'),
      model: z.string().optional().describe('Model identifier. Use list_models type="lipsync" to see options. Omit for Smart Select.'),
      bounding_box_target: z.array(z.number()).optional().describe('Optional bounding box [x, y, w, h] for multi-face inputs (Hedra Character3 style). Leave empty for single-face.')
    },
    async ({ source, audio, text_prompt, model, bounding_box_target }) => {
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
          bounding_box_target
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
        startResponse = await client.postMultipart('/v1/generate/lipsync', form);
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
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
    'Restyle / transform an existing video using a text prompt (video-to-video). Use for style transfer, scene restyling, subject swap — anything where you want to keep the motion from the input video but change the look. Source video can be a URL or absolute local path. For animating a still image use generate_video_from_image instead. For text-only → video use generate_video.',
    {
      source_video: z.string().describe('URL or absolute local path to the source video to restyle'),
      prompt: z.string().describe('Text description of the desired restyle / transformation'),
      model: z.string().optional().describe('Model identifier. Omit for Smart Select.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio. Default: matches source'),
      duration: z.number().optional().describe('Duration in seconds (default: matches source)'),
      enhance_prompt: z.boolean().optional().describe('Enhance the prompt. Default: true'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply for character/style consistency.')
    },
    async ({ source_video, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids }) => {
      if (!source_video) throw new Error('source_video is required');
      if (!prompt) throw new Error('prompt is required');

      const isUrl = /^https?:\/\//i.test(source_video);
      let startResponse;
      if (isUrl) {
        startResponse = await client.post('/v1/generate/video-from-video', {
          video_url: source_video, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids
        });
      } else {
        const resolved = await resolveToBuffer(source_video, 'video');
        const form = new FormData();
        form.append('files', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        form.append('prompt', prompt);
        if (model) form.append('model', model);
        if (aspect_ratio) form.append('aspect_ratio', aspect_ratio);
        if (duration !== undefined) form.append('duration', String(duration));
        if (enhance_prompt !== undefined) form.append('enhance_prompt', String(enhance_prompt));
        if (visual_dna_ids) form.append('visual_dna_ids', JSON.stringify(visual_dna_ids));
        startResponse = await client.postMultipart('/v1/generate/video-from-video', form);
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
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
    'Transcribe audio or video into text + SRT subtitles. Source can be a URL or an absolute local file path. Returns the full text, SRT content, duration, and download URLs for .srt/.txt files. Works on both audio-only files (mp3, wav, m4a) and videos with audio tracks (mp4, mov, webm).',
    {
      source: z.string().describe('URL or absolute local path to the audio / video file to transcribe')
    },
    async ({ source }) => {
      if (!source) throw new Error('source is required (URL or absolute local path)');

      const isUrl = /^https?:\/\//i.test(source);
      let startResponse;
      if (isUrl) {
        startResponse = await client.post('/v1/transcribe', { audio_url: source });
      } else {
        const resolved = await resolveToBuffer(source, 'audio');
        const form = new FormData();
        form.append('file', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        startResponse = await client.postMultipart('/v1/transcribe', form);
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 5) * 1000,
        timeout: 1800000 // 30 minutes — long podcasts are a thing
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
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
      model: z.string().optional().describe('Model identifier. Use list_models type="three_d" to see options.'),
      topology: z.string().optional().describe('Topology preset (optional, model-specific)'),
      target_polycount: z.number().optional().describe('Target polygon count (optional, model-specific)'),
      enable_tpose: z.boolean().optional().describe('Force T-pose for character models (optional)'),
      enable_pbr: z.boolean().optional().describe('Enable PBR textures (optional)')
    },
    async ({ prompt, reference_images, mode, texture_prompt, model, topology, target_polycount, enable_tpose, enable_pbr }) => {
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
        enable_pbr
      });

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 900000 // 15 minutes — 3D generation is slow
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            mode: result.result?.mode || null,
            prompt_used: result.result?.prompt_used || null
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerGenerateTools };
