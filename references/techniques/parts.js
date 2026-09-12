// Construction patterns for Three.js 0.185.1. These are the few generic assemblies most props are made of;
// props.js shows how to compose them, and you compose new objects the same way. Every pattern takes a `seed`
// and varies proportions and finish within plausible ranges, so two calls never produce the same piece.
// Origin conventions: floor contact at y=0 unless stated; faces +Z. Sizes in meters.
import * as THREE from 'three';
import {createSurface} from './surface-materials.js'; // parts.js needs surface-materials.js + pbr-fields.js next to it

/** Deterministic RNG in [0,1). Same seed, same sequence. */
export function rng(seed=1){let a=(seed*2654435761)>>>0||1;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
/** base varied by ±pct using the rng. */
export const vary=(r,base,pct=0.12)=>base*(1+(r()*2-1)*pct);
/** Colour helper: accepts 0xRRGGBB, [r,g,b] 0–1, or THREE.Color; `shift` tints by a seeded hue/lightness offset. */
export function toColor(c,r,shift=0.06){const col=Array.isArray(c)?new THREE.Color(c[0],c[1],c[2]):new THREE.Color(c);if(r&&shift){const hsl={};col.getHSL(hsl);col.setHSL((hsl.h+(r()-0.5)*shift*0.5+1)%1,THREE.MathUtils.clamp(hsl.s*(1+(r()-0.5)*shift*2),0,1),THREE.MathUtils.clamp(hsl.l*(1+(r()-0.5)*shift*2),0,1));}return col;}
export const std=(color,roughness=0.8,metalness=0,r=null)=>new THREE.MeshStandardMaterial({color:toColor(color,r),roughness:r?THREE.MathUtils.clamp(vary(r,roughness,0.1),0,1):roughness,metalness});
export function mesh(geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;return m;}
export const box=(w,h,d,m,x,y,z)=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z);
export const cyl=(rt,rb,h,m,x,y,z,seg=24)=>mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m,x,y,z);
export function group(name,...kids){const g=new THREE.Group();g.name=name;for(const k of kids)g.add(k);return g;}

/**
 * Planked panel: `planks` boards of jittered width with small gaps, lying in the XY plane, thickness along Z.
 * The building block for doors, gates, crate sides, fences, decks. Origin at the panel's bottom-left corner.
 */
export function plankedPanel({width=1,height=2,thickness=0.03,planks=5,gap=0.006,material,seed=1,vertical=true}={}){
  const r=rng(seed),g=group('planked-panel');const n=Math.max(1,planks);
  const along=vertical?width:height,across=vertical?height:width;const weights=Array.from({length:n},()=>vary(r,1,0.18));const total=weights.reduce((a,b)=>a+b,0);
  let pos=0;for(let i=0;i<n;i++){const w=(along-gap*(n-1))*weights[i]/total;const jitter=(r()-0.5)*0.004;
    const b=vertical?box(w,across-Math.abs(jitter)*2,thickness,material,pos+w/2,across/2,jitter):box(across-Math.abs(jitter)*2,w,thickness,material,across/2,pos+w/2,jitter);g.add(b);pos+=w+gap;}
  g.userData.size={width,height,thickness};return g;
}

/** Frame around an opening: two jambs and a head (and sill when `sill`), depth along Z. Origin at floor centre of the opening. */
export function frame({width=0.9,height=2.1,depth=0.1,memberWidth=0.1,sill=false,material,seed=1}={}){
  const r=rng(seed),mw=vary(r,memberWidth,0.15),g=group('frame');
  g.add(box(width+2*mw,mw,depth,material,0,height+mw/2,0));for(const s of [-1,1])g.add(box(mw,height+(sill?mw:0),depth,material,s*(width/2+mw/2),height/2+(sill?mw/2:0),0));
  if(sill)g.add(box(width+2*mw+0.06,mw*0.6,depth+0.05,material,0,mw*0.3,0.02));g.userData.memberWidth=mw;return g;
}

/** Hinge: returns a pivot Group at the left edge of `leaf` so rotation.y swings it; `open` in radians. */
export function hinge(leaf,{open=0,side=-1,width}={}){const w=width??leaf.userData.size?.width??1;const pivot=new THREE.Group();pivot.position.x=side*w/2;leaf.position.x=side<0?0:-w;pivot.add(leaf);pivot.rotation.y=-open*(side<0?1:-1);pivot.userData.setOpen=a=>{pivot.rotation.y=-a*(side<0?1:-1);};return pivot;}

/** Legged top: a slab on `legs` (4 or 3) posts with an optional apron. Tables, benches, stools, workbenches. Origin at floor centre. */
export function leggedTop({width=1.2,depth=0.7,height=0.8,topThickness=0.05,legs=4,legSize=0.06,apron=0,topMaterial,legMaterial,seed=1,round=false}={}){
  const r=rng(seed),g=group('legged-top');const lt=vary(r,legSize,0.15),tt=vary(r,topThickness,0.15);
  g.add(round?cyl(width/2,width/2,tt,topMaterial,0,height-tt/2,0,28):box(width,tt,depth,topMaterial,0,height-tt/2,0));
  const inset=legs===3?0:lt*0.6;const spots=legs===3?[0,1,2].map(i=>{const a=i*Math.PI*2/3;return [Math.sin(a)*width*0.32,Math.cos(a)*width*0.32];}):[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sz])=>[sx*(width/2-inset-lt/2),sz*(depth/2-inset-lt/2)]);
  for(const [x,z] of spots){const splay=legs===3?0.1:0;const l=cyl(lt/2,lt/2*1.1,height-tt,legMaterial,x,(height-tt)/2,z,legs===3?10:4);if(legs===3){l.rotation.set(Math.atan2(z,1)*splay*3,0,-Math.atan2(x,1)*splay*3);}if(legs!==3)l.rotation.y=Math.PI/4;g.add(l);}
  if(apron>0&&legs===4){for(const s of [-1,1])g.add(box(width-2*inset-lt,apron,0.025,legMaterial,0,height-tt-apron/2,s*(depth/2-inset-lt/2)));for(const s of [-1,1])g.add(box(0.025,apron,depth-2*inset-lt,legMaterial,s*(width/2-inset-lt/2),height-tt-apron/2,0));}
  g.userData.top=height;return g;
}

/** Lathed vessel: revolve a profile of [radius,height] pairs. Pots, buckets, barrels, bowls, mugs, bollards. Origin at the base. */
export function lathe({profile=[[0.1,0],[0.12,0.3],[0.14,0.35]],material,segments=28,seed=1,jitter=0.04}={}){
  const r=rng(seed);const pts=profile.map(([x,y])=>new THREE.Vector2(x*(1+(r()-0.5)*jitter),y*(1+(r()-0.5)*jitter*0.5)));
  const g=mesh(new THREE.LatheGeometry(pts,segments),material);g.name='lathe';g.userData.height=pts[pts.length-1].y;g.userData.rimRadius=pts[pts.length-1].x;return g;
}

/** Hollow vessel on feet or a plinth: trough, basin, tub. Inner cavity is real (four walls + floor). Origin at floor centre. */
export function vessel({length=1.2,width=0.5,height=0.45,wall=0.05,legHeight=0,material,legMaterial,seed=1}={}){
  const r=rng(seed),g=group('vessel');const w=vary(r,wall,0.15);const y0=legHeight;
  g.add(box(length,w,width,material,0,y0+w/2,0));for(const s of [-1,1]){g.add(box(length,height,w,material,0,y0+height/2,s*(width/2-w/2)));g.add(box(w,height,width-2*w,material,s*(length/2-w/2),y0+height/2,0));}
  if(legHeight>0)for(const sx of [-1,1])for(const sz of [-1,1])g.add(box(w*1.2,legHeight,w*1.2,legMaterial||material,sx*(length/2-w),legHeight/2,sz*(width/2-w)));
  g.userData.inner={length:length-2*w,width:width-2*w,floorY:y0+w,rimY:y0+height};return g;
}

/** Spoked wheel lying in the XY plane (axle along Z). Carts, barrows, mills. Origin at the hub. */
export function spokedWheel({radius=0.35,spokes=8,rimWidth=0.03,material,rimMaterial,hubMaterial,seed=1}={}){
  const r=rng(seed),g=group('wheel');const n=Math.max(4,Math.round(vary(r,spokes,0.2)));
  g.add(mesh(new THREE.TorusGeometry(radius-rimWidth/2,rimWidth*0.7,8,32),rimMaterial||material));g.add(mesh(new THREE.TorusGeometry(radius,0.01,6,32),hubMaterial||material));
  g.add(mesh(new THREE.CylinderGeometry(radius*0.12,radius*0.12,rimWidth*2,12),hubMaterial||material).rotateX(Math.PI/2));
  for(let i=0;i<n;i++){const h=new THREE.Group();h.rotation.z=i*Math.PI*2/n;h.add(cyl(0.01,0.012,radius-rimWidth,material,0,(radius-rimWidth)/2,0,8));g.add(h);}
  g.userData.radius=radius;return g;
}

/** Jointed limb: a pivot Group with a segment hanging below; nest for knees/elbows. */
export function limb({radius=0.05,length=0.4,material,down=true}={}){const j=new THREE.Group();const seg=mesh(new THREE.CapsuleGeometry(radius,Math.max(0.01,length-2*radius),4,10),material);seg.position.y=down?-length/2:length/2;j.add(seg);j.userData.len=length;return j;}

/**
 * Lofted hull: boat hull from cross-sections along the length. `sections` are [z-fraction, halfBeam, depth, keelFlat]
 * rows; a default gives a rowing/fishing boat. Adds a gunwale strake and optional thwarts. Origin at the waterline
 * centre, bow toward +Z. Returns a Group; userData.deckY gives the sheer height for placing cargo.
 */
export function loftedHull({length=4.5,beam=1.6,depth=0.7,sections=null,thwarts=2,material,strakeMaterial,seed=1}={}){
  const r=rng(seed),g=group('hull');const L=vary(r,length,0.08),B=vary(r,beam,0.1),D=vary(r,depth,0.1);
  const secs=sections??[[-0.5,0.55,0.75,0.3],[-0.3,0.9,0.95,0.55],[0,1,1,0.6],[0.3,0.9,0.95,0.5],[0.45,0.5,0.85,0.25],[0.5,0.08,0.7,0]];
  const rings=8,pos=[],idx=[];
  for(const [zf,hb,d,kf] of secs){const z=zf*L;for(let i=0;i<=rings;i++){const u=i/rings,ang=Math.PI*u;const x=Math.cos(ang)*hb*B/2;const yy=-Math.sin(ang)*d*D*(1-kf*Math.pow(Math.abs(Math.cos(ang)),2));pos.push(x,yy,z);}}
  for(let s=0;s<secs.length-1;s++)for(let i=0;i<rings;i++){const a=s*(rings+1)+i,b=a+1,c=a+rings+1,d=c+1;idx.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  const hull=new THREE.Mesh(geo,Object.assign(material.clone(),{side:THREE.DoubleSide}));hull.castShadow=hull.receiveShadow=true;g.add(hull);
  // sheer strake along the gunwale
  const strakePts=secs.map(([zf,hb])=>new THREE.Vector3(hb*B/2,0.02,zf*L));for(const side of [-1,1]){const pts=strakePts.map(p=>new THREE.Vector3(p.x*side,p.y,p.z));const tube=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,0.03,6,false),strakeMaterial||material);g.add(tube);}
  for(let t=0;t<thwarts;t++){const zf=-0.25+t*0.5/Math.max(1,thwarts-1);const hb=secs.reduce((acc,s)=>Math.abs(s[0]-zf)<Math.abs(acc[0]-zf)?s:acc)[1];g.add(box(hb*B*0.72,0.04,0.25,strakeMaterial||material,0,-D*0.35,zf*L));}
  g.userData.deckY=0;g.userData.length=L;g.userData.beam=B;return g;
}

/**
 * Canvas over posts: a sagging cloth sheet stretched between `posts` (4) with an optional valance, on posts of
 * `height`. Awnings, stall roofs, tents, tarpaulins over carts. Origin at floor centre; sheet at post height.
 */
export function canvasOver({width=2.2,depth=1.6,height=2.1,sag=0.12,pitch=0.25,valance=0.12,material,postMaterial,seed=1,segments=10}={}){
  const r=rng(seed),g=group('canvas-over');const W=vary(r,width,0.08),D=vary(r,depth,0.08),Hh=vary(r,height,0.05);const pm=postMaterial||material;
  for(const sx of [-1,1])for(const sz of [-1,1])g.add(cyl(0.035,0.04,Hh,pm,sx*(W/2-0.05),Hh/2,sz*(D/2-0.05),10));
  const geo=new THREE.PlaneGeometry(W+0.2,D+0.2,segments,segments);const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i)/(W/2),y=p.getY(i)/(D/2);const s=Math.max(0,1-x*x)*Math.max(0,1-y*y);p.setZ(i,-sag*s+pitch*(0.5-Math.max(0,y))+(r()-0.5)*0.01);}
  geo.computeVertexNormals();const sheet=mesh(geo,Object.assign(material.clone(),{side:THREE.DoubleSide}));sheet.rotation.x=-Math.PI/2;sheet.position.y=Hh+pitch*0.5;g.add(sheet);
  if(valance>0){const v=mesh(new THREE.PlaneGeometry(W+0.2,valance),Object.assign(material.clone(),{side:THREE.DoubleSide}));v.position.set(0,Hh-valance/2+0.02,D/2+0.1);g.add(v);}
  for(const s of [-1,1])g.add(box(W,0.04,0.04,pm,0,Hh-0.02,s*(D/2-0.05))); // rails the sheet ties to
  g.userData.height=Hh;return g;
}

/**
 * Cluster fill: packs `count` rounded items (spheres or ellipsoids) into a footprint so a crate reads as full of
 * apples, sacks, stones or fish. Origin at the footprint floor centre; items pile with slight overlap.
 */
export function clusterFill({length=0.45,width=0.35,radius=0.04,count=24,layers=2,material,seed=1,squash=1}={}){
  const r=rng(seed),g=group('cluster-fill');const mat=material;let n=0;
  for(let l=0;l<layers&&n<count;l++){const cols=Math.max(1,Math.floor(length/(radius*1.8))),rows=Math.max(1,Math.floor(width/(radius*1.8)));
    for(let i=0;i<cols&&n<count;i++)for(let j=0;j<rows&&n<count;j++){const x=-length/2+radius+i*(length-2*radius)/Math.max(1,cols-1)+(r()-0.5)*radius*0.6,z=-width/2+radius+j*(width-2*radius)/Math.max(1,rows-1)+(r()-0.5)*radius*0.6;
      const rr=vary(r,radius,0.15);const m=mesh(new THREE.SphereGeometry(rr,10,8),mat,x,rr*squash+l*rr*1.6*squash,z);m.scale.y=squash;m.rotation.set(r()*3,r()*3,r()*3);g.add(m);n++;}}
  g.userData.top=layers*radius*1.6*squash+radius;return g;
}

/**
 * Garment material: a baked cloth/leather surface (surface-materials.js) tinted to `color`, with its maps repeated so the
 * weave is at the right scale on figure-sized UVs. Cloth kinds become MeshPhysicalMaterial with sheen. Cached per
 * kind+colour+pattern so a crowd shares bakes. `sway>0` returns a clone with a hem-weighted vertex sway.
 */
const garmentCache=new Map();
export function garmentMaterial(kind,color,seed=1,{repeat=5,resolution=256,pattern=null,sheen=null,sway=0}={}){
  const c=toColor(color);const key=`${kind}:${c.getHexString()}:${seed%4}:${repeat}:${pattern?JSON.stringify(pattern):''}`;
  let base=garmentCache.get(key);
  if(!base){
    const srgb=c.clone().convertLinearToSRGB().toArray().map(x=>Math.min(0.95,Math.max(0.02,x)));
    const toS=v=>Array.isArray(v)?v:toColor(v).convertLinearToSRGB().toArray();
    const pat=pattern?{...pattern,color2:toS(pattern.color2??0xffffff),color3:pattern.color3!==undefined?toS(pattern.color3):undefined}:null;
    const m=createSurface({kind,color:srgb,seed:1+(seed%4),resolution,...(pat?{pattern:pat}:{})});
    for(const k of ['map','normalMap','roughnessMap','metalnessMap'])if(m[k]){m[k]=m[k].clone();m[k].wrapS=m[k].wrapT=THREE.RepeatWrapping;m[k].repeat.set(repeat,repeat);m[k].anisotropy=4;m[k].needsUpdate=true;}
    if(kind!=='leather'){const pm=new THREE.MeshPhysicalMaterial({color:m.color,map:m.map,normalMap:m.normalMap,normalScale:m.normalScale.clone(),roughnessMap:m.roughnessMap,metalnessMap:m.metalnessMap,roughness:m.roughness,metalness:m.metalness});const sh=sheen??(kind==='wool'?0.6:kind==='linen'?0.35:0.25);pm.sheen=sh;pm.sheenRoughness=kind==='wool'?0.9:0.7;pm.sheenColor=c.clone().multiplyScalar(0.8); /* sheen tinted below the base colour so pale fabrics do not wash out */pm.name=m.name+'-fabric';pm.userData=m.userData;base=pm;}else base=m;
    garmentCache.set(key,base);
  }
  if(!sway)return base;
  const m=base.clone();m.userData.sway={uTime:{value:0},uTop:{value:0},uHem:{value:0.5},uSway:{value:sway}};
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,m.userData.sway);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime,uTop,uHem,uSway;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n{float f=clamp((uTop-position.y)/max(uHem,0.001),0.0,1.0);f=f*f;float ph=uTime*1.7+position.x*5.0+position.z*3.0;transformed.x+=uSway*f*sin(ph)*0.5;transformed.z+=uSway*f*cos(ph*0.8+1.3)*0.5;transformed.y-=uSway*f*0.15*abs(sin(ph));}');};
  m.customProgramCacheKey=()=>'garment-sway';return m;
}
export const SKIN_TONES=[0xf1d2b6,0xe0b898,0xc9a07a,0xb07f5a,0x8d5a3c,0x5c3a26];
export const HAIR_COLOURS=[0x1a1410,0x3a2a1c,0x6b4a2c,0xa87a44,0xd9b46a,0x8a8a8a,0xe8e2d6,0x7a2e1c];
export const HAIR_STYLES=['short','short','cropped','long','bun','bald','fringe'];
export const FACIAL_HAIR=['none','none','none','stubble','beard','moustache'];
export const ACCESSORIES=['none','none','belt','scarf','satchel','glasses','belt','cap'];
/**
 * Jointed figure: one skinned body. Skin, shirt, trousers, dress and coat are tube surfaces generated around a shared
 * skeleton (hips, spine, chest, neck, head, two legs, two arms) with blended bone weights across every joint, so a shirt is
 * a single continuous surface, sleeves bend with the arm, and a skirt is weighted to the legs so they never pass through
 * it. Garments are baked fabrics (sheen) with a hem-weighted vertex sway. Options: body 'm'|'f', child, dress, shorts,
 * collar, topPattern, coat, apron, hat, hairStyle, facialHair, accessory; unset looks are picked by `seed`.
 * userData.pose(t,{walk,speed,distance,lean}); pass `distance` travelled so the stride locks to the ground.
 * Origin at the feet, faces +Z. userData.parts = {head, legs:[{hip,knee}], arms:[{sh,elbow}], carry, bones}.
 */
export function jointedFigure({height=null,build=1,body='m',child=false,skin=null,hair=null,top=0x5a6b7c,topPattern=null,collar=false,sleeves=null,trousers=0x3b3630,shorts=false,dress=null,boots=0x2a2420,coat=null,apron=null,hat=null,hairStyle=null,facialHair=null,accessory=null,seed=1}={}){
  const r=rng(seed);if(height===null)height=child?1.2:body==='f'?1.65:1.75;const H=vary(r,height,0.05);build=vary(r,build*(child?0.8:body==='f'?0.92:1),0.1);const g=group('figure');const num=(v,d)=>Number.isFinite(+v)?+v:d;
  const pick=a=>a[Math.floor(r()*a.length)];const fem=body==='f';
  if(skin===null)skin=pick(SKIN_TONES);if(hair===null)hair=pick(HAIR_COLOURS);if(hairStyle===null)hairStyle=fem?pick(['long','long','bun','fringe','short']):child?pick(['short','cropped','fringe']):pick(HAIR_STYLES);if(facialHair===null)facialHair=(fem||child)?'none':pick(FACIAL_HAIR);if(accessory===null)accessory=child?pick(['none','none','cap']):pick(ACCESSORIES);
  if(sleeves===null)sleeves=coat?'long':dress?'short':pick(['long','long','short']);
  const tint=c=>toColor(c,r,0.08);const mSkin=std(tint(skin),0.7),mHair=std(tint(hair),0.9);
  const topKind=pick(['cloth','cloth','linen','twill','wool']),trKind=shorts?'twill':pick(['twill','twill','wool','cloth']);
  const mTop=garmentMaterial(dress?'cloth':topKind,tint(dress?dress.color??top:top),seed,{pattern:dress?(dress.pattern??null):topPattern}),mTr=garmentMaterial(trKind,tint(trousers),seed+1),mBoot=garmentMaterial('leather',tint(boots),seed,{repeat:3});
  const mCoat=coat?garmentMaterial(pick(['wool','wool','twill']),tint(coat),seed+2):null;const swayMats=[];
  const sph=(rad,m,ws=16,hs=12)=>mesh(new THREE.SphereGeometry(rad,ws,hs),m);
  // ---- proportions
  const heads=child?6.2:7.5;const headR=H/heads/2,shoulderW=(fem?0.225:0.245)*H*build,hipW=(fem?0.215:0.19)*H*build,legL=(child?0.44:0.47)*H,armL=0.36*H,hipY=legL;
  const waistY=hipY+0.035*H,neckLen=0.04*H;const torsoL=(H-waistY-neckLen*0.75-2.1*headR)/1.03;const collarY=waistY+1.03*torsoL;const neckR=headR*0.6;
  const thighR=0.054*H*build,kneeR=0.047*H*build,ankleR=0.036*H*build,upperR=0.046*H*build,elbowR=0.037*H*build,wristR=0.028*H*build;
  const legX=hipW*0.24, // hip joints sit inside the pelvis cross-section so thigh tops never break through the garment above
   shX=shoulderW*0.46,shY=collarY-0.075*H,kneeY=hipY-legL*0.5,ankleY=hipY-legL+0.03*H,elbowY=shY-armL*0.5,wristY=shY-armL;
  const hbY=collarY+neckLen*0.75; // head bone
  // ---- skeleton (positions given in figure space; children store the offset from their parent)
  const bones=[];const B=(name,x,y,z,parent)=>{const b=new THREE.Bone();b.name=name;b.userData.p=[x,y,z];if(parent){b.position.set(x-parent.userData.p[0],y-parent.userData.p[1],z-parent.userData.p[2]);parent.add(b);}else{b.position.set(x,y,z);g.add(b);}bones.push(b);return b;};
  const hips=B('hips',0,hipY,0),spine=B('spine',0,waistY+0.3*torsoL,0,hips),chest=B('chest',0,waistY+0.72*torsoL,0,spine),neck=B('neck',0,collarY,0,chest),headB=B('head',0,hbY,0,neck);
  const leg=sx=>{const th=B('thigh',sx*legX,hipY,0,hips),sh=B('shin',sx*legX,kneeY,0,th),ft=B('foot',sx*legX,ankleY,0,sh);return {hip:th,knee:sh,foot:ft};};
  const arm=sx=>{const up=B('upperArm',sx*shX,shY,0,chest),fo=B('foreArm',sx*shX,elbowY,0,up),hd=B('hand',sx*shX,wristY,0,fo);return {sh:up,elbow:fo,hand:hd};};
  const legs=[leg(-1),leg(1)],arms=[arm(-1),arm(1)];const bi=b=>bones.indexOf(b);
  g.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);
  const sm=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  // ---- tube builder: rings {x,y,z,rx,rz,w} where w is [[boneIndex,weight],...] or a function of the ring angle
  function tube(rings,mat,{segs=16,a0=0,a1=Math.PI*2,capTop=false,capBottom=false,sway=null}={}){
    const pos=[],uv=[],si=[],sw=[],idx=[];const cols=segs+1;
    const push=(x,y,z,u,v,w)=>{pos.push(x,y,z);uv.push(u,v);let ws=w.slice().sort((p,q)=>q[1]-p[1]).slice(0,4);while(ws.length<4)ws.push([0,0]);const tot=ws.reduce((s,q)=>s+q[1],0)||1;si.push(...ws.map(q=>q[0]));sw.push(...ws.map(q=>q[1]/tot));};
    rings.forEach((rg,i)=>{for(let k=0;k<=segs;k++){const a=a0+(a1-a0)*k/segs;push(rg.x+rg.rx*Math.sin(a),rg.y,rg.z+rg.rz*Math.cos(a),k/segs,i/(rings.length-1),typeof rg.w==='function'?rg.w(a):rg.w);}});
    const down=rings.length>1&&rings[1].y<rings[0].y; // rings may be listed top→bottom; keep the faces outward either way
    for(let i=0;i<rings.length-1;i++)for(let k=0;k<segs;k++){const a=i*cols+k,b=a+1,c=a+cols,d=c+1;if(down)idx.push(a,c,b,b,c,d);else idx.push(a,b,c,b,d,c);}
    const cap=(rg,ringIndex,up)=>{const c=pos.length/3;push(rg.x,rg.y,rg.z,0.5,0.5,typeof rg.w==='function'?rg.w(0):rg.w);const base=ringIndex*cols;for(let k=0;k<segs;k++){if(up)idx.push(c,base+k+1,base+k);else idx.push(c,base+k,base+k+1);}};
    const topIdx=down?0:rings.length-1,botIdx=down?rings.length-1:0;if(capTop)cap(rings[topIdx],topIdx,true);if(capBottom)cap(rings[botIdx],botIdx,false);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));geo.setIndex(idx);geo.computeVertexNormals();
    const m=new THREE.SkinnedMesh(geo,mat);m.castShadow=m.receiveShadow=true;g.add(m);m.bind(skeleton);return m;}
  const lerp=(a,b,t)=>a+(b-a)*t;
  // ---- ring generators
  const wst=fem?0.40:0.47,chestR=fem?0.52:0.46; // torso radius profile by height fraction from crotch(0) to collar(1)
  const prof=t=>{const P=[[0,hipW*0.50],[0.12,hipW*0.52],[0.30,hipW*wst],[0.55,shoulderW*(fem?0.40:0.36)],[0.72,shoulderW*chestR],[0.86,shoulderW*0.48],[0.94,shoulderW*0.46],[1.0,shoulderW*0.36]];for(let i=0;i<P.length-1;i++)if(t<=P[i+1][0]){const u=(t-P[i][0])/(P[i+1][0]-P[i][0]);return lerp(P[i][1],P[i+1][1],u*u*(3-2*u));}return P.at(-1)[1];};
  const torsoR=y=>prof(THREE.MathUtils.clamp((y-(waistY-0.035*H))/(collarY-(waistY-0.035*H)),0,1));
  const torsoRings=(pad,y0,y1,n=11)=>{const out=[];
    for(let i=0;i<n;i++){const y=lerp(y0,y1,i/(n-1)),t=THREE.MathUtils.clamp((y-(waistY-0.035*H))/(collarY-(waistY-0.035*H)),0,1),rad=torsoR(y)+pad;
      const wc=sm(0.5,0.8,t),wh=1-sm(0.15,0.4,t),ws=Math.max(0,1-wc-wh);out.push({x:0,y,z:0,rx:rad,rz:rad*0.62,w:[[bi(hips),wh],[bi(spine),ws],[bi(chest),wc]]});}return out;};
  const limbRings=(sx,top,bottom,rTop,rMid,rBot,jointY,bTop,bMid,bRoot,n=13,pad=0,topTaper=1)=>{const out=[];for(let i=0;i<n;i++){const y=lerp(top,bottom,i/(n-1)),s=(top-y)/(top-bottom);const wj=sm(-0.08,0.08,(jointY-y)/(top-bottom));
      const rad=((s<0.5?lerp(rTop,rMid,s/0.5):lerp(rMid,rBot,(s-0.5)/0.5))+pad)*lerp(topTaper,1,sm(0,0.22,s)); /* topTaper<1 narrows the hidden top rings inside the pelvis */ const wRoot=bRoot!==null?1-sm(0,0.12,s):0;out.push({x:sx,y,z:0,rx:rad,rz:rad,w:[[bTop,(1-wj)*(1-wRoot)],[bMid,wj*(1-wRoot)],...(bRoot!==null?[[bRoot,wRoot]]:[])]});}return out;};
  // ---- skin: neck, arms, legs (torso and pelvis are always covered)
  tube([{x:0,y:collarY-0.02*H,z:0,rx:neckR,rz:neckR,w:[[bi(neck),1]]},{x:0,y:hbY+headR*0.35,z:0,rx:neckR*0.95,rz:neckR*0.95,w:[[bi(headB),1]]}],mSkin,{segs:12});
  // hands: palm, four curling fingers and a thumb on each hand bone; hold() curls them around the object
  const buildHand=(a,sx)=>{const hg=new THREE.Group();hg.position.y=-0.005*H;a.hand.add(hg);const pw=0.042*H,pl=0.05*H,pt=0.018*H;
    const palm=mesh(new THREE.SphereGeometry(1,12,8),mSkin);palm.scale.set(pw*0.5,pl*0.5,pt*0.5);palm.position.y=-pl*0.5;hg.add(palm);
    const fingers=[];for(let k=0;k<4;k++){const fx=(k-1.5)*pw*0.24;const root=new THREE.Group();root.position.set(fx,-pl*0.95,0);const len=0.04*H*(k===0||k===3?0.85:1);
      const f1=mesh(new THREE.CylinderGeometry(0.0055*H,0.0065*H,len*0.55,6,1),mSkin);f1.position.y=-len*0.275;root.add(f1);const mid=new THREE.Group();mid.position.y=-len*0.55;root.add(mid);
      const f2=mesh(new THREE.CylinderGeometry(0.0045*H,0.0055*H,len*0.45,6,1),mSkin);f2.position.y=-len*0.225;mid.add(f2);const tip=mesh(new THREE.SphereGeometry(0.0048*H,6,5),mSkin);tip.position.y=-len*0.45;mid.add(tip);hg.add(root);fingers.push({root,mid});}
    const thumb=new THREE.Group();thumb.position.set(-sx*pw*0.55,-pl*0.35,pt*0.2);thumb.rotation.z=sx*0.9;thumb.rotation.y=-sx*0.4;const t1=mesh(new THREE.CylinderGeometry(0.006*H,0.0075*H,0.03*H,6,1),mSkin);t1.position.y=-0.015*H;thumb.add(t1);hg.add(thumb);
    a.handRig={group:hg,fingers,thumb,curl(c){for(const f of fingers){f.root.rotation.x=-(0.25+1.0*c);f.mid.rotation.x=-(0.3+1.0*c);}thumb.rotation.x=-(0.2+0.8*c);}};a.handRig.curl(0.15);return hg;};
  for(const [i,a] of arms.entries()){const sx=i?1:-1;tube(limbRings(sx*shX,shY+0.02*H,wristY,upperR,elbowR,wristR,elbowY,bi(a.sh),bi(a.elbow),bi(chest)),mSkin,{segs:12});buildHand(a,sx);}
  for(const [i,l] of legs.entries()){const sx=i?1:-1;tube(limbRings(sx*legX,hipY+0.03*H,ankleY,thighR,kneeR,ankleR,kneeY,bi(l.hip),bi(l.knee),bi(hips),13,0,0.72),mSkin,{segs:12});}
  // ---- garments
  const bodice=dress||coat?null:null;
  const shirtMat=coat?mCoat:mTop;
  tube(torsoRings(0.012,(dress||coat)?waistY-0.05*H:hipY+0.01*H,collarY-0.005*H),shirtMat,{segs:18,capTop:true}); // shirt / bodice / coat body, one surface; the bodice reaches below the skirt's emergence
  if(collar){const cr=mesh(new THREE.CylinderGeometry(neckR*1.9,neckR*1.5,0.035*H,16,1,true),shirtMat);cr.position.y=collarY-0.012*H-bones[bi(neck)].userData.p[1];cr.scale.z=0.8;neck.add(cr);}
  const sleeveEnd=sleeves==='long'?wristY+0.02*H:elbowY+0.06*H;
  for(const [i,a] of arms.entries()){const sx=i?1:-1;tube(limbRings(sx*shX,shY+0.03*H,sleeveEnd,upperR,elbowR,wristR,elbowY,bi(a.sh),bi(a.elbow),bi(chest),9,0.011),shirtMat,{segs:12,capBottom:true});}
  if(!dress){ // trousers or shorts: pelvis + legs, same rings as the skin plus a little ease
    // trousers tuck INSIDE the shirt/coat: pelvis radius follows the torso profile with less ease than the garment over it
    const pel=[];for(let i=0;i<5;i++){const y=lerp(waistY+0.03*H,hipY-0.02*H,i/4);const rad=torsoR(y)+0.006;pel.push({x:0,y,z:0,rx:rad,rz:rad*0.62,w:[[bi(hips),1]]});}
    tube(pel,mTr,{segs:18,capTop:true});
    const legEnd=shorts?hipY-legL*0.28:ankleY+0.02*H;
    for(const [i,l] of legs.entries()){const sx=i?1:-1;tube(limbRings(sx*legX,hipY+0.01*H,legEnd,thighR,kneeR,ankleR,kneeY,bi(l.hip),bi(l.knee),bi(hips),shorts?5:13,0.01,0.75),mTr,{segs:12,capBottom:shorts});}
  }
  // skirt (dress or coat): rings from the waist to the hem; each vertex follows the leg on its side more the lower it is
  // Skirt: starts INSIDE the bodice with the bodice's own cross-section (no ledge), rounds out toward the hem, and each
  // vertex binds to the leg on its side (fully at the hem on the sides, half/half at the centre front and back) so the
  // legs carry the cloth with them instead of passing through it. followMax: dress 0.9, coat 0.55.
  const skirt=(mat,len,hemR,swayAmt,followMax=0.9,pad=0.012,round=1.0)=>{const ms=garmentMaterial(mat.kind,mat.color,mat.seed,{pattern:mat.pattern??null,sway:swayAmt});ms.userData.sway.uTop.value=waistY;ms.userData.sway.uHem.value=len;swayMats.push(ms);
    const yTop=waistY+0.06*H,n=11,rings=[];
    for(let i=0;i<n;i++){const s=i/(n-1),y=yTop-s*(len+0.05*H);const k=s*s*(3-2*s);const inside=-0.006+(pad+0.006)*sm(0,0.16,s); // the top rings sit inside the bodice, then the skirt grows past it
      const rx=lerp(torsoR(yTop)+inside,hemR,s*s*0.55+s*0.45),rz=rx*lerp(0.62,round,k);const follow=sm(0.12,0.75,s)*followMax;
      rings.push({x:0,y,z:0,rx,rz,w:a=>{const x=Math.sin(a);const fL=sm(-0.2,0.2,-x);return [[bi(hips),1-follow],[bi(legs[0].hip),follow*fL],[bi(legs[1].hip),follow*(1-fL)]];}});}
    return tube(rings,ms,{segs:22});};
  if(dress)skirt({kind:'cloth',color:tint(dress.color??top),seed,pattern:dress.pattern??null},(dress.length??0.6)*legL,shoulderW*(0.62+0.4*(dress.flare??1)),0.02);
  if(coat)skirt({kind:'wool',color:tint(coat),seed:seed+2},legL*0.28+torsoL*0.15,shoulderW*0.5,0.012,0.6,0.014,0.78); // a coat hangs straighter than a dress
  if(apron){const ms=garmentMaterial('linen',tint(apron),seed+3,{sway:0.008});ms.userData.sway.uTop.value=waistY+torsoL*0.5;ms.userData.sway.uHem.value=torsoL*0.5+legL*0.25;swayMats.push(ms);ms.side=THREE.DoubleSide;
    const rings=[];for(let i=0;i<7;i++){const s=i/6,y=waistY+torsoL*0.55-s*(torsoL*0.55+legL*0.25),rad=lerp(shoulderW*0.42,shoulderW*0.58,s)+0.02;const follow=sm(0.5,1,s)*0.8;
      rings.push({x:0,y,z:0.01*H,rx:rad,rz:rad*0.85,w:a=>{const x=Math.sin(a);const fL=sm(-0.35,0.35,-x);return [[bi(hips),(1-follow)*(1-sm(0.3,0.5,1-s))],[bi(chest),(1-follow)*sm(0.3,0.5,1-s)],[bi(legs[0].hip),follow*fL],[bi(legs[1].hip),follow*(1-fL)]];}});}
    tube(rings,ms,{segs:14,a0:-Math.PI*0.42,a1:Math.PI*0.42});}
  // ---- boots (rigid, on the foot bones)
  for(const l of legs){const fw=0.07*H,fl=0.15*H,fz=0.035*H,fy=-0.03*H;const foot=group('boot');
    const upper=sph(1,mBoot,14,10);upper.scale.set(fw*0.5,0.032*H,fl*0.5);upper.position.set(0,fy+0.032*H,fz);
    const toe=sph(1,mBoot,12,8);toe.scale.set(fw*0.44,0.026*H,0.045*H);toe.position.set(0,fy+0.026*H,fz+fl*0.5-0.035*H);
    const heel=sph(1,mBoot,10,8);heel.scale.set(fw*0.42,0.03*H,0.035*H);heel.position.set(0,fy+0.03*H,fz-fl*0.5+0.03*H);
    const instep=sph(1,mBoot,12,8);instep.scale.set(ankleR*1.25,0.045*H,ankleR*1.5);instep.position.set(0,fy+0.045*H,0.008*H);
    const cuff=cyl(ankleR*1.2,ankleR*1.3,0.05*H,mBoot,0,fy+0.055*H,0,12);foot.add(upper,toe,heel,instep,cuff);l.foot.add(foot);l.footGroup=foot;}
  // ---- head rig: everything below is positioned in figure space, parented to the head bone
  const hg=new THREE.Group();hg.position.y=-hbY;headB.add(hg);
  const head=sph(headR,mSkin);head.position.y=hbY+headR*1.05;head.scale.set(0.9,1.05,0.95);hg.add(head);
  const jaw=sph(headR*0.78,mSkin);jaw.position.set(0,head.position.y-headR*0.45,headR*0.1);jaw.scale.set(0.85,0.7,0.9);hg.add(jaw);
  const hy=head.position.y;
  // face: eyes with pupils, brows, nose, mouth, ears
  for(const s of [-1,1]){const eye=sph(headR*0.11,std(0xf4f0ea,0.4),10,8);eye.position.set(s*headR*0.34,hy+headR*0.02,headR*0.82);eye.scale.set(1,0.8,0.55);hg.add(eye);
    const pupil=sph(headR*0.05,std(0x1a1410,0.3),8,6);pupil.position.set(s*headR*0.34,hy+headR*0.02,headR*0.88);hg.add(pupil);
    const brow=box(headR*0.3,headR*0.045,headR*0.06,mHair,s*headR*0.34,hy+headR*0.2,headR*0.86);brow.rotation.z=-s*0.15;brow.rotation.x=0.3;hg.add(brow);}
  const nose=sph(headR*0.16,mSkin,8,6);nose.position.set(0,hy-headR*0.12,headR*0.92);nose.scale.set(0.8,1,1.2);hg.add(nose);
  const mouth=box(headR*0.36,headR*0.05,headR*0.05,std(toColor(0x8a4a3a,r,0.1),0.6),0,hy-headR*0.45,headR*0.86);mouth.rotation.x=0.35;hg.add(mouth);
  for(const s of [-1,1]){const ear=sph(headR*0.2,mSkin,8,6);ear.position.set(s*headR*0.9,hy,0);ear.scale.set(0.5,1,0.8);hg.add(ear);}
  // facial hair
  const mBeard=std(tint(hair),0.95);
  if(facialHair==='beard'){const b=sph(headR*0.82,mBeard,14,10);b.position.set(0,hy-headR*0.55,headR*0.12);b.scale.set(0.95,0.75,0.9);hg.add(b);}
  else if(facialHair==='stubble'){const b=sph(headR*0.8,std(toColor(hair,r,0.3),0.95),14,10);b.position.set(0,hy-headR*0.5,headR*0.1);b.scale.set(0.9,0.55,0.86);b.material.transparent=true;b.material.opacity=0.45;hg.add(b);}
  else if(facialHair==='moustache'){const m=box(headR*0.5,headR*0.1,headR*0.1,mBeard,0,hy-headR*0.3,headR*0.86);hg.add(m);}
  // hair by style. Decide the hat first: under a hat the hair is a low rim that stays inside the crown.
  const hatSpec=hat?(typeof hat==='object'&&!Array.isArray(hat)&&!(hat.isColor)?hat:{kind:'brim',color:hat}):null;
  const hatKind=hatSpec?.kind||(accessory==='cap'?'cap':null);const hatColor=hatSpec?.color??0x2a2420;
  const capOf=(scaleY,back)=>{const hc=sph(headR*1.04,mHair,16,12);hc.position.copy(head.position);hc.position.y+=headR*0.18;hc.position.z-=headR*back;hc.scale.set(0.96,scaleY,0.9);if(hatKind){hc.scale.set(0.9,Math.min(scaleY,0.55),0.86);hc.position.y=head.position.y+headR*0.05;}return hc;};
  if(hairStyle==='short')hg.add(capOf(0.82,0.1));
  else if(hairStyle==='cropped'){const hc=capOf(0.76,0.1);hc.scale.multiplyScalar(0.985);hg.add(hc);}
  else if(hairStyle==='fringe'){hg.add(capOf(0.84,0.08));if(!hatKind)hg.add(box(headR*1.3,headR*0.22,headR*0.3,mHair,0,hy+headR*0.62,headR*0.72));}
  else if(hairStyle==='long'){hg.add(capOf(0.86,0.1));const fall=sph(headR,mHair,14,10);fall.position.set(0,hy-headR*0.5,-headR*0.55);fall.scale.set(0.95,1.3,0.55);hg.add(fall);}
  else if(hairStyle==='bun'){hg.add(capOf(0.78,0.12));const bun=sph(headR*0.42,mHair,10,8);bun.position.set(0,hy+headR*0.35,-headR*0.95);hg.add(bun);}
  // hats: hex/colour = brimmed hat; {kind:'brim'|'cap'|'scarf'|'straw'|'beanie', color}. Every crown is wider than the
  // hair (1.04 headR) and its top is above the skull (hy + 1.05 headR), so nothing shows through; hair under a hat is a rim.
  if(hatKind){const hm=std(tint(hatColor),0.85);
    if(hatKind==='brim'){hg.add(cyl(headR*1.45,headR*1.45,0.015,hm,0,hy+headR*0.5,0,20));hg.add(cyl(headR*1.05,headR*1.1,headR*1.0,hm,0,hy+headR*0.5+headR*0.5,0,20));}
    else if(hatKind==='straw'){const sm2=std(tint(0xd8c27a),0.9);hg.add(cyl(headR*1.75,headR*1.8,0.012,sm2,0,hy+headR*0.55,0,22));hg.add(cyl(headR*1.05,headR*1.1,headR*0.7,sm2,0,hy+headR*0.55+headR*0.35,0,20));}
    else if(hatKind==='cap'){const crown=sph(headR*1.14,hm,16,10);crown.position.set(0,hy+headR*0.42,-headR*0.05);crown.scale.set(1,0.68,1.05);hg.add(crown);const band=cyl(headR*1.1,headR*1.12,headR*0.2,hm,0,hy+headR*0.5,-headR*0.05,18);hg.add(band);const peak=box(headR*1.1,0.012,headR*0.62,hm,0,hy+headR*0.52,headR*1.36);peak.rotation.x=0.28;hg.add(peak);}
    else if(hatKind==='beanie'){const b=sph(headR*1.14,hm,16,10);b.position.set(0,hy+headR*0.3,-headR*0.05);b.scale.set(1,0.9,1);hg.add(b);}
    else if(hatKind==='scarf'){const sc=sph(headR*1.12,hm,16,12);sc.position.set(0,hy+headR*0.15,-headR*0.08);sc.scale.set(1,0.98,1);hg.add(sc);const knot=sph(headR*0.3,hm,8,6);knot.position.set(0,hy-headR*0.6,-headR*0.7);hg.add(knot);}}
  // accessories
  if(accessory==='belt'&&!coat){{const belt=cyl(hipW*0.55,hipW*0.55,0.03*H,std(0x2a1e14,0.6),0,waistY+0.01*H-hipY,0,18);belt.scale.z=0.64;hips.add(belt);const buckle=box(0.03*H,0.025*H,0.01*H,std(0xb08a3a,0.4,0.8),0,waistY+0.01*H-hipY,hipW*0.36);hips.add(buckle);}}
  else if(accessory==='scarf'){const sc=mesh(new THREE.TorusGeometry(neckR*1.7,neckR*0.55,8,18),std(tint(pick([0x8a2a2a,0x2a4a7a,0x7a6a3a,0xe8e0cc])),0.95));sc.rotation.x=Math.PI/2;sc.position.y=collarY+0.005*H;hg.add(sc);}
  else if(accessory==='satchel'){const mLeather=std(0x5a3a22,0.7);const bag=box(0.16*H,0.12*H,0.05*H,mLeather,shoulderW*0.55,waistY-0.02*H-hipY,0.02*H);hips.add(bag);const strap=cyl(0.008*H,0.008*H,torsoL*1.1,mLeather,0,waistY+torsoL*0.5-bones[bi(spine)].userData.p[1],0.02*H,6);strap.rotation.z=-0.55;spine.add(strap);}
  else if(accessory==='glasses'){const mG=std(0x222222,0.4,0.6);for(const s of [-1,1]){const rim=mesh(new THREE.TorusGeometry(headR*0.17,headR*0.02,6,14),mG);rim.position.set(s*headR*0.34,hy+headR*0.02,headR*0.9);hg.add(rim);}hg.add(box(headR*0.16,headR*0.02,headR*0.02,mG,0,hy+headR*0.02,headR*0.9));}
  const carry=new THREE.Group();carry.position.set(0,waistY+torsoL*0.45-bones[bi(spine)].userData.p[1],0.16*H);spine.add(carry);
  g.userData.parts={head,torso:chest,legs,arms,carry,bones,skeleton};g.userData.height=H;g.userData.stride=0.42*H;
  // ---- hands and props. hold() parents an object to a hand (or to the carry point for two-handed loads) and the arm is
  // posed around it; reach() is a two-bone IK that puts a hand on a world point; release() hands the object to a new parent
  // keeping its world transform. Use these for every basket, bucket, tool, loaf or rope: nothing should float beside a hand.
  const L1=armL*0.5,L2=armL*0.5,held=[null,null],handIndex=h=>h==='left'?0:1;
  g.userData.hold=function(obj,{hand='right',offset=null,rotation=null}={}){
    if(hand==='both'){held[0]=held[1]={obj,both:true};for(const a of arms){a.sh.rotation.set(-0.5,0,0);a.elbow.rotation.set(-1.2,0,0);a.handRig?.curl(0.7);}g.updateMatrixWorld(true);
      const m=new THREE.Vector3(),h=new THREE.Vector3();for(const a of arms){a.hand.getWorldPosition(h);m.add(h);}m.multiplyScalar(0.5);carry.attach(obj);carry.worldToLocal(m);
      obj.position.copy(m).add(new THREE.Vector3(...(offset??[0,-0.02*H,0])));if(rotation)obj.rotation.set(...rotation);return obj;} // the load sits between the two hands
    const i=handIndex(hand);arms[i].hand.attach(obj);
    if(offset)obj.position.set(...offset);else{ // default: the object's top (a handle, a haft) sits in the palm, the rest hangs below
      obj.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(obj);const top=Number.isFinite(bb.max.y)?bb.max.y-obj.getWorldPosition(new THREE.Vector3()).y:0;obj.position.set(0,-0.03*H-top,0.012*H);}
    if(rotation)obj.rotation.set(...rotation);held[i]={obj,both:false};arms[i].handRig?.curl(1);return obj;};
  g.userData.release=function(obj,newParent){newParent.attach(obj);for(let i=0;i<2;i++)if(held[i]&&held[i].obj===obj){held[i]=null;arms[i].handRig?.curl(0.15);}return obj;};
  const _t=new THREE.Vector3(),_q=new THREE.Quaternion(),_qx=new THREE.Quaternion(),_down=new THREE.Vector3(0,-1,0),_x=new THREE.Vector3(1,0,0);
  g.userData.reach=function(target,{hand='right'}={}){const i=handIndex(hand),a=arms[i];chest.updateWorldMatrix(true,false);
    _t.copy(target);chest.worldToLocal(_t);_t.sub(a.sh.position);const d=THREE.MathUtils.clamp(_t.length(),0.05,L1+L2-0.005);_t.normalize();
    const cosE=THREE.MathUtils.clamp((L1*L1+L2*L2-d*d)/(2*L1*L2),-1,1),E=Math.acos(cosE),alpha=Math.acos(THREE.MathUtils.clamp((L1*L1+d*d-L2*L2)/(2*L1*d),-1,1));
    _q.setFromUnitVectors(_down,_t);_qx.setFromAxisAngle(_x,alpha);a.sh.quaternion.copy(_q).multiply(_qx);a.elbow.rotation.set(-(Math.PI-E),0,0);return g;};
  // Stride phase: from `distance` if given; otherwise from the metres this figure has actually moved between pose calls
  // (so a builder that drives position directly still gets planted feet); time × speed only when it has not moved.
  let travelled=0,lastPos=null;
  g.userData.pose=function(t,{walk=0,speed=1.2,distance=null,lean=0,reach=null}={}){t=num(t,0);walk=num(walk,0);speed=num(speed,1.2);lean=num(lean,0);
    if(lastPos){const d=g.position.distanceTo(lastPos);if(d<2)travelled+=d;}lastPos=g.position.clone();
    const dist=distance!==null&&Number.isFinite(+distance)?+distance:(travelled>0.02?travelled:t*speed);const ph=dist/g.userData.stride*Math.PI*2;
    legs.forEach((l,i)=>{const s=i?1:-1;l.hip.rotation.x=Math.sin(ph+s*Math.PI/2)*0.4*walk;l.knee.rotation.x=Math.max(0,-Math.sin(ph+s*Math.PI/2+0.9))*0.85*walk;});
    arms.forEach((a,i)=>{const s=i?-1:1;a.sh.quaternion.identity();
      if(held[i]&&held[i].both){a.sh.rotation.set(-0.5,0,(i?-1:1)*0.1);a.elbow.rotation.set(-1.2,0,0);} // both hands forward under a load (negative x = forward on this rig)
      else if(held[i]){a.sh.rotation.set(-0.08-0.04*Math.sin(ph)*walk,0,(i?-1:1)*0.14);a.elbow.rotation.set(-0.35,0,0);} // carrying at the side: no swing, hand a little forward of the hip
      else{a.sh.rotation.set(Math.sin(ph+s*Math.PI/2)*0.35*walk,0,(i?-1:1)*0.06);a.elbow.rotation.set(-0.3-0.25*walk,0,0);}});
    if(reach)for(const r of Array.isArray(reach)?reach:[reach])if(r&&r.target)g.userData.reach(r.target,{hand:r.hand??'right'});
    spine.rotation.x=lean*0.6;chest.rotation.x=lean*0.4;g.position.y=Math.abs(Math.sin(ph))*0.02*walk;for(const m of swayMats)m.userData.sway.uTime.value=t+walk*ph*0.15;return g;};
  g.userData.pose(0);return g;
}

/**
 * Quadruped: kind 'dog' (≈0.55 m shoulder) or 'horse' (≈1.6 m), origin on the ground between the feet, faces +Z.
 * Barrel + chest and haunch masses, jointed neck/head chain, four limb() legs with joint spheres and hooves, tail,
 * mane for horses. userData.pose(t,{walk,speed,headDown:0..1,tailSwish}) drives a diagonal gait. `seed` varies size and tint.
 */
export function quadruped({kind='dog',coat=0x6b4a2f,coat2=0x3a2a1c,shoulder,seed=1}={}){
  const r=rng(seed);const S=vary(r,shoulder??(kind==='horse'?1.6:0.55),0.08),g=group(kind);const num=(v,d)=>Number.isFinite(+v)?+v:d;
  const m1=std(toColor(coat,r,0.1),0.85),m2=std(toColor(coat2,r,0.1),0.9);const horse=kind==='horse';
  const cap=(rad,len,m)=>mesh(new THREE.CapsuleGeometry(rad,Math.max(0.01,len-2*rad),4,12),m),sph=(rad,m)=>mesh(new THREE.SphereGeometry(rad,12,10),m);
  const L=horse?1.1*S:1.25*S,legL=horse?0.58*S:0.55*S,bodyR=horse?0.26*S:0.22*S,bodyY=legL+bodyR*0.6;
  const body=cap(bodyR,L,m1);body.rotation.x=Math.PI/2;body.position.y=bodyY;g.add(body);
  const chest=sph(bodyR*1.05,m1);chest.position.set(0,bodyY-bodyR*0.05,L*0.34);chest.scale.set(0.95,1.05,0.9);g.add(chest);      // shoulder mass
  const haunch=sph(bodyR*1.08,m1);haunch.position.set(0,bodyY+bodyR*0.05,-L*0.34);haunch.scale.set(1,1.1,0.95);g.add(haunch);    // hindquarters
  const neckLen=horse?0.62*S:0.34*S,neckBase=horse?0.8:1.0,headBase=horse?1.3:0.9;
  const neckJ=group('neck');neckJ.position.set(0,legL+bodyR*0.8,L*0.42);neckJ.rotation.x=neckBase; // +x tips local +Y forward
  const neck=cap(bodyR*0.5,neckLen,m1);neck.position.y=neckLen/2;neckJ.add(sph(bodyR*0.5,m1),neck);
  const headJ=group('head');headJ.position.set(0,neckLen,0);headJ.rotation.x=headBase;const headLen=horse?0.55*S:0.3*S;
  const head=cap(bodyR*0.4,headLen,m2);head.position.y=headLen/2-bodyR*0.2;headJ.add(sph(bodyR*0.45,m1),head);
  const muzzle=sph(bodyR*0.3,m2);muzzle.position.y=headLen-bodyR*0.15;muzzle.scale.set(0.85,0.8,1);headJ.add(muzzle);
  for(const s of [-1,1]){const e=box(bodyR*0.22,bodyR*0.4,bodyR*0.1,m2,s*bodyR*0.3,bodyR*0.1,-bodyR*0.3);e.rotation.x=-0.6;headJ.add(e);
    const eye=sph(bodyR*0.06,std(0x111111,0.4));eye.position.set(s*bodyR*0.3,headLen*0.45,bodyR*0.25);headJ.add(eye);}
  neckJ.add(headJ);g.add(neckJ);
  if(horse){for(let i=0;i<7;i++){const tuft=box(bodyR*0.12,bodyR*0.35,bodyR*0.16,m2,0,neckLen*(0.12+i*0.13),-bodyR*0.45);tuft.rotation.x=-0.5;neckJ.add(tuft);}}
  const legs=[[-1,1],[1,1],[-1,-1],[1,-1]].map(([sx,sz])=>{const hip=group('hip');hip.position.set(sx*bodyR*0.7,legL+bodyR*0.2,sz*L*0.36);
    const up=limb({radius:bodyR*0.32,length:legL*0.55,material:m1});const knee=group('knee');knee.position.y=-legL*0.55;
    const low=limb({radius:bodyR*0.22,length:legL*0.5,material:m2});const hoof=box(bodyR*0.45,bodyR*0.25,bodyR*0.5,m2,0,-legL*0.5,0);
    knee.add(sph(bodyR*0.26,m1),low,hoof);hip.add(sph(bodyR*0.34,m1),up,knee);g.add(hip);return {hip,knee,sz,sx};});
  const tail=limb({radius:bodyR*0.15,length:horse?0.5*S:0.3*S,material:m2});tail.position.set(0,legL+bodyR*0.9,-L*0.5);tail.rotation.x=horse?0.2:-1.2;g.add(tail);
  if(horse){const dock=box(bodyR*0.3,horse?0.5*S:0.3*S,bodyR*0.3,m2,0,-(0.5*S)/2,0);tail.add(dock);}
  g.userData.parts={body,neckJ,headJ,legs,tail};g.userData.shoulder=S;
  g.userData.stride=0.8*S;
  let travelled=0,lastPos=null;
  g.userData.pose=function(t,{walk=0,speed=1,distance=null,headDown=0,tailSwish=1}={}){
    t=num(t,0);walk=num(walk,0);speed=num(speed,1);headDown=num(headDown,0);tailSwish=num(tailSwish,1);
    if(lastPos){const d=g.position.distanceTo(lastPos);if(d<2)travelled+=d;}lastPos=g.position.clone();
    const ph=(distance!==null&&Number.isFinite(+distance)?+distance:(travelled>0.02?travelled:t*speed))/g.userData.stride*Math.PI*2; // distance-driven: no foot slide
    legs.forEach(l=>{const diag=(l.sx*l.sz>0)?0:Math.PI;l.hip.rotation.x=Math.sin(ph+diag)*0.45*walk;l.knee.rotation.x=Math.max(0,Math.sin(ph+diag+1.2))*0.7*walk;});
    neckJ.rotation.x=neckBase+headDown*(horse?1.1:0.7);headJ.rotation.x=headBase-headDown*0.6;
    tail.rotation.z=Math.sin(t*2.1)*0.35*tailSwish;body.position.y=bodyY+Math.abs(Math.sin(ph))*0.01*S*walk;return g;};
  g.userData.pose(0);return g;
}

/** Fowl (hen ≈0.35 m, rooster taller with a bigger comb and tail). Origin at the feet, faces +Z. pose(t,{walk,peck:0..1,speed}). */
export function fowl({plumage=0xb3562a,comb=0xc8222a,beak=0xd9a441,height=0.35,rooster=false,seed=1}={}){
  const r=rng(seed);const H=vary(r,height*(rooster?1.25:1),0.1),g=group(rooster?'rooster':'hen');const num=(v,d)=>Number.isFinite(+v)?+v:d;
  const m1=std(toColor(plumage,r,0.14),0.9),mComb=std(toColor(comb),0.6),mBeak=std(toColor(beak),0.5),mLeg=std(0xd9a441,0.7);
  const sph=(rad,m)=>mesh(new THREE.SphereGeometry(rad,12,10),m),cap=(rad,len,m)=>mesh(new THREE.CapsuleGeometry(rad,Math.max(0.01,len-2*rad),4,10),m);
  const body=sph(H*0.32,m1);body.scale.set(0.85,0.8,1.15);body.position.y=H*0.5;g.add(body);
  const mFeather=std(toColor(plumage,r,0.2),0.9),mFeather2=std(toColor(plumage,r,0.35),0.9);
  // wings as three overlapping feather rows stepping back and down; a breast and a neck ruff give the body a bird's profile
  for(const s of [-1,1])for(let k=0;k<3;k++){const wing=sph(H*0.2,k%2?mFeather2:mFeather);wing.scale.set(0.22,0.55-k*0.08,0.95-k*0.15);wing.position.set(s*(H*0.25+k*H*0.02),H*(0.52-k*0.05),-H*(0.02+k*0.05));wing.rotation.x=-0.25-k*0.15;g.add(wing);}
  const breast=sph(H*0.24,mFeather);breast.scale.set(0.7,0.8,0.75);breast.position.set(0,H*0.42,H*0.16);g.add(breast);
  const ruff=sph(H*0.15,mFeather2);ruff.scale.set(0.9,0.6,0.9);ruff.position.set(0,H*0.64,H*0.24);g.add(ruff);
  // tail as a fan of thin feathers
  const tailN=rooster?6:4;for(let i=0;i<tailN;i++){const f=sph(1,i%2?mFeather2:m1);f.scale.set(H*0.018,H*(rooster?0.2:0.13),H*0.06);f.position.set((i-(tailN-1)/2)*H*0.025,H*(rooster?0.8:0.7),-H*(rooster?0.38:0.32));f.rotation.x=-(0.55+i*0.08);f.rotation.z=(i-(tailN-1)/2)*0.28;g.add(f);}
  const neckJ=group('neck');neckJ.position.set(0,H*0.6,H*0.28);const neck=cap(H*0.08,H*0.28,m1);neck.position.y=H*0.14;neck.rotation.x=-0.3;neckJ.add(neck);
  const head=sph(H*0.11,m1);head.position.set(0,H*0.3,H*0.06);neckJ.add(head);const cb=box(H*0.03,H*(rooster?0.14:0.08),H*0.12,mComb,0,H*(rooster?0.43:0.4),H*0.06);neckJ.add(cb);
  const wattle=sph(H*0.035,mComb);wattle.position.set(0,H*0.22,H*0.12);neckJ.add(wattle);
  const bk=mesh(new THREE.ConeGeometry(H*0.03,H*0.09,6),mBeak,0,H*0.29,H*0.2);bk.rotation.x=Math.PI/2;neckJ.add(bk);
  for(const s of [-1,1]){const eye=sph(H*0.018,std(0x111111,0.4));eye.position.set(s*H*0.08,H*0.32,H*0.12);neckJ.add(eye);}
  g.add(neckJ);
  const legs=[-1,1].map(s=>{const l=limb({radius:H*0.02,length:H*0.3,material:mLeg});l.position.set(s*H*0.1,H*0.32,0);const foot=box(H*0.1,H*0.015,H*0.14,mLeg,0,-H*0.3,H*0.03);l.add(foot);g.add(l);return l;});
  g.userData.parts={body,neckJ,legs};g.userData.height=H;
  g.userData.stride=0.24*H/0.35;let travelled=0,lastPos=null;
  g.userData.pose=function(t,{walk=0,peck=0,speed=0.5,distance=null}={}){t=num(t,0);walk=num(walk,0);peck=num(peck,0);speed=num(speed,0.5);if(lastPos){const d=g.position.distanceTo(lastPos);if(d<2)travelled+=d;}lastPos=g.position.clone();const ph=(distance!==null&&Number.isFinite(+distance)?+distance:(travelled>0.02?travelled:t*speed))/g.userData.stride*Math.PI*2;
    legs.forEach((l,i)=>{l.rotation.x=Math.sin(ph+i*Math.PI)*0.5*walk;});neckJ.rotation.x=-0.2+peck*1.3+Math.sin(ph)*0.1*walk;body.position.y=H*0.5+Math.abs(Math.sin(ph))*H*0.02*walk;return g;};
  g.userData.pose(0);return g;
}
