// Render preset for Three.js 0.185.1 WebGL2. Copy this file beside your runtime
// modules and import from it. It gives a scene the baseline every finished
// realtime image needs: filmic output, image-based lighting from a procedural
// sky or room, a shadowed sun fitted to the scene, ambient occlusion, gentle
// bloom and antialiasing. Nothing here is a style; adjust exposure, sun and
// environment intensity for the brief. Procedural only: no HDRI or image files.
import * as THREE from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

/** Renderer with correct color management and filmic tone mapping. */
// CPU check mode (globalThis.WORLD_CPU_STUB, set by tools/check.mjs): no WebGL exists, so the rig becomes an inert stub and
// the world can be loaded in Node to test geometry, timeline determinism and framing without a GPU or a browser.
const cpuStub=()=>globalThis.WORLD_CPU_STUB===true;
function stubRig(scene){const renderer={domElement:{addEventListener(){},removeEventListener(){},setPointerCapture(){},releasePointerCapture(){},requestPointerLock(){},getRootNode(){return globalThis.document;},ownerDocument:globalThis.document,style:{},clientWidth:1280,clientHeight:800,getBoundingClientRect(){return {left:0,top:0,width:1280,height:800};}},shadowMap:{enabled:true},setSize(){},setPixelRatio(){},render(){},toneMappingExposure:1,domElementStub:true};
  const finalize=()=>enableShadows(scene);let n=0;return {renderer,env:null,sun:null,skyFill:null,post:null,render(){if(n++%300===0)finalize();},setSize(){},finalize,stub:true};}
export function createRenderer({canvas, exposure=1, toneMapping='aces', maxPixelRatio=2}={}) {
  if(cpuStub())return stubRig().renderer;
  const renderer=new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=toneMapping==='agx'?THREE.AgXToneMapping:toneMapping==='neutral'?THREE.NeutralToneMapping:THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=exposure;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  return renderer;
}

/** Sun direction from elevation/azimuth in degrees (azimuth 0 = +Z, 90 = +X). */
export function sunDirection(elevationDeg, azimuthDeg) {
  const phi=THREE.MathUtils.degToRad(90-elevationDeg), theta=THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

/**
 * Procedural daylight: a Sky dome plus the same sky baked through PMREM into
 * scene.environment so every StandardMaterial receives sky/ground bounce and
 * metals/wet surfaces have something to reflect. Call update() after changing
 * the sun. Typical: elevation 25–55 clear afternoon; 8–15 low golden light;
 * turbidity 2–4 clear, 6–10 hazy/overcast-ish (pair with a softer sun).
 */
export function createSkyEnvironment(scene, renderer, {elevationDeg=35, azimuthDeg=140, turbidity=3, rayleigh=1.2,
  mieCoefficient=0.005, mieDirectionalG=0.8, envIntensity=0.3, visibleSky=true, skyRadius=4000}={}) {
  const sky=new Sky(); sky.scale.setScalar(skyRadius);
  const u=sky.material.uniforms;
  u.turbidity.value=turbidity; u.rayleigh.value=rayleigh; u.mieCoefficient.value=mieCoefficient; u.mieDirectionalG.value=mieDirectionalG;
  const pmrem=new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
  const envScene=new THREE.Scene(); const envSky=new Sky(); envSky.scale.setScalar(skyRadius); envScene.add(envSky);
  const sun=new THREE.Vector3();
  let target=null;
  function update(next={}) {
    if(next.elevationDeg!==undefined)elevationDeg=next.elevationDeg; if(next.azimuthDeg!==undefined)azimuthDeg=next.azimuthDeg;
    if(next.turbidity!==undefined)u.turbidity.value=next.turbidity;
    sun.copy(sunDirection(elevationDeg, azimuthDeg));
    u.sunPosition.value.copy(sun);
    for(const k of ['turbidity','rayleigh','mieCoefficient','mieDirectionalG','sunPosition'])envSky.material.uniforms[k].value=u[k].value;
    if(target)target.dispose();
    target=pmrem.fromScene(envScene, 0.02);
    scene.environment=target.texture;
    scene.environmentIntensity=envIntensity;
    if(visibleSky&&!sky.parent)scene.add(sky);
  }
  update();
  return {sky, sun, update, get envMap(){return target?.texture;}, dispose(){target?.dispose();pmrem.dispose();}};
}

/**
 * Interior/night/vacuum fallback: neutral room lighting baked to PMREM. Gives
 * reflections and soft fill where no sky is visible. Tint by scaling
 * intensity; for a night scene keep it low (0.05–0.2) and let lamps dominate.
 */
export function createRoomEnvironment(scene, renderer, {intensity=0.35}={}) {
  const pmrem=new THREE.PMREMGenerator(renderer);
  const target=pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment=target.texture; scene.environmentIntensity=intensity;
  return {envMap:target.texture, dispose(){target.dispose();pmrem.dispose();}};
}

/**
 * Shadowed sun. `bounds` is a Box3 of the area whose shadows matter; the shadow
 * camera is fitted to it so 2048 texels cover the scene, not the sky.
 * Calibrated with the sky environment: sun 2.2, env 0.3, exposure 0.5 keeps
 * sunlit plaster just below clipping and shade clearly darker. If a capture is
 * too bright, lower `exposure` ONLY (0.35–0.45). Do not also lower sun and env:
 * that removes the sun-to-shade contrast and the whole image goes flat grey.
 */
export function createSunLight(scene, direction, {intensity=2.5, color=0xfff2e0, bounds, mapSize=2048, radius=2}={}) {
  const light=new THREE.DirectionalLight(color, intensity);
  light.castShadow=true;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.radius=radius;
  scene.add(light); scene.add(light.target);
  fitShadowToBounds(light, direction, bounds??new THREE.Box3(new THREE.Vector3(-15,-1,-15), new THREE.Vector3(15,10,15)));
  return light;
}

/** Fit a directional light's shadow frustum to a Box3 and set scale-relative bias. */
export function fitShadowToBounds(light, direction, bounds) {
  const center=bounds.getCenter(new THREE.Vector3()), size=bounds.getSize(new THREE.Vector3());
  const extent=Math.max(size.x, size.y, size.z);
  const dist=extent*1.5;
  light.position.copy(center).addScaledVector(direction.clone().normalize(), dist);
  light.target.position.copy(center);
  const cam=light.shadow.camera;
  const half=extent*0.6;
  cam.left=-half; cam.right=half; cam.top=half; cam.bottom=-half;
  cam.near=dist-extent; cam.far=dist+extent; cam.updateProjectionMatrix();
  const texel=(2*half)/light.shadow.mapSize.x;
  light.shadow.bias=-0.0002;
  light.shadow.normalBias=texel*1.5;
  return light;
}

/** Hemisphere fill for shaded sides that the environment map alone leaves too dark. Keep it weak. */
export function createSkyFill(scene, {skyColor=0x9fbfe8, groundColor=0x6a5a48, intensity=0.12}={}) {
  const h=new THREE.HemisphereLight(skyColor, groundColor, intensity); scene.add(h); return h;
}

/** Max anisotropy and mipmaps on every texture in the scene; call after building. */
export function applyTextureDefaults(scene, renderer) {
  const max=renderer.capabilities.getMaxAnisotropy(), seen=new Set();
  scene.traverse(o=>{
    const mats=Array.isArray(o.material)?o.material:o.material?[o.material]:[];
    for(const m of mats)for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','bumpMap','emissiveMap'])
      {const t=m[k]; if(t&&!seen.has(t)){seen.add(t); t.anisotropy=max; t.generateMipmaps=true; t.minFilter=THREE.LinearMipmapLinearFilter; t.needsUpdate=true;}}
  });
}

/** Enable shadow casting/receiving on every mesh; exclude by setting o.userData.noShadow. */
export function enableShadows(scene) {
  scene.traverse(o=>{if(o.isMesh&&!o.userData.noShadow){o.castShadow=true;o.receiveShadow=true;}});
}

/**
 * Post chain: MSAA render → GTAO (denoised) → optional bloom (off by default: it
 * turns any opening onto sky into a white hole) → tone map/output.
 * Returns {render, setSize, composer}. Call render() instead of renderer.render
 * and expose it as worldTest.render for the capture harness. aoRadius is in
 * world meters; 0.35–0.6 for room-scale, 1–2 for street-scale scenes.
 */
export function createPostChain(renderer, scene, camera, {ao=true, aoRadius=0.5, aoBounds, bloom=false, bloomStrength=0.05, bloomThreshold=1.6, bloomRadius=0.3, samples=4}={}) {
  const size=renderer.getSize(new THREE.Vector2()), pr=renderer.getPixelRatio();
  const target=new THREE.WebGLRenderTarget(size.x*pr, size.y*pr, {type:THREE.HalfFloatType, samples});
  const composer=new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let gtao=null;
  if(ao){
    gtao=new GTAOPass(scene, camera, size.x*pr, size.y*pr);
    gtao.output=GTAOPass.OUTPUT.Default;
    gtao.updateGtaoMaterial({radius:aoRadius, distanceExponent:1, thickness:Math.max(0.5, aoRadius*2), scale:1, distanceFallOff:1, screenSpaceRadius:false});
    gtao.updatePdMaterial({lumaPhi:10, depthPhi:2, normalPhi:3, radius:4, radiusExponent:1, rings:2, samples:16});
    gtao.blendIntensity=1;
    if(aoBounds)gtao.setSceneClipBox(aoBounds);
    composer.addPass(gtao);
  }
  let bloomPass=null;
  if(bloom){bloomPass=new UnrealBloomPass(new THREE.Vector2(size.x, size.y), bloomStrength, bloomRadius, bloomThreshold); composer.addPass(bloomPass);}
  composer.addPass(new OutputPass());
  function setSize(w, h){renderer.setSize(w, h); composer.setSize(w, h); camera.aspect=w/h; camera.updateProjectionMatrix();}
  function render(){composer.render();}
  return {composer, gtao, bloom:bloomPass, render, setSize};
}

/** Distance fog matched to the sky horizon color; density per meter (0.004–0.012 for outdoor courtyards/streets). */
export function addAtmosphere(scene, {color=0xc7d5e6, density=0.006}={}) {
  scene.fog=new THREE.FogExp2(color, density); return scene.fog;
}

/**
 * One call for a typical outdoor scene. Returns everything so you can adjust.
 * Usage:
 *   const rig = setupOutdoorRendering(scene, camera, {canvas, bounds, mood:'late-afternoon'});
 *   window.worldTest = {..., renderer: rig.renderer, render: rig.render};
 *   function frame(){ rig.render(); }
 */
/**
 * Mood presets. Pick the one that matches the brief's words; every value can
 * still be overridden. Judges penalize a clear 38° sun on a 'late afternoon'
 * or 'overcast' brief harder than any material defect.
 */
export const MOODS={
  'clear-day':      {elevationDeg:38, azimuthDeg:135, turbidity:3,  sunIntensity:2.2, sunColor:0xfff2e0, envIntensity:0.3,  fill:0.12, exposure:0.5,  fogDensity:0.003, shadowRadius:2},
  'late-afternoon': {elevationDeg:16, azimuthDeg:120, turbidity:4,  sunIntensity:2.0, sunColor:0xffd9a8, envIntensity:0.3,  fill:0.12, exposure:0.5,  fogDensity:0.004, shadowRadius:2},
  'golden-hour':    {elevationDeg:8,  azimuthDeg:110, turbidity:5,  sunIntensity:1.8, sunColor:0xffc27a, envIntensity:0.32, fill:0.1,  exposure:0.55, fogDensity:0.006, shadowRadius:3},
  'overcast':       {elevationDeg:45, azimuthDeg:135, turbidity:10, sunIntensity:0.7, sunColor:0xe8eef5, envIntensity:0.7,  fill:0.4,  exposure:0.6,  fogDensity:0.006, shadowRadius:6},
  'after-rain':     {elevationDeg:24, azimuthDeg:125, turbidity:6,  sunIntensity:1.6, sunColor:0xfff0dc, envIntensity:0.45, fill:0.2,  exposure:0.5,  fogDensity:0.005, shadowRadius:3},
};

export function setupOutdoorRendering(scene, camera, {canvas, bounds, mood='clear-day', aoRadius=0.5, fog=true, bloom=false, scale='stage', ...override}={}) {
  if(cpuStub())return stubRig(scene);
  if(scale==='large')return setupLargeOutdoorRendering(scene, camera, {canvas, bounds, mood, aoRadius, fog, bloom, ...override});
  // accept the short spellings builders reach for; a silently ignored azimuth leaves the stage back-lit
  if(override.azimuth!==undefined&&override.azimuthDeg===undefined)override.azimuthDeg=override.azimuth;if(override.elevation!==undefined&&override.elevationDeg===undefined)override.elevationDeg=override.elevation;if(override.sunAzimuth!==undefined)override.azimuthDeg=override.sunAzimuth;if(override.sunElevation!==undefined)override.elevationDeg=override.sunElevation;
  if(!MOODS[mood])throw Error('Unknown mood: '+mood+'. Use one of '+Object.keys(MOODS).join(', '));
  const m={...MOODS[mood], ...override};
  const renderer=createRenderer({canvas, exposure:m.exposure});
  const env=createSkyEnvironment(scene, renderer, {elevationDeg:m.elevationDeg, azimuthDeg:m.azimuthDeg, turbidity:m.turbidity, envIntensity:m.envIntensity});
  const sun=createSunLight(scene, env.sun, {intensity:m.sunIntensity, color:m.sunColor, bounds, radius:m.shadowRadius});
  const skyFill=m.fill>0?createSkyFill(scene, {intensity:m.fill}):null;
  if(fog)addAtmosphere(scene, {density:m.fogDensity});
  const post=createPostChain(renderer, scene, camera, {aoRadius, aoBounds:bounds, bloom});
  window.addEventListener('resize', ()=>post.setSize(window.innerWidth, window.innerHeight));
  const finalize=selfFinalizing(scene, renderer);
  return {renderer, env, sun, skyFill, post, render:()=>{finalize.tick();post.render();}, setSize:post.setSize, finalize};
}


/* finalize() turns on shadows and texture defaults for everything in the scene. A build that forgets to call it renders
 * with no cast shadows at all (every object floats), so render() runs it itself on the first frame and again every
 * few hundred frames to catch meshes added later. Calling finalize() explicitly after building is still the right habit. */
function selfFinalizing(scene, renderer){
  let frames=0;
  const fn=function(){enableShadows(scene); applyTextureDefaults(scene, renderer); frames=1;};
  fn.tick=()=>{if(frames===0||(++frames%300===0))fn();};
  return fn;
}


/**
 * Large-world variant (a town, a valley, a city to the horizon): the sun becomes cascaded shadow maps that follow the
 * camera, so shadows stay crisp at the stage and still exist a kilometre away; fog is thinner and the camera far plane
 * is pushed out. Materials are wired to the cascades at finalize() (and again as render() sees new ones), so build
 * everything, then call rig.finalize(). `csmMaxFar` bounds the shadowed distance (default 900 m).
 */
export async function loadCSM(){return (await import('three/addons/csm/CSM.js')).CSM;}
export function setupLargeOutdoorRendering(scene, camera, {canvas, bounds, mood='clear-day', aoRadius=0.7, fog=true, bloom=false, csmMaxFar=600, cascades=3, shadowMapSize=2048, ...override}={}) {
  if(override.azimuth!==undefined&&override.azimuthDeg===undefined)override.azimuthDeg=override.azimuth;if(override.elevation!==undefined&&override.elevationDeg===undefined)override.elevationDeg=override.elevation;
  if(!MOODS[mood])throw Error('Unknown mood: '+mood+'. Use one of '+Object.keys(MOODS).join(', '));
  const m={...MOODS[mood], ...override};
  const renderer=createRenderer({canvas, exposure:m.exposure});
  const env=createSkyEnvironment(scene, renderer, {elevationDeg:m.elevationDeg, azimuthDeg:m.azimuthDeg, turbidity:m.turbidity, envIntensity:m.envIntensity});
  camera.far=Math.max(camera.far, 3000); camera.updateProjectionMatrix();
  const skyFill=m.fill>0?createSkyFill(scene, {intensity:m.fill}):null;
  if(fog)addAtmosphere(scene, {density:Math.min(m.fogDensity, 0.0012)});
  const post=createPostChain(renderer, scene, camera, {aoRadius, aoBounds:bounds, bloom});
  window.addEventListener('resize', ()=>post.setSize(window.innerWidth, window.innerHeight));
  // cascades: built once the addon loads; until then a plain sun keeps the first frames lit
  let csm=null;const sunDir=env.sun.clone().normalize();
  const fallback=createSunLight(scene, env.sun, {intensity:m.sunIntensity, color:m.sunColor, bounds, radius:m.shadowRadius});
  const wired=new WeakSet();
  // CSM.setupMaterial installs its own onBeforeCompile; the surface and ground detail layers live there too, so chain them
  const wire=()=>{if(!csm)return;scene.traverse(o=>{if(!o.isMesh)return;for(const mat of [].concat(o.material))if(mat&&!wired.has(mat)){wired.add(mat);const prev=mat.onBeforeCompile,prevKey=mat.customProgramCacheKey;csm.setupMaterial(mat);const hook=mat.onBeforeCompile;
    if(prev)mat.onBeforeCompile=(shader,renderer)=>{prev.call(mat,shader,renderer);hook.call(mat,shader,renderer);};
    const csmKey=mat.customProgramCacheKey;mat.customProgramCacheKey=()=>(prevKey?prevKey.call(mat):'')+'|'+(csmKey?csmKey.call(mat):'csm');mat.needsUpdate=true;}});};
  loadCSM().then(CSM=>{csm=new CSM({camera, parent:scene, cascades, maxFar:csmMaxFar, mode:'practical', shadowMapSize, lightDirection:sunDir.clone().negate(), lightIntensity:m.sunIntensity, lightMargin:150});csm.fade=true;
    for(const l of csm.lights){l.color.set(m.sunColor);l.shadow.bias=-0.0003;l.shadow.normalBias=0.06;}
    scene.remove(fallback);scene.remove(fallback.target);wire();rig.csm=csm;}).catch(e=>console.warn('CSM unavailable, single sun kept',e));
  let frames=0;
  const finalize=function(){enableShadows(scene); applyTextureDefaults(scene, renderer); wire(); frames=1;};
  const rig={renderer, env, sun:fallback, skyFill, post, csm:null, large:true,
    render(){if(frames===0||(++frames%300===0))finalize();if(csm){csm.update();}post.render();},
    setSize(w,h){post.setSize(w,h);if(csm)csm.updateFrustums();}, finalize};
  return rig;
}

/** Interior/night variant: room environment for reflections, no sun; add your own lamps with castShadow. */
export function setupInteriorRendering(scene, camera, {canvas, bounds, exposure=1, envIntensity=0.3, aoRadius=0.35, bloom=false, bloomStrength=0.12}={}) {
  if(cpuStub())return stubRig(scene);
  const renderer=createRenderer({canvas, exposure});
  const env=createRoomEnvironment(scene, renderer, {intensity:envIntensity});
  const post=createPostChain(renderer, scene, camera, {aoRadius, aoBounds:bounds, bloom, bloomStrength});
  window.addEventListener('resize', ()=>post.setSize(window.innerWidth, window.innerHeight));
  const finalize=selfFinalizing(scene, renderer);
  return {renderer, env, post, render:()=>{finalize.tick();post.render();}, setSize:post.setSize, finalize};
}
