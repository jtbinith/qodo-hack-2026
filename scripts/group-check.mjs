// The group-device-check skill's runner (.claude/skills/group-device-check/SKILL.md).
// Opens a build of the app in N headless Chromium windows on 127.0.0.1, joins them with the real
// orbs (each window drags its own orb to the shared edge, both let go together), runs a scenario's
// steps and compares what each window shows with the ticket's expected text.
//
//   node scripts/group-check.mjs --app <checkout of the build> --scenario <file.json> --out <empty dir> [--absent <i>]
//
// --absent <i> opens device i in a different room (a device left out), to check the stop.
// Exit: 0 pass, 1 fail, 2 couldn't run (stop). Writes <out>/facts.json and a screenshot per
// device per check point (room code blurred out of the page before each shot).
import { chromium } from 'playwright';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SIZES, EXIT, scenarioProblems, sameText, verdict, joinProblems, insideRoot, sharedBytesProblems } from './group-check-lib.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const APP = resolve(arg('--app') || '.'), OUT = arg('--out'), SCEN = arg('--scenario'), ABSENT = arg('--absent');
const stop = (why) => { console.log(`STOP: ${why}`); if (OUT && existsSync(OUT)) writeFileSync(join(OUT, 'facts.json'), JSON.stringify({ verdict: { state: 'stop', why } }, null, 1)); process.exit(EXIT.stop); };
if (!OUT) stop('no --out folder given');
if (existsSync(OUT) && readdirSync(OUT).length) stop(`the evidence folder ${OUT} isn't empty`);
mkdirSync(OUT, { recursive: true });
if (!SCEN || !existsSync(SCEN)) stop('no --scenario file given');
if (!existsSync(join(APP, 'web', 'index.html'))) stop(`${APP} has no web/index.html: --app must be a checkout of the build`);
let s; try { s = JSON.parse(readFileSync(SCEN, 'utf8')); } catch (e) { stop(`the scenario isn't valid JSON: ${e.message}`); }
const problems = scenarioProblems(s); if (problems.length) stop(`the scenario has problems: ${problems.join('; ')}`);
const commit = (() => { try { return execFileSync('git', ['-C', APP, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();

// web/ of the build under test, on 127.0.0.1 only (never on the network)
const ROOT = join(APP, 'web') + '/', ROOT_REAL = realpathSync(ROOT) + '/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let f; try { f = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '') || 'index.html'); } catch { return res.writeHead(400).end(); }
  if (!f.startsWith(ROOT)) return res.writeHead(403).end();
  let real; try { real = realpathSync(f); } catch { return res.writeHead(404).end(); }
  if (!insideRoot(ROOT_REAL, real)) return res.writeHead(403).end();   // a symlink out of web/ (Qodo on #145)
  try { res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }).end(readFileSync(real)); } catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', code = () => [...randomBytes(10)].map((b) => ALPHABET[b & 31]).join('');
const room = code(), other = code();
const base = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch();
const sha = (b) => createHash('sha256').update(b).digest('hex');
// a stand-in share sheet for phone-size windows (headless Chromium has none): "fail-once" rejects
// the first share with NotAllowedError, as a phone does when the tap no longer counts, then works
// "hang-then-works" / "hang-then-cancel" hang their first call for hangMs, then settle (works, or
// AbortError as when the person cancels): a sheet that outlives the app's timeout (Qodo on #130)
const shareStub = (mode, hangMs = 0) => `(() => { const s = window.__shares = []; let first = ${mode === 'fail-once'}, hang = ${/^hang-then-/.test(mode) ? Number(hangMs) : 0}; const cancel = ${mode === 'hang-then-cancel'};
  navigator.canShare = () => true;
  const h = window.__sharedHashes = [];
  let open = false;   // a real browser refuses a second share while one is open (Qodo on #149)
  navigator.share = async ({ files }) => {
    if (open) throw new DOMException('a share is already in progress', 'InvalidStateError');
    open = true; try {
    // the bytes handed over, so the check can compare them with what the sender holds; the call is
    // recorded only once they're hashed, so a check never reads a call without its hashes (Qodo on #145)
    const hashed = await Promise.all(files.map(async (f) => { try { return [f.name, [...new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('')]; } catch { return [f.name, null]; } }));
    s.push(files.map((f) => f.name)); h.push(hashed);
    if (first) { first = false; throw new DOMException('not allowed', 'NotAllowedError'); }
    if (hang) { const ms = hang; hang = 0; await new Promise((r) => setTimeout(r, ms)); if (cancel) throw new DOMException('cancelled', 'AbortError'); }
    } finally { open = false; } }; })();`;
const dev = [];
for (const [i, d] of s.devices.entries()) {
  const [w, h] = SIZES[d.size];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  if (d.share) await page.addInitScript(shareStub(d.share, d.hangMs));
  const downloads = []; page.on('download', async (dl) => { const p = join(OUT, `dl-${i}-${downloads.length}-${dl.suggestedFilename()}`); downloads.push({ name: dl.suggestedFilename(), path: p, done: dl.saveAs(p) }); });
  await page.goto(`${base}?room=${String(ABSENT) === String(i) ? other : room}&auto`);
  dev.push({ i, size: d.size, w, h, page, errors, downloads, mark: 0 });
}
const until = (p, fn, arg, t = 30000) => p.waitForFunction(fn, arg, { timeout: t }).then(() => true, () => false);
const toastOf = (p) => p.evaluate(() => document.getElementById('toast')?.textContent || '');
const facts = { ticket: s.ticket, commit, devices: s.devices, absent: ABSENT ?? null, share_stub: s.devices.some((d) => d.share) ? 'phone-size windows use a stand-in share sheet (headless Chromium has none)' : null, points: [], started: new Date().toISOString() };
// The app redraws its status text every frame, so replacing the code's text doesn't last: cover it
// with a black box instead (found by the first fresh run, which saw the code in every screenshot).
const cover = (p) => p.evaluate((code) => {
  const hud = document.getElementById('hud'); if (!hud) return;
  const w = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT); let t, r = null;
  while ((t = w.nextNode())) { const k = t.textContent.indexOf(code); if (k >= 0) { const g = document.createRange(); g.setStart(t, k); g.setEnd(t, k + code.length); r = g.getBoundingClientRect(); break; } }
  let box = document.getElementById('__gdc_cover'); if (!r) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = '__gdc_cover'; box.style.cssText = 'position:fixed;background:#000;z-index:2147483647;pointer-events:none'; document.body.appendChild(box); }
  Object.assign(box.style, { left: `${r.left - 3}px`, top: `${r.top - 2}px`, width: `${r.width + 6}px`, height: `${r.height + 4}px` });
}, room).catch(() => {});
async function shot(d, tag) { await cover(d.page); await d.page.screenshot({ path: join(OUT, `${tag}-device${d.i}-${d.size}.png`) }); }
async function shots(tag, first) { if (first) await shot(first, tag); for (const d of dev) if (d !== first) await shot(d, tag); }
// 1. everyone in the room, then join neighbours with the orbs: device i's right edge to device i+1's left
const inRoom = await Promise.all(dev.map((d) => until(d.page, (n) => window.__t && Object.keys(window.__t.net.peers).length === n, dev.length, 20000)));
async function orbJoin(a, b) {
  const from = (d) => [d.w / 2, d.h - 120];
  const [ax, ay] = from(a), [bx, by] = from(b), ST = 10;
  await a.page.mouse.move(ax, ay); await b.page.mouse.move(bx, by);
  await Promise.all([a.page.mouse.down(), b.page.mouse.down()]);
  // straight across to the side edge: a drag that goes more up than sideways is a push to the top edge
  for (let k = 1; k <= ST; k++) await Promise.all([a.page.mouse.move(ax + (a.w - 6 - ax) * k / ST, ay), b.page.mouse.move(bx + (6 - bx) * k / ST, by)]);
  await Promise.all([a.page.mouse.up(), b.page.mouse.up()]);
}
// "No match. Tap again together" is what a person sees when two pushes don't line up: like a
// person, try that pair again, at most 3 times, and record every attempt
facts.joinAttempts = [];
if (inRoom.every(Boolean)) for (let k = 0; k + 1 < dev.length; k++) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await orbJoin(dev[k], dev[k + 1]);
    const ok = await until(dev[k + 1].page, (n) => window.__t.net.joins.length >= n, k + 1, 8000);
    facts.joinAttempts.push({ pair: [k, k + 1], attempt, joined: ok, said: [await toastOf(dev[k].page), await toastOf(dev[k + 1].page)] });
    if (ok) break;
    await new Promise((r) => setTimeout(r, 2500));   // let "No match" clear before tapping again
  }
  await new Promise((r) => setTimeout(r, 2500));
}
const seen = await Promise.all(dev.map((d) => d.page.evaluate(() => { const t = window.__t; return t ? { devices: Object.keys(t.net.peers).length, joinsTotal: t.net.joins.length, joinsMine: t.net.joins.filter((j) => j.a === t.id || j.b === t.id).length, toast: document.getElementById('toast')?.textContent || '' } : { devices: 0, joinsTotal: 0, joinsMine: 0, toast: '' }; }).catch(() => ({ devices: 0, joinsTotal: 0, joinsMine: 0, toast: '' }))));
const jp = joinProblems(seen);
facts.join = { seen, problems: jp };
await shots('00-joined');
if (jp.length) { facts.verdict = { state: 'stop', why: `not every device joined: ${jp.join('; ')}` }; writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 1)); console.log(`STOP: ${facts.verdict.why}`); await browser.close(); server.close(); process.exit(EXIT.stop); }

// 2. the scenario's steps
const sent = new Map();   // photo name -> sha256 of the bytes the sending device holds
async function drawPick(d, count, from) {
  const imgs = await d.page.evaluate(([count, from]) => Promise.all(Array.from({ length: count }, (_, k) => new Promise((ok) => {
    const n = from + k, c = document.createElement('canvas'); c.width = 600; c.height = 600; const g = c.getContext('2d');
    g.fillStyle = ['#f4c542', '#7fb3d5', '#a9cf8f', '#f2a65a', '#c39bd3'][n % 5]; g.fillRect(0, 0, 600, 600);
    g.fillStyle = '#1c1c1c'; g.font = 'bold 380px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 300, 320);
    c.toBlob(async (b) => ok([`${n}.jpg`, [...new Uint8Array(await b.arrayBuffer())]]), 'image/jpeg', 0.92); }))), [count, from]);
  await d.page.setInputFiles('#pick', imgs.map(([name, b]) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(b) })));
  await until(d.page, (names) => names.every((n) => [...window.__t.prints.values()].some((p) => p.name === n) && [...window.__t.prints.values()].find((p) => p.name === n && window.__t.files.has(p.pid))), imgs.map(([n]) => n));
  for (const [name] of imgs) { const bytes = await d.page.evaluate(async (n) => { const t = window.__t, p = [...t.prints.values()].find((p) => p.name === n); return [...new Uint8Array(await t.files.get(p.pid).arrayBuffer())]; }, name); sent.set(name, sha(Buffer.from(bytes))); }
}
let picked = 1;
async function drag(from, to, name) {
  const at = await from.page.evaluate(([name, toId]) => { const t = window.__t, p = [...t.prints.values()].find((p) => p.name === name); if (!p) return null; const [wx, wy] = t.world(p), me = t.layout.pos[t.id], dst = t.layout.pos[toId]; t.prints.delete(p.pid); t.prints.set(p.pid, p); return { x: wx - me[0] + p.w / 2, y: wy - me[1] + p.h / 2, tx: dst[0] - me[0], ty: dst[1] - me[1] }; }, [name, await to.page.evaluate(() => window.__t.id)]);
  if (!at) return `no print called ${name} on device ${from.i}`;
  if (at.x < 0 || at.y < 0 || at.x > from.w || at.y > from.h) return `${name} isn't on device ${from.i}'s screen (it's at ${Math.round(at.x)}, ${Math.round(at.y)}), so it can't be dragged from there`;
  const toX = at.tx + Math.min(to.w / 2, 200), toY = at.ty + Math.min(to.h / 2, 260);
  await from.page.mouse.move(at.x, at.y); await from.page.mouse.down();
  for (let k = 1; k <= 12; k++) await from.page.mouse.move(at.x + (toX - at.x) * k / 12, at.y + (toY - at.y) * k / 12);
  await from.page.mouse.up();
  return null;
}
for (const [n, st] of s.steps.entries()) {
  const d = dev[st.device ?? 0];
  if (st.do === 'pick') { await drawPick(d, st.count, picked); picked += st.count; }
  else if (st.do === 'drag') { const why = await drag(dev[st.from], dev[st.to], st.photo); if (why) facts.points.push({ step: n, check: 'drag', state: 'stop', why }); }
  else if (st.do === 'wait') { if (!(await until(d.page, (k) => window.__t.files.size >= k && [...window.__t.incoming.keys()].filter((f) => !f.startsWith('thumb:')).length === 0, st.files, 30000))) facts.points.push({ step: n, check: 'wait', state: 'stop', why: `device ${st.device} didn't receive ${st.files} files in 30 s` }); }
  else if (st.do === 'tap') { d.mark = d.downloads.length; const missing = await d.page.click(st.selector).catch(() => true); if (missing) { facts.points.push({ step: n, check: 'tap', state: 'stop', why: `device ${d.i} has no ${st.selector} to tap` }); break; } await new Promise((r) => setTimeout(r, st.settle ?? 600)); }
  else if (st.do === 'pause') await new Promise((r) => setTimeout(r, st.ms));
  else if (st.check === 'toast') {
    await until(d.page, (want) => { const q = (t) => String(t || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim(); return q(document.getElementById('toast')?.textContent) === q(want); }, st.equals, st.within ?? 4000);   // the same quotes rule as sameText (Qodo on #145)
    const actual = (await toastOf(d.page)).trim();
    facts.points.push({ step: n, check: 'toast', device: st.device, source: st.source, expected: st.equals, actual, state: sameText(st.equals, actual) ? 'pass' : 'fail' });
  } else if (st.check === 'downloads') {
    await new Promise((r) => setTimeout(r, st.within ?? 6000));
    const got = d.downloads.slice(d.mark); await Promise.all(got.map((g) => g.done));
    const hashes = got.map((g) => ({ name: g.name, sha256: sha(readFileSync(g.path)), sent: sent.get(g.name) || null }));
    const same = hashes.every((h) => h.sent && h.sha256 === h.sent);
    facts.points.push({ step: n, check: 'downloads', device: st.device, source: st.source, expected: `${st.count} downloads, each byte-identical to what the sender holds`, actual: `${got.length} downloads${got.length ? (same ? ', all byte-identical' : ', NOT all byte-identical') : ''}`, hashes, state: got.length === st.count && same ? 'pass' : 'fail' });
  } else if (st.check === 'shared') {
    const shares = await d.page.evaluate(() => window.__shares || []);
    const hashes = (await d.page.evaluate(() => window.__sharedHashes || [])).at(-1) || [];
    const last = shares.at(-1) || [], withFiles = Number.isInteger(st.files);
    const wrongBytes = sharedBytesProblems(last, hashes, sent);
    facts.points.push({ step: n, check: 'shared', device: st.device, source: st.source, expected: `${st.calls} share sheet calls${withFiles ? `, the last with ${st.files} files` : ''}`, actual: `${shares.length} share sheet calls${withFiles ? `, the last with ${last.length} files` : ''}`, sharedHashes: hashes, state: shares.length === st.calls && (!withFiles || last.length === st.files) && !wrongBytes.length ? 'pass' : 'fail', ...(wrongBytes.length ? { why: wrongBytes.join('; ') } : {}) });
  }
  if (st.check) await shots(`${String(n).padStart(2, '0')}-${st.check}`, d);
}
const errs = dev.flatMap((d) => d.errors.map((e) => `device ${d.i}: ${e}`));
if (errs.length) facts.points.push({ step: 'all', check: 'page errors', expected: 'none', actual: errs.join(' | '), state: 'fail' });
facts.verdict = verdict(facts.points);
facts.finished = new Date().toISOString();
writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 1));
for (const p of facts.points) console.log(`${p.state.toUpperCase().padEnd(4)} step ${p.step} ${p.check}: expected ${JSON.stringify(p.expected)} · actual ${JSON.stringify(p.actual)}`);
console.log(`${facts.verdict.state.toUpperCase()}: ${facts.verdict.why}`);
await browser.close(); server.close();
process.exit(EXIT[facts.verdict.state]);
