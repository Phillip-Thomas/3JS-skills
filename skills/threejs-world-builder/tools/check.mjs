// CPU check: load ./world/main.js in Node with DOM stubs and no GPU, then verify what a rendered look cannot cheaply tell
// you: every vertex and transform finite, setTime deterministic (seek forward and back returns the same state), every
// declared view and stats() present, every anchor framed by at least one view, activity actually changing across the
// sampled times, and cameras clear of solid meshes. Free, fast, no allowance used. Run it before every rendered look.
//   node ./skills/threejs-world-builder/tools/check.mjs [--world ./world] [--times 0,8,16,24,36,48,64,80]
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {register,createRequire} from 'node:module';
// Bare 'three' / 'three/addons/...' imports in the world resolve from this project's node_modules (see check-resolve.mjs).
// three is found from the workspace (cwd) first, then from wherever this tool lives
const threeBase=(()=>{for(const from of [path.join(process.cwd(),'package.json'),import.meta.url]){try{const entry=createRequire(from).resolve('three');return pathToFileURL(path.join(path.dirname(entry),'three.module.js')).href;}catch{}}throw Error('cannot find the three package from '+process.cwd());})();
register('./check-resolve.mjs',{parentURL:import.meta.url,data:{base:threeBase}});
const args=process.argv.slice(2);const opt=(k,d)=>{const i=args.indexOf(k);return i>=0?args[i+1]:d;};
const worldDir=path.resolve(opt('--world','./world'));const times=opt('--times','0,8,16,24,36,48,64,80').split(',').map(Number);
// ---- DOM stubs sufficient for three.js addons, canvas textures and the world's own UI wiring
globalThis.WORLD_CPU_STUB=true;globalThis.window=globalThis;globalThis.innerWidth=1280;globalThis.innerHeight=800;globalThis.devicePixelRatio=1;
globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{};globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};for(const h of ['onkeydown','onkeyup','onmousemove','onmousedown','onmouseup','onwheel','onresize','onclick','onpointerdown','onpointermove','onpointerup','ontouchstart','ontouchmove','ontouchend'])globalThis[h]=null;globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});globalThis.getComputedStyle=()=>({});
globalThis.performance=globalThis.performance||{now:()=>Date.now()};try{if(!globalThis.navigator)globalThis.navigator={userAgent:'node'};}catch{}
const ctx2d=()=>new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),measureText:()=>({width:0}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),createPattern:()=>({}),getLineDash:()=>[],fillStyle:'',strokeStyle:'',lineWidth:1,font:'',globalAlpha:1,lineCap:'butt',lineJoin:'miter'},{get(t,k){return k in t?t[k]:(()=>{});},set(t,k,v){t[k]=v;return true;}}); // any other 2D method is a no-op
const element=tag=>({tagName:String(tag).toUpperCase(),style:{},children:[],width:0,height:0,value:'',textContent:'',innerHTML:'',dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},
  getContext(kind){return kind==='2d'?ctx2d():null;},toDataURL:()=>'',appendChild(c){this.children.push(c);return c;},removeChild(){},append(){},prepend(){},remove(){},setAttribute(){},getAttribute:()=>null,addEventListener(){},removeEventListener(){},querySelector:()=>element('div'),querySelectorAll:()=>[],getBoundingClientRect:()=>({left:0,top:0,width:1280,height:800}),focus(){},blur(){},requestPointerLock(){},setPointerCapture(){},releasePointerCapture(){},getRootNode(){return globalThis.document;},get ownerDocument(){return globalThis.document;},clientWidth:1280,clientHeight:800});
globalThis.document={createElement:element,createElementNS:(ns,t)=>element(t),querySelector:()=>element('div'),querySelectorAll:()=>[],getElementById:()=>element('div'),body:element('body'),head:element('head'),documentElement:element('html'),addEventListener(){},removeEventListener(){},exitPointerLock(){},pointerLockElement:null,hidden:false};
globalThis.HTMLElement=class{};globalThis.HTMLCanvasElement=class{};globalThis.Image=class{constructor(){this.onload=null;}set src(v){}};globalThis.ImageData=class{constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}};
globalThis.OffscreenCanvas=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx2d();}};globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
// ---- load
const result={ok:false,world:worldDir,problems:[],notes:[]};
const fail=m=>{result.problems.push(m);};
try{
  const entry=path.join(worldDir,'main.js');if(!fs.existsSync(entry))throw Error('no world/main.js');
  await import(pathToFileURL(entry).href);
  const w=globalThis.worldTest;if(!w)throw Error('window.worldTest not defined after import');
  for(let i=0;i<50&&!w.ready;i++)await new Promise(r=>setTimeout(r,100));if(!w.ready)throw Error('worldTest.ready never became true');
  const THREE=await import('three');
  for(const k of ['scene','camera','views','setView','setTime','setPaused','reset','stats'])if(!(k in w))fail(`worldTest.${k} missing`);
  if(!Array.isArray(w.views)||w.views.length!==6)fail(`views must be 6 entries (got ${w.views?.length})`);
  // finite geometry
  let verts=0,meshes=0;w.scene.updateMatrixWorld(true);w.scene.traverse(o=>{if(o.isMesh&&o.geometry?.attributes?.position){meshes++;const a=o.geometry.attributes.position.array;verts+=a.length/3;for(let i=0;i<a.length;i+=Math.max(1,Math.floor(a.length/3000)*3))if(!Number.isFinite(a[i]))fail(`non-finite vertex in mesh '${o.name||o.parent?.name||'mesh'}'`);}});
  // density profile: what a viewer will find when walking the scene
  const prof={meshes,vertices:verts,instances:0,instancedMeshes:0,materials:new Set(),bakedMaterials:new Set(),geometries:new Set(),lights:0,shadowLights:0,textured:0};
  w.scene.traverse(o=>{if(o.isInstancedMesh){prof.instancedMeshes++;prof.instances+=o.count;}if(o.isMesh){for(const m of [].concat(o.material))if(m){prof.materials.add(m.uuid);if(m.map||m.normalMap||m.roughnessMap)prof.bakedMaterials.add(m.uuid);if(m.map)prof.textured++;}if(o.geometry)prof.geometries.add(o.geometry.uuid);}if(o.isLight){prof.lights++;if(o.castShadow)prof.shadowLights++;}});
  result.profile={meshes,vertices:verts,instancedMeshes:prof.instancedMeshes,instances:prof.instances,uniqueMaterials:prof.materials.size,bakedMaterials:prof.bakedMaterials.size,texturedMeshes:prof.textured,uniqueGeometries:prof.geometries.size,lights:prof.lights,shadowLights:prof.shadowLights};
  result.notes.push(`${meshes} meshes, ${verts} vertices, ${prof.instances} instances, ${prof.bakedMaterials.size} baked materials, ${prof.shadowLights} shadow lights`);
  // stats/entities at sampled times + activity + determinism
  const snap=t=>{w.setTime(t);const s=w.stats();return {s,json:JSON.stringify(s)};};
  const first=snap(times[0]);if(!first.s||!Array.isArray(first.s.actors)||!first.s.actors.length)fail('stats().actors empty');if(!Array.isArray(first.s?.objects)||!first.s.objects.length)fail('stats().objects empty');
  const okEntity=e=>e&&typeof e.name==='string'&&Array.isArray(e.position)&&e.position.length===3&&e.position.every(Number.isFinite);
  let changes=0,prev=first.json;const entityTracks={};
  for(const t of times){const {s,json}=snap(t);for(const e of [...(s.actors||[]),...(s.objects||[])]){if(!okEntity(e))fail(`entity '${e?.name}' has a non-finite position at t=${t}`);(entityTracks[e.name]??=[]).push(e.position.map(v=>+v.toFixed(3)).join(','));}if(json!==prev)changes++;prev=json;}
  if(changes<Math.max(2,Math.floor(times.length/3)))fail(`activity: stats() changed at only ${changes} of ${times.length} sampled times; the scene reads as static`);
  const moving=Object.entries(entityTracks).filter(([,tr])=>new Set(tr).size>1).map(([n])=>n);result.notes.push(`moving entities: ${moving.join(', ')||'none'}`);
  const a=snap(24).json;snap(80);snap(0);const b=snap(24).json;if(a!==b)fail('setTime is not deterministic: state at t=24 differs after seeking to 80 and back');
  // custody: where each named object lives at the sampled times (carried by whom, inside what). Read this against the brief:
  // a handed-over object must end up parented where the brief says it stays, not left at its start or dropped at the origin.
  const byName=new Map();w.scene.traverse(o=>{if(o.name&&!byName.has(o.name))byName.set(o.name,o);});
  // stats names need not match scene names: fall back to the object whose world position matches the reported one at t=0
  w.setTime(times[0]);w.scene.updateMatrixWorld(true);const wp=new THREE.Vector3();
  for(const e of (w.stats().objects||[]))if(!byName.has(e.name)){let best=null,bd=0.02;w.scene.traverse(o=>{if(o===w.scene||!o.parent)return;o.getWorldPosition(wp);const d=Math.hypot(wp.x-e.position[0],wp.y-e.position[1],wp.z-e.position[2]);if(d<bd){bd=d;best=o;}});if(best)byName.set(e.name,best);}
  const owner=o=>{let p=o.parent,inside=null,carrier=null;while(p){if(!inside&&p!==w.scene&&!p.isBone&&p.name&&p.name!=='figure')inside=p.name;if(p.userData?.pose){carrier=p.name||'figure';break;}p=p.parent;}return {inside,carrier};};
  const custody={};for(const t of times){w.setTime(t);w.scene.updateMatrixWorld(true);for(const e of (w.stats().objects||[])){const o=byName.get(e.name);if(!o)continue;const {inside,carrier}=owner(o);const where=carrier?(inside?`in '${inside}' carried by ${carrier}`:`carried by ${carrier}`):(o.parent&&o.parent!==w.scene?`in '${o.parent.name||o.parent.type}'`:'free in scene');(custody[e.name]??=[]).push(`${t}s: ${where}`);}}
  for(const [name,track] of Object.entries(custody))if(new Set(track.map(x=>x.split(':')[1])).size>1)result.notes.push(`custody of '${name}': ${track.join(' → ')}`);
  // framing + camera clearance at t=0 and the sampled action times
  const boxes=[];w.scene.traverse(o=>{if(!o.isMesh||!o.geometry)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(!b)return;const wb=b.clone().applyMatrix4(o.matrixWorld);const size=wb.getSize(new THREE.Vector3());if(size.x<30&&size.y<30&&size.z<30&&size.x>0.02&&size.y>0.02&&size.z>0.02)boxes.push({name:o.name||o.parent?.name||'mesh',box:wb});});
  const cam=w.camera;const framed={};
  for(const t of [0,24,64]){w.setTime(t);w.scene.updateMatrixWorld(true);const st=w.stats();const ents=[...(st.actors||[]),...(st.objects||[])];
    w.views.forEach((v,i)=>{w.setView(i);cam.updateMatrixWorld(true);cam.updateProjectionMatrix();const p=new THREE.Vector3().fromArray(v.position);
      for(const b of boxes)if(b.box.containsPoint(p)){fail(`view ${i} '${v.name}' is inside mesh '${b.name}' at t=${t}`);break;}
      for(const e of ents){const q=new THREE.Vector3().fromArray(e.position).project(cam);if(Math.abs(q.x)<0.95&&Math.abs(q.y)<0.95&&q.z<1)(framed[e.name]??=new Set()).add(i);}});
    for(const e of ents)if(!(framed[e.name]?.size))fail(`anchor '${e.name}' is not framed by any view (t=${t})`);}
  w.setView(0);w.setTime(0);
  result.ok=result.problems.length===0;
}catch(e){result.error=String(e.stack||e).split('\n').slice(0,4).join(' | ');}
console.log(JSON.stringify(result,null,1));process.exit(result.ok?0:1);
