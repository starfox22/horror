export const FRAME_LIMITS = [0, 30, 60, 90, 120];
export const DEFAULT_FRAME_LIMIT = 60;

// Display refresh and requested FPS rarely divide evenly (for example, 60 FPS on
// a 144 Hz display). Keep deadlines on their original phase rather than starting
// a new interval after every accepted frame, which would steadily undershoot.
export class FrameCadence {
  constructor(limit = DEFAULT_FRAME_LIMIT) { this.setLimit(limit); }

  setLimit(limit) {
    const next = FRAME_LIMITS.includes(limit) ? limit : DEFAULT_FRAME_LIMIT;
    if (this.limit === next) return;
    this.limit = next;
    this.reset();
  }

  reset() { this.nextTime = null; this.lastTime = null; }

  shouldRun(now) {
    if (!Number.isFinite(now)) { this.reset(); return true; }
    // Resume with one ordinary frame; do not try to repay a hidden tab's debt.
    if (this.lastTime !== null && (now < this.lastTime || now - this.lastTime > 250)) this.reset();
    this.lastTime = now;
    if (!this.limit) return true;
    const interval = 1000 / this.limit;
    if (this.nextTime === null) { this.nextTime = now + interval; return true; }
    // RAF timestamps have submillisecond rounding. This tolerance only absorbs
    // rounding around a deadline; it never creates extra callbacks or spins.
    const tolerance = 0.5;
    if (now + tolerance < this.nextTime) return false;
    this.nextTime += Math.max(1, Math.floor((now - this.nextTime + tolerance) / interval) + 1) * interval;
    return true;
  }
}

// PlayCanvas 2.23.1 schedules its next RAF through app.tick. Filter callbacks
// before that tick consumes its timestamp: skipped display refreshes perform no
// engine update or render, while accepted frames receive the full elapsed dt.
// XR keeps its headset-driven frame cadence instead of the desktop preference.
export function installFrameLimiter(app, { limit = DEFAULT_FRAME_LIMIT, document: ownerDocument = globalThis.document } = {}) {
  const cadence = new FrameCadence(limit), originalTick = app.tick;
  let installed = true;
  const tick = (timestamp, xrFrame) => {
    if (!app.graphicsDevice) return;
    if (!installed) { originalTick(timestamp, xrFrame); return; }
    if (xrFrame || app.xr?.session) {
      cadence.reset();
      originalTick(timestamp, xrFrame);
      return;
    }
    if (cadence.shouldRun(timestamp ?? performance.now())) {
      originalTick(timestamp, xrFrame);
    } else {
      // This callback has already been consumed. Leave exactly one pending RAF,
      // as the original tick does, without touching PlayCanvas's _time or dt.
      app.frameRequestId = null;
      app.requestAnimationFrame();
    }
  };
  const reset = () => cadence.reset();
  const destroy = () => {
    if (!installed) return;
    installed = false;
    if (app.tick === tick) app.tick = originalTick;
    ownerDocument?.removeEventListener('visibilitychange', reset);
    app.off('destroy', destroy);
  };
  app.tick = tick;
  ownerDocument?.addEventListener('visibilitychange', reset);
  app.on('destroy', destroy);
  return { get limit() { return cadence.limit; }, setLimit: value => cadence.setLimit(value), reset, destroy };
}
