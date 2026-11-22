// Pure helpers for scripts/agent-watch.mjs: no GitHub, git or files, so they can be unit tested
// (tests/runner-lib.test.mjs).

// The names of the tests a diff adds: test('…') in unit files, and the message of check(…, '…') in
// the two-browser test. A check() call can wrap across lines and its condition can hold strings,
// regular expressions and comments, so the message is its last argument, found by reading the call
// to its closing bracket. Each hunk is read on its own, so a call can't be closed by an unrelated
// edit. Template literals count up to their first ${…}.
export function testNames(diff) {
  const names = new Set();
  for (const text of hunks(diff)) {
    for (const m of text.matchAll(/\btest\(\s*(['"`])((?:(?!\1)[^\n])+?)\1/g)) names.add(m[2]);
    for (const m of text.matchAll(/(?<![\w.$])check\(/g)) {
      const last = lastArgument(text, m.index + m[0].length);
      const q = last && /^(['"`])/.exec(last);
      if (q) names.add(last.slice(1).split(q[1])[0]);
    }
  }
  return [...names].map((x) => x.split('${')[0].split('\\')[0].trim()).filter((x) => x.length >= 8);
}
// the added lines of each hunk, joined (a hunk starts at "@@" or a new file)
function hunks(diff) {
  const out = []; let cur = [];
  for (const l of diff.split('\n')) {
    if (l.startsWith('@@') || l.startsWith('diff --git')) { if (cur.length) out.push(cur.join('\n')); cur = []; }
    else if (l.startsWith('+') && !l.startsWith('+++')) cur.push(l.slice(1));
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}
// the text of the last top-level argument of a call whose arguments start at `from`. Skips strings,
// comments and regular-expression literals, so a bracket or comma inside them doesn't count.
function lastArgument(text, from) {
  let depth = 1, start = from, prev = '(';
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(text, i); prev = c; continue; }
    if (c === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i < 0) return null; continue; }
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2) + 1; if (i <= 0) return null; continue; }
    if (c === '/' && /[(,=:[!&|?{};]/.test(prev)) { i = skipRegex(text, i); prev = '/'; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (--depth === 0) return stripComments(text.slice(start, i)).trim(); }
    else if (c === ',' && depth === 1) start = i + 1;
    if (!/\s/.test(c)) prev = c;
  }
  return null;
}
function skipString(text, i) {
  const q = text[i];
  for (i++; i < text.length; i++) { if (text[i] === '\\') i++; else if (text[i] === q) return i; }
  return text.length;
}
function skipRegex(text, i) {
  let inClass = false;
  for (i++; i < text.length && text[i] !== '\n'; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '[') inClass = true;
    else if (text[i] === ']') inClass = false;
    else if (text[i] === '/' && !inClass) return i;
  }
  return i;
}
const stripComments = (t) => t.replace(/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/g, '');

// Failures of the named tests that are assertions, not crashes: a unit test's ✖ block must hold an
// AssertionError. A two-browser FAIL line comes from check(), which is an assertion by construction.
export function assertionFailures(out, names) {
  const lines = out.split('\n'), hits = [];
  lines.forEach((l, i) => {
    if (!names.some((nm) => l.includes(nm))) return;
    if (/^FAIL /.test(l)) return hits.push(l);
    if (!/^\s*✖ /.test(l)) return;
    const end = lines.findIndex((x, j) => j > i && /^\s*(✖|✔|ℹ) /.test(x));
    if (lines.slice(i + 1, end < 0 ? i + 20 : end).some((x) => /AssertionError/.test(x))) hits.push(l.trim());
  });
  return [...new Set(hits)];
}

// Qodo's titles come HTML-escaped (isn&#x27;t)
export const decodeEntities = (t) => t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// An owner's /agent comment: `/agent retry` re-runs the runner's checks with no agent run.
// Anything else is an instruction for the agent.
export const parseAsk = (body) => (/^\/agent\s+retry\s*$/i.test(body.trim()) ? { retry: true } : { retry: false, text: body.trim().replace(/^\/agent\s+/i, '') });

// /agent retry: re-check and push when the branch has commits Qodo hasn't seen, otherwise wait for its review again
export const retryPlan = (head, pushed) => (head !== pushed ? 'push' : 'wait');

// After an owner-comment round: check and push what the agent committed. If it committed nothing,
// that's its verdict on the request ("already done", "not safe"), so the run stops and asks the
// owner, even if a retry came with it: waiting here could mark the run done with the request undone.
export const afterOwnerRound = ({ committed }) => (committed ? 'check' : 'stop');

// Files in .agent/ that describe the last run and must go before the next one: a stop file left by
// an earlier agent run would otherwise stop the next round at once. test-output.txt is written just
// before a fix-tests run, so it's only cleared when the owner reopens a run.
export const staleFiles = (when) => (when === 'reopen' ? ['stop.md', 'test-output.txt'] : ['stop.md']);

// What to publish, read from the PR itself rather than from a count, so a run saved by an older
// runner or a post interrupted halfway is never repeated. Every proof goes in the description; each
// one after the first (which the PR opened with) is also posted as a comment. A proof is found by
// its first line, which names its commit range.
// `show` is how the runner shows text on GitHub (publicText), so a proof is looked for as it was posted.
export function publishPlan(proofs, prBody, commentBodies, show = (t) => t) {
  const head = (p) => show(p).split('\n')[0];
  return {
    updateBody: proofs.some((p) => !(prBody || '').includes(head(p))),
    comment: proofs.slice(1).filter((p) => !commentBodies.some((b) => b.startsWith(head(p)))),
  };
}

// Reads a paged GitHub list to the end (pages of 100), so nothing past the first page is missed.
export function allPages(fetchPage) {
  const all = [];
  for (let page = 1; ; page++) { const p = fetchPage(page); all.push(...p); if (p.length < 100) return all; }
}

// /agent retry only re-runs the runner's checks (no agent), so it has its own limit and doesn't
// use up the rounds for instructions.
export const roundKind = (ask) => (ask.retry ? 'retry' : 'instruction');

// How a batch of /agent comments is spent. The batch is always marked read (consume), even when a
// limit is reached, or the same comment would reopen and stop the run on every tick. Limits count
// rounds of work: one batch is one round, so retries queued together cost one retry.
export function askPlan({ asked, commentRounds, retryRounds, limits }) {
  const kind = asked.some((a) => roundKind(a) === 'instruction') ? 'instruction' : 'retry';
  const r = { consume: true, kind, commentRounds, retryRounds };
  if (kind === 'instruction' && commentRounds >= limits.commentRounds) return { ...r, stop: `The /agent instruction limit (${limits.commentRounds}) is used up.` };
  if (kind === 'retry' && retryRounds >= limits.retryRounds) return { ...r, stop: `The /agent retry limit (${limits.retryRounds}) is used up.` };
  return kind === 'instruction' ? { ...r, commentRounds: commentRounds + 1 } : { ...r, retryRounds: retryRounds + 1 };
}

// Rule 7: the GitHub list reads in the runner's source that stop at one page. A REST list (comments,
// events, blocked_by, /issues, /pulls) must be the callback of allPages((page) => …), not just have a
// page number in its URL. gh's own list commands stop at 30, so they need an explicit --limit.
// Returns "line N: code" for each.
export function unpagedReads(src) {
  const bad = [];
  src.split('\n').forEach((line, i) => {
    const at = `line ${i + 1}: ${line.trim().slice(0, 100)}`;
    if (/\bgh(Json)?\('(issue|pr|label|project)',\s*'(list|item-list)'/.test(line) && !/'--limit'/.test(line)) bad.push(at);
    for (const m of line.matchAll(/ghJson\('api',\s*`repos\/\$\{REPO\}\/([^`]*)`/g)) {
      const path = m[1].split('?')[0];
      const isList = /\/(comments|events|blocked_by)$/.test(path) || /^(issues|pulls)$/.test(path);
      const paged = /allPages\(\(page\)\s*=>\s*$/.test(line.slice(0, m.index)) && /page=\$\{page\}/.test(m[1]);
      if (isList && !paged) bad.push(at);
    }
  });
  return [...new Set(bad)];
}

// The quality gate (work-ticket skill, "Quality gate"), decided from Qodo's stored review
// (`qodo read pr-review-session findings`), read fresh each time rather than from a saved note.
// Qodo's action levels are its severity labels, as its PR comments show them (#87, #89).
export const SEVERITY = { action_required: 'High', remediation_recommended: 'Medium', informational: 'Low' };
const OPEN = new Set(['pending', 'partial_implementation', 'not_implemented', 'focus_areas_edited']);
const CLOSED = new Set(['implemented', 'full_implementation', 'dismissed', 'detected_after_merge', 'outdated']);
export const severityOf = (f) => SEVERITY[f.action_level] || 'unknown';
// state: 'wait' (no finished review of this head yet), 'incomplete' (Qodo's review of the head was
// skipped, partial or read only in part: never counts as done), 'fix' (an open High, Medium or
// unreadable finding), or 'done' (only Lows open, and they are listed for the owner).
// A finding with a label or status the gate can't read blocks: it is never treated as Low.
export function gateVerdict(read, head, { prHead } = {}) {
  if (prHead && prHead !== head) return { state: 'moved', why: `the PR's head is ${prHead.slice(0, 7)}, not ${head.slice(0, 7)}, the commit the runner pushed and Qodo reviewed` };
  if (read?.readError) return { state: 'wait', why: `Qodo's review couldn't be read (${read.readError})` };
  const r = read?.review_session;
  if (!r || r.commit_sha !== head || r.status === 'started') return { state: 'wait', why: `Qodo hasn't finished a review of ${head.slice(0, 7)} yet` };
  if (r.status !== 'completed') return { state: 'incomplete', why: `Qodo's review of ${head.slice(0, 7)} was ${r.status}` };
  if (r.review_complete !== true) return { state: 'incomplete', why: `Qodo's review of ${head.slice(0, 7)} is not complete` };
  if (read.qar_operation_result_truncated) return { state: 'incomplete', why: "Qodo's findings were only read in part" };
  if (!Array.isArray(read.findings) || (Number.isInteger(read.finding_count) && read.finding_count !== read.findings.length))
    return { state: 'incomplete', why: `Qodo's read claims ${read.finding_count ?? '?'} findings but returned ${Array.isArray(read.findings) ? read.findings.length : 'none'}` };
  const open = read.findings.filter((f) => !CLOSED.has(f.attribution_status));
  const unreadable = (f) => !OPEN.has(f.attribution_status) || severityOf(f) === 'unknown';
  const blocking = open.filter((f) => unreadable(f) || severityOf(f) !== 'Low'), lows = open.filter((f) => !blocking.includes(f));
  return blocking.length ? { state: 'fix', blocking, lows } : { state: 'done', blocking, lows };
}

// Qodo's type for each finding (Bug, Rule violation, Requirement gap...), by title. The stored review
// doesn't carry it; Qodo's PR comment shows it after each numbered title.
export function findingTypes(commentBody) {
  const text = decodeEntities((commentBody || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const out = {};
  for (const m of text.matchAll(/\d+\.\s+(.+?)\s+(?:🐞|📘|📎|📜|🔗) (Bug|Rule violation|Requirement gap|Skill insight|Cross-repo conflict)\b/gu)) out[m[1].trim()] = m[2];
  return out;
}
const where = (f) => (f.location?.file_path ? ` (${f.location.file_path}${f.location.start_line ? `:${f.location.start_line}` : ''})` : '');
const firstSentence = (t) => ((t || '').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0] || '').slice(0, 240);
const named = (f, types) => { const t = decodeEntities(f.title); return `${severityOf(f)} · ${types[t] ? `${types[t]} · ` : ''}${t}${where(f)}`; };
// The Lows the gate flags for the owner: each with its type, place and what Qodo says it is (its
// first sentence), so the owner can decide without opening Qodo. Empty when there are none.
export function lowsReport(g, types = {}) {
  if (!g.lows.length) return '';
  return '\n\n**Low findings for you** (not fixed, by the quality gate):\n' +
    g.lows.map((f) => `- ${named(f, types)}: ${decodeEntities(firstSentence(f.description))}`).join('\n');
}
// The gate's part of the agent's review file: each finding to fix in full (place and Qodo's whole
// description), even when Qodo's rendered comment hasn't caught up yet, and the Lows to flag.
export function gateSection(g, types = {}) {
  const full = (f) => `### ${named(f, types)}\n${decodeEntities(f.description || '(no description in Qodo\'s review)')}`;
  return `## Quality gate\nFix these if valid (High or Medium, or a label the gate couldn't read):\n\n${g.blocking.map(full).join('\n\n') || 'none'}\n\n` +
    `Don't fix these Lows. List each in your report for jtbinith:\n${g.lows.map((f) => `- ${named(f, types)}: ${decodeEntities(firstSentence(f.description))}`).join('\n') || 'none'}\n\n`;
}
// The first line of the runner's comment on the ticket. A stopped run says NOT DONE first.
export const stopTitle = (label) => (label === 'agent-done' ? '**Factory run finished.**' : '**NOT DONE.** The factory run stopped and needs you.');

// Text the runner posts on GitHub (comments, PR title and body) with this machine's home path
// shown as ~, and any other part of it (the username, a domain folder) hidden. A crash message or
// a log path put the full path into two public comments (#41, #61). Case matters, and only whole
// words are hidden, so ordinary words are left alone.
export function publicText(text, { home, user }) {
  if (!text || !home) return text;
  let out = text.split(home).join('~');
  const parts = [...new Set([...home.split('/').filter((p) => p && p !== 'home'), user].filter((p) => p && p.length >= 3))];
  for (const p of parts) out = out.replace(new RegExp(`(?<![\\w.-])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), '<redacted>');
  return out;
}
