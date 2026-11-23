// The blind reviewer is kept from Qodo's review only by Read(...) deny rules on .agent/review.md,
// report.md and so on. But its profile also allows `node --test:*`, and a test file it writes itself
// (in .agent/blind/, which it may edit) can readFileSync('.agent/review.md') and print it. The files
// stay in the worktree during the blind run: blindReview never moves or removes them first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../scripts/agent-watch.mjs', import.meta.url), 'utf8');

test("the blind reviewer can't reach Qodo's review by running its own node test", () => {
  const blindProfile = src.match(/const BLIND = \{[\s\S]*?\n/)?.[0] || '';
  const allowsNode = /Bash\(node --test:\*\)/.test(blindProfile);
  const fn = src.match(/function blindReview[\s\S]*?\n\}/)?.[0] || '';
  const beforeAgent = fn.slice(0, fn.indexOf('agent(n, s,'));
  // the UNSEEN files must be out of the worktree (moved or removed) before an agent that can run code starts
  const hidden = /(rmSync|renameSync|unlinkSync)\([^)]*(UNSEEN|review\.md)/.test(beforeAgent) || /UNSEEN\.(forEach|map)\([^)]*(rmSync|renameSync|unlinkSync)/.test(beforeAgent);
  assert.ok(!allowsNode || hidden, 'BLIND allows `node --test` (arbitrary code) while .agent/review.md, report.md, pr-body.md stay readable on disk: the Read deny rules are bypassed');
});
