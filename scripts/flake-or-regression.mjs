// The flake-or-regression skill's runner (.claude/skills/flake-or-regression/SKILL.md).
// Reruns the two-browser test K times on main and K times on the branch, alternating, and counts
// how often each side hits the failure's signature. The decision rule is in scripts/flake-lib.mjs.
//
//   node scripts/flake-or-regression.mjs --main <ref> --branch <ref> --signature "<text>" [--k 10] [--mode direct|relay] --out <empty dir>
//
// Exit: 0 a verdict (already flaky, branch broke it, made worse), 3 inconclusive, 2 couldn't run.
// Writes <out>/runs.csv, <out>/verdict.md and each run's output.
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { outcomeOf, signatureProblem, firstFailure, decide, order, MAX_K } from './flake-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out'), SIG = arg('--signature'), MAIN = arg('--main'), BRANCH = arg('--branch'), MODE = arg('--mode', 'direct'), K = Number(arg('--k', '10'));
const stop = (why) => { console.log(`STOP: ${why}`); process.exit(2); };
if (!OUT) stop('no --out folder given');
if (existsSync(OUT) && readdirSync(OUT).length) stop(`the evidence folder ${OUT} isn't empty`);
if (!SIG) stop('no --signature: name the failure (a line of its output, for example "timed out after 90 s at two-browser.mjs:229")');
if (!MAIN || !BRANCH) stop('give both --main and --branch');
if (!Number.isInteger(K) || K < 3 || K > MAX_K) stop(`--k must be 3 to ${MAX_K}`);
if (!['direct', 'relay'].includes(MODE)) stop('--mode must be direct or relay');
mkdirSync(OUT, { recursive: true });
const repo = resolve('.'), git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
const sha = (ref) => { try { return git('rev-parse', '--verify', `${ref}^{commit}`); } catch { stop(`${ref} isn't a commit here (git fetch it first)`); } };
const sides = { main: { ref: MAIN, sha: sha(MAIN) }, branch: { ref: BRANCH, sha: sha(BRANCH) } };
// each comparison gets its own new folder, so two at once never touch each other's worktrees, and
// no fixed path is ever deleted (Qodo on #146); whatever it made is removed on any exit, a stop
// included (Qodo on #146)
const work = mkdtempSync(join(tmpdir(), 'for-'));
process.on('exit', () => { for (const s of Object.values(sides)) if (s.dir) { try { git('worktree', 'remove', '--force', s.dir); } catch {} } try { rmSync(work, { recursive: true, force: true }); git('worktree', 'prune'); } catch {} });
// both sides run with this checkout's node_modules, so a fair comparison needs both to declare the
// same dependencies (Qodo on #146). If both differ from this checkout, verdict.md says so.
try { git('diff', '--quiet', sides.main.sha, sides.branch.sha, '--', 'package.json', 'package-lock.json'); } catch { stop(`dependencies differ: main (${sides.main.sha.slice(0, 7)}) and the branch (${sides.branch.sha.slice(0, 7)}) have a different package.json or package-lock.json, so they can't both run with one node_modules. Compare by hand`); }
const depsNote = (() => { try { git('diff', '--quiet', sides.main.sha, '--', 'package.json', 'package-lock.json'); return ''; } catch { return 'Both sides declare the same dependencies, but not the same as this checkout: both ran with this checkout\'s node_modules.\n'; } })();
for (const [name, s] of Object.entries(sides)) {
  s.dir = join(work, `${name}-${s.sha.slice(0, 7)}`);
  git('worktree', 'add', '--detach', s.dir, s.sha);
  symlinkSync(join(repo, 'node_modules'), join(s.dir, 'node_modules'));
  if (!existsSync(join(s.dir, 'tests', 'two-browser.mjs'))) stop(`${name} (${s.sha.slice(0, 7)}) has no tests/two-browser.mjs`);
  s.counts = { hit: 0, pass: 0, other: 0, error: 0, hang: 0, paused: 0 }; s.firstHit = null; s.firstOther = null;
}
{ const why = signatureProblem(SIG, { main: readFileSync(join(sides.main.dir, 'tests', 'two-browser.mjs'), 'utf8'), branch: readFileSync(join(sides.branch.dir, 'tests', 'two-browser.mjs'), 'utf8') }); if (why) stop(why); }
const rows = ['run,side,commit,outcome,seconds,first_failure'];
let n = 0;
for (const name of order(K)) {
  const s = sides[name];
  // a run the machine slept through is run again (at most 3 tries for the slot), never counted
  for (let attempt = 1; ; attempt++) {
    n++;
    const t0 = Date.now(), m0 = process.hrtime.bigint();
    const r = spawnSync('node', ['tests/two-browser.mjs', ...(MODE === 'relay' ? ['--relay'] : [])], { cwd: s.dir, encoding: 'utf8', timeout: 10 * 60000, killSignal: 'SIGKILL' });
    const out = (r.stdout || '') + (r.stderr || ''), wallMs = Date.now() - t0, monoMs = Number((process.hrtime.bigint() - m0) / 1000000n), secs = Math.round(wallMs / 1000);
    const timedOut = r.error?.code === 'ETIMEDOUT';
    const outcome = outcomeOf({ exit: r.status, output: out, signature: SIG, timedOut, spawnError: r.error && !timedOut ? r.error.code || r.error.message : null, killedBy: !timedOut && r.signal ? r.signal : null, wallMs, monoMs });
    s.counts[outcome]++;
    const file = `run-${String(n).padStart(2, '0')}-${name}.txt`;
    writeFileSync(join(OUT, file), out.replaceAll(repo, '<repo>').replaceAll(s.dir, '<worktree>'));
    if (outcome === 'hit' && !s.firstHit) s.firstHit = file;
    if (outcome === 'other' && !s.firstOther) s.firstOther = file;
    const note = outcome === 'paused' ? `the machine was asleep for ${Math.round((wallMs - monoMs) / 1000)} s of it` : firstFailure(out);
    rows.push([n, name, s.sha.slice(0, 7), outcome, secs, JSON.stringify(note)].join(','));
    console.log(`run ${n} ${name.padEnd(6)} ${outcome.padEnd(6)} ${secs} s ${note.slice(0, 90)}`);
    if (outcome === 'hang' && s.counts.hang >= 2) { writeFileSync(join(OUT, 'runs.csv'), rows.join('\n') + '\n'); const other = name === 'main' ? 'branch' : 'main'; stop(`the test hung (killed after 10 min) twice on ${name}, and ${sides[other].counts.hang} time(s) on ${other} so far (see ${file}). If only the branch hangs, the branch may cause it: read that run before anything else`); }
    if (outcome === 'error' && s.counts.error >= 2) { writeFileSync(join(OUT, 'runs.csv'), rows.join('\n') + '\n'); stop(`the test couldn't run twice on ${name} (see ${file}): fix the setup, not the verdict`); }
    if (outcome !== 'paused') break;
    if (attempt >= 3) { writeFileSync(join(OUT, 'runs.csv'), rows.join('\n') + '\n'); stop(`the machine slept through 3 tries of one run on ${name}: keep it awake and run again`); }
  }
}
writeFileSync(join(OUT, 'runs.csv'), rows.join('\n') + '\n');
const d = decide({ k: K, main: sides.main.counts, branch: sides.branch.counts });
const md = `# flake-or-regression: ${d.verdict}
${depsNote ? `\n${depsNote}` : ''}
- Signature: \`${SIG}\`
- Mode: ${MODE}, K = ${K} runs per side, alternating (main first)
- main: \`${sides.main.ref}\` = ${sides.main.sha.slice(0, 7)} · hit ${sides.main.counts.hit}, pass ${sides.main.counts.pass}, other failure ${sides.main.counts.other}, couldn't run ${sides.main.counts.error}${sides.main.counts.hang ? `, hung ${sides.main.counts.hang}` : ''}${sides.main.counts.paused ? `, paused and run again ${sides.main.counts.paused}` : ''}${sides.main.firstHit ? ` · first hit: ${sides.main.firstHit}` : ''}
- branch: \`${sides.branch.ref}\` = ${sides.branch.sha.slice(0, 7)} · hit ${sides.branch.counts.hit}, pass ${sides.branch.counts.pass}, other failure ${sides.branch.counts.other}, couldn't run ${sides.branch.counts.error}${sides.branch.counts.hang ? `, hung ${sides.branch.counts.hang}` : ''}${sides.branch.counts.paused ? `, paused and run again ${sides.branch.counts.paused}` : ''}${sides.branch.firstHit ? ` · first hit: ${sides.branch.firstHit}` : ''}

**Verdict: ${d.verdict}.** ${d.why}.

The rule (scripts/flake-lib.mjs, fixed before any run): already flaky if main hit it at least once and the branch no more than twice as often; the branch broke it if main never did and the branch did at least 3 times; made worse if both did and the branch at least 3 times as often; anything else is inconclusive.
${sides.branch.counts.other + sides.main.counts.other ? `\nOther failures (not this signature) were seen: main ${sides.main.counts.other}, branch ${sides.branch.counts.other}. Read them: they may be a different problem.${sides.branch.firstOther ? ` First on the branch: ${sides.branch.firstOther}.` : ''}${sides.main.firstOther ? ` First on main: ${sides.main.firstOther}.` : ''}\n` : ''}`;
writeFileSync(join(OUT, 'verdict.md'), md);
console.log(md);
process.exit(d.verdict === 'inconclusive' ? 3 : 0);
