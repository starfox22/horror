// The player's thoughts as a subtitle (same look as the waking line, wake-sequence.css): fades in, holds, fades out.
// The fade runs on play time only (update(dt) is skipped by the caller while paused), so a paused line waits.
export class Thought {
  constructor(ownerDocument = globalThis.document) {
    this.el = ownerDocument.createElement('p');
    this.el.className = 'wake-dialogue thought';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.style.opacity = '0';
    this.el.hidden = true;
    ownerDocument.body.appendChild(this.el);
    this.line = null;
  }

  // delay, fade in 0.6 s, hold, fade out 0.9 s (seconds of play).
  show(text, { delay = 0, hold = 2.5 } = {}) {
    this.line = { text, t: -delay, hold };
    this.el.textContent = text;
    this.update(0);
  }

  update(dt) {
    const line = this.line;
    if (!line) return;
    line.t += Math.min(Math.max(dt, 0), 0.1);
    const t = line.t, fadeIn = 0.6, fadeOut = 0.9, end = fadeIn + line.hold + fadeOut;
    const k = t < 0 ? 0 : t < fadeIn ? t / fadeIn : t < fadeIn + line.hold ? 1 : Math.max(0, 1 - (t - fadeIn - line.hold) / fadeOut);
    const eased = k * k * (3 - 2 * k);
    this.el.hidden = t < 0 || t >= end;
    this.el.style.opacity = eased.toFixed(3);
    if (t >= end) this.line = null;
  }

  get visible() { return !this.el.hidden; }
}
