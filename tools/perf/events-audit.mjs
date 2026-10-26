// Every developer-menu event in the real game (build 0.15): the night begun, then each event of story-events.js queued
// as the developer menu queues it (chosen while paused: nothing may happen; then 3 s of play: it must run), and what it
// did afterwards: the sounds it played, the thoughts, the flags, the power, the man, the phone, the camera, a death or an
// ending. An event that changes nothing a player could see or hear is reported as dead. Three passes: in story order
// from a fresh night, again in reverse order (each from a later night than its own: the developer picks any of them at
// any time), then the endings one after another.
// node tools/perf/events-audit.mjs <dist-dir> <out.json> [--shots <dir>] [--endings]
// Software rendering loads the flat in minutes: run it in the background and poll its output.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, resolve, relative, join } from 'node:path';

const args = process.argv.slice(2);
const [dist, outFile] = args;
if (!dist || !outFile) throw new Error('Usage: node tools/perf/events-audit.mjs <dist-dir> <out.json> [--shots <dir>]');
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) await mkdir(shots, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const root = resolve(dist);
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(req.url.split(/[?#]/)[0]);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(3600000);
const problems = [];
page.on('pageerror', e => problems.push(`pageerror ${e}`));
page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push(`console ${m.text()}`); });
// The bedroom doorway, looking down the corridor towards the front door (the sighting's corridor, a window in reach).
await page.goto(`http://127.0.0.1:${server.address().port}/#webgl&q=1&play&shot=10.4,3.2,-90,0`);
await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 3600000 });
const started = Date.now();

// In the page: hooks that record what the game does, and one event's run.
await page.evaluate(() => {
  const s = window.__app;
  s.startNight({ difficulty: 'normal' });
  s.audit = { sounds: [], says: [], voices: [] };
  const play = s.bank.play.bind(s.bank);
  s.bank.play = (key, opts) => { s.audit.sounds.push(key); return play(key, opts); };
  if (s.bank.scare) { const scare = s.bank.scare.bind(s.bank); s.bank.scare = (key, opts) => { s.audit.sounds.push(`scare:${key}`); return scare(key, opts); }; }
  const say = s.thought.say.bind(s.thought);
  s.thought.say = (text, opts) => { s.audit.says.push(text); return say(text, opts); };
  const voice = s.hud.voice.bind(s.hud);
  s.hud.voice = (who, text) => { s.audit.voices.push(`${who}: ${text}`); return voice(who, text); };
  const realPlaying = s.events.isPlaying;
  s.snap = () => {
    const p = s.power, man = s.intruder;
    return {
      flags: [...s.story.flags].sort(), act: s.story.act,
      power: { main: p.main, rcd: p.rcd, breakers: { ...p.breakers }, lit: Object.keys(p.breakers).filter(c => p.live(c)) },
      lightsOn: s.switches.rooms.filter(r => r.on && r.lights.some(l => l.light?.enabled && l.light.intensity > 0.01)).map(r => r.id),
      man: { visible: !!man.root?.enabled, at: [+man.pos.x.toFixed(2), +man.pos.z.toFixed(2)], clip: man.clip },
      phone: { booted: s.phone.booted, booting: s.phone.booting, lit: +s.phone.lit.toFixed(1), app: s.phone.app_ },
      seccam: !!s.seccam.scene, hunt: !!s.hunt.active, death: !!s.death.busy, ending: !!s.endings.running,
      crow: !!s.crow.flight, tap: s.taps?.isOn?.('bathroom') ?? null, wardrobeRight: +(s.closets.doors.find(d => d.id === 'right')?.angle ?? 0).toFixed(2),
      nest: { hatch: !!s.nest.hatchOpen, packed: !!s.nest.packed },
    };
  };
  // Play time by hand (software rendering runs at about a frame a second), a little at a time: one long synchronous
  // loop crashed the page. playing false: paused (the developer menu's pick must wait).
  s.step = (seconds, playing) => {
    s.events.isPlaying = () => playing;
    for (let t = 0; t < seconds - 1e-9; t += 1 / 30) s.app.fire('update', 1 / 30);
    s.events.isPlaying = realPlaying;
    return s.events.log.length;
  };
  s.begin = (id) => {
    s.audit.before = s.snap(); s.audit.logged = s.events.log.length;
    s.audit.sounds.length = s.audit.says.length = s.audit.voices.length = 0;
    return !!s.events.queue(id);
  };
  s.finish = (id, ranAt, playedWhilePaused) => {
    const after = s.snap(), before = s.audit.before, diff = {};
    for (const k of Object.keys(after)) if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) diff[k] = { from: before[k], to: after[k] };
    const did = { sounds: [...new Set(s.audit.sounds)], says: [...s.audit.says], voices: [...s.audit.voices] };
    const alive = did.sounds.length || did.says.length || did.voices.length || Object.keys(diff).length;
    return { id, playedWhilePaused, ranAt, ran: s.events.log.length > s.audit.logged, alive: !!alive, did, diff };
  };
});

const results = [];
const ids = await page.evaluate(() => window.__app.events.events.map(e => e.id));
const endings = ids.filter(id => id.startsWith('end-'));
const story = ids.filter(id => !id.startsWith('end-'));
const run = async (pass, id) => {
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  if (!await ev(id => window.__app.begin(id), id)) { results.push({ pass, id, error: 'unknown id' }); return; }
  const logged = await ev(() => window.__app.audit.logged);
  let n = 0;
  for (let i = 0; i < 4; i++) n = await ev(() => window.__app.step(0.5, false));      // 2 s paused
  const playedWhilePaused = n - logged;
  let t = 0;
  while (n === logged && t < 6) { n = await ev(() => window.__app.step(0.25, true)); t += 0.25; }
  for (let i = 0; i < 16; i++) await ev(() => window.__app.step(0.5, true));        // 8 s more
  const r = await ev(([id, t, p]) => window.__app.finish(id, t, p), [id, +t.toFixed(2), playedWhilePaused]);
  // A death or an ending runs on: wait it out (its own timers) before the next one, as a developer would.
  for (let i = 0; i < 30 && await ev(() => !!(window.__app.death.busy || window.__app.story.dying)); i++) await ev(() => window.__app.step(1, true));
  results.push({ pass, ...r });
  if (shots) await page.screenshot({ path: join(shots, `${pass}-${id}.jpg`), quality: 70 });
  console.log(`${pass} ${id}: ${r.ran ? 'ran' : 'DID NOT RUN'}${r.playedWhilePaused ? ' (while paused!)' : ''} ${r.alive ? 'alive' : 'DEAD'} ` +
    `${JSON.stringify({ sounds: r.did?.sounds?.slice(0, 8), says: r.did?.says, changed: Object.keys(r.diff || {}) })}`);
};
// --endings: only the endings (they need no night behind them).
if (!args.includes('--endings')) {
  for (const id of story) await run('order', id);
  for (const id of [...story].reverse()) await run('again', id);
}
for (const id of endings) {
  await run('ending', id);
  // The next ending from a night that has not ended (an ending stops play: the developer would start a new night).
  for (let i = 0; i < 30; i++) await page.evaluate(() => window.__app.step(1, true));
  await page.evaluate(() => { const s = window.__app; s.endings.running = null; s.story.flags.delete('ended'); s.menu?.close?.(); });
}
await writeFile(outFile, JSON.stringify({ seconds: Math.round((Date.now() - started) / 1000), problems, results }, null, 1));
const dead = results.filter(r => !r.ran || !r.alive || r.playedWhilePaused);
console.log(`dead or wrong: ${dead.map(r => `${r.pass}:${r.id}`).join(', ') || 'none'}; problems: ${problems.length}`);
await browser.close();
server.close();
