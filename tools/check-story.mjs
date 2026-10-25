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
  sys.flashlight.held = true;               // the torch already in hand (the cut waits for it: next test)
  story.bathroomTried(); run(4.8);
  assert.ok(!story.has('power-cut') && story.cutting && sys.power.live('lights1'), 'the knock: first the lights flicker, still on');
  assert.ok(sys.power.surges.length === 1 && calls.includes('play.arc_zap'), 'a surge, with the short circuit crackling');
  run(1.6);
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
  story.glassBreaks(); run(119);
  assert.ok(!story.has('power-cut'), 'not before two minutes');
  story.sys.flashlight.held = true; story.tookTorch(); run(4);
  assert.ok(story.has('power-cut'), 'the torch in hand: the cut comes by itself');
});

test('build 0.15: the cut never comes before the player has the torch; taking it brings the cut', () => {
  const { story, sys, calls, said, run } = night();
  story.begin({ seed: 4 });
  story.glassBreaks();
  story.bathroomTried(); run(1.2); story.bathroomTried(); run(6);
  assert.ok(!story.has('power-cut') && !story.cutting, 'the knock, no torch: no cut');
  assert.ok(sys.power.live('lights1'), 'the lights stay on');
  assert.ok(sys.power.surges.length >= 1 && calls.includes('play.arc_zap'), 'they stutter, with the buzz');
  assert.ok(said.includes('Where’s my torch? ...The wardrobe.'), 'and the player thinks of the torch');
  run(130);
  assert.ok(!story.has('power-cut'), 'the fallbacks wait for it too');
  const surges = sys.power.surges.length;
  assert.ok(surges >= 6, `the lights keep stuttering every 12-20 s (${surges})`);
  sys.flashlight.held = true; story.tookTorch();
  assert.ok(story.has('torch'));
  run(2.4);
  assert.ok(story.cutting && !story.has('power-cut'), 'a moment after the torch is taken: the flicker');
  run(1.6);
  assert.ok(story.has('power-cut') && !sys.power.live('lights1'), 'then the bang and the dark');
  assert.equal(said.filter(t => t === 'Where’s my torch? ...The wardrobe.').length, 1, 'the thought once');
});

test('Act II to IV: power back by the label, the nest, the hunt fallback', () => {
  const { story, sys, calls, run } = night();
  story.begin({ seed: 3 });
  story.glassBreaks(); story.blackout('test');
  story.fuseboxOpened(); run(13);
  sys.power.setBreaker('bathroom', false); sys.power.setRcd(true);
  if (story.nuisance !== 'none') { sys.power.setBreaker(story.nuisance, false); sys.power.setRcd(true); }
  story.powerRestored(); run(5);
  assert.ok(story.has('restored') && story.has('silhouette'), 'never turned round: he is heard running into the bedroom when the lights come back');
  assert.ok(calls.includes('play.step_wet') && calls.includes('play.door_slam'), 'his run (bare, wet feet) and the wardrobe are heard');
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
  assert.ok(said.includes('...Where are my keys?'), 'after the glass, the keys are missed');
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
  const { story, sys, said, calls, run } = night();
  story.begin({ seed: 4 });
  story.phoneTaken({ booted: false, pluggedIn: false });
  assert.ok(said.includes('Dead.') && said.some(t => /charger/.test(t)) && calls.includes('journal.phone-dead'));
  story.phoneCharging();
  assert.ok(said.includes('I never unplug it.'));
  assert.equal(story.phoneMayBoot(600), false, 'not before the power has come back');
  story.glassBreaks(); story.blackout('test'); story.powerRestored();
  assert.equal(story.phoneMayBoot(600), false, 'not straight away');
  run(36);
  assert.equal(story.phoneMayBoot(10), false, 'not without minutes on the charger');
  assert.equal(story.phoneMayBoot(31), false, 'not while the player is out of earshot');
  sys.player.pos = { x: 12.8, z: 1.2 };
  assert.equal(story.phoneMayBoot(31), true, 'within earshot of the nightstand');
  sys.player.pos = { x: 0.5, z: 0.5 }; run(90);
  assert.equal(story.phoneMayBoot(31), true, 'and two minutes after the power came back wherever the player is');
});

test('the man in the corridor: seen at the end of the torch, he runs at you and into the bedroom', () => {
  const { story, sys, calls, said, run } = night();
  story.begin({ seed: 6 });
  story.glassBreaks(); story.blackout('test');
  const placed = [];
  sys.intruder = { show: (on) => placed.push(on ? 'show' : 'hide'), place: (x, z) => placed.push([x, z]), play: () => {}, setTorch: () => {} };
  sys.flashlight = { held: true, on: true, beam: { up: { x: -1, y: 0, z: 0 } } };     // a spot shines along -up: east
  sys.player.pos = { x: 3.0, z: 3.6 };
  story.fuseboxOpened(); run(0.2);
  assert.ok(story.has('silhouette') && placed[0] === 'show', 'he is there at the edge of the light');
  run(0.8);
  assert.ok(!calls.includes('play.step_wet'), 'he holds still first');
  run(3);
  assert.ok(calls.includes('play.step_wet'), 'then runs (bare, wet feet)');
  const xs = placed.filter(Array.isArray).map(p => p[0]);
  assert.ok(Math.min(...xs) > 10, 'towards you, but never past the bedroom doorway');
  assert.ok(placed.includes('hide'), 'gone into the bedroom: not vanished in the open');
  assert.ok(calls.includes('play.door_slam'), 'the wardrobe bangs');
  run(6);
  assert.ok(said.includes('...Someone’s in here.') && said.includes('He’s in my bedroom.'));
  assert.ok(calls.includes('world.prints') && calls.includes('nest.hatch'));
});

test('the man in the corridor: never as the player steps out of the bedroom; down the hall, the latch, then the beam', () => {
  const { story, sys, calls, run } = night();
  story.begin({ seed: 6 });
  story.glassBreaks(); story.blackout('test'); story.set('torch');
  const placed = [];
  sys.intruder = { show: (on) => placed.push(on ? 'show' : 'hide'), place: (x, z) => placed.push([x, z]), play: () => {}, setTorch: () => {} };
  sys.flashlight = { held: true, on: true, beam: { up: { x: -1, y: 0, z: 0 } } };
  sys.player.pos = { x: 10.45, z: 2.9 }; run(1);
  assert.ok(!story.has('silhouette') && !story.has('latch'), 'stepping out of the bedroom, torch east: nothing yet');
  sys.flashlight.beam.up = { x: 1, y: 0, z: 0 };          // aimed west, walking down the hall
  for (const x of [9.5, 8.5, 7.5, 6.5, 5.5, 4.5, 3.5]) { sys.player.pos = { x, z: 3.6 }; run(0.3); }
  assert.ok(story.has('latch') && calls.includes('play.latch_1'), 'halfway down, behind you, the latch');
  assert.ok(!story.has('silhouette'), 'not while the torch points away');
  sys.flashlight.beam.up = { x: -1, y: 0, z: 0 }; run(0.2);
  assert.ok(story.has('silhouette') && placed[0] === 'show', 'turning round: him, at the end of the beam');
  run(6);
  const near = placed.filter(Array.isArray).map(([x, z]) => Math.hypot(x - 3.5, z - 3.6));
  assert.ok(Math.min(...near) > 1, 'his run never comes within a metre of the player');
});

test('walking back east before turning round: he breaks for the bedroom ahead of the player, never through them', () => {
  const { story, sys, run } = night();
  story.begin({ seed: 6 });
  story.glassBreaks(); story.blackout('test'); story.set('torch');
  const placed = [];
  sys.intruder = { show: () => {}, place: (x, z) => placed.push([x, z]), play: () => {}, setTorch: () => {} };
  sys.flashlight = { held: true, on: false, beam: { up: { x: 1, y: 0, z: 0 } } };
  for (const x of [8, 6, 5]) { sys.player.pos = { x, z: 3.6 }; run(0.3); }
  assert.ok(story.has('went-west') && !story.has('silhouette'));
  for (const x of [6, 7, 8, 8.7]) { sys.player.pos = { x, z: 3.6 }; run(0.3); }
  assert.ok(story.has('silhouette'), 'coming back east, he runs');
  run(6);
  assert.ok(placed.every(([x, z]) => Math.hypot(x - 8.7, z - 3.6) > 1), 'and never through the player');
});

test('a fridge left open after the drink still starts the glass; no drink at all, the glass comes anyway', () => {
  const a = night();
  a.story.begin({ seed: 2 });
  a.sys.fridge = { openRequested: true, angle: 100, handle: { x: 1.9, z: -0.6 } };
  a.sys.player.pos = { x: 1.6, z: -0.2 };
  a.story.drank(); a.run(20);
  assert.ok(!a.calls.includes('events.signal'), 'standing at the open fridge: not yet');
  a.run(6);
  assert.ok(a.calls.includes('events.signal'), '25 s after the drink at the latest');
  const b = night();
  b.story.begin({ seed: 2 });
  b.sys.player.pos = { x: 0, z: 0.5 };
  b.run(241);
  assert.ok(b.said.includes('Water. Then bed.'));
  b.run(121);
  assert.ok(b.story.has('glass'), 'six minutes in, the glass breaks anyway');
});

test('the wardrobe: stuck until he has been seen (rattling only before the glass); the nest only after him', () => {
  const { story, calls, run } = night();
  story.begin({ seed: 3 });
  assert.equal(story.wardrobeStuck({ id: 'right' }), true);
  assert.ok(calls.includes('play.hangers'), 'before the glass: held from inside');
  story.glassBreaks(); story.blackout('test');
  calls.length = 0;
  assert.equal(story.wardrobeStuck({ id: 'right' }), true, 'still stuck in the dark');
  assert.ok(!calls.includes('play.hangers'), 'but silent: he is in the bathroom');
  story.wardrobeOpened({ id: 'right' }); run(2);
  assert.ok(!story.has('nest-seen'), 'no nest before the man');
  story.set('silhouette');
  assert.equal(story.wardrobeStuck({ id: 'right' }), false);
  story.wardrobeOpened({ id: 'right' }); run(2);
  assert.ok(story.has('nest-seen'));
});

test('the spare key can be searched for only once the player needs it badly: after the nest with the power back, or in the hunt', () => {
  const { story } = night();
  story.begin({ seed: 3 });
  story.set('silhouette');
  assert.equal(story.spareSearchable(), false);
  story.set('nest-seen');
  assert.equal(story.spareSearchable(), false, 'not in the dark of Act II (no escape that skips Act III)');
  story.set('restored');
  assert.equal(story.spareSearchable(), true);
});

test('QA: an Act III checkpoint saved before he was heard running still gets his run (no stuck wardrobe, no locked bathroom)', () => {
  const a = night();
  a.story.begin({ seed: 8 });
  a.story.glassBreaks(); a.story.blackout('test');
  a.story.powerRestored();                                  // saves at once; the unseen run comes 1.2 s later
  const saved = a.story.load();
  assert.ok(!saved.flags.includes('silhouette'));
  const b = night();
  b.story.restore(saved); b.run(6);
  assert.ok(b.story.has('silhouette') && b.story.has('prints'), 'he is heard running on the restored night');
  assert.equal(b.story.wardrobeStuck({ id: 'right' }), false);
});

test('QA: never locked inside the bathroom: the glass waits until the player is out of it', () => {
  const { story, sys, run } = night();
  story.begin({ seed: 2 });
  sys.player.pos = { x: 7.6, z: 1.0 };                       // in the bathroom
  story.glassBreaks(); run(3);
  assert.ok(!story.has('glass'), 'not while they are in there');
  sys.player.pos = { x: 4, z: 3.6 }; run(1.5);
  assert.ok(story.has('glass'), 'then, once they are out');
  const b = night();
  b.story.begin({ seed: 2 });
  b.sys.fridge = { openRequested: true, angle: 100, handle: { x: 1.9, z: -0.6 } };
  b.sys.player.pos = { x: 7.6, z: 1.0 };
  b.story.drank(); b.run(40);
  assert.ok(!b.calls.includes('events.signal'), 'the open-fridge fallback waits too');
});

test('QA: a police call survives a checkpoint (the timer and what they were told)', () => {
  const a = night();
  a.story.begin({ seed: 9 });
  a.story.set('silhouette'); a.story.huntStart('test');
  a.story.policeCalled({ where: true, who: true }); a.run(10);
  const saved = a.story.save();
  const b = night();
  b.story.restore(saved); b.run(120);
  assert.ok(b.calls.includes('endings.police'), 'they still come');
  assert.ok(b.story.told?.where && b.story.told?.who, 'and know where and who');
});

test('QA: the fuse box opened before the cut plays none of the dark\'s beats', () => {
  const { story, calls, run } = night();
  story.begin({ seed: 2 });
  story.fuseboxOpened(); run(30);
  assert.ok(!story.has('fusebox-opened') && !calls.includes('play.door_rattle'));
});

test('final review: the sighting needs the torch in the corridor, and a clear line to him', () => {
  const { story, sys, run } = night();
  story.begin({ seed: 6 });
  story.glassBreaks(); story.blackout('test');
  sys.intruder = { show: () => {}, place: () => {}, play: () => {}, setTorch: () => {} };
  sys.flashlight = { held: false, on: false, beam: { up: { x: -1, y: 0, z: 0 } } };
  for (const x of [0.5, 3, 5, 7.5, 8.8]) { sys.player.pos = { x, z: 3.6 }; run(0.3); }
  assert.ok(!story.has('went-west') && !story.has('silhouette'), 'no torch: nothing is spent in the dark');
  story.set('torch'); sys.flashlight = { held: true, on: true, beam: { up: { x: -1, y: 0, z: 0 } } };
  sys.nav = { sees: () => false };
  for (const x of [5.5, 4]) { sys.player.pos = { x, z: 3.6 }; run(0.3); }
  assert.ok(story.has('went-west') && !story.has('silhouette'), 'no line of sight: not seen');
  sys.nav = { sees: () => true }; run(0.3);
  assert.ok(story.has('silhouette'));
});

test('final review: caught with the phone up, it drops out of view', () => {
  const { story, sys } = night();
  story.begin({ seed: 5 });
  sys.phone = { raised: true, raiseK: 1, holder: { enabled: true }, video: { enabled: true }, seccam: { stopLive() {} } };
  sys.death = { play: () => {}, wakeUp: () => {} };
  story.caught();
  assert.ok(!sys.phone.raised && !sys.phone.holder.enabled && !sys.phone.video.enabled);
});

test('final review: the mirror only from the bathroom, the hatch only with the wardrobe open', () => {
  const { story, sys, said, run } = night();
  story.begin({ seed: 5 });
  story.set('bathroom-open');
  const lookAt = (eye, at) => { const d = at.map((v, i) => v - eye[i]), n = Math.hypot(...d); sys.camera.getPosition = () => ({ x: eye[0], y: eye[1], z: eye[2] }); sys.camera.forward = { x: d[0] / n, y: d[1] / n, z: d[2] / n }; sys.player.pos = { x: eye[0], z: eye[2] }; run(0.2); };
  lookAt([7.8, 1.6, 3.2], [6.5, 1.75, 1.25]);
  assert.ok(!said.includes('Someone wiped the mirror.'), 'not through the wall from the corridor');
  lookAt([7.6, 1.6, 1.25], [6.5, 1.75, 1.25]);
  assert.ok(said.includes('Someone wiped the mirror.'));
  sys.nest = { hatchOpen: true, drop() {} }; sys.flashlight = { on: true, held: true };
  sys.closets = { doors: [{ id: 'right', angle: 0.18 }] };
  lookAt([10.6, 1.6, 0.2], [9.55, 2.27, -0.12]);
  assert.ok(!story.has('hatch-seen'), 'not through the shut wardrobe door');
  sys.closets.doors[0].angle = 1; run(0.2);
  assert.ok(story.has('hatch-seen'));
});

test('QA: a player walking on east never meets his run', () => {
  const { story, sys, run } = night();
  story.begin({ seed: 6 });
  story.glassBreaks(); story.blackout('test'); story.set('torch');
  const placed = [];
  sys.intruder = { show: () => {}, place: (x, z) => placed.push([x, z, story.time]), play: () => {}, setTorch: () => {} };
  sys.flashlight = { held: true, on: false, beam: { up: { x: 1, y: 0, z: 0 } } };
  sys.player.pos = { x: 5, z: 3.6 }; run(0.3);
  const path = [];
  for (let t = 0; t < 4; t += 0.05) { sys.player.pos = { x: Math.min(10.4, 5 + 1.4 * t), z: 3.6 }; path.push([sys.player.pos.x, story.time]); run(0.05); }
  assert.ok(story.has('silhouette'));
  const near = placed.map(([x, z, t]) => { const p = path.reduce((a, b) => (Math.abs(b[1] - t) < Math.abs(a[1] - t) ? b : a)); return Math.hypot(x - p[0], z - 3.6); });
  assert.ok(Math.min(...near) > 0.8, `closest ${Math.min(...near).toFixed(2)} m`);
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
  story.glassBreaks(); story.blackout('test');
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

test('build 0.15: every developer-menu event plays from any point of the night, again and again', async () => {
  const { STORY_EVENTS } = await import('../src/story-events.js');
  const { story, sys, calls, said, run } = night();
  // The systems the replays touch, as far as they need to answer.
  sys.flashlight = { held: false, on: false, pickUp() { this.held = true; story.tookTorch(); } };
  sys.phone = { booted: false, has: false, boot() { this.booted = true; calls.push('phone.boot'); }, openLive() { calls.push('phone.live'); }, charger() {}, save: () => ({}) };
  sys.seccam = { runLive: () => calls.push('seccam.live'), cameraOnly() {} };
  sys.crow = { strike: () => { calls.push('crow.strike'); return true; } };
  sys.intruder = { show: (on) => calls.push(`man.${on}`), place() {}, play() {} };
  story.begin({ seed: 5 });
  const order = STORY_EVENTS.filter(e => !e.id.startsWith('end-'));
  for (const events of [order, [...order].reverse(), order]) for (const e of events) {
    const power = () => JSON.stringify(sys.power.snapshot()) + sys.power.surges.length;
    const before = { calls: calls.length, said: said.length, flags: [...story.flags].join(), power: power() };
    e.run({ story, fallingGlass: () => {} });
    run(10);
    story.dying = false;                  // the death stub calls back at once
    const did = calls.length > before.calls || said.length > before.said || [...story.flags].join() !== before.flags || power() !== before.power;
    assert.ok(did, `${e.id} did something`);
  }
  assert.ok(sys.flashlight.held, 'the cut gave the torch');
  assert.ok(story.has('power-cut') || story.cutting || story.has('hunt'), 'the night is somewhere after the cut');
});
