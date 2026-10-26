// The flat's floors as the torch sees them (build 0.15, the owner: "when i illuminate with the flashlight on a dark
// hallway, the shadows on the floor make no sense"). The downloaded apartment's floors are low-poly slabs whose top and
// sides share vertices, so the normals across a floor lean (the hall's up to 37 degrees, the open-plan marble's and the
// bathroom's almost flat on their side): under the ceiling lights it hardly shows, but a torch held low lights a floor at
// a grazing angle and the leaning normals made wedges of dark and light with straight edges across it. At load, each
// vertex of the walkable, upward-facing triangles near the floor gets the normal of those triangles (area-weighted), so
// a flat floor is lit as flat and a rug keeps its own folds; the slabs' sides, never seen, take the same.

// positions: world-space [x, y, z, ...]; normals: world-space, same layout (changed in place); indices: triangles.
// Triangles whose face normal points up (y > minUp) with every corner below maxY count. Returns how many vertices
// changed by more than `tolerance` degrees.
export function flattenFloorNormals(positions, normals, indices, { maxY = 0.35, minUp = 0.9, tolerance = 2 } = {}) {
  const sum = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    if (Math.max(positions[a + 1], positions[b + 1], positions[c + 1]) > maxY) continue;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const l = Math.hypot(fx, fy, fz);
    if (!l) continue;
    // Wound either way in the file: the floor's side is the one facing up.
    if (fy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    if (fy / l < minUp) continue;
    for (const i of [indices[t], indices[t + 1], indices[t + 2]]) {
      const s = sum.get(i) || [0, 0, 0];
      s[0] += fx; s[1] += fy; s[2] += fz;          // the cross product's length is twice the area: area-weighted
      sum.set(i, s);
    }
  }
  let changed = 0;
  const cos = Math.cos(tolerance * Math.PI / 180);
  for (const [i, s] of sum) {
    const l = Math.hypot(...s), n = [s[0] / l, s[1] / l, s[2] / l], k = i * 3;
    const old = Math.hypot(normals[k], normals[k + 1], normals[k + 2]) || 1;
    if ((normals[k] * n[0] + normals[k + 1] * n[1] + normals[k + 2] * n[2]) / old < cos) changed++;
    normals[k] = n[0]; normals[k + 1] = n[1]; normals[k + 2] = n[2];
  }
  return changed;
}
