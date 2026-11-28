// Feedback round (28 Nov): joined sides in join mode, a map of the new arrangement, drag to arrange, own device in its own sheet
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dropSide } from '../web/map.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const box = (k) => (html.match(new RegExp(`<div id="${k}"[^>]*>([\\s\\S]*?)<\\/div><!-- \\/${k} -->`)) || [, ''])[1];

test('a screen dropped by another on the map goes on the side it was dropped', () => {
  const t = { x: 100, y: 100, w: 40, h: 80 };   // the screen it's dropped next to
  assert.equal(dropSide({ x: 120, y: 200 }, t), 'below');
  assert.equal(dropSide({ x: 120, y: 70 }, t), 'above');
  assert.equal(dropSide({ x: 160, y: 140 }, t), 'right');
  assert.equal(dropSide({ x: 70, y: 140 }, t), 'left');
});

test('join mode shows which sides are joined, and asks before a side is joined to someone else', () => {
  assert.match(html, /strip\.classList\.toggle\('joined'/);
  assert.match(html, /`Joined · \$\{/);
  assert.match(box('rejoinbox'), /<h2 id="rejointitle"><\/h2>[\s\S]*id="rejoinkeep"[\s\S]*id="rejoinnew">Join a new screen<\/button>/);
  assert.match(html, /You’ll lose the join with \$\{/);
});

test('a move request shows the new arrangement on a map', () => {
  assert.match(box('movebox'), /<canvas id="movecv"[^>]*><\/canvas>/);
  assert.match(html, /function previewLayout\(/);
});

test('arrange by dragging on the map, with an Ask button; the list stays for anyone who can’t drag', () => {
  assert.match(box('mapbox'), /<p id="maphint"><\/p>/);
  assert.match(box('mapbox'), /<div id="mapask" hidden><span id="mapasktext"><\/span><button type="button" class="pri" id="mapaskgo">Ask<\/button><\/div>/);
  assert.match(html, /\$\('mapcv'\)\.onpointerdown/);
  assert.match(html, /id="maparrange"[^>]*>Use a list instead<\/button>/);
});

test('your own other device has its own sheet, reached from joining, not from Invite', () => {
  assert.doesNotMatch(box('invitebox'), /pairbtn/);
  assert.match(html, /<button type="button" id="joinpair">Your own other device\? Show a code<\/button>/);
  assert.match(box('pairbox'), /<h2>Add your other device<\/h2>[\s\S]*It joins this heap as you, without asking the host, and lines up next to this screen\.[\s\S]*<canvas id="pairqr"[\s\S]*<input id="pairlink" readonly/);
});
