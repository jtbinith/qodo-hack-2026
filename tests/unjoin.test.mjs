// Undo a join (wireframe 4.4): the two screens come apart again; other joins stay
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { removeJoin } from '../web/layout.js';

const J = (a, b) => ({ a, b, edgeA: 'R', edgeB: 'L', alongA: 100, alongB: 100 });

test('undoing a join removes that pair only, whichever way round it was made', () => {
  const joins = [J('a', 'b'), J('b', 'c')];
  assert.deepEqual(removeJoin(joins, 'a', 'b'), [J('b', 'c')]);
  assert.deepEqual(removeJoin(joins, 'b', 'a'), [J('b', 'c')]);
  assert.deepEqual(removeJoin(joins, 'a', 'c'), joins, 'not joined: nothing changes');
});

test('the time keeper undoes a join only when one of the two screens asks', () => {
  const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');
  assert.match(net, /s\.unjoin = \(other\) =>/);
  assert.match(net, /event: 'unjoin'[\s\S]{0,300}s\.leader !== id[\s\S]{0,200}payload\.from !== payload\.a && payload\.from !== payload\.b/);
  assert.match(net, /removeJoin\(s\.joins, /);
});

test('the joined line offers Undo', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /joinResult\('joined', `Joined with \$\{other\}, \$\{SIDE\[mine \? d\.edgeA : d\.edgeB\]\}`, mine \? d\.b : d\.a\)/);
  assert.match(html, /net\.unjoin\(/);
  assert.match(html, /let snackUndo = null;/);
});
