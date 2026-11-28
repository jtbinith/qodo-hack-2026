// Laptop and tablet layout (wireframes L1–L3, T1–T3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
const wide = (css.match(/@media \(min-width: 1000px\) \{([\s\S]*?)\n  \}\n/) || [, ''])[1];

test('wide screens (L1): the actions move to the top bar and the bottom bar goes', () => {
  assert.match(html, /<span id="topacts"><\/span>\s*<button id="menu"/, 'a place in the top bar, before the menu');
  assert.match(html, /const WIDE = matchMedia\('\(min-width: 1000px\)'\)/);
  assert.match(html, /function placeActions\(\)/);
  assert.match(wide, /#bar \{[^}]*display: none/);
  assert.match(wide, /#snack, #dropmap \{[^}]*bottom: calc\(16px/);
});

test('wide screens (L2, T3): the deck fills the screen with Picked always open on the right', () => {
  assert.match(html, /<aside id="pickpanel" aria-label="Picked">\s*<h3 id="pptitle"><\/h3>\s*<p id="ppline"><\/p>\s*<div id="pptiles"><\/div>\s*<\/aside>/);
  assert.match(wide, /#deckbox \{[^}]*top: calc\(66px/);
  assert.match(wide, /#deckbox \.sheet \{[^}]*grid-template-columns: 1fr 320px/);
  assert.match(wide, /#deckbox #pickpanel \{[^}]*display: grid/);
  assert.match(css, /#pickpanel \{[^}]*display: none/, 'phones and portrait tablets: Picked is a sheet');
  assert.match(wide, /#decktiles \.mgrid \{[^}]*minmax\(124px, 1fr\)/);
});

test('tablet portrait (T2): the deck sheet uses the width', () => {
  assert.match(css, /#deckbox \.sheet \{[^}]*width: min\(100%, 900px\)/);
});
