// Procedural characters for Three.js 0.185.1: a proportioned humanoid, a quadruped (dog/horse) and a hen,
// each a Group of primitives with a deterministic pose(t) so setTime seeks exactly. Copy beside your runtime
// module. Proportions are real (adult ≈ 7.5 heads tall, shoulder 0.23×height, arm 0.44×height, leg 0.48×height);
// silhouettes read at 2–10 m. Not a rig or skinning system; extend by swapping part geometry.
import * as THREE from 'three';
import {rng,vary,toColor,jointedFigure,quadruped,fowl} from './parts.js';

const num=(v,d)=>Number.isFinite(+v)?+v:d; // pose inputs tolerate objects with valueOf (e.g. transferAt state) and reject NaN
const mat=(color,roughness=0.8,metalness=0)=>new THREE.MeshStandardMaterial({color:toColor(color),roughness,metalness});
function capsule(r,len,material){const m=new THREE.Mesh(new THREE.CapsuleGeometry(r,Math.max(0.01,len-2*r),4,10),material);m.castShadow=m.receiveShadow=true;return m;}
function box(w,h,d,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.castShadow=m.receiveShadow=true;return m;}
function sphere(r,material,ws=14,hs=10){const m=new THREE.Mesh(new THREE.SphereGeometry(r,ws,hs),material);m.castShadow=m.receiveShadow=true;return m;}
/** Pivoted limb: a Group at the joint whose child is offset so rotation swings from the joint. */
function limb(r,len,material,{down=true}={}){const j=new THREE.Group();const seg=capsule(r,len,material);seg.position.y=down?-len/2:len/2;j.add(seg);j.userData.len=len;return j;}

/**
 * Humanoid. `pose(t,{walk,speed})` swings limbs; walk=0 stands, walk=1 full stride. Place with group.position (feet on ground)
 * and face direction with group.rotation.y. Colors: skin, hair, top, trousers, boots.
 */
/** Humanoid = parts.jointedFigure (proportioned, jointed, seeded) with the same options plus coat/apron/hat. */
export function createHumanoid(opts={}){const g=jointedFigure(opts);g.name='humanoid';return g;}

/** Straight-line locomotion helper: moves and faces `g` from a to b by progress 0..1 and poses the walk cycle. */
export function walkBetween(g,a,b,progress,t,{speed=1.2}={}){
  const p=THREE.MathUtils.clamp(num(progress,0),0,1);g.position.lerpVectors(a,b,p);
  const d=new THREE.Vector3().subVectors(b,a);if(d.lengthSq()>1e-6)g.rotation.y=Math.atan2(d.x,d.z);
  // stride phase from the distance actually covered, so the feet plant on the ground however fast progress advances
  g.userData.pose(t,{walk:p>0&&p<1?1:0,speed,distance:p*d.length()});return g;
}
/** Path locomotion: `points` (Vector3[]) and cumulative `distance` travelled along them; poses with the same distance so the feet plant. */
export function walkAlong(g,points,distance,t,{walking=true}={}){
  let rem=Math.max(0,num(distance,0)),i=0;const total=points.slice(1).reduce((s,q,k)=>s+q.distanceTo(points[k]),0);rem=Math.min(rem,total);
  for(;i<points.length-1;i++){const L=points[i].distanceTo(points[i+1]);if(rem<=L||i===points.length-2){g.position.lerpVectors(points[i],points[i+1],L?rem/L:0);const d=new THREE.Vector3().subVectors(points[i+1],points[i]);if(d.lengthSq()>1e-6)g.rotation.y=Math.atan2(d.x,d.z);break;}rem-=L;}
  g.userData.pose(t,{walk:walking&&distance>0&&distance<total?1:0,distance});return g;
}

/** Quadruped and hen are parts.js patterns (quadruped, fowl); these wrappers keep the older names. */
export function createQuadruped(opts={}){return quadruped(opts);}
export function createHen(opts={}){return fowl(opts);}
