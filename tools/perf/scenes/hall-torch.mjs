// The corridor in the dark with the torch (build 0.15: the floors' normals, the beam's dithering), for
// tools/perf/scene-shots.mjs: four views down the corridor, the same as build 0.14's "before" captures.
export default [
  { name: 'hall-east-looking-west', wait: 6, setup: (s) => {
    s.switches.rooms.forEach(r => { if (r.on) s.switches.toggle(r); }); s.devices.lamps.forEach(l => { if (l.on) s.devices.toggleLamp(l); });
    if (!s.flashlight.held) s.flashlight.pickUp({ on: true }); else if (!s.flashlight.on) s.flashlight.toggle();
    s.camera.setPosition(11.8, 1.79, 3.55); s.camera.setEulerAngles(-18, 90, 0); s.flashlight.rot.copy(s.camera.getRotation());
  } },
  { name: 'hall-east-floor', wait: 6, setup: (s) => { s.camera.setPosition(11.8, 1.79, 3.55); s.camera.setEulerAngles(-32, 90, 0); s.flashlight.rot.copy(s.camera.getRotation()); } },
  { name: 'hall-west-looking-east', wait: 6, setup: (s) => { s.camera.setPosition(3.2, 1.79, 3.6); s.camera.setEulerAngles(-20, -90, 0); s.flashlight.rot.copy(s.camera.getRotation()); } },
  { name: 'hall-mid-looking-west', wait: 6, setup: (s) => { s.camera.setPosition(8.5, 1.79, 3.5); s.camera.setEulerAngles(-25, 90, 0); s.flashlight.rot.copy(s.camera.getRotation()); } },
];
