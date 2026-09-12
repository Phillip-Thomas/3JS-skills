import * as THREE from 'three';

// WebGL / Three r185. Static, split, flat box or plane faces; ordinary meshes.
// Supplies metric UVs to ALL native PBR channels, retaining their native TBN/BRDF.
// Uniform values are per material; scale and phase come from the actual modelMatrix.
const projection = `
vec3 surfaceX = modelMatrix[0].xyz;
vec3 surfaceY = modelMatrix[1].xyz;
vec3 surfaceZ = modelMatrix[2].xyz;
vec3 surfaceOrigin = modelMatrix[3].xyz;
vec3 surfaceP = vec3(
  position.x * length(surfaceX) + dot(surfaceOrigin, normalize(surfaceX)),
  position.y * length(surfaceY) + dot(surfaceOrigin, normalize(surfaceY)),
  position.z * length(surfaceZ) + dot(surfaceOrigin, normalize(surfaceZ))
) * surfaceMetersPerUnit;
vec3 surfaceN = abs(normal);
vec2 surfaceUv;
if (surfaceN.x > 0.999) surfaceUv = vec2(-sign(normal.x)*surfaceP.z, surfaceP.y);
else if (surfaceN.y > 0.999) surfaceUv = vec2(surfaceP.x, -sign(normal.y)*surfaceP.z);
else surfaceUv = vec2(sign(normal.z)*surfaceP.x, surfaceP.y);
surfaceUv /= surfaceTileMeters;
#ifdef USE_MAP
vMapUv = surfaceUv;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = surfaceUv;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv = surfaceUv;
#endif
#ifdef USE_METALNESSMAP
vMetalnessMapUv = surfaceUv;
#endif
`;
const checked = new WeakMap();
export function inspectMetricSurface(mesh) {
  const g=mesh.geometry, m=mesh.material, cfg=m?.userData.metricSurface;
  if (!cfg || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.isBatchedMesh || mesh.morphTargetInfluences?.length)
    throw Error('Metric surface supports ordinary static meshes only; use a suitable UV unwrap for this object');
  const n=g.getAttribute('normal');
  if(!n || g.getAttribute('tangent')) throw Error('Metric surface needs split flat normals and no precomputed tangents');
  if(checked.get(g)?.normal!==n || checked.get(g)?.version!==n.version) {
    for(let i=0;i<n.count;i++) {
      const a=[n.getX(i),n.getY(i),n.getZ(i)].map(Math.abs);
      if(a.filter(x=>Math.abs(x-1)<1e-5).length!==1 || a.filter(x=>x<1e-5).length!==2)
        throw Error('Metric surface requires axis-aligned flat faces in geometry space; unwrap curved/beveled geometry separately');
    }
    checked.set(g,{normal:n,version:n.version});
  }
  mesh.updateWorldMatrix(true,false);
  const e=mesh.matrixWorld.elements;
  if(!e.every(Number.isFinite) || mesh.matrixWorld.determinant()<=0) throw Error('Invalid or mirrored metric surface transform');
  const axes=[0,4,8].map(i=>new THREE.Vector3(e[i],e[i+1],e[i+2]));
  if(axes.some(v=>v.length()<1e-8)) throw Error('Degenerate metric surface scale');
  axes.forEach(v=>v.normalize());
  if(Math.max(Math.abs(axes[0].dot(axes[1])),Math.abs(axes[0].dot(axes[2])),Math.abs(axes[1].dot(axes[2])))>1e-5)
    throw Error('Sheared transform needs a suitable surface unwrap');
  return {supported:true,tileMeters:[...cfg.tileMeters],metersPerUnit:cfg.metersPerUnit,
    scope:'Projection support only; visual detail, corner bonds and coverage still need inspection'};
}

class MetricSurfaceMaterial extends THREE.MeshStandardMaterial {
  customProgramCacheKey(){return 'metric-flat-surface-r185-v1';}
  onBeforeCompile(shader){
    const cfg=this.userData.metricSurface;
    shader.uniforms.surfaceTileMeters={value:new THREE.Vector2(...cfg.tileMeters)};
    shader.uniforms.surfaceMetersPerUnit={value:cfg.metersPerUnit};
    if(!shader.vertexShader.includes('#include <uv_vertex>')) throw Error('Unsupported Three shader layout');
    shader.vertexShader='uniform vec2 surfaceTileMeters;\nuniform float surfaceMetersPerUnit;\n'+
      shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n'+projection);
  }
  onBeforeRender(renderer,scene,camera,geometry,object){inspectMetricSurface(object);}
}

// Pass generated independent maps, e.g. createSurface() or createMasonry().
// clone() preserves the subclass hook; textures stay shared. Do not edit texture transforms.
export function metricSurface(source,{tileMeters=source.userData.surface?.tileMeters,metersPerUnit=1}={}) {
  if(!tileMeters || tileMeters.length!==2 || !tileMeters.every(x=>Number.isFinite(x)&&x>0) ||
    !Number.isFinite(metersPerUnit) || metersPerUnit<=0) throw Error('Supply physical tile dimensions and meters per scene unit');
  if(!source.isMeshStandardMaterial || source.isMeshPhysicalMaterial || source.bumpMap || source.displacementMap)
    throw Error('Use a Standard material with color, tangent normal and finish maps');
  const material=new MetricSurfaceMaterial().copy(source);
  material.userData.metricSurface={tileMeters:[...tileMeters],metersPerUnit};
  material.name=source.name+'-automatic-metric';
  return material;
}
