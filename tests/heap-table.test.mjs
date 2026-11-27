// heap live table, stage 1 (wireframes 2A.1 and 4.1): a header with the heap's name and who's here, a menu sheet, + Share at the bottom
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
const words = await import('../web/words.js');

test('the heap is named after its time keeper, and the line under it says who is here and how much is shared', () => {
  assert.equal(words.heapTitle('Ada'), 'Ada’s heap');
  assert.equal(words.heapTitle(''), 'Your heap');
  assert.equal(words.heapTitle(undefined), 'Your heap');
  assert.equal(words.heapSub(1, 0), '1 here · 0 shared');
  assert.equal(words.heapSub(3, 100), '3 here · 100 shared');
});

test('avatars show initials', () => {
  assert.equal(words.initials('Ada Lovelace'), 'AL');
  assert.equal(words.initials('host'), 'H');
  assert.equal(words.initials('  mary  jane  watson '), 'MJ');
  assert.equal(words.initials('élodie'), 'É');
  assert.equal(words.initials(''), '?');
});

test('the header: the heap name, who is here, avatars and a menu button', () => {
  const top = (html.match(/<header id="top"[^>]*>([\s\S]*?)<\/header>/) || [, ''])[1];
  assert.match(top, /<b id="heapname"><\/b>\s*<small id="heapsub"><\/small>/, 'name and the line under it');
  assert.match(top, /<button id="people" type="button" aria-label="People in this heap"[^>]*><\/button>/, 'the avatars, a button to see who is here');
  assert.match(top, /<button id="menu" type="button" aria-label="Menu" aria-controls="menubox" aria-expanded="false"[^>]*>/, 'a menu button');
  assert.doesNotMatch(top, /id="(leave|invite|info)"/, 'Leave, Invite and the status button moved into the menu');
});

test('the menu sheet (4.1): Join a screen, People, Invite, Keep photo details, Leave and clear, Connection details', () => {
  const box = (html.match(/<div id="menubox"[^>]*>([\s\S]*?)<\/div><!-- \/menubox -->/) || [, ''])[1];
  assert.match(box, /<div class="sheet" role="dialog" aria-labelledby="menutitle">/, 'a bottom sheet');
  const order = ['joinhow', 'peoplebtn', 'invite', 'keep', 'leave', 'info', 'closemenu'].map((k) => box.indexOf(`id="${k}"`));
  assert.ok(order.every((i) => i > 0), `every item is there (${order})`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
  assert.match(box, /Leave and clear/, 'the wireframe wording');
  assert.match(box, /<input id="keep" type="checkbox"/, 'the details choice is still a checkbox');
  assert.match(css, /#menubox:not\(\[hidden\]\) \.sheet \{[^}]*animation: sheet-up/, 'slides up like the invite sheet');
  assert.match(html, /function openSheet\(/, 'one way to open a sheet');
  assert.match(html, /function closeSheet\(/, 'one way to close a sheet');
});

test('the bottom bar: a wide + Share and Save all, no checkbox', () => {
  const bar = (html.match(/<div id="bar">([\s\S]*?)<\/div>/) || [, ''])[1];
  assert.match(bar, /<label id="share">\+ Share<input id="pick" type="file"[^>]*><\/label>\s*<button id="saveall" type="button">Save all<\/button>/);
  assert.doesNotMatch(bar, /id="keep"/, 'Keep photo details lives in the menu now');
  assert.match(css, /#bar #share \{[^}]*flex: 1/, '+ Share takes the width');
});

test('the header is filled from the room, as text', () => {
  assert.match(html, /function showHeader\(\)/, 'one function draws it');
  const fn = (html.match(/function showHeader\(\) {[\s\S]*?\n}/) || [''])[0];
  assert.doesNotMatch(fn, /innerHTML/, 'names go in as text');
  assert.match(fn, /heapTitle\(/); assert.match(fn, /heapSub\(/); assert.match(fn, /initials\(/);
  assert.match(html, /if \(ev !== 'peers'\) return;[\s\S]{0,200}showHeader\(\)/, 'updates as people join and leave');
});

test('decks on the table: a stack per person with a name and count pill, no loose photos', () => {
  const frame = (html.match(/function frame\(\) {([\s\S]*?)\n}\nframe\(\);/) || [, ''])[1];
  assert.match(frame, /groupDecks\(prints\)/, 'drawn deck by deck');
  assert.match(frame, /deck\.pids\.length > 1 \? `\$\{who\} \$\{deck\.pids\.length\}`/, 'the pill says whose and how many');
  assert.match(html, /\$\('pick'\)\.onchange[\s\S]*?deckSpot\(prints, id/, 'what I share goes on my deck');
  assert.match(html, /t: 'moves', pids: /, 'a deck moves as one message');
  assert.match(html, /m\.t === 'moves'[\s\S]{0,80}validMoves\(m\)/, 'checked when it arrives');
});

test('the deck sheet (2B.1, 2B.2): ‹ Table, whose deck and how many, the photos newest first', () => {
  const box = (html.match(/<div id="deckbox"[^>]*>([\s\S]*?)<\/div><!-- \/deckbox -->/) || [, ''])[1];
  assert.match(box, /<div class="sheet" role="dialog" aria-labelledby="decktitle">/);
  assert.match(box, /<button type="button" id="deckback">‹ Table<\/button>\s*<h2 id="decktitle"><\/h2>/);
  assert.match(box, /<div id="decktiles" role="list"><\/div>/);
  assert.match(box, /Drag a photo out to put it on the table or send it/, 'says how to send one');
  assert.match(html, /function openDeck\(/);
  assert.match(html, /\.reverse\(\)/, 'newest first');
  assert.match(html, /<button type="button" id="allphotos" hidden>/, 'an All photos chip on the table');
  assert.match(css, /#deckbox:not\(\[hidden\]\) \.sheet \{[^}]*animation: sheet-up/, 'slides up like the other sheets');
});
