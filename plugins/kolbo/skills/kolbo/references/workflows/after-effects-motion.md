# After Effects Motion Graphics

Read this before calling `adobe_run_script` for motion graphics. Connection, approval and completion rules are in `references/workflows/adobe.md`; ordinary cuts, titles and fades belong in `adobe_edit_composition` instead of a script.

Every snippet below was run in After Effects 26.3 through `adobe_run_script`.

## Design before code

Plan the piece as beats before writing anything: what the viewer should notice first, second and last, with times.

- **Timing.** UI and title moves: 0.3–0.6 s. Logo builds and reveals: 1–2 s. Hold readable text for at least 1.5 s plus 0.3 s per word. Leave 0.5 s of breathing room before the end.
- **Easing.** Nothing real moves at constant speed. Ease into rests (`KeyframeEase` influence 70–90). Use linear only for continuous motion (spins, scrolling, constant drift).
- **Overlap and offset.** Stagger related elements by 2–4 frames (0.07–0.13 s) instead of moving them together. Let secondary elements settle after the primary one.
- **Overshoot.** A pop reads as alive when scale goes 0 → 115 → 100 within about 0.6 s. Use it sparingly: one hero element per beat.
- **Hierarchy.** One dominant element per frame. Size, contrast and motion should all agree on what matters.
- **Legibility.** Text needs contrast: dark scrim, stroke or shadow over busy footage. Keep text inside title-safe (about 10% margin: x 192–1728, y 108–972 at 1080p).
- **Restraint.** Two typefaces maximum, a palette of 2–4 colours, and one idea per shot. Remove before adding.

## Build loop

1. `adobe_get_timeline` to see what exists.
2. Write the script in named sections (background, main element, typography, outro). Name every layer.
3. `adobe_run_script` with a clear `purpose`. Return a small summary (comp name, layer names).
4. `adobe_capture_frame` at the key beats (mid-reveal, settled, outro) and look at every image.
5. Fix in a follow-up script that edits the named layers; do not rebuild everything.

## ExtendScript rules

After Effects scripting is ES3: use `var` and `function`. There is no `let`/`const`, arrow functions, template strings, `Array.prototype.forEach/map/indexOf`, or `Object.keys` - use `for` loops. `JSON` is available. The script body receives `log()` and must `return` its result.

Use property **match names** (`'ADBE Transform Group'`, `'ADBE Position'`), not display names; they work in every UI language.

## Foundation

```js
var W = 1920, H = 1080, DUR = 6, FPS = 30;
var comp = app.project.items.addComp('Logo Reveal', W, H, 1, DUR, FPS);
comp.bgColor = [0.02, 0.02, 0.05];
comp.motionBlur = true;          // also set layer.motionBlur = true on moving layers
comp.openInViewer();

function tr(layer, name) { return layer.property('ADBE Transform Group').property(name); }
// 'ADBE Anchor Point', 'ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'

// Keys with ease on every dimension (spatial properties take one ease value).
function ease(prop, times, values, influence) {
  for (var i = 0; i < times.length; i++) prop.setValueAtTime(times[i], values[i]);
  var spatial = prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
  var dims = spatial || !(prop.value instanceof Array) ? 1 : prop.value.length;
  for (var k = 1; k <= prop.numKeys; k++) {
    var e = [];
    for (var d = 0; d < dims; d++) e.push(new KeyframeEase(0, influence || 80));
    prop.setTemporalEaseAtKey(k, e, e);
  }
}
```

## Backgrounds

```js
var bg = comp.layers.addSolid([0, 0, 0], 'Background', W, H, 1, DUR);
var ramp = bg.property('ADBE Effect Parade').addProperty('ADBE Ramp');   // Gradient Ramp
ramp.property('ADBE Ramp-0001').setValue([W / 2, H * 0.4]);       // start point
ramp.property('ADBE Ramp-0002').setValue([0.16, 0.13, 0.42, 1]);  // start colour (RGBA)
ramp.property('ADBE Ramp-0003').setValue([W / 2, H * 1.25]);      // end point
ramp.property('ADBE Ramp-0004').setValue([0.01, 0.01, 0.03, 1]);  // end colour
ramp.property('ADBE Ramp-0005').setValue(2);                      // 1 linear, 2 radial
```

## Shape layers

```js
var ring = comp.layers.addShape();
ring.name = 'Ring';
var group = ring.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
var contents = group.property('ADBE Vectors Group');

contents.addProperty('ADBE Vector Shape - Ellipse').property('ADBE Vector Ellipse Size').setValue([380, 380]);
// Rounded rectangle instead:
//   var rect = contents.addProperty('ADBE Vector Shape - Rect');
//   rect.property('ADBE Vector Rect Size').setValue([900, 500]);
//   rect.property('ADBE Vector Rect Roundness').setValue(48);
// Custom path:
//   var shape = new Shape(); shape.vertices = [[-200, 0], [0, -120], [200, 0]]; shape.closed = false;
//   contents.addProperty('ADBE Vector Shape - Group').property('ADBE Vector Shape').setValue(shape);

var stroke = contents.addProperty('ADBE Vector Graphic - Stroke');
stroke.property('ADBE Vector Stroke Color').setValue([0.42, 0.55, 1, 1]);
stroke.property('ADBE Vector Stroke Width').setValue(16);
stroke.property('ADBE Vector Stroke Line Cap').setValue(2);            // round caps
// Solid fill: contents.addProperty('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue([1, 1, 1, 1]);
// Gradient fill: contents.addProperty('ADBE Vector Graphic - G-Fill') with 'ADBE Vector Grad Start Pt' / 'ADBE Vector Grad End Pt'

// Draw-on with Trim Paths (add it after the shape and stroke).
var trim = contents.addProperty('ADBE Vector Filter - Trim');
ease(trim.property('ADBE Vector Trim End'), [0.2, 1.5], [0, 100], 85);
// Endless loader: trim.property('ADBE Vector Trim End').setValue(25); trim.property('ADBE Vector Trim Offset').expression = 'time * 180';

tr(ring, 'ADBE Position').setValue([W / 2, 420]);   // shape contents are centred on the layer position
ring.motionBlur = true;
```

Overshoot pop on a second shape: `ease(tr(core, 'ADBE Scale'), [1.2, 1.55, 1.8], [[0, 0], [118, 118], [100, 100]], 70);`

## Typography

```js
var word = comp.layers.addText('KOLBO');                       // use '\r' for line breaks
var textProp = word.property('ADBE Text Properties').property('ADBE Text Document');
var doc = textProp.value;
doc.resetCharStyle();
doc.font = 'Arial-BoldMT';          // PostScript name
doc.fontSize = 190;
doc.tracking = 180;
doc.autoLeading = false; doc.leading = 110;                    // multi-line spacing
doc.fontCapsOption = FontCapsOption.FONT_ALL_CAPS;             // doc.allCaps is read-only
doc.applyFill = true; doc.fillColor = [1, 1, 1];
// Outline for busy backgrounds: doc.applyStroke = true; doc.strokeColor = [0, 0, 0]; doc.strokeWidth = 5; doc.strokeOverFill = false;
doc.justification = ParagraphJustification.CENTER_JUSTIFY;
textProp.setValue(doc);

// Centre the anchor on the visible text so Position means "centre of the text".
var box = word.sourceRectAtTime(0, false);
tr(word, 'ADBE Anchor Point').setValue([box.left + box.width / 2, box.top + box.height / 2]);
tr(word, 'ADBE Position').setValue([W / 2, 760]);
```

Per-character reveal with a text animator (characters rise and fade in left to right):

```js
var animator = word.property('ADBE Text Properties').property('ADBE Text Animators').addProperty('ADBE Text Animator');
var animProps = animator.property('ADBE Text Animator Properties');
animProps.addProperty('ADBE Text Position 3D').setValue([0, 140, 0]);   // offset while inside the range
animProps.addProperty('ADBE Text Opacity').setValue(0);
// Pop instead of rise: animProps.addProperty('ADBE Text Scale 3D').setValue([0, 0, 100]);
var selector = animator.property('ADBE Text Selectors').addProperty('ADBE Text Selector');
// Softer falloff: selector.property('ADBE Text Range Advanced').property('ADBE Text Range Shape').setValue(2); // ramp up
ease(selector.property('ADBE Text Percent Offset'), [1.6, 2.7], [0, 100], 75);
word.motionBlur = true;
```

## Effects

```js
var fx = layer.property('ADBE Effect Parade');
var glow = fx.addProperty('ADBE Glo2');                         // Glow
glow.property('ADBE Glo2-0003').setValue(70);                   // radius
glow.property('ADBE Glo2-0004').setValue(1.6);                  // intensity
fx.addProperty('ADBE Gaussian Blur 2').property('ADBE Gaussian Blur 2-0001').setValue(8);  // blurriness
fx.addProperty('ADBE Drop Shadow').property('ADBE Drop Shadow-0005').setValue(40);         // softness
fx.addProperty('ADBE Fill').property('ADBE Fill-0002').setValue([1, 0.4, 0.2, 1]);         // colour
```

## Structure, mattes and 3D

```js
var ctrl = comp.layers.addNull(); ctrl.name = 'Controller';
card.parent = ctrl;                                            // move everything together

tr(ctrl, 'ADBE Position').expression = 'wiggle(2, 12)';       // organic drift
tr(card, 'ADBE Rotate Z').expression = 'loopOut("pingpong")';  // after at least two keys
tr(ring, 'ADBE Rotate Z').expression = 'time * 24';           // constant spin

var pre = comp.layers.precompose([card.index], 'Card Precomp', true);   // returns the new CompItem

fill.moveAfter(matte);
fill.setTrackMatte(matte, TrackMatteType.ALPHA);              // reveal fill through the matte's alpha

floor.threeDLayer = true;
var cam = comp.layers.addCamera('Camera', [W / 2, H / 2]);
ease(tr(cam, 'ADBE Position'), [0, 5], [[W / 2, H / 2, -2400], [W / 2, H / 2, -1800]], 60);   // slow push-in
```

## Outro

Fade the group together over the last 0.5–0.7 s, holding the current value first so earlier animation is kept:

```js
var layers = [ring, core, word, tag];
for (var i = 0; i < layers.length; i++) {
  var op = tr(layers[i], 'ADBE Opacity');
  op.setValueAtTime(DUR - 0.7, op.valueAtTime(DUR - 0.7, false));
  op.setValueAtTime(DUR, 0);
}
return { comp: comp.name, layers: comp.numLayers };
```

## Checklist before reporting

- Captured frames at mid-reveal, settled state and outro, and looked at them.
- Text is legible over its background and inside title-safe.
- Every moving element eases; stagger and overshoot are deliberate, not everywhere.
- Layers are named and the script returned a summary the user can read.
