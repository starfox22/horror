// Same cameras/timelines for 0.15 and 0.16. No image retouching or substitute UI.
import callRace from './call-race.mjs';
export default [
  { name: 'hud-replacement', wait: 4, setup: s => {
    s.view(-1.5, 1.77, 1.5); s.camera.lookAt(-4.6, 1.3, 2.6);
    s.eyes.fixed = 1; s.eyes.value = 1; s.eyes.update(0);
    s.rain.flash.next = 1e9; s.rain.flash.seq = [];
    document.getElementById('stats').hidden = true;
    document.getElementById('grain').style.animation = 'none';
    // Advance actual HUD callbacks with a controlled clock. A stale fade from
    // the old C prompt must not hide the new long-lived F instruction.
    const realSet = window.setTimeout, realClear = window.clearTimeout;
    const timers = new Map(); let now = 0, id = 1e9;
    window.setTimeout = (fn, ms = 0) => { timers.set(++id, { fn, at: now + ms }); return id; };
    window.clearTimeout = key => timers.delete(key);
    const advance = target => {
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = target;
    };
    try {
      s.hud.prompt('C', 'Crouch', 1); advance(1500);
      s.hud.prompt('F', 'Flashlight on', 30); advance(2000);
    } finally { window.setTimeout = realSet; window.clearTimeout = realClear; }
  } },
  ...callRace,
  { name: 'power-rapid-off', wait: 4, setup: async s => {
    s.hud.promptEl.hidden = true;
    s.power.paused = () => false;
    s.switches.rooms.forEach(r => { if (!r.on) s.switches.toggle(r); });
    s.power.setMain(false);
    for (let i = 0; i < 40; i++) s.power.update(0.05);
    s.power.setMain(true); s.power.update(0.05); s.power.setMain(false);
    for (let i = 0; i < 6; i++) s.power.update(0.1);
    // Hold the inspected transition while rendering. Main is OFF in both
    // versions; only the old superseded restore incorrectly leaves light on.
    s.power.paused = () => true;
    s.rain.roomLight = 0;
    s.switches.rooms.forEach(r => s.switches.apply(r));
    await s.probes.captureAll();
    s.view(-1.5, 1.77, 1.5); s.camera.lookAt(-4.6, 1.3, 2.6);
    s.eyes.fixed = 1; s.eyes.value = 1; s.eyes.update(0);
    s.rain.flash.next = 1e9; s.rain.flash.seq = [];
    document.getElementById('stats').hidden = true;
    document.getElementById('grain').style.animation = 'none';
  } },
];
