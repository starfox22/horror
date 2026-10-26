// Identical real-game captures for the 0.16 -> 0.17 phone review.
export default [
  { name: 'phone-first-pickup', wait: 5, setup: s => {
    s.view(8.6, 1.79, 3.5, 90, -6);
    s.eyes.fixed = 1; s.eyes.value = 1; s.eyes.update(0);
    s.rain.flash.next = 1e9; s.rain.flash.seq = [];
    document.getElementById('stats').hidden = true;
    document.getElementById('grain').style.animation = 'none';
    s.hud.promptEl.hidden = true;
    s.switches.rooms.forEach(r => { if (!r.on) s.switches.toggle(r); });
    s.flashlight.pickUp({ on: true }); s.flashlight.rot.copy(s.camera.getRotation());
    const ph = s.phone;
    ph.takeFromCharger(); ph.toggle();
    for (let i = 0; i < 100; i++) ph.update(0.05);
  } },
  { name: 'phone-lock', wait: 5, setup: s => {
    const ph = s.phone;
    ph.booted = true; ph.booting = null; ph.charge = 100;
    ph.raised = true; ph.raiseK = 1; ph.app_ = 'lock'; ph.sel = 0; ph.dirty = true;
    for (let i = 0; i < 100; i++) ph.update(0.05);
  } },
  { name: 'phone-video', wait: 5, setup: s => {
    s.phone.playClip({ id: '0258', time: '02:58', title: 'Motion · Bedroom', evidence: 'clip-0258' });
    for (let i = 0; i < 100; i++) s.phone.update(0.05);
  } },
  { name: 'phone-call', wait: 5, setup: s => {
    s.phone.seccam?.stopLive(); s.phone.video.enabled = false;
    s.phone.app_ = 'call'; s.phone.call = { t: 0, connected: true, line: '112. What’s your emergency?',
      choices: [{ id: 'unsure', text: 'I thought I heard someone in my flat.' }] };
    s.phone.dirty = true;
    for (let i = 0; i < 100; i++) s.phone.update(0.05);
  } },
];
