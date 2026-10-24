// Recorded sound for the game (public/assets/audio/sfx.json + sfx/*.mp3, built by tools/audio/build.mjs from CC0 / CC BY
// recordings; credits in docs/CREDITS.md). Shares the Web Audio graph of ambience.js (context, listener, room reverb).
//  - Buses: effects, ambience, music (drones and stings), each with its own volume (settings), all under the master.
//  - One-shots placed in the flat reach the ear along open space: through the doorway on the way, never through a wall
//    (navgrid.js heardFrom), as far away as the walk really is; heard round a corner they lose some top end and gain
//    some room. `min` keeps story sounds audible wherever the player is.
//  - Loops (rain, room tone, the fridge, drones) are played by overlapping copies that cross-fade, so any recording
//    loops without a seam or a codec gap.
//  - Takes of many footsteps or creaks play one hit at a time (`segments`, picked at random).
//  - Files are fetched at loading; the ones needed at once are decoded then, the rest in the background.

const LAZY = new Set(['elevator', 'sirens_far', 'radio_chatter', 'knock_police', 'door_smash', 'door_kick', 'drone_deep',
  'sting_braam', 'sting_scare', 'sting_riser', 'keys_unlock', 'toilet', 'phone_ring', 'phone_static', 'phone_dial', 'boom']);

export class SoundBank {
  // ambience: an Ambience (its ctx, master and reverb); nav: a NavGrid for routing through doorways (optional, later).
  constructor(ambience) {
    this.amb = ambience;
    const ctx = this.ctx = ambience.ctx;
    this.buses = {};
    for (const name of ['sfx', 'amb', 'music', 'ui']) {
      const g = ctx.createGain(); g.connect(ambience.master); this.buses[name] = g;
    }
    this.manifest = {}; this.raw = new Map(); this.buffers = new Map(); this.decoding = new Map();
    this.nav = null;
    this.listener = { x: 0, y: 1.6, z: 0 };
    this.loops = new Set();
    this._timer = setInterval(() => this.tick(), 200);
  }

  setVolume(bus, v) { const g = this.buses[bus]; if (g) g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

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
    return { x: h.x, y: p.y, z: h.z, distance: h.distance, direct: h.direct };
  }

  // A one-shot. at: {x,y,z} | [x,y,z] | null (in the head). Options: gain, rate (number or [min,max]), segment (index or
  // 'random'), bus, send (reverb), ref/rolloff (distance model), min (lowest gain once placed), delay (s), occlude.
  play(key, opts = {}) {
    if (!this.manifest[key]) return null;
    const buffer = this.buffers.get(key);
    if (!buffer) { this.decode(key).then(() => this.play(key, opts)).catch(() => {}); return null; }
    const ctx = this.ctx, entry = this.manifest[key];
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const rate = Array.isArray(opts.rate) ? opts.rate[0] + Math.random() * (opts.rate[1] - opts.rate[0]) : (opts.rate ?? 1);
    src.playbackRate.value = rate;
    let offset = 0, duration;
    if (entry.segments && opts.segment !== undefined && opts.segment !== null) {
      const segs = entry.segments, i = opts.segment === 'random' ? Math.floor(Math.random() * segs.length) : Math.min(opts.segment, segs.length - 1);
      [offset, duration] = [segs[i][0], segs[i][1] - segs[i][0]];
    }
    const out = ctx.createGain(); out.gain.value = opts.gain ?? 1;
    let node = src, extra = [];
    const at = Array.isArray(opts.at) ? { x: opts.at[0], y: opts.at[1], z: opts.at[2] } : opts.at;
    let pan = null, send = opts.send ?? 0.25;
    if (at) {
      const r = opts.occlude === false ? { ...at, distance: Math.hypot(at.x - this.listener.x, at.z - this.listener.z), direct: true } : this.route(at);
      if (!r.direct) {
        // Round a corner: the top end drops (gently: a glass shatter must stay a glass shatter) and the room takes more.
        const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2500; shelf.gain.value = -Math.min(14, 4 + r.distance * 0.6);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(3200, 12000 - r.distance * 450); lp.Q.value = 0.5;
        node.connect(shelf); shelf.connect(lp); node = lp; extra = [shelf, lp];
        send = Math.min(1, send * 1.8 + 0.1);
      }
      pan = ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = opts.ref ?? 1; pan.rolloffFactor = opts.rolloff ?? 1; pan.maxDistance = 50;
      const place = r;
      // The panner sees the straight-line distance to where we put it; put it as far as the path is long.
      if (pan.positionX) { pan.positionX.value = place.x; pan.positionY.value = place.y; pan.positionZ.value = place.z; } else pan.setPosition(place.x, place.y, place.z);
      if (opts.min) {
        const d = Math.hypot(place.x - this.listener.x, place.z - this.listener.z);
        const expected = (opts.ref ?? 1) / ((opts.ref ?? 1) + (opts.rolloff ?? 1) * Math.max(0, d - (opts.ref ?? 1)));
        if (expected < opts.min) out.gain.value *= opts.min / expected;
      }
    }
    node.connect(out);
    const bus = this.buses[opts.bus || 'sfx'];
    const wet = ctx.createGain(); wet.gain.value = send;
    if (pan) { out.connect(pan); pan.connect(bus); } else out.connect(bus);
    out.connect(wet); wet.connect(this.amb.reverb);
    const t0 = ctx.currentTime + (opts.delay || 0);
    if (duration !== undefined) {
      // Short fade at the cut so a hit taken out of a take never clicks.
      const end = t0 + duration / rate;
      out.gain.setValueAtTime(out.gain.value, Math.max(t0, end - 0.03)); out.gain.linearRampToValueAtTime(0, end);
      src.start(t0, offset, duration + 0.01);
    } else src.start(t0, offset);
    src.onended = () => { for (const n of [src, out, wet, pan, ...extra]) n?.disconnect(); };
    return { source: src, gain: out, stop: (fade = 0.05) => { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, fade / 3); src.stop(t + fade + 0.05); } };
  }

  // A seamless bed: overlapping copies cross-faded every (length - xfade) seconds. Returns a handle:
  // { setGain(v, seconds), setPosition(p), stop(fade), playing }.
  loop(key, opts = {}) {
    if (!this.manifest[key]) return null;
    const ctx = this.ctx, handle = { key, opts, gain: ctx.createGain(), playing: true, sources: [], next: 0 };
    handle.gain.gain.value = 0;
    const at = Array.isArray(opts.at) ? { x: opts.at[0], y: opts.at[1], z: opts.at[2] } : opts.at;
    let input = handle.gain;
    if (at) {
      handle.at = at;
      const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2500; shelf.gain.value = 0;
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = opts.ref ?? 1; pan.rolloffFactor = opts.rolloff ?? 1; pan.maxDistance = 50;
      handle.gain.connect(shelf); shelf.connect(pan); pan.connect(this.buses[opts.bus || 'amb']);
      handle.pan = pan; handle.shelf = shelf;
      this.place(handle);
    } else handle.gain.connect(this.buses[opts.bus || 'amb']);
    if (opts.send) { const wet = ctx.createGain(); wet.gain.value = opts.send; handle.gain.connect(wet); wet.connect(this.amb.reverb); handle.wet = wet; }
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
    handle.shelf.gain.setTargetAtTime(r.direct ? 0 : -Math.min(14, 4 + r.distance * 0.6), this.ctx.currentTime, 0.3);
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
