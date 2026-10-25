// Being caught (src/death.js) without a browser: contact to black in under three seconds, the knife raised before it
// comes down, blood on the lens (a flash, or a fade with reduced flashes), the fall to the floor, black, then waking on
// the sofa standing in a free cell. node --test tools/check-death.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'playcanvas';
import { Death, WAKE_TO } from '../src/death.js';

function scene({ reducedFlashes = false } = {}) {
  const handlers = [];
  const els = [];
  const doc = {
    createElement: () => { const e = { id: '', style: { cssText: '' } }; els.push(e); return e; },
    body: { appendChild() {} },
    defaultView: { addEventListener() {} },
  };
  globalThis.document = { pointerLockElement: null };
  const camPos = new Vec3(4, 1.79, 3.6), camRot = [0, 0, 0];
  const camera = { getPosition: () => camPos, setPosition: (x, y, z) => camPos.set(x, y, z), setEulerAngles: (x, y, z) => { camRot[0] = x; camRot[1] = y; camRot[2] = z; } };
  const poses = [];
  const intruder = {
    pos: new Vec3(4, 0.17, 2.9), yaw: 0, shown: null,
    show(on) { this.shown = on; }, place(x, z, yaw, y) { this.pos.set(x, y ?? this.pos.y, z); this.yaw = yaw; }, play() {}, setTorch() {},
    knifePose(raise, strike) { poses.push([raise, strike]); },
  };
  const played = [];
  const bank = { has: () => false, play: (k) => played.push(k), scare: (k) => played.push(`scare:${k}`) };
  const player = { yaw: 0, pitch: 0, active: true, keys: new Set(), vel: new Vec3(), pos: new Vec3(4, 0, 3.6), apply() {},
    grid: { floorUnder: () => 0.24 } };
  const walk = { fits: () => true, floorUnder: () => 0.17 };
  const veil = { style: { opacity: '0' } };
  const app = { on: (n, fn) => handlers.push(fn), graphicsDevice: { canvas: { style: {} } } };
  const death = new Death({ app, camera, player, intruder, bank, music: { stopAll() {} }, veil, walk, doc });
  death.reducedFlashes = reducedFlashes;
  const step = (seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) handlers.forEach(fn => fn(dt)); };
  return { death, step, played, poses, veil, camPos, camRot, intruder, player, els };
}

test('caught: the knife goes up, comes down, blood, the fall, black in under three seconds', () => {
  const s = scene();
  let doneAt = null, t = 0;
  s.death.play(() => { doneAt = t; });
  assert.ok(s.played.some(k => k.startsWith('scare:')), 'a full-level sting through the scare path');
  for (; t < 4 && doneAt === null; t += 1 / 60) s.step(1 / 60);
  assert.ok(doneAt !== null && doneAt < 3.4, `black and done in ${doneAt?.toFixed(2)} s`);
  const raised = s.poses.findIndex(([r]) => r >= 1), struck = s.poses.findIndex(([, k]) => k >= 1);
  assert.ok(raised >= 0 && struck > raised, 'the knife is up before it comes down');
  const blood = s.els.find(e => e.id === 'death-blood');
  assert.equal(blood.style.opacity, '0.92', 'blood on the lens');
  assert.ok(s.camPos.y < 0.5, `the view is on the floor (${s.camPos.y.toFixed(2)} m)`);
  assert.ok(Math.abs(s.camRot[2]) > 60, 'rolled onto one side');
  assert.equal(s.veil.style.opacity, '1', 'black');
});

test('reduced flashes: no red flash, the blood fades in', () => {
  const s = scene({ reducedFlashes: true });
  s.death.play(() => {});
  s.step(0.6);
  const flash = s.els.find(e => e.id === 'death-flash');
  assert.notEqual(flash.style.opacity, '0.6');
  assert.match(s.els.find(e => e.id === 'death-blood').style.transition, /\.35s/);
});

test('waking: on the sofa, standing in a free cell facing the room; later deaths are shorter', () => {
  const s = scene();
  let done = false;
  s.death.play(() => {}); s.step(3.4);
  s.death.wakeUp(() => { done = true; });
  s.step(3.4);
  assert.ok(done);
  assert.equal(s.player.pos.x, WAKE_TO.pos[0]); assert.equal(s.player.pos.z, WAKE_TO.pos[2]);
  assert.equal(s.intruder.shown, false, 'he is gone when you wake');
  assert.equal(s.els.find(e => e.id === 'death-blood').style.opacity, '0', 'the blood is gone with him');
  let second = null, t = 0;
  s.death.play(() => { second = t; });
  for (; t < 4 && second === null; t += 1 / 60) s.step(1 / 60);
  assert.ok(second < 2.8, `the second time is shorter (${second?.toFixed(2)} s)`);
});
