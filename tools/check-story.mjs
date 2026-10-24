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

test('fallbacks keep the night moving: the cut comes by itself', () => {
  const { story, run } = night();
  story.begin({ seed: 1 });
  story.glassBreaks(); run(121);
  assert.ok(story.has('power-cut'), 'two minutes after the glass, the cut happens anyway');
});

test('Act II to IV: power back by the label, the nest, the hunt fallback', () => {
  const { story, sys, run } = night();
  story.begin({ seed: 3 });
  story.glassBreaks(); story.powerCut('test');
  story.fuseboxOpened(); run(13);
  sys.power.setBreaker('bathroom', false); sys.power.setRcd(true);
  if (story.nuisance !== 'none') { sys.power.setBreaker(story.nuisance, false); sys.power.setRcd(true); }
  story.powerRestored();
  assert.ok(story.has('restored') && story.has('silhouette'), 'never turned round: he is there when the lights come back');
  assert.equal(story.act, 3);
  story.nestSeen(); run(76);
  assert.ok(story.has('hunt'), 'the hunt starts without LIVE too');
  assert.equal(story.act, 4);
  assert.equal(sys.power.main, false, 'he broke the main switch');
});

test('the front door: not over a glass before the hunt; with the spare in the hunt it opens in 3 s', () => {
  const { story, sys, calls, said, run } = night();
  story.begin({ seed: 5 });
  story.frontDoor();
  assert.ok(said.includes('Out? Barefoot? Over a glass?'));
  assert.ok(calls.includes('sounds.lockedDoor'));
  story.keyBowl();
  assert.ok(story.has('key-bowl') && calls.includes('journal.key-bowl'));
  story.huntStart('test');
  story.frontDoor();
  assert.ok(said.some(t => /spare/i.test(t)), 'no key: where is the spare?');
  sys.items.add('spare-key');
  story.frontDoor(); run(1);
  assert.ok(!calls.includes('endings.play'), 'unlocking takes time');
  assert.ok(calls.includes('hunt.noise'), 'and it is heard');
  run(2.2);
  assert.ok(calls.includes('endings.play'), 'out');
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
