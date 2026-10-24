// Builds the game's recorded sounds (public/assets/audio/sfx/*.mp3 + sfx.json) from tools/audio/sounds.json: real
// recordings (CC0 / CC BY) downloaded from the GitHub mirrors listed there, pinned by SHA-256 in sounds.lock.json.
// Processing only: trim, mono for sounds placed in the flat (HRTF works on mono), peak-normalise, fades, and for takes of
// many footsteps or creaks the onsets of each hit (sfx.json `segments`, so the game plays one at a time). No synthesis.
// Usage: node tools/audio/build.mjs   (needs ffmpeg)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LIST = 'tools/audio/sounds.json', LOCK = 'tools/audio/sounds.lock.json';
const SRC = 'assets-src/audio', OUT = 'public/assets/audio/sfx', RATE = 44100;
mkdirSync(SRC, { recursive: true }); mkdirSync(OUT, { recursive: true });
const list = JSON.parse(readFileSync(LIST, 'utf8'));
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 28 });

// Raw float samples (interleaved) of a file after trim/downmix.
function decode(file, { trim, mono }) {
  const args = [...(trim ? ['-ss', String(trim[0]), '-t', String(trim[1])] : []), '-i', file, '-ac', mono ? '1' : '2', '-ar', String(RATE), '-f', 'f32le', '-'];
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

const manifest = {};
for (const [key, s] of Object.entries(list)) {
  // `local`: a recording already in the repository (e.g. the 0.12 glass break).
  const ext = ((s.local || s.mirror).match(/\.(\w+)$/) || [, 'bin'])[1].toLowerCase();
  const src = s.local || join(SRC, `${key}.${ext}`);
  if (!existsSync(src)) {
    const response = await fetch(s.mirror);
    if (!response.ok) throw new Error(`${key}: HTTP ${response.status} from ${s.mirror}`);
    writeFileSync(src, Buffer.from(await response.arrayBuffer()));
  }
  const sha256 = createHash('sha256').update(readFileSync(src)).digest('hex');
  if (lock[key] && lock[key] !== sha256) throw new Error(`${key}: checksum differs from ${LOCK}`);
  lock[key] = sha256;
  const pcm = decode(src, s);
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
writeFileSync('public/assets/audio/sfx.json', JSON.stringify(manifest));
