// CPU regression checks for input, moving interaction handles, and interrupted device fades.
// Run: node --test tools/check-interactions.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Entity, Vec3 } from 'playcanvas';
import { Player } from '../src/player.js';
import { Interactions } from '../src/interact.js';
import { Closets } from '../src/closets.js';
import { Doors } from '../src/doors.js';
import { Devices } from '../src/devices.js';
import { DevMenu } from '../src/devmenu.js';
import { WalkGrid } from '../src/walkgrid.js';

function input() {
  const events = { window: {}, document: {} };
  const target = name => ({ addEventListener: (type, fn) => (events[name][type] ||= []).push(fn) });
  globalThis.window = target('window');
  globalThis.document = { ...target('document'), pointerLockElement: {},
    createElement: () => ({}), createTextNode: text => text };
  return (type, event = {}, source = 'window') => (events[source][type] || []).forEach(fn => fn(event));
}
const grid = () => new WalkGrid(JSON.parse(readFileSync(new URL('../public/assets/apartment/collision.json', import.meta.url), 'utf8')));
const ui = () => ({ replaceChildren() {}, classList: { add() {}, remove() {}, toggle() {} } });
const app = () => ({ root: new Entity('root'), on() {}, graphicsDevice: {} });

test('pausing stops movement and does not preserve keys entered in a menu', () => {
  const emit = input();
  const player = new Player({ graphicsDevice: {} }, { setPosition() {}, setEulerAngles() {} }, grid(), { x: 13, z: 3.55, yaw: 90 });
  player.active = true;
  emit('keydown', { code: 'KeyW' });
  for (let n = 0; n < 30; n++) player.update(1 / 60);
  assert.ok(player.pos.x < 12.7, 'the held movement key should move the real controller');
  const paused = player.pos.clone();
  player.active = false;
  player.update(1 / 60);
  assert.equal(player.pos.distance(paused), 0, 'pause must not retain inertial drift');
  emit('keydown', { code: 'KeyW' });
  player.active = true;
  player.update(1 / 60);
  assert.equal(player.pos.distance(paused), 0, 'menu key presses must not start movement on resume');
  emit('keydown', { code: 'KeyB', repeat: false });
  const bob = player.bobOn;
  emit('keydown', { code: 'KeyB', repeat: true });
  assert.equal(player.bobOn, bob, 'holding B must toggle once');
});

test('interaction rechecks busy objects, moved targets, and pointer lock between frames', () => {
  const emit = input();
  const camera = { getPosition: () => new Vec3(), forward: new Vec3(0, 0, -1) };
  const interactions = new Interactions(camera, ui(), ui());
  interactions.enabled = true;
  let uses = 0, busy = false;
  const item = interactions.add({ pos: new Vec3(0, 0, -1), label: () => 'Laptop', active: () => !busy,
    use: () => { uses++; busy = true; } });
  interactions.update();
  emit('keydown', { code: 'KeyE' });
  emit('keydown', { code: 'KeyE' });
  assert.equal(uses, 1, 'a second input in the same frame must not restart a busy device');
  busy = false;
  interactions.update();
  item.pos.z = -5;
  emit('keydown', { code: 'KeyE' });
  assert.equal(uses, 1, 'a target moved out of reach must not remain usable');
  item.pos.z = -1;
  document.pointerLockElement = null;
  emit('keydown', { code: 'KeyE' });
  assert.equal(uses, 1, 'paused input must not use the previous focus');
});

test('wardrobe interaction handles follow their hinged door and interrupted closing reverses', () => {
  input();
  const scene = app();
  // BuildInteriors only creates visual meshes; exercise the actual door constructor and animation.
  const original = Closets.prototype.buildInteriors;
  Closets.prototype.buildInteriors = () => {};
  const items = [];
  let closets;
  try {
    // Light components need a running graphics application; provide inert section lights here.
    const add = Entity.prototype.addComponent;
    Entity.prototype.addComponent = function (type, data) { this[type] = { ...data }; };
    try {
      closets = new Closets(scene, { findComponents: () => [] }, { add: item => items.push(item) }, null, grid());
    } finally { Entity.prototype.addComponent = add; }
  } finally { Closets.prototype.buildInteriors = original; }
  closets.player = { pos: new Vec3(12, 0, 0) };
  const door = closets.doors[0];
  const closed = items[0].pos.clone();
  closets.toggle(door);
  for (let n = 0; n < 120; n++) closets.update(1 / 60);
  assert.ok(items[0].pos.distance(closed) > 0.8, 'the prompt must move from its closed position');
  assert.equal(items[0].pos, door.handlePoint, 'the registered target must retain the moving vector');
  assert.match(items[0].label(), /^Close/);
  closets.toggle(door);
  // Stand on the door so it gets blocked while closing.
  const segment = door.segment();
  closets.player.pos.set((segment[0] + segment[2]) / 2, 0, (segment[1] + segment[3]) / 2);
  closets.update(1 / 60);
  assert.ok(door.target > 0, 'the closing door stopped at a partial angle');
  assert.match(items[0].label(), /^Open/);
  closets.toggle(door);
  assert.equal(door.target, 1, 'next use reopens a blocked closing door');
});

test('bathroom door reverses when a closing swing is blocked', () => {
  input();
  const scene = app(), part = new Entity('door leaf'), items = [];
  scene.root.addChild(part);
  const player = { pos: new Vec3(12, 0, 4) };
  const doors = new Doors(scene, { findComponents: () => [{ entity: part, meshInstances: [{ material: { name: 'door.bathdoor' } }] }] },
    { add: item => items.push(item) }, grid(), player, null);
  const door = doors.doors[0];
  doors.toggle(door);
  for (let n = 0; n < 180; n++) doors.update(1 / 60);
  doors.toggle(door);
  const segment = door.segment();
  player.pos.set((segment[0] + segment[2]) / 2, 0, (segment[1] + segment[3]) / 2);
  doors.update(1 / 60);
  assert.ok(door.target < -1, 'door should stop against the player');
  assert.match(items[0].label(), /^Open/);
  doors.toggle(door);
  assert.equal(door.target, door.open);
});

test('rapid lamp toggles cancel superseded fades and finish at the requested brightness', () => {
  const devices = Object.create(Devices.prototype);
  devices.tasks = [];
  let captures = 0;
  devices.onLightChange = () => captures++;
  const lamp = { on: true, level: 1, base: [1], lights: [{ light: {}, getPosition: () => new Vec3() }] };
  devices.toggleLamp(lamp);
  devices.update(0.04);
  devices.toggleLamp(lamp);
  devices.update(0.03);
  devices.toggleLamp(lamp);
  devices.update(0.2);
  assert.equal(lamp.on, false);
  assert.equal(lamp.level, 0);
  assert.equal(lamp.lights[0].light.enabled, false);
  assert.equal(devices.tasks.length, 0);
  assert.equal(captures, 1, 'only the settled final ramp should refresh lighting');
});

test('closing a laptop during its wake animation cannot relight the closed screen', () => {
  const devices = Object.create(Devices.prototype);
  devices.app = app();
  devices.tasks = [];
  let captures = 0;
  devices.onLightChange = () => captures++;
  const laptop = { open: false, angle: 89.4, power: 0, busy: false,
    setPower(k) { this.power = k; }, setAngle(a) { this.angle = a; } };
  devices.toggleLaptop(laptop);
  devices.toggleLaptop(laptop);
  assert.equal(laptop.open, true, 'busy lid ignores a duplicate use');
  devices.update(0.75);            // lid open, screen starts waking
  devices.update(0.15);
  assert.ok(laptop.power > 0 && laptop.power < 1);
  devices.toggleLaptop(laptop);   // close before its screen has finished waking
  for (let n = 0; n < 90; n++) devices.update(1 / 60);
  assert.equal(laptop.open, false);
  assert.equal(laptop.busy, false);
  assert.equal(laptop.power, 0);
  assert.equal(laptop.angle, 89.4);
  assert.equal(devices.tasks.length, 0);
  assert.equal(captures, 1, 'the completed sleep fade refreshes bounce lighting');
});

test('developer light controls work the devices themselves and hold nothing afterwards', () => {
  const devices = Object.create(Devices.prototype);
  devices.app = app(); devices.tasks = []; devices.lamps = [];
  for (const name of ['laptop glow', 'iMac glow']) {
    const entity = new Entity(name);
    entity.light = { intensity: 0.2, enabled: true };
    devices.app.root.addChild(entity);
  }
  const material = name => ({ name, emissiveIntensity: 1, update() {} });
  const screen = material('Screen_Shot.laptoplid');
  devices.materials = new Map([screen, material('Keylight'), material('Screen.imac'), material('Screen'),
    material('Coffee_Maker_Material5.coffee')].map(mat => [mat.name, mat]));
  const lid = new Entity('laptop lid');
  devices.app.root.addChild(lid);
  devices.renders = [{ entity: lid, meshInstances: [{ material: screen }] }];
  const interactions = { add() {} };
  devices.laptop = devices.makeLaptop(interactions);
  devices.computer = devices.makeComputer(interactions);
  const original = Entity.prototype.addComponent;
  Entity.prototype.addComponent = function (type, data) { this[type] = { ...data }; };
  try { devices.coffee = devices.makeCoffee(interactions); }
  finally { Entity.prototype.addComponent = original; }

  const menu = Object.create(DevMenu.prototype);
  menu.sys = { app: devices.app, switches: { rooms: [] }, devices };
  menu.entries = menu.collect(); menu.el = { hidden: true }; menu.refresh = () => {};
  const glows = [devices.laptop, devices.computer, devices.coffee].flatMap(device => device.glows);
  const levels = () => glows.map(({ mat }) => mat.emissiveIntensity);
  const originalLevels = levels();
  menu.update(0);
  assert.deepEqual(levels(), originalLevels, 'the panel changes nothing by being there');

  menu.all(false); clearTimeout(menu.timer);
  assert.ok(levels().every(level => level === 0), 'all-off must darken screens, keyboard and coffee panel');
  assert.ok(menu.entries.every(entry => entry.lights.every(({ e }) => !e.light.enabled)));
  assert.equal(devices.laptop.power, 0, 'all-off sets the laptop itself (its own state), as a press would');

  // Nothing is held: the devices' own changes show at once, every frame after.
  devices.laptop.setPower(0.6); devices.computer.set(0.7); devices.coffee.glow(0.4);
  menu.update(0); menu.update(0.6);
  assert.deepEqual(levels(), [0.55 * 0.6, 0.6 * 0.6, 0.5 * 0.7, 0.5 * 0.7, 1.4 * 0.4], 'native changes after the panel are not overridden');
  menu.all(true); clearTimeout(menu.timer);
  assert.deepEqual(levels(), glows.map(glow => glow.base));
  menu.reset(); clearTimeout(menu.timer);
  assert.deepEqual(levels(), originalLevels, 'Undo returns every device to its state before the first change from the panel');
  assert.equal(devices.laptop.power, 1);
  assert.equal(devices.coffee.level, 0);
});

test('developer code accepts deliberate typing without a frame-rate-dependent deadline', async () => {
  const { DevMenu } = await import('../src/devmenu.js');
  const emit = input();
  document.body = { appendChild() {} };
  const build = DevMenu.prototype.build;
  const originalPerformance = globalThis.performance;
  let clock = 1000;
  globalThis.performance = { now: () => clock };
  DevMenu.prototype.build = () => ui();
  try {
    const menu = new DevMenu({ app: app(), switches: { rooms: [] }, devices: { lamps: [] } });
    menu.setMode = enabled => { menu.mode = enabled; };
    emit('keydown', { key: 'd', repeat: true });
    assert.equal(menu.typed, '', 'key repeat must not enter the code');
    for (const key of 'developer') {
      clock += 1200;
      emit('keydown', { key, repeat: false });
    }
    assert.equal(menu.mode, true, 'slow deliberate typing must still open developer mode');
  } finally {
    DevMenu.prototype.build = build;
    globalThis.performance = originalPerformance;
  }
});

test('Undo returns lights with no control of their own to their state before the panel changed them', () => {
  const scene = app();
  const fixtures = [
    { name: 'closet light', light: { enabled: true, intensity: 0.25 } },
    { name: 'spare fixture', light: { enabled: false, intensity: 0.13 } },
  ];
  scene.root.findComponents = () => fixtures.map(entity => ({ ...entity.light, entity }));
  const menu = Object.create(DevMenu.prototype);
  menu.sys = { app: scene, switches: { rooms: [] }, devices: { lamps: [] } };
  menu.entries = menu.collect(); menu.el = { hidden: true }; menu.refresh = () => {};
  menu.all(false); clearTimeout(menu.timer);
  menu.update(0);
  assert.ok(fixtures.every(fixture => !fixture.light.enabled));
  menu.reset(); clearTimeout(menu.timer);
  assert.deepEqual(fixtures.map(fixture => fixture.light), [
    { enabled: true, intensity: 0.25 }, { enabled: false, intensity: 0.13 },
  ], 'unowned lights must return to their original enabled state and brightness');
});

test('the refrigerator lamp set from the panel is set once: the door takes it back', () => {
  const scene = app();
  const light = { name: 'refrigerator interior', light: { enabled: false, intensity: 0 } };
  const glow = { emissiveIntensity: 0, update() {} };
  const fridge = { light, glow, baseIntensity: 0.3, open: false,
    applyLighting() { light.light.enabled = this.open; light.light.intensity = this.open ? this.baseIntensity : 0; glow.emissiveIntensity = this.open ? 2 : 0; } };
  scene.root.findComponents = () => [{ ...light.light, entity: light }];
  const menu = Object.create(DevMenu.prototype);
  menu.sys = { app: scene, switches: { rooms: [] }, devices: { lamps: [] }, fridge };
  menu.entries = menu.collect(); menu.el = { hidden: true }; menu.refresh = () => {};
  assert.equal(menu.entries.length, 1, 'the fridge must have one owner rather than a startup snapshot');
  const entry = menu.entries[0];
  fridge.open = true; fridge.applyLighting();
  menu.set(entry, false); menu.update(0);
  assert.equal(light.light.enabled, false); assert.equal(glow.emissiveIntensity, 0);
  fridge.applyLighting();                                  // the door moves: its own logic again, nothing held
  assert.equal(light.light.enabled, true); assert.equal(light.light.intensity, 0.3); assert.equal(glow.emissiveIntensity, 2);
  menu.set(entry, false);
  fridge.open = false; menu.reset(); clearTimeout(menu.timer);
  assert.equal(light.light.enabled, false); assert.equal(glow.emissiveIntensity, 0, 'Undo leaves it to the door: shut, dark');
});
