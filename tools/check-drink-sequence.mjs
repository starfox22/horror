import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimTrack, Entity, Quat, Vec3 } from 'playcanvas';
import { DrinkSequence, DrinkingAudio } from '../src/drink-sequence.js';
import { DRINK_DURATION, DRINK_TIMING, sampleDrink, makeDrinkingWater, GLASS_INTERIOR } from '../src/drink-timeline.js';
import { intersectTriangle } from '../src/switch-surfaces.js';

const glass = JSON.parse(readFileSync(new URL('../public/assets/props/drinking-glass.json', import.meta.url)));
const vertices = Array.from({ length: glass.positions.length / 3 }, (_, i) => glass.positions.slice(i * 3, i * 3 + 3));
const triangles = Array.from({ length: glass.indices.length / 3 }, (_, i) => glass.indices.slice(i * 3, i * 3 + 3).map(index => vertices[index]));
function nearest(origin, direction) { let closest = null; for (const triangle of triangles) { const hit = intersectTriangle(origin, direction, ...triangle); if (hit && (!closest || hit.distance < closest.distance)) closest = hit; } return closest; }

test('the authored hollow tumbler has a real base and the water clears its actual glass walls', () => {
  assert.equal(glass.license, 'CC-BY-4.0'); assert.match(glass.source, /Visthétique/); assert.ok(vertices.length > 200);
  const floor = nearest([0, .08, 0], [0, -1, 0]); assert.ok(floor && floor.point[1] > .002 && floor.point[1] < .004);
  assert.equal(nearest([0, .08, 0], [0, 1, 0]), null, 'the glass must have an open mouth');
  for (const [fill, tilt] of [[.104, 0], [.095, 25], [.055, 61], [.037, 0]]) {
    const water = makeDrinkingWater(fill, tilt), a = tilt * Math.PI / 180;
    assert.equal(water.positions.length, water.normals.length);
    for (let i = 0; i < water.positions.length; i += 3) {
      const [x, y, z] = water.positions.slice(i, i + 3), r = Math.hypot(x, z);
      assert.ok(y >= GLASS_INTERIOR.bottom && y < .1394);
      assert.ok(y > floor.point[1]);
      if (r > 1e-8 && y > .0043) {
        const wall = nearest([0, y, 0], [x / r, 0, z / r]);
        assert.ok(wall?.distance > r + .0001, `liquid crosses authored wall at ${x},${y},${z}`);
      }
      if (i >= 6 && (i / 3) % 2 === 0 && y > GLASS_INTERIOR.bottom + .0001) {
        const expected = Math.min(fill * Math.cos(a), GLASS_INTERIOR.top * Math.cos(a) - Math.sin(a) * GLASS_INTERIOR.radius);
        assert.ok(Math.abs(y * Math.cos(a) - z * Math.sin(a) - expected) < 1e-8, 'free surface must remain horizontal as glass tips');
      }
    }
  }
});

test('the complete drink track is continuous, grips before lifting, and keeps the rim clear of the eye', () => {
  const shelf = [.10, -.45, -.9]; let last = sampleDrink(0, { shelf });
  for (let t = 1 / 240; t <= DRINK_DURATION; t += 1 / 240) {
    const pose = sampleDrink(t, { shelf });
    for (const value of [...pose.glass, ...pose.hand, pose.tilt, pose.grip, pose.fill]) assert.ok(Number.isFinite(value));
    assert.ok(Math.hypot(...pose.glass.map((v, k) => v - last.glass[k])) < .012, 'glass track position jump');
    assert.ok(Math.hypot(...pose.hand.map((v, k) => v - last.hand[k])) < .014, 'hand track position jump');
    assert.ok(Math.abs(pose.tilt - last.tilt) < 1.2, 'wrist turn jump');
    if (t < DRINK_TIMING.lift) { assert.deepEqual(pose.glass, shelf); assert.equal(pose.carried, false); }
    if (t > 3.2 && t < 5.55) {
      const a = pose.tilt * Math.PI / 180, nearRim = pose.glass[2] + .1395 * Math.sin(a) + .0395 * Math.cos(a);
      assert.ok(nearRim < -.055, `rim crosses camera near clip: ${nearRim}`);
    }
    const a = pose.tilt * Math.PI / 180;
    if (t >= 1.35 && t <= 7.25) {
      const expected = [pose.glass[0] + .044, pose.glass[1] + .066 * Math.cos(a), pose.glass[2] + .066 * Math.sin(a)];
      assert.ok(Math.hypot(...pose.hand.map((v,k) => v - expected[k])) < 1e-10, 'palm contact must rotate rigidly with the glass');
    }
    assert.ok(pose.fill >= .037 && pose.fill <= .104); last = pose;
  }
  assert.equal(sampleDrink(1.35).grip, 1);
  const done = sampleDrink(DRINK_DURATION, { shelf }); assert.deepEqual(done.glass, shelf); assert.equal(done.carried, false); assert.equal(done.complete, true);
  assert.equal(sampleDrink(4.5, { reducedMotion: true }).headLift, 0);
});

function harness({ reducedMotion = false, rotation = [0, 0, 0], position = [1.55, 1.85, .5] } = {}) {
  let now = 0, completions = 0;
  const camera = new Entity('camera'); camera.setPosition(...position); camera.setEulerAngles(...rotation);
  const playerCamera = { frustum: { containsAabb: () => true } }; camera.camera = { camera: playerCamera };
  const handMi = { material: {}, aabb: {} }, glassMi = { aabb: {} };
  const hand = new Entity('hand test rig'); hand.findComponents = () => [{ meshInstances: [handMi] }];
  const frame = new Entity('fridge'), glass = new Entity('glass'); glass.findComponents = () => [{ meshInstances: [glassMi] }]; frame.addChild(glass); glass.setPosition(1.68, 1.3336, -.59);
  const player = { active: true, yaw: rotation[1], pitch: rotation[0], keys: new Set(['KeyW']), vel: new Vec3(1, 0, 1), apply() { camera.setPosition(...position); camera.setEulerAngles(this.pitch, this.yaw, 0); } };
  const fridge = { frame, glass, glassShelfPosition: glass.getPosition().clone(), glassShelfRotation: glass.getRotation().clone(),
    canDrink() { return !this.drinkRunning && !this.hasDrunk; }, setDrinkAction(action) { this.drinkAction = action; }, setGlassWater(fill, tilt) { this.fill = fill; this.tilt = tilt; } };
  const interactions = { enabled: true, update() { this.updates = (this.updates || 0) + 1; } };
  const container = { instantiateRenderEntity: () => hand, animations: [{ resource: new AnimTrack('grip', 1, [], [], []) }] };
  const audio = { resumes: [], pauseCount: 0, resume(t) { this.resumes.push(t); }, pause() { this.pauseCount++; } };
  const drink = new DrinkSequence({ camera, player, fridge, interactions, container, audio, reducedMotion, document: null, window: null, clock: () => now, onComplete: () => completions++ });
  return { drink, player, fridge, interactions, camera, playerCamera, handMi, glassMi, audio, advance(dt) { now += dt; drink.update(); }, get completions() { return completions; } };
}

test('second input starts once, blocks cached interactions immediately and returns the same player position', () => {
  const h = harness(), position = h.camera.getPosition().clone(), glassPosition = h.fridge.glass.getPosition().clone();
  assert.equal(h.drink.start(), true); assert.equal(h.drink.start(), false);
  assert.equal(h.player.active, false); assert.equal(h.player.keys.size, 0); assert.equal(h.player.vel.length(), 0);
  assert.equal(h.interactions.enabled, false); assert.equal(h.fridge.drinkRunning, true);
  h.advance(2); assert.equal(h.drink.carried, true); assert.equal(h.fridge.glass.parent, h.camera);
  h.advance(DRINK_DURATION); assert.equal(h.drink.completed, true); assert.equal(h.player.active, true);
  assert.equal(h.fridge.drinkRunning, false); assert.equal(h.fridge.hasDrunk, true); assert.equal(h.fridge.glass.parent, h.fridge.frame);
  assert.ok(h.fridge.glass.getPosition().distance(glassPosition) < 1e-10); assert.ok(h.camera.getPosition().distance(position) < 1e-10);
  assert.equal(h.fridge.fill, .037); assert.equal(h.completions, 1); assert.equal(h.drink.start(), false);
});

test('pause and hidden tab retain the held pose without paying back elapsed time', () => {
  const h = harness(); h.drink.start(); h.advance(4.4); assert.equal(h.drink.time, 4.4);
  h.drink.setLocked(false); const held = h.fridge.glass.getPosition().clone(); h.advance(300);
  assert.equal(h.drink.time, 4.4); assert.ok(h.fridge.glass.getPosition().distance(held) < 1e-10); assert.ok(h.audio.pauseCount > 0);
  h.drink.setLocked(true); h.advance(10); assert.equal(h.drink.time, 4.4);
  h.advance(.2); assert.ok(Math.abs(h.drink.time - 4.6) < 1e-10);
  h.drink.ownerDocument = { hidden: true }; h.advance(500); assert.ok(Math.abs(h.drink.time - 4.6) < 1e-10);
  h.drink.ownerDocument.hidden = false; h.advance(20); assert.ok(Math.abs(h.drink.time - 4.6) < 1e-10);
  h.advance(5); assert.equal(h.drink.completed, true); assert.equal(h.completions, 1);
});

test('recorded gulp and relief voices stop on pause and resume at the matching recording offset', () => {
  const calls = [], ctx = { currentTime: 10, destination: {}, createBufferSource() { return { connect() { return this; }, disconnect() {}, start(...args) { calls.push(['start', ...args]); }, stop() { calls.push(['stop']); } }; }, createGain() { return { gain: {}, connect() {}, disconnect() {} }; } };
  const audio = new DrinkingAudio(ctx); audio.clips = [{ start: 3.65, buffer: { duration: .568 }, gain: .8 }, { start: 7.55, buffer: { duration: 1.243 }, gain: .65 }];
  audio.resume(3.9); assert.ok(Math.abs(calls[0][2] - .25) < 1e-10); assert.ok(Math.abs(calls[1][1] - 13.65) < 1e-10);
  audio.pause(); assert.equal(calls.filter(c => c[0] === 'stop').length, 2);
  calls.length = 0; audio.resume(7.8); assert.equal(calls.length, 1); assert.ok(Math.abs(calls[0][2] - .25) < 1e-10);
});


test('per-camera culling excludes first-person hand and held glass from pending probe captures', () => {
  const h = harness(), probe = { frustum: { containsAabb: () => true } };
  assert.equal(h.handMi.cull, true);
  assert.equal(h.handMi.isVisibleFunc(h.playerCamera), true);
  assert.equal(h.handMi.isVisibleFunc(probe), false);
  assert.equal(h.glassMi.isVisibleFunc(probe), true, 'shelf glass belongs in room reflections');
  h.drink.start(); h.advance(2);
  assert.equal(h.glassMi.isVisibleFunc(h.playerCamera), true);
  assert.equal(h.glassMi.isVisibleFunc(probe), false, 'a held glass cannot be baked into room reflection probes');
  h.advance(DRINK_DURATION);
  assert.equal(h.glassMi.isVisibleFunc(probe), true, 'returned glass must appear in later room captures');
});


test('liquid gravity compensates camera pitch and roll as well as the wrist tilt', () => {
  const camera = new Quat().setFromEulerAngles(-23, 47, 9), wrist = new Quat().setFromEulerAngles(61, 0, 0);
  const worldRotation = new Quat().mul2(camera, wrist), inverse = worldRotation.clone().invert();
  const up = inverse.transformVector(Vec3.UP).toArray();
  const water = makeDrinkingWater(.082, up), { top, radius, bottom } = GLASS_INTERIOR;
  const level = Math.min(.082 * up[1], top * up[1] - Math.hypot(up[0], up[2]) * radius);
  for (let i = 2; i < water.positions.length / 3; i += 2) {
    const p = water.positions.slice(i * 3, i * 3 + 3);
    if (p[1] > bottom + 1e-6) {
      const world = worldRotation.transformVector(new Vec3(...p));
      assert.ok(Math.abs(world.y - level) < 1e-10, 'all wet surface vertices must share the same world height');
    }
  }
});


test('reach framing remains continuous from the opening view and direct or lower glass aim', () => {
  const position = [1.12, 1.85, .68], target = [1.68, 1.4136, -.59];
  const angleTo = point => { const delta = point.map((v,k) => v - position[k]); return [Math.atan2(delta[1], Math.hypot(delta[0], delta[2])) * 180 / Math.PI, Math.atan2(-delta[0], -delta[2]) * 180 / Math.PI, 0]; };
  const halfHeight = Math.tan(34 * Math.PI / 180);
  for (const aim of [[1.292, 1.49, -.332], target, [target[0], target[1] - .25, target[2]]]) {
    const h = harness({ position, rotation: angleTo(aim) }); h.drink.start();
    const begin = h.camera.getRotation().clone(); let previous = begin;
    for (let i = 1; i <= 2160; i++) {
      h.advance(1 / 240);
      const q = h.camera.getRotation().clone(), dot = Math.abs(q.x * previous.x + q.y * previous.y + q.z * previous.z + q.w * previous.w);
      assert.ok(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI < .6, 'head framing has an abrupt rotation');
      if ((h.drink.time >= .8 && h.drink.time <= 1.35) || (h.drink.time >= 7 && h.drink.time <= 7.5)) {
        for (const x of [-.05, .05]) for (const z of [-.05, .05]) {
          const end = h.drink.handCarrier.getLocalTransform().transformPoint(new Vec3(x, -.752, z));
          assert.ok(end.z >= -.05 || end.y < end.z * halfHeight, `authored forearm end is visible in reach framing: ${end}`);
        }
      }
      previous = q;
    }
    h.advance(.01);
    const end = h.camera.getRotation(), dot = Math.abs(end.x * begin.x + end.y * begin.y + end.z * begin.z + end.w * begin.w);
    assert.ok(dot > 1 - 1e-10, 'the original gaze must return at handoff');
    assert.ok(h.camera.getPosition().distance(new Vec3(...position)) < 1e-6, 'camera staging cannot move the player landing');
  }
});

test('reduced motion cuts directly to a supported held glass and keeps the camera stationary', () => {
  const h = harness({ reducedMotion: true, rotation: [-21, -23, 0], position: [1.12, 1.85, .68] });
  const begin = h.camera.getRotation().clone(), position = h.camera.getPosition().clone();
  h.drink.start(); assert.equal(h.drink.carried, true); assert.equal(h.drink.pose.handVisible, true);
  assert.equal(h.fridge.glass.parent, h.camera); assert.equal(h.drink.pose.grip, 1);
  for (let i = 0; i < 89; i++) {
    h.advance(.1);
    const current = h.camera.getRotation();
    assert.ok(Math.abs(current.x * begin.x + current.y * begin.y + current.z * begin.z + current.w * begin.w) > 1 - 1e-10);
    assert.ok(h.camera.getPosition().distance(position) < 1e-10);
    if (h.drink.time < 6.3) {
      assert.equal(h.drink.carried, true); assert.equal(h.drink.pose.handVisible, true);
    } else {
      assert.equal(h.drink.carried, false); assert.equal(h.drink.pose.handVisible, false); assert.equal(h.fridge.glass.parent, h.fridge.frame);
    }
  }
  assert.equal(sampleDrink(0, { reducedMotion: true }).glass[2], -.48);
  assert.equal(sampleDrink(6.3, { reducedMotion: true }).carried, false);
});
