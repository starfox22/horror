// Verify the actual committed torch geometry against the wardrobe shelf, without a GPU.
// Run: node --test tools/check-flashlight-placement.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { BoundingBox, Entity, Quat, Vec3 } from 'playcanvas';
import { flashlightBounds, placeFlashlightOnShelf, Flashlight } from '../src/flashlight.js';
import { FLASHLIGHT_SPOT } from '../src/closets.js';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(new URL('../public/assets/apartment/scene.gltf', import.meta.url).pathname);
const parts = doc.getRoot().listNodes().filter(node => node.getMesh()?.listPrimitives().some(p => p.getMaterial()?.getName().startsWith('Prop_flashlight.')));

function apartment() {
  const root = new Entity('apartment'), renders = [];
  for (const part of parts) {
    const entity = new Entity(part.getName());
    entity.setLocalPosition(...part.getTranslation()); entity.setLocalRotation(new Quat(...part.getRotation())); entity.setLocalScale(...part.getScale());
    root.addChild(entity);
    const meshInstances = part.getMesh().listPrimitives().map(primitive => {
      const positions = primitive.getAttribute('POSITION'), data = positions.getArray();
      const local = new BoundingBox(); local.setMinMax(new Vec3(...positions.getMin([])), new Vec3(...positions.getMax([])));
      return { material: { name: primitive.getMaterial().getName() }, node: entity,
        mesh: { getPositions(out) { out.push(...data); return data.length / 3; } },
        get aabb() { const bounds = new BoundingBox(); bounds.setFromTransformedAabb(local, entity.getWorldTransform()); return bounds; },
      };
    });
    renders.push({ entity, meshInstances });
  }
  return { root, findComponents: () => renders };
}
const near = (actual, expected, tolerance = 2e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('complete downloaded torch rests on the actual shelf without penetrating the carcass', () => {
  const scene = apartment();
  const placed = placeFlashlightOnShelf(scene, FLASHLIGHT_SPOT);
  assert.equal(placed.renders.length, 2, 'both body and glass must move out of the storage position');
  assert.equal(placed.root.children.length, 2);
  near(placed.bounds.getMin().y, FLASHLIGHT_SPOT.shelf + FLASHLIGHT_SPOT.clearance);
  assert.ok(placed.bounds.getMax().y < 2.252, 'torch must stay below the cabinet top');
  assert.ok(placed.bounds.getMin().x > FLASHLIGHT_SPOT.surface.x[0], 'torch must clear the back lining');
  assert.ok(placed.bounds.getMax().x < FLASHLIGHT_SPOT.surface.x[1], 'torch must clear the closed door');
  assert.ok(placed.bounds.getMin().z > FLASHLIGHT_SPOT.surface.z[0], 'torch must clear the side lining');
  assert.ok(placed.bounds.getMax().z < FLASHLIGHT_SPOT.surface.z[1], 'torch must clear the middle divider');
  assert.ok(placed.bounds.halfExtents.x > 0.14 && placed.bounds.halfExtents.y < 0.04, 'the long body must lie along the shelf, not vertically through it');
  const lens = placed.renders.find(r => r.meshInstances.some(mi => mi.material.name.endsWith('FlashlightGlass')));
  const lensBounds = flashlightBounds([lens]);
  const heading = FLASHLIGHT_SPOT.yaw * Math.PI / 180;
  const direction = new Vec3(Math.sin(heading), 0, Math.cos(heading));
  const lensOffset = lensBounds.center.clone().sub(placed.bounds.center);
  assert.ok(lensOffset.dot(direction) > 0.13 && lensOffset.x > 0, 'the lens must lead the configured heading toward the wardrobe opening');
  assert.ok(lensBounds.getMin().y > FLASHLIGHT_SPOT.shelf, 'the lens must not be left under the floor or intersect the shelf');
});

test('the wider head and narrower tail both sit naturally near the shelf surface', () => {
  const placed = placeFlashlightOnShelf(apartment(), FLASHLIGHT_SPOT);
  let head = Infinity, tail = Infinity;
  const point = new Vec3(), positions = [];
  for (const render of placed.renders) for (const mi of render.meshInstances) {
    positions.length = 0; mi.mesh.getPositions(positions);
    for (let n = 0; n < positions.length; n += 3) {
      mi.node.getWorldTransform().transformPoint(point.set(...positions.slice(n, n + 3)), point);
      if (point.x > 9.60) head = Math.min(head, point.y);
      if (point.x < 9.40) tail = Math.min(tail, point.y);
    }
  }
  assert.ok(head >= FLASHLIGHT_SPOT.shelf && tail >= FLASHLIGHT_SPOT.shelf);
  assert.ok(head - FLASHLIGHT_SPOT.shelf < 0.002, `head floats ${head - FLASHLIGHT_SPOT.shelf}m`);
  assert.ok(tail - FLASHLIGHT_SPOT.shelf < 0.002, `tail floats ${tail - FLASHLIGHT_SPOT.shelf}m`);
});

test('placement follows the configured surface instead of a hardcoded radius or shelf height', () => {
  const config = { x: 9.5, z: -0.93, shelf: 1.5, yaw: 0, pitch: 0, clearance: 0.001 };
  const placed = placeFlashlightOnShelf(apartment(), config);
  near(placed.bounds.getMin().y, 1.501);
  near(placed.bounds.center.x, config.x);
  near(placed.bounds.center.z, config.z);
  assert.ok(placed.bounds.halfExtents.z > 0.14);
  assert.ok(placed.bounds.halfExtents.y < 0.03);
});

test('picking up hides the complete model and removes the shelf target', () => {
  const placed = placeFlashlightOnShelf(apartment(), FLASHLIGHT_SPOT);
  const torch = Object.create(Flashlight.prototype);
  let removed = null;
  Object.assign(torch, { model: placed.root, item: {}, interactions: { remove(item) { removed = item; } },
    rot: new Quat(), camera: { getRotation: () => new Quat() }, beam: { light: {} }, bounce: { light: {} },
    on: false, power: 0 });
  torch.pickUp();
  assert.equal(torch.held, true);
  assert.equal(torch.model.enabled, false);
  assert.equal(removed, torch.item);
  assert.equal(torch.model.children.length, 2, 'both visible pieces share the hidden root');
  assert.equal(torch.on, true);
});
