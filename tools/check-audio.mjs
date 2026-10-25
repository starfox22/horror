// The sound's loud moments without a browser: src/ambience.js + src/sound.js + src/music.js on a minimal Web Audio mock
// (nodes, connections and automation; no samples), the real walk and sight grids, and the story's own glassBreaks().
//  - The glass is loud wherever the player is: the level its shatter reaches the ear at (dry, through every gain, the
//    panner's distance roll-off, the corner filters, the master and the limiter) is near full scale in the bedroom and
//    no more than 6 dB lower in the corridor, the kitchen and the far end of the living room, in the shatter's own band
//    (6 kHz) as well as at 1 kHz; nothing is placed inside the listener's head.
//  - The master chain ends in a safety limiter that nothing bypasses, and its ceiling stays under 0 dBFS.
//  - A scare (bank.scare, music.sting, the glass) ducks the beds by ~10 dB for about a second, not itself.
//  - The volume sliders still act on master, effects (and their echo), ambience and music (and the scare path).
// node --test tools/check-audio.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WalkGrid } from '../src/walkgrid.js';
import { NavGrid } from '../src/navgrid.js';

// --- a Web Audio mock: a graph of nodes and AudioParams whose automation can be read at any time ----------------------
class Param {
  constructor(v) { this.v = v; this.events = []; }
  get value() { return this.v; }
  set value(v) { this.v = v; }
  setValueAtTime(v, t) { this.events.push({ type: 'set', v, t }); return this; }
  linearRampToValueAtTime(v, t) { this.events.push({ type: 'set', v, t }); return this; }       // (read once reached)
  exponentialRampToValueAtTime(v, t) { this.events.push({ type: 'set', v, t }); return this; }
  setTargetAtTime(v, t, tc) { this.events.push({ type: 'target', v, t, tc }); return this; }
  cancelScheduledValues(t) { this.events = this.events.filter(e => e.t < t); return this; }
  // The value at time t (set and setTarget chains exactly; ramps as their end value once reached).
  at(t) {
    const ev = this.events.map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
    let v = this.v, from = 0, target = null;
    const advance = (to) => { if (target && to > from) v = target.v + (v - target.v) * Math.exp(-(to - from) / target.tc); from = Math.max(from, to); };
    for (const e of ev) {
      if (e.t > t) break;
      advance(e.t);
      if (e.type === 'set') { v = e.v; target = null; } else target = e;
    }
    advance(t);
    return v;
  }
}
class Node {
  constructor(ctx, kind, props) { this.ctx = ctx; this.kind = kind; this.outs = new Set(); Object.assign(this, props); ctx.nodes.push(this); }
  connect(dest) { this.outs.add(dest); return dest; }
  disconnect() { this.outs.clear(); }
}
class MockContext {
  constructor() {
    this.currentTime = 0; this.sampleRate = 48000; this.nodes = []; this.sources = [];
    this.destination = new Node(this, 'destination', {});
    const P = (v) => new Param(v);
    this.listener = { positionX: P(0), positionY: P(0), positionZ: P(0), forwardX: P(0), forwardY: P(0), forwardZ: P(-1), upX: P(0), upY: P(1), upZ: P(0) };
  }
  createGain() { return new Node(this, 'gain', { gain: new Param(1) }); }
  createBiquadFilter() { return new Node(this, 'biquad', { type: 'lowpass', frequency: new Param(350), Q: new Param(1), gain: new Param(0) }); }
  createPanner() {
    return new Node(this, 'panner', { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1, maxDistance: 10000,
      positionX: new Param(0), positionY: new Param(0), positionZ: new Param(0) });
  }
  createConvolver() { return new Node(this, 'convolver', { buffer: null, normalize: true }); }
  createDynamicsCompressor() {
    return new Node(this, 'compressor', { threshold: new Param(-24), knee: new Param(30), ratio: new Param(12), attack: new Param(0.003), release: new Param(0.25) });
  }
  createBufferSource() {
    const n = new Node(this, 'source', { buffer: null, playbackRate: new Param(1), onended: null });
    n.start = (t = 0) => { n.startedAt = t; this.sources.push(n); };
    n.stop = () => {};
    return n;
  }
  createOscillator() { const n = new Node(this, 'oscillator', { type: 'sine', frequency: new Param(440) }); n.start = n.stop = () => {}; return n; }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c) => data[c] };
  }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}
globalThis.AudioContext = MockContext;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Ambience, LIMITER } = await import('../src/ambience.js');
const { SoundBank } = await import('../src/sound.js');
const { Music } = await import('../src/music.js');
const { Story } = await import('../src/story.js');
const { GLASS_SPOT } = await import('../src/falling-glass.js');

const nav = new NavGrid(new WalkGrid(JSON.parse(readFileSync('public/assets/apartment/collision.json', 'utf8'))),
  JSON.parse(readFileSync('public/assets/apartment/sight.json', 'utf8')));
const manifest = JSON.parse(readFileSync('public/assets/audio/sfx.json', 'utf8'));
const recordings = JSON.parse(readFileSync('tools/audio/sounds.json', 'utf8'));
const SETTINGS = { master: 0.9, sfx: 1, ambience: 0.9, music: 0.8 };      // menu.js defaults
// Where the player hears the glass from: the bedroom; the corridor; the kitchen at the fridge (where they are when it
// breaks, 3 s after shutting it); the far end of the living room (23 m of open space away).
const SPOTS = { bedroom: [11.2, 0.5], corridor: [7.6, 3.55], kitchen: [1.4, 0.2], living: [-6.0, -0.8] };
const EAR = 1.62;

function rig() {
  const amb = new Ambience();
  const bank = new SoundBank(amb);
  clearInterval(bank._timer);
  bank.manifest = manifest;
  for (const [key, e] of Object.entries(manifest)) bank.buffers.set(key, { duration: e.duration, key });
  bank.nav = nav;
  bank.setVolume('sfx', SETTINGS.sfx); bank.setVolume('amb', SETTINGS.ambience); bank.setVolume('music', SETTINGS.music); bank.setVolume('ui', 0.7);
  amb.volume = SETTINGS.master; amb.start();
  amb.ctx.currentTime = 10;                     // every fade-in settled
  return { amb, bank, ctx: amb.ctx, music: new Music(bank) };
}
// The player standing at [x, z] (the listener glides there in a few frames: let it settle).
const listen = ({ amb, bank, ctx }, [x, z], yaw = 0) => {
  const p = { x, y: EAR, z }, a = yaw * Math.PI / 180;
  amb.listen(p, { x: -Math.sin(a), y: 0, z: -Math.cos(a) }, { x: 0, y: 1, z: 0 });
  bank.listen(p);
  ctx.currentTime += 1;
};

// |H(f)| of a BiquadFilterNode (Web Audio spec formulas: lowpass Q in dB, shelves with S = 1).
function biquadMag(n, f, t, fs = 48000) {
  const w = 2 * Math.PI * n.frequency.at(t) / fs, cw = Math.cos(w), sw = Math.sin(w);
  let b, a;
  if (n.type === 'lowpass' || n.type === 'highpass') {
    const al = sw / (2 * 10 ** (n.Q.at(t) / 20)), lp = n.type === 'lowpass';
    b = lp ? [(1 - cw) / 2, 1 - cw, (1 - cw) / 2] : [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2];
    a = [1 + al, -2 * cw, 1 - al];
  } else if (n.type === 'highshelf' || n.type === 'lowshelf') {
    const A = 10 ** (n.gain.at(t) / 40), al = sw / Math.SQRT2, s = n.type === 'highshelf' ? 1 : -1, r = 2 * Math.sqrt(A) * al;
    b = [A * ((A + 1) + s * (A - 1) * cw + r), -2 * s * A * ((A - 1) + s * (A + 1) * cw), A * ((A + 1) + s * (A - 1) * cw - r)];
    a = [(A + 1) - s * (A - 1) * cw + r, 2 * s * ((A - 1) - s * (A + 1) * cw), (A + 1) - s * (A - 1) * cw - r];
  } else if (n.type === 'bandpass') {
    const al = sw / (2 * n.Q.at(t));
    b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al];
  } else return 1;
  const W = 2 * Math.PI * f / fs, re = (c) => c[0] + c[1] * Math.cos(W) + c[2] * Math.cos(2 * W), im = (c) => -(c[1] * Math.sin(W) + c[2] * Math.sin(2 * W));
  return Math.hypot(re(b), im(b)) / Math.hypot(re(a), im(a));
}
// The panner's distance gain (inverse model, distance clamped to [ref, max]) for the listener's position at t.
function pannerGain(n, ctx, t) {
  const L = ctx.listener, d = Math.hypot(n.positionX.at(t) - L.positionX.at(t), n.positionY.at(t) - L.positionY.at(t), n.positionZ.at(t) - L.positionZ.at(t));
  const ref = n.refDistance, dd = Math.min(Math.max(d, ref), n.maxDistance);
  return ref / (ref + n.rolloffFactor * (dd - ref));
}
// Every dry way (no reverb) from `node` to the destination: [{ gain (linear, at f; the limiter counts as 1), via }].
function dryWays(node, ctx, f, t, via = []) {
  if (node.kind === 'destination') return [{ gain: 1, via }];
  if (node.kind === 'convolver' || !(node instanceof Node)) return [];
  const k = node.kind === 'gain' ? node.gain.at(t) : node.kind === 'biquad' ? biquadMag(node, f, t) : node.kind === 'panner' ? pannerGain(node, ctx, t) : 1;
  return [...node.outs].flatMap(next => dryWays(next, ctx, f, t, [...via, node]).map(w => ({ gain: k * w.gain, via: w.via })));
}
// Every way from `node` to `target` (any node, the reverb included), as lists of nodes.
function ways(node, target, via = []) {
  if (node === target) return [[...via, node]];
  if (!(node instanceof Node) || via.includes(node)) return [];
  return [...node.outs].flatMap(next => ways(next, target, [...via, node]));
}
const dB = (g) => 20 * Math.log10(g);
// The limiter's static curve (Web Audio spec, knee 0) with its make-up, then the trim after it: dBFS out for dBFS in.
function limiterOut(amb, inDb) {
  const L = amb.limiter, T = L.threshold.value, R = L.ratio.value;
  const curve = (x) => (x < T ? x : T + (x - T) / R);
  const makeup = -0.6 * curve(0);
  return curve(inDb) + makeup + dB(amb.trim.gain.value);
}
// The level (dBFS) a recording peaking at `peak` reaches the ear at, dry, at frequency f: before and after the limiter.
function earLevel({ amb, ctx }, source, f, peak) {
  const t = ctx.currentTime + 0.01, ways = dryWays(source, ctx, f, t);
  assert.ok(ways.length, 'the sound reaches the ear');
  // the trim after the limiter is part of limiterOut(); take it out of the way's gain
  const pre = ways.reduce((s, w) => s + w.gain, 0) / amb.trim.gain.at(t);
  const inDb = peak + dB(pre);
  return { pre: inDb, out: limiterOut(amb, inDb) };
}
const lastSource = (ctx, key) => ctx.sources.filter(s => s.buffer?.key === key).pop();

// The story's glass for a player at `spot` (story.glassBreaks(): its own options, near or far).
function glassAt(spot) {
  const r = rig();
  listen(r, spot);
  const camera = { getPosition: () => ({ x: spot[0], y: EAR, z: spot[1] }), forward: { x: 0, y: 0, z: -1 } };
  const story = new Story({ camera, player: { pos: { x: spot[0], z: spot[1] } }, bank: r.bank, thought: { say() {} } });
  story.glassBreaks();
  const src = lastSource(r.ctx, 'glass_break');
  assert.ok(src, 'glassBreaks() plays glass_break');
  const peak = recordings.glass_break.peak ?? -1;
  const pan = [...src.outs].flatMap(function walk(n) { return n.kind === 'panner' ? [n] : n.kind === 'destination' ? [] : [...n.outs].flatMap(walk); })[0];
  const placed = Math.hypot(pan.positionX.value - spot[0], pan.positionZ.value - spot[1]);
  return { ...r, src, low: earLevel(r, src, 1000, peak), high: earLevel(r, src, 6000, peak), placed, path: nav.heardFrom({ x: GLASS_SPOT[0], z: GLASS_SPOT[2] }, { x: spot[0], z: spot[1] }).distance };
}

test('the glass is near full scale in the bedroom and no more than 6 dB lower anywhere in the flat', (t) => {
  const at = Object.fromEntries(Object.entries(SPOTS).map(([name, spot]) => [name, glassAt(spot)]));
  for (const [name, g] of Object.entries(at)) {
    t.diagnostic(`${name.padEnd(8)} path ${g.path.toFixed(1)} m, placed ${g.placed.toFixed(1)} m: 1 kHz ${g.low.pre.toFixed(1)} -> ${g.low.out.toFixed(1)} dBFS, 6 kHz ${g.high.pre.toFixed(1)} -> ${g.high.out.toFixed(1)} dBFS`);
    clearInterval(g.bank._timer);
  }
  const bed = at.bedroom;
  assert.ok(bed.low.pre >= -2, `bedroom: the shatter reaches the limiter (${bed.low.pre.toFixed(1)} dBFS before it)`);
  assert.ok(bed.low.out >= -2.5 && bed.high.out >= -2.5, `bedroom: near full scale (${bed.low.out.toFixed(1)} / ${bed.high.out.toFixed(1)} dBFS)`);
  for (const name of ['corridor', 'kitchen', 'living']) {
    const g = at[name];
    for (const band of ['low', 'high']) {
      const drop = bed[band].out - g[band].out;
      assert.ok(drop <= 6, `${name}: ${band === 'low' ? '1 kHz' : '6 kHz'} ${drop.toFixed(1)} dB below the bedroom (at most 6)`);
      assert.ok(drop >= -1, `${name}: not louder than in the bedroom (${(-drop).toFixed(1)} dB over)`);
    }
    assert.ok(g.placed >= g.path * 0.5, `${name}: heard from ${g.placed.toFixed(1)} m away along a ${g.path.toFixed(1)} m way (not inside the head)`);
  }
});

test('the master chain ends in a safety limiter that nothing bypasses, with its ceiling under 0 dBFS', () => {
  const r = rig(), { amb, ctx } = r;
  const lim = amb.limiter;
  assert.equal(lim.kind, 'compressor');
  assert.ok(lim.threshold.value <= -1 && lim.threshold.value >= -3, 'threshold about -2 dBFS');
  assert.equal(lim.knee.value, 0); assert.ok(lim.ratio.value >= 12, 'ratio 12 or more');
  assert.ok(lim.attack.value <= 0.003, 'attack 3 ms or less'); assert.ok(lim.release.value >= 0.05 && lim.release.value <= 0.3, 'release 50-300 ms');
  assert.deepEqual({ ...LIMITER }, { threshold: lim.threshold.value, knee: lim.knee.value, ratio: lim.ratio.value, attack: lim.attack.value, release: lim.release.value });
  // Into the destination: only the trim after the limiter, and it only from the limiter.
  const into = (n) => ctx.nodes.filter(m => m.outs.has(n));
  assert.deepEqual(into(ctx.destination), [amb.trim]);
  assert.deepEqual(into(amb.trim), [lim]);
  assert.ok(amb.trim.gain.value <= 1, 'nothing gains after the limiter');
  // Every way from any node to the destination passes through the limiter.
  const bypass = ctx.nodes.filter(n => n !== amb.trim && n !== lim && n.outs.has(ctx.destination));
  assert.deepEqual(bypass, []);
  for (const inDb of [-1, 0, 6, 12, 20]) assert.ok(limiterOut(amb, inDb) < 0, `${inDb} dBFS in stays under 0 dBFS out (${limiterOut(amb, inDb).toFixed(2)})`);
  // Quiet sounds (the beds) keep the level the old default compressor's +3.66 dB make-up gave them (within 0.5 dB).
  const quiet = -30, out = limiterOut(amb, quiet + dB(amb.makeup.gain.value));
  assert.ok(Math.abs(out - quiet - 3.66) < 0.5, `quiet sounds come out ${(out - quiet).toFixed(2)} dB up`);
});

test('a scare ducks the beds by about 10 dB for about a second, never itself', () => {
  const r = rig(), { bank, ctx, music } = r;
  const t0 = ctx.currentTime;
  const h = bank.scare('sting_scare');
  assert.ok(h, 'bank.scare plays');
  const src = lastSource(ctx, 'sting_scare');
  const ways = dryWays(src, ctx, 1000, t0 + 0.3);
  assert.ok(ways.every(w => w.via.includes(bank.buses.scare)), 'on the scare path');
  assert.ok(ways.every(w => !Object.values(bank.beds).some(b => w.via.includes(b))), 'not through a ducked bed gain');
  assert.equal(h.gain.gain.value, 1, 'at full level');
  for (const bus of ['amb', 'music']) {
    for (const g of [bank.beds[bus], bank.bedSends[bus]]) {
      const at = (s) => dB(g.gain.at(t0 + s));
      assert.ok(at(0.15) <= -8.5 && at(0.15) >= -11, `${bus} beds at ${at(0.15).toFixed(1)} dB 0.15 s in`);
      assert.ok(at(0.95) <= -8.5, `${bus} beds still down at 0.95 s (${at(0.95).toFixed(1)} dB)`);
      assert.ok(at(3) >= -1, `${bus} beds back by 3 s (${at(3).toFixed(1)} dB)`);
    }
  }
  assert.equal(bank.buses.scare.gain.at(t0 + 0.3), bank.buses.music.gain.at(t0 + 0.3), 'the scare path follows the music volume, undimmed');
  // A bed (a loop) goes through its bus's bed gain; a one-shot does not.
  const loop = bank.loop('rain_outside', { gain: 0.2 });
  assert.ok(loop.gain.outs.has(bank.beds.amb));
  loop.stop(0);
  // music.sting keeps working, through the scare path, and ducks too; so does the glass (SCARES).
  ctx.currentTime += 10;
  for (const kind of ['scare', 'hit', 'chase', 'low']) {
    const t1 = ctx.currentTime;
    music.sting(kind);
    const s = ctx.sources[ctx.sources.length - 1];
    assert.ok(dryWays(s, ctx, 1000, t1).every(w => w.via.includes(bank.buses.scare)), `sting ${kind} on the scare path`);
    assert.ok(dB(bank.beds.amb.gain.at(t1 + 0.2)) <= -5.5, `sting ${kind} ducks the beds`);
    ctx.currentTime += 10;
  }
  listen(r, SPOTS.kitchen);
  const t2 = ctx.currentTime;
  bank.play('glass_break', { at: GLASS_SPOT });
  assert.ok(dB(bank.beds.amb.gain.at(t2 + 0.2)) <= -8.5, 'the glass ducks the beds');
  clearInterval(bank._timer);
});

test('the volume sliders act on master, effects (and their echo), ambience, music and the scare path', () => {
  const r = rig(), { amb, bank, ctx } = r;
  const t = () => ctx.currentTime + 2;
  bank.setVolume('sfx', 0.5);
  assert.ok(Math.abs(bank.buses.sfx.gain.at(t()) - 0.5) < 1e-3 && Math.abs(bank.sends.sfx.gain.at(t()) - 0.5) < 1e-3);
  bank.setVolume('amb', 0.25);
  assert.ok(Math.abs(bank.buses.amb.gain.at(t()) - 0.25) < 1e-3 && Math.abs(bank.sends.amb.gain.at(t()) - 0.25) < 1e-3);
  bank.setVolume('music', 0.3);
  for (const b of ['music', 'scare']) assert.ok(Math.abs(bank.buses[b].gain.at(t()) - 0.3) < 1e-3 && Math.abs(bank.sends[b].gain.at(t()) - 0.3) < 1e-3, b);
  amb.volume = 0.4;
  assert.ok(Math.abs(amb.master.gain.at(t()) - 0.4) < 1e-3, 'master');
  // A one-shot's echo goes through its bus's send (so the slider takes it too), a bed's through its bus's bed send.
  listen(r, SPOTS.corridor);
  bank.play('door_slam', { at: [9.9, 1, 1.5] });
  const s = lastSource(ctx, 'door_slam'), echo = ways(s, amb.reverb);
  assert.ok(echo.length && echo.every(w => w.includes(bank.sends.sfx)), 'the echo goes through the effects send');
  assert.ok(dryWays(s, ctx, 1000, t()).every(w => w.via.includes(bank.buses.sfx) && w.via.includes(amb.master)), 'effects bus, then master');
  const bed = bank.loop('rain_window', { at: [4.5, 1.6, -1.4], send: 0.12 });
  assert.ok(ways(bed.gain, amb.reverb).every(w => w.includes(bank.bedSends.amb) && w.includes(bank.sends.amb)), 'a bed\'s echo: bed send, then the ambience send');
  bed.stop(0);
  clearInterval(bank._timer);
});
