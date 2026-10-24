// First-surface regression for flashlight bounce; no graphics device required.
// Run: node --test tools/check-flashlight-shadows.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { BoundingBox, Color, Entity, Mat4, Quat, Vec3, SHADOWUPDATE_NONE, SHADOWUPDATE_THISFRAME, SHADOWUPDATE_REALTIME } from 'playcanvas';
import { FlashlightSurfaces } from '../src/flashlight-surfaces.js';
import { Flashlight } from '../src/flashlight.js';
import { refreshShadows, rerenderShadows } from '../src/lighting.js';

const near = (actual, expected, tolerance = 2e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

function meshData(positions, indices) {
  let reads = 0;
  return {
    get reads() { return reads; },
    getPositions(out) { reads++; for (const value of positions) out.push(value); return positions.length / 3; },
    getIndices(out) { if (!indices) return 0; for (const value of indices) out.push(value); return indices.length; },
  };
}

function instance(mesh, node, material = { opacity: 1 }) {
  const positions = []; mesh.getPositions(positions);
  const min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < positions.length; i += 3) { const p = new Vec3(...positions.slice(i, i + 3)); min.min(p); max.max(p); }
  const local = new BoundingBox(); local.setMinMax(min, max);
  return { mesh, node, material, visible: true, castShadow: true,
    get aabb() { const box = new BoundingBox(); box.setFromTransformedAabb(local, node.getWorldTransform()); return box; },
  };
}

function scene() {
  const root = new Entity('test application root'), renders = [];
  // An Application normally enables its root; these tests have no application/GPU.
  root._enabledInHierarchy = true;
  root.findComponents = () => renders;
  function add(name, positions, indices) {
    const entity = new Entity(name); root.addChild(entity);
    const mesh = meshData(positions, indices), mi = instance(mesh, entity);
    const render = { entity, enabled: true, meshInstances: [mi] }; renders.push(render);
    return { entity, mesh, mi, render };
  }
  return { root, add };
}

const square = [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0];
const squareIndices = [0, 1, 2, 0, 2, 3];

test('the nearest transformed prop occludes a farther wall with metre-correct distance and normals', () => {
  const s = scene();
  const wall = s.add('wall', square, squareIndices); wall.entity.setPosition(0, 0, 10);
  const prop = s.add('angled door', [-1, -1, -.4, 1, -1, .4, 1, 1, .4, -1, 1, -.4], squareIndices);
  prop.entity.setPosition(0, 0, 4); prop.entity.setEulerAngles(15, 25, 0); prop.entity.setLocalScale(2, .5, 3);
  const surfaces = new FlashlightSurfaces(s.root), ray = new Vec3(0, 0, 4);
  const hit = surfaces.trace(Vec3.ZERO, ray);
  assert.equal(hit.meshInstance, prop.mi); near(hit.dist, 4); near(hit.pos.z, 4);
  const transform = prop.entity.getWorldTransform();
  const a = transform.transformPoint(new Vec3(-1, -1, -.4)), b = transform.transformPoint(new Vec3(1, -1, .4)), c = transform.transformPoint(new Vec3(1, 1, .4));
  const expected = new Vec3().cross(b.sub(a), c.sub(a)).normalize().mulScalar(-1);
  near(hit.normal.dot(expected), 1); assert.ok(hit.normal.dot(ray) < 0);
  assert.equal(surfaces.trace(Vec3.ZERO, ray, 3), null);

  const reads = prop.mesh.reads;
  prop.entity.setPosition(0, 0, 6);
  near(surfaces.trace(Vec3.ZERO, ray).dist, 6);
  assert.equal(prop.mesh.reads, reads, 'moving the instance must use current transforms without rebuilding its triangle tree');
});

test('hidden, disabled, non-shadowing and fully transparent surfaces cannot create phantom bounce', () => {
  const s = scene(), prop = s.add('prop', square, squareIndices), wall = s.add('wall', square, squareIndices);
  prop.entity.setPosition(0, 0, 3); wall.entity.setPosition(0, 0, 8);
  const surfaces = new FlashlightSurfaces(s.root), trace = () => surfaces.trace(Vec3.ZERO, new Vec3(0, 0, 1));
  assert.equal(trace().meshInstance, prop.mi);
  for (const [target, field, value, original] of [[prop.mi, 'visible', false, true], [prop.mi, 'castShadow', false, true],
    [prop.mi.material, 'opacity', 0, 1], [prop.render, 'enabled', false, true], [prop.entity, 'enabled', false, true]]) {
    target[field] = value; assert.equal(trace().meshInstance, wall.mi, `${field} should exclude the prop`); target[field] = original;
  }
  assert.equal(surfaces.trace(Vec3.ZERO, Vec3.ZERO), null);
});

test('a ray originating inside geometry finds its exit and ignores sub-2cm self intersections', () => {
  const s = scene();
  const close = s.add('lens surface', square, squareIndices); close.entity.setPosition(0, 0, .01);
  // Non-indexed reversed faces are valid occluders too.
  const exit = s.add('inside object exit', [-2, -2, 0, 2, 2, 0, 2, -2, 0]); exit.entity.setPosition(0, 0, 1);
  const entrance = s.add('inside object entrance', square, squareIndices); entrance.entity.setPosition(0, 0, -1);
  const hit = new FlashlightSurfaces(s.root).trace(Vec3.ZERO, new Vec3(0, 0, 1));
  assert.equal(hit.meshInstance, exit.mi); near(hit.dist, 1); near(hit.normal.z, -1);
});

test('the moving beam returns only weak outward light, throttles queries and respects suspension', () => {
  const torch = Object.create(Flashlight.prototype);
  const camera = new Entity('camera'), beam = new Entity('beam'), bounce = new Entity('return');
  camera.setPosition(0, 1.7, 0); beam.light = {}; bounce.light = {};
  const hit = { pos: new Vec3(0, 1, -2), normal: new Vec3(0, 0, 1), dist: 2,
    meshInstance: { material: { diffuse: new Color(.8, .7, .6) } } };
  let queries = 0, nextHit = hit;
  Object.assign(torch, { held: true, on: true, power: 1, flicker: 0, time: 0,
    camera, beam, bounce, rot: new Quat(), surfaceTimer: 0,
    surfaces: { trace() { queries++; return nextHit; } } });
  torch.update(1 / 60);
  near(bounce.getPosition().distance(hit.pos), .035);
  near(bounce.up.clone().mulScalar(-1).dot(hit.normal), 1);
  assert.ok(bounce.light.enabled && bounce.light.intensity > 0 && bounce.light.intensity <= .12);
  for (let frame = 1; frame < 60; frame++) torch.update(1 / 60);
  assert.ok(queries >= 8 && queries <= 11, `trace should run near 10 Hz, not every frame (${queries})`);
  torch.suspend(true); torch.update(1 / 60);
  assert.equal(beam.light.enabled, false); assert.equal(bounce.light.enabled, false);
  torch.suspend(false); nextHit = null; torch.surfaceTimer = 0; torch.update(1 / 60);
  assert.equal(beam.light.enabled, true);
  assert.equal(bounce.light.enabled, false, 'no surface means no invented reflected source');
  assert.equal(bounce.light.intensity, 0);
  torch.on = false; torch.update(1 / 60);
  assert.equal(beam.light.enabled, false); assert.equal(bounce.light.enabled, false);
});

test('probe and moving-object refreshes preserve both flashlight realtime shadow maps', () => {
  const make = (name, mode, position = new Vec3(), type = 'spot') => ({
    type, enabled: true, castShadows: true, range: 4, shadowUpdateMode: mode,
    entity: { name, getPosition: () => position },
  });
  const beam = make('flashlight beam', SHADOWUPDATE_REALTIME);
  const bounce = make('flashlight bounce', SHADOWUPDATE_REALTIME);
  const moving = make('another moving light', SHADOWUPDATE_REALTIME);
  const near = make('near static fixture', SHADOWUPDATE_NONE);
  const far = make('far static fixture', SHADOWUPDATE_NONE, new Vec3(20, 0, 0));
  const lights = [beam, bounce, moving, near, far];
  const app = { root: { findComponents: () => lights } };
  refreshShadows(app, Vec3.ZERO, 2);
  assert.equal(near.shadowUpdateMode, SHADOWUPDATE_THISFRAME);
  assert.equal(far.shadowUpdateMode, SHADOWUPDATE_NONE);
  rerenderShadows(app);
  assert.equal(far.shadowUpdateMode, SHADOWUPDATE_THISFRAME);
  for (const light of [beam, bounce, moving]) assert.equal(light.shadowUpdateMode, SHADOWUPDATE_REALTIME,
    `${light.entity.name} must keep updating after captures and nearby doors move`);
});

test('the committed hallway pot stops the ray before the floor or wall', async t => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const document = await io.read(new URL('../public/assets/apartment/scene.gltf', import.meta.url).pathname);
  const renders = [];
  for (const node of document.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const matrix = new Mat4(); matrix.data.set(node.getWorldMatrix());
    const graph = { getWorldTransform: () => matrix };
    const meshInstances = node.getMesh().listPrimitives().map(primitive => {
      const source = primitive.getMaterial(), positions = primitive.getAttribute('POSITION');
      const mesh = meshData(positions.getArray(), primitive.getIndices()?.getArray());
      const mi = instance(mesh, graph, { name: source.getName(), opacity: source.getBaseColorFactor()[3] });
      // Mirror the game's transparent-glass exclusions. All plant parts remain opaque.
      mi.castShadow = source.getAlphaMode() !== 'BLEND' && !/^Glass|WindowGlass/.test(source.getName());
      return mi;
    });
    renders.push({ entity: { enabled: true }, enabled: true, meshInstances });
  }
  const surfaces = new FlashlightSurfaces({ findComponents: () => renders });
  const origin = new Vec3(9, 1.35, 3.8), direction = new Vec3(7.93, .38, 3.03).sub(origin).normalize();
  const start = performance.now(), hit = surfaces.trace(origin, direction), cold = performance.now() - start;
  assert.ok(hit); assert.equal(hit.meshInstance.material.name, 'White1@hall');
  near(hit.dist, 1.4487655); near(hit.pos.x, 8.0528477); near(hit.pos.y, .4913666); near(hit.pos.z, 3.1184044);
  assert.ok(hit.normal.dot(direction) < -.8, 'surface normal faces the light so reflected light stays in front of the pot');
  const iterations = 200, warmStart = performance.now();
  for (let i = 0; i < iterations; i++) surfaces.trace(origin, direction);
  const warm = (performance.now() - warmStart) / iterations;
  t.diagnostic(`Full-scene first trace including lazy BVHs: ${cold.toFixed(1)}ms; cached trace mean: ${warm.toFixed(3)}ms (${iterations} traces)`);
});
