# Micro-Drama Studio

Produce a vertical micro-drama series end to end in Kolbo: series bible, cast, locations, voices, Seedance 2.5 Draft episodes, finals, the edit, a series trailer, social cutdowns and key art. Use when the user wants a micro-drama, a short-form drama series, episodic vertical drama, a branded drama series, or "a show like ReelShort / DramaBox".

This file is the router and the operating contract. Load the stage file when you reach that stage; each one is short and owns its QA gate.

| Stage | Read | Output |
|---|---|---|
| 0. Kickoff | this file | answers to the kickoff questions, Kolbo project, bible Doc |
| 1. Bible + season | `references/workflows/micro-drama/series-bible.md`, `references/workflows/micro-drama/writing.md` | logline, world + look, characters, season outline with every Looks table |
| 2. Episode script | `references/workflows/micro-drama/writing.md` | beats, dialogue, parts, trailer moments |
| 3. Cast, looks, locations, voices | `references/workflows/micro-drama/cast-locations-voices.md` | character sheets + Visual DNAs, location frames, locked voice samples |
| 4. Shots + prompts | `references/workflows/micro-drama/shots-prompts.md` + `references/models/seedance25.md` | one Seedance 2.5 prompt per part |
| 5. Draft render, review, finals | `references/workflows/micro-drama/render-qa.md` | approved Draft parts, finalized keepers |
| 6. Edit + delivery | `references/workflows/micro-drama/edit-deliver.md` | tight cut, platform episode, social cutdowns, trailer, key art |

Craft depth lives in the filmmaking packs; reuse them, do not restate them: `references/workflows/filmmaking.md` (router), `references/filmmaking/scene-engine.md`, `references/filmmaking/acting-direction.md`, `references/filmmaking/blocking-continuity.md`, `references/filmmaking/audio-dialogue-music.md`, `references/workflows/visual-dna.md`, `references/workflows/video-editor.md`.

## Stage 0 — Kickoff (ask once, in one labeled question card)

Ask these before any paid step, with the suggested default first. Store the answers at the top of the bible.

1. **Idea + genre**: the user's premise, and one of the genre templates in `references/workflows/micro-drama/writing.md` (romance/revenge, thriller/mystery, brand series, comedy) or "other".
2. **Season shape**: number of episodes (suggest 6), episode length (suggest 45-90 s), aspect (suggest 9:16).
3. **Language**: English is the reliable default. Seedance 2.5 performs English dialogue natively. For any other language, tell the user before anything is generated: Seedance 2.5 may not speak it (it does not speak Hebrew at all), and the route is either a model that speaks it natively (check `list_models`) or recorded/generated speech with a lip-sync model, both with their own cost and quality trade-offs. Let the user choose.
4. **Look route**: photoreal drama, or a stylized glamour / nostalgic look (Midjourney stills as the look source). See `references/workflows/micro-drama/cast-locations-voices.md`.
5. **Finals**: episodes are always blocked in Seedance 2.5 Draft. Read `draft_resolutions[].final_resolutions` for `seedance-2-5` in `list_models` (as of 2026-10 a Draft finalizes to 1080p only). If there is a choice, ask which tier; if not, tell the user the final tier and its cost per 30 s, and ask whether to finalize at all or deliver the Draft cut.
6. **Credit cap** for the season (and per episode), quoted against the estimate in `references/workflows/micro-drama/render-qa.md`.

Then create one Kolbo project per series (`create_project`) and pass its `project_id` on every call. The bible is a Kolbo Doc in that project (`create_doc`), so Kobi, the user and outside agents read the same source of truth.

## Approval gates (the user decides; the agent runs everything between them)

1. Concept + season outline.
2. Each new character's sheet, then its voice (picked from 2-4 auditions).
3. Credit cap. Inside the cap, Draft renders run without asking. Every finalization, and anything over the cap, needs a yes with the quoted cost.
4. The tight cut of each episode.
5. Publishing is always the user's action.

In Kobi Act, `submit_plan` is the approval card for each gate; do not add extra confirmation loops between gates. Outside Kobi, follow the Kolbo brief-and-cost confirmation rule at each gate.

## Chat and discovery

Kolbo Chat exposes this workflow as **Micro-Drama Studio** (`micro_drama`). Chat uses `references/workflows/micro-drama/chat.md` for planning and prompt delivery; Kobi Act loads this router and the stage files from the bundled Kolbo skill. The public standalone command is `/kolbo:micro-drama`.

## Where it runs

Any agent connected to the Kolbo MCP can run this workflow end to end: Kobi in the Kolbo app, Kolbo Code, Claude Code, Codex / ChatGPT agents, Cursor. Generation, references, project, bible Doc and transcription are all Kolbo tools. The only local part is the optional edit scripts, which need a shell, Python 3, numpy and ffmpeg; agents without a shell build the cut in the Kolbo Video Editor instead.

## Who edits

- **Kobi** builds every cut in the Kolbo Video Editor (`references/workflows/video-editor.md`), so the user can open and tweak it.
- **Outside agents** (Claude Code, Codex, Kolbo Code) with a shell edit locally with the bundled scripts in `scripts/micro-drama/` (Python 3 + numpy + ffmpeg). They may also hand the user a Video Editor session if asked.

## Hard rules

- Every character is fictional and a clearly adult (21+), stated in every character prompt and visible on screen. No real-person or celebrity likeness. No famous names or IP in any prompt.
- Consent is explicit in any romantic or intimate beat. No sexual content; heat stays at the level the user's platforms allow.
- Never spend over the cap. Never finalize without a quote and a yes.
- Every stage ends in its QA gate. A failed gate gets the smallest fix (one shot, not the episode), at most 2 retries per item, then report to the user with evidence.
- Every user note becomes a fix plus a rule in the series bible's "House rules" section, so the next episode does not repeat it.
