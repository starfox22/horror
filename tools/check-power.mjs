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
