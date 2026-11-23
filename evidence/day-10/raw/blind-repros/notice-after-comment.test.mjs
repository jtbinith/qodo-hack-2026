import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptLocalOnly } from '../../scripts/runner-lib.mjs';

const h = 'a'.repeat(40);
const read = {
  review_session: { commit_sha: h, status: 'completed', review_complete: false, started_at: '2026-11-01T00:00:00Z' },
  findings: [], finding_count: 0,
};
// The notice section is meant to hold exactly the local-findings line, "however phrased, or a
// different layout". A second notice after any HTML comment inside the section is never read.
test('a second notice after an HTML comment keeps the review incomplete', () => {
  const body = `<h3>Code Review by Qodo</h3> <!-- qodo-daily-tip:end -->\n\nQodo could not verify all local findings on this PR.\n<!-- section -->\nQodo failed to review 3 files on this PR.\n<!-- https://github.com/x/commit/${h} -->`;
  const a = acceptLocalOnly({ read, head: h, review: { reviewed: h, at: Date.parse('2099-01-01'), body }, ciOk: true });
  assert.equal(a.ok, false);
});
