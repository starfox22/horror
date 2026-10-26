// Audit every developer event in story order, reverse order, then endings.
// Usage: node tools/perf/events-audit.mjs <dist-dir> <out.json> [--shots dir] [--endings]
// The real Director is manually clocked; background RAF cannot shorten its 3 s
// delay. Errors, dead events, pause violations and late/early execution fail.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, resolve, relative, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);

export function failuresFor(report) {
  const failures = [...(report.problems || [])];
  if (!report.initialized) failures.push('game did not initialize');
  if (report.error) failures.push(report.error);
  if (!report.results?.length) failures.push('no events audited');
  for (const r of report.results || []) {
    const name = `${r.pass}:${r.id}`;
    if (r.error) failures.push(`${name}: ${r.error}`);
    if (!r.ran) failures.push(`${name}: did not execute`);
    if (!r.alive) failures.push(`${name}: no observable effect`);
    if (r.playedWhilePaused) failures.push(`${name}: played while paused`);
    if (r.ran && (!Number.isFinite(r.ranAt) || r.ranAt > 3.25 || r.ranAt < 2.99)) failures.push(`${name}: wrong delay ${r.ranAt}`);
  }
  return failures;
}

async function main() {
  const args = process.argv.slice(2), [dist, outFile] = args;
  if (!dist || !outFile) throw new Error('Usage: events-audit.mjs <dist-dir> <out.json> [--shots dir] [--endings]');
  const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
  if (args.includes('--shots') && (!shots || shots.startsWith('--'))) throw new Error('Missing --shots directory');
  const { chromium } = require('playwright');
  const started = Date.now(), report = { initialized: false, problems: [], results: [], timing: 'Director advanced only by the audit clock; native RAF continues rendering; shared pause predicate checked' };
  let server, browser;
  try {
    if (shots) await mkdir(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const root = resolve(dist);
server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(req.url.split(/[?#]/)[0]);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(3600000);
const problems = report.problems;
const optional = (address, status = 404) => status === 404 && /\/(?:assets\/apartment\/apartment\.json|favicon\.ico)$/.test(new URL(address, 'http://127.0.0.1').pathname);
page.on('pageerror', e => problems.push(`pageerror ${e}`));
page.on('console', m => { if (m.type() === 'error' && !optional(m.location().url || '/')) problems.push(`console ${m.text()}`); });
page.on('response', r => { if (r.status() >= 400 && !optional(r.url(), r.status())) problems.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('requestfailed', r => { if (!optional(r.url())) problems.push(`request failed ${r.url()} ${r.failure()?.errorText}`); });
// The bedroom doorway, looking down the corridor towards the front door (the sighting's corridor, a window in reach).
await page.goto(`http://127.0.0.1:${server.address().port}/#webgl&q=1&play&shot=10.4,3.2,-90,0`);
await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 3600000 });
const startup = await page.evaluate(() => window.__state);
if (!startup?.ready || startup.error) throw new Error(`Initialization failed: ${JSON.stringify(startup)}`);
report.initialized = true;
console.log('initialized', JSON.stringify(startup));

// Exercise the real constructor state and legacy continuation in the final bundle,
// before the event harness deliberately resets the story through developer cases.
report.phoneChecks = await page.evaluate(() => {
  const s = window.__app, ph = s.phone, original = ph.save(), hadFlag = s.story.has('phone'), checks = [];
  const check = (name, pass) => { if (!pass) throw new Error(name); checks.push({ name, pass: true }); };
  check('new night starts with a charged, booted phone', ph.charge === 100 && ph.booted && ph.onCharger);
  ph.takeFromCharger(); ph.toggle();
  for (let i = 0; i < 30; i++) ph.update(0.05);
  check('actual first pickup immediately displays the working lock screen', ph.has && ph.holder.enabled && ph.app_ === 'lock' && !ph.charging && ph.booting === null);
  const at = ph.holder.getLocalPosition().clone(), rotation = ph.holder.getLocalRotation().clone();
  for (let i = 0; i < 20; i++) ph.update(0);
  check('held phone pose freezes during pause', at.equals(ph.holder.getLocalPosition()) && rotation.equals(ph.holder.getLocalRotation()));
  ph.load({ ...original, charge: 0, booted: false });
  check('legacy dead-phone continuation is charged and clears transient hand/video state', ph.charge === 100 && ph.booted && !ph.holder.enabled && !ph.video.enabled && !ph.handCarrier?.enabled);
  ph.load(original);
  if (!hadFlag) s.story.flags.delete('phone');
  return checks;
});
console.log('phone checks', JSON.stringify(report.phoneChecks));

// In the page: hooks that record what the game does, and one event's run.
await page.evaluate(() => {
  const s = window.__app;
  s.startNight({ difficulty: 'normal' });
  s.audit = { sounds: [], says: [], voices: [], playing: false };
  // Only the explicit audit clock advances the Director. Native RAF keeps
  // rendering, but must not add uncounted play time between protocol calls.
  s.app.off('update', s.events._update);
  const play = s.bank.play.bind(s.bank);
  s.bank.play = (key, opts) => { s.audit.sounds.push(key); return play(key, opts); };
  if (s.bank.scare) { const scare = s.bank.scare.bind(s.bank); s.bank.scare = (key, opts) => { s.audit.sounds.push(`scare:${key}`); return scare(key, opts); }; }
  const say = s.thought.say.bind(s.thought);
  s.thought.say = (text, opts) => { s.audit.says.push(text); return say(text, opts); };
  const voice = s.hud.voice.bind(s.hud);
  s.hud.voice = (who, text) => { s.audit.voices.push(`${who}: ${text}`); return voice(who, text); };
  const realPlaying = s.events.isPlaying;
  s.events.isPlaying = () => s.audit.playing && realPlaying();
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
    s.audit.playing = playing;
    // This is the real shared pause predicate (#play still respects reading),
    // so story, death, phone, power and the intruder stand still as well.
    s.hud.reading = !playing;
    for (let t = 0; t < seconds - 1e-9; t += 1 / 30) { s.app.fire('update', 1 / 30); s.events.update(1 / 30); }
    return s.events.log.slice(s.audit.logged).filter(e => e.how === 'manual' && e.id === s.audit.current).length;
  };
  s.begin = (id) => {
    s.audit.current = id;
    s.audit.playing = false; s.hud.reading = true;
    s.audit.before = s.snap(); s.audit.logged = s.events.log.length;
    s.audit.sounds.length = s.audit.says.length = s.audit.voices.length = 0;
    return !!s.events.queue(id);
  };
  s.finish = (id, ranAt, playedWhilePaused) => {
    const after = s.snap(), before = s.audit.before, diff = {};
    for (const k of Object.keys(after)) if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) diff[k] = { from: before[k], to: after[k] };
    const did = { sounds: [...new Set(s.audit.sounds)], says: [...s.audit.says], voices: [...s.audit.voices] };
    const alive = did.sounds.length || did.says.length || did.voices.length || Object.keys(diff).length;
    return { id, playedWhilePaused, ranAt, ran: s.events.log.slice(s.audit.logged).some(e => e.how === 'manual' && e.id === id), alive: !!alive, did, diff };
  };
});

const results = report.results;
const ids = await page.evaluate(() => window.__app.events.events.map(e => e.id));
const endings = ids.filter(id => id.startsWith('end-'));
const story = ids.filter(id => !id.startsWith('end-'));
const run = async (pass, id) => {
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  if (!await ev(id => window.__app.begin(id), id)) { results.push({ pass, id, error: 'unknown id' }); return; }
  const logged = 0;        // count this exact queued manual event, not unrelated story runs
  let n = 0;
  for (let i = 0; i < 4; i++) n = await ev(() => window.__app.step(0.5, false));      // 2 s paused
  const playedWhilePaused = n - logged;
  let t = 0;
  while (n === logged && t < 6) { n = await ev(() => window.__app.step(0.25, true)); t += 0.25; }
  for (let i = 0; i < 16; i++) await ev(() => window.__app.step(0.5, true));        // 8 s more
  const r = await ev(([id, t, p]) => window.__app.finish(id, t, p), [id, n > 0 ? +t.toFixed(2) : null, playedWhilePaused]);
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


  } catch (error) { report.error = String(error?.stack || error); }
  finally {
    await browser?.close().catch(error => report.problems.push(`browser cleanup ${error}`));
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  }
  report.seconds = Math.round((Date.now() - started) / 1000);
  report.failures = failuresFor(report);
  report.status = report.failures.length ? 'FAIL' : 'PASS';
  await mkdir(dirname(resolve(outFile)), { recursive: true });
  await writeFile(outFile, JSON.stringify(report, null, 2) + '\n');
  console.log('status', report.status, JSON.stringify(report.failures));
  if (report.failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
