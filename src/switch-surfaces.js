// Mesh-space mounting queries. Collision cells describe a player's body and are
// deliberately too coarse to place a thin wall fixture.
export const ORIGINAL_SWITCH_REGIONS = [
  { min: [6.55, 1.15, 1.765], max: [7.04, 1.30, 1.815] },
  { min: [11.43, 1.09, 2.375], max: [11.92, 1.24, 2.42] },
];
export function isOriginalSwitchTriangle(points, materialName) {
  if (!/^(White1|Black)(@(?:bath|bed))?$/.test(materialName)) return false;
  return ORIGINAL_SWITCH_REGIONS.some(box => points.every(p => p.every((v, i) => v >= box.min[i] && v <= box.max[i])));
}

export function intersectTriangle(origin, direction, a, b, c) {
  const e1 = b.map((v, i) => v - a[i]), e2 = c.map((v, i) => v - a[i]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const p = cross(direction, e2), determinant = dot(e1, p);
  if (Math.abs(determinant) < 1e-10) return null;
  const t = origin.map((v, i) => v - a[i]), u = dot(t, p) / determinant;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  const q = cross(t, e1), v = dot(direction, q) / determinant;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  const distance = dot(e2, q) / determinant;
  if (distance < 0) return null;
  let normal = cross(e1, e2), length = Math.hypot(...normal);
  if (length < 1e-10) return null;
  normal = normal.map(v => v / length);
  if (dot(normal, direction) > 0) normal = normal.map(v => -v);
  return { distance, point: origin.map((v, i) => v + direction[i] * distance), normal };
}

export function findMountSurface(triangles, origin, direction, maxDistance = 3) {
  let closest = null;
  for (const triangle of triangles) {
    const hit = intersectTriangle(origin, direction, ...triangle.points);
    if (!hit || hit.distance > maxDistance || Math.abs(hit.normal[1]) > 0.15) continue;
    // A near-parallel edge or bevel is not a support surface for the whole plate.
    if (hit.normal.reduce((sum, v, i) => sum + v * direction[i], 0) > -0.92) continue;
    if (!closest || hit.distance < closest.distance) closest = { ...hit, entity: triangle.entity };
  }
  return closest;
}
