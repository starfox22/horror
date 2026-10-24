// The player's thoughts as a subtitle (same look as the waking line, wake-sequence.css): fades in, holds, fades out.
// The fade runs on play time only (update(dt) is skipped by the caller while paused), so a paused line waits.
// show() replaces whatever is up; say() queues a line after the ones waiting (story.js uses it, so two beats close
// together never trample each other). `size` (settings) scales the text.
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
    this.queue = [];
    this.history = [];
  }

  // delay, fade in 0.6 s, hold, fade out 0.9 s (seconds of play).
  show(text, { delay = 0, hold = 2.5 } = {}) {
    this.queue.length = 0;
    this.start(text, delay, hold);
  }

  // After the current line (and anything queued), with `gap` seconds between.
  say(text, { delay = 0, hold = Math.max(1.8, text.length * 0.07), gap = 0.25 } = {}) {
    if (!this.line && !this.queue.length) { this.start(text, delay, hold); return; }
    this.queue.push({ text, delay: delay + gap, hold });
  }

  start(text, delay, hold) {
    this.line = { text, t: -delay, hold };
    this.el.textContent = text;
    this.history.push(text);
    if (this.history.length > 40) this.history.shift();
    this.update(0);
  }

  get last() { return this.history[this.history.length - 1] || ''; }

  update(dt) {
    const line = this.line;
    if (!line) return;
    line.t += Math.min(Math.max(dt, 0), 0.1);
    const t = line.t, fadeIn = 0.6, fadeOut = 0.9, end = fadeIn + line.hold + fadeOut;
    const k = t < 0 ? 0 : t < fadeIn ? t / fadeIn : t < fadeIn + line.hold ? 1 : Math.max(0, 1 - (t - fadeIn - line.hold) / fadeOut);
    const eased = k * k * (3 - 2 * k);
    this.el.hidden = t < 0 || t >= end;
    this.el.style.opacity = eased.toFixed(3);
    if (t >= end) {
      this.line = null;
      const next = this.queue.shift();
      if (next) this.start(next.text, next.delay, next.hold);
    }
  }

  clear() { this.queue.length = 0; this.line = null; this.el.hidden = true; }

  get visible() { return !this.el.hidden; }
}
