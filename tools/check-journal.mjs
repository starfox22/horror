import test from 'node:test';
import assert from 'node:assert/strict';
import { Journal, EVIDENCE } from '../src/journal.js';

test('legacy dead-phone and unknown evidence cannot inflate a resumed journal', () => {
  const journal = new Journal();
  journal.find('notice');
  journal.load(['phone-dead', 'notice', 'unknown', 'glass', 'notice']);
  assert.equal(journal.count, 2);
  assert.deepEqual(journal.save(), ['notice', 'glass']);
  assert.deepEqual(journal.entries().map(e => e.id), ['notice', 'glass']);
  assert.equal(journal.pending.length, 0, 'no toast from the abandoned run survives Continue');
});

test('all current journal entries are discoverable without a dead-phone objective', () => {
  const journal = new Journal();
  assert.ok(!EVIDENCE.some(e => e.id === 'phone-dead'));
  for (const evidence of EVIDENCE) assert.equal(journal.find(evidence.id), true);
  assert.equal(journal.count, journal.total);
  journal.load([...journal.save(), 'phone-dead']);
  assert.equal(journal.count, journal.total);
});
