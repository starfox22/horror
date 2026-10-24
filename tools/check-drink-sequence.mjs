import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Entity, Quat, Vec3, Mat4 } from 'playcanvas';
import { DrinkSequence, DrinkingAudio, SHOULDER } from '../src/drink-sequence.js';
import { solveElbow, frameRotation, gripInGlass } from '../src/arm-rig.js';
import { DRINK_DURATION, DRINK_TIMING, sampleDrink, makeDrinkingWater, GLASS_INTERIOR, GLASS_FULL, GLASS_EMPTY, GLASS_HEIGHT, glassRadiusAt } from '../src/drink-timeline.js';
const armData = JSON.parse(readFileSync(new URL('../public/assets/props/drinking-arm.json', import.meta.url)));
import { intersectTriangle } from '../src/switch-surfaces.js';

const glass = JSON.parse(readFileSync(new URL('../public/assets/props/drinking-glass.json', import.meta.url)));
const vertices = Array.from({ length: glass.positions.length / 3 }, (_, i) => glass.positions.slice(i * 3, i * 3 + 3));
const triangles = Array.from({ length: glass.indices.length / 3 }, (_, i) => glass.indices.slice(i * 3, i * 3 + 3).map(index => vertices[index]));
function nearest(origin, direction) { let closest = null; for (const triangle of triangles) { const hit = intersectTriangle(origin, direction, ...triangle); if (hit && (!closest || hit.distance < closest.distance)) closest = hit; } return closest; }

test('the downloaded tumbler has a real base and the water clears its actual glass walls', () => {
  assert.equal(glass.license, 'CC-BY-4.0'); assert.equal(glass.author, 'RagingCow'); assert.ok(vertices.length > 200);
  const floor = nearest([0, .08, 0], [0, -1, 0]); assert.ok(floor && Math.abs(floor.point[1] - glass.interior.floor) < .0008);
  assert.equal(nearest([0, .08, 0], [0, 1, 0]), null, 'the glass must have an open mouth');
  const top = GLASS_INTERIOR.top, height = Math.max(...vertices.map(v => v[1]));
  assert.ok(height > .11 && height < .13, 'a normal 12 cm tumbler');
  for (const [fill, tilt] of [[GLASS_FULL, 0], [.09, 25], [.055, 61], [GLASS_EMPTY, 0], [GLASS_EMPTY, 40]]) {
    const water = makeDrinkingWater(fill, tilt), a = tilt * Math.PI / 180;
    assert.equal(water.positions.length, water.normals.length);
    for (let i = 0; i < water.positions.length; i += 3) {
      const [x, y, z] = water.positions.slice(i, i + 3), r = Math.hypot(x, z);
      assert.ok(y >= GLASS_INTERIOR.bottom - 1e-9 && y <= top + 1e-9);
      assert.ok(y > floor.point[1]);
      if (r > 1e-8 && y > floor.point[1] + .002) {
        const wall = nearest([0, y, 0], [x / r, 0, z / r]);
        assert.ok(wall?.distance > r + .0002, `liquid crosses the glass wall at ${x},${y},${z}`);
      }
      if (i >= 6 && (i / 3) % 2 === 0 && y > GLASS_INTERIOR.bottom + .0001 && y < top - .0001) {
        const expected = Math.min(fill * Math.cos(a), top * Math.cos(a) - Math.sin(a) * glassRadiusAt(top));
        assert.ok(Math.abs(y * Math.cos(a) - z * Math.sin(a) - expected) < 1e-8, 'free surface must remain horizontal as glass tips');
      }
    }
  }
});

test('the complete drink track is continuous, grips before lifting, and keeps the rim clear of the eye', () => {
  const shelf = [.10, -.45, -.9]; let last = sampleDrink(0, { shelf });
  for (let t = 1 / 240; t <= DRINK_DURATION; t += 1 / 240) {
    const pose = sampleDrink(t, { shelf });
    for (const value of [...pose.glass, pose.tilt, pose.grip, pose.open, pose.approach, pose.grasp, pose.fill, pose.look, pose.lean, pose.sip]) assert.ok(Number.isFinite(value));
    assert.ok(Math.hypot(...pose.glass.map((v, k) => v - last.glass[k])) < .012, 'glass track position jump');
    assert.ok(Math.abs(pose.tilt - last.tilt) < 1.2, 'wrist turn jump');
    for (const key of ['approach', 'grasp', 'open', 'grip', 'look', 'lean', 'sip']) assert.ok(Math.abs(pose[key] - last[key]) < .04, `${key} jumps`);
    if (t < DRINK_TIMING.lift) { assert.deepEqual(pose.glass, shelf); assert.equal(pose.carried, false); }
    if (pose.carried) assert.ok(pose.grip > .99 && pose.grasp > .99, 'the hand holds the glass whenever it is off the shelf');
    if (t > 3.2 && t < 5.55) {
      // The near rim (towards the eye) stays beyond the camera's 5 cm near plane.
      const a = pose.tilt * Math.PI / 180, nearRim = pose.glass[2] + GLASS_HEIGHT * Math.sin(a) + .036 * Math.cos(a);
      assert.ok(nearRim < -.055, `rim crosses camera near clip: ${nearRim}`);
    }
    assert.ok(pose.fill >= GLASS_EMPTY - 1e-9 && pose.fill <= GLASS_FULL + 1e-9); last = pose;
  }
  assert.equal(sampleDrink(DRINK_TIMING.lift).grip, 1);
  assert.ok(sampleDrink(.6).open > .9 && sampleDrink(.6).grip === 0, 'the hand opens before it closes on the glass');
  const done = sampleDrink(DRINK_DURATION, { shelf }); assert.deepEqual(done.glass, shelf); assert.equal(done.carried, false); assert.equal(done.complete, true);
  assert.equal(sampleDrink(4.5, { reducedMotion: true }).look, 0);
});

test('two-bone IK reaches the wrist exactly with the elbow towards its pole, and the grip fits the glass', () => {
  const s = new Vec3(.19, -.25, .09), pole = new Vec3(.55, -.8, .25).normalize();
  for (const w of [new Vec3(.1, -.3, -.4), new Vec3(.02, -.1, -.2), new Vec3(.25, -.5, -.3)]) {
    const e = solveElbow(s, w, .2858, .27092, pole);
    assert.ok(Math.abs(e.distance(s) - .2858) < 1e-6); assert.ok(Math.abs(e.distance(w) - .27092) < 1e-6);
    const mid = new Vec3().lerp(s, w, .5); assert.ok(new Vec3().sub2(e, mid).dot(pole) > 0, 'elbow bends towards the pole');
  }
  const q = frameRotation(new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Vec3(0, 0, -1), new Vec3(0, 1, 0));
  const y = q.transformVector(new Vec3(0, 1, 0)); assert.ok(y.distance(new Vec3(0, 0, -1)) < 1e-6);
  // In the glass frame the asset's grip axis is the glass's up and its base sits at the origin.
  const grip = gripInGlass(armData, GLASS_HEIGHT), { centre, axis } = armData.grip.cylinder;
  const up = grip.rotation.transformVector(new Vec3(...axis)); assert.ok(up.distance(new Vec3(0, 1, 0)) < 1e-6);
  const c = grip.rotation.transformVector(new Vec3(...centre)).add(grip.position);
  assert.ok(Math.hypot(c.x, c.z) < 1e-6 && Math.abs(c.y - GLASS_HEIGHT / 2) < 1e-6, 'grip centred on the glass at mid-height');
});

function harness({ reducedMotion = false, rotation = [0, 0, 0], position = [1.55, 1.85, .5] } = {}) {
  let now = 0, completions = 0;
  const camera = new Entity('camera'); camera.setPosition(...position); camera.setEulerAngles(...rotation);
  const playerCamera = { frustum: { containsAabb: () => true } }; camera.camera = { camera: playerCamera };
  const handMi = { material: {}, aabb: {} }, glassMi = { aabb: {} };
  // The asset's real joint hierarchy (drinking-arm.json), without a GPU.
  const arm = new Entity('arm test rig'), joints = {};
  for (const j of armData.joints) { const e = new Entity(j.name); e.setLocalPosition(...j.restLocal.translation); (joints[j.parent] || arm).addChild(e); joints[j.name] = e; }
  arm.findComponents = () => [{ meshInstances: [handMi] }];
  const frame = new Entity('fridge'), glass = new Entity('glass'); glass.findComponents = () => [{ meshInstances: [glassMi] }]; frame.addChild(glass); glass.setPosition(1.68, 1.3336, -.59);
  const player = { active: true, yaw: rotation[1], pitch: rotation[0], keys: new Set(['KeyW']), vel: new Vec3(1, 0, 1), apply() { camera.setPosition(...position); camera.setEulerAngles(this.pitch, this.yaw, 0); } };
  const fridge = { frame, glass, glassShelfPosition: glass.getPosition().clone(), glassShelfRotation: glass.getRotation().clone(),
    canDrink() { return !this.drinkRunning && !this.hasDrunk; }, setDrinkAction(action) { this.drinkAction = action; }, setGlassWater(fill, tilt) { this.fill = fill; this.tilt = tilt; } };
  const interactions = { enabled: true, update() { this.updates = (this.updates || 0) + 1; } };
  const container = { instantiateRenderEntity: () => arm };
  const audio = { resumes: [], pauseCount: 0, resume(t) { this.resumes.push(t); }, pause() { this.pauseCount++; } };
  const drink = new DrinkSequence({ camera, player, fridge, interactions, container, armData, audio, reducedMotion, document: null, window: null, clock: () => now, onComplete: () => completions++ });
  return { drink, player, fridge, interactions, camera, playerCamera, handMi, glassMi, audio, joints, advance(dt) { now += dt; drink.update(); }, get completions() { return completions; } };
}

// Camera-space position of a world point.
const local = (camera, p) => { const m = camera.getWorldTransform().clone().invert(); return m.transformPoint(p, new Vec3()); };

test('the arm stays attached: the wrist reaches its target, the hand holds the glass rigidly, the shoulder cut is never seen', () => {
  for (const rotation of [[0, 0, 0], [-25, 10, 0], [12, -15, 0]]) {
    const h = harness({ rotation, position: [1.62, 1.82, .2] }); h.drink.start();
    const grip = gripInGlass(armData, GLASS_HEIGHT), centreInGlass = new Vec3(0, GLASS_HEIGHT / 2, 0);
    const halfV = Math.tan(34 * Math.PI / 180), halfH = halfV * 16 / 9;
    for (let i = 0; i <= DRINK_DURATION * 120; i++) {
      h.advance(1 / 120);
      if (!h.drink.running || !h.drink.pose.handVisible) continue;
      const wrist = local(h.camera, h.joints.hand_r.getPosition());
      assert.ok(wrist.distance(h.drink.wrist) < .001, `wrist off its target by ${wrist.distance(h.drink.wrist)} at ${h.drink.time}`);
      if (h.drink.pose.grasp > .99999) {
        // The glass centre seen from the hand frame is the asset's fitted grip centre.
        const handInverse = h.joints.hand_r.getWorldTransform().clone().invert();
        const c = handInverse.transformPoint(h.fridge.glass.getWorldTransform().transformPoint(centreInGlass, new Vec3()), new Vec3());
        const expected = new Vec3(...armData.grip.cylinder.centre);
        assert.ok(c.distance(expected) < .0015, `glass slips in the hand by ${c.distance(expected)} at ${h.drink.time}`);
      }
      // The open end of the sleeve, 7 cm from the shoulder joint, stays behind the near plane or outside the view.
      const cut = local(h.camera, h.joints.upperarm_r.getWorldTransform().transformPoint(new Vec3(0, .07, 0), new Vec3()));
      assert.ok(cut.z > -.05 || Math.abs(cut.y) > -cut.z * halfV || Math.abs(cut.x) > -cut.z * halfH, `shoulder cut in view at ${h.drink.time}: ${cut}`);
      // A natural elbow (neither locked straight nor folded) and a wrist that only bends so far.
      const s = local(h.camera, h.joints.upperarm_r.getPosition()), e = local(h.camera, h.joints.forearm_r.getPosition());
      const u = e.clone().sub(s).normalize(), f = wrist.clone().sub(e).normalize(), fingers = h.joints.hand_r.up.clone();
      const forearmWorld = h.joints.hand_r.getPosition().clone().sub(h.joints.forearm_r.getPosition()).normalize();
      assert.ok(Math.acos(Math.min(1, u.dot(f))) * 180 / Math.PI < 150, 'elbow folded too far');
      assert.ok(Math.acos(Math.min(1, forearmWorld.dot(fingers))) * 180 / Math.PI < 80, `wrist bent ${Math.acos(forearmWorld.dot(fingers)) * 180 / Math.PI} deg at ${h.drink.time}`);
    }
    assert.equal(h.drink.completed, true);
  }
});

test('second input starts once, blocks cached interactions immediately and returns the same player position', () => {
  const h = harness(), position = h.camera.getPosition().clone(), glassPosition = h.fridge.glass.getPosition().clone();
  assert.equal(h.drink.start(), true); assert.equal(h.drink.start(), false);
  assert.equal(h.player.active, false); assert.equal(h.player.keys.size, 0); assert.equal(h.player.vel.length(), 0);
  assert.equal(h.interactions.enabled, false); assert.equal(h.fridge.drinkRunning, true);
  h.advance(2); assert.equal(h.drink.carried, true); assert.equal(h.fridge.glass.parent, h.camera);
  h.advance(DRINK_DURATION); assert.equal(h.drink.completed, true); assert.equal(h.player.active, true);
  assert.equal(h.fridge.drinkRunning, false); assert.equal(h.fridge.hasDrunk, true); assert.equal(h.fridge.glass.parent, h.fridge.frame);
  assert.ok(h.fridge.glass.getPosition().distance(glassPosition) < 1e-10); assert.ok(h.camera.getPosition().distance(position) < 1e-10);
  assert.equal(h.fridge.fill, GLASS_EMPTY); assert.equal(h.completions, 1); assert.equal(h.drink.start(), false);
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

test('recorded voices stop on pause and resume at the matching recording offset', () => {
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
  const water = makeDrinkingWater(.082, up), { top, bottom } = GLASS_INTERIOR;
  const level = Math.min(.082 * up[1], top * up[1] - Math.hypot(up[0], up[2]) * glassRadiusAt(top));
  for (let i = 2; i < water.positions.length / 3; i += 2) {
    const p = water.positions.slice(i * 3, i * 3 + 3);
    if (p[1] > bottom + 1e-6 && p[1] < top - 1e-6) {
      const world = worldRotation.transformVector(new Vec3(...p));
      assert.ok(Math.abs(world.y - level) < 1e-10, 'all wet surface vertices must share the same world height');
    }
  }
});


test('head and body framing is continuous and gives the original view back at the end', () => {
  const position = [1.62, 1.82, .2];
  for (const rotation of [[0, 0, 0], [-30, 15, 0], [20, -10, 0]]) {
    const h = harness({ position, rotation }); h.drink.start();
    const begin = h.camera.getRotation().clone(); let previous = begin, previousPosition = h.camera.getPosition().clone();
    for (let i = 1; i <= 2160; i++) {
      h.advance(1 / 240);
      const q = h.camera.getRotation().clone(), dot = Math.abs(q.x * previous.x + q.y * previous.y + q.z * previous.z + q.w * previous.w);
      assert.ok(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI < .6, 'head framing has an abrupt rotation');
      assert.ok(h.camera.getPosition().distance(previousPosition) < .006, 'the body lean jumps');
      previous = q; previousPosition = h.camera.getPosition().clone();
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
  assert.equal(sampleDrink(0, { reducedMotion: true }).glass[2], -.36);
  assert.equal(sampleDrink(6.3, { reducedMotion: true }).carried, false);
});
