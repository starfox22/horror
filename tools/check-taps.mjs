// The taps (src/taps.js) without a browser: E turns each tap on and off (its recording at the spout, a click, a drop
// after), only from the room it is in; the story forces the bathroom tap on and off through world.tap() (hot after the
// cut, the bowl brimming), and the player turning that hot tap off is the story's beat (main.js -> story.tapClosed ->
// story.tapOff); a running tap is a noise every 2 s of play, which the hunt hears 7 m away.
// node --test tools/check-taps.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'playcanvas';
import { Taps, TAPS } from '../src/taps.js';
import { World } from '../src/world.js';
import { Story } from '../src/story.js';
import { Hunt } from '../src/hunt.js';

function setup() {
  const items = [], sounds = [], loops = [];
  const bank = {
    play: (key, opts) => { sounds.push({ key, ...opts }); return {}; },
    loop: (key, opts) => { const h = { key, opts, stopped: null, stop(fade) { this.stopped = fade; } }; loops.push(h); return h; },
  };
  const eye = new Vec3(-2.6, 1.85, -0.3);                  // in the kitchen, at the sink
  const camera = { getPosition: () => eye };
  const taps = new Taps({ app: { on() {} }, interactions: { add: item => { items.push(item); return item; } }, bank, camera, water: false });
  const item = name => items.find(i => i.label().includes(name));
  return { taps, items, sounds, loops, eye, item };
}

test('E turns each tap on and off: its recording at the spout, a click, a drop after', () => {
  const { taps, sounds, loops, item } = setup();
  const kitchen = item('kitchen');
  assert.equal(kitchen.label(), 'Turn on the kitchen tap');
  kitchen.use();
  assert.equal(taps.isOn('kitchen'), true);
  assert.equal(kitchen.label(), 'Turn off the kitchen tap');
  assert.equal(loops.length, 1);
  assert.equal(loops[0].key, 'tap_running');
  const [x, y, z] = loops[0].opts.at, [sx, sy, sz] = TAPS.kitchen.spout;
  assert.ok(x === sx && z === sz && y < sy && y > TAPS.kitchen.lands, 'the water is heard where it falls, under the spout');
  assert.ok(sounds.some(s => s.key === 'latch_2'), 'the handle clicks');
  kitchen.use();
  assert.equal(taps.isOn('kitchen'), false);
  assert.ok(loops[0].stopped > 0, 'the recording fades out');
  assert.ok(sounds.some(s => s.key === 'water_drop'), 'a drop falls after it shuts');
  assert.equal(sounds.filter(s => s.key === 'latch_2').length, 2);
});

test('a tap is reached only from the room it is in', () => {
  const { item, eye } = setup();
  const bathroom = item('bathroom'), kitchen = item('kitchen');
  assert.equal(kitchen.active(), true);
  assert.equal(bathroom.active(), false, 'not from the kitchen');
  eye.set(6.2, 1.8, 1.25);                                  // the office, the bathroom tap just behind the wall
  assert.equal(bathroom.active(), false, 'not through the wall');
  eye.set(7.3, 1.8, 1.25);
  assert.equal(bathroom.active(), true);
  assert.equal(kitchen.active(), false);
});

test('a running tap is a noise every 2 s of play, at its spout', () => {
  const { taps, item } = setup();
  const heard = [];
  taps.onNoise = (x, z, kind) => heard.push([x, z, kind]);
  item('kitchen').use();
  for (let t = 0; t < 5; t += 0.05) taps.update(0.05);
  assert.equal(heard.length, 3, 'at once, then at 2 s and 4 s');
  assert.deepEqual(heard[0], [TAPS.kitchen.spout[0], TAPS.kitchen.spout[2], 'tap']);
  taps.isPlaying = () => false;                              // paused: play time stops, so do the noises
  for (let t = 0; t < 5; t += 0.05) taps.update(0.05);
  assert.equal(heard.length, 3);
  taps.isPlaying = () => true;
  item('kitchen').use();
  for (let t = 0; t < 5; t += 0.05) taps.update(0.05);
  assert.equal(heard.length, 3, 'silent once shut');
  // The hunt hears it 7 m away.
  const radii = [];
  Hunt.prototype.noise.call({ active: true, stalker: { tune: { hear: { walk: 2.5 } }, noise: (x, z, r) => radii.push(r) } }, 1, 2, 'tap');
  assert.deepEqual(radii, [7]);
});

test('the story runs the bathroom tap (hot after the cut); the player turning the hot tap off is the story\'s beat', () => {
  const { taps, item, eye, sounds } = setup();
  // The world and the story as main.js joins them: every tap the player shuts goes to story.tapClosed.
  const world = Object.create(World.prototype);
  const story = new Story({ world, bank: { play() {} }, thought: { say() {} } });
  Object.assign(world, { taps, story });
  world.watchTaps();
  taps.on((id, on, { by } = {}) => { if (!on && by === 'player') story.tapClosed(id); });
  let tapOff = 0;
  const realTapOff = story.tapOff.bind(story);
  story.tapOff = () => { tapOff++; realTapOff(); };
  // He runs it behind the locked door (no click on), then turns it off when the handle is tried (a click).
  world.tap(true);
  assert.equal(taps.isOn('bathroom'), true); assert.equal(taps.isHot('bathroom'), false); assert.equal(world.tapOn, true);
  assert.equal(sounds.filter(s => s.key === 'latch_2').length, 0);
  world.tap(false);
  assert.equal(taps.isOn('bathroom'), false); assert.equal(world.tapOn, false); assert.equal(tapOff, 0);
  assert.equal(sounds.filter(s => s.key === 'latch_2').length, 1);
  // The cut: hot, the bowl brimming (it stays full). The player, in the bathroom, turns it off: tapOff once.
  assert.equal(taps.taps.get('bathroom').full ?? false, false);
  story.set('power-cut');
  world.tap(true, { hot: true });
  assert.equal(taps.isHot('bathroom'), true);
  assert.equal(taps.taps.get('bathroom').full, true);
  eye.set(7.3, 1.8, 1.25);
  const bathroom = item('bathroom');
  assert.equal(bathroom.label(), 'Turn off the bathroom tap');
  bathroom.use();
  assert.equal(taps.isOn('bathroom'), false); assert.equal(tapOff, 1); assert.equal(story.has('tap-off'), true); assert.equal(world.tapOn, false);
  // Back on is the player's own water (not hot), off again is no beat.
  bathroom.use(); assert.equal(taps.isHot('bathroom'), false);
  bathroom.use(); assert.equal(story.has('tap-off'), true);
  // The story can still force it either way, and a new night shuts every tap without a sound.
  world.tap(true, { hot: true }); assert.equal(taps.isHot('bathroom'), true);
  item('kitchen').use();
  const clicks = sounds.length;
  taps.reset();
  assert.equal(taps.isOn('bathroom') || taps.isOn('kitchen'), false);
  assert.equal(taps.taps.get('bathroom').full, false, 'the bowl empty again');
  assert.equal(sounds.length, clicks, 'quietly');
});
