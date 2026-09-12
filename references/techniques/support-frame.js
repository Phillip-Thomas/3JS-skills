import { Matrix4, Vector3 } from 'three';

const finiteVector = v => v && [v.x, v.y, v.z].every(Number.isFinite);

/** Y-up assembly, X heading; point is the desired origin's projection onto the plane.
 * Contacts are assembly-local extrema, including all possible lowest points.
 * Returns a WORLD matrix; does not decide stability or finite-surface containment.
 */
export function supportMatrix({ point, normal, heading, contacts, scale = new Vector3(1, 1, 1) }) {
  if (![point, normal, heading, scale].every(finiteVector) ||
      scale.x <= 0 || scale.y <= 0 || scale.z <= 0 || !contacts?.length ||
      !contacts.every(finiteVector) || normal.lengthSq() < 1e-20) {
    throw new RangeError('Finite vectors, positive scale and nonempty contact samples are required');
  }
  const y = normal.clone().normalize();
  const x = heading.clone().addScaledVector(y, -heading.dot(y));
  if (x.lengthSq() < 1e-20) throw new RangeError('Heading must have a component tangent to the support');
  x.normalize();
  const z = x.clone().cross(y).normalize();
  const matrix = new Matrix4().makeBasis(x, y, z).scale(scale);
  const lowest = Math.min(...contacts.map(p => p.clone().applyMatrix4(matrix).dot(y)));
  matrix.setPosition(point.clone().addScaledVector(y, -lowest));
  return matrix;
}

/** Preserve an exact world affine transform even under rotated/nonuniform parents.
 * Owns object.matrix: TRS editing is disabled. Keep animation on child pivots, or
 * recompute this matrix when the parent/support changes. Avoid TRS decomposition.
 */
export function setWorldMatrix(object, worldMatrix) {
  let local = worldMatrix.clone();
  if (object.parent) {
    object.parent.updateWorldMatrix(true, false);
    if (Math.abs(object.parent.matrixWorld.determinant()) < 1e-20) throw new RangeError('Singular parent transform');
    local.premultiply(object.parent.matrixWorld.clone().invert());
  }
  object.matrixAutoUpdate = false;
  object.matrix.copy(local);
  object.matrixWorldNeedsUpdate = true;
  object.updateWorldMatrix(true, true);
  return object;
}

/** Signed world distances: negative penetrates, positive separates. Plane normalized. */
export function contactDistances(object, contacts, plane) {
  object.updateWorldMatrix(true, false);
  const normalized = plane.clone().normalize();
  return contacts.map(p => normalized.distanceToPoint(p.clone().applyMatrix4(object.matrixWorld)));
}
