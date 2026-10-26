// The hunt's body and the LIVE scene without a browser: hunt.js (the stalker's decisions turned into his body, his
// sounds, the knife, the doors and taps he touches) and seccam.js (LIVE: he is drawn for the home camera alone, leaves its
// frame where nothing else could see him, the story's fallback held while it plays, the scene ended by a hunt that
// starts some other way). The stalker's own behaviour is tools/check-stalker.mjs.
// node --test tools/check-hunt.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WalkGrid } from '../src/walkgrid.js';
import { NavGrid } from '../src/navgrid.js';
import { Hunt, STEPS } from '../src/hunt.js';
import { TUTORIAL, PLACES, RESPAWN, SENSES, DROP, WARDROBE } from '../src/stalker.js';
import { Seccam, CAM, LIVE_WALK, LIVE_EXIT } from '../src/seccam.js';

const COLLISION = JSON.parse(readFileSync(new URL('../public/assets/apartment/collision.json', import.meta.url), 'utf8'));
const SIGHT = JSON.parse(readFileSync(new URL('../public/assets/apartment/sight.json', import.meta.url), 'utf8'));
const DT = 1 / 30;

// His body as hunt.js and seccam.js drive it (intruder.js), recording what is asked of it.
function body() {
  return {
    pos: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, yaw: 0, visible: false,
    headPitch: 0, cameraOnly: false, clip: null, knives: [], shown: [],
    clips: Object.fromEntries(['walk_slow_01', 'walk_neutral_01', 'run_neutral_01', 'idle_breathe_01', 'idle_look_around_01', 'crouch_idle', 'crouch_out', 'try_door_inwards'].map(n => [n, {}])),
    show(on = true) { this.visible = on; this.shown.push(on); },
    place(x, z, yaw = this.yaw, y = 0.16) { this.pos.set(x, y, z); this.yaw = yaw; },
    play(name) { if (!this.clips[name]) throw new Error(`no clip ${name}`); this.clip = name; },
    raiseKnife(k) { this.knives.push(k); },
  };
}

// A night in Act IV around a Hunt: the player, the torch, the doors, the wardrobe, the taps, the sounds.
function night({ at = [10.45, 3.4], difficulty = 'normal' } = {}) {
  const walk = new WalkGrid(COLLISION), nav = new NavGrid(walk, SIGHT);
  const played = [], caught = [];
  const bank = { play: (key, opts) => played.push({ key, ...opts }), scare: (key, opts) => played.push({ key, scare: true, ...opts }) };
  const door = { id: 'bath', angle: 0, open: -92, target: 0, openRequested: false, locked: false, handle: { x: 9.15, y: 1.245, z: 1.15 } };
  door.segmentAt = (a) => { const r = a * Math.PI / 180; return [9.1086, 0.39, 9.1086 + Math.sin(r) * 0.86, 0.39 + Math.cos(r) * 0.86]; };
  door.segment = () => door.segmentAt(door.angle);
  door.blocker = walk.addBlocker(door.segment);
  const doors = { doors: [door], sounded: [], sounds: { door: (opening, at) => doors.sounded.push(opening) } };
  const right = { id: 'right', angle: 0, target: 0, openRequested: false, handlePoint: { z: -0.47 } };
  const closets = { doors: [right], moving: [], sounds: { wardrobe: () => played.push({ key: 'wardrobe (closets)' }) } };
  const taps = { taps: new Map([['kitchen', { on: false, def: { spout: [-2.6505, 1.074, -1.0165] } }], ['bathroom', { on: false, def: { spout: [6.6715, 1.228, 1.246] } }]]),
    sets: [], set(id, on, info) { this.sets.push([id, on, info.by]); this.taps.get(id).on = on; } };
  const nest = { dusts: 0, dust() { this.dusts++; } };
  const story = { seed: 7, caught: () => caught.push(true), sys: { doors, closets, taps, nest } };
  const player = { pos: { x: at[0], y: 0, z: at[1] }, isCrouched: false, running: false };
  const flashlight = { held: true, on: false };
  const man = body();
  const hunt = new Hunt({ app: {}, intruder: man, nav, walk, player, camera: {}, flashlight, bank, story, music: { hunt() {}, danger() {}, sting: (k) => played.push({ key: `sting:${k}` }) },
    difficulty: () => difficulty });
  const run = (seconds, each) => { for (let t = 0; t < seconds - 1e-9; t += DT) { each?.(t); hunt.update(DT); } };
  return { hunt, s: hunt.stalker, nav, walk, man, player, flashlight, played, caught, door, doors, right, closets, taps, nest, run };
}

test('noises carry as far as STORY says: doors and the wardrobe 6 m, a running tap 7 m, the lock 6, glass 5, the phone 12', () => {
  const { hunt, s } = night();
  const heard = [];
  s.noise = (x, z, r, kind) => heard.push([kind, r]);
  hunt.noise(1, 1, 'door');                                  // nothing while the hunt is off
  assert.deepEqual(heard, []);
  hunt.active = true;
  for (const kind of ['door', 'wardrobe', 'tap', 'unlock', 'glass', 'phone', 'crouch', 'walk', 'run', 'loud']) hunt.noise(1, 1, kind);
  assert.deepEqual(heard, [['door', 6], ['wardrobe', 6], ['tap', 7], ['unlock', 6], ['glass', 5], ['phone', 12], ['crouch', 0.5], ['walk', 2.5], ['run', 8], ['loud', 6]]);
});

test('from the fuse box: he starts 8 m of path away, still for a moment, then moves (no light of his own); a torch counts only from the hint', () => {
  for (const at of [[10.45, 3.4], [4.6, 0.6], [0.5, 0.15], [-4, 2.5]]) {
    const n = night({ at });
    n.flashlight.on = true;
    n.hunt.start({ tutorial: true, from: 'fusebox' });
    assert.ok(n.nav.pathDistance(at[0], at[1], n.s.x, n.s.z, { through: true }) >= TUTORIAL.spawn - 1e-6, `from ${at}`);
    n.run(0.5);
    assert.equal(n.man.visible, true, 'his body is there');
    assert.equal(n.s.looking, false, 'standing by the box at first');
    n.run(1.2);
    assert.equal(n.s.looking, true, 'then looking for the player');
    assert.equal(n.man.setTorch, undefined, 'he carries no light (build 0.15)');
    n.run(TUTORIAL.hint - 1.7 - 0.1);
    assert.equal(n.hunt.torchHeld, 0, 'the torch has not counted before the hint');
    n.run(0.5);
    assert.ok(n.hunt.torchHeld > 0.3, 'and counts after it');
  }
});

test('from the hatch: legs out of the wardrobe, a heavy landing, the wardrobe swung open, and he runs for the front door', () => {
  const n = night({ at: [12.5, 3.9] });
  n.hunt.start({ tutorial: false, from: 'hatch' });
  assert.equal(n.s.state, 'drop'); assert.equal(n.s.tutorial, 0);
  n.run(DT);
  assert.ok(n.man.pos.y > 0.5, 'dropping from the hatch, feet high');
  assert.ok(n.played.some(p => p.key === 'wardrobe_creak') && n.played.some(p => p.key === 'hangers'), 'the wardrobe creaks, the hangers rattle');
  assert.ok(n.nest.dusts > 0, 'dust from the hatch');
  n.run(DROP.fall + 0.1);
  assert.ok(n.played.some(p => p.key === 'door_kick'), 'the landing');
  assert.ok(n.man.pos.y < 0.3, 'on the floor');
  assert.equal(n.right.target, 1, 'the wardrobe door swung open');
  n.run(2);
  assert.ok(['investigate', 'chase'].includes(n.s.state) && n.s.speed > 2, `at a run (${n.s.state}, ${n.s.speed.toFixed(2)} m/s)`);
});

test('after a catch: he patrols from the bedroom door, in sight, 8 s before he can catch; placed again if a checkpoint moves the player', () => {
  const n = night({ at: [-5.12, 2.0] });
  n.hunt.respawn();
  n.run(DT);
  assert.equal(n.man.visible, true); assert.equal(n.s.looking, true);
  assert.ok(Math.hypot(n.man.pos.x - PLACES.respawn[0], n.man.pos.z - PLACES.respawn[1]) < 0.2, 'at the bedroom door');
  assert.ok(Math.abs(n.s.grace - (RESPAWN.grace - DT)) < 1e-6);
  // story.restore() respawns before the checkpoint puts the player in place (main.js applyCheckpoint).
  const m = night({ at: [11.0, 1.9] });
  m.hunt.respawn();
  m.player.pos.x = 4.6; m.player.pos.z = 0.4;              // ACT_START[4], after the respawn
  m.run(DT);
  assert.ok(Math.hypot(m.s.x - PLACES.respawn[0], m.s.z - PLACES.respawn[1]) < 0.2, 'from the bedroom door, the player being far now');
  const k = night({ at: [-5, 2] });
  k.hunt.respawn();
  k.player.pos.x = 10.6; k.player.pos.z = 3.2;             // a checkpoint right outside the bedroom
  k.run(DT);
  assert.ok(k.nav.pathDistance(10.6, 3.2, k.s.x, k.s.z, { through: true }) >= RESPAWN.from, 'never on top of the player');
});

test('the knife: raised into his light over the windup each frame, down otherwise; the strike calls the story', () => {
  const n = night({ at: [6.5, 3.5] });
  n.hunt.start({ tutorial: false, from: 'fusebox' });
  const s = n.s;
  s.spawn(7.4, 3.5, -90, 'chase'); s.suspicion = 1;
  n.man.knives.length = 0;
  n.run(1.5);
  assert.equal(n.caught.length, 1, 'caught');
  const ks = n.man.knives;
  const up = ks.slice(ks.indexOf(ks.find(k => k > 0)));
  assert.ok(up.length >= Math.floor(SENSES.killWindup / DT) - 1, `raised over ${up.length} frames`);
  for (let i = 1; i < up.length; i++) assert.ok(up[i] >= up[i - 1], 'rising');
  assert.equal(up[up.length - 1], 1, 'up at the strike');
  assert.ok(ks.slice(0, ks.indexOf(up[0])).every(k => k === 0), 'down before the windup');
  // Out of his reach mid-windup: down again.
  const m = night({ at: [6.5, 3.5] });
  m.hunt.start({ tutorial: false, from: 'fusebox' });
  m.s.spawn(7.4, 3.5, -90, 'chase'); m.s.suspicion = 1;
  m.run(0.2);
  assert.ok(m.man.knives.at(-1) > 0, 'coming up');
  m.player.pos.x = 3.4; m.player.pos.z = 3.6;
  m.run(DT * 2);
  assert.equal(m.man.knives.at(-1), 0, 'down: out of reach');
});

test('his hands on the flat: the bathroom door opened fully (shut or ajar), the wardrobe door swung, a running tap turned off', () => {
  const n = night();
  n.hunt.openDoor(n.door);
  assert.equal(n.door.openRequested, true); assert.equal(n.door.target, -92); assert.equal(n.door.moving, true);
  assert.deepEqual(n.doors.sounded, [true], 'its latch and creak');
  n.hunt.openDoor(n.door);
  assert.deepEqual(n.doors.sounded, [true], 'once');
  const ajar = night();
  Object.assign(ajar.door, { angle: -14, target: -14, openRequested: true });     // world.js: left ajar
  ajar.hunt.openDoor(ajar.door);
  assert.equal(ajar.door.target, -92, 'ajar: pushed fully open');
  const locked = night();
  locked.door.locked = true;
  locked.hunt.openDoor(locked.door);
  assert.equal(locked.door.openRequested, false, 'a locked door stays shut');
  const own = night();
  own.doors.open = (d) => { d.target = d.open; own.doors.sounded.push('open()'); };
  own.hunt.openDoor(own.door);
  assert.deepEqual(own.doors.sounded, ['open()'], 'doors.js open() when it has one');
  n.hunt.openWardrobe();
  assert.equal(n.right.target, 1); assert.ok(n.closets.moving.includes(n.right));
  n.taps.taps.get('kitchen').on = true;
  n.hunt.tapOff(-2.6, -1.0);
  assert.deepEqual(n.taps.sets, [['kitchen', false, 'him']]);
});

test('standing in the wardrobe: pressed into its open right half counts, in front of a shut door does not', () => {
  const n = night();
  n.right.angle = 1;
  assert.equal(n.hunt.inWardrobe({ x: 10.1, z: -0.1 }), true);
  assert.equal(n.hunt.inWardrobe({ x: 10.6, z: -0.1 }), false, 'a step back is out');
  assert.equal(n.hunt.inWardrobe({ x: 10.1, z: -0.9 }), false, 'the left half is the torch shelf');
  n.right.angle = 0;
  assert.equal(n.hunt.inWardrobe({ x: 10.1, z: -0.1 }), false);
  // In the hunt (after its first seconds of grace): dust at 1 s, he comes down at 4 s.
  const m = night({ at: [10.1, -0.1] });
  m.right.angle = 1;
  m.hunt.start({ tutorial: false, from: 'fusebox' });
  m.run(m.s.grace + WARDROBE.drop + 0.2);
  assert.ok(m.nest.dusts >= 2, 'dust (and the drop) from the hatch');
  assert.ok(['drop', 'alert', 'investigate', 'chase', 'kill'].includes(m.s.state), `he came down (${m.s.state})`);
  // Never inside the first encounter: a hunt that starts while the player is at the nest does not open with a death.
  const t = night({ at: [10.1, -0.1] });
  t.right.angle = 1;
  t.hunt.start({ tutorial: true, from: 'fusebox' });
  t.run(7);
  assert.ok(!['drop', 'chase', 'kill'].includes(t.s.state), `not during the first encounter (${t.s.state})`);
});

// --- LIVE ---------------------------------------------------------------------------------------------------------------
const sub = (a, b) => a.map((v, i) => v - b[i]), norm = (a) => { const l = Math.hypot(...a); return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
// Is any part of a 0.27 m body standing at (x, z) (floor to 1.85 m) inside the home camera's frame (5 % margin)?
function inFrame(x, z) {
  const f = norm(sub(CAM.look, CAM.pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const tanV = Math.tan(CAM.fov / 2 * Math.PI / 180), tanH = tanV * 384 / 216;
  for (const y of [0.1, 0.5, 0.9, 1.3, 1.6, 1.85]) for (let a = 0; a < 8; a++) for (const rad of [0, 0.15, 0.27]) {
    const v = sub([x + Math.cos(a * Math.PI / 4) * rad, y, z + Math.sin(a * Math.PI / 4) * rad], CAM.pos), cz = dot(v, f);
    if (cz > 0.02 && Math.abs(dot(v, r) / cz) <= tanH / 0.95 && Math.abs(dot(v, u) / cz) <= tanV / 0.95) return true;
  }
  return false;
}
// Can anyone standing or crouching anywhere in the corridor see any part of him at (x, z)?
function seenFromCorridor(nav, walk, x, z) {
  for (let cx = 1.7; cx < 13.9; cx += 0.2) for (let cz = 2.8; cz < 4.35; cz += 0.2) {
    if (!walk.fits(cx, cz, 0.22, walk.floorAt(cx, cz) ?? 0.15)) continue;
    for (const ey of [1.05, 1.62]) for (const by of [0.9, 1.5, 1.75]) if (nav.sees({ x: cx, y: ey, z: cz }, { x, y: by, z })) return true;
  }
  return false;
}

// Seccam's scene methods on a stand-in (its constructor needs a GPU): the man, the story, the wardrobe, the camera.
function feed({ ready = true } = {}) {
  const listeners = new Set(), flags = new Set(ready ? ['restored', 'alerts'] : []), calls = [];
  const story = { has: (f) => flags.has(f), on: (fn) => listeners.add(fn), liveWatched: () => flags.add('live'),
    huntStart: (cause) => { calls.push(cause); if (!flags.has('hunt')) { flags.add('hunt'); for (const fn of listeners) fn('hunt'); } } };
  const cam = Object.create(Seccam.prototype);
  Object.assign(cam, { intruder: body(), story, closets: { doors: [{ id: 'right', angle: 0, sign: -1, pivot: { setEulerAngles() {} } }] }, nest: { dust() {} }, bank: { play() {} },
    entity: { camera: { enabled: false } }, live: null, clip: null, scene: null, frameSkip: 0 });
  story.on(flag => { if (flag === 'hunt') cam.endScene(); });     // as the constructor does
  return { cam, story, flags, calls, man: cam.intruder };
}

test('an early LIVE view remains an ordinary feed until restored power and the Act III alert', () => {
  const { cam, flags, calls } = feed({ ready: false });
  cam.live = { t: 0, videoMat: {}, inBedroom: () => false, dead: false };
  const step = seconds => { for (let i = 0; i < seconds * 30; i++) cam.update(DT); };
  step(8);
  assert.equal(cam.scene, null, 'a charged phone cannot skip the water and fuse-box acts');
  assert.equal(cam.liveRunning, false, 'an ordinary feed does not hold the hunt fallback');
  assert.equal(cam.live.t, 0, 'the scripted countdown has not started');
  flags.add('restored'); step(8);
  assert.equal(cam.scene, null, 'power alone does not skip the quiet before the alert');
  flags.add('alerts'); step(1);
  assert.equal(cam.liveRunning, true, 'the story now waits while the scene counts down');
  assert.equal(cam.scene, null, 'it still gets its own 2.5-second countdown');
  step(1.6);
  assert.ok(cam.scene, 'LIVE plays normally once its story prerequisites are met');
  assert.deepEqual(calls, [], 'the hunt waits until the scene itself ends');
});

test('developer LIVE can still play directly before ordinary feed story prerequisites', () => {
  const { cam } = feed({ ready: false });
  cam.runLive();
  assert.ok(cam.scene, 'the explicit developer event bypasses automatic timing');
  assert.equal(cam.liveRunning, true);
});

function delayedClips() {
  const { cam } = feed();
  const pending = new Map();
  cam.loadClip = id => new Promise(resolve => pending.set(id, resolve));
  const clip = id => ({ texture: { id }, meta: { frames: 2, fps: 1, w: 1, h: 1, cols: 2 }, img: {}, g: { drawImage() {} }, canvas: {} });
  const material = { emissiveMap: null, update() {} };
  return { cam, pending, clip, material };
}

test('leaving a clip while it loads cannot resume it after the player has left', async () => {
  const { cam, pending, clip, material } = delayedClips();
  const loading = cam.playClip('old', material);
  cam.stopLive();
  pending.get('old')(clip('old')); await loading;
  assert.equal(cam.clip, null);
  assert.equal(material.emissiveMap, null, 'the cancelled load does not replace the current texture');
});

test('the latest selected clip wins even when the previous clip finishes loading last', async () => {
  const { cam, pending, clip, material } = delayedClips();
  const old = cam.playClip('old', material), next = cam.playClip('next', material);
  pending.get('next')(clip('next')); await next;
  const selected = cam.clip;
  pending.get('old')(clip('old')); await old;
  assert.equal(cam.clip, selected);
  assert.equal(material.emissiveMap.id, 'next');
});

test('switching to LIVE cancels a pending clip and preserves the infrared texture', async () => {
  const { cam, pending, clip, material } = delayedClips();
  cam.ir = { id: 'infrared' };
  const loading = cam.playClip('old', material);
  cam.startLive(material, () => false);
  const live = cam.live;
  pending.get('old')(clip('old')); await loading;
  assert.equal(cam.clip, null);
  assert.equal(cam.live, live);
  assert.equal(material.emissiveMap, cam.ir);
});

test('lowering the phone stops an already playing clip instead of uploading hidden frames', () => {
  const { cam, clip } = delayedClips();
  cam.clip = { c: clip('playing'), t: 0, frame: -1 };
  cam.stopLive();
  assert.equal(cam.clip, null);
  cam.update(DT);
});

test('LIVE: he is drawn for the home camera alone, leaves its frame where nothing else could see him, and the story waits for it', () => {
  const walk = new WalkGrid(COLLISION), nav = new NavGrid(walk, SIGHT);
  const end = LIVE_EXIT[LIVE_EXIT.length - 1];
  assert.equal(inFrame(...end), false, 'his walk ends out of the frame');
  assert.equal(seenFromCorridor(nav, walk, ...end), false, 'where nobody in the corridor could see him');
  assert.equal(seenFromCorridor(nav, walk, 10.4, 3.3), true, 'the check would catch the old end, in the corridor');
  assert.equal(inFrame(...LIVE_WALK[LIVE_WALK.length - 1]), true, 'under the lens he is on the feed');
  const { cam, calls, man } = feed();
  const inBedroom = { v: false };
  cam.live = { t: 0, videoMat: {}, inBedroom: () => inBedroom.v, dead: false };
  assert.equal(cam.liveRunning, false, 'LIVE opened, nothing yet');
  let onlyCamera = true, sawCameraOnly = false, t = 0;
  for (; t < 40 && calls.length === 0; t += DT) {
    cam.update(DT);
    if (cam.scene) {
      assert.equal(cam.liveRunning, true, `the story's fallback is held (${t.toFixed(1)} s)`);
      if (man.visible && !man.cameraOnly) onlyCamera = false;
      sawCameraOnly ||= man.cameraOnly;
    }
  }
  assert.ok(sawCameraOnly && onlyCamera, 'whenever he is shown in the scene, it is for the home camera alone');
  assert.deepEqual(calls, ['live'], 'the scene ends in the hunt');
  assert.equal(man.cameraOnly, false, 'and gives his body back to every camera');
  assert.equal(man.visible, false);
  assert.ok(Math.hypot(man.pos.x - end[0], man.pos.z - end[1]) < 0.1, 'at the hidden end of his walk');
  assert.equal(cam.liveRunning, false);
  assert.equal(cam.live.dead, true, 'the feed is lost');
});

test('LIVE: a hunt that starts during the scene (a call, the front door) ends it at once and gives his body back', () => {
  const { cam, story, man } = feed();
  cam.live = { t: 0, videoMat: {}, inBedroom: () => false, dead: false };
  for (let t = 0; t < 8; t += DT) cam.update(DT);
  assert.ok(cam.scene && man.cameraOnly && man.visible, 'mid-scene');
  story.huntStart('call');
  assert.equal(cam.scene, null); assert.equal(man.cameraOnly, false); assert.equal(man.visible, false);
  assert.equal(cam.liveRunning, false);
  assert.equal(cam.entity.camera.enabled, false);
});

test('build 0.15: his footsteps are heard when he is near (no light of his own gives him away)', () => {
  const n = night({ at: [8.0, 3.55] });
  n.hunt.start({ tutorial: false, from: 'fusebox' });
  n.run(12);
  const steps = n.played.filter(p => p.key === 'step_floor');
  assert.ok(steps.length >= 6, `a footfall every stride (${steps.length})`);
  for (const p of steps) {
    const d = Math.hypot(p.at[0] - n.player.pos.x, p.at[2] - n.player.pos.z);
    assert.ok(p.gain >= STEPS.walkGain, 'heavy bare feet, at least the walk level');
    if (d < STEPS.near) assert.equal(p.min, STEPS.min, `within ${STEPS.near} m never quieter than ${STEPS.min} (${d.toFixed(1)} m)`);
  }
  assert.ok(steps.every(p => p.rate[1] < 0.9), 'slowed: a big man\'s weight');
});
