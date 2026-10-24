// Every call the story makes on a system (story.js, story-events.js, endings.js: `sys.<name>?.<method>(`) names a
// method that system's class really has. The story's own tests stub the systems, so a misnamed call (0.13: the hatch
// asked of the world instead of the nest) would otherwise only show in a browser.
// node --test tools/check-story-wiring.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CLASSES = {
  world: ['../src/world.js', 'World'], nest: ['../src/nest.js', 'Nest'], power: ['../src/power.js', 'Power'],
  phone: ['../src/phone.js', 'Phone'], hunt: ['../src/hunt.js', 'Hunt'], music: ['../src/music.js', 'Music'],
  journal: ['../src/journal.js', 'Journal'], endings: ['../src/endings.js', 'Endings'], death: ['../src/death.js', 'Death'],
  seccam: ['../src/seccam.js', 'Seccam'], fusebox: ['../src/fusebox.js', 'Fusebox'], intruder: ['../src/intruder.js', 'Intruder'],
  hud: ['../src/hud.js', 'Hud'], rain: ['../src/rain.js', 'Rain'], flashlight: ['../src/flashlight.js', 'Flashlight'],
  thought: ['../src/thought.js', 'Thought'], sounds: ['../src/ambience.js', 'Ambience'], bank: ['../src/sound.js', 'SoundBank'],
};
const methods = async ([file, name]) => {
  const cls = (await import(new URL(file, import.meta.url)))[name];
  const out = new Set();
  for (let p = cls.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) out.add(k);
  return out;
};

test('every sys.<system>.<method>() the story calls exists', async () => {
  const missing = [];
  for (const file of ['../src/story.js', '../src/story-events.js', '../src/endings.js']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const [, sys, method] of src.matchAll(/sys\.(\w+)\??\.(\w+)\??\.?\(/g)) {
      if (!CLASSES[sys]) continue;
      if (!(await methods(CLASSES[sys])).has(method)) missing.push(`${file.split('/').pop()}: sys.${sys}.${method}()`);
    }
  }
  assert.deepEqual(missing, []);
});
