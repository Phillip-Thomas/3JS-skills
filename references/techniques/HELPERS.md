# Helper signatures (copy the ones you use from ./references/techniques/ into ./world/ and import relatively)

CPU check, no GPU, free: `node ./skills/threejs-world-builder/tools/check.mjs [--world ./world] [--times 0,8,16,24,36,48,64,80]` → finite geometry, deterministic seek, activity across sampled times, every anchor framed, cameras clear. Run it after every edit; rendered looks are for materials and light.

All distances in meters. `tileMeters` is always `[x,y]`. Colours: surface-materials takes `[r,g,b]` in 0–1; characters.js and props.js accept `0xRRGGBB`, `[r,g,b]` or a `THREE.Color`.

```ts
// render-preset.js
setupOutdoorRendering(scene, camera, {canvas, bounds:Box3, mood:'clear-day'|'late-afternoon'|'golden-hour'|'overcast'|'after-rain', aoRadius?=0.5, fog?=true, bloom?=false, ...overrides})
  → {renderer, env, sun, skyFill, post, render(), setSize(w,h), finalize()}   // call finalize() after building; expose render as worldTest.render
setupInteriorRendering(scene, camera, {canvas, bounds, exposure?=1, envIntensity?=0.3, aoRadius?=0.35, bloom?=false}) → same shape (no sun; add your own lamps with castShadow=true)
createSkyEnvironment(scene, renderer, {elevationDeg, azimuthDeg, turbidity, envIntensity}) → {sky, sun:Vector3, update(next), envMap}
createRoomEnvironment(scene, renderer, {intensity})           createSunLight(scene, dirVec3, {intensity, color, bounds, mapSize, radius})
fitShadowToBounds(light, dirVec3, box3)   createSkyFill(scene, {intensity})   addAtmosphere(scene, {color, density})
enableShadows(scene)   applyTextureDefaults(scene, renderer)   createPostChain(renderer, scene, camera, {aoRadius, aoBounds, bloom})

// surface-materials.js  (+ pbr-fields.js dependency)
createSurface({kind:'stone'|'terracotta'|'metal'|'leather'|'timber'|'cloth'|'linen'|'wool'|'twill'|'masonry'|'plaster'|'wood'|'soil', color?, tileMeters?, seed?, resolution?=512, detail?=true (plaster/masonry/stone/soil/wood/timber get a seamless 1–5 mm structure layer so they read at arm's length; detailStrength? 0–1), pattern?:{type:'stripes'|'check'|'dots'|'floral',color2:[r,g,b],color3?,scale?,width?} (cloth kinds),
               grainMeters?, relief?, roughness?, variation?, alloy?:'brass'|'steel'|'copper', turning?}) → MeshStandardMaterial  (material.userData.surface.tileMeters)
metricBoxUV(geometry, tileMeters, offset?=[0,0,0]) → geometry        // axis-aligned flat faces only (BoxGeometry, PlaneGeometry before rotation); throws on curved
metricCylinderGeometry(radius, height, tileMeters, radialSegments?=64) → geometry
inspectSurface(mesh, {tileMeters?, tolerance?, instanceIndex?}) → issues[]

// procedural-masonry.js
createMasonry({unit:[w,h]=[.42,.22], joint=.009, relief=.005, edgeWear=.002, faceRelief=.0015, color, seed, resolution}) → MeshStandardMaterial

// metric-surface.js  (shader-projected metric mapping for scaled, static, flat, axis-aligned meshes)
metricSurface(material, {tileMeters?, metersPerUnit?=1}) → material     inspectMetricSurface(mesh) → issues[]

// aperiodic-ground.js
createAperiodicGround({spanMeters, origin?=[0,0], resolution?=1024, seed?, color?, detail?=true}) → MeshStandardMaterial   // large natural ground without tiling; `detail` adds seamless 1–10 cm grain/stones so it still reads as earth at one metre (applyGroundDetail(material,{spanMeters,tileMeters=0.8,strength=0.55}) for your own ground material)
groundField({seed, color, minWavelength}) → sample(x,y)

// wall-openings.js
wallWithOpenings({width, height, depth, openings:[{x, bottom, width, height}], material, backing?='interior'}) → Mesh   // local: x∈[-w/2,w/2], y∈[0,h]; real reveals; by default a shaded room box sits behind each opening on -z so it never opens onto sky or void (backing:'none' when you build the space beyond; backing:{side:1} if inside is +z)

// support-frame.js
supportMatrix({point, normal, heading, contacts?, scale?}) → Matrix4     setWorldMatrix(object, matrix)     contactDistances(object, contacts, plane) → number[]

// characters.js  (people and animals; each returns a Group with userData.pose(t, opts); origin at the feet, faces +Z)
createHumanoid({height=1.75, skin, hair, top, trousers, boots, build=1, coat?, apron?, hat?, seed}) → Group (= parts.jointedFigure); g.userData.pose(t,{walk:0..1, speed=1.2, lean}) ; g.userData.parts.carry is an attach point for a held prop
walkBetween(g, aVec3, bVec3, progress0..1, t, {speed}) → moves, faces and animates the walk cycle with the stride locked to distance (progress 0/1 = standing)
walkAlong(g, [Vector3,...], distanceTravelled, t) → same along a polyline; drive `distanceTravelled` from your timeline (e.g. speed × elapsed) and the feet plant
createQuadruped(opts) = parts.quadruped(opts)     createHen(opts) = parts.fowl(opts)

// parts.js  (construction patterns every prop is composed from; imports surface-materials.js + pbr-fields.js, so copy those three together; compose objects that are not in props.js the same way. Every pattern takes `seed` and varies proportions/finish.)
garmentMaterial(kind:'cloth'|'linen'|'wool'|'twill'|'leather', color, seed, {repeat=5, pattern?, sheen?, sway?}) → cached baked fabric (MeshPhysicalMaterial with sheen) or leather tinted to color, maps repeated for figure-scale UVs; `pattern` prints stripes/check/dots/floral; `sway>0` returns a clone with a hem-weighted vertex sway (set userData.sway.uTop/uHem for the mesh's local frame, drive userData.sway.uTime per frame) (jointedFigure uses it on every garment; use it for cushions, sacks, awnings, saddles)
rng(seed) → r()   vary(r, base, pct)   toColor(c, r?, shift?)   std(color, roughness, metalness, r?) → MeshStandardMaterial   box(w,h,d,mat,x,y,z)   cyl(rt,rb,h,mat,x,y,z,seg)   mesh(geometry,mat,x,y,z)   group(name,...kids)
plankedPanel({width,height,thickness,planks,gap,material,seed,vertical}) → Group (origin bottom-left; doors, gates, crate sides, decks, fences)
frame({width,height,depth,memberWidth,sill,material,seed}) → Group (jambs + head [+ sill]; origin floor centre of the opening)
hinge(leaf, {open, side, width}) → pivot Group with userData.setOpen(rad)
leggedTop({width,depth,height,topThickness,legs:4|3,legSize,apron,topMaterial,legMaterial,seed,round}) → Group (tables, benches, stools; userData.top)
lathe({profile:[[r,y],...],material,segments,seed,jitter}) → Mesh (pots, buckets, barrels, bowls, bollards; userData.height/rimRadius)
vessel({length,width,height,wall,legHeight,material,legMaterial,seed}) → Group with a real cavity; userData.inner={length,width,floorY,rimY} (troughs, basins, tubs)
spokedWheel({radius,spokes,rimWidth,material,rimMaterial,hubMaterial,seed}) → Group in the XY plane (axle along Z)
limb({radius,length,material,down}) → pivot Group with the segment hanging below (nest for knees/elbows)
loftedHull({length,beam,depth,sections?,thwarts,material,strakeMaterial,seed}) → Group; userData.deckY/length/beam (boats; origin at waterline centre, bow +Z)
canvasOver({width,depth,height,sag,pitch,valance,material,postMaterial,seed}) → posts + sagging sheet + valance (awnings, stall roofs, tents, tarps); userData.height
clusterFill({length,width,radius,count,layers,material,seed,squash}) → packed rounded items filling a footprint (apples in a crate, stones, fish, cargo); userData.top
jointedFigure({height?,build,body:'m'|'f',child?,skin?,hair?,top,topPattern?,collar?,sleeves:'long'|'short'?,trousers,shorts?,dress?:{color,pattern?,length?=0.6,flare?},boots,coat?,apron?,hat?,hairStyle?,facialHair?,accessory?,seed}) → one skinned body (SkinnedMesh tubes on a 17-bone skeleton with blended joint weights): shirt, sleeves, trousers, dress bodice + skirt, coat and apron are continuous skinned surfaces that bend with the limbs; skirts are weighted to the legs so they never pass through; boots, hands and the face are rigid parts on the bones. Origin at feet, faces +Z. userData.parts.bones/skeleton expose the rig (hips, spine, chest, neck, head, thigh/shin/foot ×2, upperArm/foreArm/hand ×2) for your own poses.
  HANDS AND PROPS (use these; a basket or bucket must never float beside a hand):
  g.userData.hold(obj, {hand:'right'|'left'|'both', offset?, rotation?}) → parents obj to the hand and curls the fingers round it; without `offset` the object's TOP (a handle, a haft, a rim) is placed in the palm and the rest hangs below, so build carried props with the grip at the top of their bounds (two-handed loads sit between the hands)
  g.userData.release(obj, newParent) → hands it off keeping its world transform (a loaf into a basket: figure.userData.release(loaf, basket))
  g.userData.reach(worldVec3, {hand}) or pose(t,{reach:{hand,target}}) → two-bone IK puts that hand on the point (reaching to a counter, a rack, another person's hand, a bellows lever); call inside your timeline with the target you animate Leave skin/hair/hairStyle/facialHair/accessory unset and the seed picks them (SKIN_TONES, HAIR_COLOURS, styles short|cropped|fringe|long|bun|bald, facial none|stubble|beard|moustache, accessory none|belt|scarf|satchel|glasses|cap); set any of them for a specific person. `hat` = colour for a brimmed hat, or {kind:'brim'|'straw'|'cap'|'beanie'|'scarf', color}. Garments are baked fabrics with sheen; `topPattern`/`dress.pattern` = {type:'stripes'|'check'|'dots'|'floral', color2, color3?, scale?=0.03 m, width?=0.5} (a striped polo: topPattern stripes + collar:true; a floral dress: body:'f', dress:{color, pattern:{type:'floral',color2,color3}}; a boy in denim shorts: child:true, shorts:true). Dresses and coat skirts sway in the vertex shader from pose(t); userData.pose(t,{walk:0..1, distance?, speed, lean}); userData.parts.carry attach point. ALWAYS pass `distance` (metres travelled so far) when the figure moves: the stride is then locked to the ground and the feet never slide; `speed` is only used when distance is unknown
quadruped({kind:'dog'|'horse',coat,coat2,shoulder?,seed}) → barrel + chest/haunch masses, jointed neck/head, four legs with hooves, tail, mane (horse); pose(t,{walk,distance?,speed,headDown:0..1,tailSwish}) (pass `distance` when moving, as for the figure). Scale `shoulder` for other animals (cat ≈0.25, sheep ≈0.7, cow ≈1.35)
fowl({plumage,comb,beak,height=0.35,rooster?,seed}) → hen or rooster with wings, comb, wattle, beak, eyes; pose(t,{walk,peck:0..1,distance?})

// props.js  (compositions of parts.js; each takes `seed` — different seeds, different proportions/plank counts/bands/finish. Origin at floor contact, faces +Z; pass materials:{wood,darkWood,metal,brass,stone,cloth,glass,terracotta,leaf,iron,leather,paper} to reuse your createSurface() materials)
createWorkbench({width=1.8,depth=0.7,height=0.85,drawers=2})   createTable({width,depth,height})   createStool({height=0.45})   createBench({length=1.4,height=0.45,kind:'stone'|'wood'})
createCrate({width,height,depth,open})   createSack({height=0.55,fill})   createBarrel({height=0.85,radius=0.3})   createBucket({height=0.3})   createPlantPot({radius=0.18,height=0.28,leaves=14,plantHeight=0.45})
createDoor({width=0.95,height=2.1,open:rad,bands=3}) → g.userData.setOpen(rad)  (frame + threshold step included; put it IN a wall opening of the same size)
createWindow({width=0.9,height=1.1,cols=2,rows=2,glow}) → frame, sill, mullions, emissive pane (set into a wall opening)
createTaskLamp({reach=0.45,color,intensity=6}) → g.userData.light (shadowed PointLight)   createHandTools() → screwdrivers, tweezers, loupe on a surface
createWallClock({diameter=0.36,pendulumLength=0.45,secondsPerHour=60}) → g.userData.setTime(t) drives hands and pendulum (call from your setTime)
createHandCart({length=1.4,width=0.8,wheelRadius=0.35,load=3,seed}) → g.userData.roll(distanceMeters) turns the wheels   createGate({width=1.0,height=1.1,open,seed}) → g.userData.setOpen(rad)
createTrough({length=1.4,width=0.5,height=0.45,water=0.7,seed}) → hollow trough on feet with a water plane   createBoat({length=4.5,beam=1.6,depth=0.7,mast,seed}) → lofted hull + thwarts + mast (origin at waterline centre, bow +Z)
createStall({width=2.2,depth=1.2,counterHeight=0.9,produce:[colours],seed}) → plank counter + canvas over posts + open crates filled with produce clusters; userData.counterTop

// causal-state.js
transferAt(time, {contactTime, releaseTime, settleTime, total?=1}) → {phase:'approach'|'transfer'|'settle'|'rest', progress:0..1, received, remaining, active, settleProgress:0..1}
  // Use `.progress` (or `.settleProgress`) explicitly; the object also coerces to `progress` in arithmetic/clamp, but never pass it where a plain number is stored.
```

// terrain.js  (a landscape to the horizon; heights relative to the stage pad at y=0)
createTerrain({size=2000, seed, relief:'flat'|'rolling'|'valley'|'hills'|'coast', amplitude?, valleyOffset?=0, waterLevel?=null (sea/lake plane, relative), nearRadius=250, nearRes=1, farRes=8,
  stage:{x,z,radius,height?}, roads:[[[x,z],...] | {points,width,verge}], pads:[{x,z,r,blend,h?}], smoothRegions:[{x,z,r,blend,radius,flatten}], tints:[{x,z,r,blend,color,amount}], rivers:[{points,width,depth,bank,drop}], colors?, detail=true})
  → {group, height(x,z), normal(x,z), slope(x,z), roadMask(x,z), isWater(x,z), buildable(x,z), place(obj,x,z,{yaw,align,sink}), pave({x,z,r,material}) → Mesh, roadSurfaces(material,{roads?,offset?,width?,lift?}) → Group, roads[{at(s),nearest(x,z),length,width}], rivers[...], stage}
noise2(x,y,seed) fbm(x,y,seed,{octaves,scale}) ridged(x,y,seed,{scale})

// settlement.js  (streets, lots, buildings; plan first, carve the terrain with plan.roads/pads, then build)
planSettlement({center:[x,z], kind:'hamlet'|'village'|'town'|'city', seed, radius?, axis:[dx,dz], stageRadius, mainRoad?, styles?}) → {streets, roads, lots, pads, square, smoothRegion, tint, walkNetwork, center, radius, kind}
buildSettlement(plan, terrain, {seed, detailRadius=260, materials?, stage?}) → {group, buildings:[{x,z,yaw,w,d,storeys,door:{x,z,facing}}], doors, occupied(x,z,margin), materials, plan}
  // walls with real reveals (wallWithOpenings + shaded rooms), frames, panes, shutters, planked doors, plinths, eaves, gable/hip roofs (tile/slate/thatch), chimneys, dormers, shopfronts on the square, a church, barns in hamlets,
  // setts on the square, paved streets with flagstone pavements, front walls with gates, benches and lamp posts; houses merged per 60 m chunk
createBuilding({w,d,storeys,style:'stone'|'plaster'|'brick'|'timber',roof:'tile'|'slate'|'thatch',roofKind:'gable'|'hip',seed,M,detailed,landmark:'church'|'barn'|null,terrace,shopfront}) → Group (origin floor centre, door on +z)
buildBridges(terrain,{materials,seed}) → {group, bridges}   // a stone arch bridge wherever a road crosses a river
mergeStatic(group) → Group of one Mesh per material signature      mergeByChunk(groups,{cell=60}) → Group

// scatter.js  (the fill: woods, hedged fields, crops, rocks, grass, street and yard trees, props, people, animals)
scatterVegetation({terrain, settlement, seed, treeCount=2500, region=900, nearRadius=220, fields=true, grassRadius=70, rockCount=400}) → {group, trees:[[x,z]], species}
scatterProps({terrain, settlement, seed, radius=220, extra:{name:seed=>Object3D}}) → {group, count, makers}   // barrels, crates, benches, log piles, washing lines by doors; a well on the square; lamps on the main street; haystacks
populate({terrain, settlement, seed, people=16, animals=8, radius=140}) → {group, walkers, grazers, update(t)}   // low-detail figures walking the street network, sheep and horses grazing
treeSpecies(seed) → {oak,ash,birch,pine:{near,far,material,height}}

// render-preset.js large mode
setupOutdoorRendering(scene, camera, {..., scale:'large', csmMaxFar=600, cascades=3}) → same rig; cascaded shadow maps follow the camera, camera.far ≥ 3000, thin fog; call rig.finalize() after building
