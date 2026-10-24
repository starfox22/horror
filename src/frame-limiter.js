// -1 = VSync (the default): frames on whole display refreshes, every refresh on a 60-90 Hz screen, every second one on
// 120-179 Hz, and so on, so the rate is never below 60 and every frame lasts the same number of refreshes. A plain 60
// cap on a 144 Hz screen alternates 2- and 3-refresh frames, which reads as constant stutter. 0 = every refresh.
export const VSYNC = -1;
export const FRAME_LIMITS = [VSYNC, 0, 30, 60, 90, 120];
export const DEFAULT_FRAME_LIMIT = VSYNC;

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

  // The display's refresh period (ms), from the gaps between RAF callbacks: the median of recent gaps under 50 ms
  // (a skipped callback costs nothing, so the gaps are the refresh itself; slow frames show as multiples, which the
  // median ignores while most callbacks are on time). null until enough callbacks have been seen.
  observe(gap) {
    if (!(gap > 2 && gap < 50)) return;
    const g = this.gaps ||= [];
    g.push(gap); if (g.length > 90) g.shift();
    if (g.length >= 12 && (this.sinceEstimate = (this.sinceEstimate || 0) + 1) >= 15) {
      this.sinceEstimate = 0;
      this.refresh = [...g].sort((a, b) => a - b)[g.length >> 1];
    }
  }

  // VSync's whole-refresh step: how many refreshes each frame lasts.
  get refreshesPerFrame() { return this.refresh ? Math.max(1, Math.floor(1000 / this.refresh / 60 + 0.1)) : 1; }

  shouldRun(now) {
    if (!Number.isFinite(now)) { this.reset(); return true; }
    const gap = this.lastTime === null ? null : now - this.lastTime;
    // Resume with one ordinary frame; do not try to repay a hidden tab's debt.
    if (this.lastTime !== null && (now < this.lastTime || now - this.lastTime > 250)) this.reset();
    if (gap !== null) this.observe(gap);
    this.lastTime = now;
    if (!this.limit) return true;
    let interval = 1000 / this.limit, tolerance = 0.5;
    if (this.limit === VSYNC) {
      const n = this.refreshesPerFrame;
      if (n === 1) { this.nextTime = null; return true; }
      // Deadlines on whole refreshes; half a refresh of tolerance absorbs RAF timestamp jitter.
      interval = n * this.refresh; tolerance = this.refresh * 0.5;
    }
    // VSync re-anchors on every frame it runs: callbacks arrive on refreshes, so the next deadline is `n` refreshes from
    // this one, and neither timestamp jitter nor a slightly wrong refresh estimate can accumulate into a skipped beat.
    if (this.nextTime === null || (this.limit === VSYNC && now + tolerance >= this.nextTime)) { this.nextTime = now + interval; return true; }
    // RAF timestamps have submillisecond rounding. This tolerance only absorbs
    // rounding around a deadline; it never creates extra callbacks or spins.
    if (now + tolerance < this.nextTime) return false;
    this.nextTime += Math.max(1, Math.floor((now - this.nextTime + tolerance) / interval) + 1) * interval;
    return true;
  }

  // Frames per second the cadence delivers on this display (VSync: refresh / step; 0: the refresh rate).
  get targetFps() {
    const hz = this.refresh ? 1000 / this.refresh : 60;
    return this.limit === VSYNC ? hz / this.refreshesPerFrame : this.limit || hz;
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
  return { get limit() { return cadence.limit; }, get targetFps() { return cadence.targetFps; }, get refreshRate() { return cadence.refresh ? 1000 / cadence.refresh : null; },
    setLimit: value => cadence.setLimit(value), reset, destroy };
}
