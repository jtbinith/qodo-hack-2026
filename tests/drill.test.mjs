// Day 10 drill: a deliberately red head, to show the "protect main" ruleset refuses the merge.
// This PR is never merged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('drill: this test fails on purpose', () => { assert.equal(1 + 1, 3); });
