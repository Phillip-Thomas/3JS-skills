import * as THREE from 'three';
import {bakePBRFields} from './pbr-fields.js';

const mod=(x,n)=>((x%n)+n)%n;
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function hash(x,y,s){let n=Math.imul(x^s,374761393)^Math.imul(y+s,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(u,v,nx,ny,s){const x=u*nx,y=v*ny,i=Math.floor(x),j=Math.floor(y),a=smooth(0,1,x-i),b=smooth(0,1,y-j),h=(p,q)=>hash(mod(p,nx),mod(q,ny),s);return mix(mix(h(i,j),h(i+1,j),a),mix(h(i,j+1),h(i+1,j+1),a),b);}

// Metric running-bond masonry. Chipped/dressed finish is optional, not universal aging.
// All relief is height in meters; no painted highlights, shadow lines or directional AO.
export function createMasonry({unit=[.42,.22],joint=.009,relief=.005,edgeWear=.002,
  faceRelief=.0015,color=[.54,.50,.43],mortarColor,roughness=.82,seed=21,resolution=1024}={}) {
  if(unit.length!==2||![...unit,joint,relief,edgeWear,faceRelief,roughness].every(Number.isFinite)||
    unit.some(n=>n<=0)||joint<=0||joint>=Math.min(...unit)*.3||relief<0||edgeWear<0||faceRelief<0||roughness<0||roughness>1)
    throw Error('Invalid masonry dimensions or finish');
  const span=[unit[0]*6,unit[1]*8],mortar=mortarColor??color.map(c=>c*.94);
  const sample=(u,v)=>{
    const y=v*span[1],row=Math.floor(y/unit[1]),x=u*span[0]+(row%2)*unit[0]*.5,col=Math.floor(x/unit[0]);
    const id=hash(mod(col,6),mod(row,8),seed+43),cx=mod(x,unit[0]),cy=mod(y,unit[1]);
    const broad=noise(u,v,7,9,seed),middle=noise(u,v,37,43,seed+7),fine=noise(u,v,193,173,seed+17);
    const chip=noise(u,v,79,83,seed+23);
    const distance=Math.min(cx,unit[0]-cx,cy,unit[1]-cy)-joint*.5-edgeWear*smooth(.35,.8,chip);
    const edge=smooth(-.001,Math.max(.0015,joint*.3),distance);
    const pores=smooth(.70,.86,fine)*.0007;
    const face=faceRelief*((middle-.5)*.65+(broad-.5)*.35);
    const body=color.map((c,k)=>c+(id-.5)*.075+(broad-.5)*.026+(middle-.5)*.025+(fine-.5)*.017+(k===2?(id-.5)*.01:0));
    return {albedo:body.map((c,k)=>mix(mortar[k]+(middle-.5)*.035,c,edge)),
      height:edge*(relief+face-pores)+(1-edge)*(middle-.5)*.0005,
      roughness:mix(.94,roughness+(middle-.5)*.10+(id-.5)*.06,edge),metalness:0};
  };
  const maps=bakePBRFields({width:resolution,height:resolution,spanMeters:span,sample});
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:1,...maps});
  material.name='procedural-dressed-masonry';
  material.userData.surface={kind:'masonry',tileMeters:span,unit:[...unit],joint,relief,edgeWear,faceRelief,seed};
  return material;
}
