// People and safety (wireframes 5.1–5.10)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkWords, WORDS } from '../web/seal.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const box = (k) => (html.match(new RegExp(`<div id="${k}"[^>]*>([\\s\\S]*?)<\\/div><!-- \\/${k} -->`)) || [, ''])[1];

test('check words: four words from both public keys, the same on both screens, different for other keys', async () => {
  assert.equal(WORDS.length, 256); assert.equal(new Set(WORDS).size, 256, 'no repeats');
  const a = new Uint8Array(65).fill(1), b = new Uint8Array(65).fill(2), c = new Uint8Array(65).fill(3);
  const ab = await checkWords(a, b, 'photo-ABC'), ba = await checkWords(b, a, 'photo-ABC');
  assert.equal(ab.length, 4); assert.deepEqual(ab, ba, 'both screens agree');
  assert.notDeepEqual(await checkWords(a, c, 'photo-ABC'), ab, 'someone in the middle shows different words');
  assert.notDeepEqual(await checkWords(a, b, 'photo-XYZ'), ab, 'another heap, other words');
});

test('people (5.1, 5.2): everyone in one list; tap someone to check, hide, block or (host) remove', () => {
  assert.match(box('peoplebox'), /<h2 id="peopletitle"><\/h2>\s*<div id="peoplelist" role="list"><\/div>/);
  const p = box('personbox');
  for (const k of ['pcheck', 'phide', 'pblock', 'premove']) assert.match(p, new RegExp(`id="${k}"`), k);
  assert.match(p, /Make sure nobody is in the middle/);
  assert.match(html, /\$\('peoplebtn'\)\.onclick = \$\('people'\)\.onclick = \(\) => closeMenu\(openPeople\)/);
});

test('check (5.3–5.5): the four words, Yes they match or No; a mismatch warns and blocks', () => {
  assert.match(box('checkbox'), /<h2 id="checktitle"><\/h2>\s*<p id="checksub"><\/p>/);
  assert.match(box('checkbox'), /<div id="checkwords"[^>]*><\/div>[\s\S]*Only do this in person or on a call you trust\.[\s\S]*id="checkyes">Yes, they match<\/button>[\s\S]*id="checkno">No, they’re different<\/button>/);
  assert.match(box('warnbox'), /This connection may not be private/);
  assert.match(box('warnbox'), /id="warnleave">Leave the heap<\/button>[\s\S]*id="warnstay"/);
  assert.match(html, /Your connection to \$\{/);
});

test('block (5.6): quiet, for the rest of this heap; their photos go and nothing more comes from them', () => {
  assert.match(box('blockbox'), /For the rest of this heap, their photos disappear from your screen and they can’t send you anything\. They aren’t told\./);
  assert.match(html, /const inHeap = \(k\) => !net \|\| \(!blocked\.has\(k\) && isIn\(k, gateOf\(\)\)\)/);
  assert.match(html, /if \(blocked\.has\(from\)\) return;/);
  assert.match(html, /function visiblePrints\(\)/);
});

test('leave and clear (5.7, 5.8): a sheet that warns about unsaved photos, then All cleared', () => {
  assert.doesNotMatch(html, /confirm\('Leave this heap/, 'no browser dialog');
  assert.match(box('leavebox'), /<h2>Leave and clear\?<\/h2>[\s\S]*Save anything you want to keep first\.[\s\S]*id="leaveunsaved"[\s\S]*id="leaveclear">Leave and clear<\/button>[\s\S]*id="leavestay">Stay<\/button>/);
  assert.match(html, /<div class="step" id="s-cleared" hidden>[\s\S]*All cleared[\s\S]*id="clearednew">Start a new heap<\/button>[\s\S]*id="clearedhome">Home<\/button>/);
});

test('reconnecting and connection lost (5.9, 5.10)', () => {
  assert.match(html, /<div id="netbanner" role="status" hidden>Reconnecting… Your joined screens and downloads will carry on\.<\/div>/);
  assert.match(box('lostbox'), /Can’t reach the heap[\s\S]*Check your Wi-Fi or mobile data\. Photos you already have are safe here\.[\s\S]*id="losttry">Try again<\/button>[\s\S]*id="lostleave">Leave<\/button>/);
  assert.match(html, /function netState\(/);
});
