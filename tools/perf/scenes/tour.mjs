// A tour of the flat for a graphics review (build 0.15), for tools/perf/scene-shots.mjs: the rooms as the night begins
// (lit), then dark with the torch, the man in its beam, and a lightning flash. Setups run in the page (`s` is
// window.__app); yaw 0 looks along -z, 90 along -x, -90 along +x, 180 along +z.
export default [
  { name: 'tour-living-lit', wait: 6, setup: (s) => { s.view(1.0, 1.81, 3.6, 72, -8); } },
  { name: 'tour-kitchen-lit', wait: 6, setup: (s) => { s.view(0.6, 1.81, 2.6, 40, -12); } },
  { name: 'tour-office-lit', wait: 6, setup: (s) => { s.view(4.6, 1.81, 2.2, 15, -8); } },
  { name: 'tour-corridor-lit', wait: 6, setup: (s) => { s.view(12.3, 1.81, 3.55, 90, -6); } },
  { name: 'tour-bedroom-lit', wait: 6, setup: (s) => { s.view(10.55, 1.79, 2.1, -130, -10); } },
  { name: 'tour-bathroom-lit', wait: 6, setup: (s) => { s.view(8.8, 1.79, 1.7, 58, -14); } },
  { name: 'tour-living-torch', wait: 6, setup: (s) => {
    s.switches.rooms.forEach(r => { if (r.on) s.switches.toggle(r); }); s.devices.lamps.forEach(l => { if (l.on) s.devices.toggleLamp(l); });
    if (!s.flashlight.held) s.flashlight.pickUp({ on: true }); else if (!s.flashlight.on) s.flashlight.toggle();
    s.view(1.0, 1.81, 3.6, 72, -10); s.flashlight.rot.copy(s.camera.getRotation());
  } },
  { name: 'tour-bedroom-torch', wait: 6, setup: (s) => { s.view(10.55, 1.79, 2.1, -130, -12); s.flashlight.rot.copy(s.camera.getRotation()); } },
  { name: 'tour-kitchen-torch', wait: 6, setup: (s) => { s.view(0.6, 1.81, 2.6, 40, -14); s.flashlight.rot.copy(s.camera.getRotation()); } },
  { name: 'tour-man-in-the-beam', wait: 6, setup: (s) => {
    const man = s.intruder; man.show(true); man.place(7.4, 3.55, -90); man.play('idle_breathe_01', { blend: 0 });
    s.view(10.6, 1.81, 3.5, 90, -4); s.flashlight.rot.copy(s.camera.getRotation());
  } },
  { name: 'tour-lightning', wait: 1.2, setup: (s) => {
    s.intruder.show(false); if (s.flashlight.on) s.flashlight.toggle();
    s.view(-1.5, 1.81, 3.0, 80, -4); s.rain.strike?.();
  } },
];
