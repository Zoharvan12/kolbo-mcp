# Talking avatar from Visual DNA: Wan 3.0 Elements

Proven on 2026-10-28 (Zohar's short02, pixel-style reel). Zohar's verdicts: "that is very very nice" and "honestly that is very very cool". He added that "wan 3 can be the perfect avatar tool".

A person who has a Visual DNA can talk on camera in his own recorded voice, with lips in sync, in any environment. No filming, no still image and no separate lipsync pass are needed.

## Route

1. **Voice:**
   - Prefer the person's own recording. Run it through Scribe with `words_per_line: 1` to find false starts and repeats.
   - Cut in true silence with a 10 ms crossfade, then re-run Scribe to confirm the text is clean.
   - A cloned voice also works, but his own recording reads as more real.
2. **Chunks:** split the voice at sentence gaps of 0.4 s or more into chunks of **10 s or less**. Pad each chunk with silence to a whole number of seconds and upload them as mp3. Wan 3 caps audio input at 1–15 s, and shorter chunks keep the face steadier.
3. **Generate:** `generate_elements`, model `wan3.0-elements`, 720p (about 7.6 cr/s), `aspect_ratio: "9:16"`. Set `duration` to the padded chunk length.
   - `visual_dna_ids`: the person's DNA.
   - `reference_images`: **2 real neutral close-up photos** from that DNA, tagged in the prompt as face reference only (see the prompt shape below). This visibly improved likeness over DNA alone.
     - Do NOT pass a generated still of the scene. A still dominates framing, proportions and pose, and the result looked fake.
   - `reference_audio_urls`: the chunk, tagged `@Audio 1`.
4. **Check every take before building on it:**
   - Measure the audio envelope correlation of the take against its chunk, with a lag search of 0–0.8 s. Takes scored 0.99 at lag 0.
   - When a take starts speaking late, trim from that lag. Two earlier takes started 70 ms and 0.56 s late.
   - Correlation alone does not prove the lips. The take with the wide grin still scored 0.99. Look at a face strip at 6 fps over the last sentence.
5. **One take per environment.** Generate each environment natively, with the same CAST, chair, pose and camera block and only the [LOCATION] and light changed. Do not key a talking take onto new backgrounds: the chair and floor shadow broke the key and it read as fake.

## Prompt shape (Locked Intro)

```
Total 10s, one continuous locked-off shot, vertical 9:16.
[GLOBAL LOOK] Real footage ... full-frame cinema camera, 85mm lens (24 degree FOV) from 5 metres at standing eye height,
natural compressed perspective and true human proportions. <backdrop + light, in Kelvin>. Natural skin texture, real fabric
folds, slight filmic grain. No text, no logos, no music.
[CAST] @<dna>, exactly his face, beard, hairline and eyes. @Image 1 and @Image 2 are real photos of @<dna> used ONLY as the
face reference: copy his exact face shape, eyes, nose, beard line and hairline; ignore their clothes, backgrounds and
expressions. Wardrobe: <exact wardrobe>.
[LOCATION] <environment>. <chair> stands in the centre, turned about 35 degrees to camera right.
[AUDIO] @Audio 1 is @<dna>'s own voice speaking <language>. Use it verbatim as the soundtrack from 0s; his lips, jaw and
breathing are driven by @Audio 1 exactly, every syllable in sync to the very last word, lips closed in its silences.
SHOT 1 (0-10s) Static full-body wide: <pose: sits, body follows chair angle, head turned back to lens, ankle over knee,
forearm on armrest>. He speaks the words of @Audio 1 straight to the lens, calm, direct and serious from the first frame to
the last: brows level, lips relaxed and articulating every syllable, corners of the mouth level, cheeks neutral, no grin and
no smile at any point, including the final sentence. <one hand gesture task per sentence>. Small nods on stressed words,
natural blinks, head within a 10 degree arc. Camera does not move, no zoom, no cuts. Real time.
```

## What failed (don't repeat)

| Route | Problem |
|---|---|
| HeyGen avatar-iv | Identity drift ("distorted, not me") |
| Seedance 2.5 Elements | Regenerates the speech, so lips don't match the voice (correlation 0.30) |
| MiniMax H3 | Inserted an unrequested close-up cut |
| OmniHuman 2.0 / Veed Fabric from a still | Looks "fake"; Veed bills **23 cr/s**, not 23 cr flat |
| Wan 3 from a generated still | The still forced a symmetric, wide-angle, fake-looking pose |
| Wan 3 without a "never a smile" muscle line | Grins at sentence ends and stops forming words |

## Cost reference

| Item | Cost |
|---|---|
| 10 s take at 720p | 76 cr |
| 8 s take at 720p | 61 cr |
| 27 s short in 3 environments | about 213 cr |
| Retake of one environment | 61–76 cr |
