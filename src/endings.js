// The four endings (docs/STORY.md). Each fades the world out and plays as sound and captions over black (or the dark
// flat), then the ending card (menu.js) with the night in numbers. Timings are seconds from the start of the ending.
export const EPILOGUES = {
  'sweet-dreams': '',
  locked: 'They searched every room, the wardrobe and the ceiling above it. They found nothing they could write down.',
  out: 'You spent the rest of the night on the stairs, in the light that comes on when you move.',
  lodger: 'Daniel Kessler, 41, lived here until March. Officers found bedding, food and 212 photographs in the service void above your wardrobe. He said he never broke in. He said you let him in. He said that whenever you woke, he put you back to bed.',
};

export class Endings {
  constructor({ story, bank, music, hud, menu, fade, player, camera, clock, stills }) {
    Object.assign(this, { story, bank, music, hud, menu, fade, player, camera, clock, stills });
    this.cues = [];
    this.t = 0;
  }

  // Black over the world in `seconds`.
  black(seconds = 1.2) { this.fade.style.transition = `opacity ${seconds}s`; this.fade.style.opacity = '1'; }

  schedule(cues) { this.cues = cues.map(([at, fn]) => ({ at, fn })); this.t = 0; this.running = true; }

  update(dt) {
    if (!this.running) return;
    this.t += Math.min(dt, 0.1);
    for (const c of [...this.cues]) if (this.t >= c.at) { this.cues.splice(this.cues.indexOf(c), 1); c.fn(); }
    if (!this.cues.length) this.running = false;
  }

  begin(id) {
    const s = this.story;
    if (s.has('ended')) return false;
    s.set('ended'); s.endedAt = s.time; s.endingId = id;
    s.sys.hunt?.flee?.();
    this.player.active = false;
    document.exitPointerLock?.();
    this.music?.stopAll(2);
    return true;
  }

  card(id) {
    const s = this.story, j = s.sys.journal;
    this.menu.ended(id, s.endedAt);
    const reading = { real: 'Someone was here.', head: 'It was in my head.', both: 'I don’t know.' }[j?.reading?.() || 'both'];
    this.menu.open('ending', { id, epilogue: EPILOGUES[id], stats: { time: s.endedAt, clock: this.clock?.label?.() || '03:2x', deaths: s.deaths, evidence: j?.count ?? 0, reading } });
    s.clearSave();
  }

  play(id) {
    if (id === 'sweet-dreams') return this.sweetDreams();
    if (id === 'out') return this.out();
  }

  // Back to bed between the glass and the cut.
  sweetDreams() {
    if (!this.begin('sweet-dreams')) return;
    const b = this.bank;
    this.schedule([
      [0, () => { this.black(2.5); b?.play('blanket', { gain: 0.6 }); b?.play('bed_move', { gain: 0.5, delay: 0.6 }); }],
      [5, () => b?.play('wardrobe_creak', { segment: 0, at: [9.75, 1.3, -0.1], gain: 0.5, occlude: false })],
      [8.5, () => b?.play('creak_1', { at: [11.0, 0.2, 0.6], gain: 0.45, occlude: false })],
      [10.5, () => b?.play('creak_3', { at: [12.2, 0.2, 1.2], gain: 0.5, occlude: false })],
      [13, () => b?.play('bed_move', { gain: 0.8 })],
      [15, () => b?.play('his_breath_1', { gain: 0.9, at: [12.9, 1.1, 1.0], ref: 0.2, rolloff: 2, occlude: false })],
      [19.5, () => this.stills?.show('0314')],
      [24, () => { this.stills?.hide(); this.card('sweet-dreams'); }],
    ]);
  }

  // The police at the door (Locked From the Inside or The Lodger).
  police(kind) {
    if (!this.begin(kind)) return;
    const b = this.bank, voice = (who, text) => this.hud.voice(who, text);
    const door = [12.88, 1.3, 4.35];
    const common = [
      [0, () => { b?.play('sirens_far', { gain: 0.35, bus: 'amb' }); }],
      [3, () => b?.play('knock_police', { at: door, gain: 1, min: 0.3 })],
      [3.4, () => voice('Outside', 'Police! Open the door!')],
      [6.5, () => b?.play('knock_police', { at: door, gain: 1, min: 0.3 })],
      [7, () => voice('Outside', 'We’re coming in. Stand back from the door!')],
      [9.5, () => { b?.play('door_smash', { at: door, gain: 1, min: 0.35 }); b?.play('door_kick', { at: door, gain: 0.9, delay: 0.5 }); }],
      [10.4, () => { this.black(0.8); b?.play('radio_chatter', { gain: 0.4, delay: 0.8 }); b?.play('steps_boots', { segment: 'random', gain: 0.6, delay: 1 }); }],
      [12, () => voice('Officer', 'Police. Are you okay? Where is he?')],
    ];
    const tail = kind === 'lodger' ? [
      [15.5, () => voice('You', 'In the ceiling. Above the wardrobe.')],
      [18.5, () => { b?.play('wardrobe_creak', { segment: 2, gain: 0.8 }); b?.play('radio_chatter', { gain: 0.45, delay: 1.2 }); }],
      [21, () => voice('Officer', 'There’s a hatch up here. ...Torch.')],
      [24.5, () => { b?.play('door_kick', { gain: 0.9 }); b?.play('steps_boots', { segment: 'random', gain: 0.8, delay: 0.3 }); b?.play('creak_long', { gain: 0.9, delay: 0.5 }); }],
      [25.2, () => voice('Officer', 'Police! Come down. Now. Hands where I can see them.')],
      [29.5, () => voice('Officer', '...Daniel Kessler?')],
      [33.5, () => this.card('lodger')],
    ] : [
      [15.5, () => voice('Officer', 'There’s nobody here. Front door was locked. Chain was on. From the inside.')],
      [20.5, () => voice('Officer', 'Is this the clip? ...That’s you, isn’t it?')],
      [25, () => { voice('Officer', 'Nobody could fit up there.'); b?.play('water_drop', { gain: 0.3, delay: 1.5 }); }],
      [29.5, () => voice('Officer', 'Do you take anything to help you sleep?')],
      [34, () => this.card('locked')],
    ];
    this.schedule([...common, ...tail]);
  }

  // Out of the front door with the spare key.
  out() {
    if (!this.begin('out')) return;
    const b = this.bank, door = [12.88, 1.2, 4.35];
    this.schedule([
      [0, () => { b?.play('door_creak', { at: door, gain: 0.8 }); this.black(1.6); }],
      [1.2, () => { for (let i = 0; i < 14; i++) b?.play('steps_socks', { segment: 'random', gain: 0.5 * (1 - i / 16), delay: i * 0.33, rate: [1.05, 1.15], send: 0.9 }); }],
      [7.5, () => this.hud.voice('', '')],
      [9, () => b?.play('latch_1', { gain: 0.25, send: 1 })],
      [9.6, () => b?.play('deadbolt', { gain: 0.3, send: 1, rate: 0.95 })],
      [13, () => this.card('out')],
    ]);
  }
}
