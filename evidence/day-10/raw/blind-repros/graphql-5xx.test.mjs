import test from 'node:test';
import assert from 'node:assert/strict';
import { transientGh } from '../../scripts/runner-lib.mjs';

// `gh pr list`, `gh pr view` and `gh issue list` go through GitHub's GraphQL API, whose client can
// report a gateway error as "non-200 OK status code: 5xx ..." rather than "HTTP 5xx". Those are
// the reads the runner makes most, and the same passing 504 the ticket wants retried.
test('a GraphQL 5xx from gh pr/issue reads is a passing error', () => {
  for (const m of ['non-200 OK status code: 504 Gateway Timeout body: ""', 'non-200 OK status code: 502 Bad Gateway body: "<html>"'])
    assert.equal(transientGh(m), true, m);
});
