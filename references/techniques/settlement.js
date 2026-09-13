// settlement.js — streets, lots and buildings for a hamlet, village, town or city around the stage.
//
// Two phases, because streets must be carved into the terrain before buildings can stand on it:
//   const plan=planSettlement({center:[0,0], kind:'town', seed:5, radius:220, axis:[1,0.2], stageRadius:40});
//   const terrain=createTerrain({..., roads:[...plan.roads], pads:plan.pads});
//   const town=buildSettlement(plan, terrain, {seed:5, detailRadius:260});   scene.add(town.group);
//
// plan: {streets:[{points,width,kind}], roads (same, terrain format), lots:[{x,z,yaw,w,d,storeys,style,roof,landmark?}],
//        pads (terrain format), square:{x,z,r}|null, walkNetwork:[[x,z],...][]}
// build: {group, buildings:[{x,z,yaw,w,d,storeys,door:{x,z}}], occupied(x,z,margin) → bool, doors:[{x,z,facing:[dx,dz]}]}
//
// Buildings are assemblies: walls with real reveals (wallWithOpenings, shaded rooms behind), window frames and planked
// doors near the stage, a stone plinth, eaves, a gable or hip roof in tile, slate or thatch, chimneys with caps, and a
// style (stone / plaster / brick / timber-framed) per building drawn from the settlement's palette. Beyond
// `detailRadius` the same silhouettes carry dark window insets instead of reveals, so a city of 400 stays under budget.
import * as THREE from 'three';
import {createSurface} from './surface-materials.js';
import {createMasonry} from './procedural-masonry.js';
import {wallWithOpenings} from './wall-openings.js';
import {rng,plankedPanel,frame,box,mesh,group,toColor,std} from './parts.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const KINDS={hamlet:{blocks:0,lanes:1,count:8,storeys:[1,2],radius:90},village:{blocks:0,lanes:3,count:32,storeys:[1,2],radius:160},
  town:{blocks:4,lanes:0,count:120,storeys:[2,3],radius:240},city:{blocks:8,lanes:0,count:380,storeys:[3,4],radius:420}};

// ---- plan ----------------------------------------------------------------------------------------------------
export function planSettlement({center=[0,0],kind='village',seed=1,radius=null,axis=[1,0],stageRadius=40,mainRoad=null,styles=null}={}){
  const r=rng(seed*7+3);const K=KINDS[kind]??KINDS.village;const R=radius??K.radius;const [cx,cz]=center;
  const ax=new THREE.Vector2(axis[0],axis[1]).normalize();const px=new THREE.Vector2(-ax.y,ax.x); // along / across
  const P=(u,v)=>[cx+ax.x*u+px.x*v,cz+ax.y*u+px.y*v];
  const streets=[],lots=[];const square=(kind==='town'||kind==='city')?{x:cx,z:cz,r:stageRadius+6}:null;
  const addStreet=(pts,width,kindName)=>{streets.push({points:pts,width,kind:kindName});};
  const jitter=(p,a)=>[p[0]+(r()*2-1)*a,p[1]+(r()*2-1)*a];
  if(K.blocks===0){
    // main road straight through, lanes branching off it, buildings along every street with gaps
    const main=mainRoad??[P(-R*1.6,0),P(-R*0.5,(r()-0.5)*12),P(R*0.5,(r()-0.5)*12),P(R*1.6,0)];addStreet(main,5,'main');
    for(let i=0;i<K.lanes;i++){const u=(i-(K.lanes-1)/2)*R*0.55+(r()-0.5)*20,side=r()<0.5?-1:1;const len=R*(0.45+r()*0.5);
      addStreet([P(u,0),jitter(P(u+(r()-0.5)*30,side*len*0.5),8),jitter(P(u+(r()-0.5)*60,side*len),10)],3.5,'lane');}
    placeAlongStreets(streets,lots,{count:K.count,storeys:K.storeys,r,stageCenter:[cx,cz],stageRadius:stageRadius+8,setback:[3,7],gap:[2,10]});
    if(kind==='hamlet'&&lots.length){const l=lots[Math.floor(r()*lots.length)];l.w=13+r()*3;l.d=8+r()*2;l.storeys=1;l.landmark='barn';l.style='stone';}
  }else{
    // grid of blocks with a central square; the block size shrinks toward the centre so the middle is denser
    const n=K.blocks;const block=kind==='city'?38:44;const sw=kind==='city'?7:6;
    // the two axes through the centre stop at the square's edge; every other street runs the full grid
    const stop=square.r+1.5;
    for(let i=-n/2;i<=n/2;i++){const u=i*block;const wobble=(r()-0.5)*6;const mk=(j0,j1)=>{const pts=[];for(let j=j0;j<=j1;j++)pts.push(jitter(P(u+wobble,j*block),1.5));return pts;};
      if(i===0){const a=mk(-n/2,-1);a.push(P(u,-stop));addStreet(a,sw+3,'main');const b=[P(u,stop),...mk(1,n/2)];addStreet(b,sw+3,'main');}else addStreet(mk(-n/2,n/2),sw,'street');}
    for(let j=-n/2;j<=n/2;j++){const v=j*block;const wobble=(r()-0.5)*6;const mk=(i0,i1)=>{const pts=[];for(let i=i0;i<=i1;i++)pts.push(jitter(P(i*block,v+wobble),1.5));return pts;};
      if(j===0){const a=mk(-n/2,-1);a.push(P(-stop,v));addStreet(a,sw+2,'street');const b=[P(stop,v),...mk(1,n/2)];addStreet(b,sw+2,'street');}else addStreet(mk(-n/2,n/2),sw,'street');}
    // lots ring every block: terraces along each block edge, facing the street
    const half=block/2;let count=0;
    for(let i=-n/2;i<n/2;i++)for(let j=-n/2;j<n/2;j++){const bu=i*block+half,bv=j*block+half;
      const inSquare=Math.hypot(bu,bv)<(square.r+half*0.8);if(inSquare)continue;
      const dist=Math.hypot(bu,bv)/R;if(dist>1.05&&r()<0.7)continue; // ragged edge of town
      for(const [du,dv,yawSide] of [[0,-1,0],[0,1,Math.PI],[-1,0,Math.PI/2],[1,0,-Math.PI/2]]){
        const edgeLen=block-sw-6;let s=-edgeLen/2+2;
        const row=[];
        while(s<edgeLen/2-4){const w=6+r()*5,d=7+r()*4;if(s+w>edgeLen/2)break;
          const u=bu+(du?du*(half-sw/2-3-d/2):s+w/2),v=bv+(dv?dv*(half-sw/2-3-d/2):s+w/2);
          const yaw=Math.atan2(ax.x,ax.y)+(du?(du>0?-Math.PI/2:Math.PI/2):(dv>0?0:Math.PI));
          const [x,z]=P(u,v);const storeys=K.storeys[0]+Math.floor(r()*(K.storeys[1]-K.storeys[0]+1))-(dist>0.8&&r()<0.5?1:0);
          // plan-space footprint; a lot that would overlap one already placed (the perpendicular row at a block corner) is skipped
          const hu=du?d/2:w/2,hv=du?w/2:d/2;const gap=r()<0.15?3:0;
          if(lots.some(o=>o.pu!==undefined&&Math.abs(o.pu-u)<o.hu+hu-0.05&&Math.abs(o.pv-v)<o.hv+hv-0.05)){s+=w+0.25+gap;continue;}
          const lot={x,z,yaw,w,d,storeys:Math.max(1,storeys),style:null,roof:null,terrace:{left:false,right:false},s0:s,s1:s+w,pu:u,pv:v,hu,hv};row.push(lot);lots.push(lot);count++;s+=w+0.25+gap;}
        // a side wall is a party wall only where the neighbour in the row actually abuts (gap under 0.4 m)
        for(let k=0;k<row.length;k++){const a=row[k],b=row[k+1];if(b&&b.s0-a.s1<0.4){a.terrace.right=true;b.terrace.left=true;}}}}
    // landmark on the square's edge and a couple of larger halls
    const [lx,lz]=P(0,-(square.r+16));const cu=0,cv=-(square.r+16);for(let i=lots.length-1;i>=0;i--){const o=lots[i];if(o.pu!==undefined&&Math.abs(o.pu-cu)<o.hu+7+1&&Math.abs(o.pv-cv)<o.hv+13+1)lots.splice(i,1);}
    lots.push({x:lx,z:lz,yaw:Math.atan2(ax.x,ax.y)+Math.PI,w:14,d:26,storeys:3,landmark:'church',pu:cu,pv:cv,hu:7,hv:13});
  }
  // styles: a palette per settlement so it reads as one place
  const palette=styles??(kind==='city'?['brick','brick','plaster','stone']:kind==='town'?['plaster','stone','timber','brick']:['stone','stone','plaster','timber']);
  const roofs=kind==='city'?['slate','slate','tile']:kind==='town'?['tile','slate','tile']:['thatch','tile','slate'];
  for(const l of lots){l.style??=palette[Math.floor(r()*palette.length)];if(l.style==='timber'&&(l.storeys>2||l.w>9))l.style='plaster';l.roof??=roofs[Math.floor(r()*roofs.length)];l.seed=Math.floor(r()*1e6);l.roofKind=l.landmark?'gable':(r()<0.25?'hip':'gable');}
  const roads=streets.map(s=>({points:s.points,width:s.width,verge:s.kind==='main'?3:2}));
  const pads=lots.map(l=>({x:l.x,z:l.z,r:Math.max(l.w,l.d)*0.72,blend:6}));
  if(square)pads.unshift({x:square.x,z:square.z,r:square.r+4,blend:45}); // a wide blend: no bank around the square
  const smoothRegion={x:cx,z:cz,r:R*1.15,blend:80,radius:kind==='city'?90:60,flatten:kind==='hamlet'?0.5:0.85}; // towns sit nearly level
  const tint={x:cx,z:cz,r:R*0.95,blend:40,color:kind==='city'?0x8a8378:0x7a6a50,amount:kind==='hamlet'?0.3:0.45}; // trodden town ground
  return {streets,roads,lots,pads,square,smoothRegion,tint,center:[cx,cz],radius:R,kind,seed,axis:[ax.x,ax.y],walkNetwork:streets.map(s=>s.points)};
}

function placeAlongStreets(streets,lots,{count,storeys,r,stageCenter,stageRadius,setback,gap}){
  let placed=0,guard=0;
  while(placed<count&&guard++<count*6){const s=streets[Math.floor(r()*streets.length)];const pts=s.points;const i=Math.floor(r()*(pts.length-1));
    const [ax,az]=pts[i],[bx,bz]=pts[i+1];const t=r();const px=ax+(bx-ax)*t,pz=az+(bz-az)*t;const L=Math.hypot(bx-ax,bz-az)||1;const tx=(bx-ax)/L,tz=(bz-az)/L;
    const side=r()<0.5?-1:1;const nx=-tz*side,nz=tx*side;const w=6+r()*5,d=6+r()*4;const off=s.width/2+setback[0]+r()*(setback[1]-setback[0])+d/2;
    const x=px+nx*off,z=pz+nz*off;if(Math.hypot(x-stageCenter[0],z-stageCenter[1])<stageRadius+Math.max(w,d)/2)continue;
    if(lots.some(l=>Math.hypot(l.x-x,l.z-z)<(Math.max(l.w,l.d)+Math.max(w,d))/2+gap[0]+r()*(gap[1]-gap[0])))continue;
    const yaw=Math.atan2(-nx,-nz); // door faces the street
    lots.push({x,z,yaw,w,d,storeys:storeys[0]+Math.floor(r()*(storeys[1]-storeys[0]+1))});placed++;}
}

// ---- build ---------------------------------------------------------------------------------------------------
function materialSet(seed,{styleColors={}}={}){
  const r=rng(seed);const M={};
  const wall={stone:()=>createMasonry({unit:[0.5,0.24],joint:0.012,relief:0.005,color:styleColors.stone??[0.58,0.55,0.48],seed}),
    plaster:()=>createSurface({kind:'plaster',color:styleColors.plaster??[0.80+r()*0.1,0.74+r()*0.08,0.62+r()*0.06],tileMeters:[1.2,1.2],seed,relief:0.003,variation:0.35}),
    brick:()=>createMasonry({unit:[0.22,0.07],joint:0.01,relief:0.003,color:styleColors.brick??[0.55+r()*0.1,0.32+r()*0.06,0.24],seed}),
    timber:()=>createSurface({kind:'plaster',color:styleColors.timber??[0.86,0.82,0.72],tileMeters:[1.2,1.2],seed,relief:0.003,variation:0.3})};
  for(const k of Object.keys(wall))M[k]=wall[k]();
  M.tile=createMasonry({unit:[0.28,0.2],joint:0.006,relief:0.004,edgeWear:0.001,color:[0.62,0.35,0.24],seed:seed+1});
  M.slate=createMasonry({unit:[0.5,0.28],joint:0.005,relief:0.003,edgeWear:0.001,color:[0.33,0.35,0.38],seed:seed+2});
  M.thatch=createSurface({kind:'twill',color:[0.62,0.52,0.32],tileMeters:[0.6,0.6],seed:seed+3,roughness:0.95});
  M.plinth=createMasonry({unit:[0.7,0.3],joint:0.012,relief:0.006,color:[0.42,0.40,0.36],seed:seed+4});
  M.wood=createSurface({kind:'timber',color:[0.34,0.24,0.15],tileMeters:[0.8,0.8],seed:seed+5});
  M.darkWood=createSurface({kind:'timber',color:[0.2,0.14,0.09],tileMeters:[0.8,0.8],seed:seed+6});
  M.glass=new THREE.MeshPhysicalMaterial({color:0x1a2430,roughness:0.15,metalness:0,clearcoat:1,clearcoatRoughness:0.05});
  M.dark=new THREE.MeshStandardMaterial({color:0x0e0d0c,roughness:0.9});
  M.shutter=createSurface({kind:'timber',color:[[0.25,0.35,0.3],[0.45,0.3,0.2],[0.2,0.25,0.4],[0.5,0.45,0.35]][Math.floor(r()*4)],tileMeters:[0.6,0.6],seed:seed+7});
  M.awning=createSurface({kind:'cloth',color:[[0.6,0.2,0.18],[0.2,0.3,0.45],[0.55,0.5,0.35]][Math.floor(r()*3)],tileMeters:[0.5,0.5],seed:seed+8});
  M.chimney=M.brick;
  return M;
}

/** One building. Origin at the floor centre; the door is on the +z face. */
export function createBuilding({w=8,d=8,storeys=2,style='stone',roof='tile',roofKind='gable',seed=1,M,detailed=true,landmark=null,terrace=false,wallDepth=0.32,shopfront=false}={}){
  const r=rng(seed);const g=new THREE.Group();g.name='building';
  const storeyH=landmark==='church'?5.5:landmark==='barn'?5.2:2.7+r()*0.3;const H=storeyH*storeys;const wallMat=M[style]??M.stone;
  const winW=0.9+r()*0.25,winH=1.15+r()*0.2,doorW=0.95,doorH=2.05;
  const barn=landmark==='barn';
  const facade=(len,face,{door=false})=>{const openings=[];const cols=Math.max(1,Math.floor((len-1.6)/(winW+1.7)));const pitch=(len-1.2)/cols;
    if(barn){if(door)openings.push({x:0,bottom:0,width:Math.min(3.2,len-1.5),height:Math.min(3.2,H-0.4),door:true,barnDoor:true});else if(r()<0.5)openings.push({x:(r()-0.5)*len*0.5,bottom:H*0.55,width:0.7,height:0.6});return openings;}
    for(let s=0;s<storeys;s++)for(let c=0;c<cols;c++){const x=-len/2+0.5+pitch*(c+0.5);const isDoor=door&&s===0&&c===Math.floor(cols/2);
      if(isDoor)openings.push({x,bottom:0,width:doorW,height:doorH,door:true});
      else if(shopfront&&door&&s===0)openings.push({x,bottom:0.7,width:Math.min(winW*1.6,pitch-0.5),height:1.7,shop:true});
      else if(!(s===0&&r()<0.12))openings.push({x,bottom:s*storeyH+0.95,width:winW,height:winH});}
    return openings;};
  const walls=[{len:w,z:d/2,yaw:0,door:true},{len:w,z:d/2,yaw:Math.PI,door:false},{len:d,z:w/2,yaw:Math.PI/2,door:false},{len:d,z:w/2,yaw:-Math.PI/2,door:false}]; // z = distance from centre along the wall's facing
  const wins=[];
  const party=wl=>{if(!terrace)return false;if(terrace===true)return wl.yaw===Math.PI/2||wl.yaw===-Math.PI/2;return (wl.yaw===Math.PI/2&&terrace.right)||(wl.yaw===-Math.PI/2&&terrace.left);};
  for(const wl of walls){if(party(wl))continue; // party walls in a terrace are hidden only where a neighbour abuts
    const openings=facade(wl.len,wl,{door:wl.door});
    // real reveals on every building at any distance (a flat wall with painted windows reads as a toy from 300 m);
    // frames, panes and door leaves only within detailRadius
    const m=wallWithOpenings({width:wl.len,height:H,depth:wallDepth,openings:openings.map(o=>({x:o.x,bottom:o.bottom,width:o.width,height:o.height})),material:wallMat,backing:'interior'});
    m.rotation.y=wl.yaw;m.position.set(Math.sin(wl.yaw)*(wl.z),0,Math.cos(wl.yaw)*(wl.z));g.add(m);
    for(const o of openings)wins.push({o,wall:m,yaw:wl.yaw});
    if(detailed)for(const o of openings){const local=new THREE.Vector3(o.x,o.bottom,wallDepth/2);
      if(o.door){const lw=o.width-0.06;const leaf=plankedPanel({width:lw,height:o.height-0.04,thickness:0.05,planks:o.barnDoor?9:5,material:M.darkWood,seed:seed+3});leaf.position.set(o.x-lw/2,0.02,wallDepth/2-0.16);if(o.barnDoor){leaf.rotation.y=0.35;leaf.position.x=o.x-lw/2;}m.add(leaf);
        if(!o.barnDoor){const step=box(o.width+0.5,0.12,0.5,M.plinth,o.x,0.06,wallDepth/2+0.2);m.add(step);}}
      else{const f=frame({width:o.width,height:o.height,depth:0.08,memberWidth:0.07,sill:true,material:M.wood,seed:seed+4});f.position.set(o.x,o.bottom,wallDepth/2-0.1);m.add(f);
        const pane=box(o.width-0.1,o.height-0.1,0.02,M.glass,o.x,o.bottom+o.height/2,wallDepth/2-0.14);m.add(pane);
        // shutters on plaster and timber houses, an awning and sign over a shop window
        if((style==='plaster'||style==='timber')&&!o.shop&&r()<0.7)for(const sd of [-1,1]){const sh=box(0.28,o.height-0.04,0.035,M.shutter,o.x+sd*(o.width/2+0.16),o.bottom+o.height/2,wallDepth/2+0.02);m.add(sh);}
        if(o.shop){const aw=box(o.width+0.6,0.05,0.9,M.awning,o.x,o.bottom+o.height+0.25,wallDepth/2+0.45);aw.rotation.x=0.35;m.add(aw);const sign=box(o.width*0.8,0.35,0.05,M.darkWood,o.x,o.bottom+o.height+0.55,wallDepth/2+0.03);m.add(sign);}}}
  }
  // plinth course and eaves
  g.add(box(w+0.16,2.0,d+0.16,M.plinth,0,-0.75,0)); // 0.5 m course above ground, 1.5 m of foundation into any slope
  const eaveH=0.14;g.add(box(w+0.7,eaveH,d+0.7,M.wood,0,H+eaveH/2,0));
  // roof
  const roofMat=M[roof]??M.tile;const pitch=roof==='thatch'?0.9:roof==='slate'?0.75:0.65;const rh=(d/2+0.35)*pitch;
  if(roofKind==='hip'){const geo=new THREE.CylinderGeometry(0.001,1,1,4,1);const rm=new THREE.Mesh(geo,roofMat);rm.scale.set((w+0.7)/Math.SQRT2,rh,(d+0.7)/Math.SQRT2);rm.rotation.y=Math.PI/4;rm.position.y=H+eaveH+rh/2;rm.castShadow=rm.receiveShadow=true;g.add(rm);}
  else{const shape=new THREE.Shape();shape.moveTo(-(d/2+0.35),0);shape.lineTo(0,rh);shape.lineTo(d/2+0.35,0);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:w+0.7,bevelEnabled:false});geo.rotateY(Math.PI/2);geo.translate(-(w+0.7)/2,H+eaveH,0);
    const rm=new THREE.Mesh(geo,roofMat);rm.castShadow=rm.receiveShadow=true;g.add(rm);
    // dormers: a small gabled box on the front slope of larger houses
    if(!barn&&!landmark&&w>7.5&&r()<0.45){const nd=1+(w>10?1:0);for(let k=0;k<nd;k++){const dx=(k-(nd-1)/2)*3.2;const dz=d/2*0.45;const dy=H+eaveH+rh*0.42;
      const dm=box(1.4,1.3,1.6,wallMat,dx,dy,dz);g.add(dm);const dr=new THREE.Mesh(new THREE.ConeGeometry(1.1,0.7,4),roofMat);dr.rotation.y=Math.PI/4;dr.position.set(dx,dy+1.0,dz);dr.castShadow=true;g.add(dr);
      const dw=box(0.7,0.8,0.05,M.glass,dx,dy+0.05,dz+0.82);g.add(dw);}}
    // gable ends in the wall material
    const gs=new THREE.Shape();gs.moveTo(-d/2,0);gs.lineTo(0,rh);gs.lineTo(d/2,0);gs.closePath();const gg=new THREE.ExtrudeGeometry(gs,{depth:0.3,bevelEnabled:false});
    for(const s of [-1,1]){const gm=new THREE.Mesh(gg,wallMat);gm.rotation.y=Math.PI/2;gm.position.set(s*(w/2)-(s>0?0.3:0),H+eaveH,0);gm.castShadow=gm.receiveShadow=true;g.add(gm);}}
  // chimney(s)
  const chimneys=1+(w>9?1:0);for(let i=0;i<chimneys;i++){const cx=(i===0?-1:1)*(w/2-0.9);const c=box(0.7,rh+1.2,0.7,M.chimney,cx,H+eaveH+(rh+1.2)/2-0.3,0);g.add(c);g.add(box(0.9,0.12,0.9,M.plinth,cx,H+eaveH+rh+0.85,0));}
  if(landmark==='church'){const t=box(5,H*1.9,5,wallMat,0,H*0.95,-d/2-2.5);g.add(t);const spire=new THREE.Mesh(new THREE.ConeGeometry(3.4,9,4),M.slate);spire.rotation.y=Math.PI/4;spire.position.set(0,H*1.9+4.5,-d/2-2.5);spire.castShadow=true;g.add(spire);}
  if(style==='timber'&&detailed){const studs=new THREE.Group();for(const wl of walls){if(party(wl))continue;const n=Math.max(2,Math.round(wl.len/2.2));
    for(let i=0;i<=n;i++){const s=box(0.12,H-0.5,0.06,M.darkWood,-wl.len/2+wl.len*i/n,H/2+0.25,wallDepth/2+0.03);s.rotation.y=0;const holder=new THREE.Group();holder.rotation.y=wl.yaw;holder.position.set(Math.sin(wl.yaw)*wl.z,0,Math.cos(wl.yaw)*wl.z);holder.add(s);studs.add(holder);}
    for(let s=1;s<storeys;s++){const holder=new THREE.Group();holder.rotation.y=wl.yaw;holder.position.set(Math.sin(wl.yaw)*wl.z,0,Math.cos(wl.yaw)*wl.z);holder.add(box(wl.len,0.14,0.06,M.darkWood,0,s*storeyH,wallDepth/2+0.03));studs.add(holder);}}
    g.add(studs);}
  g.userData.size={w,d,H:H+eaveH+rh};
  return g;
}


/** Collapse a static assembly into one mesh per material (draw calls and the CPU check both scale with mesh count). */
const matKey=m=>[m.type,m.color?.getHex(),m.map?.uuid,m.normalMap?.uuid,m.roughnessMap?.uuid,m.emissive?.getHex(),(m.roughness??0).toFixed(2),(m.metalness??0).toFixed(2),m.transparent?1:0,m.vertexColors?1:0,m.side].join('|');
export function mergeStatic(root){
  root.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(root.matrixWorld).invert();const byMat=new Map();const matOf=new Map();
  root.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh)return;let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();if(!g.attributes.uv){const n=g.attributes.position.count;g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(n*2),2));}
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);if(!g.attributes.normal)g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));const mats=[].concat(o.material);const k=matKey(mats[0]);if(!matOf.has(k))matOf.set(k,mats[0]);(byMat.get(k)??byMat.set(k,[]).get(k)).push(g);});
  const out=new THREE.Group();out.name=root.name;out.position.copy(root.position);out.rotation.copy(root.rotation);out.scale.copy(root.scale);out.userData=root.userData;
  for(const [k,geos] of byMat){const g=mergeGeometries(geos,false);if(!g)continue;g.computeBoundingSphere();const mesh=new THREE.Mesh(g,matOf.get(k));mesh.castShadow=mesh.receiveShadow=true;mesh.name=root.name;out.add(mesh);}
  return out;
}
/** Merge many placed static groups into one group of meshes per `cell` metres square: a town of 400 houses becomes ~150 draws. */
export function mergeByChunk(items,{cell=60,name='chunks'}={}){
  const out=new THREE.Group();out.name=name;const cells=new Map();
  for(const it of items){const k=`${Math.floor(it.position.x/cell)},${Math.floor(it.position.z/cell)}`;(cells.get(k)??cells.set(k,new THREE.Group()).get(k)).add(it);}
  for(const [k,g] of cells){g.name=`${name}-${k}`;const m=mergeStatic(g);m.name=g.name;out.add(m);}
  return out;
}

export function buildSettlement(plan,terrain,{seed=plan.seed??1,detailRadius=260,materials=null,stage=null}={}){
  const M=materials??materialSet(seed);const g=new THREE.Group();g.name=`settlement-${plan.kind}`;
  const buildings=[],doors=[],placed=[];const sx=stage?.x??terrain.stage.x,sz=stage?.z??terrain.stage.z;
  // party walls decided geometrically: a side wall is dropped only when a probe 0.4 m outside its midpoint lands inside
  // another lot's footprint (the plan's row order does not know which world side is which)
  const inLot=(o,px,pz)=>{const dx=px-o.x,dz=pz-o.z;const c=Math.cos(-o.yaw),sn=Math.sin(-o.yaw);const lx=dx*c-dz*sn,lz=dx*sn+dz*c;return Math.abs(lx)<o.w/2+0.05&&Math.abs(lz)<o.d/2+0.05;};
  for(const l of plan.lots){if(!l.terrace)continue;const ex=Math.cos(l.yaw),ez=-Math.sin(l.yaw);/* local +x in world */const probe=sd=>{const px=l.x+ex*sd*(l.w/2+0.4),pz=l.z+ez*sd*(l.w/2+0.4);return plan.lots.some(o=>o!==l&&inLot(o,px,pz));};
    l.terrace={right:probe(1),left:probe(-1)};if(!l.terrace.right&&!l.terrace.left)l.terrace=false;}
  for(const l of plan.lots){const dist=Math.hypot(l.x-sx,l.z-sz);const detailed=dist<detailRadius;
    const shop=!!plan.square&&Math.hypot(l.x-plan.square.x,l.z-plan.square.z)<plan.square.r+28&&!l.landmark;
    const b=createBuilding({w:l.w,d:l.d,storeys:l.storeys,style:l.style,roof:l.roof,roofKind:l.roofKind,seed:l.seed,M,detailed,landmark:l.landmark,terrace:l.terrace,shopfront:shop});
    // stand on the pad height (the terrain flattened a pad under each lot); sink the plinth slightly for contact
    const y=terrain.height(l.x,l.z)-0.05;b.name=l.landmark??'house';b.position.set(l.x,y,l.z);b.rotation.y=l.yaw;placed.push(b);
    const dx=Math.sin(l.yaw),dz=Math.cos(l.yaw);const door={x:l.x+dx*(l.d/2+0.6),z:l.z+dz*(l.d/2+0.6),facing:[dx,dz]};doors.push(door);
    buildings.push({x:l.x,z:l.z,yaw:l.yaw,w:l.w,d:l.d,storeys:l.storeys,door,detailed,height:b.userData.size.H});}
  g.add(mergeByChunk(placed,{cell:60,name:'houses'}));
  // yard walls between neighbouring detached houses along the same street (stone, waist high)
  const walls=new THREE.Group();walls.name='yard-walls';const wallMat=M.plinth;
  if(plan.kind==='village'||plan.kind==='hamlet'){for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++){const a=buildings[i],b=buildings[j];const d=Math.hypot(a.x-b.x,a.z-b.z);
    if(d>9&&d<22&&Math.abs(a.yaw-b.yaw)<0.3){const seg=box(d-Math.max(a.w,b.w)*0.9,1.1,0.4,wallMat,0,0.55,0);seg.position.set((a.x+b.x)/2,terrain.height((a.x+b.x)/2,(a.z+b.z)/2),(a.z+b.z)/2);seg.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)+Math.PI/2;walls.add(seg);}}
    // a low front wall along the street with a gate gap at the door, for every house set back from the street
    for(const b of buildings){const [fx,fz]=b.door.facing;const rx=fz,rz=-fx;const y0=terrain.height(b.x,b.z);const fy=b.d/2+2.6;const cx=b.x+fx*fy,cz=b.z+fz*fy;const half=b.w/2+1.5;
      for(const sd of [-1,1]){const len=half-0.8;const seg=box(len,0.9,0.3,wallMat,0,0.45,0);seg.position.set(cx+rx*sd*(0.8+len/2),terrain.height(cx+rx*sd*(0.8+len/2),cz+rz*sd*(0.8+len/2)),cz+rz*sd*(0.8+len/2));seg.rotation.y=Math.atan2(rx,rz);walls.add(seg);}
      for(const sd of [-1,1]){const post=box(0.36,1.15,0.36,wallMat,0,0.57,0);post.position.set(cx+rx*sd*0.8,terrain.height(cx+rx*sd*0.8,cz+rz*sd*0.8),cz+rz*sd*0.8);walls.add(post);}}}
  g.add(mergeStatic(walls));
  // paving: setts on the square, a worn surface on every street (soil for a hamlet or village, setts for a town or city)
  const setts=createMasonry({unit:[0.16,0.12],joint:0.008,relief:0.004,edgeWear:0.002,color:[0.46,0.44,0.40],seed:seed+9});
  const streetMat=(plan.kind==='town'||plan.kind==='city')?setts:createSurface({kind:'soil',color:[0.50,0.44,0.34],tileMeters:[2,2],seed:seed+10});
  if(plan.square)g.add(terrain.pave({x:plan.square.x,z:plan.square.z,r:plan.square.r,material:setts}));
  const streetRoads=terrain.roads.filter(rd=>plan.roads.some(pr=>pr.points.length===rd.points.length||Math.hypot(pr.points[0][0]-rd.points[0][0],pr.points[0][1]-rd.points[0][1])<0.01));
  const sr=streetRoads.length?streetRoads:terrain.roads;g.add(terrain.roadSurfaces(streetMat,{roads:sr}));
  // pavements: a flagstone ribbon each side of every town or city street, sitting a little proud of the road
  if(plan.kind==='town'||plan.kind==='city'){const flags=createMasonry({unit:[0.6,0.45],joint:0.01,relief:0.003,color:[0.56,0.54,0.50],seed:seed+11});
    for(const side of [-1,1])g.add(terrain.roadSurfaces(flags,{roads:sr,offset:side*(sr[0].width/2+0.7),width:1.5,lift:0.12,name:'pavement'}));}
  // square furniture: a ring of benches and lamp posts, a fountain basin in the centre unless the stage takes it
  if(plan.square){const sq=plan.square;const rr=rng(seed+21);const furn=new THREE.Group();furn.name='square-furniture';
    for(let k=0;k<10;k++){const a=k/10*Math.PI*2+0.2;const x=sq.x+Math.cos(a)*(sq.r-3),z=sq.z+Math.sin(a)*(sq.r-3);
      if(k%2===0){const b=new THREE.Group();b.add(box(1.6,0.06,0.42,M.wood,0,0.46,0));for(const bx of [-0.65,0.65])b.add(box(0.08,0.44,0.4,M.plinth,bx,0.22,0));terrain.place(b,x,z,{yaw:-a+Math.PI/2});b.name='bench';furn.add(b);}
      else{const l=new THREE.Group();l.add(mesh(new THREE.CylinderGeometry(0.05,0.08,3.4,10),M.dark,0,1.7,0));l.add(box(0.32,0.44,0.32,M.dark,0,3.6,0));const glow=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.32,0.24),new THREE.MeshStandardMaterial({color:0xffe1a8,emissive:0xffc070,emissiveIntensity:0.6}));glow.position.y=3.6;l.add(glow);terrain.place(l,x,z);l.name='lamp post';furn.add(l);}}
    g.add(mergeStatic(furn));}
  const occupied=(x,z,margin=1)=>{for(const b of buildings){const dx=x-b.x,dz=z-b.z;const lx=dx*Math.cos(-b.yaw)-dz*Math.sin(-b.yaw),lz=dx*Math.sin(-b.yaw)+dz*Math.cos(-b.yaw);if(Math.abs(lx)<b.w/2+margin&&Math.abs(lz)<b.d/2+margin)return true;}
    if(plan.square&&Math.hypot(x-plan.square.x,z-plan.square.z)<plan.square.r)return true;return false;};
  return {group:g,buildings,doors,occupied,materials:M,plan};
}

/** Stone bridges where roads cross rivers: abutments, an arch, a deck at road level and parapets. */
export function buildBridges(terrain,{materials=null,seed=1}={}){
  const M=materials??materialSet(seed);const g=new THREE.Group();g.name='bridges';const out=[];
  const seg=(a,b,c,d)=>{const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);if(Math.abs(den)<1e-9)return null;const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;if(t<0||t>1||u<0||u>1)return null;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
  for(const rd of terrain.roads)for(const rv of terrain.rivers){for(let i=0;i<rd.points.length-1;i++)for(let j=0;j<rv.points.length-1;j++){const p=seg(rd.points[i],rd.points[i+1],rv.points[j],rv.points[j+1]);if(!p)continue;
    if(out.some(o=>Math.hypot(o.x-p[0],o.z-p[1])<30))continue;const n=rd.nearest(p[0],p[1]);const rvn=rv.nearest(p[0],p[1]);const span=rv.width+rv.verge*1.2,bw=rd.width+1.2;const deckY=n.h;
    const b=new THREE.Group();b.name='bridge';const yaw=Math.atan2(n.tangent[0],n.tangent[1]);
    const shape=new THREE.Shape();shape.moveTo(-span/2,-rv.depth-2);shape.lineTo(span/2,-rv.depth-2);shape.lineTo(span/2,0.3);shape.lineTo(-span/2,0.3);shape.closePath();
    const hole=new THREE.Path();const ar=Math.min(span*0.32,rv.width*0.45);hole.absarc(0,rvn.h-deckY-0.3,ar,0,Math.PI,false);hole.lineTo(-ar,-rv.depth-2);hole.lineTo(ar,-rv.depth-2);hole.closePath();shape.holes.push(hole);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:bw,bevelEnabled:false});geo.translate(0,0,-bw/2);const body=new THREE.Mesh(geo,M.plinth);body.castShadow=body.receiveShadow=true;b.add(body);
    for(const sd of [-1,1])b.add(box(span+1,1.0,0.35,M.plinth,0,0.8,sd*(bw/2-0.18)));
    b.position.set(p[0],deckY,p[1]);b.rotation.y=yaw;g.add(b);out.push({x:p[0],z:p[1]});}}
  return {group:g,bridges:out};
}
