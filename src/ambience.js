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

  // A short percussive tick: band-passed noise burst (+ optional low body), for switches and the flashlight button.
  click(freq, level, body = 0) {
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

  switchClick(on) { this.click(on ? 2400 : 2000, 0.5, 0.25); }
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
