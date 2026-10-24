// Wall-fixture and independent-light regression checks, including the committed apartment geometry.
// Run: node --test tools/check-switches.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { ROOMS, Switches, SWITCH_BACK_EMBED } from '../src/switches.js';
import { LAMPS } from '../src/lighting.js';
import { findMountSurface, isOriginalSwitchTriangle } from '../src/switch-surfaces.js';
import model from '../src/switch-model.json' with { type: 'json' };

test('bedroom/bath ceilings start off; mirror and extractor have independent dim controls', () => {
  const room = Object.fromEntries(ROOMS.map(r => [r.id, r]));
  assert.equal(ROOMS.length, 9);
  assert.equal(room.bedroom.on, false);
  assert.equal(room.bathroom.on, false);
  assert.equal(room.mirror.on, true);
  assert.equal(room.hood.on, true);
  assert.ok(!room.bathroom.lights.includes('bathroom mirror'));
  assert.ok(!room.kitchen.lights.includes('cooker hood'));
  assert.deepEqual(room.mirror.lights, ['bathroom mirror']);
  assert.deepEqual(room.hood.lights, ['cooker hood']);
  const lamps = Object.fromEntries(LAMPS.map(light => [light[0], light]));
  assert.ok(lamps['bathroom mirror'][4] >= 0.1 && lamps['bathroom mirror'][4] <= 0.14);
  assert.ok(lamps['cooker hood'][4] >= 0.4 && lamps['cooker hood'][4] <= 0.5);
  assert.ok(room.mirror.glowScale < 1 && room.hood.glowScale < 1);
});

test('authored switch retains detailed geometry and outward normals without scaled rocker parents', () => {
  for (const [part, mesh] of [['frame', model.frame], ['rocker', model.rocker]]) {
    assert.ok(mesh.indices.length / 3 >= 100, `${part} should retain the authored bevel detail`);
    assert.equal(mesh.normals.length, mesh.positions.length);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const ids = mesh.indices.slice(i, i + 3), positions = ids.map(index => mesh.positions.slice(index * 3, index * 3 + 3));
      const a = positions[1].map((v, k) => v - positions[0][k]), b = positions[2].map((v, k) => v - positions[0][k]);
      const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const expected = [0, 1, 2].map(k => ids.reduce((sum, index) => sum + mesh.normals[index * 3 + k], 0) / 3);
      assert.ok(normal.reduce((sum, v, k) => sum + v * expected[k], 0) >= 0, `${part} triangle winding must match its normals`);
    }
  }
  const minimumZ = Math.min(...model.frame.positions.filter((_, i) => i % 3 === 2));
  assert.equal(minimumZ, 0, 'the authored frame has an explicit rear mounting plane');
});

test('rendered-surface query resolves exact contact rather than a coarse collision cell', () => {
  const z = 1.234567;
  const triangles = [{ entity: 'wall', points: [[-1, 0, z], [1, 0, z], [1, 2, z]] },
    { entity: 'wall', points: [[-1, 0, z], [1, 2, z], [-1, 2, z]] }];
  const hit = findMountSurface(triangles, [0, 1, 0], [0, 0, 1]);
  assert.ok(Math.abs(hit.point[2] - z) < 1e-10);
  assert.deepEqual(hit.normal.map(v => Math.abs(v) < 1e-10 ? 0 : v), [0, 0, -1]);
  const root = hit.point.map((v, i) => v - hit.normal[i] * SWITCH_BACK_EMBED);
  const signedGap = root.reduce((sum, v, i) => sum + (v - hit.point[i]) * hit.normal[i], 0);
  assert.ok(signedGap < 0 && signedGap > -0.001, 'back plane must be slightly embedded, never floating');
});

test('old-plate removal cannot cut wall triangles or unrelated materials', () => {
  const plate = [[6.6, 1.2, 1.79], [6.7, 1.2, 1.79], [6.7, 1.25, 1.79]];
  assert.equal(isOriginalSwitchTriangle(plate, 'White1@bath'), true);
  assert.equal(isOriginalSwitchTriangle(plate, 'SprayedWallTexture@bath'), false);
  assert.equal(isOriginalSwitchTriangle([[6.4, 0, 1.79], ...plate.slice(1)], 'White1@bath'), false);
});

test('all eight wall controls find actual support surfaces in the committed apartment', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const document = await io.read(new URL('../public/assets/apartment/scene.gltf', import.meta.url).pathname);
  const triangles = [];
  let removed = 0;
  for (const node of document.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() || []) {
    const attribute = primitive.getAttribute('POSITION'), indices = primitive.getIndices(), m = node.getWorldMatrix();
    const vertices = Array.from({ length: attribute.getCount() }, (_, index) => {
      const p = attribute.getElement(index, []);
      return [0, 1, 2].map(k => m[k] * p[0] + m[k + 4] * p[1] + m[k + 8] * p[2] + m[k + 12]);
    });
    for (let index = 0; index < indices.getCount(); index += 3) {
      const points = [0, 1, 2].map(k => vertices[indices.getScalar(index + k)]);
      if (isOriginalSwitchTriangle(points, primitive.getMaterial().getName())) { removed++; continue; }
      // Fixtures sit in this narrow height band; retain crossing wall triangles too.
      if (Math.min(...points.map(p => p[1])) > 1.28 || Math.max(...points.map(p => p[1])) < 1.10) continue;
      triangles.push({ points, entity: node.getName() });
    }
  }
  assert.ok(removed >= 150 && removed <= 180, `bounded old fixture removal should stay small (${removed} triangles)`);
  const expected = { living: 4.336302, dining: 4.336302, kitchen: 4.336302, office: 2.405652, hall: 4.336629, bathroom: 1.795553, mirror: 1.795553, bedroom: 2.405802 };
  for (const room of ROOMS.filter(r => r.kind !== 'fixture')) {
    const hit = findMountSurface(triangles, [room.from[0], room.height ?? 1.15, room.from[1]], [room.dir[0], 0, room.dir[1]]);
    assert.ok(hit, `${room.id} has a rendered wall support`);
    assert.ok(Math.abs(hit.point[2] - expected[room.id]) < 0.0001, `${room.id} is mounted on the measured wall plane`);
    assert.ok(hit.normal[2] < -0.999, `${room.id} faces into the room`);
  }
});

test('rapid switch inputs keep one fade and settle to the final requested state', () => {
  const switches = Object.create(Switches.prototype);
  switches.fades = [];
  let captures = 0;
  switches.onChange = () => captures++;
  const light = { light: { intensity: 1, enabled: true } };
  const room = { on: true, level: 1, lights: [light], base: [1], glows: [], glowMat: null };
  switches.toggle(room); switches.update(0.02);
  switches.toggle(room); switches.update(0.01);
  switches.toggle(room);
  assert.equal(switches.fades.length, 1);
  switches.update(0.2);
  assert.equal(room.on, false); assert.equal(room.level, 0);
  assert.equal(light.light.enabled, false); assert.equal(captures, 1);
});
