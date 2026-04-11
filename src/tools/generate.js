/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { pollUntilDone } = require('../polling');

function registerGenerateTools(server, client) {
  // ─── generate_image ────────────────────────────────────────
  server.tool(
    'generate_image',
    'Generate image(s) from a text prompt using Kolbo AI. Supports Visual DNA profiles (for character/style/product consistency), moodboards (for style direction), reference images (for composition guidance), batch generation (num_images), and web-search grounding. For EDITING an existing image, use generate_image_edit instead. For a coordinated multi-scene set (storyboard, ad campaign), use generate_creative_director. Returns the final image URL(s) when complete.',
    {
      prompt: { type: 'string', description: 'Text description of the image to generate' },
      model: { type: 'string', description: 'Model identifier. Use list_models type="image" to see options. Omit for Smart Select.' },
      aspect_ratio: { type: 'string', description: 'Aspect ratio (e.g., "1:1", "16:9", "9:16"). Default: "1:1"' },
      enhance_prompt: { type: 'boolean', description: 'Enhance the prompt for better results. Default: true' },
      num_images: { type: 'number', description: 'Number of images to generate in one call. Default: 1' },
      reference_images: { type: 'array', description: 'Array of image URLs used as composition/style references (NOT as source images for editing — use generate_image_edit for that).' },
      visual_dna_ids: { type: 'array', description: 'Array of Visual DNA profile IDs (from create_visual_dna / list_visual_dnas) to apply for character / style / product / scene consistency. Pass the `id` field of each profile. Use this when the user wants to keep the same character or style across multiple images.' },
      moodboard_id: { type: 'string', description: 'Moodboard ID (from list_moodboards / get_moodboard) whose master_prompt and style_guide should be applied to this generation.' },
      enable_web_search: { type: 'boolean', description: 'Enable web-search grounding for the prompt (useful for current events, brand references, real-world accuracy). Default: false' }
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
      prompt: { type: 'string', description: 'Description of the edit to apply (e.g., "remove the background", "change the sky to sunset")' },
      model: { type: 'string', description: 'Model identifier. Use list_models type="image_edit" to see options. Omit for Smart Select.' },
      source_images: { type: 'array', description: 'Array of source image URLs to edit. Typically one, but some models accept multiple for compositing.' },
      aspect_ratio: { type: 'string', description: 'Output aspect ratio (e.g., "1:1", "16:9", "9:16"). Default: "1:1"' },
      enhance_prompt: { type: 'boolean', description: 'Enhance the prompt for better results. Default: true' },
      num_images: { type: 'number', description: 'Number of output images. Default: 1' },
      visual_dna_ids: { type: 'array', description: 'Array of Visual DNA profile IDs to apply for consistency with an existing character / style / product.' },
      moodboard_id: { type: 'string', description: 'Moodboard ID whose master_prompt and style_guide should be applied.' },
      enable_web_search: { type: 'boolean', description: 'Enable web-search grounding. Default: false' }
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
      prompt: { type: 'string', description: 'Creative brief or concept describing the full set of scenes to generate' },
      scene_count: { type: 'number', description: 'Number of scenes to generate, 1–8. Default: 4' },
      model: { type: 'string', description: 'Model identifier applied to every scene. Omit for Smart Select.' },
      aspect_ratio: { type: 'string', description: 'Aspect ratio applied to every scene (e.g., "1:1", "16:9", "9:16"). Default: "1:1"' },
      workflow_type: { type: 'string', description: '"image" (default) or "video"' },
      duration: { type: 'number', description: 'Duration in seconds per scene (video mode only). E.g., 5 or 10.' },
      enhance_prompt: { type: 'boolean', description: 'Enhance prompts per scene. Default: true' },
      reference_images: { type: 'array', description: 'Array of reference image URLs to guide style/composition of every scene.' },
      visual_dna_ids: { type: 'array', description: 'Array of Visual DNA profile IDs to apply consistently across every scene. This is the ideal way to keep a character or product looking the same in all scenes of a campaign.' },
      moodboard_id: { type: 'string', description: 'A single moodboard ID whose master_prompt and style_guide should shape every scene.' },
      moodboard_ids: { type: 'array', description: 'Multiple moodboard IDs when blending styles. Prefer `moodboard_id` for single moodboards.' }
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
      prompt: { type: 'string', description: 'Text description of the video to generate' },
      model: { type: 'string', description: 'Model identifier. Use list_models type="video" to see options. Check supported_durations and supported_aspect_ratios.' },
      aspect_ratio: { type: 'string', description: 'Aspect ratio (e.g., "16:9", "9:16", "1:1"). Default: "16:9"' },
      duration: { type: 'number', description: 'Duration in seconds. Must be a value the chosen model supports — check supported_durations from list_models. Default: 5' },
      enhance_prompt: { type: 'boolean', description: 'Enhance the prompt. Default: true' },
      reference_images: { type: 'array', description: 'Array of image URLs used as visual references (style / composition / subject).' },
      visual_dna_ids: { type: 'array', description: 'Array of Visual DNA profile IDs to keep a character / style consistent with prior generations.' }
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
      image_url: { type: 'string', description: 'URL of the source image to animate' },
      prompt: { type: 'string', description: 'Text description of the desired MOTION (e.g., "camera slowly pans right while the character walks forward")' },
      model: { type: 'string', description: 'Model identifier. Use list_models type="video_from_image" to see options.' },
      aspect_ratio: { type: 'string', description: 'Output aspect ratio (e.g., "16:9", "9:16", "1:1"). Default: "16:9"' },
      duration: { type: 'number', description: 'Duration in seconds. Must be a value the chosen model supports. Default: 5' },
      enhance_prompt: { type: 'boolean', description: 'Enhance the motion prompt. Default: true' },
      visual_dna_ids: { type: 'array', description: 'Array of Visual DNA profile IDs to maintain consistency with prior characters / styles.' }
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
      prompt: { type: 'string', description: 'Text description of the music to generate (e.g., "upbeat electronic dance track with synthesizers")' },
      model: { type: 'string', description: 'Model identifier. Use list_models type="music" to see options. Omit for Suno (default).' },
      style: { type: 'string', description: 'Music style / genre (e.g., "pop", "rock", "lo-fi", "electronic", "jazz")' },
      instrumental: { type: 'boolean', description: 'Generate instrumental only, no vocals. Default: false' },
      lyrics: { type: 'string', description: 'Custom lyrics for the song. If omitted, lyrics are generated automatically from the prompt unless instrumental is true.' },
      vocal_gender: { type: 'string', description: 'Preferred vocal gender: "male" or "female". Only applies when instrumental is false.' },
      enhance_prompt: { type: 'boolean', description: 'Enhance the prompt. Default: true' }
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
      text: { type: 'string', description: 'The text to convert to speech' },
      voice: { type: 'string', description: 'Voice ID (from list_voices) or voice display name (e.g., "Rachel", "Adam"). Default: "Rachel"' },
      model: { type: 'string', description: 'Model identifier. Use list_models type="speech" to see options. Default: eleven_v3' },
      language: { type: 'string', description: 'Language code (e.g., "en-US", "he-IL", "es-ES"). Default: "en-US"' }
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
      prompt: { type: 'string', description: 'Text description of the sound effect (e.g., "thunder clap with rain", "door creaking open", "futuristic UI beep")' },
      model: { type: 'string', description: 'Model identifier. Use list_models type="sound" to see options. Default: elevenlabs-sound-effects-v1' },
      duration: { type: 'number', description: 'Duration in seconds. Omit for automatic duration.' }
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
      provider: { type: 'string', description: 'Filter by provider (e.g., "elevenLabs", "google")' },
      language: { type: 'string', description: 'Filter by language name or code (e.g., "English", "en-US")' },
      gender: { type: 'string', description: 'Filter by gender (e.g., "Female", "Male")' }
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
      generation_id: { type: 'string', description: 'The generation ID to check' }
    },
    async ({ generation_id }) => {
      const result = await client.get(`/v1/generate/${generation_id}/status`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerGenerateTools };
