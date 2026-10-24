// "Look at it and press E": things the player can use (switches, doors, lamps, the laptop…). Each frame the closest
// interactable near the centre of view and within reach is focused: the reticle opens into a ring and the action shows
// under it with an [E] key cap; E (or a left click while walking) uses it and the ring pulses.
import { Vec3 } from 'playcanvas';

const REACH = 2.1;          // metres from the eye
const v = new Vec3();

export class Interactions {
  constructor(camera, prompt, reticle) {
    this.camera = camera;
    this.prompt = prompt;
    this.reticle = reticle;
    this.text = '';
    this.items = [];
    this.focus = null;
    this.enabled = false;
    const use = () => {
      if (!this.enabled || !document.pointerLockElement) return;
      // Input can arrive between frames: a moving handle or an object that just became
      // busy must be checked again before using the cached focus (rapid clicks/E).
      this.update();
      if (!this.focus) return;
      this.focus.use();
      this.reticle?.classList.add('pressed');
      clearTimeout(this.pressTimer);
      this.pressTimer = setTimeout(() => this.reticle?.classList.remove('pressed'), 120);
    };
    // blockKey(): set by the developer menu, true while its code word is being typed.
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) && !this.blockKey?.('e')) use(); });
    window.addEventListener('mousedown', (e) => { if (e.button === 0 && document.pointerLockElement) use(); });
  }

  // item: { pos: Vec3, size: metres (how far off-centre still counts), label: () => string, use: () => void,
  //         active?: () => boolean }
  add(item) { this.items.push(item); return item; }
  remove(item) { this.items = this.items.filter(i => i !== item); if (this.focus === item) this.focus = null; }

  update() {
    let best = null, bestScore = Infinity;
    if (this.enabled) {
      const eye = this.camera.getPosition(), fwd = this.camera.forward;
      for (const it of this.items) {
        if (it.active && !it.active()) continue;
        v.sub2(it.pos, eye);
        const d = v.length(), along = v.dot(fwd);
        if (d > REACH || along < 0.15) continue;
        const off = Math.sqrt(Math.max(0, d * d - along * along));
        if (off > Math.max(it.size ?? 0.1, along * 0.06)) continue;
        const score = off / along;
        if (score < bestScore) { best = it; bestScore = score; }
      }
    }
    this.focus = best;
    const text = best ? best.label() : '';
    if (text && this.text !== text) {
      this.prompt.replaceChildren(Object.assign(document.createElement('kbd'), { textContent: 'E' }), document.createTextNode(text));
    }
    if (text) this.text = text;
    this.prompt.classList.toggle('show', !!best);
    this.reticle?.classList.toggle('focus', !!best);
  }
}
