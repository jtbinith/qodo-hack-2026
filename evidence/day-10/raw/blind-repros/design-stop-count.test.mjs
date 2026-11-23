import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../scripts/agent-watch.mjs', import.meta.url), 'utf8');
const line = src.split('\n').find((l) => l.includes('const prevStops = '));
const pred = line.slice(line.indexOf('.filter(') + '.filter('.length, line.lastIndexOf(').length'));
const isDesignStop = new Function('OWNER', `return ${pred}`)('jtbinith');

// Any NOT DONE stop comment counts if the phrase appears anywhere in it: the stop comment also
// carries the agent's report (and failing test lines), which can quote the design-stop message,
// e.g. on a factory ticket like this one. That stop wasn't a design stop, but it uses up the cap.
test('a non-design stop whose report quotes the design-stop message is not counted', () => {
  const body = '**NOT DONE.** The factory run stopped and needs you. `abc1234 test: x` passes on its own, so its tests don\'t prove anything.\n\n' +
    'Agent runs: 2 · review rounds: 0/3\n\n<details><summary>Agent report</summary>\n\nThe stop says "Codebase Wisdom found 1 question the ticket leaves open that decides the design. Nothing was built."\n</details>';
  assert.equal(isDesignStop({ user: { login: 'jtbinith' }, body }), false);
});
