# Cast templates: realistic people, places and props

Load this file when the user wants a fill-in prompt for a character sheet (triptych), a street or casual character, a cinematic still, a UGC or influencer selfie, lifestyle stock, a fashion shot, a location plate, a prop still, or one character kept the same across many lifestyle shots. Every slot vocabulary below comes from a large tested prompt library whose outputs became Kolbo's global Visual DNAs and stock images. Every route is a Kolbo model id.

Related: the phone look in depth is `ugc-smartphone.md`; figure wording for an attractive adult woman is `attractive-characters.md`; slot syntax and the reference contract are `prompt-structure.md`; DNAs are `visual-dna.md`.

## Rules for every template

1. **Adults only.**
   - Write the age as a number of 21 or more, with the word "adult": "a 24-year-old adult woman".
   - Never use "early 20s" alone, "girl", "teen", school or campus styling, pigtails with a plaid skirt, or a childlike look.
   - The person must read as an adult on screen.
   - Fictional people only. Never name a real person and never ask for a celebrity likeness.
2. **Kolbo takes no negative prompt and no style ID.**
   - Say what is there. Never say what is not there.
   - Never write: no / without + text, logo or people.
   - Never write: text, lettering, words, caption, legible, sign, poster, label, magazine, menu, whiteboard, logo, brand, watermark, a film-stock name, sprocket.
3. **Do not name an absence.**
   - Do not write "unmarked", "empty" or "blank".
   - Write "the front of every garment a smooth unbroken expanse of plain fabric", "every surface a continuous unbroken material", "the scene continuing naturally around them".
4. **Never name camera processing** (HDR, over-sharpened, filter). Describe the light source instead.
5. **No brand names.** They render as logos. Describe the item generically ("a structured cream leather top-handle bag").
6. **Match the light block to the place and time slot.** A daytime scene with a night look renders as night.
7. **Generic "shot on 35mm film" is fine.** Named stocks are not.
8. **Body line rule.** Frame word first, then a natural bust, then lean or strong legs.
   - Never use: extreme, impossibly, competition, voluptuous ... wide hips, "full curvy" without "athletic", "struggling to contain".
9. **One image per ratio.** Generate natively at each ratio. Never crop or outpaint between ratios.
10. **Pass `project_id` on every call.** Use `enhance_prompt: false` unless the template says otherwise.

---

## T1. Glam character sheet (triptych)

**Slots, in order:** `AGE` `ORIGIN` `HAIR` `EYES` `SKIN` `FIGURE` `OUTFIT` `PLACE_TIME` `FRONT_NOTE` `BACK_NOTE` `FACE_NOTE`

```
A triptych on a 16:9 canvas of a {AGE}-year-old adult {ORIGIN} woman with {HAIR}, {EYES}, {SKIN} and {FIGURE}, wearing {OUTFIT}, standing {PLACE_TIME}. Left panel: full-body front view, {FRONT_NOTE}. Center panel: full-body back view, {BACK_NOTE}. Right panel: face close-up at eye level, {FACE_NOTE}. Consistent same person across all three panels. Editorial photography, sharp, photorealistic.
```

**Vocabulary:**
- **FIGURE** (the best-rendering formula):
  - "a toned athletic figure with a large natural bust and long lean legs"
  - "an athletic toned figure with a very large natural bust and long strong legs"
  - "a slim figure with a notably large natural bust on a lean frame"
  - "a curvy athletic figure with a full bust"
  - "a lean figure with a full natural bust and a flat stomach"
- **OUTFIT:** string bikini with triangle tops and thin ties; halter bikini with gold ring hardware; white crochet bikini; satin slip dress with a thigh slit; one-piece swimsuit; ribbed knit mini dress. Flowing fabric (a satin dress) gave the most natural proportions.
- **PLACE_TIME:** "on a rooftop pool at sunset with the city glowing behind her", "on a beach at sunrise with mountains in early morning mist", "at the edge of an infinity pool above the sea at golden hour", "in a quiet cove at midday".
- **FRONT_NOTE / BACK_NOTE:** framing only, for example "confident posture, arms relaxed" or "hair falling down her back, sea behind". Mood words such as "maximum impact" pushed the poses into exaggeration.
- **FACE_NOTE:** "eyes catching the early light, natural skin texture, soft natural brows".

**Settings:**
- Model `soul/v2/standard`, 16:9, 1080p, enhance off.
- Then crop the face from the FRONT panel. The close-up panel drifts.
- Or run a face pass with `generate_image_edit` (`nano-banana-2.1`), using the front-panel crop as the source and the prompt "close up on the subject's face, 85mm lens, show face in 50% of the image".
- For a DNA, offer `generate_character_sheet` first.
- Alternative model: `seedream-5.5-text-to-image`.

**Worked example:**
```
A triptych on a 16:9 canvas of a 25-year-old adult Portuguese woman with long dark brown waves with copper undertones, hazel eyes, warm olive skin and a toned athletic figure with a large natural bust and long lean legs, wearing a terracotta string bikini with thin ties, standing on a Lisbon rooftop pool at sunset with the river glowing behind her. Left panel: full-body front view, confident posture, arms relaxed. Center panel: full-body back view, waves down her back, the river behind. Right panel: face close-up at eye level, hazel eyes catching the low sun, natural skin texture. Consistent same person across all three panels. Editorial photography, sharp, photorealistic.
```

---

## T2. Street or casual character (triptych)

**Slots:** `AGE` `GENDER` `ORIGIN` `HAIR` `BUILD?` `OUTFIT` `ACCESSORY` `CITY_STREET_TIME` `FRONT_NOTE` `BACK_NOTE` `FACE_NOTE`

```
A triptych on a 16:9 canvas of a {AGE}-year-old adult {ORIGIN} {GENDER} with {HAIR}{, BUILD}, wearing {OUTFIT}, {ACCESSORY}, standing on {CITY_STREET_TIME}. Left panel: full-body front view, {FRONT_NOTE}. Center panel: full-body back view, {BACK_NOTE}. Right panel: face close-up at eye level, {FACE_NOTE}. Consistent same person across all three panels. Street fashion editorial, sharp, photorealistic.
```

**Vocabulary:**
- **BUILD:** usually left out; with no figure words there is no drift. Otherwise "tall" or "a slim athletic figure".
- **OUTFIT** (always brand-free): "a monochrome cream oversized blazer over a fitted turtleneck and wide-leg cream trousers", "a dark forest green technical jacket, straight dark jeans and grey suede runners", "a cropped black puffer over a ribbed knit dress".
- **ACCESSORY:** "a structured cream leather top-handle bag", "gold hoop earrings". Leave out sunglasses, which hide the eyes.
- **CITY_STREET_TIME:** "a SoHo street at golden hour with cast-iron facades behind", "a Kensington Market street in autumn golden light", "a Seoul alley in soft overcast light".
- **Men:** "with short wavy dark hair and a full beard".

**Settings:** `soul/v2/standard`, 16:9, enhance off.

**Worked example:**
```
A triptych on a 16:9 canvas of a 27-year-old adult Korean woman with a sleek jaw-length bob, wearing a charcoal wool overcoat over a fitted cream turtleneck and straight black trousers, a small black leather shoulder bag and thin gold hoops, standing on a Seoul side street in soft overcast light. Left panel: full-body front view, relaxed stance, hands in coat pockets. Center panel: full-body back view, coat falling straight. Right panel: face close-up at eye level, dark eyes, minimal makeup, natural skin texture. Consistent same person across all three panels. Street fashion editorial, sharp, photorealistic.
```

---

## T3. Cinematic still

**Slots** (15-30 words in total): `SUBJECT(age + 2 traits)` `WARDROBE` `ENVIRONMENT(+ light inline)` `FRAMING`

```
a {AGE}-year-old adult {SUBJECT}, in {WARDROBE}, {ENVIRONMENT with light}, {FRAMING}
```

**Vocabulary:**
- **SUBJECT:** "man with sharp features", "woman with auburn ringlets", "man with deep lines and grey stubble", "heavyset man", "wiry woman".
- **ENVIRONMENT:** "in a sun-drenched Moroccan courtyard", "on a rain-slick crossing under magenta and cyan glow", "in a sparse industrial loft with high ceilings", "under one overhead light". Describe neon as coloured light, never as a tube or a sign.
- **FRAMING:** close portrait, tight portrait filling frame, three-quarter portrait, medium shot, medium wide, wide shot small in frame, over-the-shoulder looking away, mid-turn full-length.

**Settings:**
- `soul/cinema`, any ratio, generated natively.
- Add no grain, lens or style words; the model carries the look.
- Optional `cinematic` presets for lighting and shot.

**Worked example:**
```
a 34-year-old adult woman with a cropped silver-blonde cut, in a rust wool trench coat, on a rain-slick tram platform under amber station light, over-the-shoulder looking away
```

---

## T4. Influencer or UGC selfie

**Slots:** `AGE` `GENDER` `ORIGIN?` `HAIR` `ORDINARY?` `OUTFIT` `PLACE` `SELFIE_ACTION` `LIGHT`

```
a {AGE}-year-old adult {GENDER} with {HAIR}{, ORDINARY}, wearing {OUTFIT}, the front of every garment a smooth unbroken expanse of plain fabric, {PLACE}, {SELFIE_ACTION}. {LIGHT}, natural skin texture, photorealistic.
```

**Vocabulary:**
- **ORDINARY** (for real-person UGC): "an ordinary everyday face, an average build, natural untouched skin with visible pores". Leave it out for an influencer look.
- **SELFIE_ACTION:** "arm extended toward the lens, smiling at camera", "in front of a plain full-length mirror, holding a plain phone with its back to the mirror, weight on one hip", "glancing at the lens over a coffee cup". Turn the phone screen away from the lens; a visible screen renders as text and UI.
- **LIGHT:** "lit by soft daylight from a nearby window", "warm afternoon sun", "dappled natural light through trees", "soft overcast daylight", "warm golden-hour backlight".
- **Do not use:** smartphone HDR, over-sharpened, filter, or school or campus outfits.

**Settings:** `soul/v2/standard`, 9:16, enhance off. Alternative: `mirage-life`, the phone-candid model.

**Worked example:**
```
a 23-year-old adult woman with long straight black hair, wearing a white oversized t-shirt and high-waist light jeans, the front of every garment a smooth unbroken expanse of plain fabric, in a bright bedroom in front of a plain full-length mirror, holding a plain phone with its back to the mirror, weight on one hip. Lit by soft daylight from a nearby window, natural skin texture, photorealistic.
```

---

## T5. Lifestyle stock

**Slots:** `WHO(age + trait)` `WEARING` `WHERE` `DOING(mid-gesture)` `PLACEMENT` `LOOK`

```
a {AGE}-year-old adult {WHO}, wearing {WEARING}, the front of every garment a smooth unbroken expanse of plain fabric, {WHERE}, {DOING}. Composition: the subject stands {left|right} of centre, the scene continuing naturally around them. {LOOK}, natural skin texture, photorealistic.
```

**Vocabulary:**
- **DOING** (mid-gesture, so the frame can open a video): "pouring coffee, steam rising", "leaning on the counter with a mug", "tugging a jacket hem, chin lifted", "mid-stride, pushing her hood back".
- **LOOK** (light only):
  - window: "lit by soft daylight from a nearby window, gentle falloff across the face"
  - overcast: "soft overcast daylight, even and calm"
  - golden: "lit by low golden sunlight late in the day, warm rim light through the hair, long soft shadows"
  - lamplight: "warm lamplight in a dim room"
  - streetlight: "lit by warm street lamps at night"
- **Optional:** "shot on 35mm film, warm cinematic colour grade, candid lifestyle photograph".

**Settings:** `soul/v2/standard`. Ratios 4:5, 16:9, 9:16 or 1:1, each generated natively. Keep children and family scenes out of this library.

**Worked example:**
```
a 31-year-old adult man with short brown hair and light stubble, wearing a plain grey tee and dark chinos, the front of every garment a smooth unbroken expanse of plain fabric, in a plain kitchen with morning light, pouring coffee from a plain kettle, steam rising. Composition: the subject stands left of centre, the scene continuing naturally around them. Lit by soft daylight from a nearby window, gentle falloff across the face, natural skin texture, photorealistic.
```

---

## T6. Fashion

**Slots:** `WHO(age + trait)` `GARMENT` `SET + LIGHT` `MOTION` `PLACEMENT` `FASHION_LOOK`

```
a {AGE}-year-old adult {WHO}, wearing {GARMENT}, {SET + LIGHT}, {MOTION}. Composition: the subject sits {right|left} of centre, the {other side} of the frame falling away into soft unbroken shadow. {FASHION_LOOK}, fashion photograph, natural skin texture, photorealistic, sharp.
```

**Vocabulary:**
- **GARMENT:** "a scarlet silk gown with a long train", "a glossy black puffer over wide-leg denim and chunky boots", "a sculpted ivory wool coat".
- **SET + LIGHT:** "on a black studio sweep under one hard key light, background falling to pure black", "on a rainy crossing at dusk, wet asphalt throwing back the traffic glow", "against a seamless burnt orange backdrop lit by a single hard directional source".
- **MOTION:** mid-spin with the train arcing away; mid-stride; head tipped back, hair caught mid-movement.
- **FASHION_LOOK:** "saturated colour, deep blacks, crisp specular highlights" (couture); "candid reportage, soft grain, available light, slightly cool grade" (street).

**Settings:** `soul/v2/standard`. Optional `cinematic` presets for lens and lighting. Never name a film stock and never say "empty".

**Worked example:**
```
a 28-year-old adult Somali woman with a shaved head and gold ear cuffs, wearing a scarlet silk gown with a long train, on a black studio sweep under one hard key light, background falling to pure black, mid-spin, the train arcing away from her legs. Composition: the subject sits right of centre, the left of the frame falling away into soft unbroken shadow. Saturated colour, deep blacks, crisp specular highlights, fashion photograph, natural skin texture, photorealistic, sharp.
```

---

## T7. Location plate

**Slots:** `PLACE + 2-3 concrete details` `LIGHT` `SIDE?`

```
{PLACE with details}, {LIGHT}. Wide cinematic establishing shot showing the whole space clearly, the location itself is the subject and fills the frame, completely deserted and still, every surface a continuous unbroken material, open shadows with clear detail held in the darkest areas, balanced exposure, natural architectural perspective, photorealistic, sharp throughout.
```

**Vocabulary:**
- **LIGHT:**
  - dawn: "first light at dawn, cool blue shadows, thin ground mist, sun just clearing the horizon"
  - night: "deep night, single sodium lamp as the only practical light, faint haze around the lamp"
  - rain: "heavy rain in flat grey overcast light, standing water and reflections everywhere"
  - winter: "mid-winter, fresh snow on every horizontal surface, flat white sky"
  - golden hour: "low golden sunlight"
  - interior: "warm tungsten glow"
- **SIDE:** usually left out. The "bare surface" side rendered wall slabs. If needed, use "framed low, the upper part of the frame filled by open sky".

**Settings:**
- `soul/v2/standard`, 16:9.
- Alternative: `mirage-film-2`, for mood frames only.
- Avoid `soul/location`: it plants lone figures and crushes the shadows.
- Use the plain noun for the place. Unusual places (airport gate, boxing ring) can drift, so check that the place reads correctly.

**Worked example:**
```
a Marrakech riad courtyard, zellij tilework underfoot, horseshoe arches on carved cedar, an orange tree beside a still fountain, clear late-morning daylight. Wide cinematic establishing shot showing the whole space clearly, the location itself is the subject and fills the frame, completely deserted and still, every surface a continuous unbroken material, open shadows with clear detail held in the darkest areas, balanced exposure, natural architectural perspective, photorealistic, sharp throughout.
```

---

## T8. Prop

**Slots:** `NOUN` `DEFINING PARTS` `SURFACE + ONE LIGHT`

```
{NOUN} — {DEFINING PARTS}, {material and wear}. It sits {SURFACE}, {ONE LIGHT}. The finish a single continuous plain surface. Three-quarter view at 85mm from slightly above, the whole object well inside the frame with breathing room around it, shallow depth of field, background softly blurred, cinematic lighting with detail held in the shadows, photorealistic, museum-quality product still.
```

**Vocabulary:**
- **NOUN first,** then parts: "a tuning fork — two parallel steel tines joined at a stem", "a copper saucepan — a hammered body with a riveted iron handle".
- **SURFACE + LIGHT:** "on a marble counter in cool morning light", "on dark stone, single shaft of light", "on a scuffed mahogany desk, warm lamp light from the left".
- **Leave out:** passports, pill bottles, banknotes, books, numbered dials, typewriters, tape measures. They carry text by definition.

**Settings:** `soul/v2/standard`, 1:1. Alternative to test: `gpt-image-2.6-flare`.

**Worked example:**
```
a leather flying helmet — a fleece-lined skull cap with twin ear cups and round goggles pushed up on the brow, worn soft at the seams. It sits on a canvas seat in a hangar, dusty light from the open doors. The finish a single continuous plain surface. Three-quarter view at 85mm from slightly above, the whole object well inside the frame with breathing room around it, shallow depth of field, background softly blurred, cinematic lighting with detail held in the shadows, photorealistic, museum-quality product still.
```

---

## T9. Character body-lock (one fixed figure line reused across lifestyle shots)

1. **Write the LOCK once.** Paste it word for word into every prompt; never paraphrase it.
   - Pattern: `a {AGE}-year-old adult {ORIGIN} woman with {HAIR}, {EYES}, {SKIN}, {FACE_TYPE} and {FIGURE}`
   - FIGURE uses the T1 vocabulary.
2. **Hero:** run the LOCK through T1 (triptych) or T5 (lifestyle).
3. **Scenes:** `{LOCK}, wearing {OUTFIT}, the front of every garment a smooth unbroken expanse of plain fabric, {WHERE}, {DOING}. {LOOK}, natural skin texture, photorealistic.`
4. **Identity on Kolbo:** `soul/v2/standard` cannot take a DNA. For repeat scenes:
   - use `nano-banana-2.1` or `seedream-5.5-text-to-image` with the character's `visual_dna_ids`, and leave the LOCK's physical words out (the DNA text is injected and would compete); or
   - use `generate_image_edit` with the hero face as the source.
5. **Vary one axis per shot.** Change outfit, place, or mood, never all three. Keep the light matched to the place.

**Worked example (scene):**
```
a 24-year-old adult Brazilian woman with long dark brown waves, green eyes, golden tan skin, soft high cheekbones and a toned athletic figure with a large natural bust and long lean legs, wearing a cream ribbed knit dress, the front of every garment a smooth unbroken expanse of plain fabric, at a sunlit café table by a large window, both hands around a plain cup, looking out. Lit by soft daylight from a nearby window, gentle falloff across the face, natural skin texture, photorealistic.
```

---

## Searching global Visual DNAs

Always filter a global DNA search by collection (`glamour`, `street`, `influencers`, `cast`, `locations`, `props`). The unfiltered pool mixes every collection, including character sheets of all ages; never pick a person from it without the collection filter, and never use a DNA that does not read clearly adult.
