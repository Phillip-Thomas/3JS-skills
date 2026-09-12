import * as THREE from 'three';
import {bakePBRFields} from './pbr-fields.js';

const mod = (a, b) => ((a % b) + b) % b;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t*t*(3-2*t);};
function hash(x, y, seed) {
  let n = Math.imul(x ^ seed, 374761393) ^ Math.imul(y + seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(u, v, nx, ny, seed) {
  const x=u*nx, y=v*ny, ix=Math.floor(x), iy=Math.floor(y);
  const sx=smooth(0,1,x-ix), sy=smooth(0,1,y-iy);
  const h=(a,b)=>hash(mod(a,nx),mod(b,ny),seed);
  return mix(mix(h(ix,iy),h(ix+1,iy),sx),mix(h(ix,iy+1),h(ix+1,iy+1),sx),sy);
}
function shade(base, amount) {return base.map(c => THREE.MathUtils.clamp(c + amount, 0.015, 0.95));}

// Substrate fields have no joints: assembly boundaries belong to geometry/masonry.
// Artistic starting points, not measured substances. Color is encoded sRGB.
export function substrateField({kind, color, seed=1, resolution=512, tileMeters,
  grainMeters, roughness, relief, variation=.5, alloy='brass', turning=0, pattern=null}={}) {
  const presets={
    stone:{span:[.8,.8],color:[.57,.55,.49],grain:.012,roughness:.78,relief:.00045},
    terracotta:{span:[.5,.5],color:[.58,.29,.17],grain:.004,roughness:.8,relief:.00014},
    metal:{span:[.4,.4],color:alloy==='steel'?[.72,.74,.76]:alloy==='copper'?[.85,.58,.42]:[.82,.69,.43],grain:.001,roughness:.31,relief:0},
    leather:{span:[.3,.3],color:[.24,.12,.075],grain:.006,roughness:.57,relief:.00009},
    timber:{span:[.4,1.2],color:[.39,.25,.14],grain:.009,roughness:.57,relief:.00008},
    // cloth family: grain = thread pitch. Bake at a small tile so the weave resolves; garments repeat it.
    cloth:{span:[.12,.12],color:[.5,.5,.55],grain:.0012,roughness:.88,relief:.0002},   // plain weave (shirts, canvas)
    linen:{span:[.14,.14],color:[.8,.76,.68],grain:.0018,roughness:.85,relief:.00024},  // coarse plain weave with slubs
    wool:{span:[.16,.16],color:[.45,.4,.35],grain:.003,roughness:.95,relief:.00045},     // fuzzy knit/felt
    twill:{span:[.12,.12],color:[.28,.32,.45],grain:.0015,roughness:.8,relief:.00025}   // diagonal ridges (denim, drill)
  };
  const preset=presets[kind];if(!preset)throw Error('Unknown substrate kind');
  const span=tileMeters??preset.span,base=color??preset.color,g=grainMeters??preset.grain;
  const r=roughness??preset.roughness,h=relief??preset.relief;
  if(!Array.isArray(span)||span.length!==2||!span.every(v=>Number.isFinite(v)&&v>0)||
    !Array.isArray(base)||base.length!==3||!base.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||
    !Number.isInteger(resolution)||resolution<4||![g,r,h,variation,turning].every(Number.isFinite)||
    g<=0||r<0||r>1||h<0||variation<0||variation>1||turning<0||turning>1)throw Error('Invalid substrate specification');
  if(kind==='metal'&&!['brass','steel','copper'].includes(alloy))throw Error('Unknown alloy; supply a supported alloy and optional color');
  const pixel=Math.max(...span)/resolution;
  // Suppress unresolved amplitude instead of enlarging fine features into bumps.
  function band(u,v,sx,sy,k) {
    const nx=Math.max(1,Math.round(span[0]/Math.max(sx,pixel*2)));
    const ny=Math.max(1,Math.round(span[1]/Math.max(sy,pixel*2)));
    return (noise(u,v,nx,ny,seed+k)-.5)*Math.min(1,Math.min(sx,sy)/(pixel*2));
  }
  const clamp=x=>THREE.MathUtils.clamp(x,0,1);
  function sample(u,v) {
    // Deliberately quiet broad pigment: conspicuous unique stains need a separate finite/world field.
    const broad=band(u,v,.19,.23,2),mid=band(u,v,g*3,g*3,5),fine=band(u,v,g,g,11);
    if(kind==='stone') {
      const mineral=band(u+mid*.013,v+mid*.013,g*.6,g*.6,17);
      const pits=Math.pow(clamp((-fine-.15)*4),2);
      return {albedo:shade(base,variation*(broad*.026+mid*.043+mineral*.09)),
        height:h*(mid*.4+mineral*.3-pits*.65),roughness:clamp(r+mid*.08+pits*.06),metalness:0};
    }
    if(kind==='terracotta') {
      const firing=band(u,v,.13,.065,19);
      const rings=Math.sin(2*Math.PI*v*Math.max(1,Math.round(span[1]/.022))+broad*.25);
      const pores=clamp((-fine-.2)*4);
      return {albedo:shade(base,variation*(firing*.08+fine*.025)),
        height:h*(fine*.32-pores*.6+rings*turning*.18),roughness:clamp(r+fine*.1+pores*.04),metalness:0};
    }
    if(kind==='metal') {
      const tooling=band(u,v,g,.13,23);
      return {albedo:shade(base,variation*broad*.008),height:h*tooling,
        roughness:clamp(r+variation*(tooling*.035+broad*.01)),metalness:1};
    }
    if(['cloth','linen','wool','twill'].includes(kind)) {
      const nx=Math.max(1,Math.round(span[0]/g)),ny=Math.max(1,Math.round(span[1]/g)),res=Math.min(1,g/(pixel*2.5));
      let weave;
      if(kind==='twill')weave=.5+.4*Math.sin((u*nx+v*ny)*Math.PI*2);
      else{const wa=.5+.5*Math.sin(u*nx*Math.PI*2),wb=.5+.5*Math.sin(v*ny*Math.PI*2);const over=(Math.floor(u*nx)+Math.floor(v*ny))%2;weave=over?wa*.6+wb*.4:wb*.6+wa*.4;}
      const fuzz=kind==='wool'?band(u,v,g*.6,g*.6,53)*1.5:0,slub=kind==='linen'?Math.max(0,band(u,v,g*4,g*40,57))*1.2:0; // slubs are short, not full-height stripes
      const wear=broad*.06+mid*.03; // fade and mottling
      let col=base;
      if(pattern){ // printed/woven pattern: {type:'stripes'|'check'|'dots'|'floral', color2:[r,g,b], color3?, scale?=0.03 m, width?=0.5}
        const sc=pattern.scale??.03,cx=Math.max(1,Math.round(span[0]/sc)),cy=Math.max(1,Math.round(span[1]/sc)); // integer cells keep the tile periodic
        const px=u*cx,py=v*cy,fx=px-Math.floor(px),fy=py-Math.floor(py),w=pattern.width??.5,soft=Math.min(.08,pixel*cx/span[0]*1.5);
        const edge=(f,a,b)=>smooth(a-soft,a+soft,f)*(1-smooth(b-soft,b+soft,f));
        let pc=0,pc3=0;
        if(pattern.type==='stripes')pc=edge(fy,0,w);
        else if(pattern.type==='check'){const a=edge(fx,0,w),b=edge(fy,0,w);pc=Math.max(a,b)*.75+a*b*.25;}
        else if(pattern.type==='dots'){pc=1-smooth(w*.45-soft,w*.45+soft,Math.hypot(fx-.5,fy-.5));}
        else if(pattern.type==='floral'){const ix=Math.floor(px),iy=Math.floor(py);
          for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const gx=mod(ix+i,cx),gy=mod(iy+j,cy);if(hash(gx,gy,seed+71)>.55)continue; // sparse
            const ox=ix+i+.25+.5*hash(gx,gy,seed+73),oy=iy+j+.25+.5*hash(gx,gy,seed+79),dx=px-ox,dy=py-oy,d=Math.hypot(dx,dy),ang=Math.atan2(dy,dx);
            const petals=.22+.09*Math.cos(5*ang+hash(gx,gy,seed+83)*6.28);pc=Math.max(pc,1-smooth(petals-soft,petals+soft,d));pc3=Math.max(pc3,1-smooth(.07-soft,.07+soft,d));
            // a leaf beside each flower
            const lx=ox+.36,ly=oy-.1,ld=Math.hypot((px-lx)*1.6,(py-ly)*.8);pc3=Math.max(pc3,(1-smooth(.16-soft,.16+soft,ld))*.9);}}
        const c2=pattern.color2??[.9,.9,.9],c3=pattern.color3??c2;
        col=base.map((c,i)=>c+(c2[i]-c)*pc);col=col.map((c,i)=>c+(c3[i]-c)*pc3);
      }
      return {albedo:shade(col,variation*(wear+(weave-.5)*.13*res+slub*.04+fuzz*.06)),height:h*((weave-.5)*res+fuzz*.5),
        roughness:clamp(r+(weave-.5)*.05+fuzz*.05),metalness:0};
    }
    if(kind==='leather') {
      // Periodic jittered cellular grain: groove depth, not painted polygon outlines.
      const nx=Math.max(2,Math.round(span[0]/Math.max(g,pixel*3))),ny=Math.max(2,Math.round(span[1]/Math.max(g,pixel*3)));
      const x=u*nx,y=v*ny,ix=Math.floor(x),iy=Math.floor(y);let a=10,b=10;
      for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
        const cx=ix+i,cy=iy+j,px=cx+.15+.7*hash(mod(cx,nx),mod(cy,ny),seed+31),py=cy+.15+.7*hash(mod(cx,nx),mod(cy,ny),seed+37);
        const d=Math.hypot(px-x,py-y);if(d<a){b=a;a=d;}else if(d<b)b=d;
      }
      const crown=smooth(0,.24,b-a)*Math.min(1,g/(pixel*3));
      return {albedo:shade(base,variation*(broad*.045+mid*.015)),height:h*crown,
        roughness:clamp(r+(1-crown)*.12+mid*.035),metalness:0};
    }
    // Long-grain timber along local V; end grain needs its own mapping/field.
    const warp=band(u,v,.12,.42,41)*.028;
    const grain=band(u+warp,v,g,.65,43),fiber=band(u+warp,v,g*.28,.16,47);
    const late=smooth(.05,.28,grain);
    return {albedo:shade(base,variation*(broad*.025+grain*.10-late*.045+fiber*.028)),
      height:h*(grain*.45+fiber*.25),roughness:clamp(r+grain*.1-late*.035),metalness:0};
  }
  return {sample,spanMeters:[...span],kind,seed,grainMeters:g,roughness:r,relief:h,variation,alloy,turning,pattern};
}


/**
 * Close-range detail layer for the large-tile families (plaster, masonry, stone, soil, wood/timber). The metric bake resolves
 * a few texels per centimetre at best, so within two metres these read as flat colour. This bakes a small seamless tile of
 * kind-specific fine structure (trowel sweeps and pitting on plaster, pores and grit on stone, fine grain on timber, grit
 * and clods on soil, sand pits on masonry) and multiplies it into albedo, normal and roughness in the shader, repeated at
 * `tileMeters` across the material's metric UVs. Applied by createSurface unless `detail:false`.
 */
export function applySurfaceDetail(material,{spanMeters,kind='plaster',seed=1,tileMeters=0.5,strength=0.45,resolution=256}={}){
  const res=resolution,px=tileMeters/res;
  const band=(u,v,l,k)=>{const n=Math.max(1,Math.round(tileMeters/Math.max(l,px*2)));return (noise(u,v,n,n,seed+k)-.5)*Math.min(1,l/(px*2));};
  const fieldFor=kind==='plaster'?(u,v)=>{const sweep=band(u+band(u,v,.09,3)*.25,v,.035,5)*.3+band(u,v,.012,7)*.35+band(u,v,.005,9)*.25;const pit=Math.max(0,band(u,v,.009,11)-.17)*3;return [sweep*.6-pit*.5,sweep*.0007-pit*.0005];} // fine sand-float texture with sparse pits, not blotches
    :kind==='stone'||kind==='masonry'?(u,v)=>{const pore=Math.max(0,band(u,v,.008,13)-.12)*3,grit=band(u,v,.02,17)*.6+band(u,v,.045,19)*.4;return [grit-pore*.5,grit*.0006-pore*.0005];}
    :kind==='timber'||kind==='wood'?(u,v)=>{const g=band(u*.15+band(u,v,.3,23)*.05,v,.0025,29)*.9+band(u,v,.02,31)*.3;return [g,g*.0004];}
    :(u,v)=>{const grit=band(u,v,.012,37)*.5+band(u,v,.03,41)*.35,clod=Math.max(0,band(u,v,.07,43)-.1)*2;return [grit+clod*.4,grit*.0012+clod*.003];};
  const sample=(u,v)=>{let n=0,h=0;for(const [du,dv,w] of [[0,0,(1-u)*(1-v)],[-1,0,u*(1-v)],[0,-1,(1-u)*v],[-1,-1,u*v]]){const [a,b]=fieldFor(((u+du)*tileMeters+3.7)/tileMeters,((v+dv)*tileMeters+9.1)/tileMeters);n+=a*w;h+=b*w;}n*=1.3;h*=1.3;
    const g=THREE.MathUtils.clamp(.5+n,0,1);return {albedo:[g,g,g],height:h,roughness:THREE.MathUtils.clamp(.9-n*.25,0,1),metalness:0};};
  const maps=bakePBRFields({width:res,height:res,spanMeters:[tileMeters,tileMeters],periodic:true,sample});
  for(const t of [maps.map,maps.normalMap,maps.roughnessMap])if(t){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  const repeat=new THREE.Vector2(spanMeters[0]/tileMeters,spanMeters[1]/tileMeters);
  material.onBeforeCompile=shader=>{
    shader.uniforms.surfDetailMap={value:maps.map};shader.uniforms.surfDetailNormal={value:maps.normalMap};shader.uniforms.surfDetailRepeat={value:repeat};shader.uniforms.surfDetailStrength={value:strength};
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <map_pars_fragment>','#include <map_pars_fragment>\nuniform sampler2D surfDetailMap;uniform sampler2D surfDetailNormal;uniform vec2 surfDetailRepeat;uniform float surfDetailStrength;')
      .replace('#include <map_fragment>','#include <map_fragment>\n{vec3 d=texture2D(surfDetailMap,vMapUv*surfDetailRepeat).rgb;diffuseColor.rgb*=mix(vec3(1.0),d*2.0,surfDetailStrength);}')
      .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n{vec3 dn=texture2D(surfDetailNormal,vMapUv*surfDetailRepeat).xyz*2.0-1.0;normal=normalize(normal+vec3(dn.xy*surfDetailStrength*1.4,0.0));}')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n{float dl=texture2D(surfDetailMap,vMapUv*surfDetailRepeat).r;roughnessFactor=clamp(roughnessFactor-(dl-0.5)*0.2*surfDetailStrength,0.0,1.0);}');
  };
  material.customProgramCacheKey=()=>'surface-detail';material.needsUpdate=true;material.userData.detail={kind,tileMeters,strength};return material;
}

function createSubstrate(spec) {
  const field=substrateField(spec);
  const maps=bakePBRFields({width:spec.resolution??512,height:spec.resolution??512,spanMeters:field.spanMeters,sample:field.sample});
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:1,...maps});
  // Smooth finishes must not acquire signed 8-bit normal quantization stripes.
  if(field.relief===0)material.normalScale.set(0,0);
  if(spec.detail!==false&&['stone','timber'].includes(field.kind))applySurfaceDetail(material,{spanMeters:field.spanMeters,kind:field.kind,seed:field.seed,tileMeters:field.kind==='timber'?0.3:0.4,strength:spec.detailStrength??0.4});
  material.name=field.kind+'-metric-pbr';
  material.userData.surface={kind:field.kind,tileMeters:field.spanMeters,seed:field.seed,grainMeters:field.grainMeters,relief:field.relief,variation:field.variation};
  return material;
}

// General starting points, not measured reference matches. All distances in meters.
// Reuse a material across meshes; map geometry with its tileMeters. No texture-repeat mutations.
export function createSurface(spec = {}) {
  if(['stone','terracotta','metal','leather','timber','cloth','linen','wool','twill'].includes(spec.kind))return createSubstrate(spec);
  const {kind='masonry', color, seed=1, resolution=512, unit=[0.28,0.085], joint=0.009, relief=0.003, tileMeters, roughness}=spec;
  if (!['masonry','plaster','wood','soil'].includes(kind)) throw new Error('Unknown surface kind');
  if (!Array.isArray(unit) || unit.length!==2 || !unit.every(n=>Number.isFinite(n)&&n>0) ||
      !Number.isFinite(joint) || joint<=0 || joint>=Math.min(...unit)*0.45 ||
      !Number.isFinite(relief) || relief<0) throw new Error('Invalid construction dimensions');
  const defaults={masonry:[0.60,0.49,0.37],plaster:[0.72,0.69,0.61],wood:[0.38,0.28,0.18],soil:[0.47,0.40,0.30]};
  const base=color??defaults[kind];
  const span=tileMeters??(kind==='masonry'?[unit[0]*8,unit[1]*16]:kind==='wood'?[0.55,2.4]:[2.4,2.4]);
  if (!Array.isArray(span)||span.length!==2||!span.every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid tile span');
  const cols=Math.round(span[0]/unit[0]), rows=Math.round(span[1]/unit[1]);
  if(kind==='masonry' && (cols<1||rows<2||rows%2||Math.abs(cols*unit[0]-span[0])>1e-6||Math.abs(rows*unit[1]-span[1])>1e-6)) {
    throw new Error('Running-bond tile needs whole units horizontally and an even number of courses vertically');
  }
  function sample(u,v) {
    const broad=noise(u,v,3,3,seed), mid=noise(u,v,17,19,seed+3), fine=noise(u,v,83,79,seed+9);
    if(kind==='masonry') {
      const sy=v*span[1], row=Math.floor(sy/unit[1]);
      const sx=u*span[0]+(row%2)*unit[0]*0.5, column=Math.floor(sx/unit[0]);
      const x=mod(sx,unit[0]), y=mod(sy,unit[1]);
      const boundary=Math.min(x,unit[0]-x,y,unit[1]-y)-joint*0.5;
      const edge=smooth(-0.0005,0.0025,boundary+(mid-.5)*0.0015);
      const unitTint=(hash(mod(column,cols),mod(row,rows),seed+31)-.5)*.065;
      const unitColor=shade(base,unitTint+(broad-.5)*.04+(fine-.5)*.025);
      const mortar=shade(base.map(c=>mix(c,.63,.38)),(mid-.5)*.035);
      return {albedo:unitColor.map((c,i)=>mix(mortar[i],c,edge)),
        height:relief*edge+(mid-.5)*.0007*edge+(fine-.5)*.00035,
        roughness:mix(.94,roughness??.79,edge)+(mid-.5)*.09,metalness:0};
    }
    if(kind==='plaster') return {albedo:shade(base,(broad-.5)*.045+(mid-.5)*.025+(fine-.5)*.012),
      height:(mid-.5)*.001+(fine-.5)*.0006,
      roughness:(roughness??.86)+(mid-.5)*.12,metalness:0};
    if(kind==='wood') {
      const warp=(noise(u,v,5,7,seed+11)-.5)*.012;
      const grain=noise(u+warp,v,101,5,seed+13), latewood=smooth(.56,.79,grain);
      return {albedo:shade(base,(broad-.5)*.07+(grain-.5)*.07-latewood*.025),
        height:(grain-.5)*.00065+(mid-.5)*.00025,
        roughness:(roughness??.69)+(grain-.5)*.18,metalness:0};
    }
    return {albedo:shade(base,(broad-.5)*.08+(mid-.5)*.045+(fine-.5)*.035),
      height:(broad-.5)*.018+(mid-.5)*.004+(fine-.5)*.0009,
      roughness:(roughness??.94)+(mid-.5)*.08,metalness:0};
  }
  const maps=bakePBRFields({width:resolution,height:resolution,spanMeters:span,sample});
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:1,...maps});
  if(spec.detail!==false&&['plaster','masonry','soil','wood'].includes(kind))applySurfaceDetail(material,{spanMeters:span,kind,seed,tileMeters:kind==='wood'?0.3:kind==='plaster'?0.5:0.4,strength:spec.detailStrength??(kind==='plaster'?0.3:0.35)});
  material.name=kind+'-metric-pbr';
  material.userData.surface={kind,tileMeters:[...span],seed,unit:[...unit],joint,relief};
  return material;
}

// Axis-aligned flat faces only, e.g. BoxGeometry before rotation. World dimensions
// belong in geometry, not mesh.scale. offset is assembly-space translation for course alignment.
export function metricBoxUV(geometry,tileMeters,offset=[0,0,0]) {
  if (!tileMeters?.every(n=>Number.isFinite(n)&&n>0) || tileMeters.length!==2 ||
      offset.length!==3 || !offset.every(Number.isFinite)) throw new Error('Invalid metric mapping');
  const p=geometry.getAttribute('position'), n=geometry.getAttribute('normal');
  if(!p||!n||p.count!==n.count) throw new Error('Positions and face normals are required');
  const uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i)+offset[0],y=p.getY(i)+offset[1],z=p.getZ(i)+offset[2];
    const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
    let u,v;
    if(Math.abs(nx)>0.9999){u=-Math.sign(nx)*z;v=y;}
    else if(Math.abs(ny)>0.9999){u=x;v=-Math.sign(ny)*z;}
    else if(Math.abs(nz)>0.9999){u=Math.sign(nz)*x;v=y;}
    else throw new Error('metricBoxUV requires split, axis-aligned flat faces; use a suitable unwrap for curved geometry');
    uv[i*2]=u/tileMeters[0];uv[i*2+1]=v/tileMeters[1];
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  return geometry;
}

// Straight circular cylinders. Chord approximation improves with radialSegments.
// A non-integral circumference/tile width leaves a pattern seam: place it deliberately.
export function metricCylinderGeometry(radius,height,tileMeters,radialSegments=64) {
  if(![radius,height,...tileMeters].every(n=>Number.isFinite(n)&&n>0)||tileMeters.length!==2)throw new Error('Invalid cylinder dimensions');
  const g=new THREE.CylinderGeometry(radius,radius,height,radialSegments);
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
  for(let i=0;i<p.count;i++) {
    if(Math.abs(n.getY(i))>.99) uv.setXY(i,p.getX(i)/tileMeters[0],-Math.sign(n.getY(i))*p.getZ(i)/tileMeters[1]);
    else uv.setXY(i,uv.getX(i)*2*Math.PI*radius/tileMeters[0],p.getY(i)/tileMeters[1]);
  }
  uv.needsUpdate=true;return g;
}

// Checks actual world-space UV density and native-map wiring, not appearance.
// UV0, one material, conventional mesh transforms. Skinned/morphed/shader-projected
// surfaces need their own check. Inspect each distinct scale for instanced geometry.
export function inspectSurface(mesh,{tileMeters=mesh.material?.userData?.surface?.tileMeters,tolerance=.025,instanceIndex}={}) {
  if(!tileMeters?.every(n=>Number.isFinite(n)&&n>0)||tileMeters.length!==2)throw new Error('Supply physical tile span');
  if(Array.isArray(mesh.material)||mesh.isSkinnedMesh||mesh.morphTargetInfluences?.length)throw new Error('Unsupported surface; inspect its actual deformation/mapping separately');
  mesh.updateWorldMatrix(true,false);
  const matrix=mesh.matrixWorld.clone();
  if(mesh.isInstancedMesh){if(!Number.isInteger(instanceIndex)||instanceIndex<0||instanceIndex>=mesh.count)throw new Error('Choose an instance');const m=new THREE.Matrix4();mesh.getMatrixAt(instanceIndex,m);matrix.multiply(m);}
  const mat=mesh.material,g=mesh.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),issues=[];
  if(!p||!uv)throw new Error('Position and UV0 required');
  if(!mat.map||!mat.normalMap||!mat.roughnessMap)issues.push('Missing coordinated color/normal/roughness maps for this structured surface');
  if(mat.map&&mat.map.colorSpace!==THREE.SRGBColorSpace)issues.push('This baked encoded color map requires sRGB');
  for(const key of ['normalMap','roughnessMap','metalnessMap'])if(mat[key]&&mat[key].colorSpace!==THREE.NoColorSpace)issues.push(key+' is color encoded');
  if(mat.bumpMap&&mat.bumpMap===mat.map)issues.push('Albedo reused as physical height');
  const maps=[mat.map,mat.normalMap,mat.roughnessMap,mat.metalnessMap].filter(Boolean);
  for(const t of maps){if(t.matrixAutoUpdate)t.updateMatrix();if(t.channel!==0)issues.push('Non-UV0 map requires a separate mapping check');}
  if(maps.some(t=>!t.matrix.equals(maps[0].matrix)))issues.push('PBR channels use different texture transforms');
  const transform=mat.map?.matrix??new THREE.Matrix3();
  const count=g.index?g.index.count:p.count;
  let maxRelativeError=0,maxSkew=0,triangles=0,degenerateUV=0;
  for(let i=0;i<count;i+=3) {
    const ids=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k);
    const pos=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(matrix));
    const tex=ids.map(j=>new THREE.Vector2().fromBufferAttribute(uv,j).applyMatrix3(transform));
    if(![...pos.flatMap(v=>v.toArray()),...tex.flatMap(v=>v.toArray())].every(Number.isFinite)){
      issues.push('Nonfinite positions, transforms or UVs');continue;
    }
    const e1=pos[1].sub(pos[0]),e2=pos[2].sub(pos[0]);
    if(new THREE.Vector3().crossVectors(e1,e2).lengthSq()<1e-18)continue;
    const d1=tex[1].sub(tex[0]),d2=tex[2].sub(tex[0]),det=d1.x*d2.y-d1.y*d2.x;
    if(Math.abs(det)<1e-14){degenerateUV++;continue;}
    const U=e1.clone().multiplyScalar(d2.y).addScaledVector(e2,-d1.y).divideScalar(det);
    const V=e2.clone().multiplyScalar(d1.x).addScaledVector(e1,-d2.x).divideScalar(det);
    maxRelativeError=Math.max(maxRelativeError,Math.abs(U.length()/tileMeters[0]-1),Math.abs(V.length()/tileMeters[1]-1));
    maxSkew=Math.max(maxSkew,Math.abs(U.dot(V))/(U.length()*V.length()));triangles++;
  }
  if(!triangles||degenerateUV)issues.push('Missing or degenerate surface mapping');
  if(maxRelativeError>tolerance)issues.push('Physical tile scale differs from declared span');
  if(maxSkew>tolerance)issues.push('Surface mapping shears the material axes');
  return {ok:issues.length===0,issues,triangles,degenerateUV,maxRelativeError,maxSkew,tileMeters:[...tileMeters]};
}
