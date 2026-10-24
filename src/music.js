// The score, such as it is (docs/STORY.md pillar 5: silence is a tool). No music under exploration. Recorded drones
// swell after something happens and fade; stings mark the few hard moments; in the hunt a low bed rises with how close
// he is, the player's heartbeat quickens, and hiding near him the player holds their breath. All recordings (sound.js).
export class Music {
  constructor(bank) {
    this.bank = bank;
    this.beds = {};
    this.heart = { bpm: 0, next: 0 };
    this.danger_ = 0;
    this.time = 0;
  }

  bed(key, gain, fade = 2) {
    if (!this.bank) return null;
    let h = this.beds[key];
    if (!h || !h.playing) h = this.beds[key] = this.bank.loop(key, { gain: 0, bus: 'music', fadeIn: 0.1 });
    h?.setGain(gain, fade);
    return h;
  }

  // A drone that rises to `gain` and dies away over `seconds`.
  swell(gain = 0.5, seconds = 8) {
    const h = this.bed('drone_deep', gain, seconds * 0.3);
    clearTimeout(this.swellTimer);
    this.swellTimer = setTimeout(() => h?.setGain(0, seconds * 0.7), seconds * 300);
  }

  sting(kind) {
    if (!this.bank) return;
    const map = { low: ['boom', 0.35], hit: ['sting_braam', 0.55], chase: ['sting_riser', 0.4], scare: ['sting_scare', 0.75] };
    const [key, gain] = map[kind] || map.low;
    this.bank.play(key, { gain, bus: 'music' });
  }

  hunt(on) {
    this.hunting = on;
    this.bed('drone_tension', on ? 0.12 : 0, on ? 6 : 3);
    if (!on) { this.bed('breath_held', 0, 1); this.bed('breath_fast', 0, 2); this.heart.bpm = 0; }
  }

  // k: 0 (far) .. 1 (on top of you); state: his state (stalker.js).
  danger(k, state) {
    this.danger_ = k;
    if (!this.hunting) return;
    this.bed('drone_tension', 0.12 + k * 0.35 + (state === 'chase' ? 0.2 : 0), 0.8);
    this.heart.bpm = k > 0.25 || state === 'chase' ? 62 + k * 70 + (state === 'chase' ? 25 : 0) : 0;
    this.bed('breath_fast', state === 'chase' ? 0.35 : 0, state === 'chase' ? 0.5 : 3);
  }

  // Holding your breath: crouched, still, with him close.
  holding(on) { if (this.hunting) this.bed('breath_held', on ? 0.4 : 0, on ? 0.6 : 1.5); }

  update(dt) {
    this.time += dt;
    const h = this.heart;
    if (h.bpm > 0 && this.time >= h.next) {
      h.next = this.time + 60 / h.bpm;
      this.bank?.play('heartbeat', { gain: 0.25 + this.danger_ * 0.5, bus: 'music', rate: [0.97, 1.03] });
    }
  }

  stopAll(fade = 1.5) { for (const h of Object.values(this.beds)) h?.setGain(0, fade); this.heart.bpm = 0; this.hunting = false; }
}
