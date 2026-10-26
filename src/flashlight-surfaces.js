// The beam's reflected light must stop at the first rendered object, not the
// coarse player-walk grid. Cache local-space triangle trees, then query each
// instance's CURRENT transform so doors, cupboards and other moving props work.
import { Mat4, Vec3, PRIMITIVE_TRIANGLES } from 'playcanvas';

const MIN_DISTANCE = 0.02;
const LEAF_TRIANGLES = 8;

function boxEntry(min, max, origin, direction, limit) {
  let near = MIN_DISTANCE, far = limit;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis], d = direction[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < min[axis] || o > max[axis]) return Infinity;
    } else {
      let a = (min[axis] - o) / d, b = (max[axis] - o) / d;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return Infinity;
    }
  }
  return near;
}

function triangleTree(mesh) {
  const raw = [], rawIndices = [];
  const vertexCount = mesh.getPositions?.(raw) ?? 0;
  if (!vertexCount) return null;
  const primitive = mesh.primitive?.[0];
  if (primitive?.type !== undefined && primitive.type !== PRIMITIVE_TRIANGLES) return null;
  const indexed = primitive?.indexed !== false && (mesh.getIndices?.(rawIndices) ?? 0) > 0;
  const base = primitive?.base ?? 0, available = indexed ? rawIndices.length : vertexCount;
  const count = Math.floor(Math.min(primitive?.count ?? available, available - base) / 3) * 3;
  if (count < 3) return null;
  const positions = new Float32Array(raw), indices = new Uint32Array(count);
  const baseVertex = primitive?.baseVertex ?? 0;
  for (let i = 0; i < count; i++) indices[i] = (indexed ? rawIndices[base + i] : base + i) + baseVertex;
  const triangleCount = count / 3, order = Uint32Array.from({ length: triangleCount }, (_, i) => i);
  const centres = new Float32Array(count), nodes = [];
  for (let triangle = 0; triangle < triangleCount; triangle++) for (let axis = 0; axis < 3; axis++) {
    centres[triangle * 3 + axis] = (positions[indices[triangle * 3] * 3 + axis]
      + positions[indices[triangle * 3 + 1] * 3 + axis] + positions[indices[triangle * 3 + 2] * 3 + axis]) / 3;
  }
  // In-place median selection avoids allocating or sorting triangle arrays at
  // every tree level, especially for the apartment's joined wall meshes.
  function median(start, end, target, axis) {
    let lo = start, hi = end - 1;
    while (lo < hi) {
      const pivot = centres[order[(lo + hi) >>> 1] * 3 + axis];
      let i = lo, j = hi;
      while (i <= j) {
        while (centres[order[i] * 3 + axis] < pivot) i++;
        while (centres[order[j] * 3 + axis] > pivot) j--;
        if (i <= j) { const value = order[i]; order[i++] = order[j]; order[j--] = value; }
      }
      if (target <= j) hi = j;
      else if (target >= i) lo = i;
      else break;
    }
  }
  function build(start, end) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const cmin = [...min], cmax = [...max];
    for (let i = start; i < end; i++) {
      const triangle = order[i];
      for (let axis = 0; axis < 3; axis++) {
        const c = centres[triangle * 3 + axis]; cmin[axis] = Math.min(cmin[axis], c); cmax[axis] = Math.max(cmax[axis], c);
        for (let vertex = 0; vertex < 3; vertex++) {
          const value = positions[indices[triangle * 3 + vertex] * 3 + axis];
          min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
        }
      }
    }
    const index = nodes.length, node = { min, max, start, end, left: -1, right: -1 }; nodes.push(node);
    if (end - start > LEAF_TRIANGLES) {
      let axis = 0;
      for (let k = 1; k < 3; k++) if (cmax[k] - cmin[k] > cmax[axis] - cmin[axis]) axis = k;
      const middle = (start + end) >>> 1;
      median(start, end, middle, axis);
      node.left = build(start, middle); node.right = build(middle, end);
    }
    return index;
  }
  build(0, triangleCount);
  return { positions, indices, order, nodes };
}

function traceTree(tree, origin, direction, limit) {
  const { positions: p, indices, order, nodes } = tree;
  const stack = [0];
  let nearest = null, best = limit;
  while (stack.length) {
    const node = nodes[stack.pop()];
    if (boxEntry(node.min, node.max, origin, direction, best) === Infinity) continue;
    if (node.left !== -1) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const triangle = order[i] * 3, a = indices[triangle] * 3, b = indices[triangle + 1] * 3, c = indices[triangle + 2] * 3;
      const x = p[b] - p[a], y = p[b + 1] - p[a + 1], z = p[b + 2] - p[a + 2];
      const u = p[c] - p[a], v = p[c + 1] - p[a + 1], w = p[c + 2] - p[a + 2];
      const hx = direction[1] * w - direction[2] * v, hy = direction[2] * u - direction[0] * w, hz = direction[0] * v - direction[1] * u;
      const determinant = x * hx + y * hy + z * hz;
      if (Math.abs(determinant) < 1e-12) continue;
      const tx = origin[0] - p[a], ty = origin[1] - p[a + 1], tz = origin[2] - p[a + 2];
      const beta = (tx * hx + ty * hy + tz * hz) / determinant;
      if (beta < -1e-7 || beta > 1 + 1e-7) continue;
      const qx = ty * z - tz * y, qy = tz * x - tx * z, qz = tx * y - ty * x;
      const gamma = (direction[0] * qx + direction[1] * qy + direction[2] * qz) / determinant;
      if (gamma < -1e-7 || beta + gamma > 1 + 1e-7) continue;
      const distance = (u * qx + v * qy + w * qz) / determinant;
      if (distance <= MIN_DISTANCE || distance >= best) continue;
      best = distance; nearest = { dist: distance, normal: [y * w - z * v, z * u - x * w, x * v - y * u] };
    }
  }
  return nearest;
}

export class FlashlightSurfaces {
  // The optional engine Camera matches MeshInstance.isVisibleFunc's renderer API.
  // Geometry-only tools can omit it and query all enabled instances as before.
  constructor(root, camera = null) {
    this.root = root;
    this.camera = camera;
    this.trees = new WeakMap();
    this.inverse = new Mat4();
    this.localOrigin = new Vec3(); this.localDirection = new Vec3();
    this.worldDirection = new Vec3();
  }

  trace(origin, direction, maxDistance = 18) {
    if (direction.lengthSq() < 1e-12 || maxDistance <= MIN_DISTANCE) return null;
    const ray = this.worldDirection.copy(direction).normalize();
    const worldOrigin = [origin.x, origin.y, origin.z], worldDirection = [ray.x, ray.y, ray.z];
    let result = null, nearest = maxDistance;
    for (const render of this.root.findComponents('render')) {
      if (render.enabled === false || render.entity?.enabled === false) continue;
      for (const mi of render.meshInstances) {
        if (mi.visible === false || mi.castShadow === false || mi.material?.opacity <= 0 || !mi.mesh?.getPositions) continue;
        // LIVE keeps the actor enabled for the security camera alone. His hidden
        // body must not intercept the player's beam and create a phantom return.
        if (this.camera && mi.isVisibleFunc && !mi.isVisibleFunc(this.camera)) continue;
        const box = mi.aabb;
        if (box && boxEntry([box.center.x - box.halfExtents.x, box.center.y - box.halfExtents.y, box.center.z - box.halfExtents.z],
          [box.center.x + box.halfExtents.x, box.center.y + box.halfExtents.y, box.center.z + box.halfExtents.z], worldOrigin, worldDirection, nearest) === Infinity) continue;
        let tree;
        if (this.trees.has(mi.mesh)) tree = this.trees.get(mi.mesh);
        else { tree = triangleTree(mi.mesh); this.trees.set(mi.mesh, tree); }
        if (!tree) continue;
        const transform = (mi.node || render.entity).getWorldTransform();
        this.inverse.copy(transform).invert();
        this.inverse.transformPoint(origin, this.localOrigin);
        // Do NOT normalize this local vector: its t remains metres in world
        // space, including for non-uniformly scaled furniture instances.
        this.inverse.transformVector(ray, this.localDirection);
        const o = this.localOrigin, d = this.localDirection;
        const hit = traceTree(tree, [o.x, o.y, o.z], [d.x, d.y, d.z], nearest);
        if (!hit) continue;
        const n = hit.normal, inverse = this.inverse.data;
        // Normal = inverse-transpose(world) * local face normal.
        const normal = new Vec3(inverse[0] * n[0] + inverse[1] * n[1] + inverse[2] * n[2],
          inverse[4] * n[0] + inverse[5] * n[1] + inverse[6] * n[2], inverse[8] * n[0] + inverse[9] * n[1] + inverse[10] * n[2]).normalize();
        if (normal.dot(ray) > 0) normal.mulScalar(-1);
        nearest = hit.dist;
        result = { pos: new Vec3(origin.x + ray.x * nearest, origin.y + ray.y * nearest, origin.z + ray.z * nearest), normal, dist: nearest, meshInstance: mi };
      }
    }
    return result;
  }
}
