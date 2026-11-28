// Accessibility (wireframes 6.1–6.7): decks a screen reader can read, deck actions, joining from a list,
// spoken updates, the decks as a list, and keyboard shortcuts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as a11y from '../web/a11y.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

test('6.1: each deck reads as who, how many and where', () => {
  assert.equal(a11y.deckLabel({ mine: false, name: 'Ada', n: 34, side: 'R' }), 'Ada’s deck, 34 photos, Ada is next to you on the right.');
  assert.equal(a11y.deckLabel({ mine: true, name: 'Me', n: 1 }), 'Your deck, 1 photo.');
  assert.equal(a11y.deckLabel({ mine: false, name: 'Bo', n: 2 }), 'Bo’s deck, 2 photos.');
  assert.match(html, /<div id="decklayer" role="list" aria-label="Decks on your screen"><\/div>/);
  assert.match(html, /function showDeckLayer\(\)/);
  assert.match(css, /#decklayer \{[^}]*pointer-events: none/, 'never in the way of a finger or the mouse');
  assert.match(css, /\.deckbtn:focus-visible \{[^}]*outline/, 'the deck in focus shows a ring');
});

test('6.3: a deck’s actions in a list: open, send, pick all, get all, hide', () => {
  const box = (html.match(/<div id="deckacts"[\s\S]*?<\/div><!-- \/deckacts -->/) || [''])[0];
  for (const id of ['daopen', 'dasend', 'dapick', 'daget', 'dahide']) assert.match(box, new RegExp(`id="${id}"`), id);
  assert.match(box, /Same as flicking it/);
  assert.match(html, /function openDeckActions\(/);
});

test('6.3: join a screen from a list, and they’re asked to accept', () => {
  assert.match(html, /<button type="button" id="joinlist"[^>]*>Use a list instead<\/button>/);
  assert.match(html, /Next to your screen, on which side\?/);
  assert.match(html, /\$\('joinlist'\)\.onclick = /);
});

test('6.4: spoken updates', () => {
  assert.equal(a11y.say.joined('Ada’s phone', 'R'), 'Joined with Ada’s phone, on your right.');
  assert.equal(a11y.say.sent('Ada', 1), 'Ada sent you 1 photo.');
  assert.equal(a11y.say.getting(3, 12), 'Getting 12 photos. 3 of 12.');
  assert.equal(a11y.say.ready(12), 'All 12 photos checked and ready to save.');
  assert.equal(a11y.say.left('Ada’s phone'), 'Ada’s phone left the heap.');   // heap, as everywhere else (Qodo on #165)
  assert.deepEqual([0, 2, 3, 6, 9, 11, 12].map((k) => a11y.progressStep(k, 12)), [0, 0, 1, 2, 3, 3, -1], 'once a quarter, not every piece');
  assert.match(html, /<div id="say" class="sr" aria-live="polite"><\/div>/);
  assert.match(html, /function speak\(/);
  assert.match(css, /\.sr \{[^}]*clip: rect\(0 0 0 0\)/, 'read out, not shown');
});

test('6.5: the decks as a list, for large text', () => {
  assert.deepEqual(a11y.deckRow({ mine: true, name: 'Me', n: 24, kind: 'phone' }), { title: 'Your photos · 24', where: 'On this phone' });
  assert.deepEqual(a11y.deckRow({ mine: false, name: 'Ada', n: 34, side: 'R' }), { title: 'Ada · 34', where: 'Next to you, right' });
  assert.deepEqual(a11y.deckRow({ mine: false, name: 'Cy', n: 41 }), { title: 'Cy · 41', where: 'Across the room' });
  assert.match(html, /id="listview"[\s\S]{0,120}Decks as a list/);
  assert.match(html, /<div id="decklist"[^>]*role="list"/);
});

test('6.7: keyboard shortcuts', () => {
  assert.equal(a11y.SHORTCUTS.length, 9);
  const k = (key, extra = {}) => a11y.keyAction({ key, target: { tagName: 'BODY' }, ...extra });
  assert.deepEqual(['s', 'M', 'g', '?', 'Escape', 'x'].map((x) => k(x)), ['send', 'map', 'get', 'help', 'close', null]);
  assert.equal(a11y.keyAction({ key: 'm', target: { tagName: 'INPUT' } }), null, 'typing a name isn’t a shortcut');
  assert.equal(a11y.keyAction({ key: 'Escape', target: { tagName: 'INPUT' } }), 'close');
  assert.equal(a11y.keyAction({ key: 's', ctrlKey: true, target: { tagName: 'BODY' } }), null);
  assert.equal(a11y.gridMove('ArrowRight', 0, 5, 3), 1);
  assert.equal(a11y.gridMove('ArrowDown', 1, 5, 3), 4);
  assert.equal(a11y.gridMove('ArrowDown', 4, 5, 3), 4, 'stays inside');
  assert.equal(a11y.gridMove('ArrowLeft', 0, 5, 3), 0);
  assert.match(html, /<div id="keysbox"[\s\S]*Keyboard shortcuts/);
  assert.match(html, /addEventListener\('keydown', onKey\)/);
});
