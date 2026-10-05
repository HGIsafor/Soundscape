import assert from 'node:assert/strict';
import test from 'node:test';
import { rankMovement } from '../../src/lib/rankings.ts';

const previous = ['a', 'b', 'c'].map(id => ({ item: { id } }));
test('compares identities across reordered charts', () => {
  assert.deepEqual(rankMovement(previous, 'c', 0), { text: '↑ 2', label: 'Up 2 places' });
  assert.deepEqual(rankMovement(previous, 'a', 1), { text: '↓ 1', label: 'Down 1 place' });
  assert.equal(rankMovement(previous, 'b', 1).label, 'Rank unchanged');
});
test('distinguishes a new entry from a first visit', () => {
  assert.equal(rankMovement(previous, 'd', 0).text, 'New');
  assert.equal(rankMovement(null, 'a', 0).label, 'First snapshot');
  assert.equal(rankMovement([], 'a', 0).text, 'New');
});
