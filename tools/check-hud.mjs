// Replace messages during their fade-out: a previous message must never hide
// its successor. Run without a browser: node --test tools/check-hud.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hud } from '../src/hud.js';

function element() {
  const classes = new Set();
  return { hidden: true, classList: {
    add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); },
  } };
}

function hud() {
  return Object.assign(Object.create(Hud.prototype), {
    promptEl: element(), toastEl: element(), voiceEl: element(), soundEl: element(), soundCaptions: true,
  });
}

const channels = [
  { name: 'action prompt', el: 'promptEl', first: h => h.prompt('C', 'Crouch', 1),
    next: h => h.prompt('F', 'Flashlight on', 5), firstDuration: 1000, nextDuration: 5000 },
  { name: 'toast', el: 'toastEl', first: h => h.toast('Phone silenced', 1),
    next: h => h.toast('Phone sound on', 5), firstDuration: 1000, nextDuration: 5000 },
  { name: 'voice caption', el: 'voiceEl', first: h => h.voice('Dispatcher', 'Hello'),
    next: h => h.voice('Dispatcher', 'Keep the phone with you. Stay quiet and tell me exactly where the man went.'),
    firstDuration: 3500, nextDuration: Math.max(3500, 'Keep the phone with you. Stay quiet and tell me exactly where the man went.'.length * 75) },
  { name: 'sound caption', el: 'soundEl', first: h => h.soundCaption('[Glass shatters]', 1),
    next: h => h.soundCaption('[Footsteps behind the door]', 5), firstDuration: 1000, nextDuration: 5000 },
];

for (const channel of channels) test(`${channel.name} replacement survives the previous message's pending fade`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = hud(), el = h[channel.el];
  channel.first(h);
  t.mock.timers.tick(channel.firstDuration);
  assert.ok(el.classList.contains('out'), 'the original message has started fading');
  t.mock.timers.tick(450);
  channel.next(h);
  assert.equal(el.hidden, false);
  assert.equal(el.classList.contains('out'), false);
  t.mock.timers.tick(451);
  assert.equal(el.hidden, false, 'the old fade completion must not hide its replacement');
  assert.equal(el.classList.contains('out'), false);
  t.mock.timers.tick(channel.nextDuration - 451);
  assert.equal(el.classList.contains('out'), true, 'the replacement keeps its full requested display time');
  assert.equal(el.hidden, false, 'the replacement fades before hiding');
  t.mock.timers.tick(900);
  assert.equal(el.hidden, true);
});

test('key-specific dismissal leaves other prompts intact, and replacement cancels an explicit fade', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = hud();
  h.prompt('F', 'Flashlight on', 30);
  h.hidePrompt('C');
  t.mock.timers.tick(1000);
  assert.equal(h.promptEl.hidden, false);
  assert.equal(h.promptEl.classList.contains('out'), false, 'another key cannot dismiss the flashlight hint');
  h.hidePrompt('F');
  t.mock.timers.tick(450);
  h.prompt('C', 'Crouch', 5);
  t.mock.timers.tick(451);
  assert.equal(h.promptEl.hidden, false);
  assert.equal(h.promptKey, 'C');
  assert.equal(h.promptEl.classList.contains('out'), false);
  t.mock.timers.tick(5000 - 451);
  t.mock.timers.tick(900);
  assert.equal(h.promptEl.hidden, true);
});

test('zero-duration fade and repeated replacement leave only the final message lifetime', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = hud();
  h.prompt('C', 'Crouch', 0);
  t.mock.timers.tick(0);
  assert.equal(h.promptEl.classList.contains('out'), true);
  h.prompt('E', 'Use', 1);
  t.mock.timers.tick(1000);
  h.prompt('F', 'Flashlight on', 5);
  t.mock.timers.tick(900);
  assert.equal(h.promptEl.hidden, false);
  assert.equal(h.promptEl.classList.contains('out'), false);
  t.mock.timers.tick(4100);
  t.mock.timers.tick(900);
  assert.equal(h.promptEl.hidden, true);
  t.mock.timers.tick(60000);
  assert.equal(h.promptEl.hidden, true, 'no earlier message may revive or overwrite the final state');
});
