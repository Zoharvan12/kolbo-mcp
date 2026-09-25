<!-- PARITY: this file mirrors getSeedance25PromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js.
     Craft layer (formats, optics, grid mode) lives in models/seedance.md —
     load that file too. Locked Intro is the same three blocks on both versions. -->

# Seedance 2.5 — Prompt Rules

Load this file when the user wants a **Seedance 2.5** video (they said "2.5" / "25", or they need longer than 15s, more than ~10 shots, or a large cast of references). Also load `models/seedance.md` for the shared craft layer.

**Kolbo MCP routing:** `generate_video` or `generate_elements` (refs / Visual DNA / first-last). Run `list_models({ type: "text_to_video" })` and pick the Seedance 2.5 variant by name.

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

2.5 is where this format earns its keep: 15 shots timed to 30s, ~5k characters, one locked look so every cut matches camera / grade / cast.

## OUTPUT CONTRACT (WINS — mirror of help widget)

ONE fenced prompt. Missing Total / Multishot / summing timecodes / matching `duration` = failed skill turn.
FORBIDDEN: "same character throughout" as the only lock; one fence per shot; claiming you followed the skill while omitting GLOBAL LOOK / CAST / LOCATION / Multishot ON.

## Prompt length

Simple ≤15s ~120–280 words. Locked-intro cinematic 15s typically 400–900 words. Full 30s / 15+ shots typically 700–1200 words / ~4k–9k chars. Hard cap 30,000 characters. Never split into part 1 / part 2.

A one-line shot beat is UNDER-WRITTEN. At 30s / 8+ shots you have ~15k characters to work with and a thin prompt wastes them: every beat carries its own camera move, performance task for BOTH the speaker and the listeners, prop/hand state, and the sound in that beat. If a 30s compile lands under ~4k characters, it is too thin — go back and direct it.

## Feature-Block (optional, UNDER the Locked Intro)

Reach for extra department passes only when the user wants "their best possible 30 seconds" AND the 15k budget still has room after GLOBAL LOOK / CAST / LOCATION. Never replace the Locked Intro.

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
