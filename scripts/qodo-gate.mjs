#!/usr/bin/env node
// The quality gate as a command, for any PR: the factory's and mine.
//   node scripts/qodo-gate.mjs <PR>          prints the verdict on the PR's current head
//   node scripts/qodo-gate.mjs <PR> --post   also posts it as the `qodo-gate` commit status
// Exit 0: gate met. 1: not done. 2: no finished review of the head yet.
// The "protect main" ruleset requires a green `qodo-gate`, so a PR merges only when this says so
// (or the owner bypasses the ruleset on GitHub, which GitHub records). A new push is a new head
// with no status, so it's blocked again until the gate is checked again.
import { execFileSync } from 'node:child_process';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gateVerdict, gateStatus, mayPostSuccess, acceptLocalOnly } from './runner-lib.mjs';

export const REPO = 'jtbinith/qodo-hack-2026', CONTEXT = 'qodo-gate';
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5 * 60000, killSignal: 'SIGKILL', ...opts }).trim();

// Qodo's stored review of a PR, fresh from Qodo (a read: no code leaves the machine).
// A failed read is reported, never taken as clean.
// qodo lives in ~/.local/bin, which isn't on the systemd unit's PATH (scripts/systemd/)
export const QODO_BIN = process.env.QODO_BIN || join(homedir(), '.local/bin/qodo');
// it also needs XDG_RUNTIME_DIR (its tool catalog lives there): without it `--pr-url` is "unknown"
export const QODO_ENV = { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}` };
export function qodoRead(pr, cwd = process.cwd()) {
  try { return JSON.parse(sh(QODO_BIN, ['read', 'pr-review-session', 'findings', '--pr-url', `https://github.com/${REPO}/pull/${pr}`, '--json'], { cwd, env: QODO_ENV }).split('\n')[0]); }
  catch (e) { return { readError: (e.stderr || e.message || '').toString().trim().split('\n')[0].slice(0, 200) }; }
}

// Qodo's newest review comment on a PR ("Code Review by Qodo"): the commit it names last, its text and
// when it was last updated. Every page is read.
export function reviewComment(pr) {
  const all = sh('gh', ['api', '--paginate', `repos/${REPO}/issues/${pr}/comments?per_page=100`, '-q', '.[] | select(.user.login == "qodo-code-review[bot]") | {body, updated_at}'])
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => /Code Review by Qodo/.test(c.body));
  const c = all.sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at)).at(-1);
  return c ? { reviewed: [...c.body.matchAll(/commit\/([0-9a-f]{40}) -->/g)].at(-1)?.[1], body: c.body, at: Date.parse(c.updated_at) } : null;
}
// CI's required check on a commit: GitHub's latest `npm test` run, finished and green (Qodo on #117)
export function ciPassed(sha) {
  const runs = JSON.parse(sh('gh', ['api', `repos/${REPO}/commits/${sha}/check-runs?check_name=${encodeURIComponent('npm test')}&filter=latest&per_page=100`])).check_runs || [];
  return runs.length > 0 && runs.every((c) => c.status === 'completed' && c.conclusion === 'success');
}

// The gate on the PR's head as GitHub has it now. `expected` is the commit the caller pushed
// (the runner's), so a head someone else moved is never marked done.
export function checkGate(pr, { expected, cwd } = {}) {
  const head = JSON.parse(sh('gh', ['api', `repos/${REPO}/pulls/${pr}`])).head.sha;
  const read = qodoRead(pr, cwd);
  let g = gateVerdict(read, expected || head, { prHead: head }), accepted = false;
  // the same exception the runner makes for Qodo's local-findings reason, so --post agrees with it (Qodo on #117)
  if (g.state === 'incomplete') { const a = acceptLocalOnly({ read, head, review: reviewComment(pr), ciOk: ciPassed(head) }); if (a.ok) { g = a.g; accepted = true; } }
  return { head, g, accepted, status: gateStatus(g, { home: homedir(), user: userInfo().username }) };   // public: no home path or username
}

const post = (sha, context, { state, description }) =>
  sh('gh', ['api', '-X', 'POST', `repos/${REPO}/statuses/${sha}`, '-f', `state=${state}`, '-f', `context=${context}`, '-f', `description=${description}`, '--jq', '.state']);
export const postGate = (sha, st) => post(sha, CONTEXT, st);
// the runner's blind review of a head, as its own status (not required by the ruleset: it holds qodo-gate back)
export const postBlind = (sha, st) => post(sha, 'blind-review', st);
const statusesOf = (sha) => JSON.parse(sh('gh', ['api', `repos/${REPO}/commits/${sha}/statuses?per_page=100`]));

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const pr = Number(process.argv[2]);
  if (!Number.isInteger(pr) || pr <= 0) { console.error('Usage: node scripts/qodo-gate.mjs <PR number> [--post]'); process.exit(64); }
  const { head, status, accepted } = checkGate(pr);
  console.log(`PR #${pr} at ${head.slice(0, 7)}: ${status.state}. ${status.description}${accepted ? ' (Qodo marked the review incomplete only because of the local findings; accepted)' : ''}`);
  if (process.argv.includes('--post')) {
    if (status.state === 'success' && !mayPostSuccess(statusesOf(head))) { console.log(`not posted: the blind review of ${head.slice(0, 7)} hasn't passed (its blind-review status is pending or failed)`); process.exit(1); }
    console.log(`posted ${CONTEXT} = ${postGate(head, status)} on ${head.slice(0, 7)}`);
  }
  process.exit(status.state === 'success' ? 0 : status.state === 'pending' ? 2 : 1);
}
