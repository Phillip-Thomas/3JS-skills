// Props composed from parts.js. Each factory is a few lines: it shows HOW an object is assembled from the generic
// patterns (planked panel, frame + hinge, legged top, lathe, vessel, spoked wheel, lofted hull), so you can compose
// objects that are not here the same way. Every factory takes `seed`; different seeds give different proportions,
// plank counts, band counts and finish, so two calls never produce the same piece. Origin at floor contact, faces +Z.
// Pass `materials` ({wood,darkWood,metal,brass,stone,cloth,glass,terracotta,leaf,iron,leather,paper}) to reuse your
// createSurface() materials.
import * as THREE from 'three';
import {rng,vary,std,mesh,box,cyl,group,plankedPanel,frame,hinge,leggedTop,lathe,vessel,spokedWheel,loftedHull,canvasOver,clusterFill} from './parts.js';

function palette(materials,seed){const r=rng(seed*7+3);const d={wood:std(0x7a5a3a,0.75,0,r),darkWood:std(0x4a3320,0.7,0,r),metal:std(0x8a8a8a,0.4,1,r),brass:std(0xb08d4a,0.35,1,r),
  stone:std(0x8a857b,0.9,0,r),cloth:std(0xb8a98a,0.95,0,r),glass:new THREE.MeshPhysicalMaterial({color:0xdde8ee,roughness:0.05,metalness:0,transmission:0.8,thickness:0.01,opacity:1}),
  terracotta:std(0xb35a34,0.85,0,r),leaf:std(0x4f6b34,0.8,0,r),iron:std(0x2a2a2a,0.6,1,r),leather:std(0x5a3a24,0.7,0,r),paper:std(0xe8e0cc,0.9,0,r)};return Object.assign(d,materials||{});}

/** Workbench = legged top with apron + drawer fronts. */
export function createWorkbench({width=1.8,depth=0.7,height=0.85,drawers=2,seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const g=leggedTop({width:vary(r,width,0.1),depth:vary(r,depth,0.1),height:vary(r,height,0.05),topThickness:0.06,legSize:0.07,apron:0.12,topMaterial:m.wood,legMaterial:m.darkWood,seed});g.name='workbench';
  const n=Math.max(0,Math.round(vary(r,drawers,0.3)));const w=g.children[0].geometry.parameters.width,d=g.children[0].geometry.parameters.depth,dw=(w-0.2)/Math.max(1,n);
  for(let i=0;i<n;i++){const x=-w/2+0.1+dw*(i+0.5);g.add(box(dw-0.03,0.1,0.02,m.wood,x,g.userData.top-0.12,d/2-0.03));g.add(cyl(0.012,0.012,0.02,m.brass,x,g.userData.top-0.12,d/2-0.01).rotateX(Math.PI/2));}
  return g;
}
/** Table = legged top without apron. */
export function createTable({width=1.2,depth=0.8,height=0.76,seed=1,materials}={}){const m=palette(materials,seed);const g=leggedTop({width,depth,height,topThickness:0.04,legSize:0.05,topMaterial:m.wood,legMaterial:m.darkWood,seed});g.name='table';return g;}
/** Stool = round three-legged top + leather pad. */
export function createStool({height=0.45,seatRadius=0.17,seed=1,materials}={}){const r=rng(seed),m=palette(materials,seed);const g=leggedTop({width:vary(r,seatRadius,0.1)*2,depth:0,height:vary(r,height,0.06),topThickness:0.04,legs:3,legSize:0.036,round:true,topMaterial:m.darkWood,legMaterial:m.darkWood,seed});g.name='stool';g.add(cyl(seatRadius*0.92,seatRadius*0.92,0.015,m.leather,0,g.userData.top+0.007,0));return g;}
/** Bench (seat) = slab on two block supports. */
export function createBench({length=1.4,height=0.45,depth=0.4,kind='stone',seed=1,materials}={}){const r=rng(seed),m=palette(materials,seed),mat=kind==='stone'?m.stone:m.wood;const g=group('bench');const L=vary(r,length,0.1);g.add(box(L,0.08,depth,mat,0,height-0.04,0));for(const s of [-1,1])g.add(box(0.12,height-0.08,depth*0.8,mat,s*(L/2-0.15),(height-0.08)/2,0));return g;}
/** Crate = four planked panels + corner battens (+ lid). */
export function createCrate({width=0.5,height=0.35,depth=0.4,open=false,seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const W=vary(r,width,0.12),H=vary(r,height,0.12),D=vary(r,depth,0.12),n=3+Math.floor(r()*3);const g=group('crate');
  const side=(w,at,rot,k)=>{const p=plankedPanel({width:w,height:H,thickness:0.018,planks:n,material:m.wood,seed:seed+k,vertical:false});p.position.set(-w/2,0,0);const h=new THREE.Group();h.add(p);h.rotation.y=rot;h.position.copy(at);g.add(h);};
  side(W,new THREE.Vector3(0,0,D/2),0,1);side(W,new THREE.Vector3(0,0,-D/2),Math.PI,2);side(D,new THREE.Vector3(W/2,0,0),Math.PI/2,3);side(D,new THREE.Vector3(-W/2,0,0),-Math.PI/2,4);
  for(const sx of [-1,1])for(const sz of [-1,1])g.add(box(0.035,H,0.035,m.darkWood,sx*(W/2-0.0175),H/2,sz*(D/2-0.0175)));g.add(box(W,0.018,D,m.wood,0,0.009,0));if(!open)g.add(box(W,0.018,D,m.wood,0,H-0.009,0));return g;
}
/** Sack = squashed capsule with a tied neck. */
export function createSack({height=0.55,radius=0.2,fill=0.8,seed=1,materials}={}){const r=rng(seed),m=palette(materials,seed);const h=vary(r,height,0.12)*(0.7+0.3*fill),R=vary(r,radius,0.12);const g=group('sack');const body=mesh(new THREE.CapsuleGeometry(R,Math.max(0.01,h-2*R),6,14),m.cloth);body.position.y=h/2;body.scale.set(1,1,0.85);body.rotation.y=r()*Math.PI;g.add(body);g.add(cyl(R*0.35,R*0.5,0.06,m.cloth,0,h-0.01,0));g.add(mesh(new THREE.TorusGeometry(R*0.38,0.008,6,16),m.darkWood).translateY(h-0.03).rotateX(Math.PI/2));return g;}
/** Barrel = lathe with a bulge + two iron hoops. */
export function createBarrel({height=0.85,radius=0.3,seed=1,materials}={}){const r=rng(seed),m=palette(materials,seed);const H=vary(r,height,0.1),R=vary(r,radius,0.1);const g=group('barrel');g.add(lathe({profile:[[R*0.85,0],[R*0.95,H*0.2],[R,H*0.5],[R*0.95,H*0.8],[R*0.85,H]],material:m.wood,segments:20,seed}));for(const y of [H*0.18,H*0.82])g.add(mesh(new THREE.TorusGeometry(R*0.98,0.012,8,32),m.iron).translateY(y).rotateX(Math.PI/2));return g;}
/** Bucket = tapered lathe + hoops + wire handle. */
export function createBucket({height=0.3,radius=0.14,seed=1,materials}={}){const r=rng(seed),m=palette(materials,seed);const H=vary(r,height,0.1),R=vary(r,radius,0.1);const g=group('bucket');g.add(lathe({profile:[[R*0.78,0],[R*0.8,0.01],[R,H]],material:m.wood,segments:18,seed}));for(const y of [H*0.2,H*0.85])g.add(mesh(new THREE.TorusGeometry(R*(0.8+0.2*y/H)+0.004,0.006,6,24),m.iron).translateY(y).rotateX(Math.PI/2));g.add(mesh(new THREE.TorusGeometry(R,0.006,6,24,Math.PI),m.iron).translateY(H).rotateY(Math.PI/2));return g;}
/** Plant pot = lathe pot + soil + leaf blades. */
export function createPlantPot({radius=0.18,height=0.28,leaves=14,plantHeight=0.45,seed=1,materials}={}){const r=rng(seed),m=palette(materials,seed);const R=vary(r,radius,0.12),H=vary(r,height,0.12);const g=group('plant-pot');g.add(lathe({profile:[[R*0.7,0],[R*0.98,H*0.88],[R*1.06,H*0.9],[R*1.06,H]],material:m.terracotta,seed}));g.add(cyl(R*0.93,R*0.93,0.01,std(0x3a2d22,0.95),0,H-0.008,0));
  const n=Math.round(vary(r,leaves,0.3));const leafMat=m.leaf.clone();leafMat.side=THREE.DoubleSide;for(let i=0;i<n;i++){const a=i*2.399+r()*0.3,rad=R*0.5*Math.sqrt((i+1)/n);const bh=plantHeight*vary(r,1,0.3);const blade=mesh(new THREE.PlaneGeometry(0.035,bh),leafMat);blade.position.set(Math.cos(a)*rad,H+bh/2-0.02,Math.sin(a)*rad);blade.rotation.set(0.35*Math.cos(a*3),a,0.35*Math.sin(a*2));g.add(blade);}return g;}
/** Door = frame + planked leaf on a hinge + iron bands + ring + threshold step. */
export function createDoor({width=0.95,height=2.1,thickness=0.05,open=0,bands=3,seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const W=vary(r,width,0.06),H=vary(r,height,0.04);const g=group('door');g.add(frame({width:W,height:H,depth:thickness*2,memberWidth:0.1,material:m.darkWood,seed}));g.add(box(W+0.4,0.06,0.5,m.stone,0,0.03,0.15));
  const leaf=plankedPanel({width:W,height:H-0.02,thickness,planks:4+Math.floor(r()*3),material:m.wood,seed:seed+1});const nb=Math.max(2,Math.round(vary(r,bands,0.3)));
  for(let i=0;i<nb;i++)leaf.add(box(W*0.85,0.05,0.008,m.iron,W/2,H*(0.2+0.6*i/Math.max(1,nb-1)),thickness/2+0.004));leaf.add(mesh(new THREE.TorusGeometry(0.045,0.008,8,20),m.iron).translateX(W*0.82).translateY(H*0.5).translateZ(thickness/2+0.02));
  const h=hinge(leaf,{open,width:W});g.add(h);g.userData.setOpen=h.userData.setOpen;return g;
}
/** Gate = two posts + slatted leaf with a diagonal brace on a hinge. */
export function createGate({width=1.0,height=1.1,open=0,seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const W=vary(r,width,0.1),H=vary(r,height,0.1);const g=group('gate');for(const s of [-1,1])g.add(box(0.1,H+0.15,0.1,m.darkWood,s*(W/2+0.05),(H+0.15)/2,0));
  const leaf=new THREE.Group();leaf.userData.size={width:W};const n=4+Math.floor(r()*3);for(let i=0;i<n;i++)leaf.add(box(0.06,H-0.05,0.025,m.wood,0.05+i*(W-0.1)/(n-1),H/2,0));
  for(const y of [H*0.25,H*0.8])leaf.add(box(W-0.02,0.07,0.02,m.wood,W/2,y,0.025));const brace=box(Math.hypot(W,H*0.55),0.07,0.02,m.wood,W/2,H*0.52,0.05);brace.rotation.z=Math.atan2(H*0.55,W);leaf.add(brace);
  const h=hinge(leaf,{open,width:W});g.add(h);g.userData.setOpen=h.userData.setOpen;return g;
}
/** Window = frame with sill + mullions + emissive pane (set into a wall opening of the same size). */
export function createWindow({width=0.9,height=1.1,depth=0.12,cols=2,rows=2,glow=0xcfe0f2,seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const g=frame({width,height,depth,memberWidth:0.05,sill:true,material:m.darkWood,seed});g.name='window';
  const c=Math.max(1,Math.round(vary(r,cols,0.3))),rw=Math.max(1,Math.round(vary(r,rows,0.3)));for(let i=1;i<c;i++)g.add(box(0.025,height,depth*0.6,m.darkWood,-width/2+i*width/c,height/2,0));for(let j=1;j<rw;j++)g.add(box(width,0.025,depth*0.6,m.darkWood,0,j*height/rw,0));
  const pane=mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({color:glow,emissive:glow,emissiveIntensity:1.2,roughness:0.2,side:THREE.DoubleSide}));pane.position.set(0,height/2,-depth*0.1);g.add(pane);return g;
}
/** Task lamp = weighted base, two arm segments, conical shade, emissive bulb, shadowed point light. */
export function createTaskLamp({reach=0.45,color=0xffd9a0,intensity=6,seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const R=vary(r,reach,0.15),a1=vary(r,0.35,0.3);const g=group('task-lamp');g.add(cyl(0.09,0.1,0.02,m.iron,0,0.01,0));
  const seg1=cyl(0.01,0.01,R,m.metal,Math.sin(a1)*R/2,0.02+Math.cos(a1)*R/2,0);seg1.rotation.z=-a1;g.add(seg1);const elbow=new THREE.Vector3(Math.sin(a1)*R,0.02+Math.cos(a1)*R,0);
  const a2=1.12;const seg2=cyl(0.009,0.009,R*0.8,m.metal,elbow.x+R*0.4*Math.sin(a2),elbow.y+R*0.4*Math.cos(a2),0);seg2.rotation.z=-a2;g.add(seg2);const head=new THREE.Vector3(elbow.x+R*0.8*Math.sin(a2),elbow.y+R*0.8*Math.cos(a2),0);
  const shade=mesh(new THREE.ConeGeometry(0.09,0.12,20,1,true),new THREE.MeshStandardMaterial({color:0x2a3a2a,roughness:0.5,metalness:0.6,side:THREE.DoubleSide}));shade.position.copy(head);shade.rotation.z=0.5;g.add(shade);
  const bulb=mesh(new THREE.SphereGeometry(0.02,10,8),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:3}));bulb.position.copy(head).add(new THREE.Vector3(0.03,-0.05,0));g.add(bulb);
  const light=new THREE.PointLight(color,intensity,4,2);light.position.copy(bulb.position);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.bias=-0.002;g.add(light);g.userData.light=light;return g;
}
/** Hand tools on a surface: screwdrivers, tweezers, loupe. Origin = surface point. */
export function createHandTools({seed=1,materials}={}){const r=rng(seed),m=palette(materials,seed);const g=group('hand-tools');const n=2+Math.floor(r()*3);
  for(let i=0;i<n;i++){const t=new THREE.Group();t.add(cyl(0.004,0.004,0.07,m.metal,0,0,0.035).rotateX(Math.PI/2),cyl(0.011,0.009,0.06,m.darkWood,0,0,-0.03).rotateX(Math.PI/2));t.position.set(-0.08+i*0.05,0.011,0);t.rotation.y=r()*0.8-0.4;g.add(t);}
  const tw=new THREE.Group();for(const s of [-1,1])tw.add(box(0.004,0.002,0.1,m.metal,s*0.005,0,0).rotateY(s*0.06));tw.position.set(0.12,0.002,0.02);tw.rotation.y=-0.5+r()*0.4;g.add(tw);
  const loupe=new THREE.Group();loupe.add(cyl(0.02,0.02,0.02,m.brass,0,0.01,0));loupe.add(cyl(0.017,0.017,0.004,m.glass,0,0.021,0));loupe.position.set(0.08,0,-0.06);g.add(loupe);return g;}
/** Wall clock = cased dial with bezel, marks, hands and a pendulum window; setTime(seconds) drives hands and swing. */
export function createWallClock({diameter=0.36,caseDepth=0.09,pendulumLength=0.45,secondsPerHour=60,seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const R=vary(r,diameter,0.12)/2,PL=vary(r,pendulumLength,0.15);const g=group('wall-clock');
  g.add(cyl(R+0.03,R+0.03,caseDepth,m.darkWood,0,0,0,32).rotateX(Math.PI/2));g.add(cyl(R,R,0.01,m.paper,0,0,caseDepth/2+0.002,32).rotateX(Math.PI/2));g.add(mesh(new THREE.TorusGeometry(R+0.005,0.01,8,40),m.brass).translateZ(caseDepth/2+0.005));
  for(let i=0;i<12;i++){const a=i*Math.PI/6;g.add(box(i%3?0.008:0.014,i%3?0.03:0.05,0.004,std(0x222222,0.6),Math.sin(a)*R*0.86,Math.cos(a)*R*0.86,caseDepth/2+0.01).rotateZ(-a));}
  const hourP=new THREE.Group(),minP=new THREE.Group();hourP.add(box(0.012,R*0.55,0.004,std(0x111111,0.5),0,R*0.275,caseDepth/2+0.014));minP.add(box(0.008,R*0.82,0.004,std(0x111111,0.5),0,R*0.41,caseDepth/2+0.018));g.add(hourP,minP);
  const caseBox=box(R*1.0,PL+0.1,caseDepth,m.darkWood,0,-(R+0.03)-(PL+0.1)/2,0);g.add(caseBox);g.add(mesh(new THREE.PlaneGeometry(R*0.72,PL),m.glass).translateY(caseBox.position.y).translateZ(caseDepth/2+0.002));
  const pivot=new THREE.Group();pivot.position.set(0,-(R+0.03),caseDepth/2-0.02);g.add(pivot);pivot.add(cyl(0.004,0.004,PL,m.brass,0,-PL/2,0));pivot.add(cyl(0.035,0.035,0.012,m.brass,0,-PL+0.03,0).rotateX(Math.PI/2));
  g.add(mesh(new THREE.CircleGeometry(R+0.01,40),m.glass).translateZ(caseDepth/2+0.024));
  g.userData.setTime=t=>{const hours=t/secondsPerHour;minP.rotation.z=-hours*Math.PI*2;hourP.rotation.z=-hours/12*Math.PI*2;pivot.rotation.z=Math.sin(t*Math.sqrt(9.81/PL))*0.12;};g.userData.setTime(0);return g;
}
/** Hand cart = planked bed + planked sides + two spoked wheels + axle + shafts (+ load of sacks). roll(distance) turns the wheels. */
export function createHandCart({length=1.4,width=0.8,wheelRadius=0.35,load=3,seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const L=vary(r,length,0.1),W=vary(r,width,0.1),WR=vary(r,wheelRadius,0.1);const g=group('hand-cart');const bedY=WR*0.95;
  const bed=plankedPanel({width:L,height:W,thickness:0.04,planks:5+Math.floor(r()*3),material:m.wood,seed,vertical:true});bed.rotation.x=-Math.PI/2;bed.position.set(-L/2,bedY+0.02,W/2);g.add(bed);
  for(const s of [-1,1]){const side=plankedPanel({width:L,height:0.22,thickness:0.02,planks:2,material:m.wood,seed:seed+s,vertical:false});side.position.set(-L/2,bedY+0.02,s*(W/2-0.01));g.add(side);}
  for(const s of [-1,1]){const w=spokedWheel({radius:WR,spokes:8,material:m.wood,rimMaterial:m.darkWood,hubMaterial:m.iron,seed:seed+s});w.position.set(0,WR,s*(W/2+0.04));g.add(w);g.userData[s<0?'wheelL':'wheelR']=w;}
  g.add(cyl(0.04,0.04,W+0.12,m.iron,0,WR,0).rotateX(Math.PI/2));for(const s of [-1,1])g.add(box(0.9,0.05,0.05,m.wood,L/2+0.4,bedY-0.02,s*(W/2-0.05)));
  for(let i=0;i<load;i++){const sk=createSack({height:0.45,radius:0.16,fill:0.9,seed:seed*3+i,materials});sk.position.set(-L/2+0.3+i*0.4,bedY+0.04,(i%2?0.15:-0.15));g.add(sk);}
  g.userData.roll=d=>{const a=d/WR;g.userData.wheelL.rotation.z=-a;g.userData.wheelR.rotation.z=-a;};return g;
}
/** Trough = hollow vessel on short feet, optionally with a water surface. */
export function createTrough({length=1.4,width=0.5,height=0.45,water=0.7,seed=1,materials}={}){const m=palette(materials,seed);const g=vessel({length,width,height,wall:0.05,legHeight:0.08,material:m.wood,legMaterial:m.darkWood,seed});g.name='trough';
  if(water>0){const inner=g.userData.inner;const w=mesh(new THREE.PlaneGeometry(inner.length,inner.width),new THREE.MeshPhysicalMaterial({color:0x4a6a6a,roughness:0.08,metalness:0,transmission:0.5,thickness:0.2,opacity:1}));w.rotation.x=-Math.PI/2;w.position.y=inner.floorY+(inner.rimY-inner.floorY)*water;g.add(w);}return g;}
/** Rowing/fishing boat = lofted hull + thwarts + a short mast. Origin at waterline centre, bow +Z. */
export function createBoat({length=4.5,beam=1.6,depth=0.7,mast=true,seed=1,materials}={}){const r=rng(seed),m=palette(materials,seed);const g=loftedHull({length,beam,depth,thwarts:2+Math.floor(r()*2),material:m.wood,strakeMaterial:m.darkWood,seed});g.name='boat';
  if(mast){const h=vary(r,2.8,0.15);g.add(cyl(0.035,0.05,h,m.darkWood,0,h/2-0.1,-g.userData.length*0.05));}return g;}
/** Market stall = plank counter (legged top) + canvas over posts + open crates filled with produce clusters. `produce` is a list of colours, one crate each. */
export function createStall({width=2.2,depth=1.2,counterHeight=0.9,produce=[0xc03a2a,0xe08a2a,0xd8b070],seed=1,materials}={}){
  const r=rng(seed),m=palette(materials,seed);const W=vary(r,width,0.08),D=vary(r,depth,0.08);const g=group('stall');
  g.add(leggedTop({width:W*0.9,depth:D*0.5,height:counterHeight,topThickness:0.05,legSize:0.06,apron:0.1,topMaterial:m.wood,legMaterial:m.darkWood,seed}));
  g.add(canvasOver({width:W,depth:D,height:counterHeight+1.2,material:std(0xa83a2a,0.9,0,r),postMaterial:m.darkWood,seed:seed+1}));
  produce.forEach((c,i)=>{const cw=(W*0.9-0.1)/produce.length;const crate=createCrate({width:cw-0.05,height:0.16,depth:0.35,open:true,seed:seed+2+i,materials});crate.position.set(-W*0.45+0.05+cw*(i+0.5),counterHeight,0);g.add(crate);
    const fill=clusterFill({length:cw-0.12,width:0.28,radius:i===2?0.05:0.04,count:i===2?9:30,layers:3,material:std(c,0.6,0,r),seed:seed+10+i,squash:i===2?0.6:1});fill.position.set(crate.position.x,counterHeight+0.02,0);g.add(fill);});
  g.userData.counterTop=counterHeight;return g;
}
