// Scripted events, in the order they happen in the story (docs/STORY.md). This list is what the developer menu shows
// (devmenu.js, Events: play any of them now); the story itself (story.js) decides when each happens in a real night.
// Each event:
//   id       stable name (also used for the console: __app.events.run('falling-glass'))
//   label    what the developer menu calls it
//   when     a sentence on what makes it happen in the game
//   trigger  optional { signal, delay }: it fires `delay` seconds of play after a system sends `signal` (Director.signal),
//            once. Seconds of play: the clock stops while the game is paused or the tab is hidden.
//   run(ctx) what it does (ctx.story: story.js; ctx.fallingGlass: the 0.12 event on its own).
export const STORY_EVENTS = [
  {
    id: 'falling-glass',
    label: 'Falling glass',
    when: 'Three seconds after the refrigerator is shut, once the player has drunk the glass of water.',
    trigger: { signal: 'fridge-shut-after-drink', delay: 3 },
    run: ctx => (ctx.story ? ctx.story.glassBreaks() : ctx.fallingGlass()),
  },
  { id: 'crow', label: 'The crow at the window', when: 'Once, before the hunt: standing near a window and looking at it, a crow slams into the glass (the developer menu: the window nearest the view).',
    run: ctx => ctx.story.sys.crow?.strike({ force: true }) },
  { id: 'bathroom-locked', label: 'The locked bathroom', when: 'The player tries the bathroom door after the glass: locked; the tap stops; the light under the door goes out; knocking brings the bang.',
    run: ctx => { ctx.story.set('glass'); ctx.story.sys.world?.bathroomOccupied(true); ctx.story.bathroomTried(); } },
  { id: 'power-cut', label: 'The bang (power cut)', when: 'Two seconds of silence after the player knocks on the bathroom door (or 120 s after the glass).',
    run: ctx => ctx.story.powerCut('dev') },
  { id: 'silhouette', label: 'The man in the corridor', when: 'While the fuse box is open, the torch aimed down the corridor: a man by the front door runs at the player and into the bedroom.',
    run: ctx => { ctx.story.flags.delete('silhouette'); ctx.story.sighting = null; ctx.story.startSighting({ seen: true }); } },
  { id: 'power-back', label: 'Power back', when: 'The player switches the wet circuit off and the RCD back up.',
    run: ctx => { const p = ctx.story.sys.power; p.breakers.bathroom = false; if (ctx.story.nuisance !== 'none') p.breakers[ctx.story.nuisance] = false; p.setMain(true); p.setRcd(true); } },
  { id: 'tap-off', label: 'The tap, and the ceiling', when: 'The player turns off the bathroom tap: something heavy shifts in the ceiling towards the wardrobe.',
    run: ctx => ctx.story.tapOff() },
  { id: 'alerts', label: 'The phone boots', when: 'On its charger once the power is back (after the quiet): it buzzes hard against the nightstand with the camera alerts it missed.',
    run: ctx => { const ph = ctx.story.sys.phone; ph.booted = false; if (!ph.has) { ph.onCharger = true; ph.charger?.(true); } ph.boot(); } },
  { id: 'nest', label: 'The nest', when: 'The player opens the wardrobe’s right door after the power cut: a hanger drops, then his things.',
    run: ctx => { ctx.story.flags.delete('hanger'); ctx.story.wardrobeOpened({ id: 'right' }); } },
  { id: 'live', label: 'LIVE', when: 'The player opens LIVE in the camera app: he comes out of the wardrobe; the power dies.',
    run: ctx => ctx.story.sys.seccam?.runLive() },
  { id: 'hunt', label: 'The hunt', when: 'The end of LIVE, an emergency call, or 75 s after the nest, or 150 s after the power came back.',
    run: ctx => ctx.story.huntStart('dev') },
  { id: 'caught', label: 'Caught', when: 'He reaches the player during the hunt: the knife, the fall, waking on the sofa.',
    run: ctx => ctx.story.caught() },
  { id: 'end-sweet-dreams', label: 'Ending: Sweet Dreams', when: 'Holding E on the bed between the glass and the power cut.',
    run: ctx => ctx.story.sys.endings.play('sweet-dreams') },
  { id: 'end-out', label: 'Ending: Out', when: 'Unlocking the front door with the spare key.',
    run: ctx => ctx.story.sys.endings.play('out') },
  { id: 'end-locked', label: 'Ending: Locked From the Inside', when: 'The police arrive; the player could not tell them where he is.',
    run: ctx => ctx.story.sys.endings.police('locked') },
  { id: 'end-evicted', label: 'Ending: Evicted', when: 'The police arrive; the player told them where (the ceiling) and who (the man they evicted).',
    run: ctx => ctx.story.sys.endings.police('evicted') },
];

// Runs the story events: waits for their signals, counts their delay in play time, and runs each once. Manual runs (the
// developer menu, the console) do not count as an event's story run: run() plays one now; queue() plays one a few
// seconds of play later (the developer menu: never while paused, so it can be watched from its start).
export class Director {
  // ctx: what events act on; isPlaying(): whether play time is passing (pointer locked, tab visible).
  constructor({ app, ctx, isPlaying = () => true, events = STORY_EVENTS }) {
    Object.assign(this, { app, ctx, isPlaying, events });
    this.fired = new Set();
    this.pending = [];
    this.log = [];
    this.queued = null;          // the developer menu's waiting run: { event, left, manual: true }
    this.lastManual = null;      // the last event it played
    this.onQueue = null;         // called when the waiting run changes (queued, played, cancelled)
    this._update = dt => this.update(dt);
    app?.on?.('update', this._update);
  }

  get(id) { return this.events.find(e => e.id === id) ?? null; }

  // A system reports that something happened ('fridge-shut-after-drink', ...).
  signal(name) {
    for (const event of this.events) {
      if (event.trigger?.signal !== name || this.fired.has(event.id) || this.pending.some(p => p.event === event && !p.manual)) continue;
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
      if (p.manual) {
        if (this.queued === p) this.queued = null;
        this.lastManual = p.event;
        this.play(p.event, 'manual');
        this.onQueue?.();
        continue;
      }
      this.fired.add(p.event.id);
      this.play(p.event, 'story');
    }
  }

  // Play an event now (console, tests). Returns false for an unknown id.
  run(id) {
    const event = this.get(id);
    if (!event) return false;
    this.play(event, 'manual');
    return true;
  }

  // The developer menu: play an event (an id, or any { id, label, run(ctx) } action) once `delay` seconds of play have
  // passed, counted only while the game is being played (so a pick made in the pause menu starts counting on resume).
  // One at a time: a new pick replaces the one waiting. Returns the waiting run, or null for an unknown id.
  queue(action, delay = 3) {
    const event = typeof action === 'string' ? this.get(action) : action;
    if (!event) return null;
    this.cancelQueued(false);
    this.queued = { event, left: delay, manual: true };
    this.pending.push(this.queued);
    this.onQueue?.();
    return this.queued;
  }

  cancelQueued(notify = true) {
    if (!this.queued) return;
    const i = this.pending.indexOf(this.queued);
    if (i >= 0) this.pending.splice(i, 1);
    this.queued = null;
    if (notify) this.onQueue?.();
  }

  play(event, how) {
    this.log.push({ id: event.id, how, at: performance.now() });
    try { event.run(this.ctx); } catch (error) { console.error(`Event ${event.id} failed`, error); }
  }

  reset() { this.fired.clear(); this.pending.length = 0; this.queued = null; this.onQueue?.(); }

  destroy() { this.app?.off?.('update', this._update); }
}
