// Who is in the heap (wireframes 1.5–1.7, 1.9): unique names, the host lets people in, full heaps
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nameKey, nameTaken, isIn, waitingFor } from '../web/gate.js';

test('names match ignoring case, spaces and look-alike letters', () => {
  assert.equal(nameKey('Person A'), nameKey('person  a'));
  assert.equal(nameKey('Ada'), nameKey('ADA '));
  assert.equal(nameKey('B0b'), nameKey('Bob'), 'zero for o');
  assert.equal(nameKey('Al1ce'), nameKey('Alice'), 'one for i');
  assert.equal(nameKey('ℬob'), nameKey('Bob'), 'fancy letters');
  assert.notEqual(nameKey('Ada'), nameKey('Adam'));
});

const peers = { h: { name: 'Host', joinedAt: 1 }, a: { name: 'Ada', joinedAt: 5 }, me: { name: 'ada', joinedAt: 9 } };
test('a name is taken if someone who joined earlier has it', () => {
  assert.equal(nameTaken('me', peers), 'Ada');
  assert.equal(nameTaken('a', peers), null, 'Ada was here first');
  assert.equal(nameTaken('h', peers), null);
  assert.equal(nameTaken('me', { ...peers, a: { name: 'Ada', joinedAt: 9 } }), 'me' < 'a' ? null : 'Ada', 'same moment: the smaller id keeps it');
});

test('in the heap: the host, anyone let in by id or name, or everyone when it is open', () => {
  const ctx = { leader: 'h', admits: { open: false, ids: ['a'], names: [nameKey('Grace')], no: [] }, peers: { ...peers, g: { name: 'grace', joinedAt: 12 } } };
  assert.ok(isIn('h', ctx)); assert.ok(isIn('a', ctx)); assert.ok(isIn('g', ctx), 'let in before, back after a reload');
  assert.ok(!isIn('me', ctx));
  assert.ok(isIn('me', { ...ctx, admits: { ...ctx.admits, open: true } }), 'an open heap lets everyone in');
});

test('who the host still has to answer: here, not in, not turned away', () => {
  const ctx = { leader: 'h', admits: { open: false, ids: ['a'], names: [], no: ['x'] }, peers: { ...peers, x: { name: 'X', joinedAt: 20 } } };
  assert.deepEqual(waitingFor(ctx), ['me']);
});

test('the host decides; the time keeper shares who is in', () => {
  const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');
  assert.match(net, /event: 'admits'[\s\S]{0,200}payload\?\.from === s\.leader/, 'only the time keeper says who is in');
  assert.match(net, /s\.setAdmits = \(/);
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /<h2 id="waittitle"><\/h2>/, 'waiting for the host (1.6)');
  assert.match(html, /<div id="askbox"[\s\S]*?<button type="button" id="notnow">Not now<\/button><button type="button" id="letin" class="pri">Let in<\/button>[\s\S]*?Let everyone in without asking/, 'let someone in (1.7)');
  assert.match(html, /Someone in this heap is already called \$\{/, 'name taken (1.5)');
  assert.match(html, /This heap is full/, 'full (1.9)');
  assert.match(html, /const inHeap = \(k\) =>/, 'one check of who is in');
  assert.match(html, /const others = \(\) => Object\.keys\(net\?\.peers \|\| \{\}\)\.filter\(\(k\) => k !== id && inHeap\(k\)\)/, 'nobody waiting gets photos');
});
