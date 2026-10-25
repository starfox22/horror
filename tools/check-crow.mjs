// The crow at the window (src/crow.js, docs/STORY.md beat 5) without a browser: when he comes (near a window, looking
// at it for half a second, not running; once a night, before the man has been seen, never within 25 s of another scare
// or while one is due), where (the light the player looks at, at eye height, never one behind a curtain or a blind),
// what he does (the thud on the scare path, the caws, his wings below, the lightning, the thoughts; the developer menu's
// strike anywhere), and that no vertex of him ever comes through the glass, or onto the bars and the wall around it:
// the built model (public/assets/props/crow.glb) skinned on the CPU along whole strikes at every window, reared up as
// he meets the glass.
// node --test tools/check-crow.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mat4, Vec3 } from 'playcanvas';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Crow, WINDOWS, RULES, CROW_FIT, FLARE, reachAt, lookedAt, nearestWindow, strikePoint, outside, onGlass, seenLights } from '../src/crow.js';
import { STORY_EVENTS } from '../src/story-events.js';
import { skinner, measure, CONTACT, REACH_STEP } from './crow/build.mjs';

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
  // Looking at the gathered curtain between the living room's windows, or the office's blind, is not looking out.
  assert.equal(lookedAt(new Vec3(-5.4, 1.85, -0.3), new Vec3(-0.87, 0.5, 0).normalize()), null, 'the blind over the living room\'s first window');
  assert.equal(lookedAt(new Vec3(5.6, 1.85, -0.2), new Vec3(0, 0.25, -0.97).normalize()), null, 'the blind');
  assert.equal(lookedAt(new Vec3(-5.2, 1.85, 1.6), new Vec3(-1, 0, 0))?.window, win('living room'), 'over the sofa, at the clear glass');
});

test('he strikes the light nearest where the player looks, at eye height ±0.2 m, in its middle: never behind a curtain or a blind', () => {
  const r = seeded(3);
  for (const w of WINDOWS) for (let i = 0; i < 60; i++) {
    const along = w.span[0] + r() * (w.span[1] - w.span[0]), eyeY = 1.6 + r() * 0.35, jitter = r();
    const p = strikePoint(w, along, eyeY, () => jitter), aim = eyeY + (jitter * 2 - 1) * 0.2;
    const light = seenLights(w).find(([a0, a1, y0, y1]) => p.along >= a0 + 0.099 && p.along <= a1 - 0.099 && p.y >= y0 + 0.099 && p.y <= y1 - 0.099);
    assert.ok(light && onGlass(w, p.along, p.y), `${w.id}: (${p.along.toFixed(2)}, ${p.y.toFixed(2)}) in the middle of a light that can be seen`);
    // The nearest such point to where the view met the window, at eye height give or take 0.2 m.
    const ideal = Math.min(...seenLights(w).map(([a0, a1, y0, y1]) => Math.hypot(along - clampTo(along, [a0 + 0.1, a1 - 0.1]), aim - clampTo(aim, [y0 + 0.1, y1 - 0.1]))));
    assert.ok(Math.abs(Math.hypot(p.along - along, p.y - aim) - ideal) < 1e-9, `${w.id}: (${p.along.toFixed(2)}, ${p.y.toFixed(2)}) for a look at (${along.toFixed(2)}, ${aim.toFixed(2)})`);
  }
  // Where the windows let him come at eye height: the living room's two clear lights by the sofa, the bedroom's middle.
  for (const [w, along] of [[win('living room'), 1.6], [win('bedroom'), 11.5], [win('office'), 4.3]]) {
    const p = strikePoint(w, along, 1.85, () => 0.5);
    assert.ok(Math.abs(p.y - 1.85) < 0.06, `${w.id}: at eye height (${p.y.toFixed(2)})`);
  }
  // The kitchen's blind is down to 1.55 m: he dives for the glass under it, behind the tap.
  assert.ok(strikePoint(win('kitchen'), -2.3, 1.85, () => 0.5).y < 1.3);
  // The bars and the living room's wall columns are not glass.
  assert.equal(onGlass(win('living room'), 0.2, 1.5), false);
  assert.equal(onGlass(win('living room'), -0.32, 1.5), false);
  assert.equal(onGlass(win('kitchen'), -1.75, 1.345), false);
  assert.equal(onGlass(win('kitchen'), -1.75, 1.5), true);
});
const clampTo = (v, [a, b]) => Math.min(b, Math.max(a, v));

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
    'the man has been seen (a false scare comes before him)': s => { s.flags.add('silhouette'); },
    'the man seen, the power back': s => { s.flags.add('silhouette'); s.flags.add('fusebox-opened'); s.flags.add('restored'); },
    'the cut is due': s => { s.story.timers.push({ id: 'cut', at: s.story.time + 4 }); },
    'the glass is due (the fridge left open after the drink)': s => { s.story.timers.push({ id: 'drink-fallback', at: s.story.time + 12 }); },
    'the glass is due (6:00, no drink)': s => { s.story.timers.push({ id: 'glass-late', at: s.story.time + 20 }); },
    'the creaks upstairs are due': s => { s.story.timers.push({ id: 'upstairs', at: s.story.time + 9 }); },
    'the front door handle is due': s => { s.story.timers.push({ id: 'handle', at: s.story.time + 20 }); },
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
  // A scary timer far off does not hold him back (the glass at 6:00 is minutes away at the start); the glass broken, a
  // drink is no reason either; nor is the fuse box, once the power is back and the man was never seen.
  const s = setup();
  s.story.timers.push({ id: 'cut-fallback', at: s.story.time + 90 }, { id: 'glass-late', at: s.story.time + 300 }, { id: 'nudge-water', at: s.story.time + 2 });
  s.story.sys.fridge.hasDrunk = true; s.flags.add('glass');
  s.step(1);
  assert.ok(s.crow.flight);
  const r = setup();
  r.flags.add('fusebox-opened'); r.flags.add('restored');
  r.step(1);
  assert.ok(r.crow.flight, 'the power back without the man seen');
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
  assert.equal(CROW_FIT.reach.length, 180 / REACH_STEP + 1, 'reach: every 5 degrees, 0 to 180');
  m.Hit.reach.forEach((r, i) => assert.ok(CROW_FIT.reach[i] >= r && CROW_FIT.reach[i] - r < 0.004, `reach at ${i * REACH_STEP} degrees: ${CROW_FIT.reach[i]} in crow.js, ${r} measured`));
  assert.equal(reachAt(FLARE), CROW_FIT.reach[FLARE / REACH_STEP]);
  close(CROW_FIT.beak[0], m.Hit.beak[0], 'beak y'); close(CROW_FIT.beak[1], m.Hit.beak[1], 'beak z');
  // Reared up as he meets the glass, the tip of his beak is the foremost of him (it marks the glass: the smear's place).
  const up = FLARE * Math.PI / 180, tip = -(CROW_FIT.beak[0] * Math.sin(up) + CROW_FIT.beak[1] * Math.cos(up));
  assert.ok(reachAt(FLARE) - tip < 0.003, `at ${FLARE} degrees his beak reaches ${tip.toFixed(3)} m, his foremost point ${reachAt(FLARE)}`);
  assert.ok(m.Fast_Flying.span > 0.85 && m.Fast_Flying.span < 0.95, 'a crow\'s wingspan');
  // The main.js wiring: built, in sys, drawn during the warm-up.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /Crow\.create\(/); assert.match(main, /sys\.crow = crow/); assert.match(main, /crow\.reveal\(\)/);
});

// Between the lights, inside the run of them (not one of the living room's wall columns, gaps of 10 cm or more): the bars.
const overBars = (w, a, y) => a >= w.along[0][0] && a <= w.along.at(-1)[1] && y >= w.rows[0][0] && y <= w.rows.at(-1)[1]
  && !w.along.slice(1).some(([a0], i) => a0 - w.along[i][1] >= 0.1 && a > w.along[i][1] && a < a0);

test('no vertex of him ever comes through the glass, or onto the bars and the wall around it, at any window', (t) => {
  const M = new Mat4(), v = new Vec3(), report = [];
  for (const w of WINDOWS) for (const [k, look] of [spot(w), spot(w, { yaw: 30, back: 1.6 }), spot(w, { yaw: -25, pitch: 12, back: 2 })].entries()) {
    const s = setup({ start: look });
    s.crow.random = seeded(11 + k);
    assert.ok(s.crow.strike({ force: true }));
    const f = s.crow.flight, wallDepth = (f.w.wall - f.w.outer) * f.w.out, along = w.axis === 'x' ? 'z' : 'x';
    assert.equal(f.w, w, `${w.id} #${k}: he goes for the window looked at`);
    let nearest = Infinity, bars = Infinity, wall = Infinity;
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
        if (onGlass(w, v[along], v.y)) continue;
        if (overBars(w, v[along], v.y)) bars = Math.min(bars, d); else wall = Math.min(wall, d);
      }
    }
    assert.ok(nearest >= -1e-6, `${w.id} #${k}: ${(nearest * 1000).toFixed(1)} mm outside the glass at the closest`);
    assert.ok(nearest < 0.02, `${w.id} #${k}: he really meets it (${(nearest * 1000).toFixed(1)} mm)`);
    assert.ok(bars > w.bars + 0.005, `${w.id} #${k}: over the bars ${(bars * 100).toFixed(1)} cm out, the bars ${(w.bars * 100).toFixed(1)}`);
    assert.ok(wall > wallDepth + 0.005, `${w.id} #${k}: over the frame and the wall ${(wall * 100).toFixed(1)} cm out, the wall ${(wallDepth * 100).toFixed(1)}`);
    report.push(`${w.id} #${k}: closest ${(nearest * 1000).toFixed(1)} mm from the glass, ${(bars * 100).toFixed(1)} cm over the bars, ${(wall * 100).toFixed(1)} cm over the wall`);
  }
  t.diagnostic(report.join('; '));
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
  assert.ok(lowest >= 0.0549, `the closest feather ${(lowest * 1000).toFixed(1)} mm from the glass (clear of the bars and the wall)`);
  assert.equal(s.crow.debris.length, 0, 'all below the sill within 8 s');
  assert.ok(s.crow.smear && s.crow.smear.t > 7);
  s.step(33);
  assert.equal(s.crow.smear, null);
});
