// A fit regression against the shipped mesh, not a test of duplicated pose formulas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAND } from '../src/phone-grip.js';
import { BASELINE_HAND, GRIP_VIEWS, measurePhoneGrip } from './phone/grip-check.mjs';

for (const view of GRIP_VIEWS) test(`the phone-specific grip supports the actual handset without obscuring its screen (${view})`, async () => {
  const report = await measurePhoneGrip(HAND, view);
  assert.equal(report.pass, true, report.failures.join('\n'));
  assert.equal(report.trianglesOverScreen, 0, 'the phone can be read without a thumb across its display');
  assert.equal(report.screenFrontVertices, 0);
  assert.ok(report.maxEnvelopeCompressionMm <= 1, 'only submillimetre skin compression is allowed');
  for (const [finger, gap] of Object.entries(report.fingertipGapMm)) assert.ok(gap <= 3, `${finger} must support the handset (${gap} mm gap)`);
});

test('the previous glass-based grip reproduces its phone obstruction and floating fingers', async () => {
  const report = await measurePhoneGrip(BASELINE_HAND);
  assert.equal(report.pass, false);
  assert.ok(report.screenFrontVertices > 300, 'the old thumb crossed the glass');
  assert.ok(report.trianglesOverScreen > 0, 'the checker catches projected triangle overlap as well as vertices');
  assert.ok(Object.values(report.fingertipGapMm).some(gap => gap > 10), 'the old fingers do not touch the phone sides');
});
