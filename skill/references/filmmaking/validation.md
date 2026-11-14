# Validation and Quality Control

## Pre-generation audit

Read the current creative brief, including rejected concepts and scene-specific
exceptions. Compare it to the final prompt and actual tool arguments, not the
assistant's explanation. Run `scripts/filmmaking/lint_prompt.py` against the shot
card for saved prompts. It checks Total duration/aspect/count, SHOT numbering,
continuous-take conflicts and exact multilingual tags. Optional card fields:
`shot_count`, `continuous_take`, dialogue items' `prompt_text` (exact text sent
to the model, including requested transliteration), and `post_voiceover` (a list
of exact narration strings excluded from generation). These checks do not prove
camera semantics, humor, visual quality or model adherence; review those separately.

Elements also rejects explicit Total declarations contradicting tool duration,
aspect or shot flags before submission. Resolve the mismatch against the brief;
do not strip declarations just to bypass validation. Free-form prompts remain supported.

### Script logic gate (run first; Last Call v2, 2026-11-02)

A take that executes an illogical beat exactly as written still fails. Zohar's v2 notes: "she did nothing and he suddenly grabs her hand… no logic"; "him saying outside straight away is weird"; "nobody works like that".
- For every beat: why does this happen now? The answer must be something the viewer saw.
- The antagonist wants something concrete and gets refused before he escalates. Escalate in 2–3 steps.
- Every character does one simple task a real person in that job would do.
- Is everyone the scene is about readable in frame (no dark master where the leads vanish)?
- Is each shot only as long as its information? Cost scales with seconds.

### Story and edit

- Does the shot have a necessary dramatic/editorial job?
- Is the intended reaction, reveal, reversal, or information change visible/audible?
- Does the start/end state support the neighboring cuts?

### Assets and references

- Does every tag exist in the registry?
- Is each exact state variant correct?
- Are inactive/stale tags removed?
- Does each reference have a declared role?
- Are input/reference limits respected?
- Should a difficult condition become a new asset instead of prose?

### Geography and continuity

- Are first-frame positions, facing, eyelines, camera side, and prop hands clear?
- Can every action and relocation happen in time?
- Do internal cuts preserve or deliberately change state?
- Is final state explicit for the next shot?

### Acting

- Does each important character pursue a playable tactic?
- Do listeners have tasks?
- Are beat changes motivated and observable?
- Is performance direction behavior-first rather than emotion-label-first?
- Is voice identity stable?

### Camera and light

- Does lens/FOV match content?
- Is operator movement physically coherent?
- Do camera freedom and strict blocking conflict?
- Is light source/direction/exposure coherent across cuts?
- Does style support rather than overwrite the scene?

### Physics

- Are mass, contact, support, force, clearance, and consequence plausible?
- Are props/creatures/vehicles in one consistent state per beat?
- Is complex action split or input-anchored when necessary?

### Audio

- Does one owner control each spoken/sung line?
- Do exact words/lyrics and timing fit?
- Is source/native/post audio policy clear?
- Does “no music” preserve dialogue/SFX/ambience?
- Is there an editorial audio seam?

### Model contract

- Do duration, shot count, prompt length, aspect/mode, and reference limits fit?
- Does the output format/card tag match the selected mode?
- Are continuous-take and cut instructions consistent?

## Post-generation QC

Review the entire output, not only a representative frame:

- identity and state stability through time;
- facial/hand integrity and performance timing;
- mouth ownership and audio synchronization;
- blocking, axis, screen direction, eyelines;
- prop counts, hands, contact, and continuity;
- physics, scale, creature/vehicle motion;
- camera, focus, lighting, edge artifacts, flicker, warping;
- dialogue accuracy, voice drift, invented audio;
- editorial usability of first/last frames and audio tails.

Record the exact timestamp and observable defect.

### Shot-by-shot protocol for multi-shot takes (2026-11-02)

A per-scene look passed Last Call v2 takes that held a punch that never lands, a gang standing behind the bar and a bike seat bare one shot after the coat went on it. QC each shot:
1. Split at the cuts with `production-director/scripts/shot_qc_prep.py`, and map each shot to its numbered beat.
2. Run one hq witness per shot (`analyze_video` `quality:"hq"` on the shot clip) briefed with the beat's actions one by one, eyeline, wardrobe, each prop's first- and last-frame state, extras and sky.
3. Take audio truth only from `separate_audio_stems` + Scribe on the dialogue stem. The witness invented speech in 6 of 31 shots.
4. Check every FAIL on frames.
5. Crop each lead's face in every shot.
6. Keep a continuity ledger across shots and calls.
7. Measure the assembled cut's loudness per scene.
Rubric: `video-qc/rubrics/multishot-film.md` (R1–R20). Calibration: this QC caught 14 of Zohar's 37 notes. The misses were script logic, hold length, fight plausibility and cross-call blocking. R13–R20 now cover them.

## Failure ownership

Classify one primary owner:

- asset/reference;
- wrong state or missing bible truth;
- dramatic/shot design;
- blocking/geography;
- acting/task;
- optics/camera;
- timing/action density;
- physics/material;
- lighting/style;
- audio/voice/music;
- model capability/mode;
- prompt contradiction/format;
- stochastic variation after all contracts are sound.

## Surgical iteration

Change one causal variable when possible. State the expected proof before regenerating. Preserve the exact version that worked.

**One take per prompt (Zohar, 2026-11-02).** Never re-generate an unchanged prompt hoping for a better take. When a take fails, find the failure owner, rewrite that part, and generate once at `480p-draft`. A mechanic that keeps failing after a rewrite (Bubble Trouble's split pop) needs a mode change. *Observed, not our practice:* the winning AI films rolled about 8 times per prompt version.

Set an attempt threshold appropriate to cost and complexity. When the same failure repeats beyond it, escalate from wording to production redesign.

## Severity

- **Blocker:** unusable take—identity, safety, missing actor/action/dialogue, broken physics, wrong state, impossible continuity, capability violation.
- **Major:** story/performance/edit meaning changes or visible slop likely noticed by viewers.
- **Minor:** polish issue that can be retouched or accepted without changing meaning.

Do not approve a feature-critical take with unresolved blockers. Distinguish static prompt confidence from real generated-media proof.

## Edit-first and first-viewer gates (Last Call, 2026-11-03)
- **Before quoting repair calls,** list each failing beat with its edit fix (trim, ellipsis, another take of the same DNA and location version). Fire only what the cut cannot fix.
- **Before showing a cut,** run a first-viewer witness on the whole cut: story retell, confusion list, rating. It caught that cutting the helmet-and-mount beat reads as a jump, even though every remaining shot passed.
- **Disputed acting:** a frame crop decides, never the witness alone.
