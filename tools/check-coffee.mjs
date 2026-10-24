// Real timeline, device integration and audio scheduling regressions. No graphics device required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CoffeeCycle, COFFEE_TIMING, COFFEE_CUPS, COFFEE_NOZZLES, sampleCoffee } from '../src/coffee-cycle.js';
import { Devices } from '../src/devices.js';
import { Ambience } from '../src/ambience.js';

test('coffee reaches its cups only after pre-infusion and finishes below their rims', () => {
  for (let t = 0; t < COFFEE_TIMING.infusionStart; t += 0.1) {
    const s = sampleCoffee(t);
    assert.equal(s.flow, 0); assert.equal(s.fill, 0);
  }
  assert.equal(sampleCoffee(2).phase, 'Grinding beans');
  assert.equal(sampleCoffee(4).phase, 'Pre-infusing');
  assert.equal(sampleCoffee(8).phase, 'Pouring coffee');
  assert.ok(sampleCoffee(8).flow > 0.7);
  assert.ok(sampleCoffee(8).fill > sampleCoffee(6).fill);
  assert.equal(sampleCoffee(13).phase, 'Finishing');
  assert.equal(sampleCoffee(13).flow, 0);
  assert.equal(sampleCoffee(13).drip, true);
  assert.equal(sampleCoffee(14.5).phase, 'Cooling down');
  assert.equal(sampleCoffee(14.5).busy, true);
  assert.equal(sampleCoffee(COFFEE_TIMING.restartAt).busy, false);
  assert.equal(sampleCoffee(31).fill, 1);
  assert.equal(sampleCoffee(31).steam, 0);
  for (let i = 0; i < COFFEE_CUPS.length; i++) {
    const cup = COFFEE_CUPS[i], nozzle = COFFEE_NOZZLES[i];
    assert.ok(cup.full < 0.943778 - 0.005, 'liquid must stay below the authored cup rim');
    assert.ok(cup.radius <= 0.0318 - 0.001, 'full liquid disc must fit within the measured inner bowl radius');
    assert.ok(cup.bottomRadius <= 0.0225 - 0.0003, 'empty liquid disc must fit within the narrow bowl base');
    assert.ok(nozzle.y > cup.full);
    assert.ok(Math.hypot(nozzle.x - cup.x, nozzle.z - cup.z) < cup.radius, 'stream must land inside the cup');
  }
});

test('audio-clock pauses and tab-resume jumps do not desynchronize coffee visuals', () => {
  let audioTime = 0;
  const cycle = new CoffeeCycle();
  assert.equal(cycle.start(() => audioTime), true);
  cycle.update(5);
  assert.equal(cycle.state.elapsed, 0, 'suspended audio freezes the cycle');
  audioTime = 7;
  cycle.update(0.016);
  assert.equal(cycle.state.phase, 'Pouring coffee');
  audioTime = 18;
  cycle.update(0.016);
  assert.equal(cycle.state.busy, false, 'a hidden tab returns at the actual audio phase');
  assert.equal(cycle.state.flow, 0);
  assert.ok(cycle.state.steam > 0, 'steam lingers after the machine finishes');
  audioTime = 40;
  cycle.update(0.016);
  assert.equal(cycle.active, false);
  assert.equal(cycle.state.steam, 0);
});

test('silent fallback cannot leap a whole brew on one large resume delta', () => {
  const cycle = new CoffeeCycle(); cycle.start();
  cycle.update(60);
  assert.equal(cycle.state.elapsed, 0.1);
  assert.equal(cycle.state.phase, 'Heating');
  assert.equal(cycle.start(), false, 'busy cycles reject overlapping starts');
});

test('device brew rejects overlap, captures lighting twice and can replay cleanly', () => {
  const devices = Object.create(Devices.prototype);
  let time = 0, stops = 0, captures = 0, handBack = 0, created = 0;
  const effects = { resets: 0, last: null, reset() { this.resets++; }, update(s) { this.last = s; } };
  devices.createCoffeeEffects = () => { created++; return effects; };
  devices.sounds = { coffee: () => ({ elapsed: () => time, stop: () => stops++ }) };
  devices.override = () => handBack++;
  devices.onLightChange = () => captures++;
  const coffee = devices.coffee = { busy: false, cycle: new CoffeeCycle(), led: {}, glow(k) { this.level = k; } };
  assert.equal(devices.brew(coffee), true);
  assert.equal(devices.brew(coffee), false);
  time = 0.5; devices.updateCoffee(0.016);
  time = 8; devices.updateCoffee(0.016);
  assert.equal(coffee.phase, 'Pouring coffee');
  assert.ok(effects.last.fill > 0);
  time = 15.6; devices.updateCoffee(0.016);
  time = 18; devices.updateCoffee(0.016);
  assert.equal(captures, 2, 'only initial illumination and final glow-down capture probes');
  assert.equal(coffee.busy, false);
  assert.equal(coffee.level, 0);
  assert.equal(effects.last.fill, 1);
  time = 0;
  assert.equal(devices.brew(coffee), true);
  assert.equal(created, 1, 'replay reuses the graphics effects');
  assert.equal(effects.resets, 2);
  assert.equal(effects.last.fill, 0, 'fresh cups reset the previous serving');
  assert.equal(stops, 1);
  assert.equal(handBack, 2, 'only accepted starts hand the panel back from developer overrides');
});

test('coffee audio and visual timing share one clock with idempotent node cleanup', () => {
  const sources = [], events = [];
  const param = () => ({ value: 0,
    setValueAtTime(value, time) { events.push({ value, time }); },
    linearRampToValueAtTime(value, time) { events.push({ value, time }); },
    exponentialRampToValueAtTime(value, time) { events.push({ value, time }); } });
  const node = () => ({ gain: param(), frequency: param(), connect(next) { return next; }, disconnect() {},
    start(time) { this.started = time; }, stop(time) { this.stopped = time; } });
  const ctx = { currentTime: 100, createOscillator() { const n = node(); sources.push(n); return n; },
    createBufferSource() { const n = node(); sources.push(n); return n; } };
  const sounds = Object.create(Ambience.prototype);
  let cleaned = 0;
  Object.assign(sounds, { ctx, noise: {}, gain: node, filter: node, out: () => [node(), () => cleaned++] });
  const timeout = globalThis.setTimeout;
  let playback;
  globalThis.setTimeout = () => { throw new Error('coffee must not use wall-clock timers'); };
  try { playback = sounds.coffee({ x: 0, y: 0, z: 0 }); }
  finally { globalThis.setTimeout = timeout; }
  assert.ok(sources.some(n => n.started === 100 + COFFEE_TIMING.readyAt), 'ready beep uses the visual ready boundary');
  assert.ok(events.some(e => e.time === 100 + COFFEE_TIMING.pourStart));
  ctx.currentTime = 108;
  assert.equal(playback.elapsed(), 8);
  const cycle = new CoffeeCycle(); cycle.start(playback.elapsed); cycle.update(0);
  assert.equal(cycle.state.phase, 'Pouring coffee');
  playback.stop(); playback.stop();
  assert.equal(cleaned, 1);
});
