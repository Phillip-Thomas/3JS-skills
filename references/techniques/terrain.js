// terrain.js — a seeded landscape to the horizon that everything else stands on.
//
// One height function drives everything: a two-level heightfield mesh (1 m detail near the stage, 8 m to the horizon),
// slope- and height-driven ground colour (grass, soil, rock, sand), a water plane, flattened pads for stages and
// buildings, and roads carved as smoothed corridors. `height(x,z)` is exact for any point, so buildings, trees, props,
// figures and cameras can be placed on the ground without probing the mesh.
//
//   const terrain=createTerrain({size:2000, seed:7, relief:'valley', amplitude:35, waterLevel:2,
//                                stage:{x:0,z:0,radius:40}, roads:[[[-600,-20],[0,0],[500,120]]]});
//   scene.add(terrain.group);   const y=terrain.height(x,z);   terrain.place(tree, x, z);
//
// Relief presets: 'flat' (fields, a few dips), 'rolling' (downs), 'valley' (a river valley along z with hills either
// side), 'hills' (the stage on gentle ground, hills rising with distance), 'coast' (land falling into sea toward +x).
import * as THREE from 'three';
import {createAperiodicGround} from './aperiodic-ground.js';

// ---- noise -----------------------------------------------------------------------------------------------------
function hash2(ix,iy,seed){let h=(ix*374761393+iy*668265263+seed*1442695041)|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
const sm=t=>t*t*(3-2*t);
/** Value noise in [0,1] with C1 interpolation. */
export function noise2(x,y,seed=1){const ix=Math.floor(x),iy=Math.floor(y),fx=sm(x-ix),fy=sm(y-iy);
  const a=hash2(ix,iy,seed),b=hash2(ix+1,iy,seed),c=hash2(ix,iy+1,seed),d=hash2(ix+1,iy+1,seed);
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;}
/** Fractal noise in [-1,1]; `scale` is the wavelength of the largest octave in metres. */
export function fbm(x,y,seed=1,{octaves=5,lacunarity=2.05,gain=0.5,scale=300}={}){let f=1/scale,a=1,s=0,n=0;
  for(let i=0;i<octaves;i++){s+=(noise2(x*f+i*17.3,y*f-i*9.1,seed+i)*2-1)*a;n+=a;a*=gain;f*=lacunarity;}return s/n;}
/** Ridged noise in [0,1]: sharp crests for rocky hills. */
export function ridged(x,y,seed=1,{octaves=4,scale=400}={}){let f=1/scale,a=1,s=0,n=0;
  for(let i=0;i<octaves;i++){const v=1-Math.abs(noise2(x*f+i*5.7,y*f+i*3.3,seed+40+i)*2-1);s+=v*v*a;n+=a;a*=0.5;f*=2.1;}return s/n;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** metres covered by one repeat of a baked material (surface factory and masonry record it); maps are set to repeat */
function tileOf(material){const t=material.userData?.surface?.tileMeters??material.userData?.aperiodicGround?.spanMeters??[1,1];for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(material[k]){material[k].wrapS=material[k].wrapT=THREE.RepeatWrapping;material[k].needsUpdate=true;}return Array.isArray(t)?t:[t,t];}
const smooth=(e0,e1,v)=>{const t=clamp((v-e0)/(e1-e0),0,1);return t*t*(3-2*t);};

// ---- roads ----------------------------------------------------------------------------------------------------
function buildRoad(points,base,{width=4,verge=3,step=2,smoothing=40}={}){
  // resample the polyline every `step` metres, then low-pass the base height along it so the road never follows every bump
  const pts=[];for(let i=0;i<points.length-1;i++){const [ax,az]=points[i],[bx,bz]=points[i+1];const L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(L/step));
    for(let k=0;k<n;k++){const t=k/n;pts.push([ax+(bx-ax)*t,az+(bz-az)*t]);}}
  pts.push(points[points.length-1].slice());
  const raw=pts.map(p=>base(p[0],p[1]));const half=Math.round(smoothing/step);const hs=raw.map((_,i)=>{let s=0,n=0;for(let j=i-half;j<=i+half;j++){if(j<0||j>=raw.length)continue;s+=raw[j];n++;}return s/n;});
  const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  // coarse grid of segment indices so distance queries stay cheap over a 2 km road
  const cell=25,grid=new Map();const key=(x,z)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
  for(let i=0;i<pts.length-1;i++){const [ax,az]=pts[i],[bx,bz]=pts[i+1];const x0=Math.floor(Math.min(ax,bx)/cell)-1,x1=Math.floor(Math.max(ax,bx)/cell)+1,z0=Math.floor(Math.min(az,bz)/cell)-1,z1=Math.floor(Math.max(az,bz)/cell)+1;
    for(let gx=x0;gx<=x1;gx++)for(let gz=z0;gz<=z1;gz++){const k=`${gx},${gz}`;(grid.get(k)??grid.set(k,[]).get(k)).push(i);}}
  const road={points:pts,heights:hs,cum,width,verge,length:cum[cum.length-1],
    /** nearest point on the road: {d, h, t (metres along), tangent} */
    nearest(x,z){let best=null;const gx=Math.floor(x/cell),gz=Math.floor(z/cell);
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const segs=grid.get(`${gx+dx},${gz+dz}`);if(!segs)continue;
        for(const i of segs){const [ax,az]=pts[i],[bx,bz]=pts[i+1];const vx=bx-ax,vz=bz-az,L2=vx*vx+vz*vz||1;let t=((x-ax)*vx+(z-az)*vz)/L2;t=clamp(t,0,1);
          const px=ax+vx*t,pz=az+vz*t,d=Math.hypot(x-px,z-pz);if(!best||d<best.d){const L=Math.sqrt(L2);best={d,h:hs[i]*(1-t)+hs[i+1]*t,t:cum[i]+L*t,tangent:[vx/L,vz/L],x:px,z:pz};}}}
      return best;},
    /** point at `s` metres along the road */
    at(s){s=clamp(s,0,road.length);let i=0;while(i<cum.length-2&&cum[i+1]<s)i++;const L=cum[i+1]-cum[i]||1,t=(s-cum[i])/L;const [ax,az]=pts[i],[bx,bz]=pts[i+1];
      return {x:ax+(bx-ax)*t,z:az+(bz-az)*t,h:hs[i]*(1-t)+hs[i+1]*t,tangent:[(bx-ax)/L,(bz-az)/L]};}};
  return road;
}

// ---- terrain --------------------------------------------------------------------------------------------------
export function createTerrain({size=2000,seed=1,relief='rolling',amplitude=null,waterLevel=null,nearRadius=250,nearRes=1,farRes=8,
  stage={x:0,z:0,radius:40},roads=[],pads=[],smoothRegions=[],tints=[],rivers=[],valleyOffset=0,colors={},detail=true,bakeResolution=2048}={}){
  const A=amplitude??({flat:6,rolling:25,valley:45,hills:60,coast:30}[relief]??25);
  const sx=stage.x??0,sz=stage.z??0;
  // base relief before pads and roads
  const raw=(x,z)=>{const dx=x-sx,dz=z-sz,dist=Math.hypot(dx,dz);let h=fbm(x,z,seed,{scale:420,octaves:5})*A;
    h+=fbm(x,z,seed+3,{scale:60,octaves:3})*A*0.08; // small undulation everywhere
    if(relief==='valley'){const vx=dx-valleyOffset;const trough=Math.exp(-(vx*vx)/(2*160*160));h-=trough*A*1.1;h+=Math.max(0,Math.abs(vx)-140)*0.05;}
    if(relief==='hills'){const far=smooth(150,900,dist);h=h*(0.35+0.65*far)+ridged(x,z,seed,{scale:500})*A*1.2*far;}
    if(relief==='coast'){h-=Math.max(0,dx-150)*0.12;h+=smooth(-100,-700,dx)*A*0.6;}
    if(relief==='flat')h*=0.5;
    if(relief==='rolling')h+=ridged(x,z,seed,{scale:700})*A*0.4*smooth(200,900,dist);
    return h;};
  // heights are relative to the stage: the stage pad sits at y=0, so `waterLevel:-6` means six metres below the stage
  const raw0=raw(sx,sz);const base0=(x,z)=>raw(x,z)-raw0;
  // settlement-wide smoothing: a town sits on ground low-passed over ~60 m, so streets and lots share one gentle surface
  const smoothers=smoothRegions.map(reg=>{const R=reg.r??200,blend=reg.blend??60,cell=10,k=reg.radius??60;const n=Math.ceil((R+blend)/cell)*2+2;const x0=reg.x-n/2*cell,z0=reg.z-n/2*cell;const g=new Float32Array(n*n);
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){const x=x0+i*cell,z=z0+j*cell;let sum=0,cnt=0;for(let a=-k;a<=k;a+=cell/2*3)for(let b=-k;b<=k;b+=cell/2*3){sum+=base0(x+a,z+b);cnt++;}g[i*n+j]=sum/cnt;}
    return {x:reg.x,z:reg.z,R,blend,flatten:reg.flatten??0.6,sample(x,z){const u=(x-x0)/cell,v=(z-z0)/cell;const i=clamp(Math.floor(u),0,n-2),j=clamp(Math.floor(v),0,n-2);const fu=clamp(u-i,0,1),fv=clamp(v-j,0,1);return (g[i*n+j]*(1-fu)+g[(i+1)*n+j]*fu)*(1-fv)+(g[i*n+j+1]*(1-fu)+g[(i+1)*n+j+1]*fu)*fv;}};});
  const base=(x,z)=>{let h=base0(x,z);for(const sm of smoothers){const d=Math.hypot(x-sm.x,z-sm.z);if(d<sm.R+sm.blend){const w=1-smooth(sm.R,sm.R+sm.blend,d);const target=sm.sample(x,z)*(1-sm.flatten)+sm.sample(sm.x,sm.z)*sm.flatten;h=h*(1-w)+target*w;}}return h;};
  const stageH=base(sx,sz);
  const padList=[{x:sx,z:sz,r:stage.radius??40,blend:(stage.radius??40)*0.6,h:stage.height??stageH},...pads.map(p=>({x:p.x,z:p.z,r:p.r??8,blend:p.blend??6,h:p.h??base(p.x,p.z)}))];
  const roadList=roads.map(r=>Array.isArray(r)?buildRoad(r,base):buildRoad(r.points,base,r));
  const riverList=rivers.map(r=>{const rd=buildRoad(r.points,base,{width:r.width??10,verge:r.bank??6,smoothing:160});rd.depth=r.depth??2.5;rd.drop=r.drop??1.2;/* water sits `drop` below the bank line */for(let i=0;i<rd.heights.length;i++)rd.heights[i]-=rd.drop;rd.level=null;return rd;});
  for(const r of riverList){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [px,pz] of r.points){x0=Math.min(x0,px);x1=Math.max(x1,px);z0=Math.min(z0,pz);z1=Math.max(z1,pz);}const m=r.width/2+r.verge+1;r.bbox=[x0-m,x1+m,z0-m,z1+m];}
  // pads indexed on a 40 m grid and roads pre-checked against their bounding box: height() runs a few hundred thousand times
  const PC=40,padGrid=new Map();for(const p of padList){const reach=p.r+p.blend;for(let gx=Math.floor((p.x-reach)/PC);gx<=Math.floor((p.x+reach)/PC);gx++)for(let gz=Math.floor((p.z-reach)/PC);gz<=Math.floor((p.z+reach)/PC);gz++){const k=gx*100003+gz;(padGrid.get(k)??padGrid.set(k,[]).get(k)).push(p);}}
  for(const r of roadList){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [px,pz] of r.points){x0=Math.min(x0,px);x1=Math.max(x1,px);z0=Math.min(z0,pz);z1=Math.max(z1,pz);}const m=r.width/2+r.verge+1;r.bbox=[x0-m,x1+m,z0-m,z1+m];}
  /** ground height at any point (pads and roads applied) */
  const height=(x,z)=>{let h=base(x,z);
    for(const r of riverList){const b=r.bbox;if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue;const n=r.nearest(x,z);if(!n)continue;const edge=r.width/2+r.verge;if(n.d<edge){const w=1-smooth(r.width/2*0.6,edge,n.d);const bed=Math.min(h,n.h-r.depth);h=h*(1-w)+bed*w;}}
    const pads=padGrid.get(Math.floor(x/PC)*100003+Math.floor(z/PC));if(pads)for(const p of pads){const d=Math.hypot(x-p.x,z-p.z);if(d<p.r+p.blend){const w=1-smooth(p.r,p.r+p.blend,d);h=h*(1-w)+p.h*w;}}
    for(const r of roadList){const b=r.bbox;if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue;const n=r.nearest(x,z);if(!n)continue;const edge=r.width/2+r.verge;if(n.d<edge){const w=1-smooth(r.width/2,edge,n.d);h=h*(1-w)+n.h*w;}}
    if(waterLevel!==null){/* shore shelf: keep the bed just below the surface for a few metres so shallows read */const under=waterLevel-h;if(under>0&&under<1.5)h=waterLevel-1.5-(1.5-under)*0.3;}
    return h;};
  const normal=(x,z,e=0.5)=>{const hl=height(x-e,z),hr=height(x+e,z),hd=height(x,z-e),hu=height(x,z+e);return new THREE.Vector3(hl-hr,2*e,hd-hu).normalize();};
  const slopeCache=new Map();const SC=6;
  const slope=(x,z)=>{const k=Math.floor(x/SC)*100003+Math.floor(z/SC);let v=slopeCache.get(k);if(v===undefined){const n=normal(Math.floor(x/SC)*SC+SC/2,Math.floor(z/SC)*SC+SC/2,2);v=Math.acos(clamp(n.y,-1,1));slopeCache.set(k,v);}return v;};
  const roadMask=(x,z)=>{let m=0;for(const r of roadList){const n=r.nearest(x,z);if(n&&n.d<r.width/2+1)m=Math.max(m,1-smooth(r.width/2-0.5,r.width/2+1,n.d));}return m;};

  // ground colour per vertex: grass with patchiness, soil on the road and worn near pads, rock on steep ground, sand at the shore
  const C={grass:new THREE.Color(colors.grass??0x46682c),grass2:new THREE.Color(colors.grass2??0x6f8a3a),soil:new THREE.Color(colors.soil??0x6e5a42),rock:new THREE.Color(colors.rock??0x8a877d),sand:new THREE.Color(colors.sand??0xc9b892),road:new THREE.Color(colors.road??0x8a7e6c)};
  const tmp=new THREE.Color();
  const colourAt=(x,z,h,ny=null)=>{const n=ny===null?normal(x,z,1.5):{y:ny};const steep=smooth(0.55,0.85,1-n.y);const patch=noise2(x/23,z/23,seed+9)*0.6+noise2(x/4.5,z/4.5,seed+10)*0.4;
    tmp.copy(C.grass).lerp(C.grass2,patch);const hi=smooth(A*0.7,A*1.4,h-stageH);tmp.lerp(C.rock,Math.max(steep,hi*0.6));
    if(waterLevel!==null)tmp.lerp(C.sand,1-smooth(0.3,2.5,h-waterLevel));
    for(const rv of riverList){const b=rv.bbox;if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue;const n=rv.nearest(x,z);if(n&&n.d<rv.width/2+rv.verge)tmp.lerp(C.soil,(1-smooth(rv.width/2,rv.width/2+rv.verge,n.d))*0.7);}
    const rm=roadMask(x,z);tmp.lerp(C.road,rm);
    for(const t of tints){const d=Math.hypot(x-t.x,z-t.z);const w=(1-smooth(t.r,t.r+(t.blend??30),d))*(t.amount??0.5)*(0.8+0.2*noise2(x/2.5,z/2.5,seed+12));if(w>0)tmp.lerp(tintColor(t),w);}
    {const p=padList[0];const d=Math.hypot(x-p.x,z-p.z);tmp.lerp(C.soil,(1-smooth(p.r*0.5,p.r*1.3,d))*0.6);}
    return tmp.clone();};
  const tintCache=new Map();const tintColor=t=>{if(!tintCache.has(t))tintCache.set(t,new THREE.Color(t.color??0x7a6a50));return tintCache.get(t);};

  const group=new THREE.Group();group.name='terrain';
  const material=createAperiodicGround({spanMeters:[size,size],origin:[sx-size/2,sz-size/2],resolution:bakeResolution,seed,color:[1,1,1],detail:detail?{tileMeters:1.3,strength:0.32}:false});/* a softer, larger detail tile: at 0.8 m and full strength the repeat reads as a checkerboard from 50 m */material.vertexColors=true;material.roughness=0.95;
  const buildPatch=(extent,res,cx,cz,name,sink)=>{const segs=Math.max(4,Math.round(extent/res));const geo=new THREE.PlaneGeometry(extent,extent,segs,segs);geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position,uv=geo.attributes.uv,col=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){const x=pos.getX(i)+cx,z=pos.getZ(i)+cz;let h=height(x,z);if(sink){const d=Math.hypot(x-sx,z-sz);if(d<nearRadius-res)h-=0.6;}pos.setXYZ(i,x,h,z);
      uv.setXY(i,(x-(sx-size/2))/size,(z-(sz-size/2))/size);/* both patches share one world-anchored bake */}
    geo.computeVertexNormals();const nrm=geo.attributes.normal;
    for(let i=0;i<pos.count;i++){const c=colourAt(pos.getX(i),pos.getZ(i),pos.getY(i),nrm.getY(i));col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.computeBoundingSphere();
    const m=new THREE.Mesh(geo,material);m.name=name;m.receiveShadow=true;m.castShadow=false;m.userData.noShadow=true;return m;};
  const near=buildPatch(nearRadius*2,nearRes,sx,sz,'terrain-near',false);
  const far=buildPatch(size,farRes,sx,sz,'terrain-far',true);far.receiveShadow=true;
  group.add(far,near);
  let water=null;const waterMat=new THREE.MeshPhysicalMaterial({color:new THREE.Color(colors.water??0x2a4a58),roughness:0.12,metalness:0,clearcoat:1,clearcoatRoughness:0.08,transparent:true,opacity:0.92});
  for(const rv of riverList){const n=Math.max(2,Math.floor(rv.length/4));const pos=[],idx=[];const wdt=rv.width+rv.verge*0.6;
    for(let i=0;i<=n;i++){const p=rv.at(i/n*rv.length);const nx=-p.tangent[1],nz=p.tangent[0];for(const side of [-1,1])pos.push(p.x+nx*side*wdt/2,p.h,p.z+nz*side*wdt/2);if(i>0){const a=(i-1)*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();const m=new THREE.Mesh(geo,waterMat);m.name='river';m.receiveShadow=true;m.userData.noShadow=true;m.userData.floating=true;group.add(m);}
  if(waterLevel!==null){const wg=new THREE.PlaneGeometry(size*1.5,size*1.5);wg.rotateX(-Math.PI/2);
    water=new THREE.Mesh(wg,waterMat);water.position.set(sx,waterLevel,sz);water.name='water';water.receiveShadow=true;water.userData.noShadow=true;group.add(water);}

  const terrain={group,near,far,water,material,size,seed,height,normal,slope,roadMask,roads:roadList,rivers:riverList,waterLevel,stage:{x:sx,z:sz,radius:stage.radius??40,height:padList[0].h},
    /** put an object on the ground at (x,z); `align` tilts it to the slope, `sink` buries the base slightly for contact */
    place(obj,x,z,{yaw=0,align=false,sink=0.02,offset=0}={}){obj.position.set(x,height(x,z)-sink+offset,z);obj.rotation.set(0,yaw,0);
      if(align){const n=normal(x,z);const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),n);obj.quaternion.premultiply(q);}return obj;},
    /** true if (x,z) is on dry, gentle ground outside every road and the stage pad */
    buildable(x,z,{maxSlope=0.35,margin=2}={}){if(waterLevel!==null&&height(x,z)<waterLevel+0.5)return false;if(slope(x,z)>maxSlope)return false;
      for(const r of roadList){const n=r.nearest(x,z);if(n&&n.d<r.width/2+r.verge+margin)return false;}
      const d=Math.hypot(x-sx,z-sz);return d>(stage.radius??40)+margin;},
    isWater(x,z){if(waterLevel!==null&&height(x,z)<waterLevel)return true;for(const rv of riverList){const b=rv.bbox;if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue;const n=rv.nearest(x,z);if(n&&n.d<rv.width/2+1)return true;}return false;},
    /** a paved disc that follows the ground (a square, a yard); metric UVs in metres */
    pave({x,z,r,material,lift=0.05,res=null}){res=res??nearRes;/* the disc grid shares the near mesh's lattice, so both sample the same heights */const ox=sx-nearRadius,oz=sz-nearRadius;const n=Math.max(8,Math.ceil(2*r/res))+2;const src=new THREE.PlaneGeometry(n*res,n*res,n,n);src.rotateX(-Math.PI/2);src.translate(Math.round((x-ox)/res)*res+ox-x,0,Math.round((z-oz)/res)*res+oz-z);const sp=src.attributes.position;const tile=tileOf(material);
      // keep only triangles inside the circle so the disc follows the ground everywhere, not just at its rim
      const pos=[],uv=[],idx=[],map=new Int32Array(sp.count).fill(-1);const inside=i=>Math.hypot(sp.getX(i),sp.getZ(i))<=r+res*0.6;
      for(let i=0;i<sp.count;i++)if(inside(i)){const lx=sp.getX(i),lz=sp.getZ(i);const d=Math.hypot(lx,lz);const k=d>r?r/d:1;const px=x+lx*k,pz=z+lz*k;map[i]=pos.length/3;pos.push(px,height(px,pz)+lift,pz);uv.push(px/tile[0],pz/tile[1]);}
      const si=src.index.array;for(let t=0;t<si.length;t+=3){const a=map[si[t]],b=map[si[t+1]],c=map[si[t+2]];if(a>=0&&b>=0&&c>=0)idx.push(a,b,c);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
      const m=new THREE.Mesh(geo,material);m.name='paving';m.receiveShadow=true;m.castShadow=false;return m;},
    /** ribbon meshes along every road (or the given ones), following the ground; UV u across (0..1), v along in metres */
    roadSurfaces(material,{roads:list=roadList,lift=0.03,step=2,offset=0,width=null,name='road'}={}){const g=new THREE.Group();g.name=name+'-surfaces';
      const tile=tileOf(material);for(const rd of list){const n=Math.max(2,Math.floor(rd.length/step));const pos=[],uv=[],idx=[];const w=width??rd.width;
        for(let i=0;i<=n;i++){const p=rd.at(i/n*rd.length);const nx=-p.tangent[1],nz=p.tangent[0];for(const side of [-1,1]){const off=offset+side*w/2;const px=p.x+nx*off,pz=p.z+nz*off;pos.push(px,height(px,pz)+lift,pz);uv.push((side>0?w:0)/tile[0],i/n*rd.length/tile[1]);}
          if(i>0){const a=(i-1)*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
        const m=new THREE.Mesh(geo,material);m.name=name;m.receiveShadow=true;m.castShadow=false;g.add(m);}
      return g;}};
  return terrain;
}
