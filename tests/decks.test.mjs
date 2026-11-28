// Decks (wireframe 2A.1): each person's photos sit as one stack where they put them down
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupDecks, deckSpot } from '../web/decks.js';
import { validMoves, LIMITS } from '../web/check.js';

const P = (pid, owner, anchor, x, y) => ({ pid, owner, anchor, x, y, w: 150, h: 150 });

test('photos of one person at one spot are one deck, top photo last', () => {
  const prints = new Map([['a', P('a', 'ada', 'ada', 40, 70)], ['b', P('b', 'ada', 'ada', 40, 70)], ['c', P('c', 'ada', 'ada', 40, 70)]].map(([k, v]) => [k, v]));
  const decks = groupDecks(prints);
  assert.equal(decks.length, 1);
  assert.deepEqual(decks[0].pids, ['a', 'b', 'c']);
  assert.equal(decks[0].top.pid, 'c');
  assert.equal(decks[0].owner, 'ada');
});

test('another person at the same spot, or the same person elsewhere, is another deck', () => {
  const prints = new Map([P('a', 'ada', 'ada', 40, 70), P('b', 'grace', 'ada', 40, 70), P('c', 'ada', 'ada', 200, 70), P('d', 'ada', 'grace', 40, 70)].map((p) => [p.pid, p]));
  assert.equal(groupDecks(prints).length, 4);
});

test('decks keep the order photos were stacked, so the most recent deck is drawn on top', () => {
  const prints = new Map([P('a', 'ada', 'ada', 40, 70), P('b', 'grace', 'ada', 200, 70), P('c', 'ada', 'ada', 40, 70)].map((p) => [p.pid, p]));
  assert.deepEqual(groupDecks(prints).map((d) => d.pids), [['b'], ['a', 'c']], 'Ada added to her deck last, so it is on top');
});

test('a new photo goes on my deck if I have one on my screen, else on a free spot', () => {
  const mine = new Map([P('a', 'ada', 'ada', 33, 77)].map((p) => [p.pid, p]));
  assert.deepEqual(deckSpot(mine, 'ada', { w: 390, h: 844 }), { x: 33, y: 77 });
  const none = new Map([P('a', 'grace', 'ada', 33, 77)].map((p) => [p.pid, p]));
  const s = deckSpot(none, 'ada', { w: 390, h: 844 });
  assert.ok(s.x >= 0 && s.x <= 390 - 150 && s.y >= 70 && s.y <= 844 - 150 - 90, `inside the table, clear of the header and bar (${s.x}, ${s.y})`);
  assert.notDeepEqual(s, { x: 33, y: 77 }, 'not on top of someone else\'s deck');
});

test('moving a deck is one message with its photos', () => {
  const pid = (n) => n.toString(16).padStart(16, '0');
  assert.ok(validMoves({ t: 'moves', pids: [pid(1), pid(2)], anchor: 'dev1', x: 1, y: 2 }));
  assert.ok(validMoves({ t: 'moves', pids: [pid(1)], anchor: 'dev1', x: 1, y: 2, final: true }));
  assert.equal(validMoves({ t: 'moves', pids: [], anchor: 'dev1', x: 1, y: 2 }), false, 'at least one photo');
  assert.equal(validMoves({ t: 'moves', pids: ['nope'], anchor: 'dev1', x: 1, y: 2 }), false, 'real photo ids');
  assert.equal(validMoves({ t: 'moves', pids: [pid(1)], anchor: 'dev1', x: NaN, y: 2 }), false);
  assert.equal(validMoves({ t: 'moves', pids: 'x', anchor: 'dev1', x: 1, y: 2 }), false);
  assert.equal(validMoves({ t: 'moves', pids: Array.from({ length: LIMITS.prints + 1 }, (_, k) => pid(k)), anchor: 'dev1', x: 1, y: 2 }), false, 'no more than the table holds');
});
