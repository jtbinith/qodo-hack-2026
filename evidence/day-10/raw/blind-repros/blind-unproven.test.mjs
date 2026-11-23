import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A blind finding the runner already reproduced (b.blocking) whose scope-copied repro then doesn't fail
// lands in bplan.unproven. The blind path keeps only bplan.fix, so such a finding disappears: if nothing
// is left to fix, blind-review is posted as success and the run ends done. The PR and local paths stop
// on unproven findings ("open for the owner"); the blind path must not post success over them.
test('blind path: unproven blind findings are not silently dropped before posting success', () => {
  const src = readFileSync(new URL('../../scripts/agent-watch.mjs', import.meta.url), 'utf8');
  const start = src.indexOf("const bplan = scopeCheck(");
  const end = src.indexOf("postBlind(prHead, { state: 'success', description: `Nothing this branch introduced", start);
  assert.ok(start > 0 && end > start, 'blind scope block found');
  const block = src.slice(start, end);
  assert.match(block, /bplan\.unproven/, 'the blind block never looks at bplan.unproven before posting success');
});
