# Routing table

Read the core row for every scene. Read a specialist row only when its trigger appears in the brief or in the world you are actually building. Skip everything else.

| Read when | Skills |
|---|---|
| **Every scene (core)** | the build order in SKILL.md: anchors placed and named first, sanity check, render setup by mood, surface families with metric UVs, six declared views, activity as a pure function of time; then looks and fixes |
| Buildings, walls, roofs, openings | walls with real thickness from `wallWithOpenings` (reveals, something visible beyond every hole), masonry or plaster families, roofs as planked panels on rafters, doors and shutters from `plankedPanel` + `frame` + `hinge` |
| Rooms, workshops, bounded courtyards | an envelope with a floor, walls and ceiling, `setupInteriorRendering` plus one shadowed lamp or a window shaft, the camera clamped inside, benches and racks from `leggedTop`/`plankedPanel` |
| Outdoor daylight, weather, time of day | `setupOutdoorRendering` with the mood the brief names (clear-day, late-afternoon, golden-hour, overcast, after-rain); turn the sun azimuth so shadows fall toward the hero view; change exposure only, never sun and env together |
| Ground beyond a paved floor, hills, dunes | `createAperiodicGround` (with its close-range detail layer) on a displaced `PlaneGeometry`; contours from low-frequency noise; no visible tiling and no flat colour field within five metres |
| Trees, shrubs, grass, ferns | trunks as tapered cylinders with lathe crowns or clustered spheres; grass as instanced blades or cards no taller than 0.3 m near the camera, seeded; hedges as `clusterFill` at bush scale |
| Any water: basin, river, sea, puddles | a displaced plane (two swell wavelengths) with a physical material (clearcoat, environment reflection); real bank or quay edges, hull draft below the waterline, a wake or ripple where something moves |
| Glass, mirrors, wet or polished surfaces | `MeshPhysicalMaterial` with transmission for panes and low roughness for wet stone; window glass over a dark interior plane so it reads as a hole, not sky |
| Wear, rain, dirt, age | raise `variation` on the surface families, darken contact edges and lower courses, puddles as low-roughness discs after rain; no uniform grime |
| Hand props, tools, furniture, set dressing | compose from your construction patterns, seeded|
| Signs, posters, stains, markings | thin planes with baked canvas textures (`bakePBRFields` with your own sample function) placed a few millimetres proud of the wall |
| Smoke, fire, dust, rain, fog volumes | `Points` or sprite quads with additive material for embers and sparks, a soft emissive core for fire, `FogExp2` from the render setup for haze; keep particles small and few |
| People or crowds | your skinned figure pattern: one skinned body with fabric-textured clothes. Give each person what the brief implies: `body:'f'`, `child:true`, `dress:{color,pattern}`, `coat`, `apron`, `shorts`, `topPattern` (stripes/check/dots/floral), `collar`, `hat:{kind}`, and a different `seed` each so faces, hair and fabrics differ. Move it with your walk routine or pass `distance` to `pose` so the feet plant|
| Animals | your quadruped pattern (dog, horse; a shoulder height scales it to cat/sheep/cow) and fowl pattern (hen, rooster)|
| Vehicles, carts, boats | a lofted hull and a spoked wheel pattern|
| Streets, districts, road networks | masonry setts or soil for the road, kerbs as low planked or stone runs, buildings as envelopes with openings; only what the six views can see |
| Cloth, flags, hair, rope | `garmentMaterial` fabrics (sheen, print patterns, hem sway) for cloth; rope as a `TubeGeometry` along a catenary `CatmullRomCurve3`; hair from the figure pattern styles |
| Falling, colliding, pushed objects | no physics engine: `transferAt` for approach/transfer/settle timing, identities preserved, every visual sampling the same state |
| Camera moves, depth of field, specific lens | six declared views at eye height (about 1.6 m) with 35 to 50 mm lenses; the action view framed on the moving thing at the sampled times |
| Animated scenes with seekable time | all state a pure function of `t` so `setTime` seeks both ways; strides from `distance`, hand-overs through `hold`/`release`, activity visible at 0, 8, 16, 24, 36, 48, 64 and 80 s |
| Explicit stylization requested | keep the same construction; change palettes, roughness and outline only if the brief asks; a stylized scene still needs anchors, contact and lighting that read |
| Reconstructing a named real object/place | treat as fictional unless the brief supplies references; disclose invented staging in your account |
| Worlds larger than ~200 m or many chunks | out of scope for one generation: build the bounded stage the six views see and fade the rest with fog |
| Rarely needed in a single generation | skip: navigation aids, LOD/streaming, performance profiling, accessibility layers |

The source numbering has no 17 or 18.
