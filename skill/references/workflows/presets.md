# Presets — Kolbo's stored instruction blocks

A preset is a long, hand-tuned instruction block stored in Kolbo's catalog. Passing
`preset_id` prepends it to the user's prompt at generation time. **The craft lives on
the preset** — a three-panel character sheet, a Seedance shot-sequence structure, a
grading recipe — and it is always better than the paragraph you would improvise.

Until now the skill only ever taught `type: "image"` for character sheets. That left the
largest catalog in the product — **263 video presets, over 200 of them Seedance 2 shot
recipes** — invisible to every agent. If the user's request looks like something in a
catalog below, search it before you write the prompt yourself.

## The catalogs

`list_presets({ type, search })`. Sizes measured 2026-08-31; they drift, so **never
memorise ids or names — always resolve live.**

| `type` | Size | Categories (the search vocabulary) | Passed to |
|---|---|---|---|
| `image` | ~146 | thumbnails, text, style, layout, personas, grading, camera | `generate_image` |
| `image_edit` | ~103 | style, camera control, grading, layout, enhancement | `generate_image_edit` |
| `video` | ~263 | **seedance 2 (200+)**, camera, storyboard, character, vfx | `generate_video`, `generate_elements` |
| `music` | ~54 | *(flat — no categories; search name/description)* | `generate_music` |

Two more `type` values exist and are traps:

- **`text_to_video` is an alias for `video`** — the same collection since consolidation,
  returned with a different `type` label. Use `video`. Asking for both double-counts.
- **`shorts` is empty** (0 rows in production). Shorts Creator is built but not in
  service. Do not offer it.

**`image` and `image_edit` are separate collections and their ids are NOT
interchangeable.** An `image` id on `generate_image_edit` fails. Resolve against the
catalog for the tool you are about to call.

**No preset on `generate_video_from_image`.** Image-to-video takes `visual_dna_ids` but
not `preset_id`. If a user wants a video preset look, route through `generate_video` or
`generate_elements`.

## Reading the user's intent

This is the part that matters. The user rarely says "use a preset" — they describe an
outcome that a preset already encodes. Search when the request matches a row here:

| The user asks for… | Catalog | Search terms that hit |
|---|---|---|
| A character/location/product reference sheet, turnaround, model sheet | `image` | `character sheet`, `headless`, `bible`, `location`, `product` |
| A YouTube / Shorts / Reels thumbnail, a video cover | `image` | `thumbnail` — and read `workflows/thumbnails.md` |
| Text *in* the image — a headline, poster copy, a title card | `image` | `text`, `title`, `poster` |
| A named look: anime, noir, claymation, 35mm, cyberpunk | `image` | `style`, or the look itself |
| A colour treatment: teal-orange, bleach bypass, film stock | `image` / `image_edit` | `grading` |
| A specific framing: overhead, macro, wide establishing | `image` / `image_edit` | `camera` |
| A person archetype: influencer, CEO, athlete, elderly | `image` | `personas` |
| A grid, split-screen, collage, comparison, panel layout | `image` | `layout` |
| Upscale / restore / clean up / sharpen an existing image | `image_edit` | `enhancement` |
| Any Seedance 2 / 2.5 shot — chase, duel, drift, reveal, showcase | `video` | describe the ACTION: `chase`, `orbital`, `drift`, `duel`, `showcase` |
| A camera move: dolly, crane, whip pan, bullet time | `video` | `camera` |
| A storyboard or multi-shot beat sheet | `video` | `storyboard` |
| VFX: explosions, particles, morphs, energy | `video` | `vfx` |
| A music genre, mood, or instrumentation | `music` | the genre or mood word |

Search on the **noun the user used**, not a category name — the tool matches against
name, description and category together, so `"drift"` finds *Impossible Continuous
Drift* without you knowing which category it lives in.

## Discovery contract

- **Always pass `search`.** The full catalog measured 632,919 characters; dumping it
  burns the context window and returns nothing you can act on. A named lookup returns a
  handful of rows.
- Browse (`search` omitted) **only when the user asked to see what's available.** That
  renders a picker widget — it is for the human, not for you.
- The response carries `total` (catalog size) and `omitted_from_this_page`. A large
  `omitted` on a lookup means your search was too broad — narrow it, don't paginate.
- **Reuse the id.** Once resolved in a conversation, it stays valid; do not re-search
  for every generation in a batch.
- **Never invent, guess, or reconstruct an id from memory.** Ids are opaque ObjectIds.
- Do not filter results yourself by `category` casing — the API lowercases what Mongo
  stores capitalised (`Layout` → `layout`). Match on meaning, not string equality.

## Applying one

- Pass the **exact returned `id`** as `preset_id`. One preset per generation — there is
  no array.
- **Never claim a preset was used without passing `preset_id`.** Saying "I applied the
  Headless Character Sheet preset" while omitting the field is a fabricated result.
- The preset is **prepended**, not substituted: still write a real prompt describing the
  subject. The preset supplies the treatment, you supply the content. A preset with an
  empty prompt produces the preset's stock example.
- **Prefer `generate_image` + `preset_id` over `generate_character_sheet`** for any
  sheet. The custom instructions live on the preset; the dedicated tool has less craft
  in it.
- Video preset descriptions reference `@image1`, `@image2` for their subjects — when a
  preset says that, supply reference images in that order.

## Preset vs Visual DNA vs moodboard vs Color DNA

They stack, and they answer different questions. Do not substitute one for another:

- **Preset** — *how it is rendered.* Treatment, structure, camera, layout.
- **Visual DNA** (`visual_dna_ids` + `@Name` in the prompt) — *who or what is in it.*
  Identity lock. See `workflows/visual-dna.md`.
- **Moodboard** (`moodboard_id` + `#Name`) — *the reference vibe*, derived from images.
- **Color DNA** — *the grade*, account-wide and automatic while active. See
  `workflows/color-dna.md`.

A preset carrying its own grading language can fight an active Color DNA. If the user
picked both and the output drifts, that is the collision — say so and offer
`skip_color_palette: true` rather than silently dropping the preset.

## Cinematic presets are a different tool

`list_cinematic_presets` — ~136 presets across dimensions (today: camera, lens,
focal_length, aperture, angle, shot_type, color_palette, lighting; data-driven, always
fetch). These are **not** `list_presets` rows and do not go in `preset_id`.

- Pass chosen ids via the `cinematic` argument of `generate_image` /
  `generate_image_edit`, **at most one id per dimension**.
- **"Auto" is the absence of a selection** — omit the dimension, or the whole
  `cinematic` object. Do not hunt for an "auto" preset.
- Call with no args for a compact index, then pass `dimension` for full descriptions of
  just the one you are choosing from.
- **Only call this when the user wants a deliberate photographic look.** For an ordinary
  generation, don't. "Make it cinematic" as a vague adjective is a prompt-quality
  request, not a request for this tool.

## When NOT to reach for a preset

- The user gave a **specific, complete creative direction of their own.** A preset
  prepends 200+ words that will compete with theirs. Their words win.
- They named a **preset explicitly** — resolve that one, do not substitute a "better" match.
- The request is a **plain edit** ("remove the background", "make it 4K"). Those are
  `edit_image` mechanics, not presets.
- You are **mid-batch on an approved look.** Changing preset between shots in one
  sequence breaks continuity — that is the whole point of a locked global look.
- You could not find a good match. **Say nothing and write a good prompt.** Announcing
  that you searched for presets is noise; silently applying a poor match is worse.
