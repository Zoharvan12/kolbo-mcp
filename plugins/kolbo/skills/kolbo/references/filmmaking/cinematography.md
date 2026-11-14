# Cinematography

Translate creative intent into visible camera behavior. Use model-readable outcomes rather than relying only on equipment names.

## Decide content before lens

Match the optical class to what the frame must communicate:

| Content | Useful FOV region | Observable result |
|---|---:|---|
| Immersive environment/body-near-camera | 84°–107° | strong depth expansion, environment readable, camera physically close |
| Natural grounded observation | 47°–63° | human perspective, readable space, modest separation |
| Portrait/dialogue isolation | 18°–29° | stable face, compressed background, focused attention |
| Distant surveillance/sports/wildlife | 8°–12° | extreme compression, distance, foreground occlusion, atmosphere |
| Fisheye/extreme subjective world | 135°–180° | explicit distortion and environmental immersion; higher failure risk |

Use discrete anchors when the model responds to them. Reinforce extreme optics with physical camera distance, foreground behavior, depth, and visible outcome.

**Narrative film (2026-11-02, five award-level AI films):** describe the frame and its purpose before any lens number ("their shoulders frame the foreground; the image reads as: THEY ARE LOOKING AT THIS"); Tortoise used millimetres in 6 of 366 prompts. Also proven: a numbered camera plan per segment ("9 shots, 8 real positions: ① ... ⑨", each with its reason); the camera law "every change of shot size is a HARD CUT to another real camera position; never push, pull or zoom" with "no push-in, no pull-out, no zoom, no dolly, no tracking, no rack focus — breathing drift only" (Red Flag, 103 prompts); named depth layers PRIMARY / SECONDARY / BACKGROUND; a physical POV ("the camera is her eyes, 148 cm high"); a FINAL IMAGE line per take; a 0.3 s wide master then a hard cut to lock geography. Full format: `directing-document.md`.

## One content class per beat

Do not ask one uninterrupted lens beat to be a macro detail, intimate portrait, and vast geographic panorama simultaneously. Use a cut, motivated camera transition, or looser exploratory instruction.

## Shot design

For each shot or segment establish:

- shot size and subject priority;
- camera height, side, and physical distance;
- operator movement and motivation;
- focus target and transition;
- lens/FOV character;
- negative space and depth layers;
- how the shot begins and ends editorially.

Write camera and subject motion separately.

## Operator behavior

Prefer physical language:

- locked at eye height;
- shoulder-mounted with weight and organic corrections;
- low tracking beside the vehicle;
- cranes as the reveal expands;
- camera stays put as subjects pass;
- orbits only while preserving a named axis/center.

Do not confuse travel speed with shake intensity. Preserve explicitly requested restless handheld instead of softening it into subtle drift.

## Single take versus controlled cuts

Use a single take when geography, performance, or physical flow benefits from continuity and the action is feasible.

Use controlled cuts when content class changes, two simultaneous reactions need coverage, a detail requires an insert, time compresses, or the editorial rhythm is the idea.

Do not describe “one continuous take” and then request multiple disconnected framings unless a physically plausible camera path connects them.

## Controlled creative freedom

In anchored/exploratory work, name the dimensions the model may vary:

```text
Keep identity, geography, action order, scale, and final state fixed.
Vary camera path and shot size within smooth motivated coverage.
```

Avoid “free camera” when strict eyelines, exact prop contact, or a single-take topology would be endangered.

## Optical signatures

Describe signatures through outcomes:

- anamorphic: oval/cat-eye bokeh, horizontal defocus character, contained source glows, edge behavior, breathing;
- spherical: round bokeh, natural geometry, more uniform focus falloff;
- vintage: lower contrast, imperfect edge response, gentle aberration, texture;
- clean modern: controlled highlights, crisp detail, restrained artifacts.

Do not stack incompatible signatures. If a location asset already carries the optical look, keep the video prompt lighter and protect it from drift.

## Style and palette

Treat style as a production bible decision. Express palette through materials, sources, and compositional role, not an arbitrary color list. Place style after identity, geography, action, optics, and light so it cannot overwrite them.

Translate a named filmmaker/cinematographer reference into observable characteristics when necessary. Do not depend on the name alone.

## Edit grammar

Name cut type only when it matters: hard, match, smash, insert, reverse, whip. Allocate enough pre/post action for the intended edit. Record the final state and the visual or audio hook into the next shot.

**Coverage and length (Last Call v2 notes, 2026-11-02):**
- **Length by information.** A shot ends when its last new information lands. A reaction hold is about 2 s. Four of Zohar's notes were "too long", including a 5 s wrist insert that read as "needlessly dramatic".
- **Inserts for stakes:** a weapon reveal or a signature hit gets its own shot (a medium close-up from the waist as the switchblade opens, then an over-the-shoulder).
- **The first shot of a new call** continues the last call's axis and shows everyone the next beat involves. A fresh angle with an attacker running in "from nowhere" broke S5.
- **Keep the leads visible.** A beat about Anastasia shows Anastasia; a dark crowded master where the leads can't be found fails.

## Audit failures

Flag:

- optics incompatible with content;
- extreme FOV without supporting visual evidence;
- compound camera moves competing in one time slice;
- camera freedom contradicting blocking;
- unjustified lens drift across internal cuts;
- stylistic camera language overriding acting or story;
- impossible travel across the requested duration;
- a first/last frame that does not support the desired camera move.
