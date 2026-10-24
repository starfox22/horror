// What the player has found (docs/STORY.md, Evidence): the pause menu's journal lists each piece with the thought it
// came with, and which way it points (real / in my head / both). Found this run (saved with the checkpoint) and found
// ever (kept in the browser for the main menu's count). A newly found piece shows a quiet note at the corner.
export const EVIDENCE = [
  { id: 'stuck', title: 'The wardrobe door', text: 'The right door of the wardrobe would not open. Stuck, I thought.', points: 'both' },
  { id: 'phone-fridge', title: 'My phone, in the fridge', text: 'Ice cold. I have never put my phone in the fridge. Not awake.', points: 'both' },
  { id: 'glass', title: 'A broken glass', text: 'A kitchen glass, smashed by my bed, in a spill of water with something pink in it. I did not bring a glass to bed.', points: 'both' },
  { id: 'bathroom-locked', title: 'The bathroom door', text: 'Locked. It only locks from the inside. The tap was running, then it stopped.', points: 'real' },
  { id: 'notice', title: 'Notice to residents', text: 'Noises reported in the ceiling voids of floors 4 to 6. Maintenance will inspect. Hot water is central: report leaks to the caretaker.', points: 'real' },
  { id: 'pills', title: 'My prescription', text: 'Zolpidem 10 mg, one at night. May cause sleepwalking, complex sleep behaviours, and hallucinations.', points: 'head' },
  { id: 'diary', title: 'My sleep diary', text: 'Woke on the sofa. Fridge open in the morning. The toilet seat up. I live alone. Dr Haas says film the nights. Camera came today.', points: 'both' },
  { id: 'silhouette', title: 'The end of the corridor', text: 'Someone was standing by the front door. Then the torch flickered and nobody was.', points: 'both' },
  { id: 'prints', title: 'Wet footprints', text: 'Bare footprints, my size, from the bedroom to the front door and back. I was never over there.', points: 'both' },
  { id: 'mirror', title: 'The mirror', text: 'Fogged over, with one band wiped clear. Higher than my head.', points: 'real' },
  { id: 'nest', title: 'The wardrobe floor', text: 'A blanket. Bottles. A torch that is not mine. Above it, a hatch in the wardrobe’s roof, open on the dark.', points: 'real' },
  { id: 'polaroids', title: 'Polaroids', text: 'My bed, at night, with me asleep in it. Taken from inside the wardrobe.', points: 'real' },
  { id: 'let-me-in', title: 'The oldest polaroid', text: 'On the back, in block capitals, dated in March: YOU LET ME IN.', points: 'both' },
  { id: 'old-key', title: 'A key', text: 'A front-door key. It is not mine, and it does not fit my door: the lock was changed in the spring.', points: 'real' },
  { id: 'letter', title: 'A returned letter', text: 'Addressed to D. Kessler at this flat. Not known at this address.', points: 'real' },
  { id: 'clip-0047', title: 'Home Cam · 00:47', text: 'The wardrobe door opens a hand’s width. A hand. It closes.', points: 'real' },
  { id: 'clip-0258', title: 'Home Cam · 02:58', text: 'The bed is empty. Someone stands at the foot of it, face white in the infrared. Is that me?', points: 'both' },
  { id: 'key-bowl', title: 'The key bowl', text: 'Empty. My keys are always in it.', points: 'real' },
];
const EVER_KEY = 'horror.evidence.v1';

export class Journal {
  constructor({ hud } = {}) {
    this.hud = hud;
    this.found = new Map();       // id -> order found
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
    this.hud?.toast(`Journal · ${e.title}`, 2.2);
    return true;
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
  load(ids = []) { this.found = new Map(ids.map((id, i) => [id, i + 1])); }
  reset() { this.found.clear(); }
}
