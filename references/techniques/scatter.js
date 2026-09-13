// scatter.js — the fill between the built things: woods, hedged fields, rocks, grass, street props, people and animals.
//
//   const veg=scatterVegetation({terrain, settlement, seed, treeCount:3000, region:900});      scene.add(veg.group);
//   const props=scatterProps({terrain, settlement, seed, radius:220});                            scene.add(props.group);
//   const folk=populate({terrain, settlement, seed, people:24, animals:10});                       scene.add(folk.group);
//   ...in your timeline: folk.update(t);
//
// Everything is instanced and seeded. Trees have a near and a far level of detail chosen by distance from the stage.
// Fields are laid out off the roads with hedge lines along their edges and crop rows in the nearest ones. Props go
// where people put them: by doors, along street edges, in yards. People walk the street network with strides locked
// to distance; animals graze in fields and yards. Nothing is placed on water, on a road, inside a building or on the stage.
import * as THREE from 'three';
import {createSurface} from './surface-materials.js';
import {rng,jointedFigure,quadruped,fowl,lathe,plankedPanel,box,cyl,std,SKIN_TONES,HAIR_COLOURS,HAIR_STYLES,ACCESSORIES} from './parts.js';
import {noise2,fbm} from './terrain.js';
import {mergeStatic} from './settlement.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(e0,e1,v)=>{const t=clamp((v-e0)/(e1-e0),0,1);return t*t*(3-2*t);};
const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),v3=new THREE.Vector3(),s3=new THREE.Vector3();
const setInst=(im,i,x,y,z,yaw,scale,tilt=0)=>{q.setFromEuler(new THREE.Euler(tilt,yaw,0));s3.setScalar(scale);m4.compose(v3.set(x,y,z),q,s3);im.setMatrixAt(i,m4);};
const instanced=(geo,mat,n,name)=>{const im=new THREE.InstancedMesh(geo,mat,Math.max(1,n));im.count=0;im.name=name;im.castShadow=im.receiveShadow=true;im.frustumCulled=true;return im;};
const merge=(geos)=>{const out=[];for(const g of geos)out.push(g.toNonIndexed());const pos=[],nor=[],col=[];for(const g of out){pos.push(...g.attributes.position.array);nor.push(...g.attributes.normal.array);if(g.attributes.color)col.push(...g.attributes.color.array);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));if(col.length===pos.length)geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geo.computeBoundingSphere();return geo;};
const paint=(geo,color)=>{const c=new THREE.Color(color);const n=geo.attributes.position.count;const arr=new Float32Array(n*3);for(let i=0;i<n;i++){arr[i*3]=c.r;arr[i*3+1]=c.g;arr[i*3+2]=c.b;}geo.setAttribute('color',new THREE.BufferAttribute(arr,3));return geo;};

// ---- trees --------------------------------------------------------------------------------------------------
/** Species geometries: near (canopy from several ellipsoids, visible trunk and limbs) and far (one canopy, one trunk). */
export function treeSpecies(seed=1){
  const r=rng(seed+11);const species={};
  const canopyMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9,metalness:0});
  const make=(name,{trunkH,trunkR,canopy,leaf,bark,cone=false})=>{
    const near=[],far=[];
    const trunk=new THREE.CylinderGeometry(trunkR*0.7,trunkR,trunkH,7);trunk.translate(0,trunkH/2,0);near.push(paint(trunk,bark));
    const farTrunk=new THREE.CylinderGeometry(trunkR*0.7,trunkR,trunkH,5);farTrunk.translate(0,trunkH/2,0);far.push(paint(farTrunk,bark));
    if(cone){for(let i=0;i<3;i++){const rad=canopy*(1-i*0.25),h=canopy*1.6*(1-i*0.2);const c=new THREE.ConeGeometry(rad,h,9);c.translate(0,trunkH*0.55+i*canopy*0.9+h/2,0);near.push(paint(c,leaf));}
      const c=new THREE.ConeGeometry(canopy,canopy*2.6,6);c.translate(0,trunkH*0.55+canopy*1.3,0);far.push(paint(c,leaf));}
    else{const lobes=8+Math.floor(r()*5);const lc=new THREE.Color(leaf);for(let i=0;i<lobes;i++){const a=r()*Math.PI*2,d=Math.sqrt(r())*canopy*0.7;const up=(i/lobes);const s=new THREE.SphereGeometry(canopy*(0.35+r()*0.3),7,5);s.scale(1,0.7+r()*0.3,1);s.translate(Math.cos(a)*d,trunkH+canopy*0.35+up*canopy*0.9+(r()-0.5)*canopy*0.2,Math.sin(a)*d);const tone=lc.clone().offsetHSL((r()-0.5)*0.04,(r()-0.5)*0.1,(up-0.5)*0.12+(r()-0.5)*0.06);near.push(paint(s,tone));
        const limb=new THREE.CylinderGeometry(trunkR*0.25,trunkR*0.45,canopy*0.9,4);limb.translate(0,canopy*0.45,0);limb.rotateZ(0.5+r()*0.5);limb.rotateY(a);limb.translate(0,trunkH*0.85,0);near.push(paint(limb,bark));}
      const s=new THREE.SphereGeometry(canopy*1.1,6,5);s.scale(1,0.95,1);s.translate(0,trunkH+canopy*0.8,0);far.push(paint(s,leaf));const s2=new THREE.SphereGeometry(canopy*0.8,5,4);s2.translate(canopy*0.4,trunkH+canopy*0.5,canopy*0.2);far.push(paint(s2,new THREE.Color(leaf).offsetHSL(0,0,-0.05)));}
    species[name]={near:merge(near),far:merge(far),material:canopyMat,height:trunkH+canopy*2};};
  make('oak',{trunkH:2.4,trunkR:0.32,canopy:3.2,leaf:0x4f6b2f,bark:0x4a3a2a});
  make('ash',{trunkH:3.4,trunkR:0.24,canopy:2.6,leaf:0x6a8a3c,bark:0x6b6558});
  make('birch',{trunkH:4.0,trunkR:0.15,canopy:1.9,leaf:0x86a54a,bark:0xd8d4c8});
  make('pine',{trunkH:5,trunkR:0.22,canopy:2.0,leaf:0x33512e,bark:0x5a4030,cone:true});
  return species;
}

/** Woods, hedged fields, rocks and grass over `region` metres around the stage. */
export function scatterVegetation({terrain,settlement=null,seed=1,treeCount=2500,region=900,nearRadius=220,fields=true,grassRadius=70,rockCount=400,woodlandThreshold=0.15}={}){
  const r=rng(seed+5);const g=new THREE.Group();g.name='vegetation';const sx=terrain.stage.x,sz=terrain.stage.z;const sp=treeSpecies(seed);
  const blocked=(x,z,margin=2)=>{if(terrain.isWater(x,z))return true;if(terrain.roadMask(x,z)>0.01)return true;for(const rd of terrain.roads){const n=rd.nearest(x,z);if(n&&n.d<rd.width/2+rd.verge+margin)return true;}
    if(settlement&&settlement.occupied(x,z,margin+2))return true;if(Math.hypot(x-sx,z-sz)<terrain.stage.radius+margin)return true;return false;};
  // woodland mask: fractal noise, thinned near the settlement so fields show, dense on steep ground
  const wood=(x,z)=>{const n=fbm(x,z,seed+21,{scale:260,octaves:3});const steep=smooth(0.25,0.5,terrain.slope(x,z));const townD=settlement?Math.hypot(x-settlement.plan.center[0],z-settlement.plan.center[1])/settlement.plan.radius:2;
    return n+steep*0.4-Math.max(0,1.3-townD)*0.5;};
  // trees: rejection sampling on the mask, two LODs per species by distance from the stage
  const near={},far={};const cap=treeCount;for(const k of Object.keys(sp)){near[k]=instanced(sp[k].near,sp[k].material,cap,`trees-${k}-near`);far[k]=instanced(sp[k].far,sp[k].material,cap,`trees-${k}-far`);}
  let placed=0,tries=0;const treePts=[];
  while(placed<treeCount&&tries++<treeCount*8){const x=sx+(r()*2-1)*region,z=sz+(r()*2-1)*region;if(Math.hypot(x-sx,z-sz)>region)continue;
    const wv=wood(x,z);if(wv<woodlandThreshold&&r()>0.04)continue;if(blocked(x,z,2))continue;
    const kind=terrain.slope(x,z)>0.4||wv>0.55?(r()<0.7?'pine':'birch'):(r()<0.5?'oak':r()<0.6?'ash':'birch');
    const d=Math.hypot(x-sx,z-sz);const im=d<nearRadius?near[kind]:far[kind];const y=terrain.height(x,z)-0.15;const s=0.75+r()*0.5;
    setInst(im,im.count++,x,y,z,r()*Math.PI*2,s,(r()-0.5)*0.06);treePts.push([x,z]);placed++;}
  // street trees along the main road outside the square, and a tree in a third of the yards
  if(settlement){const main=[...terrain.roads].sort((a,b)=>b.width-a.width)[0];const sq=settlement.plan.square;
    if(main)for(let s=20;s<main.length-20;s+=22){const p=main.at(s);const side=(Math.floor(s/22)%2?1:-1);const x=p.x-p.tangent[1]*side*(main.width/2+2.2),z=p.z+p.tangent[0]*side*(main.width/2+2.2);
      if(sq&&Math.hypot(x-sq.x,z-sq.z)<sq.r+3)continue;if(Math.hypot(x-sx,z-sz)>settlement.plan.radius*1.2||settlement.occupied(x,z,1.5)||terrain.isWater(x,z))continue;
      const im=Math.hypot(x-sx,z-sz)<nearRadius?near.ash:far.ash;setInst(im,im.count++,x,terrain.height(x,z)-0.15,z,r()*Math.PI*2,0.7+r()*0.3);treePts.push([x,z]);}
    if(sq)for(let k=0;k<8;k++){const a=k/8*Math.PI*2;const x=sq.x+Math.cos(a)*(sq.r+2.5),z=sq.z+Math.sin(a)*(sq.r+2.5);if(settlement.occupied(x,z,1)||terrain.roadMask(x,z)>0)continue;setInst(near.ash,near.ash.count++,x,terrain.height(x,z)-0.15,z,r()*Math.PI*2,0.6+r()*0.2);treePts.push([x,z]);}
    for(const b of settlement.buildings){if(r()>0.33)continue;const [fx,fz]=b.door.facing;const x=b.x-fx*(b.d/2+3.5)+(r()-0.5)*4,z=b.z-fz*(b.d/2+3.5)+(r()-0.5)*4;
      if(settlement.occupied(x,z,1.2)||terrain.roadMask(x,z)>0||terrain.isWater(x,z))continue;const kind=r()<0.5?'oak':'ash';const im=Math.hypot(x-sx,z-sz)<nearRadius?near[kind]:far[kind];setInst(im,im.count++,x,terrain.height(x,z)-0.15,z,r()*Math.PI*2,0.55+r()*0.35);treePts.push([x,z]);}}
  for(const k of Object.keys(sp)){for(const im of [near[k],far[k]]){if(im.count){im.instanceMatrix.needsUpdate=true;g.add(im);}}far[k].castShadow=false;/* far woods: shading, no shadow passes */}
  // hedged fields: a lattice aligned to the first road, off the roads and outside the settlement, hedges on the edges
  const hedgeGeo=paint(new THREE.SphereGeometry(1,5,4).scale(1,0.75,1),0x3f5a2a);const hedgeMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95});
  const hedge=instanced(hedgeGeo,hedgeMat,20000,'hedgerows');const gatePosts=[];
  const cropMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9,side:THREE.DoubleSide});const cropGeo=paint(new THREE.ConeGeometry(0.18,0.75,4),0x8a9a3a);cropGeo.translate(0,0.37,0);
  const crops=instanced(cropGeo,cropMat,60000,'crops');crops.castShadow=false;
  if(fields){const road=[...terrain.roads].sort((a,b)=>b.width-a.width)[0];const ax=road?road.at(road.length/2).tangent:[1,0];const px=[-ax[1],ax[0]];const cell=70+r()*30;
    const fieldRegion=region*0.85;const cells=Math.floor(fieldRegion*2/cell);
    for(let i=-cells/2;i<cells/2;i++)for(let j=-cells/2;j<cells/2;j++){const cu=(i+0.5)*cell,cv=(j+0.5)*cell;const cx=sx+ax[0]*cu+px[0]*cv,cz=sz+ax[1]*cu+px[1]*cv;
      if(Math.hypot(cx-sx,cz-sz)>fieldRegion)continue;if(wood(cx,cz)>woodlandThreshold-0.05)continue;if(blocked(cx,cz,cell*0.45))continue;if(terrain.slope(cx,cz)>0.3)continue;
      // hedge along the four edges, a gap for a gate on one, skipping any edge that crosses a road, building or water
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];const gateEdge=Math.floor(r()*4);
      for(let e=0;e<4;e++){const [a,b]=[corners[e],corners[(e+1)%4]];const ex0=cx+ax[0]*a[0]*cell/2+px[0]*a[1]*cell/2,ez0=cz+ax[1]*a[0]*cell/2+px[1]*a[1]*cell/2,ex1=cx+ax[0]*b[0]*cell/2+px[0]*b[1]*cell/2,ez1=cz+ax[1]*b[0]*cell/2+px[1]*b[1]*cell/2;
        const L=Math.hypot(ex1-ex0,ez1-ez0),n=Math.floor(L/1.1);for(let k=0;k<=n;k++){const t=k/n;if(e===gateEdge&&Math.abs(t-0.5)<0.03)continue;const x=ex0+(ex1-ex0)*t+(r()-0.5)*0.3,z=ez0+(ez1-ez0)*t+(r()-0.5)*0.3;if(blocked(x,z,0.5))continue;
          setInst(hedge,hedge.count++,x,terrain.height(x,z)-0.2,z,r()*Math.PI,0.9+r()*0.6);if(hedge.count>=19990)break;}}
      // crop rows in the nearest fields (budget), grazing elsewhere
      const d=Math.hypot(cx-sx,cz-sz);if(d<region*0.35&&r()<0.5&&crops.count<55000){const rows=Math.floor(cell/1.2);for(let a=1;a<rows-1;a++)for(let b=1;b<rows-1;b+=1){if(crops.count>=55000)break;const u=(a/rows-0.5)*cell*0.9,v=(b/rows-0.5)*cell*0.9;const x=cx+ax[0]*u+px[0]*v,z=cz+ax[1]*u+px[1]*v;setInst(crops,crops.count++,x,terrain.height(x,z),z,r()*0.4,0.8+r()*0.4);}}}}
  if(hedge.count){hedge.instanceMatrix.needsUpdate=true;g.add(hedge);}if(crops.count){crops.instanceMatrix.needsUpdate=true;g.add(crops);}
  // rocks on steep or high ground
  const rockGeo=paint(new THREE.DodecahedronGeometry(0.6,0),0x7d7a72);const rock=instanced(rockGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95}),rockCount,'rocks');
  for(let i=0,t=0;i<rockCount&&t<rockCount*10;t++){const x=sx+(r()*2-1)*region,z=sz+(r()*2-1)*region;if(blocked(x,z,1))continue;const sl=terrain.slope(x,z);if(sl<0.3&&r()>0.05)continue;setInst(rock,rock.count++,x,terrain.height(x,z)-0.25,z,r()*Math.PI*2,0.5+r()*1.4,(r()-0.5)*0.8);i++;}
  if(rock.count){rock.instanceMatrix.needsUpdate=true;g.add(rock);}
  // grass tufts near the stage: crossed quads, colour from the ground
  const tuft=(()=>{const a=new THREE.PlaneGeometry(0.5,0.45,1,2);a.translate(0,0.22,0);const b=a.clone().rotateY(Math.PI/2);const mg=merge([paint(a,0x6f8a3a),paint(b,0x7d9a40)]);const pos=mg.attributes.position;for(let i=0;i<pos.count;i++){const y=pos.getY(i);if(y>0.3)pos.setX(i,pos.getX(i)*0.4);}return mg;})();
  const grass=instanced(tuft,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95,side:THREE.DoubleSide,alphaTest:0}),12000,'grass');grass.castShadow=false;
  for(let i=0,t=0;i<12000&&t<40000;t++){const a=r()*Math.PI*2,d=Math.sqrt(r())*grassRadius;const x=sx+Math.cos(a)*d,z=sz+Math.sin(a)*d;if(blocked(x,z,0.3))continue;if(settlement&&Math.hypot(x-settlement.plan.center[0],z-settlement.plan.center[1])<settlement.plan.radius*0.95)continue;if(noise2(x/3,z/3,seed+31)<0.35)continue;setInst(grass,grass.count++,x,terrain.height(x,z)-0.02,z,r()*Math.PI,0.7+r()*0.7);i++;}
  if(grass.count){grass.instanceMatrix.needsUpdate=true;g.add(grass);}
  return {group:g,trees:treePts,species:sp};
}

// ---- props ---------------------------------------------------------------------------------------------------
function propMakers(seed,M){
  const r=rng(seed+77);
  const barrel=s=>lathe({profile:[[0.26,0],[0.3,0.2],[0.32,0.45],[0.3,0.7],[0.26,0.86]],material:M.wood,seed:s,segments:18});
  const crate=s=>{const g=new THREE.Group();const w=0.6,h=0.45,d=0.5;for(const [yaw,off] of [[0,d/2],[Math.PI,-d/2],[Math.PI/2,w/2],[-Math.PI/2,-w/2]]){const p=plankedPanel({width:yaw%Math.PI?d:w,height:h,thickness:0.02,planks:4,material:M.wood,seed:s+yaw*10,vertical:false});p.rotation.y=yaw;p.position.set(Math.sin(yaw)*off-Math.cos(yaw)*(yaw%Math.PI?d:w)/2,0,Math.cos(yaw)*off+Math.sin(yaw)*(yaw%Math.PI?d:w)/2);g.add(p);}g.add(box(w,0.02,d,M.wood,0,0.01,0));return g;};
  const bench=s=>{const g=new THREE.Group();g.add(box(1.5,0.06,0.4,M.wood,0,0.45,0));for(const x of [-0.6,0.6])g.add(box(0.08,0.42,0.36,M.wood,x,0.21,0));return g;};
  const logPile=s=>{const g=new THREE.Group();const rr=rng(s);for(let i=0;i<9;i++){const row=Math.floor(i/4),c=cyl(0.11,0.11,1.1,M.wood,(i%4)*0.24-0.36+row*0.12,0.11+row*0.2,0,10);c.rotation.z=Math.PI/2;c.rotation.y=(rr()-0.5)*0.1;g.add(c);}return g;};
  const well=s=>{const g=new THREE.Group();g.add(lathe({profile:[[0.7,0],[0.72,0.9],[0.55,0.95],[0.55,0.7]],material:M.plinth,seed:s,segments:20}));for(const x of [-0.62,0.62])g.add(box(0.1,1.9,0.1,M.darkWood,x,1.85,0));g.add(box(1.5,0.08,0.1,M.darkWood,0,2.8,0));const roof=new THREE.Mesh(new THREE.ConeGeometry(1.0,0.6,4),M.slate);roof.rotation.y=Math.PI/4;roof.position.y=3.1;roof.castShadow=true;g.add(roof);return g;};
  const lamp=s=>{const g=new THREE.Group();g.add(cyl(0.05,0.07,3.2,M.iron,0,1.6,0,10));g.add(box(0.3,0.42,0.3,M.iron,0,3.4,0));const glow=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.3,0.22),new THREE.MeshStandardMaterial({color:0xffe1a8,emissive:0xffc070,emissiveIntensity:0.6}));glow.position.y=3.4;g.add(glow);return g;};
  const hay=s=>{const g=new THREE.Group();const m=new THREE.Mesh(new THREE.ConeGeometry(1.6,3.2,12),M.thatch);m.position.y=1.6;m.castShadow=m.receiveShadow=true;g.add(m);g.add(cyl(0.06,0.06,3.8,M.darkWood,0,1.9,0,8));return g;};
  const washing=s=>{const g=new THREE.Group();const rr=rng(s);for(const x of [-1.6,1.6])g.add(box(0.06,1.8,0.06,M.darkWood,x,0.9,0));g.add(box(3.2,0.02,0.02,M.iron,0,1.75,0));for(let i=0;i<5;i++){const c=std([0.6+rr()*0.35,0.6+rr()*0.35,0.6+rr()*0.35],0.9,0,rr);g.add(box(0.35+rr()*0.2,0.5+rr()*0.3,0.02,c,-1.2+i*0.6,1.45,0));}return g;};
  return {barrel,crate,bench,logPile,well,lamp,hay,washing};
}

/** Street furniture and yard clutter around every door, along streets and in the square, within `radius` of the stage. */
export function scatterProps({terrain,settlement,seed=1,radius=220,materials=null,extra={}}={}){
  const r=rng(seed+9);const g=new THREE.Group();g.name='props';const M=Object.assign({},settlement.materials,{iron:new THREE.MeshStandardMaterial({color:0x2a2a2c,roughness:0.6,metalness:0.7})},materials??{});
  const mk=Object.assign(propMakers(seed,M),extra);const sx=terrain.stage.x,sz=terrain.stage.z;let n=0;
  const put=(obj,x,z,yaw,name)=>{obj.name=name;const m=name==='lamp post'?obj:mergeStatic(obj);m.name=name;terrain.place(m,x,z,{yaw});m.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});g.add(m);n++;};
  const free=(x,z)=>!settlement.occupied(x,z,0.4)&&!terrain.isWater(x,z)&&terrain.roadMask(x,z)<0.2&&Math.hypot(x-sx,z-sz)>terrain.stage.radius;
  for(const b of settlement.buildings){if(Math.hypot(b.x-sx,b.z-sz)>radius)continue;const [fx,fz]=b.door.facing;const rx=fz,rz=-fx; // right of the door
    const pick=r();const off=b.w/2-0.6;
    if(pick<0.35){const x=b.door.x+rx*(off*0.6),z=b.door.z+rz*(off*0.6);if(free(x,z))put(mk.barrel(b.door.x*7+1),x,z,r()*Math.PI,'barrel');}
    else if(pick<0.55){const x=b.door.x-rx*(off*0.6),z=b.door.z-rz*(off*0.6);if(free(x,z))put(mk.crate(b.door.x*3+2),x,z,r()*0.4,'crate');}
    else if(pick<0.7){const x=b.door.x+rx*(off*0.7)+fx*0.2,z=b.door.z+rz*(off*0.7)+fz*0.2;if(free(x,z))put(mk.bench(1),x,z,Math.atan2(fx,fz),'bench');}
    else if(pick<0.8){const x=b.x-fx*(b.d/2+2.2),z=b.z-fz*(b.d/2+2.2);if(free(x,z))put(mk.logPile(b.x*5),x,z,Math.atan2(fx,fz)+Math.PI/2,'log pile');}
    else if(pick<0.88){const x=b.x-fx*(b.d/2+3)+rx*2,z=b.z-fz*(b.d/2+3)+rz*2;if(free(x,z))put(mk.washing(b.x*2),x,z,Math.atan2(fx,fz)+Math.PI/2,'washing line');}
  }
  // square furniture and lamps along the main street
  const plan=settlement.plan;if(plan.square){const a=r()*Math.PI*2;const x=plan.square.x+Math.cos(a)*plan.square.r*0.55,z=plan.square.z+Math.sin(a)*plan.square.r*0.55;if(free(x,z))put(mk.well(3),x,z,0,'well');}
  const main=[...terrain.roads].sort((a,b)=>b.width-a.width)[0];if(main&&(plan.kind==='town'||plan.kind==='city')){for(let s=30;s<main.length-30;s+=34){const p=main.at(s);const side=(Math.floor(s/34)%2?1:-1);const x=p.x-p.tangent[1]*side*(main.width/2+0.6),z=p.z+p.tangent[0]*side*(main.width/2+0.6);if(Math.hypot(x-sx,z-sz)>radius)continue;if(free(x,z))put(mk.lamp(1),x,z,0,'lamp post');}}
  // haystacks at the edge of the fields
  for(let i=0;i<6;i++){const a=r()*Math.PI*2,d=radius*(0.5+r()*0.5);const x=sx+Math.cos(a)*d,z=sz+Math.sin(a)*d;if(free(x,z)&&terrain.buildable(x,z))put(mk.hay(i),x,z,r(),'haystack');}
  return {group:g,count:n,makers:mk};
}

// ---- people and animals ---------------------------------------------------------------------------------------
/** Walkers on the street network and grazers in the fields. Call update(t) from your timeline. */
export function populate({terrain,settlement,seed=1,people=16,animals=8,radius=140,speed=[1.0,1.4]}={}){
  const r=rng(seed+13);const g=new THREE.Group();g.name='population';const sx=terrain.stage.x,sz=terrain.stage.z;const walkers=[];
  const routes=settlement.plan.walkNetwork.filter(pts=>pts.some(([x,z])=>Math.hypot(x-sx,z-sz)<radius));
  const PAL=[0x5a6b7c,0x7c4a3a,0x3f5a6b,0x8a7a4a,0x4a5a3a,0x6b3f4f,0x8a5a2a,0x2f3f4f];
  for(let i=0;i<people&&routes.length;i++){const pts=routes[Math.floor(r()*routes.length)];const pl=pts.map(([x,z])=>new THREE.Vector3(x,0,z));
    const f=jointedFigure({height:1.6+r()*0.25,body:r()<0.5?'m':'f',top:PAL[Math.floor(r()*PAL.length)],trousers:PAL[Math.floor(r()*PAL.length)],dress:r()<0.3?{color:PAL[Math.floor(r()*PAL.length)]}:null,hat:r()<0.4?{kind:r()<0.5?'brim':'cap'}:null,coat:r()<0.25?PAL[Math.floor(r()*PAL.length)]:null,seed:Math.floor(r()*1e6),lod:'low'});
    // pose() animates the figure's own y (the walk bob), so the ground height lives on a holder group
    const holder=new THREE.Group();holder.name=`walker-${i}`;holder.add(f);g.add(holder);const cum=[0];for(let k=1;k<pl.length;k++)cum.push(cum[k-1]+pl[k].distanceTo(pl[k-1]));
    walkers.push({f,holder,pl,cum,len:cum[cum.length-1],s0:r()*cum[cum.length-1],v:(speed[0]+r()*(speed[1]-speed[0]))*(r()<0.5?1:-1)});}
  const grazers=[];
  for(let i=0;i<animals;i++){let x,z,t=0;do{const a=r()*Math.PI*2,d=terrain.stage.radius+20+r()*(radius*0.6);x=sx+Math.cos(a)*d;z=sz+Math.sin(a)*d;}while(t++<40&&(!terrain.buildable(x,z)||settlement.occupied(x,z,3)));
    const sheep=r()<0.6;const a=sheep?quadruped({kind:'dog',coat:0xe8e2d4,coat2:0x2a2622,shoulder:0.62,seed:i+3}):quadruped({kind:'horse',coat:[0x6a3a1c,0x3a2a1c,0xa88a6a][i%3],coat2:0x1c1310,shoulder:1.5,seed:i+7});
    a.name=sheep?`sheep-${i}`:`horse-${i}`;terrain.place(a,x,z,{yaw:r()*Math.PI*2});g.add(a);grazers.push({a,phase:r()*10,graze:sheep?0.9:0.6});}
  const update=(t)=>{for(const w of walkers){let s=(w.s0+w.v*t)%(2*w.len);if(s<0)s+=2*w.len;const back=s>w.len;const along=back?2*w.len-s:s;let k=0;while(k<w.cum.length-2&&w.cum[k+1]<along)k++;const L=w.cum[k+1]-w.cum[k]||1,u=(along-w.cum[k])/L;
      const p=w.pl[k].clone().lerp(w.pl[k+1],u);const dir=w.pl[k+1].clone().sub(w.pl[k]).normalize();if(back)dir.negate();
      // keep to the road edge, on the ground, facing the way of travel
      const side=w.v>0?1:-1;p.x+=-dir.z*side*1.6;p.z+=dir.x*side*1.6;w.holder.position.set(p.x,terrain.height(p.x,p.z),p.z);w.holder.rotation.y=Math.atan2(dir.x,dir.z);
      w.f.userData.pose(t,{walk:1,distance:Math.abs(w.v)*t,speed:Math.abs(w.v)});}
    for(const gz of grazers){const down=0.5+0.5*Math.sin(t*0.25+gz.phase)>0.4?gz.graze:0;gz.a.userData.pose(t+gz.phase,{walk:0,headDown:down,tailSwish:0.5});}};
  return {group:g,walkers,grazers,update};
}
