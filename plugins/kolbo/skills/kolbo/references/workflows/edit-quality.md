# Customer edit quality bar

Read before planning any edit for a customer. The bar is "would a good agency ship this", not "it renders".
Founder review 2026-11-02: the first campaigns were correct but "not impressive enough": one title animation
everywhere, slow even pacing, a calm stock track under a trailer. Principles below are distilled from Zohar's
motion library (10 style groups, 1,800 reference clips) and the open directing notes of an award-level code-film
studio (LemoLab lemo-opuscar, MIT).

## 1. One idea, one signature moment
- Every piece has ONE thing people remember: the coffee spill, the capsules spelling the name, the before/after wipe,
  a scale reveal. Plan it first and give it the most time, sound and craft.
- Transitions come from the medium of the piece: paper tears and held frames in stop motion, film burns in a trailer,
  a wipe in a transformation, a whip in a loud social cut. One consistent grammar per piece, never default fades.

## 2. Pace has a shape
- Never one even speed. Alternate fast and slow, include one clear acceleration (trailer: 1.5 s shots down to 0.3 s
  before the payoff), and give one breath: a held moment before the payoff.
- Lock the cut to the music grid: cuts and title hits land on beats, but not every beat. One action, one sound, one cut.
- Read time beats clock time: a title holds about (letters / 15 + 1.5) s once animated in; a subtitle at least 1.8 s.
  Make it fast with fewer words per screen, never by cutting before people finish reading.

## 3. Sound is half the piece
- Three layers: music, effects tied to visible actions (every landing, pop, pour and cut has a sound from the kit),
  and room tone where people talk. Duck the music under voice.
- One near-silence right before the payoff; the first sound after it is the biggest hit of the piece.
- The track is chosen for THIS piece (genre, BPM, a drop at the payoff), never a generic easy-listening bed.

## 4. Type and graphics
- The title treatment matches the concept and changes per piece: never one title animation or font on every video. When the user has not named a style, show 2-3 looks (sample clips) and let them pick before editing.
- Fonts and colours from the brand.
- Big, few words, inside the safe area, landing on a beat. Capitals only for single-word pops and slogans.
- Never text on the same colour (red on red), never text over the subject's face, never a CTA end card.

## 5. Framing
- The product or person fills at least a third of the frame height at key moments, with a readable silhouette.
  Too small, too dark or pushed against the edge are the most common failures.
- At least three different camera moves or framings across a 15 s piece (push, pull, top shot, macro, parallax).

## 6. Not the last piece again
- Before writing the edit, compare it with the other pieces of this campaign and the last edit for this user
  (.kolbo/production.md): structure, opening, signature moment, transitions, track, ending. At least four of the six
  must differ, unless the user asked for a series.

## 7. Story films cut from generated takes
Measured on a human editor's final cut of a 2-minute emotional short against a take-by-take agent assembly, then confirmed by the editor. The middle act survived almost unchanged. The editor's main verdict on the assembly: the music and sound order was missing, which made the whole edit look bad.
- Plan sound design and the music structure as part of the edit. Flat wallpaper music under a good picture cut still reads as a bad edit.
- Get to the point. Viewers need enough beats early to stay for 2 minutes. Cut every take to its beat: in when the action starts, out when the reaction lands. Video models add about 1 s of settling. Trim or jump-cut walking, door and transit takes. The final ran 9 % shorter than the assembly.
- Take the hook from the reference. If the reference opens on the character's face, open on a close-up face in trouble within 1-1.5 s, even if the frame is borrowed from a later take. A wide establishing shot is a weaker hook.
- Plant the motive within 10 s with an insert (the photo of the person it is all for).
- Show a weakness from the inside: a POV under the line that fails, then back. Reorder shots inside a scene when the story reads better.
- Music: diegetic first, then score.
  - The setup gets world sound only: diegetic music EQ'd to sound in the world, plus room tone.
  - When the emotional story starts, switch to non-diegetic score.
- Give the score an arc mapped to the story:
  - It builds toward the sacrifice.
  - It turns to a darker section at the death or horror beat.
  - It builds under the grief beat.
  - It restarts far more minimal at the payoff.
  - Overdone music moves people less.
- Keep the dynamics: quiet scenes sit 10-15 dB under the loud peaks (LRA about 12 LU). Normalize social masters to about -14 to -16 LUFS with a gentle limiter.
- The ending: cut to a live shot, hold it about 3-4 s, fade over about 1.3 s. A long hold makes people swipe, and a freeze frame is out.
- Grade the whole film as one, on a single adjustment layer over ungraded clips. The editor's Resolve chain, in order, was: primary balance (gamma), lens distortion, a small push-in transform to hide the edges, mist or sharpen, tilt-shift edge blur, vignette, Film Look Creator, then the 1917 film LUT at reduced mix. Read a human's grade with `davinci_run_script` (`GetNodeGraph`, then `GetNodeLabel` / `GetLUT` / `GetToolsInNode` per node); slider values are not exposed. The result here was warmer, saturation +20-35 %, blacks near 0 and highlights pulled down.
- QC the generated takes for obvious defects (a wrong photo, a broken prop) and regenerate them before cutting.

## 8. Before you deliver
- Watch the render at full speed with sound, then check a contact sheet: no black frames, no text off the frame,
  no text over a face, every planned sound present, loudness about -14 LUFS.
- Drafts are footage. Never offer a finishing or upscale step unasked (lowest-cost rule).

## Look bar by style group (from the reference library)
| Group | What the good references do |
|---|---|
| Product | Real product large and lit, a light sweep or glint on the reveal, macro details, clean background in brand colour |
| Social | Hook in the first second, cuts every 0.6-1.5 s, punch-ins and big kinetic words on beats |
| Film / trailer | Letterbox, film burns, slow push then accelerating cuts, a title card held at least 4 s, a big final hit |
| Type | One typographic idea per piece (decode, stop-motion boil, type-on, highlight), timed to the music |
| Explainer | One point per screen, highlight the key word, numbers decode or count up |
| Brand | Consistent colour and type across every frame, the logo only when asked, quiet confidence |
| FX | Effects motivated by the story (a glitch on a tech reveal), never decoration |
| Broadcast | Lower thirds and tickers clean and legible, safe margins, restrained motion |
| Transitions | Built from the medium, consistent through the piece, never between two lines in one setting |
| Edit | Cuts on action and on beats, J and L cuts on voice, nothing held past its point |
