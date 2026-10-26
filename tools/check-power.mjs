// The flat's electricity (src/power.js): the RCD trips the whole flat; it stays up only while no wet circuit is on; the
// fuse box label's procedure and the clever shortcut both work; a cut goes out in a cascade from where it happened.
// node --test tools/check-power.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Power, CIRCUITS } from '../src/power.js';

const settle = (p) => { for (let i = 0; i < 40; i++) p.update(0.05); };

test('a trip takes every circuit down; lights go out in a cascade from the fault', () => {
  const p = new Power();
  p.faults.add('bathroom');
  p.trip([7.4, 0.9]);
  assert.equal(p.rcd, false);
  for (const c of CIRCUITS) assert.equal(p.live(c.id), false);
  // Just after the trip a light near the bathroom is already dark-ish while one 12 m away is still on.
  p.update(0.2);
  assert.ok(p.k('lights2', { x: 7.5, z: 1 }) < 0.5, 'near the fault: out');
  assert.equal(p.k('lights1', { x: -4.5, z: 2 }), 1, 'far away: not yet');
  settle(p);
  assert.equal(p.k('lights1', { x: -4.5, z: 2 }), 0);
});

test('the RCD will not stay up while the wet circuit is on', () => {
  const p = new Power();
  p.faults.add('bathroom'); p.trip([7, 1]); settle(p);
  assert.equal(p.setRcd(true), 'tripped');
  assert.equal(p.rcd, false);
});

test('a quick main-switch reversal replaces the unfinished restore instead of relighting the flat', () => {
  const p = new Power(), at = { x: 2.3, z: 4.4 };
  p.setMain(false); settle(p);
  p.setMain(true); p.update(0.05); p.setMain(false);
  for (let i = 0; i < 6; i++) p.update(0.1);
  assert.equal(p.main, false);
  for (const c of CIRCUITS) {
    assert.equal(p.live(c.id), false);
    assert.equal(p.k(c.id, at), 0, `${c.id} must follow the newer off transition`);
    assert.equal(p.transitions.filter(t => t.circuits.includes(c.id)).length, 1, 'one current animation per circuit');
  }
  settle(p);
  assert.equal(p.transitions.length, 0);
});

test('a rejected RCD restore records the retrip and goes dark while the lever stays down', () => {
  const p = new Power(), at = { x: 2.3, z: 4.4 }, events = [];
  p.faults.add('bathroom'); p.trip([7, 1]); settle(p);
  p.onChange(event => { if (event) events.push(event); });
  assert.equal(p.setRcd(true), 'tripped');
  assert.equal(p.rcd, false);
  const retrip = events.find(event => event.cause === 'retrip');
  assert.deepEqual(retrip?.off, CIRCUITS.map(c => c.id), 'the off event must reach every light owner');
  for (let i = 0; i < 6; i++) p.update(0.1);
  for (const c of CIRCUITS) assert.equal(p.k(c.id, at), 0, `${c.id}: no stale restore after an automatic retrip`);
});

test('energizing a wet breaker retrips the whole flat and supersedes its attempted restore', () => {
  const p = new Power(), at = { x: 2.3, z: 4.4 }, events = [];
  p.faults.add('bathroom'); p.setBreaker('bathroom', false); settle(p);
  p.onChange(event => { if (event) events.push(event); });
  assert.equal(p.setBreaker('bathroom', true), 'tripped');
  assert.equal(p.rcd, false);
  assert.deepEqual(events.find(event => event.cause === 'retrip')?.off, CIRCUITS.map(c => c.id));
  for (let i = 0; i < 6; i++) p.update(0.1);
  for (const c of CIRCUITS) {
    assert.equal(p.live(c.id), false);
    assert.equal(p.k(c.id, at), 0, `${c.id}: the retrip wins over the attempt`);
  }
});

test('restoring the main trips a wet breaker that was enabled while supply was off', () => {
  const p = new Power(), events = [];
  p.setMain(false); settle(p);
  p.setBreaker('bathroom', false); p.faults.add('bathroom');
  assert.equal(p.setBreaker('bathroom', true), 'on');
  assert.equal(p.rcd, true, 'the circuit was enabled while deenergized');
  p.onChange(event => { if (event) events.push(event); });
  assert.equal(p.setMain(true), 'tripped');
  assert.equal(p.main, true); assert.equal(p.rcd, false);
  assert.deepEqual(events.find(event => event.cause === 'retrip')?.off, CIRCUITS.map(c => c.id));
  settle(p);
  for (const c of CIRCUITS) {
    assert.equal(p.live(c.id), false);
    assert.equal(p.k(c.id), 0, `${c.id}: a fault cannot be bypassed through the main switch`);
  }
  p.setBreaker('bathroom', false); p.setRcd(true); settle(p);
  assert.equal(p.live('lights1'), true, 'isolating the fault still restores the usable circuits');
  assert.equal(p.live('bathroom'), false);
});

test('the clever way: wet circuit off, RCD up — the flat is back, the bathroom stays dark', () => {
  const p = new Power();
  p.faults.add('bathroom'); p.trip([7, 1]); settle(p);
  p.setBreaker('bathroom', false);
  assert.equal(p.setRcd(true), 'up');
  settle(p);
  assert.equal(p.live('lights1'), true); assert.equal(p.live('kitchen'), true); assert.equal(p.live('bathroom'), false);
});

test('the label’s way: all off, RCD up, breakers back one at a time; the wet one trips it again', () => {
  const p = new Power();
  p.faults.add('bathroom'); p.faults.add('kitchen'); p.trip([7, 1]); settle(p);
  for (const c of CIRCUITS) p.setBreaker(c.id, false);
  assert.equal(p.setRcd(true), 'up');
  const tripped = [];
  for (const c of CIRCUITS) {
    if (p.setBreaker(c.id, true) === 'tripped') { tripped.push(c.id); p.setBreaker(c.id, false); assert.equal(p.setRcd(true), 'up'); }
  }
  assert.deepEqual(tripped.sort(), ['bathroom', 'kitchen']);
  settle(p);
  assert.equal(p.live('lights2'), true);
});

test('the main switch off kills everything regardless of the RCD', () => {
  const p = new Power();
  p.setMain(false); settle(p);
  for (const c of CIRCUITS) assert.equal(p.live(c.id), false);
  const saved = p.save(); const q = new Power(); q.load(saved);
  assert.equal(q.main, false);
});
