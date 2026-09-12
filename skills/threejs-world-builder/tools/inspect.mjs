#!/usr/bin/env node
// Portable world inspection. Ships with the skill; no lab paths, no shared state.
//   node ./skills/threejs-world-builder/tools/inspect.mjs [--views 0,4,5] [--times 24] [--sanity] [--world ./world]
// Serves the project with Vite, opens ./world/ in Chromium, and writes ./inspections/<stamp>/:
//   result.json   sanity checks (cameras inside meshes, nose-to-surface, targets outside the scene, unframed anchors, interpenetration;
//                 frame runs also report exposure per frame: mean luminance, near-black and blown-out fractions, with under/overexposure problems),
//                 startup errors, and the list of frames
//   *.png         native frames for the requested views (setView) and times (setTime), unless --sanity
// Requires the project's own dependencies: three, vite, playwright-core (with a Chromium build available to it).
// Environment (all optional): INSPECT_CHROMIUM (browser executable), INSPECT_BROWSER_ARGS (space-separated),
// INSPECT_LIMIT (max inspections that return frames; sanity runs never count), INSPECT_HOST_SERVICE=1
// (sandboxed builders: write a request for a host-side renderer and wait for its result instead of launching a browser).
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
// Dependencies come from the PROJECT (cwd), not from wherever this file lives (the skill folder may be a symlink).
const projectRequire=createRequire(path.join(process.cwd(),'package.json'));
const fromProject=async name=>import(pathToFileURL(projectRequire.resolve(name)).href);

const args=process.argv.slice(2);const opt=(k,d)=>{const i=args.indexOf(k);return i>=0&&args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:d;};
const flag=k=>args.includes(k);
const list=(v,d)=>v===undefined?d:String(v).split(',').map(Number).filter(Number.isFinite);
const views=list(opt('--views'),[0,4,5]),times=list(opt('--times'),[24]),sanity=flag('--sanity');
const worldDir=path.resolve(opt('--world','./world'));
const root=process.cwd(),outRoot=path.join(root,'inspections');fs.mkdirSync(outRoot,{recursive:true});
const rel=p=>'./'+path.relative(root,p).split(path.sep).join('/');
if(!fs.existsSync(path.join(worldDir,'index.html'))){console.error('No world/index.html to inspect');process.exit(2);}

// Optional local config (never required): {chromium, browserArgs:[], lock, limit}. A lab writes it; a plain project has none.
const cfgPath=[process.env.INSPECT_CONFIG,path.join(root,'inspect.config.json'),path.join(root,'..','inspect.config.json')].filter(Boolean).find(p=>fs.existsSync(p));const cfg=cfgPath?JSON.parse(fs.readFileSync(cfgPath,'utf8')):{};
if(cfg.chromium&&!process.env.INSPECT_CHROMIUM)process.env.INSPECT_CHROMIUM=cfg.chromium;
if(cfg.browserArgs&&!process.env.INSPECT_BROWSER_ARGS)process.env.INSPECT_BROWSER_ARGS=cfg.browserArgs.join(' ');
if(cfg.lock&&!process.env.INSPECT_LOCKED&&process.env.INSPECT_HOST_SERVICE!=='1'){
  // Serialize GPU use with the configured lock by re-running under flock.
  const {spawnSync}=await import('node:child_process');
  const r=spawnSync('flock',['-w','600',cfg.lock,process.execPath,...process.argv.slice(1)],{stdio:'inherit',env:{...process.env,INSPECT_LOCKED:'1'}});process.exit(r.status??1);
}
const stamp=`${Date.now()}-${randomBytes(3).toString('hex')}`,out=path.join(outRoot,stamp);fs.mkdirSync(out);
// Allowance: only runs that returned frames count.
const limit=Number(process.env.INSPECT_LIMIT||cfg.limit||0);
if(limit&&!sanity){const charged=fs.readdirSync(outRoot).filter(d=>fs.existsSync(path.join(outRoot,d,'result.json'))&&(JSON.parse(fs.readFileSync(path.join(outRoot,d,'result.json'),'utf8')).frames||[]).length>0).length;
  if(charged>=limit){console.error(`Inspection allowance exhausted (${limit} with frames). --sanity runs are free.`);process.exit(3);}}

// Sandboxed builders: hand the request to a host service that owns the browser and GPU.
if(process.env.INSPECT_HOST_SERVICE==='1'){
  const req=path.join(root,'self-inspections',`${Date.now()}-${randomBytes(4).toString('hex')}`);fs.mkdirSync(req,{recursive:true});
  fs.writeFileSync(path.join(req,'request.json'),JSON.stringify({views,times,sanity}));
  const deadline=Date.now()+12*60e3;let result;
  while(Date.now()<deadline){if(fs.existsSync(path.join(req,'result.json'))){result=JSON.parse(fs.readFileSync(path.join(req,'result.json'),'utf8'));break;}await new Promise(r=>setTimeout(r,300));}
  if(!result){console.error('Host inspection timed out');process.exit(4);}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,1));process.exit(result.ok?0:1);
}

// Browser-side checks: geometry-only camera/anchor sanity, serializable into the page.
function viewChecks(){
  const sc=worldTest.scene;sc.updateMatrixWorld(true);
  const boxes=[];let sceneMin=[1e9,1e9,1e9],sceneMax=[-1e9,-1e9,-1e9];
  sc.traverse(o=>{if(!o.isMesh||!o.geometry)return;const g=o.geometry;if(!g.boundingBox)g.computeBoundingBox();const b=g.boundingBox;if(!b)return;const e=o.matrixWorld.elements;
    let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const wx=e[0]*x+e[4]*y+e[8]*z+e[12],wy=e[1]*x+e[5]*y+e[9]*z+e[13],wz=e[2]*x+e[6]*y+e[10]*z+e[14];mn=[Math.min(mn[0],wx),Math.min(mn[1],wy),Math.min(mn[2],wz)];mx=[Math.max(mx[0],wx),Math.max(mx[1],wy),Math.max(mx[2],wz)];}
    if(!mn.every(Number.isFinite)||!mx.every(Number.isFinite))return;const ext=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
    for(let i=0;i<3;i++){sceneMin[i]=Math.min(sceneMin[i],mn[i]);sceneMax[i]=Math.max(sceneMax[i],mx[i]);}
    boxes.push({name:o.name||o.parent?.name||'mesh',mn,mx,ext,mesh:o});});
  const solid=boxes.filter(b=>b.ext.every(x=>x<30&&x>0.02));
  const inside=(p,b)=>p.every((v,i)=>v>b.mn[i]&&v<b.mx[i]);
  const rayHit=(o,d,b)=>{let t0=0,t1=1e9;for(let i=0;i<3;i++){const inv=1/d[i];let a=(b.mn[i]-o[i])*inv,c=(b.mx[i]-o[i])*inv;if(a>c)[a,c]=[c,a];t0=Math.max(t0,a);t1=Math.min(t1,c);if(t0>t1)return null;}return t0;};
  const pad=[0,1,2].map(i=>(sceneMax[i]-sceneMin[i])*0.1+0.5),sceneBox={mn:sceneMin.map((v,i)=>v-pad[i]),mx:sceneMax.map((v,i)=>v+pad[i])};
  const vs=worldTest.views.map((v,i)=>{const p=v.position,t=v.target,d=[t[0]-p[0],t[1]-p[1],t[2]-p[2]],len=Math.hypot(...d)||1,dn=d.map(x=>x/len);
    const insideMesh=solid.filter(b=>inside(p,b)).map(b=>b.name).slice(0,5);let nearest=Infinity;for(const b of solid){const h=rayHit(p,dn,b);if(h!==null&&h<nearest)nearest=h;}
    return {index:i,name:v.name,insideMesh,noseToSurface:nearest<0.35?+nearest.toFixed(2):null,facesNothing:!(nearest<200),targetOutsideScene:!inside(t,sceneBox),degenerate:len<0.2};});
  const st=worldTest.stats();const entities=[...(st.actors||[]),...(st.objects||[])];const cam=worldTest.camera;const framedBy=entities.map(()=>[]);
  worldTest.views.forEach((v,i)=>{worldTest.setView(i);cam.updateMatrixWorld(true);cam.updateProjectionMatrix();const m=cam.matrixWorldInverse.elements,pr=cam.projectionMatrix.elements;
    entities.forEach((e,k)=>{const q=e.position;const vx=m[0]*q[0]+m[4]*q[1]+m[8]*q[2]+m[12],vy=m[1]*q[0]+m[5]*q[1]+m[9]*q[2]+m[13],vz=m[2]*q[0]+m[6]*q[1]+m[10]*q[2]+m[14];
      const cx=pr[0]*vx+pr[4]*vy+pr[8]*vz+pr[12],cy=pr[1]*vx+pr[5]*vy+pr[9]*vz+pr[13],cw=pr[3]*vx+pr[7]*vy+pr[11]*vz+pr[15];if(cw<=0)return;if(Math.abs(cx/cw)<0.95&&Math.abs(cy/cw)<0.95)framedBy[k].push(i);});});
  worldTest.setView(0);
  const anchors=entities.map((e,k)=>({name:e.name,framedByViews:framedBy[k]}));
  // Interpenetration: solid meshes from different top-level groups whose world AABBs overlap by more than
  // 35% of the smaller box. Boxes carry the top-level group so parts of one assembly never flag each other.
  const topOf=o=>{let n=o;while(n.parent&&n.parent!==sc)n=n.parent;return n;};
  const solidTop=[];sc.traverse(o=>{if(!o.isMesh||!o.geometry?.boundingBox)return;const b=boxes.find(x=>x.mesh===o);if(b)solidTop.push({...b,top:topOf(o)});});
  const vol=b=>b.ext[0]*b.ext[1]*b.ext[2];const pen=[];
  for(let i=0;i<solidTop.length;i++)for(let j=i+1;j<solidTop.length;j++){const a=solidTop[i],b=solidTop[j];if(a.top===b.top)continue;if(!a.ext.every(x=>x<30&&x>0.02)||!b.ext.every(x=>x<30&&x>0.02))continue;
    const ov=[0,1,2].map(k=>Math.min(a.mx[k],b.mx[k])-Math.max(a.mn[k],b.mn[k]));if(ov.some(x=>x<=0))continue;const f=ov[0]*ov[1]*ov[2]/Math.min(vol(a),vol(b));
    if(f>0.35)pen.push({a:(a.top.name||a.name),b:(b.top.name||b.name),overlap:+f.toFixed(2)});}
  pen.sort((x,y)=>y.overlap-x.overlap);const seenPair=new Set();const penetrations=pen.filter(p=>{const k=[p.a,p.b].sort().join('|');if(seenPair.has(k))return false;seenPair.add(k);return true;}).slice(0,8);
  const problems=[...penetrations.map(p=>`'${p.a}' interpenetrates '${p.b}' (${Math.round(p.overlap*100)}% of the smaller part)`),...vs.flatMap(v=>[...(v.insideMesh.length?[`view ${v.index} '${v.name}' is inside mesh ${v.insideMesh.join(',')}`]:[]),...(v.noseToSurface!==null?[`view ${v.index} '${v.name}' is ${v.noseToSurface} m from a surface`]:[]),...(v.facesNothing?[`view ${v.index} '${v.name}' faces no geometry`]:[]),...(v.targetOutsideScene?[`view ${v.index} '${v.name}' target is outside the scene`]:[]),...(v.degenerate?[`view ${v.index} '${v.name}' position equals target`]:[])]),...anchors.filter(a=>!a.framedByViews.length).map(a=>`anchor '${a.name}' is not framed by any view`)];
  return {views:vs,anchors,solidMeshes:solid.length,penetrations,problems};
}
function glErrors(){const gl=document.querySelector('canvas')?.getContext('webgl2');if(!gl)return {codes:[],contextLost:false};const codes=[];for(let i=0;i<16;i++){const c=gl.getError();if(!c)break;codes.push(c);}return {codes,contextLost:gl.isContextLost()};}

const result={stamp,sanity,views,times,startupErrors:[],consoleErrors:[],problems:[],anchors:[],frames:[],ok:false};
let server,browser;
try{
  const viteMod=await fromProject('vite');const createServer=viteMod.createServer??viteMod.default?.createServer;
  server=await createServer({root,configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false,watch:null}});
  await server.listen();const port=server.config.server.port??server.httpServer.address().port;const url=`http://127.0.0.1:${port}/${path.relative(root,worldDir).split(path.sep).join('/')}/`;
  const pw=await fromProject('playwright-core');const chromium=pw.chromium??pw.default?.chromium; // CJS/ESM interop
  const extra=(process.env.INSPECT_BROWSER_ARGS||'').split(' ').filter(Boolean);
  browser=await chromium.launch({executablePath:process.env.INSPECT_CHROMIUM||undefined,headless:!extra.some(a=>a.includes('gpu')),args:['--no-sandbox',...extra]});
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  await page.route(/\/favicon\.ico$/,r=>r.fulfill({status:204,body:''}));
  page.on('pageerror',e=>result.startupErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});
  await page.goto(url);
  const ready=await Promise.race([page.waitForFunction(()=>window.worldTest?.ready,{},{timeout:90000}).then(()=>true),new Promise(r=>setTimeout(()=>r(false),90000))]);
  if(!ready||result.startupErrors.length)throw Error('World did not start: '+(result.startupErrors[0]||'worldTest.ready never became true'));
  const contract=await page.evaluate(()=>{const w=worldTest;const s=w.stats();const ok=e=>e&&typeof e.name==='string'&&Array.isArray(e.position)&&e.position.length===3&&e.position.every(Number.isFinite);
    return {views:Array.isArray(w.views)&&w.views.length===6,setTime:typeof w.setTime==='function',stats:Number.isFinite(s?.time)&&Array.isArray(s?.actors)&&s.actors.length>0&&s.actors.every(ok)&&Array.isArray(s?.objects)&&s.objects.length>0&&s.objects.every(ok)};});
  const missing=Object.entries(contract).filter(([,v])=>!v).map(([k])=>k);if(missing.length)throw Error('worldTest contract incomplete: '+missing.join(', '));
  const vc=await page.evaluate(viewChecks);Object.assign(result,{problems:vc.problems,anchors:vc.anchors,solidMeshes:vc.solidMeshes,viewDetails:vc.views});
  // Moving things: repeat the camera and anchor checks at the sampled times, so a static camera that an actor or vehicle
  // later walks into, or an anchor that leaves every frame, is caught before a charged look.
  for(const t of [24,64]){await page.evaluate(t=>{worldTest.setPaused(true);worldTest.setTime(t);},t);const v=await page.evaluate(viewChecks);
    const late=v.problems.filter(x=>!/interpenetrates/.test(x)&&!vc.problems.includes(x)).map(x=>`${x} at t=${t}`);result.problems.push(...late);}
  await page.evaluate(()=>worldTest.setTime(0));
  if(!sanity){
    await page.evaluate(()=>{worldTest.setPaused(true);worldTest.setTime(0);});
    // Render, then read the frame back in the same task (the WebGL buffer may be cleared between tasks) for an exposure check.
    const render=()=>page.evaluate(()=>{if(typeof worldTest.render==='function')worldTest.render();else worldTest.renderer.render(worldTest.scene,worldTest.camera);
      const c=worldTest.renderer.domElement,o=document.createElement('canvas');o.width=160;o.height=100;const g=o.getContext('2d');g.drawImage(c,0,0,160,100);
      const d=g.getImageData(0,0,160,100).data;let sum=0,dark=0,bright=0;const n=d.length/4;
      for(let i=0;i<d.length;i+=4){const l=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;sum+=l;if(l<0.04)dark++;if(l>0.96)bright++;}
      return {meanLuma:+(sum/n).toFixed(3),darkFraction:+(dark/n).toFixed(2),brightFraction:+(bright/n).toFixed(2)};});
    const exposure=(label,e)=>{if(e.meanLuma<0.10||e.darkFraction>0.55)result.problems.push(`${label} is underexposed (mean luminance ${e.meanLuma}, ${Math.round(e.darkFraction*100)}% near-black): raise exposure, not the lights`);
      else if(e.meanLuma>0.85||e.brightFraction>0.40)result.problems.push(`${label} is overexposed (mean luminance ${e.meanLuma}, ${Math.round(e.brightFraction*100)}% blown out): lower exposure only`);};
    // Shadow visibility from the hero view: re-render with the sun's shadow off and count changed pixels. Shadows that fall
    // away from the camera read as "no shadows" to a viewer, whatever the shadow map says.
    const shadowShare=await page.evaluate(()=>{const w=worldTest;let sun=null;w.scene.traverse(o=>{if(o.isDirectionalLight&&o.castShadow&&!sun)sun=o;});if(!sun)return null;
      w.setView(0);const render=()=>{if(typeof w.render==='function')w.render();else w.renderer.render(w.scene,w.camera);};
      const grab=()=>{render();const c=w.renderer.domElement,o=document.createElement('canvas');o.width=320;o.height=200;const g=o.getContext('2d');g.drawImage(c,0,0,320,200);return g.getImageData(0,0,320,200).data;};
      const a=grab();sun.castShadow=false;const b=grab();sun.castShadow=true;w.renderer.shadowMap.needsUpdate=true;render();
      let diff=0;for(let i=0;i<a.length;i+=4){if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>24)diff++;}return +(100*diff/(a.length/4)).toFixed(1);});
    result.heroShadowPct=shadowShare;
    // the changed fraction is the part of the hero frame in cast shadow: near zero means shadows fall out of view or casters are
    // missing; very high means the whole stage sits in one big shadow (the sun is behind the main facade) and reads flat
    if(shadowShare===null)result.problems.push('no shadow-casting directional light: outdoor scenes need a shadowed sun (setupOutdoorRendering) or interiors a shadowed lamp');
    else if(shadowShare<1.5)result.problems.push(`shadows cover ${shadowShare}% of the hero frame: they fall away from the camera or casters are missing; turn the sun azimuth so shadows fall toward the hero view, and check castShadow on large objects`);
    else if(shadowShare>45)result.problems.push(`${shadowShare}% of the hero frame is in cast shadow: the stage is back-lit (sun behind the main wall or roof), so everything reads flat; set azimuthDeg so the sun comes from the camera's side of the facade (shadows should fall toward the hero camera, not cover it)`);
    const sunInfo=await page.evaluate(()=>{let s=null;worldTest.scene.traverse(o=>{if(o.isDirectionalLight&&!s)s=o;});if(!s)return null;const t=s.target?.position??{x:0,y:0,z:0};const dx=s.position.x-t.x,dy=s.position.y-t.y,dz=s.position.z-t.z,L=Math.hypot(dx,dy,dz)||1;const d={x:dx/L,y:dy/L,z:dz/L};return {azimuthDeg:Math.round((Math.atan2(d.x,d.z)*180/Math.PI+360)%360),elevationDeg:Math.round(Math.asin(Math.max(-1,Math.min(1,d.y)))*180/Math.PI)};});
    result.sun=sunInfo;
    for(const i of views){await page.evaluate(i=>worldTest.setView(i),i);await page.waitForTimeout(100);const e=await render();const file=`view-${i}.png`;await page.screenshot({path:path.join(out,file)});result.frames.push({file:rel(path.join(out,file)),view:i,...e});exposure(`view ${i}`,e);}
    const actionIndex=await page.evaluate(()=>Math.max(0,worldTest.views.findIndex(v=>/action/i.test(v.name))));
    await page.evaluate(i=>worldTest.setView(i),actionIndex);
    for(const t of times){await page.evaluate(t=>worldTest.setTime(t),t);const e=await render();const file=`time-${t}.png`;await page.screenshot({path:path.join(out,file)});result.frames.push({file:rel(path.join(out,file)),time:t,...e});exposure(`time ${t} (action view)`,e);}
    const gl=await page.evaluate(glErrors);result.gl=gl;if(gl.codes.length||gl.contextLost)result.problems.push('WebGL errors: '+gl.codes.join(','));
  }
  result.ok=result.startupErrors.length===0;
}catch(e){result.error=e.message;}
finally{try{await browser?.close();}catch{}try{await server?.close();}catch{}}
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
const summary={ok:result.ok,error:result.error,startupErrors:result.startupErrors.slice(0,3),problems:result.problems,sun:result.sun,heroShadowPct:result.heroShadowPct,anchors:result.anchors,frames:result.frames.map(f=>f.file),result:rel(path.join(out,'result.json'))};
console.log(JSON.stringify(summary,null,1));
process.exit(result.ok?0:1);
