// Scripted events, in the order they happen in the story. This list is the one place to add, remove or reorder them:
// the developer menu (devmenu.js, Events) lists them in this order and can trigger any of them at once for testing.
// Each event:
//   id       stable name (also used for the console: __app.events.run('falling-glass'))
//   label    what the developer menu calls it
//   when     a sentence on what makes it happen in the game
//   trigger  { signal, delay }: it fires `delay` seconds of play after a system sends `signal` (Director.signal), once.
//            Seconds of play: the clock stops while the game is paused or the tab is hidden.
//   run(ctx) what it does (ctx: the systems from main.js, see Director).
export const STORY_EVENTS = [
  {
    id: 'falling-glass',
    label: 'Falling glass',
    when: 'Three seconds after the refrigerator is shut, once the player has drunk the glass of water.',
    trigger: { signal: 'fridge-shut-after-drink', delay: 3 },
    run: ctx => ctx.fallingGlass(),
  },
];

// Runs the story events: waits for their signals, counts their delay in play time, and runs each once. Manual runs (the
// developer menu) play an event straight away and do not count as its story run.
export class Director {
  // ctx: what events act on; isPlaying(): whether play time is passing (pointer locked, tab visible).
  constructor({ app, ctx, isPlaying = () => true, events = STORY_EVENTS }) {
    Object.assign(this, { app, ctx, isPlaying, events });
    this.fired = new Set();
    this.pending = [];
    this.log = [];
    this._update = dt => this.update(dt);
    app?.on?.('update', this._update);
  }

  get(id) { return this.events.find(e => e.id === id) ?? null; }

  // A system reports that something happened ('fridge-shut-after-drink', ...).
  signal(name) {
    for (const event of this.events) {
      if (event.trigger?.signal !== name || this.fired.has(event.id) || this.pending.some(p => p.event === event)) continue;
      this.pending.push({ event, left: event.trigger.delay ?? 0 });
    }
  }

  update(dt) {
    if (!this.pending.length || !this.isPlaying()) return;
    // A long frame (tab switch, hitch) counts at most a tenth of a second, so a delay is never skipped through.
    const step = Math.min(Math.max(dt, 0), 0.1);
    for (const p of [...this.pending]) {
      p.left -= step;
      if (p.left > 1e-6) continue;
      this.pending.splice(this.pending.indexOf(p), 1);
      this.fired.add(p.event.id);
      this.play(p.event, 'story');
    }
  }

  // Play an event now (developer menu, console). Returns false for an unknown id.
  run(id) {
    const event = this.get(id);
    if (!event) return false;
    this.play(event, 'manual');
    return true;
  }

  play(event, how) {
    this.log.push({ id: event.id, how, at: performance.now() });
    try { event.run(this.ctx); } catch (error) { console.error(`Event ${event.id} failed`, error); }
  }

  destroy() { this.app?.off?.('update', this._update); }
}
