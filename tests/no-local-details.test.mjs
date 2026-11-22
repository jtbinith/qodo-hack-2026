// Nothing in the repo names this machine's sign-in setup or work tooling. The runner reads those
// from an uncommitted local config instead (~/.config/qodo-agent/, see scripts/agent-watch.mjs).
// The words are built from parts so this file doesn't match itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const WORDS = [new RegExp('bed' + 'rock', 'i'), new RegExp('\\.mid' + 'way'), new RegExp('\\.tool' + 'box\\b'), new RegExp('awsCredential' + 'Export'), new RegExp('msg_bd' + 'rk_')];
test('no tracked file names the sign-in setup or work tooling', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const hits = [];
  for (const f of files) {
    let text; try { text = readFileSync(root + f, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue;   // binary
    text.split('\n').forEach((line, i) => { for (const w of WORDS) if (w.test(line)) hits.push(`${f}:${i + 1}: ${w.source}`); });
  }
  assert.deepEqual(hits, []);
});
