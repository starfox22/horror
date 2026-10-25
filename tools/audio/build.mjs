// Builds the game's recorded sounds (public/assets/audio/sfx/*.mp3 + sfx.json) from tools/audio/sounds.json: real
// recordings (CC0 / CC BY) downloaded from the GitHub mirrors listed there, pinned by SHA-256 in sounds.lock.json.
// Processing only: trim, mono for sounds placed in the flat (HRTF works on mono), a high-pass where a recording carries
// a DC offset (`highpass`, Hz: the offset would count in the peak and click at the start), mixing a few recordings into
// one (`layers`), peak-normalise, fades, and for takes of many footsteps or creaks the onsets of each hit (sfx.json
// `segments`, so the game plays one at a time). No synthesis.
// Usage: node tools/audio/build.mjs [key ...]   (needs ffmpeg; with keys, only those are rebuilt and the rest of
// sfx.json is kept as it is)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LIST = 'tools/audio/sounds.json', LOCK = 'tools/audio/sounds.lock.json', MANIFEST = 'public/assets/audio/sfx.json';
const SRC = 'assets-src/audio', OUT = 'public/assets/audio/sfx', RATE = 44100;
mkdirSync(SRC, { recursive: true }); mkdirSync(OUT, { recursive: true });
const list = JSON.parse(readFileSync(LIST, 'utf8'));
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};
const only = process.argv.slice(2);
for (const key of only) if (!list[key]) throw new Error(`${key}: not in ${LIST}`);
const built = only.length && existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 28 });

// Raw float samples (interleaved) of a file after trim/high-pass/downmix.
function decode(file, { trim, mono, highpass }) {
  const args = [...(trim ? ['-ss', String(trim[0]), '-t', String(trim[1])] : []), '-i', file,
    ...(highpass ? ['-af', `highpass=f=${highpass}:p=2`] : []), '-ac', mono ? '1' : '2', '-ar', String(RATE), '-f', 'f32le', '-'];
  const buf = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 1 << 28 });
  return { data: new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4), channels: mono ? 1 : 2 };
}

// Onsets of single hits (footsteps, creaks, clicks): a 10 ms RMS envelope; a hit starts where it rises above 18 % of the
// take's loudest hit after a quiet gap, and lasts until the next hit (at most `max` seconds).
function onsets({ data, channels }, count, max = 0.7) {
  const win = Math.round(RATE * 0.01), frames = Math.floor(data.length / channels / win), env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * win * channels; i < (f + 1) * win * channels; i++) s += data[i] * data[i];
    env[f] = Math.sqrt(s / (win * channels));
  }
  const peak = Math.max(...env), hits = [];
  let quiet = 99;
  for (let f = 1; f < frames; f++) {
    if (env[f] > peak * 0.18 && env[f] > env[f - 1] * 1.6 && quiet >= 12) { hits.push(f); quiet = 0; }
    else if (env[f] < peak * 0.08) quiet++;
    else if (!hits.length || f - hits[hits.length - 1] > 25) quiet = Math.max(quiet, 0);
  }
  const strongest = hits.map((f, i) => ({ f, i, v: Math.max(...env.slice(f, f + 6)) })).sort((a, b) => b.v - a.v).slice(0, count).sort((a, b) => a.f - b.f);
  return strongest.map(({ f }, k) => {
    const next = hits.find(h => h > f) ?? frames, start = Math.max(0, f - 2) * 0.01;
    return [+start.toFixed(3), +Math.min(start + max, next * 0.01 - 0.01, frames * 0.01).toFixed(3)];
  }).filter(([a, b]) => b - a > 0.08);
}

// The file for `id` (a key, or key#n for its n-th layer): `local`, a recording already in the repository (e.g. the 0.12
// glass break), or the mirror's, downloaded once into assets-src/audio and checked against sounds.lock.json.
async function source(id, { local, mirror }) {
  const ext = ((local || mirror).match(/\.(\w+)$/) || [, 'bin'])[1].toLowerCase();
  const file = local || join(SRC, `${id.replace('#', '.')}.${ext}`);
  if (!existsSync(file)) {
    const response = await fetch(mirror);
    if (!response.ok) throw new Error(`${id}: HTTP ${response.status} from ${mirror}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (lock[id] && lock[id] !== sha256) throw new Error(`${id}: checksum differs from ${LOCK}`);
  lock[id] = sha256;
  return file;
}

// b mixed into a (same channel count) at `gain` (linear), starting `offset` frames in.
function mix(a, b, gain, offset) {
  const ch = a.channels, data = new Float32Array(Math.max(a.data.length, (offset * ch) + b.data.length));
  data.set(a.data);
  for (let i = 0; i < b.data.length; i++) data[offset * ch + i] += b.data[i] * gain;
  return { data, channels: ch };
}

const manifest = {};
for (const [key, s] of Object.entries(list)) {
  if (only.length && !only.includes(key)) { if (built[key]) manifest[key] = built[key]; continue; }
  let pcm = decode(await source(key, s), s);
  // `layers`: more real recordings mixed into the first ({ mirror, gain dB, delay s, trim, highpass }), for a sound no
  // single take sells (a bird against a window: a soft heavy thud and a pane's ring). Mixing only, no synthesis.
  for (const [i, layer] of (s.layers || []).entries()) {
    const more = decode(await source(`${key}#${i + 1}`, layer), { ...layer, mono: s.mono });
    pcm = mix(pcm, more, 10 ** ((layer.gain ?? 0) / 20), Math.round((layer.delay ?? 0) * RATE));
  }
  let max = 0;
  for (const v of pcm.data) max = Math.max(max, Math.abs(v));
  const gain = max > 0 ? 10 ** ((s.peak ?? -1) / 20) / max : 1;
  const duration = pcm.data.length / pcm.channels / RATE;
  const filters = [`volume=${gain.toFixed(4)}`];
  if (s.fade?.[0]) filters.push(`afade=t=in:d=${s.fade[0]}`);
  if (s.fade?.[1]) filters.push(`afade=t=out:st=${Math.max(0, duration - s.fade[1]).toFixed(3)}:d=${s.fade[1]}`);
  const raw = join(SRC, `${key}.f32`);
  writeFileSync(raw, Buffer.from(pcm.data.buffer, pcm.data.byteOffset, pcm.data.byteLength));
  ff(['-f', 'f32le', '-ar', String(RATE), '-ac', String(pcm.channels), '-i', raw, '-af', filters.join(','),
    '-c:a', 'libmp3lame', '-q:a', pcm.channels === 1 ? '5' : '4', join(OUT, `${key}.mp3`)]);
  const entry = { file: `sfx/${key}.mp3`, duration: +duration.toFixed(3), loop: !!s.loop,
    credit: { title: s.title, author: s.author, license: s.license, url: s.original } };
  if (s.slice) entry.segments = onsets(pcm, s.slice);
  manifest[key] = entry;
  console.log(key.padEnd(16), `${duration.toFixed(2)} s`, `gain ${(20 * Math.log10(gain)).toFixed(1)} dB`, entry.segments ? `${entry.segments.length} hits` : '');
}
writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n');
writeFileSync(MANIFEST, JSON.stringify(manifest));
