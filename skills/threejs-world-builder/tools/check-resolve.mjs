// Module resolve hook for check.mjs: maps bare 'three' and 'three/addons/...' the way Vite does, to the node_modules
// reachable from the tool (the workspace links node_modules next to ./skills). `base` is passed in by check.mjs.
let base='';
export async function initialize(data){base=data.base;}
export async function resolve(spec,ctx,next){
  if(spec==='three')return {url:base,shortCircuit:true};
  const m=spec.match(/^three\/(addons|examples\/jsm)\/(.*)$/);
  if(m)return {url:new URL('../examples/jsm/'+m[2],base).href,shortCircuit:true};
  return next(spec,ctx);
}
