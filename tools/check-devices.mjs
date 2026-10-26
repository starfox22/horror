// Real appliance state machines and power events, with visual/audio outputs recorded.
// Run: node --test tools/check-devices.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Devices } from '../src/devices.js';
import { CoffeeCycle } from '../src/coffee-cycle.js';
import { Power } from '../src/power.js';

function devices() {
  const d = Object.create(Devices.prototype), power = new Power(), sounds = [];
  Object.assign(d, { power, lamps: [], tasks: [], app: { root: { findComponents: () => [] } },
    sounds: { chime: () => sounds.push('chime'), click() {} } });
  power.onChange(event => d.powerChanged(event));
  const step = seconds => { for (let i = 0; i < Math.ceil(seconds * 60); i++) { power.update(1 / 60); d.update(1 / 60); } };
  return { d, power, sounds, step };
}

function computer() {
  const s = devices();
  s.d.computer = { on: true, busy: false, level: 1, set(k) { this.level = k; } };
  return { ...s, pc: s.d.computer };
}

function coffee() {
  const s = devices(), effects = { reset() {}, update(state) { this.state = state; } };
  let elapsed = 0, started = 0, stopped = 0;
  s.d.sounds.coffee = () => { started++; return { elapsed: () => elapsed, stop: () => stopped++ }; };
  s.d.createCoffeeEffects = () => effects;
  const c = s.d.coffee = { busy: false, level: 0, cycle: new CoffeeCycle(), led: {}, glow(k) { this.level = k; } };
  return { ...s, c, effects, time(t) { elapsed = t; }, started: () => started, stopped: () => stopped };
}

test('manually starting the computer supersedes a pending power-restore restart', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { d, pc, power, step } = computer();
  power.setMain(false); step(1.3); power.setMain(true); step(1.3);
  assert.equal(pc.on, false, 'restoration schedules a cold restart');
  d.toggleComputer(pc); step(4);
  assert.equal(pc.on, true);
  t.mock.timers.tick(2600); step(2);
  assert.equal(pc.on, true, 'the obsolete automatic callback must not turn it off again');
  assert.equal(pc.level, 1);
});

test('another power cut cancels the older restart delay and waits for the new restore', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { pc, power, step } = computer();
  power.setMain(false); step(1.3); power.setMain(true); step(1.3);
  t.mock.timers.tick(2000);
  power.setMain(false); step(1.3); power.setMain(true); step(1.3);
  t.mock.timers.tick(600);
  assert.equal(pc.on, false, 'the first restore must not boot during the second restore delay');
  t.mock.timers.tick(2000); step(4);
  assert.equal(pc.on, true, 'the current restore still starts the computer');
});

test('a computer that loses power before startup makes no unplugged startup chime', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { d, pc, power, sounds, step } = computer();
  pc.on = false; pc.level = 0;
  d.toggleComputer(pc);
  power.setMain(false);
  t.mock.timers.tick(1000); step(1);
  assert.deepEqual(sounds, []);
});

test('a computer cannot boot from a dead socket', () => {
  const { d, pc, power } = computer();
  pc.on = false; pc.level = 0; power.setBreaker('living', false);
  assert.equal(d.toggleComputer(pc), false);
  assert.equal(pc.on, false);
  assert.equal(pc.busy, false);
  assert.equal(d.tasks.length, 0);
});

test('a startup that finishes after supply returns does not reboot again on an unrelated circuit change', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { d, pc, power, step } = computer();
  pc.on = false; pc.level = 0; d.toggleComputer(pc);
  power.setMain(false); step(0.2); power.setMain(true); step(4);
  assert.equal(pc.on, true); assert.equal(pc.busy, false);
  power.setBreaker('bathroom', false); step(1.3); t.mock.timers.tick(2600);
  assert.equal(pc.on, true, 'a running computer must not be restarted by the bathroom circuit');
  assert.equal(pc.busy, false);
});

test('the coffee machine cannot start without its kitchen circuit', () => {
  const { d, c, power, started } = coffee();
  power.setBreaker('kitchen', false);
  assert.equal(d.brew(c), false);
  assert.equal(c.busy, false);
  assert.equal(c.cycle.active, false);
  assert.equal(started(), 0, 'no grinder, pump or ready-beep recording starts');
});

test('a kitchen cut stops the pump and recording without emptying the cups', () => {
  const { d, c, power, effects, time, started, stopped, step } = coffee();
  assert.equal(d.brew(c), true);
  time(8); d.updateCoffee(1 / 60);
  const fill = effects.state.fill;
  assert.ok(fill > 0 && fill < 1 && effects.state.flow > 0);
  power.setBreaker('kitchen', false);
  assert.equal(c.busy, false);
  assert.equal(c.cycle.active, false);
  assert.equal(stopped(), 1);
  assert.equal(effects.state.flow, 0);
  assert.equal(effects.state.drip, false);
  assert.equal(effects.state.fill, fill, 'already poured coffee remains in both cups');
  assert.equal(c.level, 0);
  time(20); step(2);
  assert.equal(effects.state.fill, fill, 'an abandoned audio clock cannot finish the pour');
  power.setBreaker('kitchen', true); step(2);
  assert.equal(started(), 1, 'restoration never starts a fresh unattended brew');
  time(0); assert.equal(d.brew(c), true);
  assert.equal(effects.state.fill, 0, 'a deliberate fresh serving resets the cups as before');
});

test('a lighting-only flicker does not cancel a powered coffee cycle', () => {
  const { d, c, power, stopped, time } = coffee();
  d.brew(c); time(8); d.updateCoffee(1 / 60);
  power.surge([[0.2, 0], [0.1, 1]]);
  assert.equal(c.busy, true);
  assert.equal(c.cycle.active, true);
  assert.equal(stopped(), 0, 'a stutter in visual light level is not an unplugged kitchen');
});
