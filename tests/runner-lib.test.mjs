// Unit tests for the factory runner's helpers (scripts/runner-lib.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as lib from '../scripts/runner-lib.mjs';   // a namespace: a helper that doesn't exist yet fails on an assertion, not the import

const diff = (...lines) => ['+++ b/tests/x.mjs', ...lines.map((l) => '+' + l)].join('\n');

test('a unit test name is found', () => {
  assert.deepEqual(lib.testNames(diff("test('a thumbnail over 400 x 400 is not decoded', () => {")), ['a thumbnail over 400 x 400 is not decoded']);
});
test('a check() message on the next line is found (the #41 round 1 case)', () => {
  const names = lib.testNames(diff(
    "  check(fullSaid === 'Too many photos arriving. Try again in a moment' && !fullAsked.wants,",
    '    `tapping while every incoming slot is taken says "${fullSaid}" and asks for nothing (${JSON.stringify(fullAsked)})`);'));
  assert.deepEqual(names, ['tapping while every incoming slot is taken says "']);
});
test('a string inside the check() condition is not taken as its name', () => {
  assert.deepEqual(lib.testNames(diff("check(said === 'Already yours', 'tapping your own print says Already yours');")), ['tapping your own print says Already yours']);
});
test('a template message counts up to its first ${…}', () => {
  assert.deepEqual(lib.testNames(diff('check(ok, `a 400 x 400 thumbnail is shown (${JSON.stringify(x)})`);')), ['a 400 x 400 thumbnail is shown (']);
});
test('removed lines and short names are ignored', () => {
  assert.deepEqual(lib.testNames(['-check(ok, "an old check that was removed");', "+check(ok, 'short');"].join('\n')), []);
});
test('a named FAIL line counts as red, a crash in a named unit test does not', () => {
  const names = ['tapping while every incoming slot is taken'];
  assert.equal(lib.assertionFailures('FAIL tapping while every incoming slot is taken says "Receiving…"', names).length, 1);
  const crash = '✖ tapping while every incoming slot is taken (1ms)\n  ReferenceError: x is not defined\nℹ tests 1';
  assert.equal(lib.assertionFailures(crash, names).length, 0);
  const assertion = '✖ tapping while every incoming slot is taken (1ms)\n  AssertionError [ERR_ASSERTION]: no\nℹ tests 1';
  assert.equal(lib.assertionFailures(assertion, names).length, 1);
});
test("Qodo's escaped titles are decoded", () => {
  assert.equal(lib.decodeEntities?.('Taps can claim a photo is arriving when it isn&#x27;t'), "Taps can claim a photo is arriving when it isn't");
});
test('/agent retry is told apart from an instruction', () => {
  assert.deepEqual(lib.parseAsk?.('/agent retry'), { retry: true });
  assert.deepEqual(lib.parseAsk?.('/agent  say "Getting it…" instead'), { retry: false, text: 'say "Getting it…" instead' });
});

// from Qodo's review of 416e751 and the reviewer's notes
test('a regular expression with a bracket in the condition is skipped', () => {
  assert.deepEqual(lib.testNames(diff("check(/foo\\)/.test(value), 'a meaningful assertion about foo');")), ['a meaningful assertion about foo']);
});
test('a check() in one hunk is not closed by an unrelated hunk', () => {
  const d = ['@@ -1,0 +1,1 @@', '+  check(ok,', '@@ -40,0 +41,1 @@', "+    'an unrelated string here');"].join('\n');
  assert.deepEqual(lib.testNames(d), []);
});
test('a comment inside a wrapped check() is skipped', () => {
  assert.deepEqual(lib.testNames(diff('check(ok, // the second tap', "  'tapping again asks only once');")), ['tapping again asks only once']);
});
test('a retry pushes only when there is something new, otherwise it waits for Qodo again', () => {
  assert.equal(lib.retryPlan?.('abc1234', 'def5678'), 'push');
  assert.equal(lib.retryPlan?.('abc1234', 'abc1234'), 'wait');
});
test('an /agent instruction the agent makes no change for stops and asks the owner, retry or not (Qodo on 0191b36)', () => {
  const plan = (o) => lib.afterOwnerRound?.(o);
  assert.equal(plan({ committed: true, retryAsked: true }), 'check');
  assert.equal(plan({ committed: true, retryAsked: false }), 'check');
  assert.equal(plan({ committed: false, retryAsked: true }), 'stop');    // not 'wait': that could mark the run done with the request undone
  assert.equal(plan({ committed: false, retryAsked: false }), 'stop');
});
test('an old stop file is cleared before each agent run and when the owner reopens a run (#41 at 09:28)', () => {
  assert.deepEqual(lib.staleFiles?.('agent-run'), ['stop.md']);                       // test-output.txt is written just before a fix-tests run, so it stays
  assert.deepEqual(lib.staleFiles?.('reopen'), ['stop.md', 'test-output.txt']);
});
test('what to publish is read from the PR itself, so old runs and half-finished posts are not repeated (Qodo on 829263e)', () => {
  const p1 = '**Red → green, checked by the runner** (not the agent) for main..aaa:\n- a', p2 = '**Red → green, checked by the runner** (not the agent) for aaa..bbb:\n- b';
  const p3 = '**Red → green, checked by the runner** (not the agent) for bbb..ccc:\n- c';
  const plan = (body, comments) => lib.publishPlan?.([p1, p2, p3], body, comments);
  // #41 at 09:51: opened with p1, p2 pushed but never posted
  assert.deepEqual(plan('Closes #41\n\n' + p1, []), { updateBody: true, comment: [p2, p3] });
  // an older run that posted p2 as a comment already: only p3 is missing
  assert.deepEqual(plan('Closes #41\n\n' + p1, [p2]), { updateBody: true, comment: [p3] });
  // interrupted after the description and p2: only p3 is posted again
  assert.deepEqual(plan('Closes #41\n\n' + [p1, p2, p3].join('\n\n'), [p2]), { updateBody: false, comment: [p3] });
  assert.deepEqual(plan('Closes #41\n\n' + [p1, p2, p3].join('\n\n'), [p2, p3]), { updateBody: false, comment: [] });
});
test('a comment over a limit is still marked read, so it cannot stop the run again on every tick (Qodo on 829263e)', () => {
  const L = { commentRounds: 3, retryRounds: 5 };
  const plan = (asked, c, r) => lib.askPlan?.({ asked, commentRounds: c, retryRounds: r, limits: L });
  assert.deepEqual(plan([{ retry: true }], 0, 5), { consume: true, kind: 'retry', stop: 'The /agent retry limit (5) is used up.', commentRounds: 0, retryRounds: 5 });
  assert.deepEqual(plan([{ retry: true }], 3, 1), { consume: true, kind: 'retry', commentRounds: 3, retryRounds: 2 });
  assert.deepEqual(plan([{ retry: false, text: 'x' }, { retry: true }], 1, 0), { consume: true, kind: 'instruction', commentRounds: 2, retryRounds: 0 });
  assert.deepEqual(plan([{ retry: false, text: 'x' }], 3, 0), { consume: true, kind: 'instruction', stop: 'The /agent instruction limit (3) is used up.', commentRounds: 3, retryRounds: 0 });
});
test('every page is read, so a list past 100 is complete', () => {
  const pages = { 1: Array(100).fill('a'), 2: Array(100).fill('b'), 3: ['c'] };
  assert.equal(lib.allPages?.((p) => pages[p] || []).length, 201);
});
test('a retry has its own limit, separate from instructions', () => {
  assert.equal(lib.roundKind?.({ retry: true }), 'retry');
  assert.equal(lib.roundKind?.({ retry: false, text: 'x' }), 'instruction');
});

// Rule 7 (the Fresh Read Rule): a list read from GitHub stops at one page unless it's read with
// allPages. gh's own list commands stop at 30 and a REST list at its page size. #66
test('every GitHub list the runner reads is read to the end, or capped on purpose with --limit (Rule 7, #66)', () => {
  const src = readFileSync(new URL('../scripts/agent-watch.mjs', import.meta.url), 'utf8');
  assert.deepEqual(lib.unpagedReads?.(src), []);
});
test('a list read with a page number but no allPages is still one page (Qodo on #67)', () => {
  const reads = (line) => lib.unpagedReads?.(line).length;
  assert.equal(reads("const c = ghJson('api', `repos/${REPO}/issues/${n}/comments?per_page=100&page=${page}`);"), 1);
  assert.equal(reads("const c = ghJson('api', `repos/${REPO}/pulls/${s.pr}/comments?per_page=100`);"), 1);
  assert.equal(reads("const r = ghJson('issue', 'list', '-R', REPO, '--json', 'number');"), 1);
  assert.equal(reads("const c = allPages((page) => ghJson('api', `repos/${REPO}/issues/${n}/comments?per_page=100&page=${page}`));"), 0);
  assert.equal(reads("const r = ghJson('issue', 'list', '-R', REPO, '--limit', '1', '--json', 'number');"), 0);
  assert.equal(reads("const t = ghJson('api', `repos/${REPO}/issues/${n}`);"), 0);   // one ticket, not a list
});

// The quality gate (work-ticket skill, "Quality gate"), on Qodo's stored reviews of real PRs
// (`qodo read pr-review-session findings`, trimmed to the fields the gate reads).
const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/qodo/${name}.json`, import.meta.url)));
const HEAD = (r) => r.review_session.commit_sha;
const gate = (...a) => lib.gateVerdict?.(...a) ?? {};
test("Qodo's action levels map to High, Medium and Low, as its PR comments show them (#87, #89)", () => {
  assert.deepEqual(lib.SEVERITY, { action_required: 'High', remediation_recommended: 'Medium', informational: 'Low' });
});
test('#87 at its last commit: everything fixed or dismissed by the owner, so the gate is met', () => {
  const r = fx('pr-87'), g = gate(r, HEAD(r));
  assert.equal(g.state, 'done'); assert.deepEqual(g.lows, []);
});
test('#89 at 696f158: 3 open Mediums block and the open Low is only flagged', () => {
  const r = fx('pr-89-at-696f158'), g = gate(r, HEAD(r));
  assert.equal(g.state, 'fix');
  assert.deepEqual(g.blocking.map((f) => f.id.slice(0, 8)).sort(), ['1baf3c69', '4bf90ebe', 'b36e79c1']);
  assert.deepEqual(g.lows.map((f) => f.id.slice(0, 8)), ['6e7378d4']);
});
test('#65: three open Highs block', () => {
  const r = fx('pr-65'), g = gate(r, HEAD(r));
  assert.equal(g.state, 'fix'); assert.equal(g.blocking.length, 3);
});
test("#64: Qodo skipped its review of the head, so it isn't done even before counting findings", () => {
  const r = fx('pr-64'), g = gate(r, HEAD(r));
  assert.equal(g.state, 'incomplete'); assert.match(g.why, /skipped/);
});
test("#86: Qodo's review of the head isn't complete, so it isn't done (2 Mediums were open too)", () => {
  const r = fx('pr-86'), g = gate(r, HEAD(r));
  assert.equal(g.state, 'incomplete'); assert.match(g.why, /not complete/);
});
test('a review of an older commit, or one still running, means wait', () => {
  const r = fx('pr-87');
  assert.equal(gate(r, 'f'.repeat(40)).state, 'wait');
  assert.equal(gate({ ...r, review_session: { ...r.review_session, status: 'started' } }, HEAD(r)).state, 'wait');
  assert.equal(gate(null, HEAD(r)).state, 'wait');
});
test('an unknown label or status blocks: a label the gate cannot read is never treated as Low', () => {
  const r = fx('pr-87'), add = (f) => ({ ...r, finding_count: r.findings.length + 1, findings: [...r.findings, { id: 'canary00', title: 'canary', git_sha: HEAD(r), ...f }] });
  assert.equal(gate(add({ action_level: 'critical', attribution_status: 'pending' }), HEAD(r)).state, 'fix');
  assert.equal(gate(add({ action_level: 'informational', attribution_status: 'mystery' }), HEAD(r)).state, 'fix');
  assert.equal(gate(add({ action_level: 'informational', attribution_status: 'pending' }), HEAD(r)).state, 'done');
});
test('a canary: one planted open Medium on a finished review means not done', () => {
  const r = fx('pr-87');
  const g = gate({ ...r, finding_count: r.findings.length + 1, findings: [...r.findings, { id: 'canary01', title: 'planted Medium', action_level: 'remediation_recommended', attribution_status: 'pending', git_sha: HEAD(r) }] }, HEAD(r));
  assert.equal(g.state, 'fix'); assert.deepEqual(g.blocking.map((f) => f.id), ['canary01']);
});
test('a truncated read is not enough to call it done', () => {
  const r = fx('pr-87');
  assert.equal(gate({ ...r, qar_operation_result_truncated: true }, HEAD(r)).state, 'incomplete');
});
test("a failed read of Qodo's review is never taken as clean: wait, and say why", () => {
  const g = gate({ readError: "error: unknown option '--pr-url'" }, 'a'.repeat(40));
  assert.equal(g.state, 'wait'); assert.match(g.why, /couldn't be read.*unknown option/);
});

// Qodo's review of the gate's own PR (#90, 43ac74f), each finding as a test before its fix
test('#90 38d06043: a read that claims more findings than it returns is incomplete, never done', () => {
  const r = fx('pr-87');
  assert.equal(gate({ ...r, finding_count: 3, findings: null }, HEAD(r)).state, 'incomplete');
  assert.equal(gate({ ...r, finding_count: 3, findings: [] }, HEAD(r)).state, 'incomplete');
  assert.equal(gate({ ...r, finding_count: 3 }, HEAD(r)).state, 'done');
});
test("#90 bf2430c8: when the PR's head on GitHub isn't the commit the runner pushed, it isn't done", () => {
  const r = fx('pr-87'), g = gate(r, HEAD(r), { prHead: 'e'.repeat(40) });
  assert.equal(g.state, 'moved'); assert.match(g.why, /eeeeeee/);
  assert.equal(gate(r, HEAD(r), { prHead: HEAD(r) }).state, 'done');
});
test('#90 6bc5fe96: the Lows flagged for the owner say what each one is, not just its title', () => {
  const lines = lib.lowsReport?.({ lows: [{ title: 'PR body says refunds work', action_level: 'informational', description: 'The posted #87 body states that a send is given back. A reader would take it as correct.' }] }) ?? '';
  assert.match(lines, /Low findings for you/);
  assert.match(lines, /Low · PR body says refunds work: The posted #87 body states that a send is given back\./);
  assert.equal(lib.lowsReport?.({ lows: [] }), '');
});
test('#90 470fbdf1: a stopped run says NOT DONE first, a finished one says the gate was met', () => {
  assert.match(lib.stopTitle?.('agent-needs-help') ?? '', /^\*\*NOT DONE\.\*\*/);
  assert.match(lib.stopTitle?.('agent-done') ?? '', /^\*\*Factory run finished\.\*\*/);
});

// Qodo's second review of #90 (0a1c652)
const blocking1 = { id: '3be5f0ac', title: 'Missing comments strand valid fixes', action_level: 'action_required', attribution_status: 'pending',
  location: { file_path: 'scripts/agent-watch.mjs', start_line: 377 }, description: 'continueRun starts a fix round from the stored review. The agent gets only titles.' };
test("#90 3be5f0ac: the agent's gate list carries each finding's place and Qodo's full description", () => {
  const md = lib.gateSection?.({ blocking: [blocking1], lows: [] }, {}) ?? '';
  assert.match(md, /High · Missing comments strand valid fixes \(scripts\/agent-watch\.mjs:377\)/);
  assert.match(md, /The agent gets only titles\./);
});
test("#90 6bc5fe96: Qodo's type for each finding is read from its PR comment (🐞, 📘, 📎)", () => {
  const types = lib.findingTypes?.(readFileSync(new URL('./fixtures/qodo/pr-65-comment.html', import.meta.url), 'utf8')) ?? {};
  assert.equal(types["Publishing skips the PR's real state"], 'Rule violation');
  assert.equal(types['Proofs marked posted before they land'], 'Rule violation');
  assert.equal(types['Existing pull requests get duplicate proofs'], 'Bug');
});
test('#90 6bc5fe96: a Low flagged for the owner gives its type, place and reason', () => {
  const low = { ...blocking1, title: 'PR body says refunds work', action_level: 'informational', location: { file_path: 'web/index.html', start_line: 83 } };
  const md = lib.lowsReport?.({ lows: [low] }, { 'PR body says refunds work': 'Bug' }) ?? '';
  assert.match(md, /Low · Bug · PR body says refunds work \(web\/index\.html:83\): continueRun starts a fix round from the stored review\./);
});

// The runner's GitHub comments and PR text never show the machine's home path, username or
// domain (they leaked into two public comments, #41 and #61, through a crash message and a log path)
test('a crash message with a home path is posted with ~ and without the username or domain', () => {
  const who = { home: '/home/CORP.EXAMPLE.COM/someone', user: 'someone' };
  const crash = 'The runner crashed: Command failed: gh pr edit 52 --body-file /home/CORP.EXAMPLE.COM/someone/.local/state/qodo-agent/41-pr-body.md';
  const out = lib.publicText?.(crash, who) ?? crash;
  assert.match(out, /--body-file ~\/\.local\/state\/qodo-agent\/41-pr-body\.md/);
  assert.doesNotMatch(out, /CORP\.EXAMPLE\.COM|someone|\/home\//);
});
test('a partial path or the username on its own is hidden too', () => {
  const who = { home: '/home/CORP.EXAMPLE.COM/someone', user: 'someone' };
  const out = lib.publicText?.('cwd /home/CORP.EXAMPLE.COM/x, user someone, host CORP.EXAMPLE.COM', who) ?? '';
  assert.doesNotMatch(out, /CORP\.EXAMPLE\.COM|someone/);
  assert.equal(lib.publicText?.('Log: `~/.local/state/qodo-agent/logs/61-1-work.log`', who), 'Log: `~/.local/state/qodo-agent/logs/61-1-work.log`');
});
test('ordinary text is left alone', () => {
  const who = { home: '/home/jdoe', user: 'jdoe' };
  assert.equal(lib.publicText?.('Quality gate met on e620c50: no open High or Medium findings. Meet me at home.', who), 'Quality gate met on e620c50: no open High or Medium findings. Meet me at home.');
});
// Qodo on #97 (ad0aa47)
test('#97 bc54c3e8: proofs shown with redaction are found again on the PR, so nothing is posted twice', () => {
  const who = { home: '/home/runner', user: 'runner' }, show = (t) => lib.publicText?.(t, who) ?? t;
  const proofs = ['Proof from the runner: abc..def\nnpm test passed', 'Proof from the runner: def..123\nnpm test passed'];
  const body = proofs.map(show).join('\n\n'), comments = [show(proofs[1])];
  const plan = lib.publishPlan(proofs, body, comments, show);
  assert.deepEqual(plan, { updateBody: false, comment: [] });
});
test('#97 5d2b2594 (disputed): a short account name is already hidden wherever the home path appears', () => {
  const who = { home: '/home/al', user: 'al' };
  const out = lib.publicText?.('cwd /home/al/x and /home/al', who) ?? '';
  assert.doesNotMatch(out, /\/home\/al/);
  assert.equal(out, 'cwd ~/x and ~');
});

// The agent's settings: sign-in keys and extra denied folders come from an uncommitted local config
test("the agent's settings keep only env and model, plus the local config's sign-in keys and denied folders", () => {
  const user = { env: { A: '1' }, model: 'm', signIn: 'x', permissions: { allow: ['Bash(*)'] }, hooks: {} };
  const s = lib.agentSettings?.(user, { settingsKeys: ['signIn'], denyDirs: ['.work'] }) ?? {};
  assert.deepEqual(Object.keys(s).sort(), ['env', 'model', 'permissions', 'signIn']);
  assert.ok(s.permissions?.deny?.includes('Read(~/.ssh/**)') && s.permissions.deny.includes('Read(~/.work/**)'));
  assert.equal(s.permissions.allow, undefined);
  const plain = lib.agentSettings?.(user, {}) ?? {};
  assert.deepEqual(Object.keys(plain).sort(), ['env', 'model', 'permissions']);
});
// Qodo on #99 (271128c)
test("#99 4074a5ef: the local config can't bring in control settings such as hooks or permissions", () => {
  const user = { env: {}, model: 'm', hooks: { x: 1 }, permissions: { allow: ['Bash(*)'] }, enabledPlugins: { p: true }, mcpServers: {}, signIn: 'x' };
  const s = lib.agentSettings?.(user, { settingsKeys: ['hooks', 'permissions', 'enabledPlugins', 'mcpServers', 'signIn'] }) ?? {};
  assert.deepEqual(Object.keys(s).sort(), ['env', 'model', 'permissions', 'signIn']);
  assert.equal(s.permissions.allow, undefined);
});
test('#99 2c5a216f: a malformed local config is ignored rather than crashing the runner', () => {
  const user = { env: {}, model: 'm' };
  for (const local of [null, 'x', { settingsKeys: 'signIn', denyDirs: 7 }, { settingsKeys: [1, null], denyDirs: [{}] }])
    assert.doesNotThrow(() => lib.agentSettings?.(user, local));
  assert.deepEqual(Object.keys(lib.agentSettings?.(user, { settingsKeys: 'signIn' }) ?? {}).sort(), ['env', 'model', 'permissions']);
});
test("#99 8829f7df: the local config can pass extra env names but can't replace the sandbox PATH or the others the runner sets", () => {
  const base = { PATH: '/sandbox/bin:/usr/bin', HOME: '/h', AGENT_RUN: '1' };
  const env = lib.agentEnv?.(base, { passEnv: ['PATH', 'HOME', 'AGENT_RUN', 'REGION_X'] }, { PATH: '/host', HOME: '/x', AGENT_RUN: '0', REGION_X: 'r' }) ?? {};
  assert.deepEqual(env, { PATH: '/sandbox/bin:/usr/bin', HOME: '/h', AGENT_RUN: '1', REGION_X: 'r' });
  assert.deepEqual(lib.agentEnv?.(base, null, {}), base);
});
// Qodo on #99, second review (d5d3007): a machine that isn't set up stops before any agent work
test('#99 40078388 and 89d294d4: an unset machine is refused before the agent starts, saying what is missing and no paths', () => {
  assert.deepEqual(lib.machineReady?.({ localConfig: true, claude: true }), { ok: true });
  const both = lib.machineReady?.({ localConfig: false, claude: false }) ?? {};
  assert.equal(both.ok, false);
  assert.equal(both.why, "This machine isn't set up: missing local config, claude not on PATH.");
  assert.equal(lib.machineReady?.({ localConfig: false, claude: true })?.why, "This machine isn't set up: missing local config.");
  assert.doesNotMatch(both.why, /\/|~/);
});

// Day 10: the gate's verdict as a `qodo-gate` commit status on the PR head, which the ruleset
// requires, so a PR merges only when the gate says done (or the owner bypasses it on GitHub).
const status = (g) => lib.gateStatus?.(g) ?? {};
test('qodo-gate: only a met gate is green, and it says how many Lows were flagged', () => {
  const r = fx('pr-87'), s = status(gate(r, HEAD(r)));
  assert.equal(s.state, 'success'); assert.match(s.description, /no open High or Medium/);
  const low = { ...r, finding_count: r.findings.length + 1, findings: [...r.findings, { id: 'low00001', title: 'a Low', action_level: 'informational', attribution_status: 'pending', git_sha: HEAD(r) }] };
  assert.match(status(gate(low, HEAD(r))).description, /1 Low flagged/);
});
test('qodo-gate: open High or Medium findings are red and counted', () => {
  const r = fx('pr-89-at-696f158'), s = status(gate(r, HEAD(r)));
  assert.equal(s.state, 'failure'); assert.match(s.description, /3 High or Medium open/);
});
test("qodo-gate: an incomplete or skipped review is red, never green", () => {
  for (const name of ['pr-64', 'pr-86']) { const r = fx(name); assert.equal(status(gate(r, HEAD(r))).state, 'failure', name); }
});
test("qodo-gate: no finished review of the head yet is pending, so it can't merge but isn't a verdict", () => {
  const r = fx('pr-87');
  assert.equal(status(gate(r, 'f'.repeat(40))).state, 'pending');
  assert.equal(status(gate({ readError: 'boom' }, 'a'.repeat(40))).state, 'pending');
});
test('qodo-gate: a head that moved is red', () => {
  const r = fx('pr-87');
  assert.equal(status(gate(r, HEAD(r), { prHead: 'e'.repeat(40) })).state, 'failure');
});
test("qodo-gate: the description fits GitHub's 140-character limit", () => {
  const long = { state: 'incomplete', why: 'x'.repeat(400) };
  assert.ok(status(long).description.length <= 140);
});

// Qodo's review of #104 (84e4f57), each finding as a test before its fix
test('#104 978b8c13: a failed Qodo read never puts the home path or username in the public status', () => {
  const who = { home: '/home/CORP.EXAMPLE.COM/someone', user: 'someone' };
  const g = { state: 'wait', why: "Qodo's review couldn't be read (spawnSync /home/CORP.EXAMPLE.COM/someone/.local/bin/qodo ENOENT)" };
  const d = lib.gateStatus?.(g, who)?.description ?? '/home/CORP.EXAMPLE.COM/someone';
  assert.doesNotMatch(d, /CORP\.EXAMPLE|someone|\/home\//); assert.match(d, /~\/\.local\/bin\/qodo/);
});
test("#104 b72e885c: the runner posts a status whenever it changes, waits included, and doesn't repeat one", () => {
  const ch = (...a) => lib.statusChange?.(...a);
  const wait = { state: 'pending', description: 'Waiting' }, ok = { state: 'success', description: 'met' };
  const k = ch(null, 'a'.repeat(40), ok);
  assert.ok(k, 'first status is posted');
  assert.equal(ch(k, 'a'.repeat(40), ok), null, 'the same status again is not reposted');
  assert.ok(ch(k, 'a'.repeat(40), wait), 'a re-review of the same commit turns a green status back to pending');
  assert.ok(ch(k, 'b'.repeat(40), ok), 'a new head gets its own status');
});
test('#104 2ea70199: the timer copies the whole scripts folder, so a new runner module never needs a unit change', () => {
  const unit = readFileSync(new URL('../scripts/systemd/qodo-agent.service', import.meta.url), 'utf8');
  assert.match(unit, /git -C %h\/qodo-hack-2026 archive -o \S+ origin\/main scripts && tar -x/);   // a failed archive stops the tick, never runs an old copy
});
test('#104 4cda905c: a finding blocking only because its label is unreadable is named as that, not as a High or Medium', () => {
  const r = fx('pr-87'), add = { ...r, finding_count: r.findings.length + 1, findings: [...r.findings, { id: 'canary02', title: 'odd', action_level: 'critical', attribution_status: 'pending', git_sha: HEAD(r) }] };
  const d = lib.gateStatus?.(gate(add, HEAD(r)))?.description ?? '';
  assert.match(d, /1 with a label the gate can't read/); assert.doesNotMatch(d, /1 High or Medium open/);
});
