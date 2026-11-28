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

test('the bottom bar: a wide + Share and Picked, no checkbox', () => {
  const bar = (html.match(/<div id="bar">([\s\S]*?)<\/div>/) || [, ''])[1];
  assert.match(bar, /<label id="share">\+ Add photos &amp; videos<input id="pick" type="file"[^>]*><\/label>\s*<button id="pickedbtn" type="button">Picked · 0<\/button>/);
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
  assert.match(box, /Tap photos to pick them\. Drag one out to put it on the table or send it\./, 'says how to pick and how to send one');
  assert.match(html, /function openDeck\(/);
  assert.match(html, /\.reverse\(\)/, 'newest first');
  assert.match(html, /<button type="button" id="allphotos" hidden>/, 'an All photos chip on the table');
  assert.match(css, /#deckbox:not\(\[hidden\]\) \.sheet \{[^}]*animation: sheet-up/, 'slides up like the other sheets');
});

test('picking in the deck sheet (2B.3): tap picks, Pick all, then Review and Get with how many and how big', () => {
  const box = (html.match(/<div id="deckbox"[^>]*>([\s\S]*?)<\/div><!-- \/deckbox -->/) || [, ''])[1];
  assert.match(box, /<button type="button" id="pickall">Pick all<\/button>/);
  assert.match(box, /<div class="pills" id="pickfoot" hidden><button type="button" id="reviewpick"><\/button><button type="button" id="getpick" class="pri"><\/button><button type="button" id="removepick" hidden><\/button><\/div>/);
  assert.match(html, /function togglePick\(/, 'a tap picks or unpicks');
  assert.match(html, /b\.onpointerup = \(\) => \{ b\.onpointermove = b\.onpointerup = null; togglePick\(p\.pid\)/, 'tapping a photo in the sheet picks it');
  assert.match(html, /`Get \$\{s\.n\} · \$\{mb\(s\.bytes\)\}`/, 'Get says how many and how big');
  assert.match(html, /aria-pressed/, 'picked photos say so to screen readers');
});

test('the review sheet (2B.6): what is picked, tap to unpick, Get all', () => {
  const box = (html.match(/<div id="reviewbox"[^>]*>([\s\S]*?)<\/div><!-- \/reviewbox -->/) || [, ''])[1];
  assert.match(box, /<h2 id="reviewtitle"><\/h2>\s*<p id="reviewline"><\/p>\s*<div id="reviewtiles" role="list"><\/div>\s*<p class="deckhint">Tap a photo to unpick it<\/p>/);
  assert.match(box, /<button type="button" id="getall" class="pri"><\/button>/);
  assert.match(html, /\$\('pickedbtn'\)\.onclick = \(\) => openReview\(\)/);
  assert.match(html, /function getPicked\(\) \{[\s\S]*?for \(const p of toFetch\(prints, picked, files, incoming, id\)\)[\s\S]*?pickSave\.tap\(\)/, 'asks for what is missing, then saves what is here in the same tap');
  assert.match(css, /#reviewbox:not\(\[hidden\]\) \.sheet \{[^}]*animation: sheet-up/);
});

test('landing (2A.4): the receiver is told who it came from with Undo, the sender where it went', () => {
  assert.match(html, /<div id="snack" role="status" hidden><span id="snacktext"><\/span><button type="button" id="snackact">Undo<\/button><\/div>/);
  assert.match(html, /batchLine\(\{ n, k: st\.k, lost: st\.lost, who, relay \}\)/, 'how many and from whom (words.js)');
  assert.match(html, /toast\(`Sent to \$\{/, 'the sender sees where it went');
});

test('no screen there (2A.8): the photo comes back and Send to… lists people', () => {
  const box = (html.match(/<div id="sendbox"[^>]*>([\s\S]*?)<\/div><!-- \/sendbox -->/) || [, ''])[1];
  assert.match(box, /<h2 id="sendtitle">Nothing joined on that side\. Send to…<\/h2>\s*<div id="sendlist" role="list"><\/div>/);
  assert.match(box, /Or join a screen on that side/);
  assert.match(html, /function openSendTo\(/);
  assert.match(html, /m\.t === 'give'[\s\S]{0,160}validPidMsg\(m\)[\s\S]{0,200}holders/, 'a give is only taken from someone who has the photo');
  assert.match(css, /#sendbox:not\(\[hidden\]\) \.sheet \{[^}]*animation: sheet-up/);
});

test('holding (2A.5): a photo held near my edge shows as an outline with who is holding it', () => {
  const frame = (html.match(/function frame\(\) {([\s\S]*?)\n}\nframe\(\);/) || [, ''])[1];
  assert.match(frame, /is holding \$\{/, 'says who is holding it');
  assert.match(frame, /setLineDash/, 'drawn as an outline');
});

test('joining screens (4.2): tap the facing edge on four strips, no orb', () => {
  const box = (html.match(/<div id="joinmode"[^>]*>([\s\S]*?)<\/div><!-- \/joinmode -->/) || [, ''])[1];
  for (const e of 'TBLR') assert.match(box, new RegExp(`<button type="button" class="strip" data-edge="${e}"[^>]*>`), `a strip on edge ${e}`);
  assert.match(box, /<b id="jointitle">Which side is the other screen\?<\/b>/);
  assert.match(box, /Each person taps the edge that faces the other one\./);
  assert.match(box, /<button type="button" id="joincancel">Cancel<\/button>/);
  assert.match(html, /<small>Tap the edges that face each other<\/small>/, 'the menu says how');
  assert.match(html, /net\.push\(edge, along\)/, 'a tap on a strip is a push on that edge');
  const frame = (html.match(/function frame\(\) {([\s\S]*?)\n}\nframe\(\);/) || [, ''])[1];
  assert.doesNotMatch(frame, /orbDrag|glow\(/, 'the orb is gone');
  assert.doesNotMatch(html, /Drag the dot/, 'nothing tells people to drag a dot');
});

test('joining screens (4.3–4.6): a 2-second countdown, then joined, no match or too many at once', () => {
  assert.match(html, /Now tap the facing edge on the other screen/);
  assert.match(html, /Both taps must land within 2 seconds/);
  assert.match(html, /joinResult\('nomatch'/);
  assert.match(html, /The other screen didn’t tap in time, or tapped the wrong edge\./);
  assert.match(html, /joinResult\('retry'/);
  assert.match(html, /More than two screens tapped at once/);
  assert.match(html, /Join one pair at a time\./);
  assert.match(html, /joinResult\('joined'/);
  assert.match(html, /<button type="button" id="jointry" hidden>Try again<\/button>/);
});

test('code not found (1.3): a typed code with nobody in that heap goes back to the code screen and says why', () => {
  assert.match(html, /<p id="codeerr" class="err" role="alert" hidden><b>No open heap with that code\. It may have ended or the code has a typo\.<\/b>\s*Check with the host, or ask them for the QR code\.<\/p>/);
  assert.match(html, /pending\.mustExist = pending\.mode === 'join' && pending\.typed/, 'only a typed code is checked: an invite link still opens its heap');
  assert.match(html, /function notFound\(/);
  assert.match(html, /if \(!others\(\)\.length\) notFound\(/, 'nobody else there');
});

test('empty table (2D.1): says so and how to start', () => {
  assert.match(html, /<div id="empty" aria-hidden="true" hidden><i><\/i><b>The table is empty<\/b><span>Tap \+ Add photos &amp; videos to put yours down\. Others take only what they want\.<\/span><small id="emptytip"><\/small><\/div>/);
  assert.match(html, /\$\('empty'\)\.hidden = !!prints\.size/);
});

test('a sheet that is already closed still carries on to what comes next (the avatars open People)', () => {
  assert.match(html, /function closeSheet\(k, then\) \{\s*const b = \$\(k\);\s*if \(b\.hidden\) return then\?\.\(\);/);
  assert.match(css, /#toast \{[^}]*top: calc\(124px/, 'toasts sit below the All photos chip');
});

test('the invite code tiles fit their row, letters sized to it, with a compact Copy', () => {
  assert.match(css, /\.copyrow \.tiles \{[^}]*container-type: inline-size/, 'the row is the size the letters follow');
  assert.match(css, /\.copyrow \.tiles span \{[^}]*font-size: min\(7cqw, 26px\)/, 'letters scale with the row');
  assert.match(css, /\.copyrow \.tiles span \{[^}]*min-width: 0/, 'tiles can shrink');
});

test('the add button says what it adds', () => {
  assert.match(html, /<label id="share">\+ Add photos &amp; videos<input id="pick"/);
  assert.doesNotMatch(html, />\+ Share</);
});

test('an invite link asks for your name (pre-filled), a reload of your heap does not', () => {
  assert.match(html, /opening\.from === 'link' \? openLink\(opening\.join\) : tryStart\(opening\.join\)/);
  assert.match(html, /function openLink\(code\) \{[\s\S]*?askName\('join', code\)/);
});

test('a Join button in the header, one tap to join a screen', () => {
  const top = (html.match(/<header id="top"[^>]*>([\s\S]*?)<\/header>/) || [, ''])[1];
  assert.match(top, /<button id="joinbtn" type="button"[^>]*>Join<\/button>\s*<button id="people"/);
  assert.match(html, /\$\('joinbtn'\)\.onclick = openJoin/);
});

test('the map (2C.7): a Map chip in the header opens every screen in the room, with Join a screen', () => {
  const top = (html.match(/<header id="top"[^>]*>([\s\S]*?)<\/header>/) || [, ''])[1];
  assert.match(top, /<button id="mapbtn" type="button" aria-label="Map of the screens in this heap" aria-controls="mapbox"[^>]*>/);
  const box = (html.match(/<div id="mapbox"[^>]*>([\s\S]*?)<\/div><!-- \/mapbox -->/) || [, ''])[1];
  assert.match(box, /<h2 id="maptitle"><\/h2>\s*<canvas id="mapcv"[^>]*><\/canvas>\s*<p id="mapkey"><\/p>/);
  assert.match(box, /<button type="button" id="mapjoin" class="pri">Join a screen<\/button>/);
  assert.match(html, /function drawMap\(/);
  assert.match(css, /#mapbox:not\(\[hidden\]\) \.sheet \{[^}]*animation: sheet-up/);
});

test('drop on the map (2C.4, 2C.6): while dragging with 3 or more screens, the map comes up and a drop on a tile sends it there', () => {
  assert.match(html, /<div id="dropmap" hidden><small>Or drop on the map<\/small><canvas id="dropcv"><\/canvas><\/div>/);
  assert.match(html, /others\(\)\.length >= 2/);
  assert.match(html, /function mapHit\(/);
  assert.match(html, /giveTo\(/);
});

test('edge labels (2C.2, 2C.5): the table names each screen touching mine', () => {
  const frame = (html.match(/function frame\(\) {([\s\S]*?)\n}\nframe\(\);/) || [, ''])[1];
  assert.match(frame, /edgeLabels\(/);
  assert.match(frame, /’s \$\{deviceKind\(/, 'the neighbour, by name and kind');
});

test('remove your own photos: pick them, Remove, gone from every table, with Undo; only the owner can', () => {
  assert.match(html, /<button type="button" id="removepick" hidden><\/button>/);
  assert.match(html, /function removeMine\(/);
  assert.match(html, /t: 'unshare', pid/);
  assert.match(html, /m\.t === 'unshare'[\s\S]{0,160}validPidMsg\(m\)[\s\S]{0,120}p\.owner === from/, 'only the owner takes a photo off the table');
  assert.match(html, /`Removed \$\{n\} photo\$\{n === 1 \? '' : 's'\}\. Copies already saved stay with whoever saved them`/);
});

test('a deck arriving (2A.6, 3.6): how many of how many, through relay while it is, then a tick', () => {
  assert.equal(words.batchLine({ n: 1, k: 0, who: 'Ada', relay: false }), '1 photo from Ada');
  assert.equal(words.batchLine({ n: 1, k: 1, who: 'Ada', relay: true }), '1 photo from Ada', 'arrived: no need to say how');
  assert.equal(words.batchLine({ n: 1, k: 0, who: 'Ada', relay: true }), '1 photo from Ada · through relay');
  assert.equal(words.batchLine({ n: 25, k: 3, who: 'Ada', relay: false }), '25 photos from Ada · 3 of 25');
  assert.equal(words.batchLine({ n: 25, k: 3, who: 'Ada', relay: true }), '25 photos from Ada · 3 of 25 · through relay');
  assert.equal(words.batchLine({ n: 25, k: 25, who: 'Ada', relay: true }), '25 photos from Ada ✓');
});

test('arriving photos show a progress bar on their card, and the line offers Stop until they are all here (3.5)', () => {
  const frame = (html.match(/function frame\(\) {([\s\S]*?)\n}\nframe\(\);/) || [, ''])[1];
  assert.match(frame, /const coming = incoming\.get\(p\.pid\)/, 'knows how much of a photo is here');
  assert.match(frame, /coming\.n \? coming\.got \/ coming\.n : 0/, 'the bar fills with the pieces that have arrived (Qodo on #162: not pieces over bytes)');
  assert.match(html, /function stopLanding\(/);
  assert.match(html, /\$\('snackact'\)\.textContent = st\.done \? 'Undo' : 'Stop'/);   // Stop while any are still on the way
});
