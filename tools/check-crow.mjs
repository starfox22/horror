// The crow at the window (src/crow.js, docs/STORY.md beat 5) without a browser: when he comes (near a window, looking
// at it for half a second, not running; once a night, before the hunt, never within 25 s of another scare or while one
// is due), where (the pane the player looks at, at eye height), what he does (the thud on the scare path, the caw, his
// wings below, the lightning, the thoughts; the developer menu's strike anywhere), and that no vertex of him ever
// comes through the glass or onto the window frame: the built model (public/assets/props/crow.glb) skinned on the CPU
// along whole strikes at every window.
// node --test tools/check-crow.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mat4, Vec3 } from 'playcanvas';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Crow, WINDOWS, RULES, CROW_FIT, lookedAt, nearestWindow, strikePoint, outside } from '../src/crow.js';
import { STORY_EVENTS } from '../src/story-events.js';
import { skinner, measure, CONTACT } from './crow/build.mjs';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const win = (id) => WINDOWS.find(w => w.id === id);
// A spot 1.2 m inside a window's middle pane, the eye at 1.85 m, looking straight out (yaw, pitch in degrees).
function spot(w, { back = 1.2, along = null, yaw = 0, pitch = 0, y = 1.85 } = {}) {
  const a = along ?? (w.along[Math.floor(w.along.length / 2)][0] + w.along[Math.floor(w.along.length / 2)][1]) / 2;
  const eye = new Vec3(0, y, 0); eye[w.axis] = w.inner - w.out * back; eye[w.axis === 'x' ? 'z' : 'x'] = a;
  const out = w.axis === 'x' ? [w.out, 0] : [0, w.out];                     // straight out, in x and z
  const r = yaw * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), p = pitch * Math.PI / 180;
  const dir = new Vec3((out[0] * c - out[1] * s) * Math.cos(p), Math.sin(p), (out[0] * s + out[1] * c) * Math.cos(p));
  return { eye, dir };
}

function setup({ start = spot(win('kitchen')), keys = ['window_thud', 'crow_caw', 'wing_flap', 'door_kick'] } = {}) {
  const sounds = [], said = [], flags = new Set();
  let scared = 0;
  const story = {
    act: 1, time: 40, lastScare: -Infinity, timers: [], sighting: null, dying: false,
    sys: { events: { pending: [] }, fridge: { hasDrunk: false } },
    has: f => flags.has(f), set(f) { if (flags.has(f)) return false; flags.add(f); return true; },
    canScare() { return this.time - this.lastScare >= 25; }, scared() { scared++; this.lastScare = this.time; },
    say: (text, opts) => said.push({ text, ...opts }),
  };
  const camera = { pos: start.eye.clone(), forward: start.dir.clone().normalize(), getPosition() { return this.pos; } };
  const bank = {
    has: k => keys.includes(k),
    play: (key, opts) => { sounds.push({ key, ...opts }); return {}; },
    scare: (key, opts) => { sounds.push({ key, scare: true, ...opts }); return {}; },
  };
  const rain = { flash: { next: 30 } };
  const player = { running: false, vel: new Vec3() };
  const state = { playing: true, blocked: false };
  const crow = new Crow({ app: { on() {} }, camera, story, player, bank, rain, random: seeded(),
    isPlaying: () => state.playing, blocked: () => state.blocked });
  const step = (seconds, dt = 1 / 60) => { for (let t = 0; t < seconds - 1e-9; t += dt) { if (state.playing) story.time += dt; crow.update(dt); } };
  const look = (s) => { camera.pos.copy(s.eye); camera.forward.copy(s.dir).normalize(); };
  return { crow, story, flags, sounds, said, camera, rain, player, state, step, look, scared: () => scared };
}

test('the window being looked at: within 2.6 m, in its room, the view on its glass', () => {
  for (const w of WINDOWS) {
    const { eye, dir } = spot(w);
    assert.equal(lookedAt(eye, dir)?.window, w, `${w.id}: straight at it from 1.2 m`);
    assert.equal(lookedAt(spot(w, { back: 2.45 }).eye, dir)?.window, w, `${w.id}: from 2.45 m`);
    assert.equal(lookedAt(spot(w, { back: 2.75 }).eye, dir), null, `${w.id}: not from 2.75 m`);
    assert.equal(lookedAt(eye, dir.clone().mulScalar(-1)), null, `${w.id}: not with his back to it`);
    assert.equal(lookedAt(eye, spot(w, { yaw: 80 }).dir), null, `${w.id}: not along the wall`);
    assert.equal(lookedAt(eye, spot(w, { pitch: -70 }).dir), null, `${w.id}: not at the floor`);
  }
  // Looking at the wall beside the kitchen window (the corner by the fridge), at the office window from the bathroom
  // (a wall between), at the living room's glass from the dining table 3 m away.
  assert.equal(lookedAt(spot(win('kitchen'), { along: 0.6 }).eye, spot(win('kitchen')).dir), null);
  assert.equal(lookedAt(new Vec3(6.7, 1.85, -0.6), new Vec3(-0.6, 0, -0.8).normalize()), null);
  assert.equal(lookedAt(new Vec3(-3.4, 1.85, 1.5), new Vec3(-1, 0, 0)), null);
  // The kitchen tap is under the kitchen window: at the sink, looking down at it, is looking at the window.
  assert.equal(lookedAt(new Vec3(-2.6, 1.85, -0.55), new Vec3(0, -0.45, -0.89).normalize())?.window, win('kitchen'));
});

test('he strikes the pane being looked at, at eye height within 0.2 m, clear of its frame', () => {
  const r = seeded(3);
  for (const w of WINDOWS) for (let i = 0; i < 40; i++) {
    const along = w.span[0] + r() * (w.span[1] - w.span[0]), eyeY = 1.6 + r() * 0.35;
    const p = strikePoint(w, along, eyeY, r);
    const pane = w.along.find(([a0, a1]) => p.along >= a0 + 0.149 && p.along <= a1 - 0.149), row = w.rows.find(([y0, y1]) => p.y >= y0 + 0.119 && p.y <= y1 - 0.119);
    assert.ok(pane && row, `${w.id}: (${p.along.toFixed(2)}, ${p.y.toFixed(2)}) on glass`);
    // At eye height, unless a transom is there (then the nearest glass, within a few centimetres more).
    assert.ok(Math.abs(p.y - eyeY) <= 0.2 + (w.rows.length > 1 ? 0.35 : 1e-9), `${w.id}: height ${p.y.toFixed(2)} for an eye at ${eyeY.toFixed(2)}`);
  }
});

test('he comes after half a second of looking, once a night, with the thud, the caw, his wings, the lightning, the thoughts', () => {
  const s = setup();
  s.step(0.4);
  assert.equal(s.crow.flight, null, 'not before half a second of looking');
  s.step(0.15);
  assert.ok(s.crow.flight, 'he comes');
  assert.equal(s.flags.has('crow'), true);
  assert.equal(s.scared(), 1, 'a scare: the next waits 25 s');
  assert.equal(s.crow.flight.w, win('kitchen'));
  const T = s.crow.flight.T;
  assert.ok(T > 0.55 && T < 0.8, `out of the dark in ${T.toFixed(2)} s`);
  assert.equal(s.sounds.length, 0, 'silent on the way in');
  s.step(T + 0.05);
  const thud = s.sounds.find(x => x.key === 'window_thud');
  assert.ok(thud?.scare, 'the thud, on the scare path');
  assert.ok(Math.abs(thud.at[2] - win('kitchen').outer) < 1e-6 && thud.occlude === false, 'at the pane, straight to the ear');
  s.step(0.4);
  assert.ok(s.sounds.some(x => x.key === 'crow_caw'), 'the caw as he drops away');
  s.step(0.75);
  assert.ok(s.sounds.some(x => x.key === 'wing_flap'), 'his wings below');
  assert.equal(s.rain.flash.next, 0, 'lightning a moment later');
  assert.deepEqual(s.said.map(x => x.text), ['Jesus.', '...Just a bird.']);
  s.step(3);
  assert.equal(s.crow.flight, null, 'gone below the sill');
  assert.equal(s.sounds.filter(x => x.key === 'crow_caw').length, 3, 'two as he drops, a last one far off');
  assert.equal(s.sounds.filter(x => x.key === 'wing_flap').length, 2);
  assert.ok(s.sounds.filter(x => x.key !== 'window_thud').every(x => x.segment !== undefined && !x.scare), 'one take at a time, not on the scare path');
  // Never again tonight, wherever the player looks.
  s.step(60);
  assert.equal(s.flags.has('crow'), true);
  assert.equal(s.crow.flight, null);
  assert.equal(s.scared(), 1);
  // The smear is washed away in 40 s.
  assert.equal(s.crow.smear, null);
});

test('he does not come when the night is not ready for him', () => {
  const cases = {
    'too early (waking is the first jolt)': s => { s.story.time = RULES.start - 5; },
    'within 25 s of another scare': s => { s.story.lastScare = s.story.time - 10; },
    'the hunt': s => { s.flags.add('hunt'); },
    'the night over': s => { s.flags.add('ended'); },
    'before the night': s => { s.story.act = 0; },
    'already tonight': s => { s.flags.add('crow'); },
    'running': s => { s.player.running = true; },
    'moving fast': s => { s.player.vel.set(2.1, 0, 0); },
    'busy (drinking, reading, the phone up)': s => { s.state.blocked = true; },
    'paused': s => { s.state.playing = false; },
    'the cut is due': s => { s.story.timers.push({ id: 'cut', at: s.story.time + 4 }); },
    'a story event counting down': s => { s.story.sys.events.pending.push({ event: { id: 'falling-glass' }, left: 2 }); },
    'drunk, the fridge still open (the glass breaks when it shuts)': s => { s.story.sys.fridge.hasDrunk = true; },
    'the fuse box open, the figure due': s => { s.flags.add('fusebox-opened'); },
    'the figure running': s => { s.story.sighting = { t: 0 }; },
  };
  for (const [name, arrange] of Object.entries(cases)) {
    const s = setup();
    arrange(s);
    s.step(3);
    assert.equal(s.crow.flight, null, name);
    assert.equal(s.scared(), 0, name);
  }
  // A scary timer far off does not hold him back; the glass broken, a drink is no reason either.
  const s = setup();
  s.story.timers.push({ id: 'cut-fallback', at: s.story.time + 90 });
  s.story.sys.fridge.hasDrunk = true; s.flags.add('glass');
  s.step(1);
  assert.ok(s.crow.flight);
});

test('a glance is not a look: turning away resets it; walking (not running) is fine', () => {
  const s = setup();
  s.player.vel.set(1.3, 0, 0);
  s.step(0.3);
  s.look(spot(win('kitchen'), { yaw: 180 }));
  s.step(0.3);
  s.look(spot(win('kitchen')));
  s.step(0.3);
  assert.equal(s.crow.flight, null, '0.3 s + 0.3 s is not half a second');
  s.step(0.25);
  assert.ok(s.crow.flight);
});

test('the developer menu: now, at the window nearest the view, wherever the player is; not the night\'s crow', () => {
  const s = setup({ start: { eye: new Vec3(11.2, 1.7, 3.55), dir: new Vec3(0.2, 0, -1).normalize() } });   // the corridor, facing the bedroom
  s.story.act = 0; s.story.time = 0;
  assert.equal(STORY_EVENTS.find(e => e.id === 'crow').run({ story: { sys: { crow: s.crow } } }), true);
  assert.equal(s.crow.flight.w, win('bedroom'));
  assert.equal(s.flags.has('crow'), false);
  s.step(4);
  assert.ok(s.sounds.some(x => x.key === 'window_thud'));
  // From the living room looking at the sofa wall: the living room's glass; from the office desk: the office's.
  assert.equal(nearestWindow(new Vec3(-4.5, 1.8, 2.2), new Vec3(-1, 0, 0)).window, win('living room'));
  assert.equal(nearestWindow(new Vec3(4.8, 1.8, 0.3), new Vec3(0, 0, -1)).window, win('office'));
  assert.equal(typeof Crow.prototype.strike, 'function');
});

test('the recordings he needs, or the nearest the bank has', () => {
  const s = setup({ keys: ['door_kick'] });
  s.step(0.6); s.step(s.crow.flight.T + 3);
  const keys = s.sounds.map(x => x.key);
  assert.deepEqual(keys, ['door_kick'], 'the thud from the door kick, sped up; no caw or wings without their recordings');
  assert.ok(s.sounds[0].rate > 1.2 && s.sounds[0].scare);
});

test('paused, he hangs in the air; resumed, he strikes', () => {
  const s = setup();
  s.step(0.6);
  const f = s.crow.flight, at = s.crow.pos.clone();
  s.state.playing = false;
  s.step(2);
  assert.ok(s.crow.pos.equals(at) && f.time < f.T && !s.sounds.length);
  s.state.playing = true;
  s.step(f.T);
  assert.ok(s.sounds.some(x => x.key === 'window_thud'));
});

// --- never through the glass: the built model, skinned, along whole strikes ------------------------------------------
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(new URL('../public/assets/props/crow.glb', import.meta.url).pathname);
const skinned = skinner(doc), clips = Object.fromEntries(doc.getRoot().listAnimations().map(a => [a.getName(), a]));

test('CROW_FIT in src/crow.js is what the built model measures', () => {
  const m = measure(doc), close = (a, b, what) => assert.ok(Math.abs(a - b) < 0.004, `${what}: ${a} in crow.js, ${b} measured`);
  close(CROW_FIT.nose, m.Hit.contact.nose, 'nose'); close(CROW_FIT.wings, m.Hit.contact.wings, 'wings');
  close(CROW_FIT.front, m.Fast_Flying.front, 'front'); close(CROW_FIT.below, Math.max(m.Fast_Flying.below, m.Hit.below), 'below');
  close(CROW_FIT.above, m.Hit.above, 'above'); assert.equal(CROW_FIT.contact, CONTACT);
  assert.ok(m.Fast_Flying.span > 0.85 && m.Fast_Flying.span < 0.95, 'a crow\'s wingspan');
  // The main.js wiring: built, in sys, drawn during the warm-up.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /Crow\.create\(/); assert.match(main, /sys\.crow = crow/); assert.match(main, /crow\.reveal\(\)/);
});

test('no vertex of him ever comes through the glass, and his wings never onto the frame, at any window', () => {
  const M = new Mat4(), v = new Vec3();
  for (const w of WINDOWS) for (const [k, look] of [spot(w), spot(w, { yaw: 30, back: 1.6 }), spot(w, { yaw: -25, pitch: 12, back: 2 })].entries()) {
    const s = setup({ start: look });
    s.crow.random = seeded(11 + k);
    assert.ok(s.crow.strike({ force: true }));
    const f = s.crow.flight, frameDepth = (f.w.frame - f.w.outer) * f.w.out;
    assert.equal(f.w, w, `${w.id} #${k}: he goes for the window looked at`);
    let nearest = Infinity, wingNearest = Infinity, touched = false;
    for (let i = 0; s.crow.flight && i < 400; i++) {
      s.step(1 / 60);
      if (!s.crow.flight || i % 2) continue;
      const t = f.time, hitAt = f.T - CROW_FIT.contact;
      const poses = [];
      if (t < hitAt + 0.1) poses.push(['Fast_Flying', (f.phase + t * 1.7) % 0.5]);              // flying (and fading out)
      if (t >= hitAt) poses.push(['Hit', Math.min(t - hitAt, 0.87)]);                             // the glide, the hit
      M.setTRS(s.crow.pos, s.crow.rot, Vec3.ONE);
      for (const [clip, time] of poses) for (const p of skinned(clips[clip], time)) {
        M.transformPoint(v.set(p[0], p[1], p[2]), v);
        const d = outside(w, v);
        nearest = Math.min(nearest, d);
        if (Math.abs(p[0]) >= 0.1) wingNearest = Math.min(wingNearest, d);
        if (d < 0.003) touched = true;
      }
    }
    assert.ok(nearest >= -1e-6, `${w.id} #${k}: ${(nearest * 1000).toFixed(1)} mm outside the glass at the closest`);
    assert.ok(!touched || nearest >= 0, `${w.id} #${k}`);
    assert.ok(nearest < 0.02, `${w.id} #${k}: he really meets it (${(nearest * 1000).toFixed(1)} mm)`);
    assert.ok(wingNearest > frameDepth + 0.01, `${w.id} #${k}: wings ${(wingNearest * 100).toFixed(1)} cm out, the frame ${(frameDepth * 100).toFixed(1)}`);
  }
});

test('the feathers stay outside, flutter down and are gone; one stays on the glass in the smear, washed away in 40 s', () => {
  const s = setup();
  s.step(0.6); s.step(s.crow.flight.T + 0.05);
  const w = win('kitchen');
  assert.equal(s.crow.debris.length, 9);
  let lowest = Infinity;
  for (let i = 0; i < 60 * 8; i++) {
    s.step(1 / 60);
    for (const d of s.crow.debris) { lowest = Math.min(lowest, outside(w, d.p)); assert.ok(d.v.length() < 3, 'fluttering, not falling like a stone'); }
  }
  assert.ok(lowest >= 0.0119, `the closest feather ${(lowest * 1000).toFixed(1)} mm from the glass`);
  assert.equal(s.crow.debris.length, 0, 'all below the sill within 8 s');
  assert.ok(s.crow.smear && s.crow.smear.t > 7);
  s.step(33);
  assert.equal(s.crow.smear, null);
});
