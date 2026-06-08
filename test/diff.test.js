import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, diffSummary } from '../public/lib/diff.js';

test('diffLines marks inserted and removed lines', () => {
  const changes = diffLines('alpha\nold\nomega', 'alpha\nnew\nomega');
  assert.deepEqual(changes.map((change) => change.type), ['equal', 'added', 'removed', 'equal']);
  assert.equal(changes[1].right, 'new');
  assert.equal(changes[2].left, 'old');
});

test('diffLines keeps matching text aligned', () => {
  const changes = diffLines('one\ntwo', 'one\ntwo');
  assert.deepEqual(changes.map((change) => change.type), ['equal', 'equal']);
  assert.deepEqual(diffSummary(changes), { added: 0, removed: 0, equal: 2 });
});

test('diffSummary counts changes', () => {
  const summary = diffSummary(diffLines('a\nb', 'a\nc\nd'));
  assert.deepEqual(summary, { added: 2, removed: 1, equal: 1 });
});

test('diffLines rejects inputs that are too large for browser comparison', () => {
  const huge = Array.from({ length: 2501 }, (_, index) => `line ${index}`).join('\n');
  assert.throws(() => diffLines(huge, 'small'), /2500/);
});
