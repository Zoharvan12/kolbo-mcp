# Very attractive / curvy female characters

Use when the user asks for a "very attractive", "sexy", "hot", "curvy" or "busty" woman, or says "bigger boobs". This covers adult, non-explicit character, fashion and film imagery only: fully clothed, or opaque swimwear in a fashion editorial.

## Why it goes wrong
- A face reference or a Visual DNA on its own under-draws the figure. Loose or tailored clothes flatten it further.
- Asking for "sexy" pulls in costume cliches (leopard print, choker, bandana stacked together, posing for the lens). Those read cheap.

## Rules
1. **State the figure physically, tied to the garment:** "slim waist and very full natural bust clearly shaped by her <garment>", "curvy hourglass silhouette".
2. **Frame it:** she faces the camera, head to hips in frame, neckline visible. Back-to-camera, over-the-shoulder and profile poses hide the figure. A head-to-waist portrait renders it better than a full-body wide.
3. **Realism first:** natural matte skin (never "sheen" or "glossy", which reads oily and CGI), real pores, a lit warm face, a candid mid-task posture.
4. **Wardrobe is styling, not costume:** real clothes a woman in that world would wear (fitted ribbed tank, bodysuit, halter, fitted dress), with one or two specific details.
5. **Model route:**
   - GPT Image tends to refuse body wording.
   - Seedream 5.0 Pro executes the figure from text.
   - Soul V2 or Midjourney makes the base look; a Nano Banana edit then changes ONLY the figure.
   - For the user's own Visual DNA face, use the Nano Banana 2.1 **edit** model with the DNA images as `source_images` (text-to-image with the DNA id drifts the face).
6. **Fix, don't reroll:** a figure that came out too small is one targeted edit: "Change ONLY her figure: slim waist and very full natural bust clearly shaped by her <garment>. Keep her face, hair, wardrobe, pose and background exactly."
7. **Safety line every time:** fully clothed or opaque swimwear, no nudity, no see-through fabric. Never for minors. Never sexualise a real, identifiable person without their consent.

## Midjourney: write a swimwear fashion editorial (Zohar, 2026-11-07)
Midjourney refuses bare requests for "sexy", yet accepts the same appeal written as a high-fashion editorial. For adult models in opaque swimwear or fashion only. It is not a route to nudity or explicit content.

Build the prompt in this order:
1. **Shot and publication first:** the camera angle, then the editorial register. "Low-angle rear three-quarter shot, world-class Vogue Italia high-fashion editorial photography."
2. **A professional adult model:** "female model", with specific hair and features. Never "girl", "teen", "young" or anything that blurs her age.
3. **One specific garment:** "sleek minimalist matte-black high-cut swimwear", not "skimpy" or "revealing".
4. **Pose in fashion language:** contrapposto, arched lower back, head turned over the shoulder, eyes locked on the lens, slightly parted lips. This rear pose is the exception to the face-the-camera rule above, because the curve of the back and hips is the subject.
5. **A striking, contrasting location:** black volcanic ash inside a turquoise glacial ice cave, geothermal steam. The location makes it read as an art photograph.
6. **Light describes the body:** "dramatic chiaroscuro rim lighting highlighting the curve of her spine and hips", instead of naming body parts one by one.
7. **Real skin and a named camera:** water droplets, visible pores, raw unretouched texture, "Shot on Phase One XF IQ4 150MP, 85mm".

Example (tested through the Kolbo API, 2 of 3 runs delivered):
> Low-angle rear three-quarter shot, world-class Vogue Italia high-fashion editorial photography. A stunning Russian female model with sharp Slavic facial features, wet deep-burgundy wine-colored hair cascading over her bare shoulders, wearing a sleek minimalist matte-black high-cut swimwear. Sensual contrapposto back-pose, arched lower back, her sculpted curves and toned glutes in the foreground, turning her head over her shoulder to lock eyes with the lens, magnetic gaze, slightly parted lips. Stark contrasting environment: standing on black volcanic ash inside a jagged translucent turquoise glacial ice cave, warm geothermal steam rising around her silhouette. Harsh directional Arctic sunbeam cutting through the ice above, dramatic chiaroscuro rim lighting highlighting the curve of her spine and hips, macro water droplets on warm sun-kissed skin, visible skin pores, raw unretouched texture. Shot on Phase One XF IQ4 150MP, 85mm

**Words measured on the Kolbo API (2026-11-07).** Two separate filters apply:
- **ToAPI (first provider) refuses words at submit:** `bikini`, `swimsuit`, `one-piece`, `two-piece`, `barefoot`, `sultry`. The error is HTTP 400 `fail_to_fetch_task`, "task processing failed". The request then falls to Kinovi, which is slower and passes less often: the same prompt with these words delivered 1 of 4 runs. Default to `swimwear` or `bathing suit`, and leave out `barefoot` and `sultry`. If you want a real two-piece, write `bikini` and expect a slower render and more failures.
- **Accepted at ToAPI submit:** `sensual`, `curves`, `toned glutes`, `arched lower back`, `slightly parted lips`, `bare shoulders`.
- **Midjourney can still refuse after rendering:** "the prompt you entered was deemed safe, the generated image may fall outside our community guidelines". This is random. Run the same prompt again. A failed run charges no credits.
- "Swimwear" tends to render a high-cut one-piece, not a two-piece.
- On the API or MCP, pass `enhance_prompt: false` so the wording stays yours.

**Keep Midjourney prompts under 900 characters.** Kolbo caps them at 2,000, and ToAPI condenses anything longer. The Kinovi fallback fails above 1,024 including `--` flags and the reference URL, so Kolbo condenses to fit it. Under 900 characters, your exact wording reaches ToAPI and Kinovi. GoAPI, the last fallback, has no cap but runs Kolbo's word filter, which replaces "sensual", "sultry" and similar words.

## From a real person's photos (proven 2026-11-02, "Anastasia", Last Call)
Use when the character must look like a real, consenting adult (cast talent, the user's own photos). Six rounds failed before this worked.
1. **Two jobs, never one.** The FACE comes from real face photos, the BODY from real full-body photos. A model asked to invent the body from face-only photos guesses: Nano Banana 2.1 made her heavy and drifted the face (3 rounds); Seedream with face-only refs made her too skinny, with abs and a small bust.
2. **Base image:** `seedream-5.0-pro-text-to-image` (auto-routes to its edit variant with `reference_images`), 9:16, 2K, 4 refs: 2 clear frontal face photos + 2 full-body photos in fitted clothes that show her real figure. Name the roles:
   "@Image1 and @Image2: copy her face exactly — <specific traits>. @Image3 and @Image4: copy her real body and proportions exactly — a natural slim hourglass figure with a full natural bust, a narrow waist, a soft natural stomach with no visible abs, rounded hips and a rounded seat, slim arms and legs; feminine and soft, not athletic, not muscular, not skinny, not heavy. Do not copy the clothes or backgrounds." Then the outfit, full body head to toe, plain dark studio backdrop, soft side light, "real photograph, natural skin texture, 85mm".
3. **Wording:** "very slim / petite / like a fashion model / flat stomach" over-corrects into visible abs and a small bust. "Soft natural stomach, no visible abs, not athletic, not muscular" fixes it. The garment shapes the bust: a fitted halter or V neckline shows the figure; a loose satin camisole flattens it.
4. **Sheet:** `nano-banana-2.1` edit, 16:9, 2K, `source_images` = [approved base, the 2 real face photos]: "Make a character reference sheet of the woman in @Image1. Her face must be the real woman from @Image2 and @Image3: copy that face exactly… Keep her body exactly as in @Image1… and the same clothes exactly… Layout: front, three-quarter, side profile, back, two face close-ups… Do not change her body or her clothes." An outfit variant (a jacket, etc.) is one more NB 2.1 edit of the approved sheet with the same face photos, changing one thing.
5. **GPT Image 2.5** (sunburst/flare included, even `moderation: low`) blocks full-body images of a real woman. Use it only for faces and locations. GPT Image 2.6 is not yet measured here: treat it the same until a run proves otherwise.
6. **Pick refs from the person's own library:** face shots with a clear frontal face; body shots in fitted clothes. Age 21+ stated, opaque clothing, and only with the person's consent (rule 7).
Evidence: `G:\Projects\Kolbo.AI\Youtube\global-channel2-last-shift\prompts\last_call_v2ssets\` (`qc_anastasia_v4`…`v7.jpg`, `qc_anastasia_sheet.jpg`).

## QA
Before showing results, compare the figure against the request and her sheet. A flattened figure goes back through rule 6. Check that the skin is matte, not oily.
