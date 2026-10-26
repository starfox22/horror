// A grip for the downloaded phone, not the drinking glass. The same licensed Rocketbox hand is reused, with its
// fingers fitted individually against the phone's 73.10 × 150 × 13.29 mm envelope and screen. Quaternions are local
// rotations relative to drinking-arm.glb's identity rest pose; they do not modify the arm asset or its drinking pose.
// tools/phone/grip-check.mjs skins the actual asset to verify the contact, compression and unobstructed screen.
import { Vec3 } from 'playcanvas';

const tilt = 21.83570535 * Math.PI / 180;
export const HAND = {
  palm: new Vec3(0.037492626, -0.055, -0.020),
  fingers: new Vec3(-Math.cos(tilt), Math.sin(tilt), 0),
  facing: new Vec3(0, 0, 1),
  grip: 0,
  shoulder: new Vec3(0.19, -0.25, 0.09),
  joints: {
    index_01_r: [0.02055969, 0.00048903, 0.00449346, 0.99977841],
    index_02_r: [-0.12175265, -0.00289598, -0.02660985, 0.99219949],
    index_03_r: [-0.42009013, -0.00999217, -0.09181348, 0.90277058],
    middle_01_r: [0.12987902, -0.01129691, -0.00639578, 0.99144486],
    middle_02_r: [-0.41150886, 0.03579356, 0.02026441, 0.91047714],
    middle_03_r: [-0.43588695, 0.03791355, 0.02146488, 0.89894627],
    ring_01_r: [0.12980369, -0.01074948, -0.00851683, 0.99144486],
    ring_02_r: [-0.45497234, 0.03767779, 0.02985218, 0.88920718],
    ring_03_r: [-0.25731506, 0.02130913, 0.01688326, 0.96594505],
    pinky_01_r: [0.02852535, -0.00579685, -0.00561571, 0.99956049],
    pinky_02_r: [-0.02549861, 0.00518176, 0.00501985, 0.99964882],
    pinky_03_r: [-0.38013360, 0.07724926, 0.07483586, 0.91865695],
    thumb_01_r: [-0.06060650, 0.70956984, -0.06125928, 0.69934598],
    thumb_02_r: [0.11581497, -0.16628972, -0.30267800, 0.93130052],
    thumb_03_r: [0.16918408, -0.24291827, -0.44215611, 0.84667906],
  },
};
