import * as THREE from 'three';

// Static fields. With periodic=true, sample(u,v) must be periodic for seamless repeat.
// periodic=false clamps the finite domain and uses one-sided boundary derivatives.
// albedo: encoded sRGB [0..1]; height: meters; roughness, metalness: [0..1].
// Row index grows with UV v; DataTexture flipY=false, unlike canvas row order.
export function bakePBRFields({width = 512, height = 512, spanMeters, sample, periodic = true}) {
  if (![width, height].every(n => Number.isInteger(n) && n >= 4) ||
      !Array.isArray(spanMeters) || spanMeters.length !== 2 ||
      !spanMeters.every(n => Number.isFinite(n) && n > 0) || typeof sample !== 'function') {
    throw new Error('Provide dimensions >=4, positive physical span and a sample function');
  }
  const count = width * height;
  const heights = new Float64Array(count);
  const color = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  const orm = new Uint8Array(count * 4);
  const byte = x => Math.round(255 * Math.min(1, Math.max(0, x)));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, k = i * 4;
    const {albedo, height: h = 0, roughness = 0.8, metalness = 0} = sample((x + 0.5) / width, (y + 0.5) / height);
    if (!Array.isArray(albedo) || albedo.length !== 3 ||
        ![...albedo, h, roughness, metalness].every(Number.isFinite)) {
      throw new Error('Invalid field sample at ' + x + ',' + y);
    }
    heights[i] = h;
    color.set([...albedo.map(byte), 255], k);
    orm.set([255, byte(roughness), byte(metalness), 255], k);
  }
  const at = (x, y) => heights[(periodic ? (y + height) % height : Math.max(0,Math.min(height-1,y))) * width +
    (periodic ? (x + width) % width : Math.max(0,Math.min(width-1,x)))];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) / ((periodic || (x>0 && x<width-1) ? 2 : 1) * spanMeters[0] / width);
    const dy = (at(x, y + 1) - at(x, y - 1)) / ((periodic || (y>0 && y<height-1) ? 2 : 1) * spanMeters[1] / height);
    const inv = 1 / Math.hypot(dx, dy, 1);
    normal.set([byte((-dx * inv + 1) / 2), byte((-dy * inv + 1) / 2),
      byte((inv + 1) / 2), 255], (y * width + x) * 4);
  }
  function texture(data, colorSpace) {
    const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = colorSpace;
    t.wrapS = t.wrapT = periodic ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  }
  const packed = texture(orm, THREE.NoColorSpace);
  return {
    map: texture(color, THREE.SRGBColorSpace),
    normalMap: texture(normal, THREE.NoColorSpace),
    roughnessMap: packed,
    metalnessMap: packed
  };
}
