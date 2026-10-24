import { COFFEE_TIMING } from './coffee-cycle.js';

// Night ambience, synthesised with the Web Audio API (no audio files yet; see docs/HANDOFF.md for replacing these
// with downloaded CC0 recordings): rain on the windows, room tone, the fridge's hum, a dripping kitchen tap, distant
// city rumble, and footsteps on wood or stone. Positional sources use HRTF panning and a generated room reverb.

const WINDOW_SPOTS = [[-6.4, 1.5, 1.5], [-3.5, 1.6, -1.4], [-0.5, 1.6, -1.4], [4.5, 1.6, -1.4], [11.5, 1.6, -1.4]];
const FRIDGE = [1.55, 1.1, -0.66];
const TAP = [-2.62, 0.95, -1.02];

export class Ambience {
  constructor() {
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(1.6, 2.8);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);
    this.noise = this.noiseBuffer(6, 'pink');
    this.brown = this.noiseBuffer(6, 'brown');

    this.roomTone();
    this.cityRumble();
    for (const p of WINDOW_SPOTS) this.rainAt(p);
    this.rainBed();
    this.fridge();
    this.drips();
  }

  start() {
    this.ctx.resume();
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 1.5);
  }

  pause(on) { on ? this.ctx.suspend() : this.ctx.resume(); }

  // Listener follows the camera (position + forward/up vectors).
  listen(pos, fwd, up) {
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02); L.upY.setTargetAtTime(up.y, t, 0.02); L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // --- building blocks -------------------------------------------------------------------------------------------
  noiseBuffer(seconds, color) {
    const n = Math.floor(seconds * this.ctx.sampleRate);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
      }
      // crossfade the ends so the loop has no click
      const f = Math.floor(this.ctx.sampleRate * 0.05);
      for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); }
    }
    return buf;
  }

  impulse(seconds, decay) {
    const n = Math.floor(seconds * this.ctx.sampleRate);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 200 ? i / 200 : 1);
    }
    return buf;
  }

  loop(buffer, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = true;
    s.start(0, offset % buffer.duration);
    return s;
  }

  panner(p, ref = 1, rolloff = 1.2) {
    const pn = this.ctx.createPanner();
    pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = ref; pn.rolloffFactor = rolloff; pn.maxDistance = 40;
    if (pn.positionX) { pn.positionX.value = p[0]; pn.positionY.value = p[1]; pn.positionZ.value = p[2]; } else pn.setPosition(...p);
    return pn;
  }

  filter(type, freq, q = 0.7) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
  gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  // Positional source → dry to master, a little to the reverb.
  place(node, p, ref, rolloff, send = 0.25) {
    const pn = this.panner(p, ref, rolloff);
    node.connect(pn);
    pn.connect(this.master);
    pn.connect(this.gain(send)).connect(this.reverb);
  }

  // A recorded one-shot at `p`: `muffle` (Hz) low-passes it as heard through walls or a doorway; `send` is how much
  // reaches the room reverb. Returns the source (already started).
  sample(buffer, p, { gain = 1, muffle = null, send = 0.35, ref = 1.5, rolloff = 1, delay = 0 } = {}) {
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    let node = src;
    if (muffle) { const lp = this.filter('lowpass', muffle, 0.6); node.connect(lp); node = lp; }
    const g = this.gain(gain); node.connect(g);
    const pn = this.panner(p, ref, rolloff), wet = this.gain(send);
    g.connect(pn); pn.connect(this.master); g.connect(wet).connect(this.reverb);
    src.onended = () => { g.disconnect(); pn.disconnect(); wet.disconnect(); };
    src.start(this.ctx.currentTime + delay);
    return src;
  }

  // --- sounds ----------------------------------------------------------------------------------------------------
  roomTone() {
    this.loop(this.brown).connect(this.filter('lowpass', 160)).connect(this.gain(0.05)).connect(this.master);
  }

  cityRumble() {
    const g = this.gain(0.025);
    this.loop(this.brown, 2.3).connect(this.filter('lowpass', 90)).connect(g).connect(this.master);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.035;
    const depth = this.gain(0.015); lfo.connect(depth).connect(g.gain); lfo.start();
  }

  rainAt(p) {
    const src = this.loop(this.noise, Math.random() * 6);
    const chain = src.connect(this.filter('highpass', 500)).connect(this.filter('lowpass', 6500)).connect(this.gain(0.09));
    this.place(chain, p, 1.2, 1.4, 0.15);
  }

  rainBed() {
    // Far rain on the building, heard everywhere, plus random droplets ticking on the glass.
    this.loop(this.noise, 3.1).connect(this.filter('bandpass', 1400, 0.4)).connect(this.gain(0.035)).connect(this.master);
    // One positioned input per window; each droplet is a short-lived source feeding one of them.
    const inputs = WINDOW_SPOTS.map((p) => { const g = this.gain(1); this.place(g, p, 0.8, 1.6, 0.1); return g; });
    const tick = () => {
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.3, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      const bp = this.filter('bandpass', 2500 + Math.random() * 3000, 4);
      s.connect(bp).connect(g).connect(inputs[Math.floor(Math.random() * inputs.length)]);
      s.onended = () => g.disconnect();
      s.start(t, Math.random() * 5, 0.05);
      setTimeout(tick, 30 + Math.random() * 160);
    };
    tick();
  }

  fridge() {
    const out = this.gain(0.0);
    for (const [f, a] of [[50, 0.5], [100, 0.35], [150, 0.12], [247, 0.04]]) {
      const o = this.ctx.createOscillator(); o.frequency.value = f; o.connect(this.gain(a)).connect(out); o.start();
    }
    this.loop(this.brown, 1.2).connect(this.filter('bandpass', 180, 1.5)).connect(this.gain(0.6)).connect(out);
    this.place(out, FRIDGE, 0.5, 1.6, 0.1);
    // The compressor runs for ~70 s, rests ~40 s.
    const cycle = (on) => {
      out.gain.setTargetAtTime(on ? 0.06 : 0.0, this.ctx.currentTime, on ? 1.5 : 0.6);
      setTimeout(() => cycle(!on), (on ? 70 : 40) * 1000 * (0.8 + Math.random() * 0.4));
    };
    cycle(true);
  }

  drips() {
    const tap = this.gain(1);
    this.place(tap, TAP, 0.4, 1.8, 0.6);
    const drip = () => {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1500 + Math.random() * 400, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.05);
      const g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(tap); o.start(t); o.stop(t + 0.12);
      o.onended = () => g.disconnect();
      setTimeout(drip, 2300 + Math.random() * 2600);
    };
    setTimeout(drip, 3000);
  }

  // Where a one-shot plays: positioned at p (HRTF, falls off with distance) or straight to the mix. Returns the input
  // node and a cleanup function.
  out(p, send = 0.3) {
    const g = this.gain(1), s = this.gain(send);
    if (p) {
      const pn = this.panner(Array.isArray(p) ? p : [p.x, p.y, p.z], 0.6, 1.3);
      g.connect(pn); pn.connect(this.master); pn.connect(s).connect(this.reverb);
      return [g, () => { g.disconnect(); pn.disconnect(); s.disconnect(); }];
    }
    g.connect(this.master); g.connect(s).connect(this.reverb);
    return [g, () => { g.disconnect(); s.disconnect(); }];
  }

  // Noise through a band-pass with an attack/decay envelope, at time t (s from now), into dest.
  burst(dest, { t = 0, freq, q = 1, level, attack = 0.003, decay = 0.05, glide = null, type = 'bandpass', buffer = this.noise }) {
    const t0 = this.ctx.currentTime + t;
    const n = this.ctx.createBufferSource(); n.buffer = buffer;
    const f = this.filter(type, freq, q);
    if (glide) { f.frequency.setValueAtTime(freq, t0); f.frequency.exponentialRampToValueAtTime(glide, t0 + attack + decay); }
    const g = this.gain(0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    n.connect(f).connect(g).connect(dest);
    n.start(t0, Math.random() * 4, attack + decay + 0.05);
    n.onended = () => g.disconnect();
  }

  // A sine/triangle tone with an envelope (beeps, chime partials, the body of a knock).
  tone(dest, { t = 0, freq, to = null, level, attack = 0.005, decay = 0.2, type = 'sine' }) {
    const t0 = this.ctx.currentTime + t;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
    const g = this.gain(0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    o.connect(g).connect(dest); o.start(t0); o.stop(t0 + attack + decay + 0.05);
    o.onended = () => g.disconnect();
  }

  // A short percussive tick: band-passed noise burst (+ optional low body), for switches and the flashlight button.
  click(freq, level, body = 0, p = null) {
    if (p) {
      const [dest, done] = this.out(p, 0.3);
      this.burst(dest, { freq, q: 2.5, level, attack: 0.002, decay: 0.033 });
      if (body) this.tone(dest, { freq: freq / 8, to: freq / 16, level: body, attack: 0.003, decay: 0.047 });
      setTimeout(done, 300);
      return;
    }
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    n.connect(this.filter('bandpass', freq, 2.5)).connect(g);
    const out = this.gain(1); g.connect(out);
    if (body) {
      const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(freq / 8, t); o.frequency.exponentialRampToValueAtTime(freq / 16, t + 0.04);
      const og = this.gain(0); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(body, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(og).connect(out); o.start(t); o.stop(t + 0.06);
    }
    const send = this.gain(0.3);
    out.connect(this.master); out.connect(send).connect(this.reverb);
    n.start(t, Math.random() * 5, 0.06);
    n.onended = () => { out.disconnect(); send.disconnect(); };
  }

  // Wardrobe door: a soft wooden creak (two detuned resonant noise bands gliding), then a catch click on closing.
  wardrobe(opening) {
    const t = this.ctx.currentTime, len = opening ? 0.7 : 0.5;
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const out = this.gain(0);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.22, t + 0.08); out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    for (const [f0, f1] of [[480, 620], [910, 760]]) {
      const bp = this.filter('bandpass', f0, 18);
      bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f1, t + len);
      n.connect(bp).connect(out);
    }
    const send = this.gain(0.3);
    out.connect(this.master); out.connect(send).connect(this.reverb);
    n.start(t, Math.random() * 5, len + 0.1);
    n.onended = () => { out.disconnect(); send.disconnect(); };
    if (!opening) setTimeout(() => this.click(1400, 0.45, 0.35), len * 900);
  }

  // A locked front door: the lever goes down and catches, the door knocks in its frame, twice.
  lockedDoor() {
    for (const [ms, f] of [[0, 1700], [90, 700], [380, 1800], [460, 650]]) setTimeout(() => this.click(f, f < 1000 ? 0.7 : 0.4, f < 1000 ? 0.8 : 0.2), ms);
  }

  switchClick(on) { this.click(on ? 2400 : 2000, 0.5, 0.25); }
  lampClick(p, on) { this.click(on ? 3000 : 2600, 0.35, 0.12, p); }

  // Interior door: the lever goes down and the latch slides (two ticks), then a long low wooden creak as it swings.
  door(opening, p) {
    const [dest, done] = this.out(p, 0.4);
    if (opening) { this.burst(dest, { freq: 1900, q: 3, level: 0.35, decay: 0.03 }); this.burst(dest, { t: 0.09, freq: 1200, q: 2, level: 0.4, decay: 0.05 }); }
    const len = 1.1, t0 = this.ctx.currentTime + (opening ? 0.12 : 0);
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.2); g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    for (const [f0, f1] of [[310, 420], [640, 520], [1180, 980]]) {
      const bp = this.filter('bandpass', f0, 22); bp.frequency.setValueAtTime(f0, t0); bp.frequency.linearRampToValueAtTime(f1, t0 + len);
      n.connect(bp).connect(g);
    }
    // air pushed by the leaf
    this.burst(dest, { t: opening ? 0.12 : 0, freq: 300, type: 'lowpass', level: 0.12, attack: 0.25, decay: 0.6, buffer: this.brown });
    g.connect(dest);
    n.start(t0, Math.random() * 4, len + 0.1);
    setTimeout(done, 2500);
  }
  // The leaf meets the frame: a dull wooden thud and the latch snapping in.
  doorShut(p) {
    const [dest, done] = this.out(p, 0.5);
    this.tone(dest, { freq: 120, to: 55, level: 0.6, attack: 0.004, decay: 0.16 });
    this.burst(dest, { freq: 700, q: 1, level: 0.5, decay: 0.09 });
    this.burst(dest, { t: 0.05, freq: 2200, q: 3, level: 0.3, decay: 0.03 });
    setTimeout(done, 800);
  }
  // The door swinging into the player: a soft bump.
  bump(p) {
    const [dest, done] = this.out(p, 0.2);
    this.tone(dest, { freq: 90, to: 60, level: 0.3, attack: 0.01, decay: 0.12 });
    this.burst(dest, { freq: 400, q: 0.8, level: 0.15, decay: 0.08 });
    setTimeout(done, 500);
  }

  // Laptop lid: a soft friction sweep from the hinge; shutting ends in laptopShut's padded tap.
  laptop(p, opening) {
    const [dest, done] = this.out(p, 0.2);
    this.burst(dest, { freq: opening ? 2500 : 3200, glide: opening ? 3800 : 2000, q: 1.5, level: 0.05, attack: 0.15, decay: 0.4 });
    setTimeout(done, 1200);
  }
  laptopShut(p) {
    const [dest, done] = this.out(p, 0.25);
    this.tone(dest, { freq: 260, to: 140, level: 0.25, attack: 0.002, decay: 0.07 });
    this.burst(dest, { freq: 1500, q: 1.2, level: 0.25, decay: 0.04 });
    setTimeout(done, 600);
  }

  // Start-up chime: a warm F-sharp major chord with soft attack and a long ring, from the computer.
  chime(p) {
    const [dest, done] = this.out(p, 0.5);
    for (const [f, a] of [[92.5, 0.12], [185, 0.14], [277.2, 0.1], [370, 0.09], [466.2, 0.06], [554.4, 0.05], [740, 0.025]]) {
      this.tone(dest, { freq: f, level: a, attack: 0.03, decay: 3.2, type: 'sine' });
      this.tone(dest, { freq: f * 1.003, level: a * 0.5, attack: 0.04, decay: 2.6, type: 'triangle' });
    }
    setTimeout(done, 4500);
  }

  // The visual sequence reads this AudioContext clock, so a slow GPU or suspended
  // tab cannot move the pour out of sync with its grinder/pump sounds. No wall timers.
  coffee(p) {
    const k = COFFEE_TIMING, t0 = this.ctx.currentTime;
    const [dest, done] = this.out(p, 0.25), sources = [];
    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;
      for (const source of sources) { try { source.stop(); } catch {} source.disconnect(); }
      done();
    };
    const oscillator = (type, frequency) => {
      const source = this.ctx.createOscillator(); source.type = type; source.frequency.value = frequency;
      sources.push(source); return source;
    };
    const note = (at, freq, level, decay, type = 'sine') => {
      const source = oscillator(type, freq), gain = this.gain(0), time = t0 + at;
      gain.gain.setValueAtTime(0.0001, time); gain.gain.exponentialRampToValueAtTime(level, time + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      source.connect(gain).connect(dest); source.start(time); source.stop(time + decay + 0.05);
      source.onended = () => gain.disconnect();
    };
    note(0, 2100, 0.055, 0.09, 'square');
    note(0.18, 170, 0.07, 0.045);       // button/relay engagement
    const noise = this.ctx.createBufferSource(); noise.buffer = this.noise; noise.loop = true; sources.push(noise);
    const grinder = this.gain(0), texture = this.gain(0.7), chop = oscillator('sine', 37), depth = this.gain(0.22);
    chop.connect(depth).connect(texture.gain);
    const g = grinder.gain;
    g.setValueAtTime(0, t0 + k.grindStart);
    g.linearRampToValueAtTime(0.35, t0 + k.grindStart + 0.16);
    g.setValueAtTime(0.35, t0 + k.infusionStart - 0.25);
    g.linearRampToValueAtTime(0, t0 + k.infusionStart);
    noise.connect(this.filter('bandpass', 1250, 0.85)).connect(texture).connect(grinder).connect(dest);
    const motor = oscillator('sawtooth', 180), motorGain = this.gain(0);
    motorGain.gain.setValueAtTime(0, t0 + k.grindStart);
    motorGain.gain.linearRampToValueAtTime(0.018, t0 + k.grindStart + 0.2);
    motorGain.gain.setValueAtTime(0.018, t0 + k.infusionStart - 0.25);
    motorGain.gain.linearRampToValueAtTime(0, t0 + k.infusionStart);
    motor.frequency.setValueAtTime(150, t0 + k.grindStart);
    motor.frequency.linearRampToValueAtTime(190, t0 + k.grindStart + 0.3);
    motor.frequency.setValueAtTime(190, t0 + k.infusionStart - 0.2);
    motor.frequency.linearRampToValueAtTime(105, t0 + k.infusionStart);
    motor.connect(this.filter('lowpass', 850)).connect(motorGain).connect(dest);
    const pump = oscillator('sawtooth', 50), pressure = this.gain(0), pg = pressure.gain;
    for (const [start, end, level] of [[k.infusionStart + 0.2, k.infusionStart + 0.8, 0.04],
      [k.infusionStart + 1.05, k.infusionStart + 1.75, 0.045], [k.pourStart, k.pourEnd, 0.055]]) {
      pg.setValueAtTime(0, t0 + start); pg.linearRampToValueAtTime(level, t0 + start + 0.12);
      pg.setValueAtTime(level, t0 + end - 0.12); pg.linearRampToValueAtTime(0, t0 + end);
    }
    pump.connect(this.filter('lowpass', 380)).connect(pressure).connect(dest);
    const pour = this.gain(0), water = pour.gain;
    water.setValueAtTime(0, t0 + k.pourStart);
    water.linearRampToValueAtTime(0.075, t0 + k.pourStart + 0.65);
    water.setValueAtTime(0.075, t0 + k.pourEnd - 0.7);
    water.linearRampToValueAtTime(0, t0 + k.pourEnd);
    noise.connect(this.filter('bandpass', 3100, 0.65)).connect(pour).connect(dest);
    for (const at of [k.infusionStart + 0.52, k.infusionStart + 1.48, k.pourEnd + 0.18, k.pourEnd + 0.55, k.pourEnd + 1.05]) {
      note(at, 580 + Math.random() * 140, 0.025, 0.06);
    }
    note(k.readyAt, 2100, 0.055, 0.11, 'square');
    note(k.readyAt + 0.2, 2600, 0.055, 0.17, 'square');
    for (const source of [noise, chop, motor, pump]) { source.start(t0); source.stop(t0 + k.restartAt + 0.4); }
    noise.onended = cleanup;
    return { elapsed: () => Math.max(0, this.ctx.currentTime - t0), stop: cleanup };
  }
  flashlightClick(on) { this.click(on ? 3600 : 3000, 0.35, 0.08); }

  pickUp() {
    // cloth rustle + the plastic body knocking the shelf
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    n.connect(this.filter('bandpass', 1800, 0.6)).connect(g).connect(this.master);
    n.start(t, Math.random() * 5, 0.4);
    setTimeout(() => this.click(900, 0.4, 0.3), 120);
  }

  // Rolling thunder: a crack (if close) and a long low rumble that swells and fades. `distance` in km.
  thunder(distance) {
    const t = this.ctx.currentTime, near = Math.max(0, 1 - distance / 4);
    const rumble = this.ctx.createBufferSource(); rumble.buffer = this.brown; rumble.loop = true;
    const lp = this.filter('lowpass', 120 + near * 200, 0.5);
    const g = this.gain(0);
    const peak = 0.5 + near * 0.6, len = 4 + distance * 1.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.25 + distance * 0.15);
    for (let k = 1; k < 5; k++) g.gain.setTargetAtTime(peak * (0.4 + Math.random() * 0.6) * (1 - k / 6), t + k * len / 6, 0.4);
    g.gain.setTargetAtTime(0.0001, t + len * 0.8, len * 0.15);
    rumble.connect(lp).connect(g);
    const send = this.gain(0.6);
    g.connect(this.master); g.connect(send).connect(this.reverb);
    rumble.start(t, Math.random() * 5); rumble.stop(t + len * 1.6);
    if (near > 0.3) this.click(500, 0.8 * near, 0.9 * near);
    rumble.onended = () => { g.disconnect(); send.disconnect(); };
  }

  step(surface, speed) {
    const t = this.ctx.currentTime, loud = Math.min(1, 0.45 + speed * 0.25) * (0.85 + Math.random() * 0.3);
    const thump = this.ctx.createOscillator(); thump.frequency.setValueAtTime(95, t); thump.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    const tg = this.gain(0); tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.35 * loud, t + 0.008); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    thump.connect(tg); thump.start(t); thump.stop(t + 0.14);
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const stone = surface === 'stone';
    const bp = this.filter('bandpass', (stone ? 2600 : 900) * (0.85 + Math.random() * 0.3), stone ? 1.4 : 0.9);
    const ng = this.gain(0); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime((stone ? 0.5 : 0.35) * loud, t + 0.005); ng.gain.exponentialRampToValueAtTime(0.0001, t + (stone ? 0.07 : 0.11));
    n.connect(bp).connect(ng); n.start(t, Math.random() * 5, 0.15);
    const out = this.gain(0.55);
    tg.connect(out); ng.connect(out);
    const send = this.gain(0.4);
    out.connect(this.master); out.connect(send).connect(this.reverb);
    n.onended = () => { out.disconnect(); send.disconnect(); };
  }
}
