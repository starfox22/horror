// Drives the real Player class (src/player.js) on the real walk grid at 60 updates/s, without a browser:
// walks a scripted route through the apartment and prints where the player ends up after each leg.
// Usage: node tools/check-walk.mjs [collision.json]
import { readFileSync } from 'node:fs';

const listeners = {};
globalThis.window = { addEventListener: (t, f) => (listeners[t] ||= []).push(f) };
globalThis.document = { addEventListener: () => {}, pointerLockElement: null };
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const { WalkGrid } = await import('../src/walkgrid.js');
const { Player } = await import('../src/player.js');

const grid = new WalkGrid(JSON.parse(readFileSync(process.argv[2] || 'public/assets/apartment/collision.json', 'utf8')));
const camera = { setPosition() {}, setEulerAngles() {} };
const player = new Player({ graphicsDevice: {} }, camera, grid, { x: 13.0, z: 3.55, yaw: 90 });
player.active = true;
const key = (type, code) => listeners[type].forEach(f => f({ code }));

// [yaw (0 = -z, 90 = -x, 180 = +z, -90 = +x), seconds walking forward]
const route = [[90, 9], [90, 4], [0, 2.5], [180, 1], [-90, 4], [0, 3], [90, 3]];
for (const [yaw, secs] of route) {
  player.yaw = yaw;
  key('keydown', 'KeyW');
  for (let t = 0; t < secs; t += 1 / 60) player.update(1 / 60);
  key('keyup', 'KeyW');
  for (let t = 0; t < 0.5; t += 1 / 60) player.update(1 / 60);
  console.log(`yaw ${String(yaw).padStart(3)} for ${secs}s → x ${player.pos.x.toFixed(2)} z ${player.pos.z.toFixed(2)} floor ${player.floor.toFixed(2)} (${player.surface()})`);
}
