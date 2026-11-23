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
// Day 10: Codebase Wisdom checks the ticket's claims before any code is written. The runner doesn't
// take the investigator's word: each claim must cite a file, a line and a quote, and the quote must
// really be there (within 3 lines). A claim proven wrong stops the run; one it can't check goes on
// to the agent as an assumption to test.
const FILES = { 'web/peers.js': ['a', 'b', "  if (payload.from !== s.leader) return;   // fromLeader", 'd', 'e'] };
const at = (file, line) => FILES[file] || null;
const wisdom = (j) => lib.wisdomVerdict?.(j, at) ?? {};
const claim = (o) => ({ claim: 'results from anyone but the time keeper are dropped', verdict: 'holds', file: 'web/peers.js', line: 3, quote: 'payload.from !== s.leader', ...o });
test('wisdom: a cited claim that holds lets the work start', () => {
  const w = wisdom({ claims: [claim()] });
  assert.equal(w.state, 'proceed'); assert.equal(w.held.length, 1); assert.deepEqual(w.wrong, []);
});
test('wisdom: a claim proven wrong by a real quote stops the run before any code', () => {
  const w = wisdom({ claims: [claim(), claim({ claim: 'the late device keeps join results', verdict: 'wrong' })] });
  assert.equal(w.state, 'stop'); assert.equal(w.wrong.length, 1); assert.match(w.wrong[0].claim, /keeps join results/);
});
test("wisdom: a quote that isn't at the cited line isn't evidence, so the claim is only unverified", () => {
  for (const bad of [{ quote: 'something the file never says' }, { line: 50 }, { file: 'web/nope.js' }, { quote: '' }, { quote: 'a' }]) {
    const w = wisdom({ claims: [claim({ verdict: 'wrong', ...bad })] });
    assert.equal(w.state, 'proceed', JSON.stringify(bad)); assert.equal(w.unverified.length, 1); assert.deepEqual(w.wrong, []);
  }
});
test('wisdom: a quote 3 lines away still counts, 4 lines away does not', () => {
  assert.equal(wisdom({ claims: [claim({ line: 6 })] }).held.length, 1);
  assert.equal(wisdom({ claims: [claim({ line: 7 })] }).held.length, 0);
});
test('wisdom: paths outside the repo are never read', () => {
  const seen = [];
  lib.wisdomVerdict?.({ claims: [claim({ file: '../secret' }), claim({ file: '/etc/passwd' }), claim({ file: 'a/../../x' })] }, (f) => { seen.push(f); return null; });
  assert.deepEqual(seen, []);
});
test("wisdom: no result, or a result that checks nothing, can't let the work start", () => {
  for (const j of [null, {}, { claims: [] }, { claims: 'x' }, 'text']) assert.equal(wisdom(j).state, 'invalid', JSON.stringify(j));
});
test('wisdom: an unknown verdict is unverified, never holds', () => {
  const w = wisdom({ claims: [claim({ verdict: 'probably' })] });
  assert.equal(w.unverified.length, 1); assert.equal(w.held.length, 0);
});

// Day 10: Qodo's local review of the unpushed commits, run by the runner before every push. It goes
// through the same gate as the PR review (localRead turns `qodo review --json` into the PR read's shape).
const local = (name, head = 'h'.repeat(40)) => lib.gateVerdict?.(lib.localRead?.(fx(name), head, { status: 0 }), head) ?? {};
test('local review, Day 8 run A: 2 open Mediums block the push', () => {
  const g = local('local-day8-A');
  assert.equal(g.state, 'fix'); assert.deepEqual(g.blocking.map((f) => f.id.slice(0, 8)).sort(), ['07c384af', 'e5fa90a2']);
});
test('local review, Day 8 run J: the dismissed Medium is closed, the High still blocks, the Low is only flagged', () => {
  const g = local('local-day8-J');
  assert.equal(g.state, 'fix'); assert.ok(!g.blocking.some((f) => f.id.startsWith('4bf90ebe')));
  assert.ok(g.blocking.some((f) => f.id.startsWith('240d001d'))); assert.deepEqual(g.lows.map((f) => f.id.slice(0, 8)), ['98ac0a5b']);
});
test('local review: no findings and full coverage lets the push go ahead', () => {
  const r = { ...fx('local-day8-A'), findings: [] };
  assert.equal(lib.gateVerdict?.(lib.localRead?.(r, 'h', { status: 0 }), 'h')?.state, 'done');
});
test("local review: incomplete coverage or finding state is never clean", () => {
  const r = { ...fx('local-day8-A'), findings: [] };
  assert.equal(lib.gateVerdict?.(lib.localRead?.({ ...r, meta: { coverage: { complete: false } } }, 'h', { status: 0 }), 'h')?.state, 'incomplete');
  assert.equal(lib.gateVerdict?.(lib.localRead?.({ ...r, finding_state: { complete: false } }, 'h', { status: 0 }), 'h')?.state, 'incomplete');
  assert.equal(lib.gateVerdict?.(lib.localRead?.({ ...r, meta: {} }, 'h', { status: 0 }), 'h')?.state, 'incomplete');
});
test('local review: output that failed to run or parse is never clean', () => {
  assert.notEqual(lib.gateVerdict?.(lib.localRead?.({ readError: 'boom' }, 'h'), 'h')?.state ?? 'x', 'done');
  assert.notEqual(lib.gateVerdict?.(lib.localRead?.(null, 'h'), 'h')?.state ?? 'x', 'done');
  assert.notEqual(lib.gateVerdict?.(lib.localRead?.({ finding_state: { complete: true }, meta: { coverage: { complete: true } } }, 'h'), 'h')?.state ?? 'x', 'done');
});

// Day 10: a blind reviewer (no Qodo review, no agent report) reviews the PR once Qodo's gate is met.
// Its word isn't enough either: a High or Medium blocks only if its repro test, run by the runner,
// fails on an assertion. Others go to the owner, like Lows. (Blind review found something Qodo
// didn't on Days 7, 8 and 9.)
const blind = (j, runs) => lib.blindVerdict?.(j, runs) ?? {};
const bf = (o) => ({ title: 'late device shows No match', severity: 'Medium', file: 'web/net.js', line: 10, why: 'x', repro: '.agent/blind/late.test.mjs', ...o });
const RED = { ok: false, out: 'not ok 1 - late\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal' };
test('blind: a Medium whose repro fails on an assertion blocks', () => {
  const b = blind({ findings: [bf()] }, { '.agent/blind/late.test.mjs': RED });
  assert.equal(b.state, 'fix'); assert.equal(b.blocking.length, 1);
});
test("blind: a repro that passes, crashes or is missing doesn't block: it goes to the owner", () => {
  for (const run of [{ ok: true, out: 'ok 1' }, { ok: false, out: 'SyntaxError: Unexpected token' }, { ok: false, out: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module" }, undefined]) {
    const b = blind({ findings: [bf()] }, run ? { '.agent/blind/late.test.mjs': run } : {});
    assert.equal(b.state, 'done', JSON.stringify(run)); assert.equal(b.flagged.length, 1); assert.deepEqual(b.blocking, []);
  }
});
test('blind: a repro outside .agent/blind/ or not a .test.mjs file is never run or trusted', () => {
  for (const repro of ['tests/net.test.mjs', '.agent/blind/../../x.test.mjs', '/tmp/x.test.mjs', '.agent/blind/x.js']) {
    const b = blind({ findings: [bf({ repro })] }, { [repro]: RED });
    assert.equal(b.state, 'done', repro); assert.deepEqual(lib.blindRepros?.({ findings: [bf({ repro })] }) ?? ['x'], [], repro);
  }
});
test('blind: a finding whose repro fails blocks whatever its label, since real bugs were labelled Low twice (Day 9, #95)', () => {
  assert.equal(blind({ findings: [bf({ severity: 'Low' })] }, { '.agent/blind/late.test.mjs': RED }).state, 'fix');
  assert.equal(blind({ findings: [bf({ severity: 'whatever' })] }, { '.agent/blind/late.test.mjs': RED }).state, 'fix');
  assert.equal(blind({ findings: [bf({ severity: 'Low', repro: undefined })] }, {}).state, 'done', 'a Low with no repro is only flagged');
});
test('blind: a clean review is done; no result at all is invalid, never clean', () => {
  assert.equal(blind({ findings: [] }, {}).state, 'done');
  for (const j of [null, {}, { findings: 'x' }]) assert.equal(blind(j, {}).state, 'invalid', JSON.stringify(j));
});

// Qodo's review of #107 (6242b87), each finding as a test before its fix
const runnerSrc = () => readFileSync(new URL('../scripts/agent-watch.mjs', import.meta.url), 'utf8');
test('#107 7645d535: a local review that exits non-zero is never clean, whatever it printed', () => {
  const clean = { ...fx('local-day8-A'), findings: [] };
  assert.equal(lib.gateVerdict?.(lib.localRead?.(clean, 'h', { status: 0 }), 'h')?.state, 'done');
  assert.notEqual(lib.gateVerdict?.(lib.localRead?.(clean, 'h', { status: 1 }), 'h')?.state ?? 'done', 'done');
  assert.notEqual(lib.gateVerdict?.(lib.localRead?.(clean, 'h', { status: null }), 'h')?.state ?? 'done', 'done');
});
test("#107 db31190a: a local review's own finding count and truncation flag reach the gate", () => {
  const r = fx('local-day8-A');
  assert.equal(lib.gateVerdict?.(lib.localRead?.({ ...r, finding_count: 5 }, 'h', { status: 0 }), 'h')?.state, 'incomplete');
  assert.equal(lib.gateVerdict?.(lib.localRead?.({ ...r, findings: [], qar_operation_result_truncated: true }, 'h', { status: 0 }), 'h')?.state, 'incomplete');
});
test('#107 9f37be8f: the Wisdom investigator may write only wisdom.json, and the runner puts the ticket back after it', () => {
  const src = runnerSrc(), wisdom = src.match(/const WISDOM = \{[\s\S]*?\n/)?.[0] || '';
  assert.match(wisdom, /Edit\(\/\$\{dir\}\/\.agent\/wisdom\.json\)/); assert.doesNotMatch(wisdom, /\.agent\/\*\*/);
  assert.match(src.match(/function wisdomCheck[\s\S]*?\n\}/)?.[0] || '', /putAgentFile\(s, 'ticket\.md', ticket\)/);
});
test('#107 03259bcb: a manual --post never turns a head green while its blind review is pending or failed', () => {
  const may = (st) => lib.mayPostSuccess?.(st);
  assert.equal(may([]), true, 'no blind review on this head (a PR made by hand): Qodo decides');
  assert.equal(may([{ context: 'blind-review', state: 'success' }]), true);
  assert.equal(may([{ context: 'blind-review', state: 'pending' }]), false);
  assert.equal(may([{ context: 'blind-review', state: 'failure' }, { context: 'blind-review', state: 'success' }]), false, 'the latest blind-review status counts');
  assert.equal(may([{ context: 'qodo-gate', state: 'failure' }, { context: 'blind-review', state: 'success' }]), true);
});
test("#107 5713b871: the blind review's result is published on the PR before the run is marked done", () => {
  const done = runnerSrc().match(/if \(b\.state === 'done'\) \{[\s\S]*?return stop\(n, s, L\.done/)?.[0] || '';
  assert.match(done, /publish\(n, s\)/);
});
test('#107 fe1405c2: local fix rounds start again after each push', () => {
  const push = runnerSrc().match(/const pushed = head\(s\);[\s\S]*?s\.phase = 'review'/)?.[0] || '';
  assert.match(push, /s\.localRounds = 0/);
});

// The blind review of #107 (d4ffccb): its repro, copied from .agent/blind/blind-status.test.mjs
test('blind review of #107: a blind review that reproduced a High is described as a High or Medium, not an unreadable label', () => {
  const blocking = [{ title: 'late device shows No match', severity: 'High', file: 'web/net.js', line: 10, why: 'x', repro: '.agent/blind/late.test.mjs' }];
  const { state, description } = lib.gateStatus?.({ state: 'fix', blocking, lows: [] }) ?? {};
  assert.equal(state, 'failure');
  assert.doesNotMatch(description ?? "label the gate can't read", /label the gate can't read/, description);
  assert.match(description ?? '', /1 High or Medium/, description);
});

// The blind review of #107 (23fbc47), round 3: its repro, copied from .agent/blind/blind-gap.test.mjs
test('blind review of #107 round 3: a head the runner pushed cannot be posted green before its blind review runs', () => {
  const push = runnerSrc().match(/function checkAndPush[\s\S]*?\nfunction openPr[\s\S]*?\n\}/)?.[0] || '';   // PR opening moved into openPr (#113)
  const statuses = /postBlind\(/.test(push)
    ? [{ context: 'blind-review', state: 'pending' }, { context: 'qodo-gate', state: 'pending' }]
    : [{ context: 'qodo-gate', state: 'pending' }];
  assert.equal(lib.mayPostSuccess?.(statuses), false, 'a runner-pushed head with no blind review yet may be posted green by --post');
});

// #96's first factory run (Day 10): its second test: commit added a browser test, but at that commit
// the first test: commit's unit tests still failed, so `npm test` (unit && browsers) never reached the
// browser test and the red check stopped the run for the wrong reason.
test('the red check runs the browser tests even when the unit tests fail', () => {
  const src = readFileSync(new URL('../scripts/agent-watch.mjs', import.meta.url), 'utf8');
  const red = src.match(/function proveRed[\s\S]*?\n\}/)?.[0] || '';
  assert.match(red, /npmTest\(dir, \{ bothSuites: true \}\)/);
  const npm = src.match(/function npmTest[\s\S]*?\n\}/)?.[0] || '';
  assert.match(npm, /test:unit; u=\$\?; node tests\/two-browser\.mjs; d=\$\?; node tests\/two-browser\.mjs --relay; r=\$\?/);
});

// The blind review of #110 (0c967b8): its repro, copied from .agent/blind/relay-hidden.test.mjs
test('blind review of #110: the red check runs the relay browser run even when the direct run fails', () => {
  const src = readFileSync(new URL('../scripts/agent-watch.mjs', import.meta.url), 'utf8');
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  const cmd = src.match(/bothSuites \? \['sh', '-c', '([^']+)'\]/)?.[1];
  assert.ok(cmd, 'bothSuites command not found');
  let expanded = cmd, prev;
  do { prev = expanded; expanded = expanded.replace(/npm run ([\w:]+)/g, (_, k) => `(${scripts[k]})`); } while (expanded !== prev);
  assert.doesNotMatch(expanded, /&&/, `a failing run still short-circuits the next one: ${expanded}`);
});

// Day 10: the factory survives a flaky test run and an incomplete Qodo review, and resumes before a push.
// Measured that day: the first-transfer timeout (#100) stopped a run and turned CI red 3 times, and
// 9 of 31 Qodo PR review runs on this repo were incomplete.
const F = (fails) => ({ ok: false, out: fails.join('\n'), fails });
test('a failed npm test that passes on an identical re-run is flaky: it goes on, and says so', () => {
  const first = F(['FAIL timed out after 90 s at two-browser.mjs:212']), r = lib.testRetry?.(first, { ok: true, out: '', fails: [] }) ?? {};
  assert.equal(r.ok, true); assert.equal(r.flaky, true); assert.match(r.note ?? '', /two-browser\.mjs:212/);
});
test('a failed npm test that fails again is a failure, with the second run\'s lines', () => {
  const r = lib.testRetry?.(F(['FAIL a']), F(['FAIL b'])) ?? { ok: true };
  assert.equal(r.ok, false); assert.deepEqual(r.fails, ['FAIL b']);
});
test('a passing npm test needs no re-run', () => {
  const r = lib.testRetry?.({ ok: true, out: '', fails: [] }) ?? {};
  assert.equal(r.ok, true); assert.equal(r.flaky, false);
});
test('an incomplete review: ask Qodo again once per head, wait for its new run, then stop', () => {
  const plan = (o) => lib.reaskPlan?.(o);
  assert.equal(plan({ head: 'h1', runId: 7 }), 'reask', 'first incomplete review of this head');
  assert.equal(plan({ head: 'h1', runId: 7, asked: { head: 'h1', run: 7 } }), 'wait', 'still the run it saw before asking');
  assert.equal(plan({ head: 'h1', runId: 8, asked: { head: 'h1', run: 7 } }), 'stop', 'the new run is incomplete too');
  assert.equal(plan({ head: 'h2', runId: 9, asked: { head: 'h1', run: 7 } }), 'reask', 'a new head gets its own ask');
});
test('an owner /agent retry on the ticket resumes a run that stopped before its first push', () => {
  const plan = (s, asks) => lib.resumePlan?.(s, asks, { retryRounds: 5 });
  const s = { phase: 'help', branch: 'agent/96-x', dir: '/w/96', retryRounds: 0, stoppedAt: '2026-11-22T22:00:00Z' }, at = '2026-11-22T23:00:00Z';
  assert.equal(plan(s, [{ retry: true, at }]), 'resume');
  assert.equal(plan({ ...s, pr: 112 }, [{ retry: true, at }]), null, 'a run with a PR goes the PR way');
  assert.equal(plan(s, [{ retry: false, text: 'do x', at }]), null, 'only a retry: there is no PR to read instructions from');
  assert.equal(plan(s, []), null);
  assert.equal(plan({ ...s, retryRounds: 5 }, [{ retry: true, at }]), 'limit');
  assert.equal(plan({ ...s, phase: 'done' }, [{ retry: true, at }]), null);
});

// Qodo's review and the blind review of #113 (63bf29a), each finding as a test before its fix
test('#113 355112c7: a re-run that fails with no failing lines keeps the first run\'s lines, and a note without lines falls back to the output', () => {
  const r = lib.testRetry?.(F(['FAIL a']), { ok: false, out: '', fails: [] }) ?? {};
  assert.deepEqual(r.fails, ['FAIL a']);
  const n = lib.testRetry?.({ ok: false, out: 'x\nkilled after 15 min', fails: [] }, { ok: true, out: '', fails: [] }) ?? {};
  assert.match(n.note ?? '', /killed after 15 min/);
});
test('blind review of #113: an /agent retry written before the run stopped never resumes it', () => {
  const s = { phase: 'help', branch: 'agent/96-x', dir: '/w/96', stoppedAt: '2026-11-22T22:00:00Z' };
  assert.equal(lib.resumePlan?.(s, [{ retry: true, at: '2026-11-22T21:00:00Z' }], { retryRounds: 5 }), null);
  assert.equal(lib.resumePlan?.(s, [{ retry: true, at: '2026-11-22T23:00:00Z' }], { retryRounds: 5 }), 'resume');
  assert.equal(lib.resumePlan?.({ ...s, stoppedAt: undefined }, [{ retry: true, at: '2026-11-22T23:00:00Z' }], { retryRounds: 5 }), null, 'no stop time recorded: never resume');
});
test('#113 44689d11: a resume waits while another PR is open', () => {
  const s = { phase: 'help', branch: 'agent/96-x', dir: '/w/96', stoppedAt: '2026-11-22T22:00:00Z' };
  assert.equal(lib.resumePlan?.(s, [{ retry: true, at: '2026-11-22T23:00:00Z' }], { retryRounds: 5 }, { openPr: 113 }), 'wait');
});
test('#113 39277034 and the blind review: a dry run neither records a re-ask nor uses up a retry', () => {
  const src = runnerSrc();
  const reask = src.match(/if \(plan === 'reask'\) \{[\s\S]*?\n          \}/)?.[0] || '';
  assert.match(reask, /if \(!DRY\) \{ s\.reasked/);
  const resume = src.match(/for \(const \{ number: n \} of openTickets\(L\.help\)\) \{[\s\S]*?process\.exit\(0\);\n  \}/)?.[0] || '';
  assert.match(resume, /if \(DRY\) \{ console\.log\(`DRY RUN would resume/);
});
test('#113 304ebe3f: a branch pushed without its PR gets the PR on retry, not "no new commits"', () => {
  const push = runnerSrc().match(/function checkAndPush[\s\S]*?\n\}/)?.[0] || '';
  assert.match(push, /if \(!s\.pr && s\.head && head\(s\) === s\.head\) return openPr\(n, s, why\);/);
});

// #96 on Day 10: the runner asked Qodo again with `/review`, and Qodo answered "Sorry, something went
// wrong ... Please try again manually by commenting /agentic_review on this PR." and never ran.
test('the runner asks Qodo again with the command Qodo names: /agentic_review', () => {
  assert.match(runnerSrc(), /'--body', '\/agentic_review'/);
  assert.doesNotMatch(runnerSrc(), /'--body', '\/review'/);
});

// #96 on Day 10: an /agent round whose agent couldn't start (expired sign-in, exit 1) still used up one
// of the 3 instruction rounds, so the owner's last round was refused.
test("an /agent round whose agent run didn't finish and committed nothing doesn't count", () => {
  assert.equal(lib.roundCounts?.({ finished: false, committed: false }), false);
  assert.equal(lib.roundCounts?.({ finished: false, committed: true }), true, 'it changed something: it counts');
  assert.equal(lib.roundCounts?.({ finished: true, committed: false }), true, 'it ran and chose not to change anything: it counts');
});
test('the owner round gives its count back when the agent run didn\'t finish', () => {
  const src = runnerSrc();
  assert.match(src, /e\.unfinished = true/);
  assert.match(src, /roundCounts\(\{ finished: !e\.unfinished, committed: head\(s\) !== before \}\)/);
});

// Qodo's review and the blind review of #115 (984df74), each finding as a test before its fix
test('#115 6b83a02c and the blind review: a run the machine check stopped before it started is unfinished', () => {
  assert.match(runnerSrc(), /const m = machineCheck\(\); if \(!m\.ok\) \{ const e = new Stop\(m\.why\); e\.unfinished = true; throw e; \}/);
});

// #115, round 2: quoting Qodo's reason kept picking the wrong comment (Qodo edits its comments in place,
// for later heads), and missed the "Sorry" reply on the timeout path (Qodo and the blind review on
// #115). Both stops now link to Qodo's latest comment on the PR instead of quoting it.
test("an incomplete-review stop links to Qodo's latest comment instead of quoting one", () => {
  const src = runnerSrc();
  assert.doesNotMatch(src, /qodoReason/);
  assert.equal((src.match(/\$\{qodoLatest\(s\.pr\)\}/g) || []).length, 2, 'both stops, the second incomplete review and the timeout');
});

// Day 10: every Qodo PR review of a factory branch that had local findings came back incomplete,
// "Qodo could not verify all local findings on this PR." (8 of 8 runs on #112 and #116; 0 of 18 on
// PRs without). The gate accepts that one stated reason, and only when everything else holds.
const LINE = 'Qodo could not verify all local findings on this PR.';
const acc = (o) => lib.acceptLocalOnly?.(o) ?? { ok: true };
const incomplete = (r) => ({ ...r, review_session: { ...r.review_session, review_complete: false } });
const reviewOf = (head, extra = '', at = Date.parse('2099-01-01')) => ({ reviewed: head, at, body: `<h3>Code Review by Qodo</h3> findings <!-- qodo-daily-tip:end -->${extra}\n\n${LINE}\n<!-- https://github.com/x/commit/${head} -->` });
test('an incomplete review whose only stated reason is the local findings is accepted when everything else holds', () => {
  const r = incomplete(fx('pr-87')), h = HEAD(r), a = acc({ read: r, head: h, review: reviewOf(h), ciOk: true });
  assert.equal(a.ok, true); assert.equal(a.g?.state, 'done');
});
test('it is never accepted without that exact reason on this head, with CI red or not finished, or with a High or Medium open', () => {
  const r = incomplete(fx('pr-87')), h = HEAD(r);
  assert.equal(acc({ read: r, head: h, review: { reviewed: h, body: 'no reason given' }, ciOk: true }).ok, false, 'no reason');
  assert.equal(acc({ read: r, head: h, review: reviewOf('f'.repeat(40)), ciOk: true }).ok, false, 'the reason is for another head');
  assert.equal(acc({ read: r, head: h, review: { reviewed: h, body: 'Qodo could not verify all findings on this PR.' }, ciOk: true }).ok, false, 'another reason');
  assert.equal(acc({ read: r, head: h, review: reviewOf(h), ciOk: false }).ok, false, 'CI not green');
  const med = { ...r, finding_count: r.findings.length + 1, findings: [...r.findings, { id: 'med00001', title: 'm', action_level: 'remediation_recommended', attribution_status: 'pending', git_sha: h }] };
  assert.equal(acc({ read: med, head: h, review: reviewOf(h), ciOk: true }).ok, false, 'a Medium is open');
  assert.equal(acc({ read: { ...r, review_session: { ...r.review_session, status: 'started' } }, head: h, review: reviewOf(h), ciOk: true }).ok, false, 'still running');
  assert.equal(acc({ read: { ...r, review_session: { ...r.review_session, commit_sha: 'e'.repeat(40) } }, head: h, review: reviewOf(h), ciOk: true }).ok, false, 'a review of another commit');
  assert.equal(acc({ read: fx('pr-87'), head: h, review: reviewOf(h), ciOk: true }).ok, false, 'a complete review needs no exception');
});

// Day 10: the owner's own merge into main during an agent run stopped #96 ("Something changed on GitHub").
test("the GitHub footprint watches the run's own branch and the branch names, not every branch's commit", () => {
  const fp = runnerSrc().match(/const footprint = \(s\) => JSON\.stringify\(\{[\s\S]*?\}\);/)?.[0] || '';
  assert.match(fp, /ls-remote', '--heads', 'origin', s\.branch/); assert.match(fp, /names:/);
  assert.doesNotMatch(fp, /refs: sh\('git', \['ls-remote', '--heads', 'origin'\]/);
});
// Day 10: a round the agent stopped by the stopping rule was reported as "judged none valid".
test("a review round with no commit says the agent made no change and points to its report, without claiming why", () => {
  assert.doesNotMatch(runnerSrc(), /The agent judged none of the/);
  assert.match(runnerSrc(), /The agent made no commit for the/);
});

// Qodo's review and the blind review of #117 (afa986c), each finding as a test before its fix
test('#117 70c0b9f1 and the blind review: the local-findings reason must be the only one, in a comment updated after this review run started', () => {
  const r = incomplete(fx('pr-87')), h = HEAD(r);
  assert.equal(acc({ read: r, head: h, review: reviewOf(h, '\n\nQodo could not complete the security review on this PR.'), ciOk: true }).ok, false, 'a second stated reason');
  assert.equal(acc({ read: r, head: h, review: reviewOf(h, '\n\nSorry, something went wrong'), ciOk: true }).ok, false, 'an error alongside it');
  assert.equal(acc({ read: { ...r, review_session: { ...r.review_session, started_at: '2026-11-23T10:00:00Z' } }, head: h, review: reviewOf(h, '', Date.parse('2026-11-23T09:00:00Z')), ciOk: true }).ok, false, 'the comment is older than this review run');
});
test('#117 ba2f8c9a: qodo-gate.mjs applies the same rule, so a manual --post agrees with the runner', () => {
  const g = readFileSync(new URL('../scripts/qodo-gate.mjs', import.meta.url), 'utf8');
  assert.match(g, /acceptLocalOnly\(/); assert.match(g, /export function ciPassed/); assert.match(g, /export function reviewComment/);
  assert.match(runnerSrc(), /import \{[^}]*ciPassed[^}]*reviewComment[^}]*\} from '\.\/qodo-gate\.mjs'/);
});
test("#117 8186b50b and 489b96bb: CI counts only GitHub's latest npm test run, and only when it finished green", () => {
  const g = readFileSync(new URL('../scripts/qodo-gate.mjs', import.meta.url), 'utf8');
  assert.match(g, /filter=latest/); assert.match(g, /runs\.length > 0 && runs\.every\(\(c\) => c\.status === 'completed' && c\.conclusion === 'success'\)/);
});

// Qodo's review and the blind review of #117 (c69f5b7), round 2
test("#117 blind round 2: any other line in Qodo's notice section keeps the review incomplete, however it's phrased", () => {
  const r = incomplete(fx('pr-87')), h = HEAD(r);
  const body = (extra) => `<h3>Code Review by Qodo</h3> findings <!-- qodo-daily-tip:end -->\n\n${LINE}${extra}\n\n<!-- https://github.com/x/commit/${h} -->`;
  assert.equal(acc({ read: r, head: h, review: { reviewed: h, at: Date.parse('2099-01-01'), body: body('') }, ciOk: true }).ok, true);
  assert.equal(acc({ read: r, head: h, review: { reviewed: h, at: Date.parse('2099-01-01'), body: body('\nQodo failed to review 3 files on this PR.') }, ciOk: true }).ok, false);
  assert.equal(acc({ read: r, head: h, review: { reviewed: h, at: Date.parse('2099-01-01'), body: `<h3>Code Review by Qodo</h3> ${LINE} <!-- https://github.com/x/commit/${h} -->` }, ciOk: true }).ok, false, 'no notice section where Qodo puts it: not accepted');
});
test('#117 blind round 2 (Low): a review run with no start time is never accepted', () => {
  const r = incomplete(fx('pr-87')), h = HEAD(r);
  assert.equal(acc({ read: { ...r, review_session: { ...r.review_session, started_at: undefined } }, head: h, review: reviewOf(h), ciOk: true }).ok, false);
});
test("#117 f364e7d1: CI still running is a wait, not a refusal", () => {
  const r = incomplete(fx('pr-87')), h = HEAD(r), a = acc({ read: r, head: h, review: reviewOf(h), ciOk: 'pending' });
  assert.equal(a.ok, false); assert.equal(a.wait, true);
  assert.match(runnerSrc(), /if \(a\.wait\) \{/);
});

// Day 10 (#21): every valid High or Medium was fixed, so each fix opened the next finding and the loop
// didn't converge. A finding is fixed only if this branch introduced it (its repro passes on main and
// fails on the branch) or it's one of the ticket's acceptance cases. Anything else is deferred.
const SCOPE_RED = { ok: false, out: 'not ok 1\n  AssertionError [ERR_ASSERTION]: x' }, PASS = { ok: true, out: 'ok 1' }, CRASH = { ok: false, out: "SyntaxError: The requested module '../../web/net.js' does not provide an export named 'x'" };
const sp = (entries, b, m, ids = entries.map((e) => e.id)) => lib.scopePlan?.(ids, { entries }, b, m) ?? {};
const ent = (o) => ({ id: 'f1', repro: '.agent/scope/f1.test.mjs', acceptance: false, owner: '#24', ...o });
test('scope: a finding this branch introduced is fixed (passes on main, fails here)', () => {
  const p = sp([ent()], { '.agent/scope/f1.test.mjs': SCOPE_RED }, { '.agent/scope/f1.test.mjs': PASS });
  assert.deepEqual(p.fix, ['f1']); assert.deepEqual(p.defer, []);
});
test("scope: a repro that can't even load on main is about new code, so it's fixed", () => {
  assert.deepEqual(sp([ent()], { '.agent/scope/f1.test.mjs': SCOPE_RED }, { '.agent/scope/f1.test.mjs': CRASH }).fix, ['f1']);
});
test('scope: a pre-existing finding (fails on main too) outside the acceptance is deferred to its owner', () => {
  const p = sp([ent()], { '.agent/scope/f1.test.mjs': SCOPE_RED }, { '.agent/scope/f1.test.mjs': SCOPE_RED });
  assert.deepEqual(p.fix, []); assert.equal(p.defer[0]?.id, 'f1'); assert.equal(p.defer[0]?.owner, '#24');
});
test('scope: a pre-existing finding that is an acceptance case is still fixed', () => {
  assert.deepEqual(sp([ent({ acceptance: true })], { '.agent/scope/f1.test.mjs': SCOPE_RED }, { '.agent/scope/f1.test.mjs': SCOPE_RED }).fix, ['f1']);
});
test("scope: a repro that doesn't fail on the branch isn't evidence; the finding stays open for the owner", () => {
  const p = sp([ent()], { '.agent/scope/f1.test.mjs': PASS }, { '.agent/scope/f1.test.mjs': PASS });
  assert.deepEqual(p.fix, []); assert.deepEqual(p.defer, []); assert.deepEqual(p.unproven, ['f1']);
});
test('scope: a finding the agent gave no scope entry for, or an unsafe repro path, is fixed as before', () => {
  assert.deepEqual(sp([], {}, {}, ['f9']).fix, ['f9']);
  assert.deepEqual(sp([ent({ repro: '../x.test.mjs' })], {}, {}).fix, ['f1']);
});
test('scope: an owner that is not a ticket number is recorded as unassigned', () => {
  assert.equal(sp([ent({ owner: 'someone' })], { '.agent/scope/f1.test.mjs': SCOPE_RED }, { '.agent/scope/f1.test.mjs': SCOPE_RED }).defer[0]?.owner, null);
});
test('every fix round (local review, Qodo PR review, blind review) goes through the scope check first', () => {
  const src = runnerSrc();
  for (const kind of ['local', 'pr', 'blind']) assert.match(src, new RegExp(`scopeCheck\\(n, s, [\\s\\S]{0,400}?'${kind}'\\)`), kind);
});

// Qodo's review of #120 (1b5cafe), each finding as a test before its fix
test('#120 29c2bc77 and a05bf49e: blind findings go through the scope agent too, which judges acceptance and copies repros with their helpers', () => {
  const sc = runnerSrc().match(/function scopeCheck[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(sc, /items\.every\(\(f\) => f\.repro\)/); assert.match(SCOPE_PROMPT_SRC(), /already has a repro/);
});
function SCOPE_PROMPT_SRC() { return runnerSrc().match(/const SCOPE_PROMPT = [\s\S]*?`;/)?.[0] || ''; }
test('#120 76614eeb: when every blind finding is deferred, blind-review is posted as success', () => {
  assert.match(runnerSrc(), /postBlind\(prHead, \{ state: 'success', description: `Nothing this branch introduced/);
});
test('#120 19be3a47: a local finding\'s review id is read from either shape, and one without an id is never deferred', () => {
  const sc = runnerSrc();
  assert.match(sc, /f\.local_review_id \|\| local\.ids\[f\.id\]/); assert.match(sc, /if \(kind === 'local' && !it\?\.localReviewId\) return false;/);
});
test('#120 14fb16a8: a deferral counts only when Qodo says the finding was dismissed', () => {
  assert.match(lib.dismissedOk?.('{"results":{"a":{"status":"dismissed","reconciled":true}}}', 'a') ? 'ok' : 'no', /ok/);
  assert.equal(lib.dismissedOk?.('{"results":{"a":{"status":"conflict","reconciled":false}}}', 'a'), false);
  assert.equal(lib.dismissedOk?.('not json', 'a'), false);
});
test('#120 f08bd064: a scope entry whose repro file was never written counts as no entry', () => {
  assert.match(runnerSrc(), /existsSync\(join\(s\.dir, e\.repro\)\)/);
});
test('#120 cd258e23: the fix round sees only the in-scope findings, and is told which were deferred', () => {
  assert.match(runnerSrc(), /writeReview\(s, q && q\.reviewed === s\.head \? \{ \.\.\.q, open: q\.open\.filter/);
  assert.match(runnerSrc(), /Deferred, don't fix these/);
});
test('#120 f35d5586: the review-round limit is checked after the scope check', () => {
  const src = runnerSrc(), sc = src.indexOf("'pr');"), lim = src.indexOf('High or Medium findings still open after');
  assert.ok(sc > 0 && lim > sc, 'scope check before the limit');
});
test('#120 fe9292c1: each deferral proof names its head and titles in its first line', () => {
  assert.match(runnerSrc(), /\*\*Deferred by the scope rule\*\* \(\$\{kind\}, \$\{s\.head\.slice\(0, 7\)\}\): \$\{plan\.defer\.map/);
});
// Qodo's review of #120 (6c87d91), round 2
test('#120 98f185aa: the deferral asks Qodo for JSON', () => {
  assert.match(runnerSrc(), /'pr-review-session', 'dismiss', '--json', '--finding-ids'/);
});
test("#120 b5119c30: the owner's /agent rounds skip the local scope check", () => {
  const src = runnerSrc();
  assert.match(src, /if \(local\.g\.state === 'fix' && !ownerRound\) \{/);
  assert.match(src, /checkAndPush\(n, s, 'owner comment', \{ ownerRound: true \}\)/);
});

// #121, from the blind review of #120: a blind finding the runner had already reproduced, whose
// scope copy didn't fail, was dropped and blind-review went green.
test('#121: a blind finding the scope copy does not reproduce stays blocking', () => {
  const src = runnerSrc(), start = src.indexOf('const bplan = scopeCheck('), end = src.indexOf("postBlind(prHead, { state: 'success', description: `Nothing this branch introduced", start);
  assert.ok(start > 0 && end > start, 'blind scope block found');
  assert.match(src.slice(start, end), /bplan\.fix\.includes\(`blind-\$\{i\}`\) \|\| bplan\.unproven\.includes\(`blind-\$\{i\}`\)/);
});
// The blind review of #122 (1d917a8): a bad scope copy that fails everywhere could defer a reproduced blind finding
test("#122: a blind finding is judged on main by the blind review's own repro, not the scope agent's copy", () => {
  const p = lib.scopePlan?.(['blind-0'], { entries: [{ id: 'blind-0', repro: '.agent/blind/late.test.mjs', acceptance: false, owner: '#24' }] }, { '.agent/blind/late.test.mjs': SCOPE_RED }, { '.agent/blind/late.test.mjs': PASS }) ?? {};
  assert.deepEqual(p.fix, ['blind-0'], 'introduced: its own repro passes on main');
  assert.match(runnerSrc(), /if \(f\.repro\) e\.repro = f\.repro;   \/\/ the blind review's own repro/);
});
test('#122 (blind Low): a blind repro that fails on main too is deferred, so its path is accepted as a repro', () => {
  const p = lib.scopePlan?.(['blind-0'], { entries: [{ id: 'blind-0', repro: '.agent/blind/late.test.mjs', acceptance: false, owner: '#24' }] }, { '.agent/blind/late.test.mjs': SCOPE_RED }, { '.agent/blind/late.test.mjs': SCOPE_RED }) ?? {};
  assert.equal(p.defer?.[0]?.id, 'blind-0'); assert.deepEqual(p.fix, []);
});
