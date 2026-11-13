# Seedance 2.5 Craft — Takes That Read As Real Footage

Craft rules for live-action Seedance 2.5 takes, learned from many paid retakes. Load with [seedance-2-5.md](references/models/seedance25.md), which owns the hard format contract (headers, Total lines, timecodes, no music by default, no famous names). This file covers what makes a take read as filmed, not generated.

## Prompt block shape

Write one fenced prompt in this order. Each block holds only what belongs to it.

```text
Single continuous shot, 6s total, 9:16
Total: 6s / 1 shot / 9:16

[GLOBAL LOOK – LOCKED]
<medium statement + light + colour; only what is true for the whole take>

[CAST – IDENTICAL IN EVERY SHOT]
@hero: looks exactly as in the sheet, same outfit and hair: <every piece head to toe>. Attitude: <one line>.
<each extra as text with a role word and a small task of their own>

[PRODUCTS]
@prop: the real <product> exactly as in its reference photos, held in <hand>, visible the whole take.

[LOCATION]
From the attached location image: <place>, <scale>, <where the light comes from>.

[CAMERA]
<who is filming, where they stand, why they are there, how they move>

SHOT 1 — 0:00–0:06
0:00–0:01 <action already in progress at frame one>
0:01–0:03 <one action>
0:03–0:05 <the payoff, held>
0:05–0:06 <aftermath>

AUDIO: No music. No musical score. Production sound only: <real sources>.
AVOID: <behaviours that failed before>
Total: 6s / 1 shot / 9:16
```

- **GLOBAL LOOK** holds only what is true in every frame. A one-time event (a flash, a crash) goes only in its own beat.
- **Medium, not adjectives.** "Footage recorded on a cheap consumer camcorder" works. "Cinematic", "crisp", "high quality" pull the image toward a glossy ad. Describe light by what it does to the image ("near faces lit evenly by an on-camera light, background mid-grey and readable"), not by mood. "Falls off into darkness" renders a moody film still.
- **Texture comes from the edit.** Seedance renders clean. Tape noise, VHS colour bleed and grain are a post filter, never prompt text. Never write "film damage" or "weathered film".
- **Character line in full, every time.** Paste the complete wardrobe and look line in every prompt that uses the person. A short line drifts the face across takes.
- **Reference roles.** One line per attached material: "@Image1 = the location only. Ignore any people, pose or lighting in it." A reference without a role leaks its people or background into the take.

## The camera is a person

- Write the operator as a character with a reason to be there: "filmed secretly by someone hiding behind a pillar", "a friend walking two steps behind with a phone", "a crew member running with the hero". "Camera moves closer" gives a dolly. "The operator steps in, handheld" gives a person.
- Give the camera a travel verb in every shot. "Handheld" alone often renders a locked frame. Describe the operator's steps, small tilts and breathing.
- Write in-shot moves with time and size: "0:00.6–0:01.2 a sudden zoom from the whole room to the two of them". Zoom numbers overshoot, so ask one step smaller than you want. "Crash zoom" reads cheesy.
- Measure the reference before writing motion words. A reference that a vision model calls "smooth" can be constant shake. Never paste "smooth", "steady", "balanced" or "locked-off" for found footage.
- A camera body in the scene gets drawn. Write "we see only what the lens records".
- Decide who looks into the lens and when, and write it. Observer footage: "No one ever looks at the camera; everyone acts as if nobody is filming", plus an eye target per beat. Caught-on-camera gags: the person who notices the filmer looks straight into the lens at that beat.

## A populated world

- Name every extra and give each one a small task: a cashier counting change, a guard checking a phone, two shoppers comparing labels. Extras without a task stand frozen.
- Count people per shot from the reference and write the number. "Busy" is not a number.
- Whether bystanders react to the gag is a decision for the piece, never a default. If they ignore it, it is an ordinary day for them and only the hero reacts. If they react, write how (duck, run, film it, call for help).
- Something is already moving at frame one. An empty set with a slow push renders as an animated still.

## About one second per action

- One simple physical verb per beat, about 1 s of screen time each. Three or four actions in 6–7 s come out deformed or play as fast-forward.
- Word count is screen time. An instant gets one clause. Never describe the top of a jump (it hovers).
- The payoff reads from one frozen frame, held at least 1 s.
- Cause and effect in one frame, on the same beat, cause first.
- Too slow: add one small beat; never stretch the beats you have. Too fast: remove a beat or lengthen the take.
- Write escalation (small, worse, worst) and end while it is still escalating.
- Real time only. Slow motion is an edit operation, never prompt text.
- Write every character's state at frame 0 (asleep or awake, who holds what). Otherwise the take starts mid-action.
- Pin each contact action to its exact target and name the wrong one: "kisses the middle of her cheek, high on the cheekbone, well away from the mouth". "Kisses her cheek" can land on the mouth.

## Real sounds only

- `No music. No musical score.` in every take unless music was asked for. Music goes in the edit. When chimes or humming still appear, use the full sentence: "No music at all, no singing or humming, no background score, no musical tones, no chimes or magical sound effects, only real room sounds."
- Short real words ("mama", "Papa!") render cleanly, even in animation. Use gibberish only for longer lines that must stay unreadable.
- Name the real sources in the scene: footsteps on tile, a till drawer, traffic through glass, fabric rustle, breath.
- No fantasy sound effects (sparkles, whooshes, magic). No glow or sparkle visuals either.
- Readable text (a sign, a board) is spelled in the prompt, twice ("OPEN LATE", O-P-E-N L-A-T-E), and checked in QC. Re-roll on a miss.

## AVOID holds behaviours, not objects

- Name a behaviour you saw fail and its fix: "no one turns toward the lens", "the cart keeps rolling forward, never sideways", "hands stay on the handle".
- Never name an object or shape you do not want. The model draws what it reads, so "no hat" can add a hat. Write the positive version in the beat instead ("bare head, short hair").
- Never put the hero and a forbidden prop in one sentence.
- Only list failures that happened or that the reference proves. A long generic AVOID list dilutes the prompt.

## Retakes

- A defect seen once (a melted hand, one morphing prop) gets the same prompt re-rolled.
- A defect seen in two takes gets one prompt fix. Change one variable per retake and log it.
- If two prompt fixes fail, rebuild the reference (location image, sheet, product photo), not the words.
- Once a sentence renders a mechanic right, reuse it word for word.
