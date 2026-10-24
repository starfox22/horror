// Check the physical emitter against the committed shade, not an idealized dome.
// Run: node --test tools/check-lamp-lighting.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { ARC_LAMP, arcLampProfile } from '../src/lamp-profiles.js';
import { LAMPS } from '../src/lighting.js';
import { intersectTriangle } from '../src/switch-surfaces.js';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const document = await io.read(new URL('../public/assets/apartment/scene.gltf', import.meta.url).pathname);
const shade = [], hoodDiffuser = [];
// The joined Black@main primitive contains other furniture too. This measured
// region isolates the original arc shade and its short supporting stem.
const inShade = p => p[0] > -5.04 && p[0] < -4.72 && p[1] > 1.25 && p[1] < 1.55 && p[2] > 2.54 && p[2] < 2.86;
for (const node of document.getRoot().listNodes()) {
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const material = primitive.getMaterial()?.getName();
    if (material !== 'Black@main' && material !== 'Light.kitchen') continue;
    const positions = primitive.getAttribute('POSITION'), indices = primitive.getIndices(), m = node.getWorldMatrix();
    const vertices = Array.from({ length: positions.getCount() }, (_, index) => {
      const p = positions.getElement(index, []);
      return [0, 1, 2].map(k => m[k] * p[0] + m[k + 4] * p[1] + m[k + 8] * p[2] + m[k + 12]);
    });
    for (let index = 0; index < (indices?.getCount() ?? positions.getCount()); index += 3) {
      const triangle = [0, 1, 2].map(k => vertices[indices ? indices.getScalar(index + k) : index + k]);
      if (material === 'Black@main' && triangle.some(inShade)) shade.push(triangle);
      if (material === 'Light.kitchen' && node.getName() === 'Hood_Light_0') hoodDiffuser.push(triangle);
    }
  }
}

function nearestHit(triangles, origin, direction) {
  let nearest = null;
  for (const triangle of triangles) {
    const hit = intersectTriangle(origin, direction, ...triangle);
    if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
  }
  return nearest;
}

function direction(degrees, azimuth, up = false) {
  const angle = degrees * Math.PI / 180, rotation = azimuth * Math.PI / 180;
  return [Math.sin(angle) * Math.cos(rotation), (up ? 1 : -1) * Math.cos(angle), Math.sin(angle) * Math.sin(rotation)];
}

test('the original source is above the opaque shade and reproduces the central blocker', () => {
  assert.ok(shade.length > 1000, 'the test must use the detailed committed shade');
  const blocker = nearestHit(shade, [-4.88, 1.52, 2.70], [0, -1, 0]);
  assert.ok(blocker && blocker.point[1] > 1.48 && blocker.point[1] < 1.49,
    'the old light must hit the closed top, rather than illuminate through it');
  assert.ok(blocker.distance < 0.05);
});

test('the actual arc emitter clears the open aperture throughout its entire cone', () => {
  const lamp = LAMPS.find(([name]) => name === 'arc lamp');
  assert.ok(lamp, 'the visible fixture must have a real scene light');
  assert.deepEqual(lamp[2], ARC_LAMP.position);
  assert.equal(lamp[1], 'spot');
  assert.equal(lamp[6], true, 'the corrected lamp must retain opaque shade shadows');
  assert.equal(lamp[7].profile, arcLampProfile);
  assert.equal(lamp[7].outer, ARC_LAMP.outer);
  assert.ok(ARC_LAMP.outer >= 60 && ARC_LAMP.outer <= 70, 'retain a broad pool without a leaking shadow frustum');
  for (let angle = 0; angle <= ARC_LAMP.outer; angle++) {
    for (let azimuth = 0; azimuth < 360; azimuth += 30) {
      assert.equal(nearestHit(shade, ARC_LAMP.position, direction(angle, azimuth)), null,
        `shade blocks the pool at ${angle} degrees / azimuth ${azimuth}`);
    }
  }
});

test('the bulb remains recessed inside a real shade that still blocks upward light', () => {
  const rimY = Math.min(...shade.flat().map(p => p[1]));
  assert.ok(rimY > 1.27 && rimY < 1.29, 'retain the actual open lower rim');
  assert.ok(ARC_LAMP.bulbDiameter > 0 && ARC_LAMP.bulbDiameter <= 0.05);
  const radius = ARC_LAMP.bulbDiameter / 2;
  assert.ok(ARC_LAMP.position[1] - radius > rimY, 'the glowing bulb must sit above the opening, not float below it');
  // Near-vertical rays verify the retained opaque top; horizontal rays check
  // bulb clearance inside the shade without requiring every authored seam to
  // be watertight.
  for (const angle of [0, 10, 90]) {
    for (let azimuth = 0; azimuth < 360; azimuth += 30) {
      const hit = nearestHit(shade, ARC_LAMP.position, direction(angle, azimuth, true));
      assert.ok(hit && hit.distance < 0.25, `opaque shade missing above ${angle} degrees / ${azimuth}`);
      assert.ok(hit.distance > radius + 0.005, 'the sphere must not intersect the shade');
    }
  }
});

test('the reflector profile is smooth and center-bright without an inverted ring', () => {
  let previous = arcLampProfile(0);
  assert.ok(previous >= 0.95 && previous <= 1);
  for (let angle = 0.25; angle <= ARC_LAMP.outer; angle += 0.25) {
    const value = arcLampProfile(angle);
    assert.ok(Number.isFinite(value) && value > 0 && value <= 1);
    assert.ok(value <= previous, `the profile must not brighten away from center at ${angle} degrees`);
    assert.ok(previous - value < 0.02, `a discontinuity at ${angle} degrees would create a visible ring`);
    previous = value;
  }
  assert.ok(previous < 0.4, 'the outer field should fade softly from the center');
});

test('the brighter extractor emitter stays immediately below its authored diffuser', () => {
  const lamp = LAMPS.find(([name]) => name === 'cooker hood');
  assert.ok(lamp && lamp[4] >= 0.4 && lamp[4] <= 0.5, 'the extractor should provide a modest useful worktop light');
  assert.equal(lamp[6], true);
  assert.ok(hoodDiffuser.length > 0, 'use the original hood lens geometry');
  const diffuser = nearestHit(hoodDiffuser, lamp[2], [0, 1, 0]);
  assert.ok(diffuser && diffuser.distance > 0.002 && diffuser.distance < 0.03,
    'the emitter must remain under the visible lens, rather than inside the opaque hood');
});
