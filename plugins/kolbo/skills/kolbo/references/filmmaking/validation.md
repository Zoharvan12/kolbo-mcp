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

Set an attempt threshold appropriate to cost and complexity. When the same failure repeats beyond it, escalate from wording to production redesign.

## Severity

- **Blocker:** unusable take—identity, safety, missing actor/action/dialogue, broken physics, wrong state, impossible continuity, capability violation.
- **Major:** story/performance/edit meaning changes or visible slop likely noticed by viewers.
- **Minor:** polish issue that can be retouched or accepted without changing meaning.

Do not approve a feature-critical take with unresolved blockers. Distinguish static prompt confidence from real generated-media proof.
