// Recorded sound for the game (public/assets/audio/sfx.json + sfx/*.mp3, built by tools/audio/build.mjs from CC0 / CC BY
// recordings; credits in docs/CREDITS.md). Shares the Web Audio graph of ambience.js (context, listener, room reverb,
// and the master chain that ends in a safety limiter).
//  - Buses: effects, ambience, music (drones and stings), the scare path, each with its own volume (settings: the scare
//    path follows "Music and stings"), all under the master. A bus's reverb send has the same volume, so each slider
//    takes its sounds' echo with it.
//  - One-shots placed in the flat reach the ear along open space: through the doorway on the way, never through a wall
//    (navgrid.js heardFrom), as far away as the walk really is; heard round a corner they lose some top end and gain
//    some room. `min` keeps story sounds audible wherever the player is (a floor on the distance roll-off).
//  - Scares (bank.scare, music.sting, and the recordings in SCARES such as the glass) duck the beds: every loop dips
//    for about a second, so the scare lands in a hole in the rain.
//  - Loops (rain, room tone, the fridge, drones) are played by overlapping copies that cross-fade, so any recording
//    loops without a seam or a codec gap.
//  - Takes of many footsteps or creaks play one hit at a time (`segments`, picked at random).
//  - Files are fetched at loading; the ones needed at once are decoded then, the rest in the background.

const LAZY = new Set(['elevator', 'sirens_far', 'radio_chatter', 'knock_police', 'door_smash', 'door_kick', 'drone_deep',
  'sting_braam', 'sting_scare', 'sting_riser', 'keys_unlock', 'toilet', 'phone_ring', 'phone_static', 'phone_dial', 'boom']);

// Recordings that are scares wherever they are played from (the glass, the bird against the window): the beds duck by
// `duck` dB for `hold` seconds under them. `bright`: round a corner they keep most of their top end (a glass shatter
// must stay a glass shatter: its energy is at 4-8 kHz, which the usual corner filter takes away). `level`: how much
// louder than asked it plays (the bird's thud is short and low: at its file's level it would not startle anyone).
export const SCARES = { glass_break: { duck: 10, hold: 1.1, bright: true }, window_thud: { duck: 10, hold: 1, level: 2 } };
export const BUSES = ['sfx', 'amb', 'music', 'ui', 'scare'];

// The corner filter for a sound heard round `distance` metres of corners: high-shelf cut (dB, at 2.5 kHz) and low-pass (Hz).
export const corner = (distance, bright = false) => bright
  ? { shelf: -Math.min(4, 1.5 + distance * 0.12), lowpass: Math.max(9000, 16000 - distance * 300) }
  : { shelf: -Math.min(14, 4 + distance * 0.6), lowpass: Math.max(3200, 12000 - distance * 450) };

export class SoundBank {
  // ambience: an Ambience (its ctx, master and reverb); nav: a NavGrid for routing through doorways (optional, later).
  constructor(ambience) {
    this.amb = ambience;
    const ctx = this.ctx = ambience.ctx;
    // Per bus: its volume (dry, to the master) and its reverb send at the same volume; loops (the beds) reach both
    // through the bus's bed gain and bed send, which a scare ducks.
    this.buses = {}; this.sends = {}; this.beds = {}; this.bedSends = {};
    for (const name of BUSES) {
      const g = this.buses[name] = ctx.createGain(); g.connect(ambience.master);
      const s = this.sends[name] = ctx.createGain(); s.connect(ambience.reverb);
      (this.beds[name] = ctx.createGain()).connect(g);
      (this.bedSends[name] = ctx.createGain()).connect(s);
    }
    this.manifest = {}; this.raw = new Map(); this.buffers = new Map(); this.decoding = new Map();
    this.nav = null;
    this.listener = { x: 0, y: 1.6, z: 0 };
    this.loops = new Set();
    this.ducked = { from: 0, until: 0, floor: 1, back: 1 };
    this.playing = new Set();               // one-shots playing or waiting to start (silence() stops them)
    this._timer = setInterval(() => this.tick(), 200);
  }

  // A bus's volume (settings). The scare path follows the music (the slider is "Music and stings").
  setVolume(bus, v) {
    for (const name of bus === 'music' ? ['music', 'scare'] : [bus]) {
      for (const g of [this.buses[name], this.sends[name]]) g?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  async load(base = './assets/audio/', progress = () => {}) {
    const url = (f) => new URL(`${base}${f}`, location.href);
    this.manifest = await fetch(url('sfx.json')).then(r => { if (!r.ok) throw new Error(`sfx.json: HTTP ${r.status}`); return r.json(); });
    const keys = Object.keys(this.manifest);
    let done = 0;
    await Promise.all(keys.map(async key => {
      const r = await fetch(url(this.manifest[key].file));
      if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
      this.raw.set(key, await r.arrayBuffer());
      progress(++done / keys.length / 2);
    }));
    const now = keys.filter(k => !LAZY.has(k));
    done = 0;
    await Promise.all(now.map(k => this.decode(k).then(() => progress(0.5 + ++done / now.length / 2))));
    // The rest while the player reads the menu.
    setTimeout(() => { for (const k of keys) if (LAZY.has(k)) this.decode(k).catch(() => {}); }, 1500);
    return this;
  }

  decode(key) {
    if (this.buffers.has(key)) return Promise.resolve(this.buffers.get(key));
    if (this.decoding.has(key)) return this.decoding.get(key);
    const raw = this.raw.get(key);
    if (!raw) return Promise.reject(new Error(`No sound ${key}`));
    const p = this.ctx.decodeAudioData(raw.slice(0)).then(buffer => { this.buffers.set(key, buffer); this.decoding.delete(key); this.raw.delete(key); return buffer; });
    this.decoding.set(key, p);
    return p;
  }

  has(key) { return !!this.manifest[key]; }

  // Where the listener is (the camera), each frame; used to route placed sounds.
  listen(p) { this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; }

  // Route a sound made at p to the listener: { pos (where to place the panner), distance (path metres), direct }.
  route(p) {
    const l = this.listener;
    if (!this.nav) return { x: p.x, y: p.y, z: p.z, distance: Math.hypot(p.x - l.x, p.z - l.z), direct: true };
    const h = this.nav.heardFrom(p, l);
    if (!Number.isFinite(h.distance)) return { x: p.x, y: p.y, z: p.z, distance: Math.hypot(p.x - l.x, p.z - l.z) * 1.5, direct: false };
    let { x, z } = h;
    // heardFrom puts the sound on the listener's head when not even the way's first corner is in sight (a door jamb
    // clips the line to it): it would play inside the head at full level from any distance (the living-room rain heard
    // in the bedroom, the glass in the kitchen). Send it along the way's first leg instead, as far away as the way is.
    if (h.distance > 0.3 && Math.hypot(x - l.x, z - l.z) < h.distance * 0.5) {
      const q = this.nav.path(l.x, l.z, p.x, p.z)?.points[1] ?? [p.x, p.z];
      let dx = q[0] - l.x, dz = q[1] - l.z, len = Math.hypot(dx, dz);
      if (len < 1e-3) { dx = p.x - l.x; dz = p.z - l.z; len = Math.hypot(dx, dz) || 1; }
      x = l.x + dx / len * h.distance; z = l.z + dz / len * h.distance;
    }
    return { x, y: p.y, z, distance: h.distance, direct: h.direct };
  }

  // The beds (every loop, and their echo) dip by `db` for `hold` seconds from `delay` s from now (reaching full depth
  // in ~40 ms), then come back over about `back` seconds. A deeper, longer duck already running is left alone; one
  // that overlaps it is merged (the deeper floor, the later end).
  duck(db = 10, hold = 1, delay = 0, back = 1) {
    const t = this.ctx.currentTime + Math.max(0, delay), floor = 10 ** (-Math.abs(db) / 20), until = t + hold;
    const d = this.ducked, on = d.until > t;
    if (on && d.until >= until && d.floor <= floor && d.from <= t && d.back >= back) return;
    Object.assign(d, { from: on ? Math.min(d.from, t) : t, until: on ? Math.max(until, d.until) : until,
      floor: on ? Math.min(floor, d.floor) : floor, back: on ? Math.max(back, d.back) : back });
    for (const g of [...Object.values(this.beds), ...Object.values(this.bedSends)]) {
      const p = g.gain;
      p.cancelScheduledValues(t);
      p.setTargetAtTime(d.floor, t, 0.012);
      p.setTargetAtTime(1, d.until, d.back / 3);
    }
  }

  // Black, and silence (death.js): every sound playing stops (and any waiting to start), the room's echo and all
  // the rest fade out over `fade` seconds and stay out for `hold`; then what plays next is heard at once, and the
  // beds come back slowly, over `back` seconds, as if waking.
  silence(fade = 0.4, hold = 0.5, back = 3) {
    const t = this.ctx.currentTime;
    for (const h of [...this.playing]) h.stop(fade);
    this.duck(90, fade + hold, 0, back);
    const f = this.amb.fader?.gain;
    if (f) { f.cancelScheduledValues(t); f.setTargetAtTime(0, t, fade / 3); f.setTargetAtTime(1, t + fade + hold, 0.04); }
  }

  // A jump scare: `key` at full level with the beds ducked under it so it lands. A sting in the head (no opts.at) goes
  // on the scare path (its own bus at the "Music and stings" volume) nearly dry; a scare placed in the flat (opts.at:
  // a kick, a hanger, his boots) is an effect (the effects volume) with the room's echo. Neither is ever ducked.
  // Options as play() (duck: dB, 10; hold: s, 1). Returns play()'s handle.
  scare(key, opts = {}) {
    return this.play(key, { gain: 1, bus: opts.at ? 'sfx' : 'scare', send: opts.at ? 0.25 : 0.12, duck: 10, hold: 1, ...opts });
  }

  // A one-shot. at: {x,y,z} | [x,y,z] | null (in the head). Options: gain, rate (number or [min,max]), segment (index or
  // 'random'), bus, send (reverb), ref/rolloff (distance model), min (lowest gain once placed), delay (s), occlude,
  // duck/hold (duck the beds by `duck` dB for `hold` s; SCARES sets them for its recordings).
  play(key, opts = {}) {
    if (!this.manifest[key]) return null;
    const buffer = this.buffers.get(key);
    if (!buffer) { this.decode(key).then(() => this.play(key, opts)).catch(() => {}); return null; }
    const ctx = this.ctx, entry = this.manifest[key], scare = SCARES[key];
    const duck = opts.duck ?? scare?.duck;
    if (duck) this.duck(duck, opts.hold ?? scare?.hold ?? 1, opts.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const rate = Array.isArray(opts.rate) ? opts.rate[0] + Math.random() * (opts.rate[1] - opts.rate[0]) : (opts.rate ?? 1);
    src.playbackRate.value = rate;
    let offset = 0, duration;
    if (entry.segments && opts.segment !== undefined && opts.segment !== null) {
      const segs = entry.segments, i = opts.segment === 'random' ? Math.floor(Math.random() * segs.length) : Math.min(opts.segment, segs.length - 1);
      [offset, duration] = [segs[i][0], segs[i][1] - segs[i][0]];
    }
    const out = ctx.createGain(); out.gain.value = (opts.gain ?? 1) * (scare?.level ?? 1);
    let node = src, extra = [];
    const at = Array.isArray(opts.at) ? { x: opts.at[0], y: opts.at[1], z: opts.at[2] } : opts.at;
    let pan = null, send = opts.send ?? 0.25;
    if (at) {
      const r = opts.occlude === false ? { ...at, distance: Math.hypot(at.x - this.listener.x, at.z - this.listener.z), direct: true } : this.route(at);
      if (!r.direct) {
        // Round a corner: the top end drops and the room takes more.
        const c = corner(r.distance, scare?.bright);
        const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2500; shelf.gain.value = c.shelf;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = c.lowpass; lp.Q.value = 0.5;
        node.connect(shelf); shelf.connect(lp); node = lp; extra = [shelf, lp];
        send = Math.min(1, send * 1.8 + 0.1);
      }
      pan = ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = opts.ref ?? 1; pan.rolloffFactor = opts.rolloff ?? 1; pan.maxDistance = 50;
      const place = r;
      // The panner sees the straight-line distance to where we put it; put it as far as the path is long.
      if (pan.positionX) { pan.positionX.value = place.x; pan.positionY.value = place.y; pan.positionZ.value = place.z; } else pan.setPosition(place.x, place.y, place.z);
      if (opts.min) {
        // The roll-off the panner will apply (its distance is 3-D: a glass on the floor is 1.5 m below the ear).
        const l = this.listener, d = Math.hypot(place.x - l.x, place.y - l.y, place.z - l.z), ref = opts.ref ?? 1;
        const expected = ref / (ref + (opts.rolloff ?? 1) * Math.max(0, d - ref));
        if (expected < opts.min) out.gain.value *= opts.min / expected;
      }
    }
    node.connect(out);
    const name = this.buses[opts.bus] ? opts.bus : 'sfx', bus = this.buses[name];
    const wet = ctx.createGain(); wet.gain.value = send;
    if (pan) { out.connect(pan); pan.connect(bus); } else out.connect(bus);
    out.connect(wet); wet.connect(this.sends[name]);
    const t0 = ctx.currentTime + (opts.delay || 0);
    if (duration !== undefined) {
      // Short fade at the cut so a hit taken out of a take never clicks.
      const end = t0 + duration / rate;
      out.gain.setValueAtTime(out.gain.value, Math.max(t0, end - 0.03)); out.gain.linearRampToValueAtTime(0, end);
      src.start(t0, offset, duration + 0.01);
    } else src.start(t0, offset);
    const handle = { source: src, gain: out, stop: (fade = 0.05) => { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, fade / 3); try { src.stop(t + fade + 0.05); } catch { /* already stopped */ } } };
    this.playing.add(handle);
    src.onended = () => { this.playing.delete(handle); for (const n of [src, out, wet, pan, ...extra]) n?.disconnect(); };
    return handle;
  }

  // A seamless bed: overlapping copies cross-faded every (length - xfade) seconds. Returns a handle:
  // { setGain(v, seconds), setPosition(p), stop(fade), playing }.
  // A short circuit's buzz ("tzzz"): mains hum harmonics and crackle through a hard clip, gated on for each window
  // [start, length] (seconds from now; start-ordered), its level jittering like an arcing contact. at: where (the
  // flat's lights overhead: null, in the head); gain; send (reverb).
  buzz(windows, { gain = 0.5, at = null, send = 0.25, bus = 'sfx' } = {}) {
    const ctx = this.ctx;
    if (!ctx?.createOscillator || !windows.length) return null;
    const t0 = ctx.currentTime + 0.02, end = t0 + Math.max(...windows.map(([s, l]) => s + l)) + 0.1;
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 100;
    const edge = ctx.createOscillator(); edge.type = 'square'; edge.frequency.value = 150.4;
    const edgeGain = ctx.createGain(); edgeGain.gain.value = 0.35;
    const clip = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 9);
    clip.curve = curve;
    const tone = ctx.createBiquadFilter(); tone.type = 'bandpass'; tone.frequency.value = 2100; tone.Q.value = 0.6;
    const noise = ctx.createBufferSource(), nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.25);   // crackle: sparse clicks in a hiss
    noise.buffer = nb; noise.loop = true;
    const hiss = ctx.createBiquadFilter(); hiss.type = 'highpass'; hiss.frequency.value = 2500;
    const hissGain = ctx.createGain(); hissGain.gain.value = 0.5;
    const gate = ctx.createGain(); gate.gain.value = 0;
    hum.connect(clip); edge.connect(edgeGain); edgeGain.connect(clip); clip.connect(tone); tone.connect(gate);
    noise.connect(hiss); hiss.connect(hissGain); hissGain.connect(gate);
    const g = gate.gain;
    g.setValueAtTime(0, t0);
    for (const [s, l] of windows) {
      const a = t0 + s, b = a + l;
      g.setValueAtTime(0, a); g.linearRampToValueAtTime(1, a + 0.008);
      for (let t = a + 0.02; t < b - 0.02; t += 0.018) g.setValueAtTime(0.45 + Math.random() * 0.55, t);   // the arc sputters
      g.setValueAtTime(g.value, Math.max(a + 0.01, b - 0.012)); g.linearRampToValueAtTime(0, b);
    }
    const out = ctx.createGain(); out.gain.value = gain;
    gate.connect(out);
    const name = this.buses[bus] ? bus : 'sfx';
    let pan = null;
    if (at) {
      const p = Array.isArray(at) ? { x: at[0], y: at[1], z: at[2] } : at;
      pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 2; pan.rolloffFactor = 1;
      if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z);
      out.connect(pan); pan.connect(this.buses[name]);
    } else out.connect(this.buses[name]);
    const wet = ctx.createGain(); wet.gain.value = send; out.connect(wet); wet.connect(this.sends[name]);
    for (const src of [hum, edge, noise]) { src.start(t0); src.stop(end); }
    const handle = { stop: (fade = 0.05) => { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, fade / 3); } };
    this.playing.add(handle);
    noise.onended = () => { this.playing.delete(handle); for (const n of [hum, edge, edgeGain, clip, tone, noise, hiss, hissGain, gate, out, wet, pan]) n?.disconnect(); };
    return handle;
  }

  loop(key, opts = {}) {
    if (!this.manifest[key]) return null;
    const ctx = this.ctx, handle = { key, opts, gain: ctx.createGain(), playing: true, sources: [], next: 0 };
    handle.gain.gain.value = 0;
    const at = Array.isArray(opts.at) ? { x: opts.at[0], y: opts.at[1], z: opts.at[2] } : opts.at;
    // A bed: through its bus's bed gain and bed send, which a scare ducks.
    const name = this.buses[opts.bus] ? opts.bus : 'amb', bed = this.beds[name];
    if (at) {
      handle.at = at;
      const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2500; shelf.gain.value = 0;
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = opts.ref ?? 1; pan.rolloffFactor = opts.rolloff ?? 1; pan.maxDistance = 50;
      handle.gain.connect(shelf); shelf.connect(pan); pan.connect(bed);
      handle.pan = pan; handle.shelf = shelf;
      this.place(handle);
    } else handle.gain.connect(bed);
    if (opts.send) { const wet = ctx.createGain(); wet.gain.value = opts.send; handle.gain.connect(wet); wet.connect(this.bedSends[name]); handle.wet = wet; }
    handle.target = opts.gain ?? 1;
    handle.gain.gain.setTargetAtTime(handle.target, ctx.currentTime, (opts.fadeIn ?? 1) / 3);
    handle.setGain = (v, seconds = 0.5) => { handle.target = v; handle.gain.gain.setTargetAtTime(v, ctx.currentTime, Math.max(0.01, seconds / 3)); };
    handle.setRate = (r) => { handle.rate = r; for (const s of handle.sources) s.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.3); };
    handle.setPosition = (p) => { handle.at = p; this.place(handle); };
    handle.stop = (fade = 1) => {
      if (!handle.playing) return;
      handle.playing = false; this.loops.delete(handle);
      const t = ctx.currentTime;
      handle.gain.gain.cancelScheduledValues(t); handle.gain.gain.setTargetAtTime(0, t, fade / 3);
      setTimeout(() => { for (const s of handle.sources) { try { s.stop(); } catch {} s.disconnect(); } handle.gain.disconnect(); handle.pan?.disconnect(); handle.shelf?.disconnect(); handle.wet?.disconnect(); }, fade * 1000 + 300);
    };
    this.loops.add(handle);
    this.decode(key).then(() => this.schedule(handle)).catch(() => {});
    return handle;
  }

  // Keeps two copies of a loop's buffer overlapping: each starts `xfade` before the last ends, fading in as it fades out.
  schedule(handle) {
    if (!handle.playing) return;
    const buffer = this.buffers.get(handle.key);
    if (!buffer) return;
    const ctx = this.ctx, xf = Math.min(2, buffer.duration * 0.25), len = buffer.duration;
    const rate = handle.rate ?? handle.opts.rate ?? 1;
    while (handle.next < ctx.currentTime + 1.5) {
      const t = Math.max(handle.next, ctx.currentTime + 0.02), src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer; src.playbackRate.value = rate;
      const first = !handle.sources.length, start = first ? Math.random() * len * 0.8 : 0, playLen = (len - start) / rate;
      g.gain.setValueAtTime(first ? 1 : 0, t);
      if (!first) g.gain.linearRampToValueAtTime(1, t + xf / rate);
      g.gain.setValueAtTime(1, t + playLen - xf / rate); g.gain.linearRampToValueAtTime(0, t + playLen);
      src.connect(g); g.connect(handle.gain);
      src.start(t, start); src.stop(t + playLen + 0.05);
      src.onended = () => { g.disconnect(); handle.sources = handle.sources.filter(s => s !== src); };
      handle.sources.push(src);
      handle.next = t + playLen - xf / rate;
    }
  }

  // Positional loops follow the listener's way round (doorways), recomputed when the listener moves a little.
  place(handle) {
    const r = this.route(handle.at);
    handle.route = r;
    const p = handle.pan;
    if (p.positionX) { p.positionX.value = r.x; p.positionY.value = r.y; p.positionZ.value = r.z; } else p.setPosition(r.x, r.y, r.z);
    handle.shelf.gain.setTargetAtTime(r.direct ? 0 : corner(r.distance).shelf, this.ctx.currentTime, 0.3);
  }

  tick() {
    const l = this.listener, moved = !this._last || Math.hypot(l.x - this._last.x, l.z - this._last.z) > 0.4;
    if (moved) this._last = { x: l.x, z: l.z };
    for (const h of this.loops) {
      this.schedule(h);
      if (moved && h.pan) this.place(h);
    }
  }
}
