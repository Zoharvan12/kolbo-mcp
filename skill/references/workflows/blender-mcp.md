# Blender MCP Scene Craft

Read this reference whenever the user wants an agent to inspect, build, block,
animate, light, render, or modify a live Blender scene through the Kolbo Blender
plugin. This is Blender work, not AI video generation: do not ask for a model,
project, aspect ratio, or credit confirmation unless the request also includes a
paid Kolbo media generation.

## Connection and execution boundary

- Discover the user's connected Blender sessions first. If there is more than
  one, identify the intended file/session from the returned name and scene
  summary rather than guessing.
- Read the scene before editing it. Start with a compact summary, then inspect
  only the relevant objects, collections, cameras, materials, and timeline.
- Prefer validated structured scene operations. Use Blender Python only when the
  requested result cannot be expressed structurally; Python has full machine
  authority and requires explicit approval unless trusted mode is active.
- Ordinary reversible construction and animation can execute directly. Deletion,
  file open/overwrite, arbitrary paths or URLs, add-on installation, and Python
  remain approval-gated.
- Keep edits in one undoable batch where the tool supports it. Never save,
  overwrite, open another file, or render an entire animation unless requested.

## Scene construction rules

- Preserve existing work unless the user explicitly asks to replace it. Put a
  new build in a clearly named collection and use stable descriptive names.
- Respect the scene unit system. Blender defaults commonly represent meters, but
  inspect the actual unit settings before creating dimensioned objects.
- Build recognizable assembled objects, not symbolic blocks. A chair needs a
  seat, back, and visible supports or legs; a table needs a top and believable
  supports; doors, lamps, shelves, vehicles, and props need the parts that make
  their silhouette and function readable.
- Objects and datablocks are separate. Check whether mesh or material data is
  shared before editing it; make it single-user when only one instance should
  change.
- Prefer non-destructive modifiers for adjustable geometry. Apply destructive
  mesh edits only when the result needs to be final or the user asks for them.
- When raw Blender operators are required, set Object/Edit mode, active object,
  and selection explicitly. Operators can silently fail or affect the wrong
  object when context is inherited from the viewport.
- Capture object references immediately after creation. Blender may suffix names
  on collision, so do not assume a requested name was accepted unchanged.

## Shots, cuts, and camera motion

A request for multiple shots means a real timeline sequence, not several unused
cameras:

1. Set a deliberate frame range from the scene FPS and requested duration.
2. Create one camera per hard-cut shot unless the user explicitly wants one
   continuous take.
3. Bind each shot camera to a timeline camera marker on the exact first frame of
   that shot.
4. Make the opening camera active and verify every requested cut by scrubbing the
   boundary frames.

Never interpolate one camera through a hard cut. A cut is the marker switching
from one camera to another; animation belongs inside each shot.

For camera movement inside a shot:

- Keyframe both location and rotation at the first and last movement frames.
- Use `LINEAR` interpolation by default for a constant-speed dolly, truck, crane,
  orbit, push-in, or pull-out. Blender's automatic Bezier handles can ease or
  overshoot unexpectedly and make continuous motion accelerate near keyframes.
- Use `BEZIER` only when the brief explicitly calls for easing, a soft settle, or
  an authored speed ramp. Inspect the curve for overshoot.
- Use `CONSTANT` only for intentional holds or stepped animation, never to fake a
  camera cut.
- Keep a lock-off truly static. Do not add redundant drifting keyframes.
- Keep the camera aimed at the intended subject throughout the move. Verify the
  midpoint as well as the endpoints; two acceptable endpoints can still produce
  a bad path through geometry.
- Respect the camera's rotation mode. Structured operations use Euler radians;
  raw Python should inspect the existing mode before choosing Euler or quaternion
  keyframes.
- For a dolly zoom, animate lens and camera distance together. Do not call a
  location-only push-in a dolly zoom.

## Blocking and animation quality

- Establish readable contact and weight: feet meet the floor, chairs meet the
  ground, tableware sits on the tabletop, hands meet held props, and objects do
  not visibly interpenetrate unless intentional.
- Keyframe after setting the transform for that frame. Keyframe every channel
  needed to preserve the pose; missing rotation keys commonly cause unwanted
  interpolation.
- Do not add animation merely because the scene has a timeline. Animate only the
  requested subjects and cameras.
- For repeated motion, prefer a clean reusable cycle or duplication of verified
  keys over noisy frame-by-frame keys.
- In armature work, confirm the target bones are not constraint-driven before
  keyframing them. Constraints can override apparently valid animation.

## Materials, lighting, and presentation

- Give hero surfaces deliberate materials with plausible roughness and metallic
  values. Reuse shared materials for related parts instead of creating a material
  per primitive.
- Light for form and subject separation. A practical starting rig is a motivated
  key, softer fill, and optional rim or practical light; adapt it to the requested
  mood rather than mechanically adding three lights.
- Check render visibility separately from viewport visibility when an object
  appears missing.
- Set an appropriate camera lens and composition. Avoid placing a camera without
  checking framing through a viewport capture.

## Verify before reporting completion

After applying edits:

1. Re-read the scene and confirm the expected object, collection, camera, marker,
   frame-range, and animation counts.
2. Capture the viewport or a low-cost preview from the active camera.
3. For animation, inspect the first frame, every cut boundary, one midpoint per
   moving shot, and the final frame. Confirm interpolation is the intended type.
4. Correct concrete failures before reporting success. Do not say a scene is
   animated merely because keyframes exist.
5. Report what actually changed: named collection, object count, shot cameras,
   cut frames, animated channels, and any approval still waiting.

For complex Python work, return concise structured results from Blender rather
than dumping console output. Update the dependency graph before reading computed
transforms or modifier results, and inspect progressively instead of returning an
entire large scene.
