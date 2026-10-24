// The first scare (story-events.js 'falling-glass'): somewhere in the bedroom a glass falls and shatters on the floor,
// heard from wherever the player is: placed at its spot in the room (HRTF), muffled through the walls unless the player
// is in the bedroom, with the flat's reverb. A moment later the player's thought: "What was that?".
// The recording is downloaded (docs/CREDITS.md); nothing in the bedroom changes yet.
import { ZONES } from './probes.js';

const SOUND_URL = './assets/audio/glass-break.wav';
// On the floor by the bed's left side table, where a glass of water would stand at night.
export const GLASS_SPOT = [13.55, 0.05, -0.95];
export const THOUGHT = 'What was that?';

const inBedroom = (p) => {
  const [lo, hi] = ZONES.bed.box;
  return p.x > lo[0] && p.x < hi[0] && p.z > lo[2] && p.z < hi[2];
};

export class FallingGlass {
  static async create({ sounds, thought, listener }) {
    let buffer = null;
    try {
      const response = await fetch(new URL(SOUND_URL, location.href));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buffer = await sounds?.ctx?.decodeAudioData(await response.arrayBuffer());
    } catch (error) { console.warn(`Falling glass sound unavailable: ${error.message || error}`); }
    return new FallingGlass({ sounds, thought, listener, buffer });
  }

  // listener(): the player's ear (camera position).
  constructor({ sounds, thought, listener, buffer }) { Object.assign(this, { sounds, thought, listener, buffer }); }

  play() {
    const ear = this.listener?.();
    const near = ear ? inBedroom(ear) : false;
    const far = ear ? Math.hypot(ear.x - GLASS_SPOT[0], ear.z - GLASS_SPOT[2]) : 6;
    if (this.buffer && this.sounds) {
      // Through the walls the shatter loses its top end (more the further away) and is mostly the flat's echo.
      this.sounds.sample(this.buffer, GLASS_SPOT, { gain: near ? 1.0 : 1.5, muffle: near ? null : Math.max(1400, 5200 - far * 300),
        send: near ? 0.35 : 0.7, ref: 1.6, rolloff: 0.9 });
    }
    this.thought?.show(THOUGHT, { delay: 1.1, hold: 2.6 });
    return { near, far };
  }
}
