import * as THREE from 'three';
import {bakePBRFields} from './pbr-fields.js';

const mix=(a,b,t)=>a+(b-a)*t;
const fade=t=>t*t*t*(t*(t*6-15)+10);
function hash(x,y,seed){
  let n=Math.imul(x^seed,374761393)^Math.imul(y+seed,668265263);
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}
// No modulo into a small repeating tile. Coordinates are stable scene meters.
export function groundNoise(x,y,seed=1){
  const ix=Math.floor(x),iy=Math.floor(y),u=fade(x-ix),v=fade(y-iy);
  return mix(mix(hash(ix,iy,seed),hash(ix+1,iy,seed),u),
    mix(hash(ix,iy+1,seed),hash(ix+1,iy+1,seed),u),v);
}
export function groundField({seed=1,color=[.47,.40,.30],minWavelength=.2}={}){
  if(!Number.isFinite(minWavelength)||minWavelength<=0||!Number.isInteger(seed)||
    !Array.isArray(color)||color.length!==3||!color.every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw Error('Invalid ground field');
  return (x,y)=>{
    // Continuous low-frequency coordinate distortion, independent of bake bounds.
    const wx=x+4*(groundNoise(x/23,y/23,seed+10)-.5);
    const wy=y+4*(groundNoise(x/23+19,y/23-8,seed+20)-.5);
    let pigment=0,relief=0,finish=0;
    const scales=[38,13,4.7,1.6,.53,.18];
    const colors=[.085,.055,.035,.023,.012,.006];
    const heights=[0,.012,.009,.004,.0012,.00035];
    for(let i=0;i<scales.length;i++){
      if(scales[i]<minWavelength)continue; // Omit unresolved bands before baking.
      const a=i*1.173,c=Math.cos(a),s=Math.sin(a),l=scales[i];
      const n=groundNoise((c*wx-s*wy)/l,(s*wx+c*wy)/l,seed+31*i)-.5;
      pigment+=n*colors[i];relief+=n*heights[i];finish+=n*.025;
    }
    return {albedo:color.map(c=>THREE.MathUtils.clamp(c+pigment,0,1)),height:relief,
      roughness:THREE.MathUtils.clamp(.91+finish,0,1),metalness:0};
  };
}
// Finite, unique UV domain, not a repeating microtexture or terrain geometry generator.
// UV u/v correspond to the supplied meter-space axes; horizontal PlaneGeometry
// rotated -PI/2 maps v along -worldZ. Set origin accordingly across patches.
export function createAperiodicGround({spanMeters,origin=[0,0],resolution=1024,seed=1,color,detail=true}={}){
  if(!Array.isArray(spanMeters)||spanMeters.length!==2||!spanMeters.every(x=>Number.isFinite(x)&&x>0)||
    !Array.isArray(origin)||origin.length!==2||!origin.every(Number.isFinite)||
    !Number.isInteger(resolution)||resolution<16||resolution>4096)throw Error('Invalid finite ground domain');
  const minWavelength=4*Math.max(...spanMeters)/resolution;
  const field=groundField({seed,color,minWavelength});
  const maps=bakePBRFields({width:resolution,height:resolution,spanMeters,periodic:false,
    sample:(u,v)=>field(origin[0]+u*spanMeters[0],origin[1]+v*spanMeters[1])});
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:1,...maps});
  if(detail)applyGroundDetail(material,{spanMeters,seed,...(detail===true?{}:detail)});
  material.userData.aperiodicGround={spanMeters:[...spanMeters],origin:[...origin],seed,minWavelength,detail:!!detail,
    scope:'Unique bounded UV surface; no edge/mip continuity guarantee between separate bakes. Fine unresolved bands omitted; the detail layer supplies 1–10 cm grain.'};
  return material;
}

/**
 * Close-range detail layer. The aperiodic bake resolves ~4 texels per metre-band at most, so from one to five metres the
 * ground reads as a flat colour field. This bakes a small periodic tile of fine grain (grit, clods, pebbles, dust lightness
 * changes) and multiplies it into the base albedo, normal and roughness in the shader, repeated across the span. Repetition
 * at this scale is invisible because the aperiodic base carries all the large-scale variation.
 */
export function applyGroundDetail(material,{spanMeters,seed=1,tileMeters=0.8,strength=0.55,resolution=256}={}){
  const r=(x,y,s)=>groundNoise(x,y,seed+s);
  const field=(x,y)=>{let n=0,h=0;
    const bands=[[0.11,0.5,0.004],[0.045,0.3,0.0018],[0.018,0.2,0.0008]]; // [wavelength m, pigment weight, height m]
    for(const [l,w,hh] of bands){const k=r(x/l,y/l,Math.round(l*1000))-0.5;n+=k*w;h+=k*hh;}
    const pebble=Math.max(0,r(x/0.16,y/0.16,77)-0.78)*3;n+=pebble*0.5;h+=pebble*0.006;   // scattered small stones
    return [n,h];};
  // Seamless tile: blend the field at the four wrapped offsets with bilinear weights, so the edges match exactly.
  const sample=(u,v)=>{const T=tileMeters;let n=0,h=0;
    for(const [du,dv,w] of [[0,0,(1-u)*(1-v)],[-1,0,u*(1-v)],[0,-1,(1-u)*v],[-1,-1,u*v]]){const [a,b]=field((u+du)*T+37,(v+dv)*T+91);n+=a*w;h+=b*w;}
    n*=1.35;h*=1.35; // blending softens contrast; restore it
    const g=THREE.MathUtils.clamp(0.5+n,0,1);
    return {albedo:[g,g,g],height:h,roughness:THREE.MathUtils.clamp(0.9-n*0.3,0,1),metalness:0};};
  const maps=bakePBRFields({width:resolution,height:resolution,spanMeters:[tileMeters,tileMeters],periodic:true,sample});
  for(const t of [maps.map,maps.normalMap,maps.roughnessMap])if(t){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  const repeat=new THREE.Vector2(spanMeters[0]/tileMeters,spanMeters[1]/tileMeters);
  material.onBeforeCompile=shader=>{
    shader.uniforms.groundDetailMap={value:maps.map};shader.uniforms.groundDetailNormal={value:maps.normalMap};
    shader.uniforms.groundDetailRepeat={value:repeat};shader.uniforms.groundDetailStrength={value:strength};
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <map_pars_fragment>','#include <map_pars_fragment>\nuniform sampler2D groundDetailMap;uniform sampler2D groundDetailNormal;uniform vec2 groundDetailRepeat;uniform float groundDetailStrength;')
      .replace('#include <map_fragment>','#include <map_fragment>\n{vec3 d=texture2D(groundDetailMap,vMapUv*groundDetailRepeat).rgb;diffuseColor.rgb*=mix(vec3(1.0),d*2.0,groundDetailStrength);}')
      .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n{vec3 dn=texture2D(groundDetailNormal,vMapUv*groundDetailRepeat).xyz*2.0-1.0;normal=normalize(normal+vec3(dn.xy*groundDetailStrength*1.5,0.0));}')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n{float dl=texture2D(groundDetailMap,vMapUv*groundDetailRepeat).r;roughnessFactor=clamp(roughnessFactor-(dl-0.5)*0.25*groundDetailStrength,0.0,1.0);}');
  };
  material.customProgramCacheKey=()=>'ground-detail';material.needsUpdate=true;
  material.userData.groundDetail={tileMeters,strength};return material;
}
