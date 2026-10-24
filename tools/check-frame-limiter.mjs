// Deterministic display clocks test the real cadence and the actual PlayCanvas
// tick, independently of a cloud browser's slower software-rendered apartment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AppBase } from 'playcanvas';
import { FrameCadence, installFrameLimiter } from '../src/frame-limiter.js';

function display(cadence, hz, seconds, start = 1000) {
  const accepted = [];
  for (let frame = 0; frame <= hz * seconds; frame++) {
    const now = start + frame * 1000 / hz;
    if (cadence.shouldRun(now)) accepted.push(now);
  }
  return accepted;
}

for (const hz of [60, 120, 144]) for (const limit of [0, 30, 60, 90, 120]) {
  test(`${limit || 'uncapped'} FPS on a ${hz} Hz display stays on cadence without drift`, () => {
    const seconds = 120, accepted = display(new FrameCadence(limit), hz, seconds);
    const expected = (limit ? Math.min(limit, hz) : hz) * seconds + 1;
    assert.ok(Math.abs(accepted.length - expected) <= 1, `${accepted.length} frames, expected ${expected}`);
    const maxInterval = 1000 / (limit ? Math.min(limit, hz) : hz) + 1000 / hz + 0.1;
    for (let frame = 1; frame < accepted.length; frame++) {
      assert.ok(accepted[frame] > accepted[frame - 1]);
      assert.ok(accepted[frame] - accepted[frame - 1] <= maxInterval, 'missed an available display refresh');
    }
  });
}

test('deadline rounding remains stable with fractional RAF timestamp jitter', () => {
  const cadence = new FrameCadence(60);
  let count = 0;
  for (let frame = 0; frame <= 144 * 120; frame++) {
    const now = 1000 + frame * 1000 / 144 + (frame % 3 - 1) * 0.04;
    if (cadence.shouldRun(now)) count++;
  }
  assert.ok(Math.abs(count - 7201) <= 1, `${count} frames`);
});

test('submillisecond RAF jitter does not drop frames at a late initial clock phase', () => {
  for (const hz of [60, 120]) for (const limit of [30, 60, 90, 120]) {
    for (const jitter of [0.08, 0.2]) for (const phase of [0, 1, 2]) {
      const cadence = new FrameCadence(limit);
      let count = 0;
      for (let frame = 0; frame <= hz * 120; frame++) {
        const now = 1000 + frame * 1000 / hz + ((frame + phase) % 3 - 1) * jitter;
        if (cadence.shouldRun(now)) count++;
      }
      const expected = Math.min(hz, limit) * 120 + 1;
      assert.ok(Math.abs(count - expected) <= 1, `${hz}Hz, ${limit}FPS, ±${jitter}ms phase ${phase}: ${count}, expected ${expected}`);
    }
  }
});

test('resume, backwards clocks and live limit changes reset timing without catch-up debt', () => {
  const cadence = new FrameCadence(30);
  assert.equal(cadence.shouldRun(1000), true);
  assert.equal(cadence.shouldRun(1008), false);
  assert.equal(cadence.shouldRun(100000), true, 'resume renders immediately');
  assert.equal(cadence.shouldRun(100008), false, 'resume must not produce a catch-up burst');
  assert.equal(cadence.shouldRun(50), true, 'a new clock origin resets safely');
  assert.equal(cadence.shouldRun(58), false);
  cadence.setLimit(120);
  assert.equal(cadence.shouldRun(60), true, 'the new preference takes effect immediately');
  assert.equal(cadence.shouldRun(64), false);
  cadence.setLimit(0);
  assert.equal(cadence.shouldRun(65), true);
  assert.equal(cadence.shouldRun(66), true);
  cadence.setLimit(30);
  assert.equal(cadence.shouldRun(67), true);
  assert.equal(cadence.shouldRun(75), false);
});

test('real PlayCanvas tick caps updates and renders together and preserves elapsed dt', () => {
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  let nextId = 0;
  const pending = new Map(), document = new EventTarget();
  globalThis.requestAnimationFrame = callback => { const id = ++nextId; pending.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => pending.delete(id);
  const app = new AppBase({ id: 'frame-limiter-test' });
  const engineTick = app.tick;
  let updates = 0, renders = 0, frames = 0, processed = 0, elapsed = 0;
  app.graphicsDevice = { contextLost: false };
  app._stats = { updateBasic() {}, frameEnd() {} };
  app._processTimestamp = timestamp => { processed++; return timestamp; };
  app.update = dt => { updates++; elapsed += dt; };
  app.render = () => { renders++; };
  app.on('frameend', () => { frames++; });
  const limiter = installFrameLimiter(app, { limit: 30, document });
  const advance = (now, xrFrame) => {
    assert.equal(pending.size, 1, 'exactly one engine RAF may be pending');
    const [id, callback] = pending.entries().next().value;
    pending.delete(id);
    callback(now, xrFrame);
  };
  try {
    app.requestAnimationFrame();
    for (let index = 0; index <= 120 * 4; index++) advance(1000 + index * 1000 / 120);
    assert.equal(renders, 121);
    assert.equal(updates, renders);
    assert.equal(frames, renders, 'FPS / frameend subscribers see only real frames');
    assert.equal(processed, renders, 'skipped RAFs never consume the engine timestamp');
    assert.ok(Math.abs(elapsed - 4) < 1e-8, `movement elapsed ${elapsed}, expected 4 seconds`);
    assert.equal(app._time, 5000);
    advance(5000 + 1000 / 120);
    assert.equal(app._time, 5000, 'a skipped refresh cannot shorten the next physics/audio dt');
    document.dispatchEvent(new Event('visibilitychange'));
    advance(5010);
    assert.equal(renders, 122, 'visibility resume clears the old deadline');
    limiter.setLimit(0);
    advance(5020);
    assert.equal(renders, 123);
    limiter.setLimit(30);
    app.xr = { update: () => true };
    advance(5030, {});
    advance(5031, {});
    assert.equal(renders, 125, 'XR frames keep the headset cadence');
    app.xr.session = { requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
    advance(5032);
    advance(5033);
    assert.equal(renders, 127, 'an active XR session also bypasses the desktop limiter');
    assert.equal(limiter.limit, 30, 'XR does not overwrite the desktop preference');
    app.fire('destroy');
    assert.equal(app.tick, engineTick, 'destroy restores the engine callback');
    app.graphicsDevice = null;
    advance(5040);
    assert.equal(pending.size, 0, 'a destroyed app must not keep scheduling callbacks');
  } finally {
    limiter.destroy();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
