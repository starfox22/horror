// Scripted events fire once, on their signal, after their delay in play time only; the developer menu can play them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Director, STORY_EVENTS } from '../src/story-events.js';
import { Thought } from '../src/thought.js';

const fakeApp = () => { const handlers = []; return { on: (name, fn) => handlers.push(fn), off() {}, step: dt => handlers.forEach(fn => fn(dt)) }; };

test('the falling glass is the first story event and fires 3 s of play after the fridge shuts post-drink', () => {
  assert.equal(STORY_EVENTS[0].id, 'falling-glass');
  assert.equal(STORY_EVENTS[0].label, 'Falling glass');
  const app = fakeApp(), played = [];
  let playing = true;
  const director = new Director({ app, ctx: { fallingGlass: () => played.push(performance.now()) }, isPlaying: () => playing });
  for (let i = 0; i < 60; i++) app.step(1 / 60);
  assert.equal(played.length, 0, 'nothing happens without the signal');
  director.signal('fridge-shut-after-drink');
  for (let i = 0; i < 60 * 2.9; i++) app.step(1 / 60);
  assert.equal(played.length, 0, 'not before three seconds');
  playing = false;                                     // paused: the clock stops
  for (let i = 0; i < 600; i++) app.step(1 / 60);
  assert.equal(played.length, 0, 'pause time does not count');
  playing = true;
  for (let i = 0; i < 12; i++) app.step(1 / 60);
  assert.equal(played.length, 1, 'fires once three seconds of play have passed');
  director.signal('fridge-shut-after-drink');
  for (let i = 0; i < 400; i++) app.step(1 / 60);
  assert.equal(played.length, 1, 'a story event happens only once');
});

test('a long frame cannot skip through an event delay; manual runs do not use up the story run', () => {
  const app = fakeApp(), played = [];
  const director = new Director({ app, ctx: { fallingGlass: () => played.push(1) } });
  assert.equal(director.run('falling-glass'), true);
  assert.equal(director.run('no-such-event'), false);
  assert.equal(played.length, 1);
  director.signal('fridge-shut-after-drink');
  app.step(5);                                          // a 5 s hitch counts as 0.1 s
  assert.equal(played.length, 1);
  for (let i = 0; i < 40; i++) app.step(0.1);
  assert.equal(played.length, 2, 'the story run still happens after a manual test run');
  assert.deepEqual(director.log.map(e => e.how), ['manual', 'story']);
});

test('the thought line waits for its delay, fades in, holds and fades out', () => {
  const el = { style: {}, setAttribute() {}, hidden: true, textContent: '' };
  const doc = { createElement: () => el, body: { appendChild() {} } };
  const thought = new Thought(doc);
  thought.show('What was that?', { delay: 1, hold: 2 });
  assert.equal(el.hidden, true);
  for (let i = 0; i < 12; i++) thought.update(0.1);    // 1.2 s: fading in
  assert.equal(el.hidden, false);
  assert.ok(Number(el.style.opacity) > 0 && Number(el.style.opacity) < 1);
  for (let i = 0; i < 20; i++) thought.update(0.1);    // 3.2 s: holding
  assert.equal(el.style.opacity, '1.000');
  assert.equal(el.textContent, 'What was that?');
  for (let i = 0; i < 20; i++) thought.update(0.1);
  assert.equal(el.hidden, true);
  assert.equal(thought.line, null);
});
