#!/usr/bin/env node
// The quality gate as a command, for any PR: the factory's and mine.
//   node scripts/qodo-gate.mjs <PR>          prints the verdict on the PR's current head
//   node scripts/qodo-gate.mjs <PR> --post   also posts it as the `qodo-gate` commit status
// Exit 0: gate met. 1: not done. 2: no finished review of the head yet.
// The "protect main" ruleset requires a green `qodo-gate`, so a PR merges only when this says so
// (or the owner bypasses the ruleset on GitHub, which GitHub records). A new push is a new head
// with no status, so it's blocked again until the gate is checked again.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gateVerdict, gateStatus } from './runner-lib.mjs';

export const REPO = 'jtbinith/qodo-hack-2026', CONTEXT = 'qodo-gate';
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5 * 60000, killSignal: 'SIGKILL', ...opts }).trim();

// Qodo's stored review of a PR, fresh from Qodo (a read: no code leaves the machine).
// A failed read is reported, never taken as clean.
// qodo lives in ~/.local/bin, which isn't on the systemd unit's PATH (scripts/systemd/)
const QODO_BIN = process.env.QODO_BIN || join(homedir(), '.local/bin/qodo');
// it also needs XDG_RUNTIME_DIR (its tool catalog lives there): without it `--pr-url` is "unknown"
const QODO_ENV = { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}` };
export function qodoRead(pr, cwd = process.cwd()) {
  try { return JSON.parse(sh(QODO_BIN, ['read', 'pr-review-session', 'findings', '--pr-url', `https://github.com/${REPO}/pull/${pr}`, '--json'], { cwd, env: QODO_ENV }).split('\n')[0]); }
  catch (e) { return { readError: (e.stderr || e.message || '').toString().trim().split('\n')[0].slice(0, 200) }; }
}

// The gate on the PR's head as GitHub has it now. `expected` is the commit the caller pushed
// (the runner's), so a head someone else moved is never marked done.
export function checkGate(pr, { expected, cwd } = {}) {
  const head = JSON.parse(sh('gh', ['api', `repos/${REPO}/pulls/${pr}`])).head.sha;
  const g = gateVerdict(qodoRead(pr, cwd), expected || head, { prHead: head });
  return { head, g, status: gateStatus(g) };
}

export const postGate = (sha, { state, description }) =>
  sh('gh', ['api', '-X', 'POST', `repos/${REPO}/statuses/${sha}`, '-f', `state=${state}`, '-f', `context=${CONTEXT}`, '-f', `description=${description}`, '--jq', '.state']);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const pr = Number(process.argv[2]);
  if (!Number.isInteger(pr) || pr <= 0) { console.error('Usage: node scripts/qodo-gate.mjs <PR number> [--post]'); process.exit(64); }
  const { head, status } = checkGate(pr);
  console.log(`PR #${pr} at ${head.slice(0, 7)}: ${status.state}. ${status.description}`);
  if (process.argv.includes('--post')) console.log(`posted ${CONTEXT} = ${postGate(head, status)} on ${head.slice(0, 7)}`);
  process.exit(status.state === 'success' ? 0 : status.state === 'pending' ? 2 : 1);
}
