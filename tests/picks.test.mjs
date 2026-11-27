// Picking (wireframes 2B.3–2B.6): tap photos to pick them, see how many and how big, then get them
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mb, pickSummary, pickLine, toFetch } from '../web/picks.js';
import { saveBatch } from '../web/saveall.js';

const P = (pid, owner, size) => ({ pid, owner, size, name: pid + '.jpg' });
const prints = new Map([P('a', 'ada', 30e6), P('b', 'ada', 10e6), P('c', 'grace', 8e6), P('d', 'me', 1e6)].map((p) => [p.pid, p]));
const names = { ada: 'Ada', grace: 'Grace' };

test('sizes read as megabytes', () => {
  assert.equal(mb(48e6), '48 MB');
  assert.equal(mb(1.5e6), '1.5 MB');
  assert.equal(mb(3e5), '0.3 MB');
  assert.equal(mb(0), '0 MB');
  assert.equal(mb(15000), '< 0.1 MB', 'a small photo is not nothing');
  assert.equal(mb(12.34e6), '12 MB');
});

test('what is picked: how many, how big and from whom, most first', () => {
  const s = pickSummary(prints, new Set(['a', 'b', 'c']), (o) => names[o], 'me');
  assert.equal(s.n, 3);
  assert.equal(s.bytes, 48e6);
  assert.deepEqual(s.from, [['Ada', 2], ['Grace', 1]]);
  assert.equal(pickLine(s), '48 MB · from Ada (2) and Grace (1) · stays only on this device');
  const three = pickSummary(prints, new Set(['a', 'c', 'd']), (o) => names[o], 'me');
  assert.equal(pickLine(three), '39 MB · from Ada (1), Grace (1) and you (1) · stays only on this device');
});

test('a photo that went away is no longer counted', () => {
  assert.equal(pickSummary(prints, new Set(['a', 'gone']), (o) => names[o], 'me').n, 1);
});

test('Get asks only for picked photos that are not here or on their way', () => {
  const files = new Map([['b', {}]]), incoming = new Map([['c', {}]]);
  assert.deepEqual(toFetch(prints, new Set(['a', 'b', 'c', 'd']), files, incoming, 'me').map((p) => p.pid), ['a']);
});

test('saving picked photos hands over only those', () => {
  const files = new Map([['a', 'A'], ['b', 'B'], ['c', 'C']]);
  const { ready } = saveBatch({ prints, files, incoming: new Map(), me: 'me', handed: new Set(), only: new Set(['a', 'c']) });
  assert.deepEqual(ready.map((r) => r.pid), ['a', 'c']);
  const { arriving } = saveBatch({ prints, files: new Map(), incoming: new Map([['a', {}], ['b', {}]]), me: 'me', handed: new Set(), only: new Set(['a']) });
  assert.equal(arriving, 1, 'only picked ones count as still arriving');
});
