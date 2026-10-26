// The phone (build 0.15) for tools/perf/scene-shots.mjs: in the hand (lock screen with the alerts, Home Cam, a clip,
// LIVE, the emergency call) and lying on the nightstand (booting, the alerts). Setups run in the page with window.__app
// as `s` and cannot see this module, so the first one puts its helpers on `s`.
export default [
  { name: 'phone-prep', wait: 1, setup: (s) => {
    // In the hand, showing `app` (lock, cam, clip, live, call).
    s.holdPhone = (app, sel = 0) => {
      const ph = s.phone;
      if (!ph.booted) ph.boot({ now: true });
      ph.has = true; ph.onCharger = false; ph.charger?.(false); ph.charge = 23; ph.lit = 0;
      ph.raised = true; ph.raiseK = 1; ph.call = null; ph.seccam?.stopLive?.(); ph.video.enabled = false;
      ph.app_ = app === 'call' ? 'call' : app === 'lock' ? 'lock' : 'cam';
      if (app === 'clip') ph.playClip({ id: '0258', time: '02:58', title: 'Motion · Bedroom', evidence: 'clip-0258' });
      if (app === 'live') ph.openLive();
      if (app === 'call') ph.call = { t: 41, sent: true, connected: true, line: 'Officers are on their way. Two minutes. Stay on the line if you can. Is there somewhere you can hide?',
        choices: [{ text: '"He’s in the ceiling. Above my wardrobe."', id: 'where' }, { text: '"It’s the man they evicted. From 5B."', id: 'who' }] };
      ph.sel = sel; ph.dirty = true;
    };
    s.dark = () => {
      s.switches.rooms.forEach(r => { if (r.on) s.switches.toggle(r); });
      s.devices.lamps.forEach(l => { if (l.on) s.devices.toggleLamp(l); });
    };
  } },
  // The corridor in the dark, the torch on, the phone up: the alerts.
  { name: 'phone-lock', wait: 6, setup: (s) => {
    s.dark(); if (!s.flashlight.held) s.flashlight.pickUp({ on: true }); else if (!s.flashlight.on) s.flashlight.toggle();
    s.view(8.6, 1.79, 3.5, 90, -6); s.flashlight.rot.copy(s.camera.getRotation());
    s.holdPhone('lock', 0);
  } },
  { name: 'phone-cam', wait: 5, setup: (s) => { s.holdPhone('cam', 1); } },
  { name: 'phone-clip', wait: 6, setup: (s) => { s.holdPhone('clip'); } },
  { name: 'phone-live', wait: 6, setup: (s) => { s.view(6.0, 1.79, 3.5, -90, -4); s.flashlight.rot.copy(s.camera.getRotation()); s.holdPhone('live'); } },
  { name: 'phone-call', wait: 5, setup: (s) => { s.holdPhone('call', 0); } },
  // Lying on the nightstand, lit by the alerts, seen from the bed.
  { name: 'phone-nightstand', wait: 6, setup: (s) => {
    const ph = s.phone;
    ph.raised = false; ph.raiseK = 0; ph.has = false; ph.onCharger = true; ph.charger?.(true); ph.app_ = 'lock'; ph.call = null;
    ph.seccam?.stopLive?.(); ph.video.enabled = false;
    ph.lit = 30; ph.dirty = true;
    if (s.flashlight.held && !s.flashlight.on) s.flashlight.toggle();
    s.view(13.2, 1.3, 1.38, -138, -50); s.flashlight.rot.copy(s.camera.getRotation());
  } },
];
