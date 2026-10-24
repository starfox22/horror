// Shader warm-up behind the loading screen. A material's shaders (and on WebGPU its render pipelines) are built the first
// time it is drawn by a camera; drawn mid-game, that compile stalls the frame, up to a second for a room's worth of
// materials (the first look into the bedroom, the first coffee, the drinking hand). Before play starts the player's camera
// looks six ways from a point in every area, with the things that only appear later (the drinking hand, the coffee's
// liquid and steam, the rain outside that a flash reveals) shown for those frames, so every one of them is built now.
import { Vec3 } from 'playcanvas';

// Points across the flat (chest height): the probe points (probes.js) and the corners they do not see well.
const POINTS = [
  [11.2, 1.5, 0.5], [12.9, 1.5, 1.8], [11.6, 1.5, 3.55], [7.6, 1.5, 3.55], [2.6, 1.5, 3.55], [7.7, 1.5, 0.45],
  [4.2, 1.5, 0.8], [-1.2, 1.55, 0.6], [1.2, 1.4, 0.4], [-4.6, 1.4, 1.5],
];
// Pitch, yaw: four ways round, then up and down.
const VIEWS = [[0, 0], [0, 90], [0, 180], [0, 270], [70, 0], [-70, 0]];

export async function warmUp({ app, camera, reveal = [], progress = () => {} }) {
  const position = camera.getPosition().clone(), rotation = camera.getRotation().clone();
  const restore = reveal.map(show => show()).filter(Boolean);
  const frame = () => new Promise(resolve => app.once('frameend', resolve));
  const total = POINTS.length * VIEWS.length;
  let done = 0;
  try {
    for (const [x, y, z] of POINTS) for (const [pitch, yaw] of VIEWS) {
      camera.setPosition(x, y, z);
      camera.setEulerAngles(pitch, yaw, 0);
      await frame();
      progress(++done / total);
    }
  } finally {
    for (const undo of restore) undo();
    camera.setPosition(position);
    camera.setRotation(rotation);
  }
}

// Shows `entity` in front of the camera for the warm-up (a camera child such as the drinking hand's carrier).
export function revealInFront(entity, offset = new Vec3(0.05, -0.15, -0.45)) {
  return () => {
    const enabled = entity.enabled, local = entity.getLocalPosition().clone();
    entity.enabled = true;
    entity.setLocalPosition(offset);
    return () => { entity.setLocalPosition(local); entity.enabled = enabled; };
  };
}
