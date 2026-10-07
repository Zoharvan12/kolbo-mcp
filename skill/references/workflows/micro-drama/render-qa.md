# Micro-drama — Draft renders, QA, finals

Every part is blocked in **Seedance 2.5 Draft** (`draft: true`; see `models/seedance25.md`). Only parts the user keeps are finalized, at the resolution chosen at kickoff. Never regenerate a kept Draft to "upgrade" it.

## Estimate before the season (and before each episode)

Read live rates from `list_models` (Seedance 2.5 bills per output second; Draft is about 0.44x the 720p rate). Estimate:

```
episode Draft  = sum(part seconds) x Draft rate x 1.3   (1.3 = typical fix-shot overhead)
episode final  = kept seconds x finalization rate at the chosen resolution (from edit_video draft_quote)
assets         = sheets + looks + locations + voices (once per series; looks per season)
```

Show the totals against the cap. If the season does not fit, cut episodes or parts, never pace inside a part.

Reference run (2026-10-07, "Wrong Number" Ep1): a 60 s episode = 4 parts x 15 s Draft = 1,020 credits, plus about 55 credits of cast, locations and voices (Midjourney looks, Seedream Flash sheets, Seed Audio voices). The cut came to 58.6 s with every line intact.

## Draft loop

1. **Part 1 first** as the test for a new series or look. Review it yourself before firing the rest.
2. Then submit the remaining approved parts of the episode in one parallel batch (no waiting on each other). A part whose assets already exist goes out at once; only parts waiting on a new location or prop wait for that asset.
3. **QA every part** (below). FAIL → the smallest fix: re-prompt and re-render only the failed shot as a short part (4-8 s), not the whole part. Max 2 retries per item, then show the user the evidence and options.
4. Accept small render notes; fix only story, continuity or taste breaks.
5. Do not poll in a loop; the generation card updates itself. When the next step needs the URL, check status without `wait` every 1-2 minutes (a 15 s Draft took about 5 minutes; long `wait` calls can time out on the client).

## Render QA (per part)

Look at frames, not the prompt. Outside agents: `python scripts/micro-drama/shot_map.py part.mp4 out/` and read every strip. Kobi: extract one frame per shot with ffmpeg on the Act host and view them.

- Faces, hair, wardrobe and props match the sheets in every shot; no extra people; no text or logos.
- Blocking holds: furniture in the same place, each person where the previous shot left them, screen direction consistent.
- Eyes never in the lens; face fully in frame on speaking and reacting shots; at least one visible change per close shot.
- Props physically right (open bottle before pouring, the card in the same hand).
- Dialogue: `transcribe_audio` the part; every scripted line present once, in order, no invented words, right speaker's lips moving. No music unless requested. An empty transcript on a part with one quiet line (a whisper, "Theo?") is a transcriber miss, not a missing line: re-run without voice-activity filtering or listen before re-rendering.
- Shot detection also fires on fast micro-cuts Seedance puts inside an insert (three cuts in 0.5 s). Those are slivers for the edit to drop, not a render failure.
- Pace: no rushed movement, no dead stretch the edit cannot remove.

## Finals (only the keepers)

1. The user picks the keepers (or approves the tight cut built from Drafts; see `edit-deliver.md`).
2. For each keeper: `edit_video` with `operation: "draft_quote"`, the Draft's `video_url`, `project_id` and a resolution from the catalog's `final_resolutions` (Drafts expire after `lifetime_seconds`, 7 days as of 2026-10, so finalize within that window). Sum the quotes and show them with the cap.
3. Only after the user explicitly says yes to that exact quoted credit amount: `edit_video` with `operation: "draft_enhance"` and the same source, project and resolution. Never in the same turn as the quote, never covered by the credit cap or any autonomy setting, never as a default step. Finals are expensive (a 1080p finalization costs about 4.4x the Draft of the same length as of 2026-10); say so when quoting. This renders the same Draft at full quality; it is not a new generation.
4. If a Draft has expired or cannot be finalized, say so before proposing any new paid render.
5. Re-check each final against its Draft (same shots, same audio); the edit uses finals only.

Cheaper path for long episodes: build and approve the tight cut from Drafts first, then finalize only the clips the cut actually uses.

Budget alternative: upscale the approved Draft cut instead of re-rendering it. `edit_video` `operation: "upscale"` with the Bytedance upscaler and `enhancement_preset: "short_series"` (made for short dramas) costs a small fraction of a Draft finalization (read the live rate from `list_models type="video_upscale"`). It enlarges the 480p Draft rather than re-rendering it, so detail stays closer to the Draft; say that when offering it. Same rule: quote, explicit yes, then run.

## Bookkeeping and learning

- Record every approved gen id, final id and real `credits_used` in the bible's Episodes section. Never state a remaining balance from arithmetic; call `check_credits` when asked.
- Stop and report when a series reaches its cap or any item fails QA three times.
- Every note from the user: fix the item, find the root cause (wording, reference, setting), add a rule to the bible's House rules, and apply it to all later prompts of the series.
