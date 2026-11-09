<!-- PARITY: this file mirrors getSeedance25PromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js.
     Craft layer (formats, optics, grid mode) lives in models/seedance.md —
     load that file too. Locked Intro is the same three blocks on both versions. -->

# Seedance 2.5 — Prompt Rules

Load this file when the user wants a **Seedance 2.5** video (they said "2.5" / "25", or they need longer than 15s, more than ~10 shots, or a large cast of references). Also load `models/seedance.md` for the shared craft layer.

**Kolbo MCP routing:** preserve the selected mode. `generate_video` is text-to-video; `generate_elements` composes reference assets; `generate_video_from_image` animates an opening still; `generate_first_last_frame` connects supplied opening/landing frames. Discover the compatible Seedance 2.5 variant using that tool's model type. Frames use ordinary motion/transition prose, not the Elements Locked Intro. An uploaded frame is `@Image1` (landing frame `@Image2`), never an invented DNA name.

**Audio:** Seedance 2.5 emits real synced audio. `list_models` shows `sound_generation_type: none` only because there is no in-app toggle (`sound_baked_in: true`) — it does NOT mean the model is silent, and it is never a reason to reach for TTS. Quoted dialogue is PERFORMED (synced voices, lip movement, room tone) alongside the SFX named in AUDIO, so scene dialogue never goes through `generate_speech` or `generate_lipsync`; write the lines in quotes inside their shot beats.

**Hebrew (HARD):** Seedance 2.5 does **not** speak Hebrew. Never put Hebrew-script dialogue in the prompt. Use Latin transliteration in quotes per speaker (`שלום` → `"shalom"`), or route native Hebrew speech to Gemini Omni Flash 1.1 / Gemini Omni 1. Attached-audio lip-sync sometimes works when audio length matches the clip exactly and the prompt has no Hebrew script; Kolbo accepts native audio uploads (no black-video workaround). Asset tags always retain their exact stored spelling, including `@אביב` / `#ישראל` literally. Keep post-production VO out of the generation prompt.

**Use the cheapest supported tier unless the user selected an output resolution.** Resolution is a credit MULTIPLIER, not a flat rate. Relative to 720p: 480p ×0.44, 1080p ×2.25. A 30s pass costs ~540cr at 480p against ~1230cr at 720p and ~2770cr at 1080p. When no output resolution was selected and 480p is the cheapest supported tier, block the film at 480p, get the user's sign-off on staging, performance and timing, then re-run only the approved cut at a higher delivery resolution if the user explicitly authorizes that resolution increase. Approval of the creative cut alone does not authorize a more expensive resolution. If no output resolution was selected, use the cheapest supported tier from the live catalog even for final work; pass it explicitly.

## Special Draft mode and full-quality rendering

**Draft is a distinct generation mode, not a synonym for low resolution.** When the user requests Seedance 2.5 Draft, use the ordinary generation tool for their inputs (`generate_video`, `generate_video_from_image`, or `generate_elements`) with `model: "seedance-2-5"` and `draft: true`. This forces 480p Draft even when a higher resolution was requested. `resolution: "480p-draft"` remains a compatible alias. Explicit `draft: false` disables Draft. `resolution: "480p"` is a regular generation and cannot be presented as Draft. Do not silently substitute regular 480p when Draft was requested. Read the live catalog's `supported_resolutions` and draft capabilities; do not invent draft support for other models.

Draft uses ordinary credits, not Unlimited. Keep the user's complete prompt, duration, aspect ratio, references, audio and shot settings. Tell the user which mode was actually submitted; the widget should say **480p Draft** for Draft. Choosing the cheapest pixel size alone does not select Draft. In the app, enabling the Draft toggle forces 480p; selecting any regular resolution disables Draft. Keep the label "Draft" in English in every language.

To turn an approved draft into full quality, use its saved output video URL and original project: call `edit_video` with `operation: "draft_quote"`, `video_url`, `project_id`, and the desired supported `resolution`. Read the exact credits, expiry and supported resolutions from that quote. Once the paid finalization is authorized, call `edit_video` with `operation: "draft_enhance"` and the same source/project/resolution. This is a dedicated render of the saved draft, not a new text-to-video generation or generic upscale. Never ask the user for provider task IDs or cache handles. If the draft has expired or cannot be finalized, explain that result before proposing a new paid generation.

## What's NEW in 2.5 (verified — never hedge)

- **Duration 4–30 seconds**, whole seconds. 30s IS supported.
- **Up to 30 shots/cuts in ONE generation.** Deliver exactly N if N ≤ 30.
- **Prompt cap 30,000 characters** for the entire prompt as one string (`max_prompt_length` in the catalog; Seedance 2.0 is 10,000). Raised from 15,000 on 2026-08-30 after the whole provider chain was verified live to serve it. Verify with `list_models` rather than trusting this number — it has moved before.
- **Large reference / Visual DNA capacity** (`@Name`, `@ImageN`, `#Moodboard`) — read the exact caps from `max_visual_dna` / `elements_max_images` in `list_models`. Every referenced asset must be tagged in the prompt text. A rewrite that drops or renames a tag ( `@doron_fauda_1` → `DORON` / `the hero` ) is a failed turn — put the exact tag back.
- **Multimodal refs:** images + video clips + audio can all anchor one generation.
- **NO MUSIC BY DEFAULT (HARD):** Unless the user explicitly asks for music, every final Seedance 2.5 prompt—including every Elements/reference-driven prompt—must explicitly say `No music. No musical score.` Preserve requested dialogue, synchronized production sound, ambience, and SFX; no music does not mean "no audio." If music is explicitly requested, describe it and omit the no-music lock.
- **NO FAMOUS NAMES OR IP IN PROMPTS (HARD):** Never put celebrity/public-figure names, real directors or artists, copyrighted character/franchise/IP names, famous campaign names or slogans, or famous studio/company names into a final Seedance 2.5 or Elements prompt. Translate user-supplied references into concrete visual traits without repeating the famous name; preserve exact user-owned Visual DNA and asset tags.

## Universal Rules (HARD — same as help widget OUTPUT CONTRACT)

User-selected shot structure wins over examples. One continuous take uses `Single continuous shot`, `Total: Xs / 1 shot / AR`, one SHOT heading and `multi_shots: false`. Use Multishot ON only for multiple shots. Copy aspect, duration, dialogue and camera direction from the current scene brief. Expand craft blocks only when they resolve a real staging need; do not pad or introduce contradictory locks.

- **First lines ALWAYS declare shot structure** (text-to-video / Elements / reference gen — NOT video-edit):
  1. `N connected cinematic shots, Xs total, AR, Multishot ON`
  2. `Total: Xs / N shots / AR`
  Example: `12 connected cinematic shots, 30 seconds total, 16:9, Multishot ON` + `Total: 30s / 12 shots / 16:9`
  UGC phone: `N connected phone shots, Xs total, 9:16, Multishot ON` — never the word "cinematic"; restate `9:16 vertical phone frame` in every shot.
- **Last line repeats** `Total: Xs / N shots / AR` + short POSITIVE LOCKS.
- **Shot timecodes MUST sum to Xs.** `SHOT 1 — 0:00–0:02` … through SHOT N ending at Xs. Never `[0s]` / `[3s]` stubs.
- **MCP `duration` = Xs** on the generate call. Mismatch is a failed turn.
- Duration range **4–30s**; shot count **≤30** in one generation. Do not split a ≤30s story into multiple 10s clips unless the user asks.
- Omit Total / Multishot / shot-count headers only for **video editing** (source duration locked) — use Edit Goal blocks instead.

## Two layers (HARD)

Layer 1 = the Locked Intro: everything constant — shooting style, grade, fixed lighting, fixed elements/props, cast look AND persona, location, the location's physical scale, the piece's speed and assertiveness, and each performer's position relative to the location and to the other performers. Layer 2 = the timecoded SHOT list: only what changes, in full detail. Persona and per-shot performance rules: `models/seedance.md` § Persona & performance — at 30s and 30 shots a cast with no locked persona drifts into a different person by the last cut.

## Locked Intro (DEFAULT — same shape as Seedance 2)

```
N connected cinematic shots, Xs total, AR, Multishot ON
Total: Xs / N shots / AR

[GLOBAL LOOK – LOCKED, APPLIES TO EVERY SHOT]
[CAST – IDENTICAL IN EVERY SHOT]
[LOCATION]
[LOCATION MAP]
[CONTINUITY – LOCKED ACROSS EVERY CUT]
[PHYSICS]

SHOT 1 — 0:00–0:02 — Medium / camera position
…
Total: Xs / N shots / AR
```

Full acting / continuity craft: `models/seedance.md`. Do not skip the Total lines or the three look/cast/location blocks. Do not restack GLOBAL LOOK inside shots.

2.5 is where this format earns its keep: 15 shots timed to 30s, written in full detail, one locked look so every cut matches camera / grade / cast.

## OUTPUT CONTRACT (WINS — mirror of help widget)

ONE fenced prompt. Missing Total / Multishot / summing timecodes / matching `duration` = failed skill turn.
FORBIDDEN: "same character throughout" as the only lock; one fence per shot; claiming you followed the skill while omitting GLOBAL LOOK / CAST / LOCATION / Multishot ON.

## Prompt length

The whole 30,000 characters is yours (founder 2026-11-08: "no reason to be lazy"). Length is not a cost. Write every shot in full detail: rig, lens, move, action beat by beat, performance for the speaker AND the listeners, prop and hand state, light, atmosphere, sound. Never shorten a prompt to save space. Never split into part 1 / part 2.

A one-line shot beat is UNDER-WRITTEN. If a 30s / 8+ shot compile lands under ~6k characters, it is too thin: go back and direct it. Detail must stay consistent: more words never mean new contradictions (re-read the references and the locks before adding).

## Live action reads as filmed footage (founder 2026-11-08)

- Never "static", "locked-off" or a global "slow steady camera" for live action unless the user asks. Default: handheld, operator breathing, small drift and micro-shake, one motivated move per shot.
- Every shot carries atmosphere in depth: haze or dust in the light, snow or breath vapour, practical light flicker, a dark foreground edge passing through frame.
- Something alive happens from frame one. An empty set with steam and a slow push-in renders as an animated still.
- No extreme macro of skin or eyes (blotches, wax skin). The closest shot is a face close-up.
- Object actions in one medium shot, correct for the camera side: from outside, an inward door is pushed.
- References must agree with each other and with the prompt. A location image holds no story props. Items that differ (three bowl sizes) need one reference that shows them together. Never "matching" and "different sizes" in one line.
- The header's N equals the number of SHOT lines. Count them.
- Every `@Name` used in a SHOT line is declared in CAST / LOCATION / PRODUCTS. An undeclared location tag gives the model no image to bind.
- Fewer, fuller shots beat many 1-2 s fragments: about 3-9 cuts in 25-30 s, each shot long enough to act in. A "long hold" needs at least 3 s.

## Feature-Block (optional, UNDER the Locked Intro)

Reach for extra department passes only when the user wants "their best possible 30 seconds" and the 30k budget still has room after GLOBAL LOOK / CAST / LOCATION. Never replace the Locked Intro.

May add above GLOBAL LOOK: **EMOTIONAL INTENT** + **SIGNATURE MOMENT**.
May add under the shot list: CAMERA timecode pass, SOUND timestamps, PHYSICS contract, EDITING/CONTINUITY, DIRECTORIAL NOTES.
Skip CORE STYLE / SUBJECT / ENVIRONMENT — the three locked blocks already own those.

## References (ByteDance 2.5)

- Limits: up to 30 images (each ≤4K), up to 10 videos (≤30s combined), up to 10 audio clips (≤30s combined); up to 50 materials total.
- Role mapping is mandatory, one line per material:
  - `@Image N defines <subject>'s <appearance, clothing, structure, or material>.`
  - `@Video N defines <motion, camera movement, or pacing>.`
  - `@Audio N defines <character or sound type>'s <voice, dialogue, ambience, or music>.`
- Add exclusions when a material's people/background could leak: "Do not use the image background." / "Do not use the people in the image."

## Task-locked parameters

- **Video editing:** aspect + duration auto-preserve the source. Do NOT declare AR / duration / shot-count headers. Use `[Edit Goal]` / `[Source Video Role]` / `[Target Material Role]` / `[Edit Scope]` / `[Content to Preserve]`.
- **First-frame / first-and-last-frame:** AR comes from the FIRST image. Duration CAN be set.
- **Video extension:** AR auto-preserves the input; duration CAN be set.

## Where to run in Kolbo

Same routing as Seedance 2 (`first_last_frame` / `elements` / `image_to_video` / `text_to_video`). Pair Visual DNA with `generate_elements` and write the exact `@DNA_name` in CAST and every shot — never "Zohar's" / "the left man" / an untagged "Visual DNA anchors" paragraph. Elements uses this same Locked Intro; do not compile SCENE CONTEXT / OPTICS / ACTION packs.
