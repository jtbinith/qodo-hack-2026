// Arrange screens (wireframes 4.7, 4.8, 4.11, 4.12): a move is asked for, and happens only with a yes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proposeJoin, sideWords } from '../web/map.js';
import { isValidJoins, solveLayout } from '../web/layout.js';

const sizes = { me: { w: 390, h: 844 }, lap: { w: 1280, h: 800 } };

test('putting a screen below another joins its top edge to their bottom, lined up in the middle', () => {
  const j = proposeJoin('me', 'lap', 'below', sizes);
  assert.deepEqual(j, { a: 'me', b: 'lap', edgeA: 'T', edgeB: 'B', alongA: 195, alongB: 640 });
  assert.ok(isValidJoins([j], ['me', 'lap']));
  const L = solveLayout(['me', 'lap'], [j], sizes);
  assert.equal(L.pos.me[1] - L.pos.lap[1], 800, 'my top meets their bottom');
  for (const [side, ea, eb] of [['above', 'B', 'T'], ['left', 'R', 'L'], ['right', 'L', 'R']]) {
    const k = proposeJoin('me', 'lap', side, sizes); assert.equal(k.edgeA, ea, side); assert.equal(k.edgeB, eb, side);
  }
});

test('the words for each side', () => {
  assert.equal(sideWords('below'), 'below'); assert.equal(sideWords('left'), 'on the left of'); assert.equal(sideWords('right'), 'on the right of'); assert.equal(sideWords('above'), 'above');
});

test('the time keeper moves a screen only with a yes from one of the two screens, asked by the host or by them', () => {
  const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');
  assert.match(net, /event: 'joinok'[\s\S]{0,400}payload\.from !== j\.a && payload\.from !== j\.b[\s\S]{0,200}payload\.by !== s\.leader && payload\.by !== j\.a && payload\.by !== j\.b/);
  assert.match(net, /s\.askMove = \(/); assert.match(net, /s\.answerMove = \(/);
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /<div id="arrangebox"[\s\S]*?<h2 id="arrangetitle"><\/h2>[\s\S]*?<div id="arrangelist" role="list"><\/div>/);
  assert.match(html, /id="maparrange"[^>]*>Use a list instead<\/button>/, 'dragging on the map, or a list');
  assert.match(html, /<div id="movebox"[\s\S]*?<h2 id="movetitle"><\/h2>[\s\S]*?id="moveno"[\s\S]*?id="moveyes"/);
  assert.match(html, /The host wants to move your screen/);
  assert.match(html, /wants to join \$\{sideWords\(/);
  assert.match(html, /Nothing changes unless you tap Move it\. If you ignore this, it cancels after 30 s\./);
  assert.match(html, /`Moved \$\{sideWords\(/);
});

test('your own other device (4.9): a pairing link, let in and lined up next to you by itself', () => {
  const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');
  assert.match(net, /s\.pairHello = \(/);
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /<button type="button" id="joinpair">Your own other device\? Show a code<\/button>/);
  assert.match(html, /&pair=\$\{pairToken\}&by=\$\{id\}/);
  assert.match(html, /ev === 'pair'[\s\S]{0,80}d\.token === pairToken/, 'only the token from this screen');
});
