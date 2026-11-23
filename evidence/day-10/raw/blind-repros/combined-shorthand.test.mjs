import test from 'node:test';
import assert from 'node:assert/strict';
import { ghIsRead } from '../../scripts/runner-lib.mjs';

// gh's flag parser (pflag) lets boolean shorthands combine with the next one: `-iX POST` is
// --include plus --method POST, and `-iXPOST` / `-ifk=v` likewise. Each is a write.
test('a write flag combined after a boolean shorthand still makes gh api a write', () => {
  for (const a of [['api', '-iX', 'POST', 'x'], ['api', '-iXPOST', 'x'], ['api', '-ifk=v', 'x'], ['api', '-iF', 'k=v', 'x']])
    assert.equal(ghIsRead(a), false, a.join(' '));
});
