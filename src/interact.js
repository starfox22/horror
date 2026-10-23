// "Look at it and press E": things the player can use (light switches, the flashlight). Each frame the closest
// interactable near the centre of view and within reach is focused; its label shows under the reticle and E (or a left
// click while walking) uses it.
import { Vec3 } from 'playcanvas';

const REACH = 2.1;          // metres from the eye
const v = new Vec3();

export class Interactions {
  constructor(camera, prompt) {
    this.camera = camera;
    this.prompt = prompt;
    this.items = [];
    this.focus = null;
    this.enabled = false;
    const use = () => { if (this.enabled && this.focus) this.focus.use(); };
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat) use(); });
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
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
    this.prompt.hidden = !best;
  }
}
