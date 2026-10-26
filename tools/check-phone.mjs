// The phone lying on the nightstand (src/phone.js) without a browser: dark until something wakes it; plugged in it
// shows the empty-battery glyph for a while; booting shows its logo silently for 3 s, then the alerts come with the
// buzz; after a while it sleeps again; put down it locks. node --test tools/check-phone.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Phone, freshPhoneState } from '../src/phone.js';
import { Story } from '../src/story.js';

function phone({ live = true } = {}) {
  // What the screen was asked to show each time it was drawn (phone-screen.js draws it: tools/phone/preview.mjs).
  const drawn = [];
  const p = Object.create(Phone.prototype);
  const played = [];
  Object.assign(p, {
    holder: { enabled: false }, video: { enabled: false }, bank: { play: (k) => played.push(k) },
    story: { sys: {}, set() {}, after() {}, phoneBooted() {}, phoneCharging() {}, has: () => false },
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

test('first pickup is fully charged and operational without sockets, a charger or story progress', () => {
  const { p, played } = phone({ live: false });
  Object.assign(p, freshPhoneState());
  p.story.phoneTaken = () => {};
  p.takeFromCharger(); p.toggle();
  assert.equal(p.charge, 100); assert.equal(p.booted, true); assert.equal(p.booting, null);
  assert.equal(p.app_, 'lock'); assert.equal(p.charging, false); assert.equal(p.raised, true);
  assert.deepEqual(p.options().map(([label]) => label), ['Home Cam', 'Emergency call']);
  assert.ok(!played.includes('phone_buzz'), 'no boot scare on first pickup');
  p.choose(1);
  assert.equal(p.app_, 'call'); assert.equal(p.call.line, 'Calling 112…');
  assert.ok(!p.firstChoices()[0].text.includes('glass'), 'no claim of a broken glass before it happens');
});

test('loading an old dead-phone checkpoint restores a usable phone and clears stale held state', () => {
  const { p } = phone(); let stopped = 0;
  Object.assign(p, { seccam: { stopLive: () => stopped++ }, raised: true, raiseK: 1,
    holder: { enabled: true }, video: { enabled: true }, handCarrier: { enabled: true }, call: { incoming: true }, qDown: 123 });
  p.load({ has: true, charge: 0, booted: false, onCharger: false, pluggedIn: false });
  assert.equal(p.charge, 100); assert.equal(p.booted, true); assert.equal(stopped, 1);
  assert.equal(p.holder.enabled, false); assert.equal(p.video.enabled, false); assert.equal(p.handCarrier.enabled, false);
  assert.equal(p.raiseK, 0); assert.equal(p.call, null); assert.equal(p.qDown, null);
});

test('Back or the selectable Hang up control can end a call while answers are offered', () => {
  const { p, step } = calls();
  p.dial(); step(3.3);
  assert.equal(p.options().at(-1)[0], 'Hang up');
  p.choose(p.options().length - 1);
  assert.equal(p.call, null);
  p.dial(); step(3.3); p.back();
  assert.equal(p.call, null); assert.equal(p.app_, 'lock');
});

test('phone inputs are blocked in overlays and an interrupted Q press cannot survive focus loss', () => {
  const savedWindow = globalThis.window, savedDocument = globalThis.document;
  const w = globalThis.window = new EventTarget(), d = globalThis.document = new EventTarget();
  try {
    const { p } = phone(); let blocked = true;
    p.app = { graphicsDevice: { canvas: {} } }; d.pointerLockElement = p.app.graphicsDevice.canvas;
    Object.assign(p, { has: true, onCharger: false, raised: true, raiseK: 1, booted: true });
    p.blocked = () => blocked; p.bindInput();
    const emit = (target, type, values) => { const event = new Event(type, { cancelable: true }); Object.assign(event, values); target.dispatchEvent(event); };
    emit(w, 'wheel', { deltaY: 1 }); emit(w, 'mousedown', { button: 0 }); emit(w, 'mousedown', { button: 2 });
    assert.equal(p.app_, 'lock'); assert.equal(p.sel, 0);
    blocked = false;
    emit(w, 'wheel', { deltaY: 1 }); assert.equal(p.sel, 1);
    emit(w, 'keydown', { code: 'KeyQ' }); emit(w, 'blur', {}); emit(w, 'keyup', { code: 'KeyQ' });
    assert.equal(p.raised, true); assert.equal(p.qDown, null);
    emit(w, 'keydown', { code: 'KeyQ' }); emit(d, 'pointerlockchange', {}); emit(w, 'keyup', { code: 'KeyQ' });
    assert.equal(p.raised, true);
    emit(w, 'keydown', { code: 'KeyQ' }); emit(w, 'keyup', { code: 'KeyQ' });
    assert.equal(p.raised, false, 'a fresh deliberate press still lowers the phone');
  } finally { globalThis.window = savedWindow; globalThis.document = savedDocument; }
});

test('the held lock-screen clock redraws when its minute changes', () => {
  const { p, drawn } = phone();
  Object.assign(p, freshPhoneState({ has: true }), { holder: { enabled: true, setLocalPosition() {}, setLocalEulerAngles() {} }, raised: true, raiseK: 1 });
  p.update(0.05); drawn.length = 0;
  p.clock.now = () => new Date(2026, 9, 25, 3, 22);
  p.update(0.05);
  assert.equal(drawn.length, 1); assert.equal(drawn[0].time.getMinutes(), 22);
});

test('the later reminder never marks previously watched clips unread or repeats its buzz', () => {
  const { p, story } = calls();
  story.sys.journal.has = id => id === 'clip-0047';
  p.notifyAlerts();
  assert.equal(story.has('alerts'), true);
  assert.deepEqual(p.notifications.map(n => n.unread), [false, true]);
  const first = p.notifications;
  p.notifyAlerts();
  assert.equal(p.notifications, first, 'the same reminder is not regenerated each frame');
});

test('an incoming callback replaces camera video with the call screen and stops hidden playback', () => {
  const { p, step } = calls(); let stopped = 0;
  p.seccam = { stopLive: () => stopped++ };
  p.call = { sent: true }; p.hangUp();
  p.app_ = 'live'; p.video.enabled = true;
  step(14.1);
  assert.equal(p.app_, 'call'); assert.equal(p.call.incoming, true);
  assert.equal(p.video.enabled, false); assert.equal(stopped, 1);
});

test('answering or declining cancels every scheduled incoming ring, including delayed repeats', () => {
  for (const id of ['answer', 'decline']) {
    const { p } = calls(), sounds = [];
    p.bank.play = (key, options) => { const sound = { key, options, stopped: false }; sounds.push(sound); return { stop: () => { sound.stopped = true; } }; };
    p.ring();
    const rings = sounds.filter(s => s.key === 'phone_ring');
    assert.deepEqual(rings.map(s => s.options.delay), [0, 5.4, 10.8]);
    p.answer({ id });
    assert.ok(rings.every(s => s.stopped), `${id} stops current and future rings`);
  }
});

test('immediate hangup cancels dialing and its delayed static; loading also cancels ringing', () => {
  const { p } = calls(), sounds = [];
  p.bank.play = key => { const sound = { key, stopped: false }; sounds.push(sound); return { stop: () => { sound.stopped = true; } }; };
  p.dial(); p.hangUp(true);
  assert.ok(sounds.filter(s => ['phone_dial', 'phone_static'].includes(s.key)).every(s => s.stopped));
  p.ring(); p.load(freshPhoneState());
  assert.ok(sounds.filter(s => s.key === 'phone_ring').every(s => s.stopped));
});

test('call transitions always select an actionable control, including an immediate hangup', () => {
  const { p, step } = calls();
  p.sel = 1; p.dial();
  assert.equal(p.options()[p.sel][0], 'Hang up', 'dialling from the second lock-screen row still selects the only control');
  p.choose(p.sel); assert.equal(p.call, null); assert.equal(p.sel, 0);
  p.sel = 2; p.ring();
  assert.equal(p.options()[p.sel][0], 'Answer', 'an incoming call resets a former camera selection');
  p.choose(p.sel); step(1.3);
  assert.ok(p.options()[p.sel], 'answering keeps a valid selected response');
  p.hangUp(true); p.story.flags.add('silhouette'); p.story.flags.add('nest-seen');
  p.dial(); step(3.3); p.choose(1);
  assert.equal(p.options()[p.sel][0], 'Hang up', 'a later dialogue choice still selects Hang up while waiting for a reply');
});

// The real story clock and timer replacement rules, with the unrelated world
// watcher disabled. The call still runs Phone's actual scheduling and dialogue.
function calls() {
  const { p } = phone(), voices = [], dispatched = [];
  const story = new Story({ hud: { voice: (who, text) => voices.push({ who, text }) }, journal: { has: () => false } });
  story.watch = () => {};
  story.policeCalled = info => dispatched.push(info);
  p.story = story; p.charge = 10; p.booted = true;
  const step = seconds => { for (let i = 0; i < Math.ceil(seconds * 20); i++) story.update(0.05); };
  return { p, story, step, voices, dispatched };
}

test('an earlier unsure call cannot question or hang up a new call', () => {
  const { p, step, voices } = calls();
  p.dial(); step(3.3);
  p.answer({ id: 'unsure', text: 'A glass broke.' });
  step(1); p.hangUp(true); p.dial();
  const next = p.call;
  step(1.6);
  assert.equal(p.call, next);
  assert.equal(next.line, 'Calling 112…', 'the old question cannot connect the new call early');
  assert.ok(!voices.some(v => v.text.startsWith('Is anyone hurt?')), 'abandoned call dialogue must stay silent');
  step(2);
  assert.equal(next.connected, true, 'the new call still answers after its own dial time');
  step(5);
  assert.equal(p.call, next, 'the old nine-second hangup cannot terminate the new call');
});

test('an abandoned dial cannot answer a later incoming call', () => {
  const { p, step } = calls();
  p.dial(); step(1); p.hangUp(true); p.ring();
  const incoming = p.call;
  step(3);
  assert.equal(p.call, incoming);
  assert.equal(incoming.incoming, true);
  assert.equal(incoming.connected, undefined, 'a callback remains unanswered until the player accepts it');
  assert.deepEqual(incoming.choices.map(c => c.id), ['answer', 'decline']);
});

test('a previously answered callback cannot replace a new outgoing call', () => {
  const { p, step } = calls();
  p.ring(); p.answer({ id: 'answer' });
  step(0.1); p.hangUp(true); p.dial();
  const next = p.call;
  step(1.3);
  assert.equal(p.call, next);
  assert.equal(next.line, 'Calling 112…');
  assert.equal(next.connected, undefined);
  step(2.1);
  assert.equal(next.connected, true);
});

test('information already given still dispatches police after hanging up, without speaking into the new call', () => {
  const { p, story, step, dispatched } = calls();
  story.flags.add('silhouette');
  p.dial(); step(3.3);
  p.answer({ id: 'someone', text: 'There is someone in my flat.' });
  p.hangUp(true); p.dial();
  const next = p.call;
  step(2.7);
  assert.equal(dispatched.length, 1, 'dispatch is a world event, not cancelled with the old call UI');
  assert.equal(p.call, next);
  assert.equal(next.line, 'Calling 112…', 'the old dispatcher reply must not take over the new call');
  step(0.7);
  assert.equal(next.connected, true);
});

test('redialling supersedes an earlier pending callback even if the new call ends', () => {
  const { p, step } = calls();
  p.call = { sent: true }; p.hangUp();
  step(1); p.dial(); step(3.3); p.hangUp(true);
  step(11);
  assert.equal(p.call, null, 'the replaced call cannot ring again later');
});
