---
name: threejs-world-builder
description: Create coherent, explorable Three.js WebGL worlds by routing the brief to the few specialist skills it needs, a fixed render setup and a short visual check loop.
---

You are one world creator. Read this file, the [routing table](capabilities.md), and only the skills that table sends you to for this brief. Unread skills cost nothing; reading them does not improve the scene. Spend the saved time building and looking at the result.

## 1. Content first: every brief anchor on screen by minute 2

Judges decide on recognition before anything else. Before any material, lighting or polish work, place every object the brief names: from your own construction patterns when you have them, otherwise simple correctly-sized geometry, each in its correct place, with all six cameras inside the space and pointed at content. Name each brief anchor as an entry in `stats().objects` or `stats().actors` (basin, olive tree, door, cart, gate, bench, clock...). Then run the free checks (`node ./skills/threejs-world-builder/tools/check.mjs` on the CPU in seconds, then `node ./skills/threejs-world-builder/tools/inspect.mjs --sanity` on the host; no frames, never charged): it reports cameras inside meshes, cameras nose-to-surface, targets outside the scene, anchors not framed by any view, and parts of different objects that interpenetrate (a figure through a counter, a roof through a wall). Fix every reported problem before your first capture, and run it again after any camera or placement change, especially a last-minute one you cannot re-capture. A plain but complete scene beats a beautifully lit empty one every time.

## 2. Render setup: one call, matched to the brief's mood

Write a render setup module in `./world/` first. One call should give ACES output, a procedural sky baked into `scene.environment` (or a room environment for interiors), a shadowed sun fitted to your bounds, fill, fog, ambient occlusion and MSAA. Pick the `mood` from the brief's words; the defaults for the wrong mood lose to a hand-tuned sun.

```js
import {setupOutdoorRendering, setupInteriorRendering} from './render-preset.js';
const bounds=new THREE.Box3(new THREE.Vector3(-12,-1,-12), new THREE.Vector3(12,8,12)); // the area that matters
const rig=setupOutdoorRendering(scene, camera, {canvas, bounds, mood:'late-afternoon'});
// moods: 'clear-day' | 'late-afternoon' | 'golden-hour' | 'overcast' | 'after-rain'; override any field, e.g. {mood:'overcast', exposure:0.55}
// interiors/night: setupInteriorRendering(scene, camera, {canvas, bounds, envIntensity:0.2}) plus your own lamps with castShadow=true
// ...build the world, then:
rig.finalize();                       // shadows on every mesh, anisotropy on every texture
function frame(){ rig.render(); }     // never renderer.render directly
window.worldTest={..., renderer:rig.renderer, render:rig.render};
```

Bloom is off; leave it off. If a capture is too bright, lower `exposure` only (0.35–0.45); lowering sun and env as well flattens the image to grey. Sunlit light plaster should sit just below white and shade must read clearly darker.

## 3. Then materials, assemblies, activity

1. **Ground and envelope.** A paved floor is slabs with joints, never one smooth field: a `createMasonry({unit:[0.6,0.4], joint:0.012, relief:0.004})` factory in your masonry module, or soil/aperiodic ground for earth. Walls with real thickness. Openings are holes with reveals and something visible beyond: a passage needs its own floor, side walls and a shaded end wall; an opening onto bare sky renders as a white hole. Write a `wallWithOpenings` builder that cuts real reveals.
2. **Material families.** a `createSurface` factory in your surface module (stone, plaster, masonry, timber, terracotta, metal, leather, soil) with `metricBoxUV`/`metricCylinderGeometry`. API facts that cost builders captures: `tileMeters` is a two-element array `[x,y]`; `color` is `[r,g,b]` in 0–1, not a hex; `metricBoxUV` rejects curved geometry (leave those on their own UVs). Adjacent families must not share one treatment.
3. **Hero assemblies.** Parts meet, rest on and attach to each other; a support-frame utility for placing on transformed surfaces.
4. **Activity.** Deterministic state from `setTime`; a causal-state utility (`transferAt`) for transfer/settle timing. Make sure at least one declared view and the sampled times (0, 24, 64 s) frame the action, or judges cannot credit it.
5. **Second capture, then fix the worst visible thing** in this order: a missing anchor, a camera inside geometry, blown or black regions, floating or intersecting objects, openings that do not read as holes, flat untextured surfaces, missing shadows. Submit a running world before the clock ends.

## 3b. What the strongest builds do (measured, not opinion)

The best-graded builds differ from the rest in density and cohesion, not in extra reading. Do all of these in every world:

1. **Envelope built from parts, then context beyond it.** A floor is individual slabs or cobbles (an `InstancedMesh` of a rounded block with per-instance colour and a few millimetres of jitter; 10,000 instances cost nothing), not a plane. Walls have thickness, a plinth course and a plate; interiors get joists and boards overhead; roofs are overlapping slate or plank rows, not one slab. Beyond the stage, something continues to the horizon: distant ground, a hedge line, a fence, low hills, sky. A frame that ends at a bare plane edge grades as unfinished.
2. **Every surface carries structure at the distance it is seen.** Materials come from the surface factory with the relief, roughness and variation set per family and a metric tile size; every box goes through `metricBoxUV` with its world offset so courses run continuously across members. Ground within five metres of any camera carries grit, straw, pebbles or joints, never a flat colour field (the surface factory now adds a fine structure layer to plaster, stone, masonry, soil and timber by default; keep it, and add coursing, planks or wear on top). Fruit skins, fur and cloth prints are tiny baked canvases, not flat hex colours.
3. **One deliberate light design.** Outdoors: choose the sun azimuth so shadows fall toward the hero view and the elevation so the main facade is lit, then set exposure once (0.5 to 0.6 in daylight). Indoors: the interior setup plus two motivated sources with shadow maps, a warm local source (fire, lamp, forge) and a cool daylight spot through the door or window, exposure around 0.8, and something lit beyond every opening. Crushed blacks and an unlit doorway are the two most common failures; `wallWithOpenings` puts a shaded room behind every opening by default, but a door the brief calls open still needs a lit yard or street built beyond it.
4. **Props are assemblies with fixings.** An anvil is body, face, horn, heel and feet on a banded stump; a tool rack is a rail with pegs and nine distinct tools; a scale has a beam, chains and turned pans; a basket is woven rings and struts; a crate has planks with gaps and end grain. Bolts, nails, bands and ties are instanced spheres and cylinders where wood meets iron. A tub of water is a physical material with transmission, thickness and an attenuation colour.
5. **People carry, reach and hand over.** Build people and animals from the living patterns; give each a seed and a distinct look; parent every carried object to a hand with `hold`, move hands to counters, racks and each other's hands with `reach`, pass objects with `release`, and keep strides locked to `distance`. Resculpt a pattern (a sleeping cat from the quadruped) rather than stacking primitives.
6. **Check on the CPU before you spend a look.** `node ./skills/threejs-world-builder/tools/check.mjs` loads the world without a GPU and reports non-finite geometry, seek determinism, static scenes, unframed anchors and cameras inside meshes in a few seconds. Run it after every edit; spend rendered looks only on what it cannot see (materials, light, silhouettes), and ask each look for several times at once (`--times 0,24,48,80`).
7. **The result must be visible at the end.** Whatever the brief says is handed over, set down, stowed or kept must be where it ends up at the last sampled time, parented to its final owner (basket, deck, rack) and in the action view unoccluded. The CPU check prints a custody line for every moving object; read it against the brief before the last look. A loaf still on the counter at 64 s, or hidden behind a back, scores the whole action as never having happened.
8. **Fix what the look shows, in order:** a too-even or shaded facade (turn the sun), a blocky silhouette on the nearest animal or figure (resculpt), coarse texture scale (retile), then contact and clutter.

## 4. Your modules

Write your modules into `./world/` and import them relatively, one module per concern: render setup, surfaces (+ a PBR baker), masonry, ground, wall openings, support frames, causal timing, and the construction patterns.

Modules to write, each seeded so no two pieces match: render setup (required); surfaces with a PBR baker; masonry; aperiodic ground; wall openings; support frames; causal timing; and construction patterns: planked panel, frame + hinge, legged top, lathe, hollow vessel, spoked wheel, jointed limb, lofted hull, canvas over posts, cluster fill, and the living patterns: a skinned jointed figure (person with coat/apron/hat/dress options), a quadruped (dog, horse; scale the shoulder for cat, sheep, cow) and fowl (hen, rooster), each with a deterministic `pose(t)` gait. Use these for every person and animal instead of stacking capsules. When something walks, its stride must match its motion: pass `distance` (metres travelled so far along its path) to `pose`, or move it with a walk routine that does this. A figure whose legs cycle at one rate while it slides across the ground at another is the most visible animation defect there is. Likewise nothing is ever carried beside a hand: give the figure `hold(obj,{hand})` so the object rides in the hand and the arm is posed around it, `reach` to put a hand on a counter, rack or lever, and `release(obj,newParent)` for hand-overs. Compose props (workbench, crate, sack, barrel, bucket, door, window, cart, trough, boat, stall) from those patterns; do not build them from raw boxes. Never import from `./skills` in browser code; the world must run from `./world/` alone.

## Checking your work

`node ./skills/threejs-world-builder/tools/inspect.mjs --sanity` is free and takes seconds: it loads the world and reports cameras inside meshes, nose-to-surface cameras, targets outside the scene and anchors no view frames. `node ./skills/threejs-world-builder/tools/inspect.mjs --views 0,4,5 --times 24` returns native frames under `./inspections/`; open them and fix the worst visible thing. Both need the project's `three`, `vite` and `playwright-core`.

## 5. Style

Honor an explicit style: stylized proportions, palettes and flat shading are choices, carried consistently through shape, surface, light and motion. With no style stated, aim for a world that could be photographed. Do not substitute a toy scene for a realistic brief.
