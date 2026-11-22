// Nothing in the repo names this machine's sign-in setup or work tooling. The runner reads those
// from an uncommitted local config instead (~/.config/qodo-agent/, see scripts/agent-watch.mjs).
// The words are built from parts so this file doesn't match itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const WORDS = [new RegExp('bed' + 'rock', 'i'), new RegExp('\\.mid' + 'way'), new RegExp('\\.tool' + 'box\\b'), new RegExp('awsCredential' + 'Export'), new RegExp('msg_bd' + 'rk_')];
// every file in the checkout, read from disk (not git: the factory's test container has no git directory)
function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.agent'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p); else if (e.isFile()) yield p;
  }
}
test('no file in the repo names the sign-in setup or work tooling', () => {
  const hits = [];
  for (const f of files(root)) {
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue;   // binary
    text.split('\n').forEach((line, i) => { for (const w of WORDS) if (w.test(line)) hits.push(`${f.slice(root.length)}:${i + 1}: ${w.source}`); });
  }
  assert.deepEqual(hits, []);
});
