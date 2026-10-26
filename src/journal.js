// What the player has found (docs/STORY.md, Evidence): the pause menu's journal lists each piece with the thought it
// came with, and which way it points (real / in my head / both). Found this run (saved with the checkpoint) and found
// ever (kept in the browser for the main menu's count). A newly found piece shows a quiet note at the corner.
// Build 0.14 (docs/STORY.md v3): the evicted man never left. The texts say what was seen, never who he is.
export const EVIDENCE = [
  { id: 'stuck', title: 'The wardrobe door', text: 'The right door of the wardrobe would not open. It gave a centimetre, then stopped. Stuck, I thought.', points: 'both' },
  { id: 'notice', title: 'Notice to residents', text: 'The resident who had been causing disturbances over the last month has finally been evicted. Finally.', points: 'real' },
  { id: 'key-bowl', title: 'The key bowl', text: 'Empty. My keys are always in it.', points: 'real' },
  { id: 'knife', title: 'The knives', text: 'One missing from the rack. The biggest one.', points: 'real' },
  { id: 'glass', title: 'A broken glass', text: 'A glass, smashed by my bed, in a spill of water. I did not bring a glass to bed.', points: 'both' },
  { id: 'blood', title: 'In the spill', text: 'The water was pink. One bare footprint in it, going towards the bathroom.', points: 'real' },
  { id: 'bathroom-locked', title: 'The bathroom door', text: 'Locked. It only locks from the inside. The tap stopped when I tried the handle, and then the light under the door went out.', points: 'real' },
  { id: 'silhouette', title: 'The end of the corridor', text: 'A man by my front door, at the edge of the torch. Black clothes, a white face. He ran at me, and into my bedroom.', points: 'real' },
  { id: 'prints', title: 'Footprints', text: 'Wet, bare, a little pink. From the front door into my bedroom.', points: 'real' },
  { id: 'mirror', title: 'The mirror', text: 'Fogged over, with one band wiped clear. Higher than my head.', points: 'real' },
  { id: 'nest', title: 'The wardrobe floor', text: 'A blanket. Bottles. Above it, a hatch in the wardrobe’s roof, open on the dark.', points: 'real' },
  { id: 'old-key', title: 'A key', text: 'A front-door key on a paper tag: 5B. Not mine.', points: 'real' },
  { id: 'polaroids', title: 'Polaroids', text: 'My bed, at night, with me asleep in it. Taken from inside the wardrobe.', points: 'real' },
  { id: 'let-me-in', title: 'The oldest polaroid', text: 'On the back, in pencil: 14 . 3. Seven months ago.', points: 'real' },
  { id: 'clip-0047', title: 'Home Cam · 00:47', text: 'The wardrobe door opens a hand’s width. A white face in the gap. It closes.', points: 'real' },
  { id: 'clip-0258', title: 'Home Cam · 02:58', text: 'The bed is empty. Someone stands at the foot of it, face white in the infrared. Is that me?', points: 'both' },
  { id: 'pills', title: 'My prescription', text: 'Zolpidem 10 mg, one at night. May cause sleepwalking, complex sleep behaviours, and hallucinations.', points: 'head' },
  { id: 'diary', title: 'My sleep diary', text: 'Woke on the sofa. Fridge open in the morning. Things moved. Dr Haas says film the nights. Camera came today.', points: 'both' },
];
const EVER_KEY = 'horror.evidence.v1';

export class Journal {
  constructor({ hud } = {}) {
    this.hud = hud;
    this.found = new Map();       // id -> order found
    this.pending = [];            // toasts waiting their turn (update)
    this.wait = 0;
    this.ready = null;            // main.js: is it a quiet moment (no scare just now, no thought on screen)?
    let ever = [];
    try { ever = JSON.parse(localStorage.getItem(EVER_KEY) || '[]'); } catch { /* private mode */ }
    this.ever = new Set(ever);
  }

  find(id) {
    const e = EVIDENCE.find(x => x.id === id);
    if (!e || this.found.has(id)) return false;
    this.found.set(id, this.found.size + 1);
    this.ever.add(id);
    try { localStorage.setItem(EVER_KEY, JSON.stringify([...this.ever])); } catch { /* ignore */ }
    this.pending.push(`Journal · ${e.title}`);
    return true;
  }

  // Toasts take their turn: one at a time, never on top of a scare or a thought (seconds of play).
  update(dt) {
    if (!(dt > 0)) return;                              // paused, reading: they wait
    this.wait = Math.max(0, this.wait - dt);
    if (!this.pending.length || this.wait > 0 || this.ready?.() === false) return;
    this.hud?.toast(this.pending.shift(), 2.2);
    this.wait = 3.4;
  }

  has(id) { return this.found.has(id); }
  get count() { return this.found.size; }
  get total() { return EVIDENCE.length; }

  // Which reading the evidence found so far leans to: 'real', 'head' or 'both'.
  reading() {
    let real = 0, head = 0;
    for (const id of this.found.keys()) { const p = EVIDENCE.find(e => e.id === id)?.points; if (p === 'real') real++; if (p === 'head') head++; }
    return real > head + 3 ? 'real' : head > real ? 'head' : 'both';
  }

  entries() { return EVIDENCE.filter(e => this.found.has(e.id)).sort((a, b) => this.found.get(a.id) - this.found.get(b.id)); }
  save() { return [...this.found.keys()]; }
  load(ids = []) {
    // The dead-phone objective was retired in 0.17. Old/unknown entries must not inflate the current evidence total.
    const valid = new Set(EVIDENCE.map(e => e.id));
    this.found = new Map([...new Set(ids)].filter(id => valid.has(id)).map((id, i) => [id, i + 1]));
    this.pending.length = 0;
  }
  reset() { this.found.clear(); this.pending.length = 0; }
}
