import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vec3 } from 'playcanvas';
import { WalkGrid } from '../src/walkgrid.js';
import { sampleWake, WakeSequence, WAKE_DURATION, WAKE_DIALOGUE, WAKE_EXIT } from '../src/wake-sequence.js';

const grid = new WalkGrid(JSON.parse(readFileSync(new URL('../public/assets/apartment/collision.json', import.meta.url))));
const makeCamera = () => ({ setPosition(...v) { this.position = v; }, setEulerAngles(...v) { this.rotation = v; } });
function harness({ reducedMotion = false } = {}) {
  let now = 0, completed = 0;
  const camera = makeCamera();
  const player = { grid, pos: new Vec3(13, 0, 3.55), vel: new Vec3(1, 0, 1), keys: new Set(['KeyW']), active: false,
    apply() { camera.setPosition(this.pos.x, this.eyeY, this.pos.z); camera.setEulerAngles(this.pitch, this.yaw, 0); } };
  const ownerWindow = new EventTarget();
  const wake = new WakeSequence({ camera, player, reducedMotion, clock: () => now, document: null, window: ownerWindow, onComplete: () => completed++ });
  return { wake, player, camera, ownerWindow, advance(value) { now += value; wake.update(); }, get completions() { return completed; } };
}

test('opening begins above the actual pillow and ends on a clear, connected bedside aisle', () => {
  const floor = grid.floorUnder(WAKE_EXIT.x, WAKE_EXIT.z, 0.22);
  const first = sampleWake(0, { floor }), final = sampleWake(WAKE_DURATION, { floor });
  assert.ok(first.position[0] > 13 && first.position[0] < 13.6);
  assert.ok(first.position[1] > 1.0556 && first.position[1] < 1.2, 'the camera must sit above the highest authored pillow/blanket');
  assert.ok(first.position[2] > -0.44 && first.position[2] < 1.46, 'start inside the authored bed footprint');
  assert.ok(first.rotation[0] > 55, 'wake looking up, not standing at the front door');
  assert.equal(first.eyes, 1);
  assert.ok(grid.fits(WAKE_EXIT.x, WAKE_EXIT.z, 0.22, floor), 'a full player capsule must fit at the landing');
  assert.equal(final.position[1], floor + 1.62);
  assert.deepEqual(final.rotation, [WAKE_EXIT.pitch, WAKE_EXIT.yaw, 0]);
  assert.equal(final.complete, true);
  // The player can leave along the actual open bedside aisle toward the door.
  for (let x = WAKE_EXIT.x; x >= 11.35; x -= 0.025) assert.ok(grid.fits(x, WAKE_EXIT.z, 0.22, floor), `aisle blocked at x=${x}`);
});

test('the entire authored camera track stays finite, above bedding and continuous through action boundaries', () => {
  let previous = sampleWake(0);
  for (let time = 1 / 240; time <= WAKE_DURATION; time += 1 / 240) {
    const pose = sampleWake(time);
    for (const value of [...pose.position, ...pose.rotation, pose.eyes, pose.dialogue]) assert.ok(Number.isFinite(value));
    assert.ok(pose.position[1] > 1.05 && pose.position[1] < 1.82);
    assert.ok(Math.hypot(...pose.position.map((value, k) => value - previous.position[k])) < 0.008, 'camera path has a position jump');
    assert.ok(Math.max(...pose.rotation.map((value, k) => Math.abs(value - previous.rotation[k]))) < 0.35, 'camera turn has a rotation jump');
    assert.ok(pose.eyes >= 0 && pose.eyes <= 1);
    assert.ok(pose.dialogue >= 0 && pose.dialogue <= 1);
    previous = pose;
  }
  assert.equal(sampleWake(4).dialogue, 1, 'the complete line must be readable during the sit-up');
  assert.equal(WAKE_DIALOGUE, 'I just had a nightmare, I will go get some water at the kitchen');
});

test('accepted pointer lock starts once, blocks movement, pauses without time debt and returns normal control', () => {
  const h = harness();
  assert.equal(h.wake.started, false);
  assert.deepEqual(h.camera.position, sampleWake(0).position);
  h.advance(20);
  assert.equal(h.wake.time, 0, 'loading/startscreen must not consume the animation');
  h.wake.setLocked(true);
  assert.equal(h.wake.running, true);
  assert.equal(h.player.active, false);
  assert.equal(h.player.keys.size, 0);
  assert.equal(h.player.vel.length(), 0);
  h.advance(3.4);
  assert.ok(Math.abs(h.wake.time - 3.4) < 1e-10);
  h.wake.setLocked(false);
  h.advance(300);
  assert.ok(Math.abs(h.wake.time - 3.4) < 1e-10, 'paused time cannot skip the opening');
  h.wake.setLocked(true);
  h.advance(5);
  assert.ok(Math.abs(h.wake.time - 3.4) < 1e-10, 'resume establishes a fresh clock');
  h.advance(9);
  assert.equal(h.wake.completed, true);
  assert.equal(h.wake.running, false);
  assert.equal(h.player.active, true);
  assert.equal(h.player.pos.x, WAKE_EXIT.x);
  assert.equal(h.player.pos.z, WAKE_EXIT.z);
  assert.equal(h.completions, 1);
  h.wake.setLocked(false);
  h.wake.setLocked(true);
  h.advance(60);
  assert.equal(h.completions, 1, 'resume cannot restart the scripted event');
});

test('Space skips exactly once and preserves a valid standing handoff', () => {
  const h = harness();
  h.wake.setLocked(true);
  const event = new Event('keydown');
  Object.defineProperty(event, 'code', { value: 'Space' });
  // The entry button often retains focus after its native click. Pointer lock
  // must still allow Space to skip instead of reactivating that focused button.
  Object.defineProperty(event, 'target', { value: { tagName: 'BUTTON' } });
  h.wake.onKey(event);
  assert.equal(h.wake.completed, true);
  assert.equal(h.player.active, true);
  assert.equal(h.completions, 1);
  assert.equal(h.wake.skip(), false);
  assert.equal(h.player.eyeY, h.player.floor + 1.62);
  assert.deepEqual(h.camera.position, [WAKE_EXIT.x, h.player.eyeY, WAKE_EXIT.z]);
  h.wake.destroy();
});

test('reduced motion keeps a stationary upright view, a readable line and a shorter opening', () => {
  const first = sampleWake(0, { reducedMotion: true });
  for (const time of [1, 2, 4, 6.5]) {
    const pose = sampleWake(time, { reducedMotion: true });
    assert.deepEqual(pose.position, first.position);
    assert.deepEqual(pose.rotation, first.rotation);
    assert.equal(pose.duration, 6.5);
  }
  assert.equal(sampleWake(2, { reducedMotion: true }).dialogue, 1);
  const h = harness({ reducedMotion: true });
  h.wake.setLocked(true);
  h.advance(6.6);
  assert.equal(h.wake.completed, true);
});
