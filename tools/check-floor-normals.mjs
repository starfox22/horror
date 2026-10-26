// The floors' normals (src/floor-normals.js, build 0.15): a floor slab whose top shares vertices with its sides (normals
// leaning, as the downloaded flat's are) comes out lit as flat; triangles above the floor or facing sideways are left;
// a rug's fold keeps its slope. node --test tools/check-floor-normals.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
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
