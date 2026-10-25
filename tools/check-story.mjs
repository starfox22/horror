// The story controller (src/story.js) without a browser: the beats in order with their timers and fallbacks, the
// front door before and during the hunt, the key bowl, the run's variations and the checkpoints.
// node --test tools/check-story.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Story, SPARE_KEY } from '../src/story.js';
import { Power } from '../src/power.js';

// Every system the story reaches, as a recording stub.
function night() {
  const calls = [];
  const rec = (name) => new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : (...a) => { calls.push(`${name}.${String(k)}`); return undefined; }) });
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const camera = { getPosition: () => ({ x: 0, y: 1.6, z: 0 }), forward: { x: 0, y: 0, z: -1 } };
  const items = { set: new Set(), has(k) { return this.set.has(k); }, add(k) { this.set.add(k); }, save() { return [...this.set]; }, load(a = []) { this.set = new Set(a); } };
  const said = [];
  const sys = {
    camera, player: { pos: { x: 0.5, z: 0.5 } }, power: new Power(), items,
    thought: { say: (t) => said.push(t) }, bank: { play: (k) => { calls.push(`play.${k}`); } },
    world: rec('world'), journal: { find: (id) => calls.push(`journal.${id}`), save: () => [], load() {} }, music: rec('music'),
    rain: rec('rain'), flashlight: { held: false, on: false }, phone: rec('phone'), nest: rec('nest'), events: rec('events'),
    hunt: rec('hunt'), endings: rec('endings'), sounds: rec('sounds'), death: { play: (cb) => cb(), wakeUp: (cb) => cb() },
  };
  const story = new Story(sys);
  const run = (seconds) => { for (let t = 0; t < seconds; t += 0.05) story.update(0.05); };
  return { story, sys, calls, said, run };
}

test('Act I: the glass, the shards, the locked bathroom, the knock, the cut', () => {
  const { story, sys, calls, said, run } = night();
  story.begin({ seed: 7 });
  assert.equal(story.act, 1);
  story.glassBreaks();
  assert.ok(calls.includes('play.glass_break'), 'the glass is heard');
  assert.ok(story.has('glass'));
  story.bathroomTried(); run(1.2);
  assert.ok(said.includes('Locked.'));
  story.bathroomTried(); run(4.8);
  assert.ok(story.has('power-cut'), 'the knock is answered by the bang');
  assert.equal(story.act, 2);
  assert.equal(sys.power.live('lights1'), false, 'the flat is dark');
  assert.ok(sys.power.faults.has('bathroom'));
});

test('the knife rack: looking closely at the gap notices the missing knife; from across the kitchen, nothing', () => {
  const { story, sys, calls, said, run } = night();
  story.begin({ seed: 2 });
  const gap = [-0.085, 1.36, -1.36];
  sys.world = new Proxy({ knifeBlockAt: gap }, { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => {}) });
  const look = (eye) => {
    const d = gap.map((v, i) => v - eye[i]), n = Math.hypot(...d);
    sys.camera.getPosition = () => ({ x: eye[0], y: eye[1], z: eye[2] });
    sys.camera.forward = { x: d[0] / n, y: d[1] / n, z: d[2] / n };
    run(0.6);
  };
  look([-0.1, 1.6, 2.2]);
  assert.ok(!story.has('knife-seen'), 'from across the room the gap is not noticed');
  look([-0.2, 1.6, -0.1]);
  assert.ok(story.has('knife-seen') && said.includes('...The big one’s gone.') && calls.includes('journal.knife'), 'standing at the worktop, looking at it');
});

test('fallbacks keep the night moving: the cut comes by itself', () => {
  const { story, run } = night();
  story.begin({ seed: 1 });
  story.glassBreaks(); run(121);
  assert.ok(story.has('power-cut'), 'two minutes after the glass, the cut happens anyway');
});

test('Act II to IV: power back by the label, the nest, the hunt fallback', () => {
  const { story, sys, calls, run } = night();
  story.begin({ seed: 3 });
  story.glassBreaks(); story.powerCut('test');
  story.fuseboxOpened(); run(13);
  sys.power.setBreaker('bathroom', false); sys.power.setRcd(true);
  if (story.nuisance !== 'none') { sys.power.setBreaker(story.nuisance, false); sys.power.setRcd(true); }
  story.powerRestored(); run(5);
  assert.ok(story.has('restored') && story.has('silhouette'), 'never turned round: he is heard running into the bedroom when the lights come back');
  assert.ok(calls.includes('play.steps_boots') && calls.includes('play.door_slam'), 'his run and the wardrobe are heard');
  assert.equal(story.act, 3);
  story.nestSeen(); run(76);
  assert.ok(story.has('hunt'), 'the hunt starts without LIVE too');
  assert.equal(story.act, 4);
  assert.equal(sys.power.main, false, 'he broke the main switch');
});

test('the front door: not over a glass before he is seen; after, his keys; with the spare, E held turns the lock in 3 s', () => {
  const { story, sys, calls, said, run } = night();
  story.begin({ seed: 5 });
  story.frontDoor();
  assert.ok(said.includes('Locked. Good.'), 'before anything has happened, a locked door is good');
  story.glassBreaks();
  story.frontDoor();
  assert.ok(said.includes('Out? Barefoot? Over a glass?'));
  assert.ok(calls.includes('sounds.lockedDoor'));
  story.keyBowl();
  assert.ok(story.has('key-bowl') && calls.includes('journal.key-bowl'));
  story.set('silhouette'); story.huntStart('test');
  story.frontDoor();
  assert.ok(said.includes('...My keys. He has my keys.'), 'after seeing him: he has the keys');
  story.frontDoor();
  assert.ok(said.some(t => /spare/i.test(t)), 'then: where is the spare?');
  sys.items.add('spare-key');
  sys.player.pos = { x: 12.4, z: 3.9 };
  let held = false; sys.eHeld = () => held;
  story.frontDoor(); run(2);
  assert.ok(!calls.includes('endings.play'), 'E not held: the lock does not turn');
  held = true; run(1.2);
  assert.ok(!calls.includes('endings.play'), 'unlocking takes time');
  assert.ok(calls.includes('hunt.noise'), 'and each click is heard');
  held = false; run(3);
  assert.ok(!calls.includes('endings.play'), 'letting go stops it');
  assert.equal(story.unlock.clicks, 1, 'and keeps what was turned');
  held = true; run(2.0);
  assert.ok(calls.includes('endings.play'), 'out');
});

test('trying the lock before the hunt brings him down from the hatch: a race', () => {
  const { story, sys, calls, run } = night();
  story.begin({ seed: 5 });
  story.set('silhouette'); sys.items.add('spare-key');
  sys.player.pos = { x: 12.4, z: 3.9 }; sys.eHeld = () => false;
  story.frontDoor(); run(1);
  assert.ok(story.has('hunt') && calls.includes('hunt.start'), 'the hunt starts from the hatch');
});

test('a caught player loses a half-turned lock and the night stands still meanwhile', () => {
  const { story, sys, run } = night();
  story.begin({ seed: 5 });
  story.set('silhouette'); story.huntStart('test'); sys.items.add('spare-key');
  sys.player.pos = { x: 12.4, z: 3.9 }; sys.eHeld = () => true;
  story.frontDoor(); run(1.5);
  sys.death = { play: () => {}, wakeUp: () => {} };        // a death that has not finished yet
  story.caught();
  const t = story.time; run(5);
  assert.equal(story.unlock, null, 'the lock has to be started again');
  assert.equal(story.time, t, 'no story time passes while he has you');
});

test('the phone: dead on the nightstand, its charger pulled; it boots once the power is back, after the quiet', () => {
  const { story, said, calls, run } = night();
  story.begin({ seed: 4 });
  story.phoneTaken({ booted: false, pluggedIn: false });
  assert.ok(said.includes('Dead.') && said.some(t => /charger/.test(t)) && calls.includes('journal.phone-dead'));
  story.phoneCharging();
  assert.ok(said.includes('I always plug it in.'));
  assert.equal(story.phoneMayBoot(600), false, 'not before the power has come back');
  story.glassBreaks(); story.powerCut('test'); story.powerRestored();
  assert.equal(story.phoneMayBoot(600), false, 'not straight away');
  run(36);
  assert.equal(story.phoneMayBoot(10), false, 'not without minutes on the charger');
  assert.equal(story.phoneMayBoot(31), true);
});

test('the man in the corridor: seen at the end of the torch, he runs at you and into the bedroom', () => {
  const { story, sys, calls, said, run } = night();
  story.begin({ seed: 6 });
  story.glassBreaks(); story.powerCut('test');
  const placed = [];
  sys.intruder = { show: (on) => placed.push(on ? 'show' : 'hide'), place: (x, z) => placed.push([x, z]), play: () => {}, setTorch: () => {} };
  sys.flashlight = { held: true, on: true, beam: { up: { x: -1, y: 0, z: 0 } } };     // a spot shines along -up: east
  sys.player.pos = { x: 3.0, z: 3.6 };
  story.fuseboxOpened(); run(0.2);
  assert.ok(story.has('silhouette') && placed[0] === 'show', 'he is there at the edge of the light');
  run(0.5);
  assert.ok(!calls.includes('play.steps_boots'), 'he holds still first');
  run(3);
  assert.ok(calls.includes('play.steps_boots'), 'then runs, heavy');
  const xs = placed.filter(Array.isArray).map(p => p[0]);
  assert.ok(Math.min(...xs) > 10, 'towards you, but never past the bedroom doorway');
  assert.ok(placed.includes('hide'), 'gone into the bedroom: not vanished in the open');
  assert.ok(calls.includes('play.door_slam'), 'the wardrobe bangs');
  run(6);
  assert.ok(said.includes('...Someone’s in here.') && said.includes('He went into the bedroom.'));
  assert.ok(calls.includes('world.prints') && calls.includes('nest.hatch'));
});

test('the run varies by seed: the spare key moves, the nuisance circuit changes', () => {
  const places = new Set(), nuisance = new Set();
  for (let seed = 1; seed < 40; seed++) { const { story } = night(); story.begin({ seed }); places.add(story.spareKey.id); nuisance.add(story.nuisance); }
  assert.deepEqual([...places].sort(), SPARE_KEY.map(k => k.id).sort());
  assert.ok(nuisance.size >= 2);
});

test('checkpoints: a saved act restores its flags, power and items', () => {
  const { story, sys } = night();
  story.begin({ seed: 11 });
  story.glassBreaks(); story.powerCut('test');
  sys.items.add('spare-key');
  story.save();
  const saved = story.load();
  assert.equal(saved.act, 2);
  const again = night();
  again.story.restore(saved);
  assert.equal(again.story.act, 2);
  assert.ok(again.story.has('power-cut'));
  assert.equal(again.sys.power.rcd, false);
  assert.ok(again.sys.items.has('spare-key'));
});

test('caught: you wake (the clock goes back to 03:07) and he comes back', () => {
  const { story, calls } = night();
  story.begin({ seed: 2 });
  story.huntStart('test');
  story.caught();
  assert.equal(story.deaths, 1);
  assert.ok(story.has('woke'));
  assert.ok(calls.includes('hunt.respawn'));
});
