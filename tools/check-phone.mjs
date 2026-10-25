// The phone lying on the nightstand (src/phone.js) without a browser: dark until something wakes it; plugged in it
// shows the empty-battery glyph for a while; booting shows its logo silently for 3 s, then the alerts come with the
// buzz; after a while it sleeps again; put down it locks. node --test tools/check-phone.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Phone } from '../src/phone.js';

function phone({ live = true } = {}) {
  // What the screen was asked to show each time it was drawn (phone-screen.js draws it: tools/phone/preview.mjs).
  const drawn = [];
  const p = Object.create(Phone.prototype);
  const played = [];
  Object.assign(p, {
    holder: { enabled: false }, video: { enabled: false }, bank: { play: (k) => played.push(k) },
    story: { set() {}, phoneBooted() {}, phoneCharging() {}, phoneMayBoot: () => false, has: () => false },
    power: { live: () => live }, clock: { now: () => new Date(2026, 9, 25, 3, 21) },
    has: false, charge: 0, booted: false, onCharger: true, pluggedIn: false, silenced: false, chargeTime: 0,
    booting: null, lit: 0, raised: false, raiseK: 0, app_: 'lock', sel: 0, dirty: true, call: null, notifications: [],
    thumbs: {}, durations: {}, charger() {}, noise() {}, hud: { prompt() {} },
  });
  p.draw = function () { drawn.push(this.screenState()); };
  const step = (seconds) => { for (let t = 0; t < seconds; t += 0.05) p.update(0.05); };
  return { p, drawn, played, step };
}
const glyph = (drawn) => drawn.some(s => s.mode === 'dead' && s.charging);
const ring = (drawn) => drawn.some(s => s.mode === 'boot');

test('on the nightstand: dark; plugged in, the empty-battery glyph lights for a while, then it sleeps', () => {
  const { p, drawn, step } = phone();
  step(0.1);
  assert.ok(!glyph(drawn), 'dead and unplugged: dark');
  p.putOnCharger();
  drawn.length = 0; step(0.1);
  assert.ok(glyph(drawn), 'plugged in: the battery glyph');
  drawn.length = 0; step(6);
  assert.ok(drawn.length && drawn.at(-1).mode === 'off', 'and dark again');
});

test('booting: the logo silently for 3 s, then the alerts with the buzz; the screen stays lit a while, then sleeps', () => {
  const { p, drawn, played, step } = phone();
  p.pluggedIn = true;
  p.boot();
  assert.ok(!p.booted && p.booting === 0, 'the logo first');
  drawn.length = 0; step(1);
  assert.ok(ring(drawn) && !played.includes('phone_buzz'), 'its mark, no buzz yet');
  step(2.1);
  assert.ok(p.booted && played.filter(k => k === 'phone_buzz').length === 3, 'then booted, three buzzes');
  assert.ok(p.notifications.length === 2 && p.lit > 15, 'the alerts, lit');
  drawn.length = 0; step(21);
  assert.equal(p.lit, 0, 'asleep again');
  assert.ok(drawn.at(-1).mode === 'off', 'nothing drawn but black');
  assert.deepEqual(p.screenState().notifications.map(n => n.ago), ['2h ago', '23m ago'], 'the alerts say how long ago');
});

test('put down, it locks (no Home Cam on the nightstand)', () => {
  const { p } = phone();
  Object.assign(p, { has: true, onCharger: false, booted: true, app_: 'cam', seccam: { stopLive() {} } });
  p.putOnCharger();
  assert.equal(p.app_, 'lock');
  assert.ok(p.lit > 0, 'the screen wakes when it is put down');
});
