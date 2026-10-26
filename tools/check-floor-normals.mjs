// The floors' normals (src/floor-normals.js, build 0.15): a floor slab whose top shares vertices with its sides (normals
// leaning, as the downloaded flat's are) comes out lit as flat; triangles above the floor or facing sideways are left;
// a rug's fold keeps its slope. node --test tools/check-floor-normals.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Mat4, Quat, Vec3 } from 'playcanvas';
import { flattenFloorNormals } from '../src/floor-normals.js';

test('a slab: the top\'s leaning normals become straight up; the side faces are not walkable and only share them', () => {
  // Top quad at y 0.19 (two triangles, wound downwards in the file), a side quad down to 0.15 sharing the edge x = 2.
  const positions = [0, 0.19, 0, 2, 0.19, 0, 2, 0.19, 1, 0, 0.19, 1, 2, 0.15, 0, 2, 0.15, 1];
  const normals = [-0.5, 0.6, 0.6, 0.78, 0.63, 0, 0.7, 0.7, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0];
  const indices = [0, 2, 1, 0, 3, 2, 1, 2, 5, 1, 5, 4];
  const changed = flattenFloorNormals(positions, normals, indices);
  assert.equal(changed, 3, 'the three leaning top vertices');
  for (const i of [0, 1, 2, 3]) assert.deepEqual(normals.slice(i * 3, i * 3 + 3).map(x => +x.toFixed(6)), [0, 1, 0]);
  assert.deepEqual(normals.slice(12), [1, 0, 0, 1, 0, 0], 'the side\'s own vertices untouched');
});

test('a gentle fold (a rug) keeps its slope; a table top above the floor is left alone', () => {
  const positions = [0, 0.2, 0, 1, 0.25, 0, 1, 0.25, 1, 0, 0.2, 1, 0, 0.75, 0, 1, 0.75, 0, 1, 0.75, 1];
  const normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8, 0];
  flattenFloorNormals(positions, normals, [0, 1, 2, 0, 2, 3, 4, 5, 6]);
  const slope = Math.atan2(-normals[0], normals[1]) * 180 / Math.PI;
  assert.ok(Math.abs(slope - Math.atan2(0.05, 1) * 180 / Math.PI) < 0.01, `the fold's own slope (${slope.toFixed(2)} deg)`);
  assert.deepEqual(normals.slice(12), [0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8, 0], 'a table top at 0.75 m untouched');
});

test('scaled and rotated floor geometry keeps its geometric world normal through the renderer transform', () => {
  const positions = [0, 0, 0, 1, 0.15, 0, 0, 0.1, 1, 0, 2, 0], indices = [0, 1, 2];
  for (const scale of [new Vec3(1, 1, 1), new Vec3(2, 0.4, 1.2)]) {
    const world = new Mat4().setTRS(new Vec3(-3, 0.12, 1), new Quat().setFromEulerAngles(0, 25, 4), scale);
    const normals = [0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8, 0, -0.8, 0.6, 0], originalPositions = [...positions];
    const [a, b, c] = [0, 3, 6].map(k => world.transformPoint(new Vec3(...positions.slice(k, k + 3))));
    const expected = new Vec3().cross(b.sub(a), c.sub(a)).normalize();
    if (expected.y < 0) expected.mulScalar(-1);
    const changed = flattenFloorNormals(positions, normals, indices, { worldTransform: world });
    assert.equal(changed, 3);
    // The actual normal matrix used by the renderer, independently of the repair.
    const normalMatrix = world.clone().invert().transpose();
    for (const k of [0, 3, 6]) {
      const rendered = normalMatrix.transformVector(new Vec3(...normals.slice(k, k + 3))).normalize();
      assert.ok(rendered.dot(expected) > 1 - 1e-10, `normal must follow the sloped surface at scale ${scale}`);
    }
    assert.deepEqual(positions, originalPositions, 'mesh positions are not rewritten');
    const untouched = new Vec3(...normals.slice(9));
    assert.ok(untouched.distance(new Vec3(-0.8, 0.6, 0)) < 1e-6, 'vertices outside the corrected triangles keep their normals');
    assert.equal(flattenFloorNormals(positions, normals, indices, { worldTransform: world }), 0, 'repairing the corrected mesh again changes nothing');
  }
});

test('mesh-space floor triangles translated above the floor are not repaired', () => {
  const positions = [0, 0, 0, 1, 0, 0, 0, 0, 1], normals = [0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8, 0];
  const before = [...normals], world = new Mat4().setTRS(new Vec3(0, 0.75, 0), new Quat(), new Vec3(2, 0.4, 1.2));
  assert.equal(flattenFloorNormals(positions, normals, [0, 1, 2], { worldTransform: world }), 0);
  assert.deepEqual(normals, before);
});
