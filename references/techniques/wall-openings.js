import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Rectangular construction openings, with actual wall thickness and reveal surfaces.
// Local coordinates: x spans [-width/2,width/2], y spans [0,height], z +/-depth/2.
// Opening records: {x: center, bottom, width, height}. Doors may touch the floor.
// No style, facade layout, window size, historical subject or material is prescribed.
// `backing` (default 'interior'): behind every opening a shaded box reads as a dim room, so a window or door never opens
// onto sky or void. It sits on the -z side of the wall; pass backing:'none' when you build the space beyond yourself, or
// backing:{side:1} if your interior lies on +z.
export function wallWithOpenings({width,height,depth,openings=[],material,backing='interior'}) {
  if(![width,height,depth].every(x=>Number.isFinite(x)&&x>0)||!material)throw Error('Supply positive wall dimensions and material');
  const holes=openings.map(o=>{
    if(![o.x,o.bottom,o.width,o.height].every(Number.isFinite)||o.width<=0||o.height<=0)throw Error('Invalid opening');
    const h={left:o.x-o.width/2,right:o.x+o.width/2,bottom:o.bottom,top:o.bottom+o.height};
    if(h.left< -width/2||h.right>width/2||h.bottom<0||h.top>height)throw Error('Opening exceeds wall');
    return h;
  });
  const xs=[...new Set([-width/2,width/2,...holes.flatMap(h=>[h.left,h.right])])].sort((a,b)=>a-b);
  const ys=[...new Set([0,height,...holes.flatMap(h=>[h.bottom,h.top])])].sort((a,b)=>a-b);
  const parts=[],panels=[];
  // Merge adjacent filled cells horizontally. Holes may overlap; use their union.
  for(let j=0;j<ys.length-1;j++) {
    let start=null;
    const flush=end=>{
      if(start===null)return;
      const w=end-start,h=ys[j+1]-ys[j],x=(start+end)/2,y=(ys[j]+ys[j+1])/2;
      const g=new THREE.BoxGeometry(w,h,depth);g.translate(x,y,0);parts.push(g);
      panels.push({left:start,right:end,bottom:ys[j],top:ys[j+1]});start=null;
    };
    for(let i=0;i<xs.length-1;i++) {
      const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;
      const empty=holes.some(h=>x>h.left&&x<h.right&&y>h.bottom&&y<h.top);
      if(empty)flush(xs[i]);else if(start===null)start=xs[i];
    }
    flush(width/2);
  }
  if(!parts.length)throw Error('Openings remove the entire wall');
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;
  mesh.userData.wall={width,height,depth,openings:holes,panels};
  if(backing&&backing!=='none'){const side=(typeof backing==='object'&&backing.side)||-1,deep=(typeof backing==='object'&&backing.depth)||1.6;
    const dark=new THREE.MeshStandardMaterial({color:0x1a1613,roughness:1});const floorMat=new THREE.MeshStandardMaterial({color:0x2a241e,roughness:1});
    for(const o of holes){const g=new THREE.Group();g.name='opening backing';const ow=o.right-o.left,oh=o.top-o.bottom,cx=(o.left+o.right)/2,cy=(o.bottom+o.top)/2;const w=ow+0.6,h=oh+0.4;
      const back=new THREE.Mesh(new THREE.PlaneGeometry(w,h),dark);back.position.set(cx,cy,side*(depth/2+deep));back.rotation.y=side>0?Math.PI:0;g.add(back);
      for(const sx of [-1,1]){const p=new THREE.Mesh(new THREE.PlaneGeometry(deep,h),dark);p.position.set(cx+sx*w/2,cy,side*(depth/2+deep/2));p.rotation.y=-sx*Math.PI/2;g.add(p);}
      const fl=new THREE.Mesh(new THREE.PlaneGeometry(w,deep),floorMat);fl.position.set(cx,o.bottom+0.005,side*(depth/2+deep/2));fl.rotation.x=-Math.PI/2;g.add(fl);
      const ceil=new THREE.Mesh(new THREE.PlaneGeometry(w,deep),dark);ceil.position.set(cx,o.top+0.2,side*(depth/2+deep/2));ceil.rotation.x=Math.PI/2;g.add(ceil);
      g.traverse(m=>{if(m.isMesh){m.receiveShadow=true;m.userData.noShadow=true;}});mesh.add(g);}}
  return mesh;
}
