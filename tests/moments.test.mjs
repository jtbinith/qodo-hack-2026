// Moments and filters (wireframes 2B.1, 2B.2, 2B.4, 2B.5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kindOf, moments, momentLabel, kindCounts, GAP } from '../web/moments.js';
import { validPrint } from '../web/check.js';

const T0 = Date.UTC(2026, 10, 26, 19, 2);   // Thu 26 Nov 2026 19:02 UTC
const P = (pid, min, type = 'image/jpeg', text) => ({ pid, at: T0 + min * 60000, type, ...(text ? { text } : {}) });

test('kinds: photos, videos, links and text, files', () => {
  assert.equal(kindOf(P('a', 0)), 'photos'); assert.equal(kindOf(P('b', 0, 'video/mp4')), 'videos');
  assert.equal(kindOf(P('c', 0, 'text/plain', 'hi')), 'text'); assert.equal(kindOf(P('d', 0, 'application/pdf')), 'files');
  assert.deepEqual(kindCounts([P('a', 0), P('b', 0), P('c', 1, 'video/mp4')]), { photos: 2, videos: 1 }, 'only kinds that are there');
});

test('moments: newest first, a new moment after a 20 minute gap', () => {
  assert.equal(GAP, 20 * 60000);
  const m = moments([P('a', 0), P('b', 15), P('c', 30), P('d', -60), P('e', -55)]);   // 15 min gaps stay together; an hour apart splits
  assert.deepEqual(m.map((x) => x.items.map((p) => p.pid)), [['c', 'b', 'a'], ['e', 'd']]);
  assert.equal(momentLabel(m[0], 'en-GB', 'UTC'), 'Thu 19:02 – 19:32');
  assert.equal(momentLabel(moments([P('z', 0)])[0], 'en-GB', 'UTC'), 'Thu 19:02', 'one moment in time');
  assert.deepEqual(moments([{ pid: 'old' }]).map((x) => x.items.length), [1], 'no time: still listed');
});

test('a print can say when it was shared', () => {
  const base = { pid: '0123456789abcdef', owner: 'dev1', anchor: 'dev1', name: 'a.jpg', type: 'image/jpeg', size: 5, thumbSize: 0, sha: 'a'.repeat(64), x: 0, y: 0, w: 150, h: 150, rot: 0, holders: ['dev1'] };
  assert.ok(validPrint({ ...base, at: T0 })); assert.equal(validPrint({ ...base, at: 'soon' }), false);
});

test('the deck sheet groups moments with Pick all each; All photos has a Show filter that says what is hidden', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /className: 'moment'/); assert.match(html, /className: 'mpick'/);
  assert.match(html, /<div id="kindrow" hidden><button type="button" id="kindbtn"><\/button><span id="kindnote"><\/span><button type="button" id="kindall">Show all<\/button><\/div>/);
  assert.match(html, /<div id="kindbox"[\s\S]*?<h2>Show<\/h2>[\s\S]*?<div id="kindlist" role="radiogroup"><\/div>[\s\S]*?Only kinds in this heap are listed/);
  assert.match(html, /`Showing \$\{n\} \$\{KIND_WORD\[kind\]/);
  assert.match(html, /#decktiles button\[data-pid\]/, 'tiles, not the moment buttons');
});
