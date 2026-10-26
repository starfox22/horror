import test from 'node:test';
import assert from 'node:assert/strict';
import { PhoneMotion } from '../src/phone-motion.js';

test('phone pose and look samples freeze completely during pause', () => {
  const motion = new PhoneMotion();
  for (let i = 0; i < 30; i++) motion.update(1 / 60, { yaw: i, speed: 1.35, phase: i / 8, watch: true });
  const before = motion.update(0);
  for (let i = 0; i < 100; i++) assert.deepEqual(motion.update(0, { yaw: 200, pitch: 85, speed: 20, phase: 99 }), before);
});

test('phone raise framing stays inside the view; video moves smoothly nearer the centre', () => {
  const motion = new PhoneMotion(), lock = motion.update(1 / 60);
  const video = motion.update(1 / 60, { watch: true });
  assert.ok(video.x < lock.x && video.y > lock.y && video.z > lock.z);
  assert.ok(Math.abs(video.x - lock.x) < 0.005, 'no instant app-switch teleport');
  for (let i = 0; i < 180; i++) motion.update(1 / 60, { watch: true });
  const settled = motion.update(0);
  for (const fov of [60, 75, 90]) {
    const halfY = -settled.z * Math.tan(fov * Math.PI / 360);
    assert.ok(settled.y - 0.08 > -halfY && settled.y + 0.08 < halfY, `full phone fits at ${fov}° FOV`);
  }
});

test('looking across the angle wrap produces a small, bounded inertial response', () => {
  const motion = new PhoneMotion();
  motion.update(1 / 60, { yaw: 359 }); motion.update(1 / 60, { yaw: 1 });
  assert.ok(motion.x > 0 && motion.x < 0.002);
  motion.update(1 / 60, { yaw: 180, pitch: 85 });
  assert.ok(Math.abs(motion.x) <= 0.00504 && Math.abs(motion.y) <= 0.00288 && Math.abs(motion.roll) <= 1.44);
  for (let i = 0; i < 180; i++) motion.update(1 / 60, { yaw: 180, pitch: 85 });
  assert.ok(Math.abs(motion.x) < 1e-10 && Math.abs(motion.y) < 1e-10, 'hand settles when looking stops');
});

test('idle breathing and video transition match at 30, 60 and 144 fps', () => {
  const sample = fps => {
    const motion = new PhoneMotion();
    for (let i = 0; i < fps * 2; i++) motion.update(1 / fps, { watch: true });
    return motion.update(0);
  };
  const reference = sample(60);
  for (const fps of [30, 144]) for (const [key, value] of Object.entries(sample(fps))) assert.ok(Math.abs(value - reference[key]) < 1e-9, `${key} at ${fps} fps`);
});
