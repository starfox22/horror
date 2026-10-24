// First-person opening measured against the authored bedroom. The bed runs
// x=11.63..13.89, z=-0.45..1.46; its head/pillows are at the +x end.
// The final position is on the open +z bedside aisle, not on the mattress.
export const WAKE_DIALOGUE = 'I just had a nightmare, I will go get some water at the kitchen';
export const WAKE_DURATION = 12;
export const WAKE_EXIT = Object.freeze({ x: 12.85, z: 1.80, yaw: 112, pitch: -2 });

// position [x,y,z], rotation [pitch,yaw,roll]. A gentle pause at each action
// gives the head weight: waking breath, sitting up, turning to the bedside,
// planting feet, leaning forward, rising and finding balance.
const KEYS = [
  [0, [13.23, 1.105, 1.02], [67, 90, -3.5]],
  [2.4, [13.20, 1.12, 1.02], [60, 91, -2]],
  [5.15, [12.94, 1.46, 1.10], [3, 96, 1.2]],
  [7.25, [12.85, 1.44, 1.56], [-18, 170, -2.2]],
  [8.4, [12.85, 1.35, 1.72], [-31, 160, 1.8]],
  [10.45, [12.85, 1.81, 1.80], [-2, 112, 0]],
  [WAKE_DURATION, [12.85, 1.81, 1.80], [-2, 112, 0]],
];
const clamp = value => Math.min(1, Math.max(0, value));
const smooth = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const lerp = (a, b, t) => a + (b - a) * t;

// Pure timeline sampling makes the authored path inspectable without a GPU.
// Reduced motion keeps an upright, stationary bedside view with a short fade.
export function sampleWake(time, { reducedMotion = false, floor = 0.19 } = {}) {
  const duration = reducedMotion ? 6.5 : WAKE_DURATION;
  const t = Math.min(duration, Math.max(0, Number.isFinite(time) ? time : 0));
  let position, rotation;
  if (reducedMotion) {
    position = [WAKE_EXIT.x, floor + 1.62, WAKE_EXIT.z];
    rotation = [WAKE_EXIT.pitch, WAKE_EXIT.yaw, 0];
  } else {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const [start, a, ar] = KEYS[i], [end, b, br] = KEYS[i + 1];
    const u = smooth((t - start) / (end - start));
    position = a.map((value, k) => lerp(value, b[k], u));
    rotation = ar.map((value, k) => lerp(value, br[k], u));
    // Resolve the last rise to the actual collision floor. The mattress poses
    // remain authored world coordinates; only standing height follows the grid.
    position[1] += (floor - 0.19) * smooth((t - 8.4) / 2.05);
    const settle = 1 - smooth((t - 10.45) / 1.55);
    position[1] += Math.sin(t * 1.65) * 0.007 * settle;
    rotation[0] += Math.sin(t * 1.65) * 0.18 * settle;
    rotation[2] += Math.sin(t * 0.85) * 0.10 * settle;
  }
  // Slow eyelid opening, then one soft blink before the body rises. Kept
  // independent of frame rate so it does not flicker on a fast display.
  const opening = smooth((t - 0.25) / (reducedMotion ? 0.9 : 1.35));
  const blink = reducedMotion ? 0 : 0.88 * Math.exp(-(((t - 2.1) / 0.16) ** 2));
  const eyes = Math.max(1 - opening, blink);
  const dialogueStart = reducedMotion ? 0.5 : 2.65;
  const dialogue = smooth((t - dialogueStart) / 0.8) * (1 - smooth((t - (duration - 1.05)) / 0.9));
  return { position, rotation, eyes, dialogue, duration, complete: t >= duration };
}

export class WakeSequence {
  constructor({ camera, player, onComplete = () => {},
    document: ownerDocument = globalThis.document,
    window: ownerWindow = globalThis.window,
    clock = () => performance.now() / 1000,
    reducedMotion = ownerWindow?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false } = {}) {
    Object.assign(this, { camera, player, onComplete, ownerDocument, ownerWindow, clock, reducedMotion });
    this.started = false;
    this.completed = false;
    this.running = false;
    this.locked = false;
    this.time = 0;
    this.lastTime = null;
    this.floor = player.grid.floorUnder(WAKE_EXIT.x, WAKE_EXIT.z, 0.22);
    if (!player.grid.fits(WAKE_EXIT.x, WAKE_EXIT.z, 0.22, this.floor)) {
      throw new Error('The waking sequence needs a clear bedside landing. Check WAKE_EXIT against the walk grid.');
    }
    this.overlay = this.build();
    this.onKey = event => {
      if (!this.running || !this.locked || event.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault?.(); this.skip(); }
    };
    this.onVisibility = () => { this.lastTime = null; };
    ownerWindow?.addEventListener('keydown', this.onKey);
    ownerDocument?.addEventListener('visibilitychange', this.onVisibility);
    this.apply(); // The start screen already looks from the bed, before entry.
  }

  build() {
    if (!this.ownerDocument) return null;
    const overlay = this.ownerDocument.createElement('div');
    overlay.id = 'wake-sequence';
    overlay.hidden = true;
    const veil = this.ownerDocument.createElement('div');
    veil.className = 'wake-veil';
    veil.setAttribute('aria-hidden', 'true');
    const dialogue = this.ownerDocument.createElement('p');
    dialogue.className = 'wake-dialogue';
    dialogue.setAttribute('role', 'status');
    dialogue.setAttribute('aria-live', 'polite');
    dialogue.textContent = WAKE_DIALOGUE;
    const skip = this.ownerDocument.createElement('button');
    skip.type = 'button';
    skip.className = 'wake-skip';
    skip.textContent = 'Space · Skip waking';
    skip.setAttribute('aria-label', 'Skip waking animation');
    skip.addEventListener('click', () => this.skip());
    overlay.append(veil, dialogue, skip);
    this.ownerDocument.body.appendChild(overlay);
    this.veil = veil;
    this.dialogue = dialogue;
    return overlay;
  }

  start() {
    if (this.started || this.completed) return false;
    this.started = true;
    this.running = true;
    this.time = 0;
    this.lastTime = this.clock();
    this.holdPlayer();
    this.apply();
    this.refreshVisibility();
    return true;
  }

  setLocked(locked) {
    this.locked = !!locked;
    this.lastTime = null;
    if (this.locked && !this.started) this.start();
    this.refreshVisibility();
  }

  refreshVisibility() {
    if (this.overlay) this.overlay.hidden = !this.running || !this.locked || !!this.ownerDocument?.hidden;
  }

  holdPlayer() {
    this.player.active = false;
    this.player.keys.clear();
    this.player.vel.set(0, 0, 0);
  }

  update() {
    if (!this.running) return false;
    this.holdPlayer();
    this.refreshVisibility();
    if (!this.locked || this.ownerDocument?.hidden) { this.lastTime = null; return true; }
    const now = this.clock();
    if (this.lastTime !== null) this.time += Math.max(0, now - this.lastTime);
    this.lastTime = now;
    const pose = this.apply();
    if (pose.complete) this.finish();
    return this.running;
  }

  apply() {
    const pose = sampleWake(this.time, { reducedMotion: this.reducedMotion, floor: this.floor });
    this.camera.setPosition(...pose.position);
    this.camera.setEulerAngles(...pose.rotation);
    if (this.veil) this.veil.style.opacity = String(pose.eyes);
    if (this.dialogue) this.dialogue.style.opacity = String(pose.dialogue);
    return pose;
  }

  // A new night (the title's New night, Chapters): back to lying in bed, eyes shut, the opening not yet played.
  reset() {
    this.started = false; this.completed = false; this.running = false; this.time = 0; this.lastTime = null;
    this.apply();
    this.refreshVisibility();
  }

  skip() {
    if (!this.running) return false;
    this.finish();
    return true;
  }

  finish() {
    if (this.completed) return;
    this.completed = true;
    this.running = false;
    this.player.pos.set(WAKE_EXIT.x, 0, WAKE_EXIT.z);
    this.player.floor = this.floor;
    this.player.eyeY = this.floor + 1.62;
    this.player.yaw = WAKE_EXIT.yaw;
    this.player.pitch = WAKE_EXIT.pitch;
    this.player.bobPhase = 0;
    this.player.breath = 0;
    this.player.keys.clear();
    this.player.vel.set(0, 0, 0);
    this.player.active = this.locked && !this.ownerDocument?.hidden;
    this.player.apply(0);
    this.refreshVisibility();
    this.onComplete();
  }

  destroy() {
    this.ownerWindow?.removeEventListener('keydown', this.onKey);
    this.ownerDocument?.removeEventListener('visibilitychange', this.onVisibility);
    this.overlay?.remove();
  }
}
