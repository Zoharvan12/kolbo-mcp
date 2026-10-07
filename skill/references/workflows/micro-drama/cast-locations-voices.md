# Micro-drama — cast, looks, locations, voices

Seedance draws every character from its reference. The only character reference passed to video is the approved **character sheet** (and its Visual DNA). Never pass loose portraits, posters or scene stills to video: they lock the camera and make the cast look pasted in. Verify model identifiers and costs with `list_models` before quoting.

## Characters

### 1. Face / look source (pick the route from the kickoff)

- **Photoreal drama:** a realistic portrait model from the catalog (e.g. `seedream-5.0-pro-text-to-image`, `nano-banana-pro`). Prompt pattern: real photograph, head and upper chest, one motivated side light, "natural matte skin with visible pores", age 21+ stated, origin, hair, one distinguishing mark, wardrobe neckline. Never "sheen", "glossy", "flawless".
- **Stylized glamour / nostalgic:** `midjourney` (text-to-image) for the face and the look. It gives the polished, idealised beauty and period glamour that nostalgic serials run on. Then build the sheet from the chosen still (step 2).

Make 4 variations per lead; the user picks. Leads in one series must not share hair colour + face type. At most one plain-leaning trait per lead; style traits the flattering way (thin fashion frames, light freckles).

Men: "calm, closed-mouth, contained expression, eyes just past the lens; a working actor in a prestige drama, not a model; arms relaxed, nothing in his hands; plain, worn wardrobe". No grins, smirks or posing.

### 2. Character sheet

`nano-banana-pro/edit`, 16:9, highest resolution offered (pass it explicitly), source = the approved still:

> Make a character reference sheet of this exact person from @Image1, unchanged. Three photos side by side on a plain light-gray studio background: full body from the front, full body from the back, and a close-up of the face. Same face, same hair, same body, same clothes exactly as in @Image1 - <garment continues to ..., shoes>. Real photograph, natural matte skin. No text.

QA before showing: face matches the source, including small marks (a mole or scar in the same place; cheap edit models move them, and the video copies the sheet); front, back and close-up panels agree on neckline, straps, colours; body unchanged; no text. Write the wardrobe in the bible from the FRONT panel; Seedance copies the sheet, not the prompt.

Then create a **Visual DNA** from the sheet (`visual-dna.md`) and record its `@tag` in the bible.

### 3. Looks and props

- New look = one edit of the BASE sheet that changes only the clothes, hair styling or carried props; keep face, skin, body. Name it `<name>-<look>`, QA the face side by side with the base, add it to the bible.
- A carried prop (bag, phone, briefcase) gets its own sheet of the character holding it as in the scene. State the side per panel ("front panel: his left shoulder is on the IMAGE'S RIGHT; back panel: on the IMAGE'S LEFT"). Naming a prop only in the video prompt loses it. A prop first created on screen (a photo found in a pocket in Part 3) becomes a reference too: grab a clean frame of it and pass it to every later part, or the next part redraws it (the strip became a square photo).
- Fix from the original: when an edited image needs another fix, redo it from the ORIGINAL in one combined edit. Every stacked edit drifts the face.

## Locations

One location = one image: `nano-banana-pro`, 16:9, high resolution, **no people**. It is passed to video as the location AND grade reference.

```
Real photograph, a frame from a high-end <genre> feature film. <Room/place, time of day>. No people.
Place: <materials>, <hero props the script uses>, <window/weather>, <atmosphere>.
Lighting: motivated practical light only - <key practical> as the key, <secondary>, <window light>.
Color grade: <the series' World + look grade, word for word>.
Camera: wide from <position> at eye level, 35mm, shallow depth of field.
Realistic materials. Not CGI, not illustration. No text, no watermark.
```

- Put every prop the script uses in the frame; they become continuity anchors.
- Write the geography in the bible (where the door, window, desk are, seen from the camera); prompts restate it.
- Places that would really have people get one extras line-up image (6-8 anonymous adults, the set's wardrobe, plain gray background, none resembling a lead), passed as "background extras only, out of focus, never interacting with the leads".

## Voices (picked once per character, right after the sheet is approved)

1. **Design from the image:** `generate_sound`, model `seed-audio-1.0`, about 14 s, `seed_reference_image_url` = the character sheet. Describe the PERSON, never the voice:
   > The <woman/man> in the reference image speaks. <Name>, <age>, <origin, family, how languages mix>. <Where they are right now, who they talk to, how relaxed or tired>. Real person, not a narrator, not an announcer. Modern clean studio recording, full natural frequency range, dry room, no vintage effect, no radio or telephone filter, no music. "<3 neutral sentences that are NOT script lines>"
   Make 3-4 variations that change only the life and situation (a relaxed private situation usually wins). Never use voice adjectives (husky, breathy, sultry, deep baritone); they produce caricatures. For period stories name an accent by place and class only, never by a medium or era (no "1950s radio"), or the model adds a vintage filter.
2. The user picks. Trim the pick at a pause (no level change), upload it, and record the URL and length in the bible.
3. Voice samples speak neutral sentences only. A sample that contains script lines makes Seedance repeat them.
4. Keep the samples used in one part under about 28 s in total (Seedance 2.5 caps reference audio near 30 s).

If the user owns a real voice and wants it for a character, `clone_voice` it with the owner's consent and use a clean neutral sample of it the same way.

## QA gate (before any video)

Sheet panels agree; every character reads clearly adult; no real-person likeness; leads distinct; each location shows the props the script needs and has no people; each voice sample is clean, single-speaker, neutral words, accent right; everything is recorded in the bible.
