// The two-browser test: two browser windows play two devices. They join a room, join
// screens, one shares photos and a video, drags them onto the other screen, and the other
// must end up with byte-identical files. An iPhone-style JPEG must arrive with its location
// and camera details removed, still upright, unless "Keep details" is ticked (S6). Also checks a stranger's malformed messages are
// ignored, that a send to a device that never answers gives up after 10 s without holding up
// anyone else (S1.3), that a print dropped while a device's key was late is announced again
// once the key comes (S1.3), that a thumbnail over 400 x 400 is never decoded (S14), that a device asking again and again
// for the same file gets it at most 3 times a minute (S1.5), that Invite's link joins the same room and the
// code leaves the address bar once joined (S16) and that a late guest can still download photos after their owner leaves.
//
//   node tests/two-browser.mjs           direct device-to-device path (WebRTC)
//   node tests/two-browser.mjs --relay   force the end-to-end encrypted relay path
//
// Needs internet access (rooms run over Supabase Realtime). Serves web/ on 127.0.0.1 only.
import { chromium } from 'playwright';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { iphoneJpeg, heicFile, exifr, sizedJpeg } from './jpeg-fixtures.mjs';
import { solveLayout, overlapCount } from '../web/layout.js';

const RELAY = process.argv.includes('--relay');
const server = await serve(0);
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => [...randomBytes(10)].map((b) => ALPHABET[b & 31]).join('');
const room = code();
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
let failed = false;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed = true; };

const browser = await chromium.launch();
// an invite link opens the name screen with the saved name filled in (the link joins once it's confirmed)
async function enter(page) {
  const named = await page.waitForFunction(() => document.getElementById('s-name')?.hidden === false && document.getElementById('yourname').value, null, { timeout: 10000 }).then(() => true, () => false);
  if (named) await page.click('#go');
}
async function device(w, h, { at = room, init, relay = RELAY } = {}) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  page.on('pageerror', (e) => { console.log('page error:', e.message); failed = true; });
  // every test device has a name of its own, as a person would after their first visit (#156)
  await page.addInitScript((n) => { try { if (!localStorage.getItem('heap-name')) localStorage.setItem('heap-name', n); localStorage.setItem('heap-open', '1'); } catch {} }, 'T' + Math.random().toString(36).slice(2, 8));
  if (init) await page.addInitScript(init);
  await page.goto(`${BASE}?room=${at}&auto${relay ? '&relay' : ''}`);
  await enter(page);
  return page;
}
// A wait that times out says which one it was: its line in this file and that line's code.
const SOURCE = readFileSync(new URL(import.meta.url), 'utf8').split('\n');
function until(page, fn, arg, timeout = 30000) {
  const line = Number(new Error().stack.split('\n')[2]?.match(/two-browser\.mjs:(\d+):\d+/)?.[1]);
  return page.waitForFunction(fn, arg, { timeout }).catch((e) => {
    if (!/Timeout/.test(e.message)) throw e;
    throw new Error(`timed out after ${timeout / 1000} s at two-browser.mjs:${line}: ${(SOURCE[line - 1] || '').trim().slice(0, 140)}`);
  });
}

try {
  const A = await device(900, 600), B = await device(390, 700);
  await until(A, () => window.__t && Object.keys(window.__t.net.peers).length === 2);
  await until(B, () => window.__t && Object.keys(window.__t.net.peers).length === 2);

  // join A's right edge to B's left edge at the same moment
  await Promise.all([A.evaluate(() => window.__t.net.push('R', 300)), B.evaluate(() => window.__t.net.push('L', 350))]);
  await until(A, () => window.__t.net.joins.length === 1); await until(B, () => window.__t.net.joins.length === 1);
  check(true, 'screens joined');

  // join results (C15, #68). A arrived first, so it is the time keeper. "Joined with…" shows
  // on both devices the join names, each with its own side
  const who = async (page) => page.evaluate(() => ({ id: window.__t.id, name: window.__t.net.name, leader: window.__t.net.leader }));
  const [a, b] = [await who(A), await who(B)];
  // Keep photo details is a checkbox in the menu: open it, set the box, close it
  const setKeep = async (page, on) => { await page.click('#menu'); await page.setChecked('#keep', on); await page.click('#closemenu'); await page.waitForFunction(() => document.getElementById('menubox').hidden); };
  const toastOf = (page) => page.evaluate(() => document.getElementById('toast').textContent);
  await until(B, () => document.getElementById('toast').textContent.startsWith('Joined with'), null, 10000);
  const joinSaid = [await toastOf(A), await toastOf(B)];
  check(a.leader === a.id && joinSaid[0] === `Joined with ${b.name}, on your right` && joinSaid[1] === `Joined with ${a.name}, on your left`, `the join says "${joinSaid.join('" and "')}"`);
  // a lone push: the time keeper's nomatch shows only on the device it names
  const loneAt = Date.now();
  await B.evaluate(() => window.__t.net.push('T', 100));
  await until(B, () => document.getElementById('toast').textContent === 'No match. Tap again together', null, 10000);
  const loneTook = (Date.now() - loneAt) / 1000;
  // under 4 s: this is the time keeper's nomatch, not the device's own wait (5.5 s)
  check(loneTook >= 1.5 && loneTook < 4 && await toastOf(A) === joinSaid[0], `the time keeper's nomatch for a lone push shows on its device only (after ${loneTook.toFixed(1)} s)`);
  // "Joined" wins over a nomatch for an earlier push: A pushes alone, then 1.9 s later pairs
  // with B. The time keeper decides both at the same moment
  await A.evaluate(() => window.__t.net.push('T', 100));
  await new Promise((r) => setTimeout(r, 1900));
  await Promise.all([A.evaluate(() => window.__t.net.push('R', 300)), B.evaluate(() => window.__t.net.push('L', 350))]);
  await new Promise((r) => setTimeout(r, 4000));
  const rejoinSaid = [await toastOf(A), await toastOf(B)];
  check(rejoinSaid[0] === joinSaid[0] && rejoinSaid[1] === joinSaid[1], `a join decided with a nomatch for an earlier push still says "Joined" ("${rejoinSaid.join('" and "')}")`);
  // results sent by a device that isn't the time keeper are ignored. A stranger with the room
  // code sends them on the room's channel. The same messages claiming to come from the time keeper
  // are heard: the check is the rule, not protection against forgery, until #24 signs messages
  await B.evaluate(() => { const t = window.__t; t.heard = []; t.net.on((ev) => { if (['joined', 'retry', 'nomatch'].includes(ev)) t.heard.push(ev); }); });
  const [, url, key] = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8').match(/SUPABASE_URL = '([^']+)';\s*const SUPABASE_KEY = '([^']+)'/);
  const stranger = async (from) => B.evaluate(async ([url, key, room, a, b, from]) => {
    const client = window.supabase.createClient(url, key), ch = client.channel('stitch:photo-' + room, { config: { broadcast: { self: false } } });
    await new Promise((ok) => ch.subscribe((st) => st === 'SUBSCRIBED' && ok()));
    await ch.send({ type: 'broadcast', event: 'joined', payload: { a, edgeA: 'R', alongA: 300, tA: 1, b, edgeB: 'L', alongB: 350, tB: 2, from } });
    await ch.send({ type: 'broadcast', event: 'retry', payload: { devs: [b], pushes: [{ dev: b, t: 2 }], from } });
    await ch.send({ type: 'broadcast', event: 'nomatch', payload: { dev: b, t: 2, from } });
    await client.removeChannel(ch);
  }, [url, key, room, a.id, b.id, from]);
  await stranger('zzzzstranger');
  await new Promise((r) => setTimeout(r, 2000));
  const strangerHeard = await B.evaluate(() => window.__t.heard.length);
  await stranger(a.id);
  const forgedHeard = await until(B, () => window.__t.heard.length === 3, null, 10000).then(() => true, () => false);
  check(strangerHeard === 0 && forgedHeard, `results from a device that isn't the time keeper are ignored (heard ${strangerHeard}; with a forged time keeper id: ${forgedHeard})`);
  // connection setup from a device that isn't in the room opens no connection (S1.6)
  await B.evaluate(async ([url, key, room, b]) => {
    const client = window.supabase.createClient(url, key), ch = client.channel('stitch:photo-' + room, { config: { broadcast: { self: false } } });
    await new Promise((ok) => ch.subscribe((st) => st === 'SUBSCRIBED' && ok()));
    const from = 'zzzzsetupstranger';
    await ch.send({ type: 'broadcast', event: 'sig', payload: { from, to: b, data: { pub: btoa('x'.repeat(65)) } } });
    await ch.send({ type: 'broadcast', event: 'sig', payload: { from, to: b, data: { desc: { type: 'offer', sdp: 'v=0\r\n' } } } });
    await ch.send({ type: 'broadcast', event: 'sig', payload: { from, to: b, data: { cand: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' } } } });
    await client.removeChannel(ch);
  }, [url, key, room, b.id]);
  await new Promise((r) => setTimeout(r, 6000));   // past the time net.js holds early setup (EARLY_SIG_TTL)
  const setupLink = await B.evaluate(() => { const t = window.__t; return [t.peers.path('zzzzsetupstranger'), t.peers.state('zzzzsetupstranger')]; });
  check(setupLink[0] === 'none' && setupLink[1] === 'none', `setup from a device not in the room opens no connection (path ${setupLink[0]}, state ${setupLink[1]})`);
  // what the page shows for each result: "Try again" isn't replaced by this device's own
  // "No match" until it pushes again, "Joined" always wins, results for other devices show nothing
  const shows = await B.evaluate((a) => { const t = window.__t, out = [], said = () => document.getElementById('toast').textContent;
    const fire = (ev, d) => { t.net.listeners.forEach((f) => f(ev, d)); out.push(said()); };
    t.net.listeners.forEach((f) => f('pushed', {}));   // a fresh push: the forged results above are forgotten
    fire('retry', { devs: [t.id], from: a, latest: true });
    fire('nomatch', { dev: t.id, timedOut: true, latest: true });
    fire('joined', { a, edgeA: 'R', alongA: 300, b: t.id, edgeB: 'L', alongB: 350, from: a, latest: true });
    fire('retry', { devs: [t.id], from: a, latest: true });
    fire('nomatch', { dev: t.id, from: a, latest: true });
    t.net.listeners.forEach((f) => f('pushed', {}));
    fire('nomatch', { dev: t.id, timedOut: true, latest: true });
    fire('retry', { devs: [a], from: a, latest: false });
    fire('joined', { a, edgeA: 'B', alongA: 1, b: 'zzzzother', edgeB: 'T', alongB: 1, from: a, latest: false });
    // results for an earlier push of this device don't hide what the latest push gets: a late
    // retry shows nothing, a late join still says "Joined" but the latest push's "No match" follows
    t.net.listeners.forEach((f) => f('pushed', {}));
    fire('retry', { devs: [t.id], from: a, latest: false });
    fire('nomatch', { dev: t.id, timedOut: true, latest: true });
    t.net.listeners.forEach((f) => f('pushed', {}));
    fire('joined', { a, edgeA: 'R', alongA: 300, b: t.id, edgeB: 'L', alongB: 350, from: a, latest: false });
    fire('nomatch', { dev: t.id, timedOut: true, latest: true });
    return out; }, a.id);
  const TRY = 'Couldn’t tell who to join. Try again', NO = 'No match. Tap again together';
  const JOINED = `Joined with ${a.name}, on your left`;
  check(JSON.stringify(shows) === JSON.stringify([TRY, TRY, JOINED, JOINED, JOINED, NO, NO, NO, NO, NO, JOINED, NO]), `join messages in order: ${JSON.stringify(shows)}`);
  // "Try again" stays on screen until this device pushes again
  const toastShown = () => B.evaluate(() => { const el = document.getElementById('toast'); return [el.textContent, getComputedStyle(el).opacity]; });
  await B.evaluate((a) => window.__t.net.listeners.forEach((f) => { f('pushed', {}); f('retry', { devs: [window.__t.id], from: a, latest: true }); }), a.id);
  await new Promise((r) => setTimeout(r, 3200));
  const stays = await toastShown();
  await B.evaluate(() => window.__t.net.listeners.forEach((f) => f('pushed', {})));
  await new Promise((r) => setTimeout(r, 1000));
  const gone = await toastShown();
  check(stays[0] === TRY && stays[1] === '1' && gone[1] === '0', `"Try again" is still visible after 3 s (${JSON.stringify(stays)}) and goes on the next push (${JSON.stringify(gone)})`);

  // two real images (drawn in the browser) and one fake video
  const images = await A.evaluate(() => Promise.all([0, 1].map((i) => new Promise((ok) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
    g.fillStyle = i ? '#345' : '#c84'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.fillText('photo ' + i, 40, 60);
    c.toBlob(async (b) => ok([...new Uint8Array(await b.arrayBuffer())]), 'image/jpeg', 0.9);
  }))));
  const files = [
    { name: 'photo-0.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(images[0]) },
    { name: 'photo-1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(images[1]) },
    { name: 'clip.mp4', mimeType: 'video/mp4', buffer: randomBytes(60000) },
    { name: 'IMG_0001.JPG', mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) },     // GPS, camera details, rotated 90°, gain map
    { name: 'IMG_0002.HEIC', mimeType: 'image/heic', buffer: Buffer.from(heicFile()) },
  ];
  const kept = { name: 'IMG_0003.JPG', mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) };   // sent with "Keep details"
  await A.setInputFiles('#pick', files);
  await until(A, () => document.getElementById('toast').textContent.includes('on the table'));
  const said = await A.evaluate(() => document.getElementById('toast').textContent);
  check(/Details not removed from .*clip\.mp4/.test(said) && said.includes('IMG_0002.HEIC') && !said.includes('IMG_0001'), `video and HEIC warned: "${said}"`);
  await setKeep(A, true);
  await A.setInputFiles('#pick', [kept]);
  await setKeep(A, false);
  files.push(kept);

  // ticking "Keep details" while a batch is still being prepared changes nothing for that batch:
  // the choice is the one made when the files were picked
  const batch = ['IMG_0004.JPG', 'IMG_0005.JPG'];
  await A.evaluate(([bytes, names]) => {
    const pick = document.getElementById('pick'), dt = new DataTransfer();
    for (const n of names) dt.items.add(new File([new Uint8Array(bytes)], n, { type: 'image/jpeg' }));
    pick.files = dt.files;
    pick.dispatchEvent(new Event('change'));
    document.getElementById('keep').checked = true;   // ticked for the next pick, while this one is still running
  }, [[...iphoneJpeg()], batch]);
  await until(A, (names) => names.every((n) => [...window.__t.prints.values()].some((p) => p.name === n)), batch);
  await setKeep(A, false);
  const held = await A.evaluate((names) => Promise.all([...window.__t.prints.values()].filter((p) => names.includes(p.name))
    .map(async (p) => [p.name, [...new Uint8Array(await window.__t.files.get(p.pid).arrayBuffer())]])), batch);
  for (const [name, bytes] of held) check(await exifr.gps(Buffer.from(bytes)) === undefined, `${name} cleaned though "Keep details" was ticked mid-batch`);

  // the mirror: ticked when picked, unticked mid-batch. The batch keeps its details, as chosen at pick time
  const kbatch = ['IMG_0006.JPG', 'IMG_0007.JPG'];
  await setKeep(A, true);
  await A.evaluate(([bytes, names]) => {
    const pick = document.getElementById('pick'), dt = new DataTransfer();
    for (const n of names) dt.items.add(new File([new Uint8Array(bytes)], n, { type: 'image/jpeg' }));
    pick.files = dt.files;
    pick.dispatchEvent(new Event('change'));
    document.getElementById('keep').checked = false;   // unticked for the next pick, while this one is still running
  }, [[...iphoneJpeg()], kbatch]);
  await until(A, (names) => names.every((n) => [...window.__t.prints.values()].some((p) => p.name === n)), kbatch);
  const kheld = await A.evaluate((names) => Promise.all([...window.__t.prints.values()].filter((p) => names.includes(p.name))
    .map(async (p) => [p.name, [...new Uint8Array(await window.__t.files.get(p.pid).arrayBuffer())]])), kbatch);
  for (const [name, bytes] of kheld) check(await exifr.gps(Buffer.from(bytes)) !== undefined, `${name} kept its details though "Keep details" was unticked mid-batch`);

  await until(B, () => window.__t.prints.size === 10);
  await until(B, () => [...window.__t.prints.values()].filter((p) => p.img).length === 8);
  check(true, 'the other device sees 10 prints with 8 thumbnails');

  // drag photo-0 and the video onto B's screen with the mouse: press on the print, move past
  // A's right edge (B's screen is joined there) and let go
  const drags = [];
  async function drag(page, name, toX) {
    const at = await page.evaluate((name) => {
      const t = window.__t, p = [...t.prints.values()].find((p) => p.name === name), d = t.decks().find((d) => d.pids.includes(p.pid)); for (const k of d.pids) { const q = t.prints.get(k); t.prints.delete(k); t.prints.set(k, q); }   // on top, so the press picks this deck
      const [wx, wy] = t.world(d.top), me = t.layout.pos[t.id];
      return { pid: p.pid, n: d.pids.length, x: wx - me[0] + d.top.w / 2, y: wy - me[1] + d.top.h / 2 };
    }, name);
    drags.push({ name, at });   // for the dump if the transfer below times out (#100)
    if (at.n > 1) {   // in a deck: tap it open, then drag the photo out of it (2A.7)
      await page.mouse.click(at.x, at.y);
      await until(page, (pid) => !document.getElementById('deckbox').hidden && !document.querySelector('#deckbox .sheet').getAnimations().length && !!document.querySelector(`#decktiles [data-pid="${pid}"]`), at.pid, 5000);
      Object.assign(at, await page.evaluate((pid) => { const el = document.querySelector(`#decktiles [data-pid="${pid}"]`); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, at.pid));
    }
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(at.x + ((toX - at.x) * k) / 12, at.y);
    await new Promise((r) => setTimeout(r, 150)); await page.mouse.move(toX + 1, at.y);   // settle before letting go, so it's a place, not a flick (2A.3)
    await page.mouse.up();
  }
  // what A shared sits as one deck, on both screens (2A.1)
  const deckOf = (page, owner) => page.evaluate((o) => window.__t.decks().filter((d) => d.owner === o).map((d) => d.pids.length), owner);
  const aId = await A.evaluate(() => window.__t.id);
  const [deckA, deckB] = [await deckOf(A, aId), await deckOf(B, aId)];
  check(deckA.join() === '10' && deckB.join() === '10', `A's 10 photos are one deck on A (${deckA}) and on B (${deckB})`);
  await drag(A, 'photo-0.jpg', 900 + 150);   // the middle of B's screen
  await drag(A, 'clip.mp4', 900 + 150);
  await drag(A, 'IMG_0001.JPG', 900 + 150);
  await drag(A, 'IMG_0003.JPG', 900 + 150);
  const before = await B.evaluate(() => window.__t.prints.size);
  // #100: this wait sometimes times out. If it does, say which files arrived and where each dragged
  // print was, so the next failure shows its cause
  try { await until(B, () => window.__t.files.size === 4, null, 90000); } catch (e) {
    const state = { drags,
      B: await B.evaluate(() => ({ files: [...window.__t.files.values()].map((f) => f.name), prints: [...window.__t.prints.values()].map((p) => ({ name: p.name, x: p.x, y: p.y })) })).catch((x) => String(x)),
      A: await A.evaluate(() => ({ me: window.__t.layout.pos[window.__t.id], prints: [...window.__t.prints.values()].map((p) => ({ name: p.name, x: p.x, y: p.y, w: p.w, h: p.h })) })).catch((x) => String(x)) };
    console.log(`#100 state at the timeout: ${JSON.stringify(state)}`);
    throw e;
  }
  const got = await B.evaluate(() => Promise.all([...window.__t.files.entries()].map(async ([pid, f]) => {
    const bmp = await createImageBitmap(f).catch(() => null), shown = bmp && [bmp.width, bmp.height];
    return [f.name, [...new Uint8Array(await f.arrayBuffer())], window.__t.prints.get(pid).sha, shown];
  })));
  const expected = Object.fromEntries(files.map((f) => [f.name, sha(f.buffer)]));   // what a late guest should get
  for (const [name, bytes, announced, shown] of got) {
    const buf = Buffer.from(bytes);
    if (name !== 'IMG_0001.JPG') { check(sha(buf) === expected[name], `${name} arrived byte-identical`); continue; }
    const meta = (await exifr.parse(buf, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false })) || {};
    check(sha(buf) === announced, `${name} passed its fingerprint check`);
    check(await exifr.gps(buf) === undefined && !meta.Make && !meta.Model && !buf.includes('hdrgm'), `${name} arrived without GPS, camera details or gain map`);
    check(await exifr.orientation(buf) === 6 && shown?.[0] === 8 && shown?.[1] === 16, `${name} still upright (shown ${shown?.join(' x ')})`);
    expected[name] = sha(buf);
  }
  const keptGot = got.find(([name]) => name === 'IMG_0003.JPG');
  check(!!keptGot && await exifr.gps(Buffer.from(keptGot[1])) !== undefined, 'IMG_0003.JPG ("Keep details") still has its GPS');
  const path = await A.evaluate(() => { const t = window.__t; return t.peers.path(Object.keys(t.net.peers).find((k) => k !== t.id)); });
  check(RELAY ? path === 'relay (encrypted)' : path === 'direct', `went ${path}`);

  // 2A.3, 2A.4: a photo flicked toward B and let go on A's screen glides across and lands on B. B is told
  // who it came from, with Undo; A is told where it went. Undo puts it k4Back on A's screen
  const k4Names = { a: await A.evaluate(() => localStorage.getItem('heap-name')), b: await B.evaluate(() => localStorage.getItem('heap-name')) };
  const k4BId = await B.evaluate(() => window.__t.id);
  const k4FlickPid = await A.evaluate((b) => { const t = window.__t, d = t.decks().find((d) => d.owner === t.id && d.pids.length > 1), p = t.prints.get(d.pids[0]);
    p.anchor = t.id; p.x = 560; p.y = 260; t.prints.delete(p.pid); t.prints.set(p.pid, p); t.peers.send(b, { t: 'move', pid: p.pid, anchor: p.anchor, x: p.x, y: p.y, final: true }); return p.pid; }, k4BId);
  await A.mouse.move(635, 335); await A.mouse.down();
  for (const x of [650, 670, 695, 720]) await A.mouse.move(x, 335);
  await A.mouse.up();
  const k4Flew = await until(B, (pid) => window.__t.files.has(pid) && window.__t.prints.get(pid).anchor === window.__t.id, k4FlickPid, 60000).then(() => true, () => false);
  const k4Snack = await B.evaluate(() => ({ shown: !document.getElementById('snack').hidden, text: document.getElementById('snacktext').textContent }));
  const k4SentSaid = await until(A, () => document.getElementById('toast').textContent.startsWith('Sent to'), null, 15000).then(() => toastOf(A), () => toastOf(A));   // once B has it
  check(k4Flew && k4Snack.shown && k4Snack.text === `1 photo from ${k4Names.a}` && k4SentSaid === `Sent to ${k4Names.b} ✓`,
    `a flick let go on A glides across to B (${k4Flew}); B says "${k4Snack.text}", A says "${k4SentSaid}"`);
  await B.click('#snackact');
  const k4Undone = await until(A, ([pid, a]) => window.__t.prints.get(pid).anchor === a, [k4FlickPid, aId], 10000).then(() => true, () => false);
  check(k4Undone, `Undo on B puts the photo back on A's screen (${k4Undone})`);
  // 2A.8: let go where no screen is joined: the photo comes back and Send to… lists B; choosing B sends it
  const k4Lost = await A.evaluate(() => { const t = window.__t, d = t.decks().find((d) => d.owner === t.id && d.pids.length > 1); return d.pids[0]; });
  await A.evaluate((pid) => { const t = window.__t, p = t.prints.get(pid); p.anchor = t.id; p.x = 150; p.y = 300; t.prints.delete(pid); t.prints.set(pid, p); }, k4Lost);
  await A.mouse.move(225, 370); await A.mouse.down();   // flicked left and let go on A: it glides off the edge, where nothing is joined
  for (const x of [200, 170, 130, 95, 70]) await A.mouse.move(x, 370);
  await A.mouse.up();
  const k4SendUp = await until(A, () => !document.getElementById('sendbox').hidden, null, 5000).then(() => true, () => false);
  const k4Back = await A.evaluate((pid) => { const t = window.__t, p = t.prints.get(pid); return t.screenAt(...t.world(p).map((v, i) => v + (i ? p.h : p.w) / 2)) === t.id; }, k4Lost);
  const k4Rows = await A.evaluate(() => [...document.querySelectorAll('#sendlist button')].map((b) => b.textContent));
  await A.click(`#sendlist button[data-to="${k4BId}"]`);
  const k4Given = await until(B, (pid) => window.__t.files.has(pid), k4Lost, 60000).then(() => true, () => false);
  check(k4SendUp && k4Back && k4Rows.some((r) => r.startsWith(k4Names.b)) && k4Given, `let go off every screen: it comes back (${k4Back}), Send to… opens (${k4SendUp}) listing ${JSON.stringify(k4Rows)}, and choosing B sends it (${k4Given})`);
  // 2A.5: while A holds a photo near the seam, B sees who is holding it
  await until(A, () => document.getElementById('sendbox').hidden, null, 5000);   // Send to… has finished closing
  const k4HoldPid = await A.evaluate(() => { const t = window.__t, d = t.decks().find((d) => d.owner === t.id && d.pids.length > 1); const p = t.prints.get(d.pids[0]); p.anchor = t.id; p.x = 600; p.y = 260; t.prints.delete(p.pid); t.prints.set(p.pid, p); return p.pid; });
  await A.mouse.move(675, 335); await A.mouse.down();
  for (let k = 1; k <= 6; k++) await A.mouse.move(675 + k * 25, 335);
  const k4Holding = await until(B, (a) => window.__t.holding().some((h) => h.from === a && h.n === 1), aId, 5000).then(() => true, () => false);
  await A.mouse.move(645, 335); await new Promise((r) => setTimeout(r, 150)); await A.mouse.move(640, 335); await A.mouse.up();   // back on A, let go gently
  const k4LetGo = await until(B, () => !window.__t.holding().length, null, 5000).then(() => true, () => false);
  check(k4Holding && k4LetGo, `B sees A holding a photo near the seam (${k4Holding}), and stops once A lets go (${k4LetGo})`);
  // #161 review: two photos flicked one after another both land on B; a vertical swipe in the deck sheet doesn't pull a photo out;
  // Send to with a photo A doesn't have says so
  const two = await A.evaluate(() => { const t = window.__t, d = t.decks().find((d) => d.owner === t.id && d.pids.length > 2); return d ? d.pids.filter((k) => !['IMG_0004.JPG', 'IMG_0005.JPG'].includes(t.prints.get(k).name)).slice(0, 2) : []; });   // not the photos the tap checks use
  for (const [n, pid] of two.entries()) {
    await A.evaluate(([pid, y]) => { const t = window.__t, p = t.prints.get(pid); p.anchor = t.id; p.x = 560; p.y = y; t.prints.delete(pid); t.prints.set(pid, p); }, [pid, 80 + n * 220]);
    const y0 = 80 + n * 220 + 75;
    await A.mouse.move(635, y0); await A.mouse.down(); for (const x of [650, 670, 695, 720]) await A.mouse.move(x, y0); await A.mouse.up();
  }
  const bothLanded = await until(B, (ps) => ps.every((pid) => window.__t.files.has(pid)), two, 60000).then(() => true, () => false);
  const dk = await A.evaluate(() => { const t = window.__t, d = t.decks().find((d) => d.owner === t.id && d.pids.length > 1); if (!d) return null; const [wx, wy] = t.world(d.top), me = t.layout.pos[t.id]; return { x: wx - me[0] + 75, y: wy - me[1] + 75 }; });
  let swipeKept = false;
  if (dk) {
    await A.mouse.click(dk.x, dk.y); await until(A, () => !document.getElementById('deckbox').hidden && !document.querySelector('#deckbox .sheet').getAnimations().length, null, 5000);
    const tl = await A.evaluate(() => { const r = document.querySelector('#decktiles button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await A.mouse.move(tl.x, tl.y); await A.mouse.down(); for (let k = 1; k <= 6; k++) await A.mouse.move(tl.x + 2, tl.y - k * 15); await A.mouse.up();
    swipeKept = await A.evaluate(() => !document.getElementById('deckbox').hidden);
    await A.evaluate(() => { document.getElementById('deckbox').hidden = true; });
  }
  check(two.length === 2 && bothLanded && swipeKept, `two flicks in a row both land on B (${bothLanded}); a vertical swipe in the deck sheet keeps it open (${swipeKept})`);
  void k4HoldPid;

  // a device that never sends its key asks A for a photo. A gives up after 10 s and says so,
  // while A and B keep transferring (S1.3)
  const GHOST = 'zzzzsilent';
  // the silent device is in the room (A only counts asks from devices in the room, S1.5/S7): A's
  // presence list shows it for these steps, and is put back after them
  const ghostHere = (on) => A.evaluate(([ghost, on]) => { const n = window.__t.net;
    if (on) { let real = n.peers; Object.defineProperty(n, 'peers', { configurable: true, get: () => ({ ...real, [ghost]: { name: 'silent', w: 400, h: 800, joinedAt: 9e15 } }), set: (v) => { real = v; } }); }
    else { const real = Object.fromEntries(Object.entries(n.peers).filter(([k]) => k !== ghost)); Object.defineProperty(n, 'peers', { configurable: true, writable: true, value: real }); } }, [GHOST, on]);
  await ghostHere(true);
  const asked = Date.now();
  await A.evaluate((ghost) => { const t = window.__t, p = [...t.prints.values()].find((p) => p.name === 'photo-1.jpg');
    t.onMessage(ghost, { t: 'want', pid: p.pid }); }, GHOST);
  await drag(A, 'photo-1.jpg', 900 + 150);
  const p1 = await A.evaluate(() => [...window.__t.prints.values()].find((p) => p.name === 'photo-1.jpg').pid);
  await until(B, (pid) => window.__t.files.has(pid), p1, 60000);   // the photo it sent (others may have arrived by other ways)
  const gaveUpEarly = await A.evaluate(() => document.getElementById('toast').textContent.includes('Couldn’t send'));
  check(!gaveUpEarly, `photo-1.jpg reached B after ${((Date.now() - asked) / 1000).toFixed(1)} s, while A still waited on the silent device`);
  const toldSender = await A.waitForFunction(() => document.getElementById('toast').textContent.includes('Couldn’t send'), null, { timeout: 20000 }).then(() => true, () => false);
  const waited = (Date.now() - asked) / 1000;
  check(toldSender && waited >= 10 && waited < 20, `send to a silent device gave up and told the sender (after ${waited.toFixed(1)} s)`);
  // Picking (2B.3–2B.6) on a laptop: B has no share sheet. B picks the 5 photos it holds in All photos;
  // Get downloads all 5, byte-identical, and a second Get downloads nothing again
  await B.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const downloads = [];
  B.on('download', (d) => downloads.push(d));
  const sheetUp = (page, box) => until(page, (box) => !document.getElementById(box).hidden && !document.querySelector(`#${box} .sheet`).getAnimations().length, box, 5000);
  const tapTile = (page, box, pid) => page.evaluate(([box, pid]) => { const el = document.querySelector(`#${box} [data-pid="${pid}"]`); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [box, pid])
    .then((r) => page.mouse.click(r.x, r.y));
  const heldByB = await B.evaluate(() => [...window.__t.files.keys()].filter((k) => window.__t.prints.get(k)?.owner !== window.__t.id));
  await B.click('#allphotos'); await sheetUp(B, 'deckbox');
  for (const pid of heldByB) await tapTile(B, 'deckbox', pid);
  const pickedSays = await B.evaluate(() => [document.getElementById('getpick').textContent, document.getElementById('pickedbtn').textContent]);
  await B.click('#deckback');
  await B.click('#pickedbtn'); await sheetUp(B, 'reviewbox');
  const reviewSays = await B.evaluate(() => [document.getElementById('reviewtitle').textContent, document.getElementById('reviewline').textContent]);
  const NB = heldByB.length;   // what B holds by now: the dragged photos, and any flicked or given to it
  check(NB >= 5 && new RegExp(`^Get ${NB} · [\\d.]+ MB$`).test(pickedSays[0]) && pickedSays[1] === `Picked · ${NB}` && reviewSays[0] === `Picked · ${NB}` && new RegExp(`^[\\d.<\\s]+MB · from .+ \\(${NB}\\) · stays only on this device$`).test(reviewSays[1]),
    `picking 5 says "${pickedSays.join('", "')}", and the review says "${reviewSays.join('", "')}"`);
  await B.click('#getall');
  await until(B, () => document.getElementById('toast').textContent.startsWith('Downloading'), null, 5000);
  const saveSaid = await toastOf(B);
  const allCame = await new Promise((ok) => { const t0 = Date.now(), h = setInterval(() => { if (downloads.length >= NB || Date.now() - t0 > 10000) { clearInterval(h); ok(downloads.length); } }, 100); });
  const saved = await Promise.all(downloads.map(async (d) => [d.suggestedFilename(), sha(readFileSync(await d.path()))]));
  const heldByA = Object.fromEntries(await A.evaluate(() => Promise.all([...window.__t.files.values()].map(async (f) => [f.name, [...new Uint8Array(await f.arrayBuffer())]]))).then((l) => l.map(([n, b]) => [n, sha(Buffer.from(b))])));
  for (const [n] of saved) if (!expected[n] || n.endsWith('.JPG')) expected[n] = heldByA[n] ?? expected[n];   // what A shared (location removed), not the original
  check(allCame === NB && saveSaid === `Downloading ${NB}` && saved.every(([n, h]) => expected[n] === h), `Get downloaded ${saved.map(([n]) => n).join(', ')} byte-identical ("${saveSaid}")`);
  await B.click('#getall');
  await new Promise((r) => setTimeout(r, 1500));
  check(downloads.length === NB && await toastOf(B) === 'Nothing new to save', `a second Get downloads nothing again ("${await toastOf(B)}")`);
  // a picked photo that isn't here yet: Get asks for it, says it's arriving, and the next Get saves it
  // not the photos the tap checks below use. If every other photo has reached B by now, B lets one go first
  const away = await B.evaluate(() => {
    const t = window.__t, mine = (p) => p.owner === t.id, ok = (p) => !mine(p) && p.type.startsWith('image/') && !['IMG_0004.JPG', 'IMG_0005.JPG'].includes(p.name);
    let p = [...t.prints.values()].find((p) => ok(p) && !t.files.has(p.pid));
    if (!p) { p = [...t.prints.values()].reverse().find(ok); if (p) { t.files.delete(p.pid); t.handed.delete(p.pid); p.holders = p.holders.filter((k) => k !== t.id); } }
    return p?.pid;
  });
  await B.evaluate(() => document.getElementById('reviewbox').hidden = true);
  await B.click('#allphotos'); await sheetUp(B, 'deckbox');
  if (!(await B.evaluate((a) => document.querySelector(`#decktiles [data-pid="${a}"]`)?.classList.contains('on'), away))) await tapTile(B, 'deckbox', away);   // picked already (Get took it before): stays picked
  await B.evaluate(() => { window.__said = []; new MutationObserver(() => window.__said.push(document.getElementById('toast').textContent)).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true }); });   // every toast, so one arriving at the same moment can't hide it
  await B.click('#getpick');
  const arrivingSaid = await B.evaluate(() => window.__said.find((t) => /still arriving/.test(t)) || document.getElementById('toast').textContent);
  const fetched = await until(B, (pid) => window.__t.files.has(pid), away, 60000).then(() => true, () => false);
  await B.click('#getpick');
  const gotAway = await new Promise((ok) => { const t0 = Date.now(), h = setInterval(() => { if (downloads.length >= NB + 1 || Date.now() - t0 > 10000) { clearInterval(h); ok(downloads.length === NB + 1); } }, 100); });
  check(!!away && /still arriving/.test(arrivingSaid) && fetched && gotAway, `Get on a photo that isn't here says "${arrivingSaid}", fetches it (${fetched}) and the next Get saves it (${gotAway})`);
  await B.evaluate(() => { document.getElementById('deckbox').hidden = true; });
  // 2B.4, 2B.5: All photos, Show → Videos: only the video, and a strip says how many are hidden
  await B.click('#allphotos'); await until(B, () => !document.getElementById('deckbox').hidden && !document.querySelector('#deckbox .sheet').getAnimations().length, null, 5000);
  const kKinds = await B.evaluate(() => { document.getElementById('kindbtn').click(); return [...document.querySelectorAll('#kindlist button')].map((b) => b.textContent); });
  await B.click('#kindlist button[data-kind="videos"]');
  const kShown = await B.evaluate(() => ({ tiles: [...document.querySelectorAll('#decktiles button[data-pid]')].map((b) => window.__t.prints.get(b.dataset.pid).type), note: document.getElementById('kindnote').textContent, moments: document.querySelectorAll('#decktiles .moment').length }));
  await B.click('#kindall');
  const kAll = await B.evaluate(() => document.querySelectorAll('#decktiles button[data-pid]').length);
  await B.evaluate(() => { document.getElementById('deckbox').hidden = true; });
  check(kKinds.some((k) => k.startsWith('Videos')) && kShown.tiles.length >= 1 && kShown.tiles.every((t) => t.startsWith('video/')) && /^Showing \d+ videos? of \d+ items$/.test(kShown.note) && kShown.moments >= 1 && kAll > kShown.tiles.length,
    `Show lists ${JSON.stringify(kKinds)}; Videos leaves ${JSON.stringify(kShown.tiles)} ("${kShown.note}", ${kShown.moments} moment(s)); Show all brings back ${kAll}`);
  // a send that fails for another reason (here the file can't be read) doesn't blame the device
  const why = await A.evaluate(async (ghost) => {
    const t = window.__t, p = [...t.prints.values()].find((p) => p.name === 'photo-1.jpg'), real = t.files.get(p.pid);
    t.files.set(p.pid, { size: real.size, slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('file changed', 'NotReadableError')) }) });
    t.onMessage(ghost, { t: 'want', pid: p.pid });
    await new Promise((r) => setTimeout(r, 500));
    t.files.set(p.pid, real);
    return document.getElementById('toast').textContent;
  }, GHOST);
  check(why.includes('Couldn’t send photo-1.jpg') && !why.includes('stopped answering'), `a read error isn't blamed on the other device ("${why}")`);
  await ghostHere(false);

  // a stranger's malformed messages change nothing, even when aimed at a real transfer
  const ids = await A.evaluate(() => { const t = window.__t; return { a: t.id, b: Object.keys(t.net.peers).find((k) => k !== t.id) }; });
  const FID = '0123456789abcdef';
  await B.evaluate(([fid, from]) => window.__t.expect(fid, from, 50000), [FID, ids.a]);   // B is expecting this file from A
  await B.evaluate(() => { const t = window.__t; t.sent = 0; const real = t.peers.sendFile; t.peers.sendFile = (...a) => { t.sent++; return real(...a); }; });
  await A.evaluate(([fid, b]) => { const t = window.__t, junk = new Uint8Array(10), full = new Uint8Array(24576);
    t.peers.send(b, { t: 'print', pid: 'abc' });                                                   // malformed print
    t.peers.send(b, { t: 'want', pid: 'not-a-pid' });                                              // malformed request
    t.peers.send(b, { t: 'need', fid: 'x', missing: 'all' });                                      // malformed resend request
    t.peers.send(b, { t: 'need', fid: fid, missing: Array(1000).fill(0) });                         // resend request that is too big
    t.peers.sendFile(b, fid, new Blob([junk]), [0], 24576);                                         // piece too short for a 50000-byte file
    t.peers.sendFile(b, fid, new Blob([full]), [0], 1024);                                          // piece size that isn't allowed
  }, [FID, ids.b]);
  await new Promise((r) => setTimeout(r, 2000));
  const after = await B.evaluate((fid) => { const t = window.__t, inc = t.incoming.get(fid); return { prints: t.prints.size, got: inc ? inc.got : -1, sent: t.sent }; }, FID);
  check(after.prints === before, 'malformed print ignored');
  check(after.got === 0, 'bad pieces for a real transfer were dropped');
  check(after.sent === 0, 'malformed requests caused no resend');
  // a device that keeps asking for the same file can't make A send it again and again (S1.5):
  // B sends A 20 wants for photo-0.jpg within a second, then 20 needs listing every piece of
  // clip.mp4. A sends each file at most 3 times. A device that hasn't asked yet still gets it
  const pidOf = (page, name) => page.evaluate((name) => [...window.__t.prints.values()].find((p) => p.name === name).pid, name);
  const [askPid, needPid] = [await pidOf(A, 'photo-0.jpg'), await pidOf(A, 'clip.mp4')];
  await A.evaluate(() => { const t = window.__t, real = t.peers.sendFile; t.sends = {}; t.realSendFile = real;
    t.peers.sendFile = (to, fid, ...a) => { t.sends[to + ' ' + fid] = (t.sends[to + ' ' + fid] || 0) + 1; return real(to, fid, ...a); }; });
  const flood = (msg) => B.evaluate(async ([a, msg]) => { for (let k = 0; k < 20; k++) { window.__t.peers.send(a, msg); await new Promise((r) => setTimeout(r, 40)); } }, [ids.a, msg]);
  const sendsTo = (to, fid) => A.evaluate((key) => window.__t.sends[key] || 0, to + ' ' + fid);
  await flood({ t: 'want', pid: askPid });
  const clipPieces = Math.ceil(60000 / 24576);
  await flood({ t: 'need', fid: needPid, missing: [...Array(clipPieces).keys()], cs: 24576 });
  await new Promise((r) => setTimeout(r, 3000));
  const wantSends = await sendsTo(ids.b, askPid), needSends = await sendsTo(ids.b, needPid);
  // at most, not exactly: B's own drags of these files in the last minute count too
  check(wantSends >= 1 && wantSends <= 3, `20 wants for one photo made A send it ${wantSends} times (at least 1, at most 3)`);
  check(needSends >= 1 && needSends <= 3, `20 needs listing every piece made A send the file ${needSends} times (at least 1, at most 3)`);
  // B leaves and comes back with the same id (second blind review 5): A's presence list drops B and
  // shows it again, through the page's own handling of who's here. B's counters are kept, so its
  // new wants for the same photo inside the minute still send nothing
  await A.evaluate((b) => { const t = window.__t, n = t.net, all = n.peers;
    const show = (peers) => { Object.defineProperty(n, 'peers', { configurable: true, writable: true, value: peers }); n.listeners.forEach((f) => f('peers', peers)); };
    show(Object.fromEntries(Object.entries(all).filter(([k]) => k !== b)));   // B has left
    show(all); }, ids.b);                                                       // and is back
  const beforeRejoin = await sendsTo(ids.b, askPid);
  await flood({ t: 'want', pid: askPid });
  await new Promise((r) => setTimeout(r, 2000));
  const afterRejoin = await sendsTo(ids.b, askPid);
  check(afterRejoin === beforeRejoin, `B left and came back, then 20 wants made A send photo-0.jpg ${afterRejoin - beforeRejoin} more times (none: its counter was kept)`);
  await A.evaluate(() => { const t = window.__t; t.peers.sendFile = t.realSendFile; });
  const D = await device(390, 700);
  await until(D, (pid) => window.__t && window.__t.prints.has(pid), askPid, 45000);
  await D.evaluate(([pid, a]) => { const t = window.__t; t.expect(pid, a, t.prints.get(pid).size); t.peers.send(a, { t: 'want', pid }); }, [askPid, ids.a]);
  const dGot = await until(D, (pid) => window.__t.files.has(pid), askPid, 60000).then(() => true, () => false);
  const dBytes = dGot && await D.evaluate(async (pid) => [...new Uint8Array(await window.__t.files.get(pid).arrayBuffer())], askPid);
  check(dGot && sha(Buffer.from(dBytes)) === expected['photo-0.jpg'], 'a third device asked once and still got photo-0.jpg byte-identical');
  await D.context().close();
  // thumbnails over 400 x 400 are never decoded: the print shows a plain card (S14). A sends
  // B a real 400 x 400 thumbnail (decoded), a real 401 x 400 one and a 1 KB "image bomb" whose
  // header claims 30000 x 30000, and a 400 x 400 one with 30000 bytes after its end marker, where
  // Ultra HDR would keep a gain map (none decoded). B counts what reaches the image decoder
  await B.evaluate(() => { const t = window.__t, real = window.createImageBitmap; t.decoded = [];
    window.createImageBitmap = (src, ...a) => { t.decoded.push(src?.size ?? -1); return real(src, ...a); }; });
  const thumbs = await A.evaluate(async ([b, bomb]) => {
    const t = window.__t, jpeg = (w, h) => new Promise((ok) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').fillRect(0, 0, w, h); c.toBlob(async (x) => ok(new Uint8Array(await x.arrayBuffer())), 'image/jpeg', 0.7); });
    const out = {};
    for (const [label, bytes] of [['400 x 400', await jpeg(400, 400)], ['401 x 400', await jpeg(401, 400)], ['30000 x 30000 bomb', new Uint8Array(bomb)],
      ['400 x 400 with data after its end', new Uint8Array([...await jpeg(400, 400), ...new Uint8Array(30000)])]]) {
      const pid = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');
      t.peers.send(b, { t: 'print', pid, owner: t.id, anchor: t.id, name: label, type: 'image/jpeg', size: 10, sha: 'a'.repeat(64),
        x: 10, y: 10, w: 150, h: 150, rot: 0, holders: [t.id], thumbSize: bytes.length });
      t.peers.sendFile(b, 'thumb:' + pid, new Blob([bytes]));
      out[label] = { pid, size: bytes.length };
    }
    return out;
  }, [ids.b, [...sizedJpeg(30000, 30000)]]);
  const arrived = (pids) => pids.every((pid) => window.__t.prints.has(pid) && !window.__t.incoming.has('thumb:' + pid));
  await until(B, arrived, Object.values(thumbs).map((x) => x.pid));
  await until(B, (pid) => !!window.__t.prints.get(pid).img, thumbs['400 x 400'].pid, 10000).catch(() => {});
  const shown = await B.evaluate((thumbs) => Object.fromEntries(Object.entries(thumbs).map(([label, { pid, size }]) => {
    const p = window.__t.prints.get(pid);
    return [label, { img: p.img ? [p.img.width, p.img.height] : null, kept: !!p.thumb, decoded: window.__t.decoded.includes(size) }];
  })), thumbs);
  check(shown['400 x 400'].img?.[0] === 400 && shown['400 x 400'].img?.[1] === 400, `a 400 x 400 thumbnail is shown (${JSON.stringify(shown['400 x 400'])})`);
  for (const label of ['401 x 400', '30000 x 30000 bomb', '400 x 400 with data after its end'])
    check(!shown[label].img && !shown[label].kept && !shown[label].decoded, `a ${label} thumbnail isn't decoded and the print shows a plain card (${JSON.stringify(shown[label])})`);

  // tapping a print that already sits on your screen fetches it, the same as dropping it there
  // (C6, #41). A puts IMG_0004.JPG on B's screen with a plain move (no drop), and holds its reply
  // back for 2 s so B's second tap lands while the photo is still arriving: no second request.
  // A print whose middle is on A's part of the space still says to drag it, and fetches nothing
  const place = async (name, x, y) => A.evaluate(([name, b, x, y]) => {
    const t = window.__t, p = [...t.prints.values()].find((p) => p.name === name);
    p.anchor = b; p.x = x; p.y = y;
    t.peers.send(b, { t: 'move', pid: p.pid, anchor: b, x, y, final: true });
    return p.pid;
  }, [name, ids.b, x, y]);
  const tapPid = await place('IMG_0004.JPG', 220, 120);   // top right of B: clear of photos that landed in the middle
  const edgePid = await place('IMG_0005.JPG', -100, 60);   // 150 wide: its middle is 25 px onto A's screen
  await A.evaluate((pid) => { const t = window.__t, real = t.peers.sendFile;
    t.peers.sendFile = (to, fid, ...a) => fid === pid ? new Promise((r) => setTimeout(r, 2000)).then(() => real(to, fid, ...a)) : real(to, fid, ...a); }, tapPid);
  await until(B, ([a, b]) => { const t = window.__t, pa = t.prints.get(a), pb = t.prints.get(b);
    return pa?.anchor === t.id && pa.x === 220 && pb?.anchor === t.id && pb.x === -100; }, [tapPid, edgePid]);
  await B.evaluate(() => { const t = window.__t, real = t.peers.send; t.wants = [];
    t.peers.send = (to, m, ...a) => { if (m?.t === 'want') t.wants.push(m.pid); return real(to, m, ...a); }; });
  const centre = (pid) => B.evaluate((pid) => { const t = window.__t, p = t.prints.get(pid);
    t.prints.delete(pid); t.prints.set(pid, p);   // on top, so the tap picks this print
    const [wx, wy] = t.world(p), me = t.layout.pos[t.id]; return { x: Math.max(2, wx - me[0] + p.w / 2), y: wy - me[1] + p.h / 2 }; }, pid);
  const toastB = () => B.evaluate(() => document.getElementById('toast').textContent);
  let at = await centre(edgePid);
  await B.mouse.click(at.x, at.y);
  const edgeSaid = await toastB();
  check(edgeSaid === 'Drag it onto your screen first' && !(await B.evaluate(() => window.__t.wants.length)), `tapping a print on another screen says "${edgeSaid}" and fetches nothing`);
  at = await centre(tapPid);
  // while B already has as many transfers arriving as it accepts, a tap can't take the photo:
  // it says so, asks for nothing and doesn't claim it's arriving (#52 review)
  const filled = await B.evaluate(() => { const t = window.__t, fake = [];
    for (let i = 0; i < 1000; i++) { const before = t.incoming.size; t.expect('full:' + i, 'nobody', 1); if (t.incoming.size === before) break; fake.push('full:' + i); }
    return fake; });
  await B.mouse.click(at.x, at.y);
  const fullSaid = await toastB();
  const fullAsked = await B.evaluate((pid) => ({ wants: window.__t.wants.length, expecting: window.__t.incoming.has(pid) }), tapPid);
  check(fullSaid === 'Too many photos arriving. Try again in a moment' && !fullAsked.wants && !fullAsked.expecting,
    `tapping while every incoming slot is taken says "${fullSaid}" and asks for nothing (${JSON.stringify(fullAsked)})`);
  await B.evaluate((fake) => fake.forEach((f) => window.__t.incoming.delete(f)), filled);
  await B.mouse.click(at.x, at.y);
  const tapSaid = await toastB();
  check(tapSaid === 'Receiving…', `tapping a print on your screen says "${tapSaid}"`);
  const stillComing = await B.evaluate((pid) => window.__t.incoming.has(pid) && !window.__t.files.has(pid), tapPid);
  await B.mouse.click(at.x, at.y);
  const tapArrived = await until(B, (pid) => window.__t.files.has(pid), tapPid, 60000).then(() => true, () => false);
  const tapWants = await B.evaluate((pid) => window.__t.wants.filter((w) => w === pid).length, tapPid);
  check(stillComing && tapWants === 1, `taps asked for the photo ${tapWants} time(s), once wanted (second tap while still arriving: ${stillComing})`);
  const read = (page, pid) => page.evaluate(async (pid) => { const f = window.__t.files.get(pid); return f ? [...new Uint8Array(await f.arrayBuffer())] : null; }, pid);
  const tapped = tapArrived ? await read(B, tapPid) : null, sentBytes = await read(A, tapPid);
  check(!!tapped && sha(Buffer.from(tapped)) === sha(Buffer.from(sentBytes)), `IMG_0004.JPG arrived byte-identical after a tap (arrived: ${tapArrived})`);
  // A taps its own print (IMG_0005.JPG, whose middle is on A's screen)
  const own = await A.evaluate((pid) => { const t = window.__t, p = t.prints.get(pid);
    t.prints.delete(pid); t.prints.set(pid, p);
    const [wx, wy] = t.world(p), me = t.layout.pos[t.id]; return { x: wx - me[0] + p.w / 2, y: wy - me[1] + p.h / 2 }; }, edgePid);
  await A.mouse.click(own.x, own.y);
  const ownSaid = await A.evaluate(() => document.getElementById('toast').textContent);
  check(ownSaid === 'Already yours', `tapping your own print says "${ownSaid}"`);

  // dragging a whole deck across the seam sends every photo in it (2A.6)
  // two new photos, so the deck is on A's screen and B doesn't have them yet
  await A.setInputFiles('#pick', ['deck-1.jpg', 'deck-2.jpg'].map((n) => ({ name: n, mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) })));
  await until(B, () => ['deck-1.jpg', 'deck-2.jpg'].every((n) => [...window.__t.prints.values()].some((p) => p.name === n)), null, 15000).catch(() => {});
  const rest = await A.evaluate((o) => window.__t.decks().find((d) => d.owner === o && d.anchor === o && d.pids.length > 1 && d.pids.some((pid) => window.__t.prints.get(pid).name === 'deck-1.jpg'))?.pids || [], ids.a);
  const deckAt = await A.evaluate((pid) => { const t = window.__t, p = t.prints.get(pid), [wx, wy] = t.world(p), me = t.layout.pos[t.id]; return { x: wx - me[0] + p.w / 2, y: wy - me[1] + p.h / 2 }; }, rest[rest.length - 1]);
  await A.mouse.move(deckAt.x, deckAt.y); await A.mouse.down();
  for (let k = 1; k <= 12; k++) await A.mouse.move(deckAt.x + ((900 + 150 - deckAt.x) * k) / 12, deckAt.y);
  await new Promise((r) => setTimeout(r, 150)); await A.mouse.move(900 + 151, deckAt.y);
  await A.mouse.up();
  const deckCame = await until(B, (pids) => pids.every((p) => window.__t.files.has(p)), rest, 60000).then(() => true, () => false);
  await until(B, () => /^\d+ photos from .+ ✓$/.test(document.getElementById('snacktext').textContent), null, 10000).catch(() => {});
  const deckLine = await B.evaluate(() => [document.getElementById('snacktext').textContent, document.getElementById('snackact').textContent]);
  check(rest.length > 1 && deckCame && deckLine[0] === `${rest.length} photos from ${await A.evaluate(() => localStorage.getItem('heap-name'))} ✓` && deckLine[1] === 'Undo',
    `dragging A's deck of ${rest.length} onto B sends them all (${deckCame}); B says "${deckLine.join('" [')}]"`);

  // a late guest still gets photos B holds after A (the owner) leaves
  await A.context().close();
  const C = await device(390, 700);
  await until(C, () => window.__t && window.__t.prints.size >= 2, null, 45000);   // C has been told about the photos B still holds
  await until(B, () => Object.keys(window.__t.net.peers).length === 2, null, 45000);   // A has left B's view of the room
  await until(C, (a) => !(a in window.__t.net.peers), a.id, 45000);                     // and C's: hearing it late is the #61 step below
  await Promise.all([B.evaluate(() => window.__t.net.push('R', 300)), C.evaluate(() => window.__t.net.push('L', 300))]);
  await until(C, () => window.__t.net.joins.length === 1, null, 30000);
  // A (the host) left, so B is the host now (2D.10): B says Got it first
  await until(B, () => !document.getElementById('hostbox').hidden, null, 10000).then(() => B.click('#hostok'), () => {});
  await until(B, () => document.getElementById('hostbox').hidden, null, 5000);
  await drag(B, 'photo-0.jpg', 390 + 150);                                          // B drags its copy onto C
  await until(C, () => window.__t.files.size === 1, null, 60000);
  const [cname, cbytes] = await C.evaluate(async () => { const f = [...window.__t.files.values()][0]; return [f.name, [...new Uint8Array(await f.arrayBuffer())]]; });
  check(!!expected[cname] && sha(Buffer.from(cbytes)) === expected[cname], `late guest downloaded ${cname} from B byte-identical`);

  // a device whose key is late: in a fresh room, B holds back its key until A has given up on its
  // print to B, so the print is dropped. When the key comes, A must announce the print again and B
  // must end up with it (S1.3). B releases the key when the test sees A's drop, not after a fixed
  // time: a fixed 11 s raced A's 10 s give-up, which starts only when A's presence lists B, and
  // presence can arrive more than a second after B hears A's key (#92). Both run relay-only, even
  // in the direct run: holding the key doesn't stop a direct link, which could deliver the print without one
  const KEY_MAX = 40000;   // B releases its key by itself after this, so a broken give-up can't hang the test
  const holdKey = (max) => {   // runs in B's page before the app: wrap the app's signal lane once it exists
    let t, armed = false; const held = [];
    Object.defineProperty(window, '__t', { configurable: true, get: () => t, set(v) {
      t = v; const sig = v.net.signal, on = v.peers.onSignal;
      window.__releaseKey = () => { if (window.__keySent) return; window.__printsAtKey = [...t.prints.keys()]; window.__keySent = Date.now(); v.net.signal = sig; held.splice(0).forEach(([to, x]) => sig(to, x)); };
      v.net.signal = (to, d) => (d?.pub && !window.__keySent ? held.push([to, d]) : sig(to, d));
      v.peers.onSignal = (from, d) => {
        if (d?.pub && !armed) { armed = true; window.__heardKey = Date.now(); setTimeout(() => window.__releaseKey(), max); }
        return on(from, d);
      };
    } });
  };
  const late = code();
  const A2 = await device(900, 600, { at: late, relay: true });
  const dropped = [];
  A2.on('console', (m) => { if (m.text().startsWith('dropped message to')) dropped.push({ text: m.text(), at: Date.now() }); });
  await until(A2, () => window.__t && window.__t.net.status === 'live');
  await A2.setInputFiles('#pick', [files[0]]);
  await until(A2, () => window.__t.prints.size === 1);
  const pid = await A2.evaluate(() => [...window.__t.prints.keys()][0]);
  const B2 = await device(390, 700, { at: late, relay: true, init: `(${holdKey})(${KEY_MAX})` });
  const b2id = await until(B2, () => window.__t && window.__t.id).then((h) => h.jsonValue());
  // wait for A to give up on B (its 10 s SEND_TIMEOUT, from whenever A started sending), then release B's key
  const gaveUp = Date.now() + KEY_MAX;
  while (!dropped.some((d) => d.text.includes(b2id)) && Date.now() < gaveUp) await new Promise((r) => setTimeout(r, 200));
  await B2.evaluate(() => window.__releaseKey());
  await until(B2, () => window.__keySent, null, 5000);
  const drop = dropped.find((d) => d.text.includes(b2id));
  const early = await B2.evaluate((pid) => window.__printsAtKey.includes(pid), pid);   // B's prints as the key left, not now
  check(!early && !!drop, `A dropped its print to B while B's key was late (${drop?.text || 'nothing dropped within ' + KEY_MAX / 1000 + ' s'})`);
  const heard = await until(B2, (pid) => window.__t.prints.has(pid), pid, 20000).then(() => true, () => false);
  const took = await B2.evaluate(() => ((Date.now() - window.__keySent) / 1000).toFixed(1));
  check(heard, `A announced the print again once B's key came, and B has it (${took} s after the key)`);

  // Invite (S16, #102), in a fresh room. A joined device has no room code in its address bar or
  // the history entry, keeps the room for this tab (a reload goes back in, a new tab doesn't),
  // and Invite shows a QR code drawn on the device and the ?room=CODE&auto link, which joins
  // the same room. A join that fails before it's live shows the lobby again with the code filled in
  const inv = code(), invUrl = `${BASE}?room=${inv}&auto`;
  const off127 = [];   // requests to anywhere but this page's server and the room server
  const I1 = await device(900, 600, { at: inv });
  I1.on('request', (r) => { const h = new URL(r.url()).hostname; if (h !== '127.0.0.1' && !h.endsWith('.supabase.co')) off127.push(r.url()); });
  await until(I1, () => window.__t && window.__t.net.status === 'live');
  const where = (page) => page.evaluate(() => { const on = (id) => document.getElementById(id)?.hidden === false;
    return { url: location.href, room: sessionStorage.getItem('room'), lobby: on('lobby'), invite: on('top'), net: window.__t?.net?.room || null }; });
  const i1 = await until(I1, (c) => !location.href.includes(c) && sessionStorage.getItem('room') === c, inv, 10000).then(() => where(I1), () => where(I1));
  check(!i1.url.includes(inv) && i1.room === inv && !i1.lobby && i1.invite, `once joined, the address bar has no room code (${i1.url.replace(inv, '<code>')}), the tab keeps it (${i1.room === inv}), the lobby is gone (${!i1.lobby}) and Invite shows (${i1.invite})`);
  await I1.click('#menu', { timeout: 3000 }).catch(() => {}); await I1.click('#invite', { timeout: 3000 }).catch(() => {});
  const box = await I1.evaluate(() => { const c = document.getElementById('qr'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0, light = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 3] === 255) { if (d[k] < 64) dark++; else if (d[k] > 192) light++; }
    if (!light) dark = 0;   // a QR code is dark modules on a light ground: an undrawn canvas has neither
    return { box: !document.getElementById('invitebox').hidden, link: document.getElementById('link').value, w: c.width, dark, qr: typeof window.qrcode === 'function' }; }).catch(() => ({ box: false, link: invUrl, w: 0, dark: 0, qr: false }));
  check(box.box && box.link === invUrl && box.qr && box.w > 0 && box.dark > 0, `Invite shows a QR code (${box.w} px, ${box.dark} dark pixels) and the link ?room=CODE&auto (${box.link === invUrl})`);
  // The QR code sits inside the Invite dialog, above the link, not pinned to the viewport's corner
  const placed = await I1.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(), q = r('qr'), l = r('link'),
    d = document.querySelector('#invitebox > div').getBoundingClientRect(), pos = getComputedStyle(document.getElementById('qr')).position;
    return { pos, inside: q.left >= d.left && q.right <= d.right && q.top >= d.top && q.bottom <= d.bottom, above: q.bottom <= l.top }; })
    .catch(() => ({ pos: '?', inside: false, above: false }));
  check(placed.pos !== 'fixed' && placed.inside && placed.above, `the QR code is inside the Invite dialog (${placed.inside}, position ${placed.pos}) and above the link (${placed.above})`);
  // Copy: a refused clipboard selects the link and says so; a working one copies the link
  await I1.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('refused', 'NotAllowedError')) } }));
  await I1.click('#copy', { timeout: 3000 }).catch(() => {});
  const refused = await until(I1, () => document.getElementById('toast').textContent.replace('’', "'") === "Couldn't copy. The link is selected", null, 3000).then(() => true, () => false);
  const sel = await I1.evaluate(() => { const l = document.getElementById('link'); return document.activeElement === l && l.selectionStart === 0 && l.selectionEnd === l.value.length; });
  check(refused && sel, `a refused copy says "Couldn't copy. The link is selected" (${refused}) with the link selected (${sel})`);
  await I1.evaluate(() => { window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t); } } }); });
  await I1.click('#copy', { timeout: 3000 }).catch(() => {});
  const copied = await until(I1, () => window.__copied.length === 1, null, 3000).then(() => I1.evaluate(() => window.__copied[0]), () => null);
  check(copied === invUrl, `Copy puts the link on the clipboard (${copied === invUrl})`);
  check(off127.length === 0, `the QR code is made on the device: no request outside 127.0.0.1 and the room server (${off127.length ? off127.join(', ') : 'none'})`);
  // scanning the QR code opens the link: that page joins the same room without typing the code
  const I2 = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
  await I2.addInitScript(() => { try { localStorage.setItem('heap-name', 'Returning'); } catch {} });   // been here before: a link asks for the name, filled in, then joins
  I2.on('pageerror', (e) => { console.log('page error:', e.message); failed = true; });
  await I2.goto(box.link);
  const askedName = await I2.evaluate(() => document.getElementById('s-name')?.hidden === false).catch(() => false);
  await enter(I2);
  const scanned = await until(I2, () => window.__t && Object.keys(window.__t.net.peers).length === 2, null, 20000).then(() => true, () => false);
  const i2 = await where(I2);
  check(askedName && scanned && i2.net === 'photo-' + inv && !i2.url.includes(inv), `the invite link asks for the name (${askedName}), then joins the same room without typing (${scanned}), then leaves the address bar (${!i2.url.includes(inv)})`);
  // Back doesn't step to a page with the code: the joined entry was replaced, not added
  await I2.goBack().catch(() => {});
  const back = I2.url();
  check(!back.includes(inv), `Back doesn't step to a page with the code (${back.replace(inv, '<code>')})`);
  await I2.context().close();
  // a reload goes straight back into the same room; a new tab doesn't see it
  await I1.reload();
  const reloaded = await until(I1, (r) => window.__t && window.__t.net.room === r && window.__t.net.status === 'live', 'photo-' + inv, 20000).then(() => true, () => false);
  const r1 = await where(I1);
  check(reloaded && !r1.lobby && !r1.url.includes(inv), `a reload goes back into the same room (${reloaded}) with no code in the address bar (${!r1.url.includes(inv)})`);
  const tab = await I1.context().newPage();
  await tab.goto(BASE);
  await new Promise((r) => setTimeout(r, 1500));
  const t1 = await tab.evaluate(() => ({ lobby: document.getElementById('lobby')?.hidden === false, code: document.getElementById('code')?.value, net: !!window.__t }));
  check(t1.lobby && t1.code === '' && !t1.net, `a new tab doesn't see the stored room (lobby ${t1.lobby}, code "${t1.code}", joined ${t1.net})`);
  await tab.close();
  // a ?room=CODE&auto link wins over the room stored for this tab
  const inv2 = code();
  await I1.goto(`${BASE}?room=${inv2}&auto`); await enter(I1);
  const won = await until(I1, (r) => window.__t && window.__t.net.room === r && sessionStorage.getItem('room') === r.slice(6), 'photo-' + inv2, 20000).then(() => true, () => false);
  check(won, `a ?room=CODE&auto link wins over the stored room (${won})`);
  await I1.context().close();
  // a join that fails before it's live: the room server's first answer is an error, then a late
  // "subscribed" from that failed attempt. The lobby comes back with the code, the address bar
  // keeps it, nothing is stored, the late answer changes nothing and joining again works
  const failFirst = () => {
    let real; window.__fails = 1;
    Object.defineProperty(window, 'supabase', { configurable: true, get: () => real, set(v) {
      real = { ...v, createClient: (...a) => {
        const client = v.createClient(...a), channel = client.channel.bind(client);
        client.channel = (...b) => {
          const ch = channel(...b);
          if (window.__fails > 0) { window.__fails--; ch.subscribe = (cb) => { setTimeout(() => cb('CHANNEL_ERROR'), 300); setTimeout(() => cb('SUBSCRIBED'), 1500); return ch; }; ch.track = async () => {}; }
          return ch;
        };
        return client;
      } };
    } });
  };
  const F = await device(390, 700, { at: inv, init: `(${failFirst})()` });
  const lobbyBack = await until(F, () => document.getElementById('lobby')?.hidden === false && window.__fails === 0, null, 10000).then(() => true, () => false);
  await new Promise((r) => setTimeout(r, 2500));   // past the failed attempt's late "subscribed"
  const f1 = await F.evaluate(() => ({ lobby: document.getElementById('lobby')?.hidden === false, code: document.getElementById('code')?.value, url: location.href, room: sessionStorage.getItem('room'), invite: document.getElementById('top')?.hidden === false }));
  check(lobbyBack && f1.lobby && f1.code === inv && f1.url.includes(inv) && f1.room === null && !f1.invite,
    `a join that fails before live shows the lobby again with the code (${f1.code === inv}), keeps the address bar (${f1.url.includes(inv)}), stores nothing (${f1.room === null}) and a late answer from it changes nothing (lobby ${f1.lobby})`);
  await F.click('#f button', { timeout: 3000 }).catch(() => {});   // the code screen, then the name screen (#156)
  await F.click('#go', { timeout: 3000 }).catch(() => {});
  const retried = await until(F, (r) => window.__t && window.__t.net.room === r && window.__t.net.status === 'live' && sessionStorage.getItem('room') === r.slice(6) && !location.href.includes(r.slice(6)), 'photo-' + inv, 20000).then(() => true, () => false);
  const f2 = await F.evaluate(() => document.getElementById('lobby')?.hidden === false);
  check(retried && !f2, `joining again after a failed join works as if it were the first try (${retried})`);
  await F.context().close();

  // four devices in a fresh room (C15, #68): A–B, then C–D, then B–D join them all into one
  // group. Each "Joined with…" shows only on the two devices it names, all four hold the time
  // keeper's 3 joins, and a print A puts down reaches C, which is joined to A only through the group
  const four = code(), say = (page) => page.evaluate(() => document.getElementById('toast').textContent);
  // B and C can hear about devices leaving late (C5, #61): runs in the page before the app. While
  // window.__holdPresence is set, the room's "who is here" updates aren't passed to the app. Release
  // hands it the latest one, read from the room at that moment, as a device that heard late would
  const latePresence = () => {
    let real;
    Object.defineProperty(window, 'supabase', { configurable: true, get: () => real, set(v) {
      real = { ...v, createClient: (...a) => {
        const client = v.createClient(...a), channel = client.channel.bind(client);
        client.channel = (...b) => {
          const ch = channel(...b), on = ch.on.bind(ch);
          ch.on = (type, filter, cb) => (type === 'presence' && filter?.event === 'sync'
            ? on(type, filter, (...x) => { if (window.__holdPresence) window.__missed = () => cb(...x); else cb(...x); })
            : on(type, filter, cb));
          return ch;
        };
        return client;
      } };
    } });
    window.__releasePresence = () => { window.__holdPresence = false; const f = window.__missed; window.__missed = null; f?.(); };
  };
  const quad = {};
  for (const k of ['A', 'B', 'C', 'D']) {
    quad[k] = await device(400, 400, { at: four, init: 'BC'.includes(k) ? `(${latePresence})()` : undefined });
    await until(quad[k], (n) => window.__t && Object.keys(window.__t.net.peers).length === n, Object.keys(quad).length);
  }
  for (const k of 'ABCD') await until(quad[k], () => Object.keys(window.__t.net.peers).length === 4);
  const q = {};
  for (const k of 'ABCD') q[k] = await quad[k].evaluate(() => ({ id: window.__t.id, name: window.__t.net.name, leader: window.__t.net.leader }));
  const SIDES = { R: 'on your right', L: 'on your left', T: 'above you', B: 'below you' };
  const before4 = {};
  for (const [x, ex, y, ey, n] of [['A', 'R', 'B', 'L', 1], ['C', 'R', 'D', 'L', 2], ['B', 'B', 'D', 'T', 3]]) {
    for (const k of 'ABCD') before4[k] = await say(quad[k]);
    await Promise.all([quad[x].evaluate((e) => window.__t.net.push(e, 200), ex), quad[y].evaluate((e) => window.__t.net.push(e, 200), ey)]);
    for (const k of 'ABCD') await until(quad[k], (n) => window.__t.net.joins.length === n, n);
    await until(quad[x], (m) => document.getElementById('toast').textContent === m, `Joined with ${q[y].name}, ${SIDES[ex]}`, 10000).catch(() => {});
    await until(quad[y], (m) => document.getElementById('toast').textContent === m, `Joined with ${q[x].name}, ${SIDES[ey]}`, 10000).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));   // time for a wrong message to reach the others
    const now = {};
    for (const k of 'ABCD') now[k] = await say(quad[k]);
    const others = [...'ABCD'].filter((k) => k !== x && k !== y);
    check(now[x] === `Joined with ${q[y].name}, ${SIDES[ex]}` && now[y] === `Joined with ${q[x].name}, ${SIDES[ey]}` && others.every((k) => now[k] === before4[k]),
      `four devices: the ${x}–${y} join says "${now[x]}" and "${now[y]}", and nothing new on ${others.join(' and ')} (${others.map((k) => JSON.stringify(now[k])).join(', ')})`);
  }
  const views = [];
  for (const k of 'ABCD') views.push(await quad[k].evaluate(() => { const t = window.__t;
    return { joins: JSON.stringify(t.net.joins), group: t.layout.group, sizes: Object.fromEntries(Object.entries(t.net.peers).map(([i, p]) => [i, { w: p.w, h: p.h }])) }; }));
  const ids4 = Object.values(q).map((d) => d.id);
  const sizes4 = views[0].sizes, joins4 = JSON.parse(views[0].joins);
  const overlaps = overlapCount(solveLayout(ids4, joins4, sizes4), sizes4);
  check(q.B.leader === q.A.id && joins4.length === 3 && views.every((v) => v.joins === views[0].joins) && overlaps === 0,
    `four devices hold the time keeper's ${joins4.length} joins (same on all four: ${views.every((v) => v.joins === views[0].joins)}), with ${overlaps} overlapping screens`);
  check(views.every((v) => new Set(ids4.map((i) => v.group[i])).size === 1 && ids4.every((i) => v.group[i] !== undefined)),
    `four devices are one group on every page (${views.map((v) => ids4.map((i) => v.group[i]).join(',')).join(' | ')})`);
  await quad.A.setInputFiles('#pick', [files[0]]);
  const quadPid = await until(quad.A, () => window.__t.prints.size === 1 && [...window.__t.prints.keys()][0]).then((h) => h.jsonValue());
  const seen = await until(quad.C, (pid) => { const t = window.__t, p = t.prints.get(pid);
    return !!p && (t.layout.group[p.anchor] || p.anchor) === (t.layout.group[t.id] || t.id); }, quadPid, 30000).then(() => true, () => false);
  const cView = await quad.C.evaluate((pid) => { const t = window.__t, p = t.prints.get(pid); return p ? { anchor: p.anchor, group: t.layout.group[p.anchor], mine: t.layout.group[t.id] } : null; }, quadPid);
  check(seen && cView.anchor === q.A.id, `a print A puts down is visible on C, joined to A only through B and D (${JSON.stringify(cView)})`);

  // the time keeper leaves and the others hear it in different orders (C5, #61). D hears first,
  // then B (the new time keeper), which sends its layout and joins C. C hears last, so B's
  // layouts reach C while C still counts A as the time keeper. C must still end up with B's layout
  const net = (page) => page.evaluate(() => { const n = window.__t.net; return { leader: n.leader, joins: JSON.stringify(n.joins), peers: Object.keys(n.peers).length }; });
  await quad.B.evaluate(() => { window.__holdPresence = true; });
  await quad.C.evaluate(() => { window.__holdPresence = true; });
  await quad.A.context().close();
  await until(quad.D, (b) => Object.keys(window.__t.net.peers).length === 3 && window.__t.net.leader === b, q.B.id, 45000);
  await quad.B.evaluate(() => window.__releasePresence());
  await until(quad.B, (b) => Object.keys(window.__t.net.peers).length === 3 && window.__t.net.leader === b, q.B.id, 45000);
  const cHeld = await net(quad.C);
  await Promise.all([quad.B.evaluate(() => window.__t.net.push('R', 200)), quad.C.evaluate(() => window.__t.net.push('L', 200))]);
  const pairBC = ([b, c]) => window.__t.net.joins.some((j) => [j.a, j.b].sort().join() === [b, c].sort().join());
  await until(quad.B, pairBC, [q.B.id, q.C.id], 15000);
  await new Promise((r) => setTimeout(r, 1500));   // time for B's layout to reach C, which still drops or keeps it
  await quad.C.evaluate(() => window.__releasePresence());
  await until(quad.C, () => Object.keys(window.__t.net.peers).length === 3, null, 10000);
  await until(quad.C, pairBC, [q.B.id, q.C.id], 10000).catch(() => {});
  const [bNet, cNet, dNet] = [await net(quad.B), await net(quad.C), await net(quad.D)];
  check(cHeld.leader === q.A.id && cHeld.peers === 4 && cNet.leader === q.B.id && cNet.joins === bNet.joins && dNet.joins === bNet.joins && bNet.joins.includes(q.C.id) && !bNet.joins.includes(q.A.id),
    `after the time keeper left, C (which heard last) holds the new time keeper's layout, as D does (B ${bNet.joins}, C ${cNet.joins}, D ${dNet.joins}; C still counted A as time keeper: ${cHeld.leader === q.A.id})`);
  // the new time keeper leaves straight away: C takes over and C and D agree on a layout without A or B
  await quad.B.context().close();
  for (const k of 'CD') await until(quad[k], (c) => Object.keys(window.__t.net.peers).length === 2 && window.__t.net.leader === c, q.C.id, 45000);
  await new Promise((r) => setTimeout(r, 1500));
  const [cAfter, dAfter] = [await net(quad.C), await net(quad.D)];
  check(cAfter.joins === dAfter.joins && !cAfter.joins.includes(q.A.id) && !cAfter.joins.includes(q.B.id),
    `when the new time keeper leaves straight away, C takes over and C and D hold the same layout (C ${cAfter.joins}, D ${dAfter.joins})`);
  for (const k of 'CD') await quad[k].context().close();
  // Leave (#156): once in a heap there's a way out; it forgets this tab's heap and shows the two cards again
  const L = await device(390, 700, { at: code() });
  await until(L, () => window.__t && window.__t.net.status === 'live', null, 20000);
  const leaveShown = await until(L, () => document.getElementById('top')?.hidden === false, null, 10000).then(() => true, () => false);
  await L.click('#menu', { timeout: 3000 }).catch(() => {}); await L.click('#leave', { timeout: 3000 }).catch(() => {});
  const leaveSheet = await until(L, () => !document.getElementById('leavebox').hidden, null, 5000).then(() => true, () => false);
  await L.click('#leaveclear', { timeout: 3000 }).catch(() => {});
  const cleared = await until(L, () => document.getElementById('s-cleared')?.hidden === false, null, 10000).then(() => L.evaluate(() => document.getElementById('clearedsub').textContent), () => '');
  check(leaveSheet && /^Nothing from “.+’s heap” is left on this device\.$/.test(cleared), `Leave opens "Leave and clear?" (${leaveSheet}), then "All cleared" says "${cleared}"`);
  await L.click('#clearedhome', { timeout: 3000 }).catch(() => {});
  const leftHome = await until(L, () => document.getElementById("lobby")?.hidden === false, null, 10000).then(() => true, () => false);
  const l1 = await L.evaluate(() => ({ room: sessionStorage.getItem('room'), url: location.href, cards: document.getElementById('choose')?.hidden === false }));
  check(leaveShown && leftHome && l1.room === null && !l1.url.includes('room=') && l1.cards,
    `Leave shows in a heap (${leaveShown}), goes back to the home screen (${leftHome}) with the two cards (${l1.cards}), forgets the heap (${l1.room === null}) and leaves no code in the address bar (${!l1.url.includes('room=')})`);
  await L.context().close();
  // Your name (#156): a first visit (no saved name) doesn't join from a link; it asks for a name with
  // the code filled in, and the name typed is the one the other device sees
  const nr = code();
  const N1 = await device(390, 700, { at: nr });
  await until(N1, () => window.__t && window.__t.net.status === 'live', null, 20000);
  const N2 = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
  await N2.goto(`${BASE}?room=${nr}&auto`); await new Promise((r) => setTimeout(r, 1500));
  const n0 = await N2.evaluate(() => ({ lobby: document.getElementById('lobby')?.hidden === false, code: document.getElementById('code')?.value, joined: !!window.__t,
    asked: document.activeElement?.id === 'yourname', step: document.getElementById('s-name')?.hidden === false }));
  await N2.fill('#yourname', '  Ada   Lovelace ');
  await N2.click('#go', { timeout: 3000 }).catch(() => {});
  const named = await until(N1, () => Object.values(window.__t.net.peers).some((p) => p.name === 'Ada Lovelace'), null, 20000).then(() => true, () => false);
  const keptName = await N2.evaluate(() => localStorage.getItem('heap-name'));
  check(n0.lobby && n0.code === nr && !n0.joined && n0.asked && n0.step && named && keptName === 'Ada Lovelace',
    `a first visit asks for a name instead of joining (lobby ${n0.lobby}, code filled ${n0.code === nr}, joined ${n0.joined}, on the name screen ${n0.step}, name box focused ${n0.asked}), and the other device sees "Ada Lovelace" (${named}), remembered (${keptName})`);
  await N1.context().close(); await N2.context().close();
  // Start a heap (#156): the name screen, then straight into the heap with the invite sheet open on its code
  const S = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
  await S.addInitScript(() => { try { localStorage.setItem('heap-name', 'Host'); } catch {} });
  await S.goto(BASE); await new Promise((r) => setTimeout(r, 800));
  await S.click('#new', { timeout: 3000 }).catch(() => {});
  const named0 = await S.evaluate(() => document.getElementById('s-name')?.hidden === false && document.getElementById('yourname')?.value);
  await S.click('#go', { timeout: 3000 }).catch(() => {});
  const invOpen = await until(S, () => document.getElementById('invitebox')?.hidden === false && window.__t?.net.status === 'live', null, 20000).then(() => true, () => false);
  const s1 = await S.evaluate(() => ({ tiles: [...document.querySelectorAll('#invcode span')].map((x) => x.textContent).join(''), room: window.__t?.net.room }));
  check(named0 === 'Host' && invOpen && s1.room === 'photo-' + s1.tiles,
    `Start a heap asks for the name (pre-filled "${named0}"), then opens the invite sheet once live (${invOpen}) on the heap's own code (${s1.room === 'photo-' + s1.tiles})`);
  // the invite sheet shows who's in the heap: just the host at first, then the guest once they join
  const inHeap = () => S.evaluate(() => [...document.querySelectorAll('#inroom li')].map((li) => li.textContent));
  const hostAlone = await inHeap();
  const G = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
  await G.addInitScript(() => { try { localStorage.setItem('heap-name', 'Guest'); } catch {} });
  await G.goto(`${BASE}?room=${s1.tiles}&auto`);
  const linkAsk = await G.evaluate(() => ({ step: document.getElementById('s-name')?.hidden === false, name: document.getElementById('yourname').value })).catch(() => ({}));
  await G.fill('#yourname', 'Guest'); await G.click('#go');
  const waitSays = await until(G, () => document.getElementById('s-wait')?.hidden === false, null, 15000).then(() => G.evaluate(() => document.getElementById('waittitle').textContent), () => '');
  const askSays = await until(S, () => !document.getElementById('askbox').hidden, null, 15000).then(() => S.evaluate(() => document.getElementById('asktitle').textContent), () => '');
  const guestSeesNothing = await G.evaluate(() => window.__t.prints.size === 0 && document.getElementById('lobby').hidden === false);
  await S.click('#letin');
  const letIn = await until(G, () => document.getElementById('lobby').hidden && document.getElementById('s-wait').hidden, null, 10000).then(() => true, () => false);
  check(waitSays === 'Waiting for Host to let you in' && askSays === 'Guest’s phone wants to join' && guestSeesNothing && letIn,
    `the guest waits ("${waitSays}", sees nothing: ${guestSeesNothing}); the host is asked ("${askSays}") and Let in lets them in (${letIn})`);
  // 5.1–5.4: People lists everyone; checking a device shows the same four words on both screens
  const sheetsDown = (page) => until(page, () => ['peoplebox', 'personbox', 'checkbox', 'menubox', 'invitebox'].every((k) => document.getElementById(k).hidden), null, 5000);
  const openPerson = async (page, who) => { await sheetsDown(page); await page.click('#menu'); await page.click('#peoplebtn'); await until(page, () => !document.getElementById('peoplebox').hidden, null, 5000);
    await page.click(`#peoplelist button[data-who="${who}"]`); await until(page, () => !document.getElementById('personbox').hidden, null, 5000); };
  if (await S.evaluate(() => !document.getElementById('invitebox').hidden)) { await S.click('#closeinvite'); await until(S, () => document.getElementById('invitebox').hidden, null, 3000); }   // the new heap's invite sheet
  const [sId, gId] = [await S.evaluate(() => window.__t.id), await G.evaluate(() => window.__t.id)];
  await S.click('#menu'); await S.click('#peoplebtn'); await until(S, () => !document.getElementById('peoplebox').hidden, null, 5000);
  const plist = await S.evaluate(() => [document.getElementById('peopletitle').textContent, ...[...document.querySelectorAll('#peoplelist button, #peoplelist .me')].map((r) => r.querySelector('b').textContent)]);
  await S.click('#peopleback'); await sheetsDown(S);
  await openPerson(S, gId); await S.click('#pcheck'); await openPerson(G, sId); await G.click('#pcheck');
  await until(S, () => document.querySelectorAll('#checkwords span').length === 4, null, 10000); await until(G, () => document.querySelectorAll('#checkwords span').length === 4, null, 10000);
  const words = await Promise.all([S, G].map((p) => p.evaluate(() => [...document.querySelectorAll('#checkwords span')].map((x) => x.textContent).join(' '))));
  await S.click('#checkyes'); const privateSaid = await toastOf(S); await G.click('#checkcancel'); await sheetsDown(S); await sheetsDown(G);
  const badge = await S.evaluate((g) => { document.getElementById('menu').click(); document.getElementById('peoplebtn').click(); return null; }, gId).then(() => until(S, (g) => document.querySelector(`#peoplelist button[data-who="${g}"] .badge`)?.textContent === '✓ Checked', gId, 5000)).then(() => true, () => false);
  await S.click('#peopleback'); await sheetsDown(S);
  check(plist[0] === 'People (2)' && plist.length === 3 && words[0].split(' ').length === 4 && words[0] === words[1] && privateSaid === 'Your connection to Guest’s phone is private ✓' && badge,
    `People lists ${JSON.stringify(plist)}; both screens show "${words[0]}" / "${words[1]}"; Yes says "${privateSaid}" and the badge stays (${badge})`);
  // 5.9: a dropped connection says it's reconnecting, and the line goes once it's back
  await S.evaluate(() => { const n = window.__t.net; n.status = 'closed'; for (const f of n.listeners) f('status', 'closed'); });
  const recon = await until(S, () => !document.getElementById('netbanner').hidden, null, 5000).then(() => true, () => false);
  await S.evaluate(() => { const n = window.__t.net; n.status = 'live'; for (const f of n.listeners) f('status', 'live'); });
  const reconGone = await until(S, () => document.getElementById('netbanner').hidden, null, 5000).then(() => true, () => false);
  check(recon && reconGone, `a dropped connection shows "Reconnecting…" (${recon}), gone once it's back (${reconGone})`);
  check(linkAsk.step && linkAsk.name === 'Guest', `an invite link asks for the name first, filled in with the saved one (${JSON.stringify(linkAsk)})`);
  const guestShown = await until(S, () => [...document.querySelectorAll('#inroom li')].some((li) => li.textContent === 'Guest'), null, 20000).then(() => true, () => false);
  const withGuest = await inHeap();
  const head = await S.evaluate(() => ({ name: document.getElementById('heapname').textContent, sub: document.getElementById('heapsub').textContent, faces: [...document.querySelectorAll('#people i')].map((x) => x.textContent) }));
  check(hostAlone.length === 2 && hostAlone[0] === 'Host (you)' && /Just you so far/.test(hostAlone[1]) && guestShown && withGuest.length === 2 && withGuest[0] === 'Host (you)',
    `the invite sheet lists who's in the heap: first ${JSON.stringify(hostAlone)}, then the guest appears (${guestShown}): ${JSON.stringify(withGuest)}`);
  check(head.name === 'Host’s heap' && head.sub === '2 here · 0 shared' && head.faces.join() === 'H,G', `the header names the heap ("${head.name}"), says "${head.sub}" and shows ${head.faces.join(', ')}`);
  // 4.2–4.5: Join a screen from the menu, tap the facing edges on both: they join. Tapping alone: no match
  const joinMode = async (page) => { if (await page.evaluate(() => !document.getElementById('invitebox').hidden)) { await page.click('#closeinvite'); await until(page, () => document.getElementById('invitebox').hidden, null, 3000); } }
  const joinModeOpen = (page) => page.click('#menu').then(() => page.click('#joinhow')).then(() => until(page, () => !document.getElementById('joinmode').hidden && document.getElementById('menubox').hidden, null, 5000));
  await joinMode(S); await joinMode(G); await joinModeOpen(S); await joinModeOpen(G);
  const jm = await S.evaluate(() => ({ strips: document.querySelectorAll('#joinmode .strip').length, title: document.getElementById('jointitle').textContent }));
  await S.click('#joinmode .strip[data-edge="R"]');
  const counting = await S.evaluate(() => document.getElementById('jointitle').textContent);
  await G.click('#joinmode .strip[data-edge="L"]');
  const stripJoined = await until(S, () => window.__t.net.joins.length === 1 && document.getElementById('joinmode').hidden, null, 15000).then(() => true, () => false);
  const joinSnack = await S.evaluate(() => document.getElementById('snack').hidden ? '' : document.getElementById('snacktext').textContent);
  const spoke = await until(S, () => /Joined with Guest’s phone, on your right\./.test(document.getElementById('say').textContent), null, 3000).then(() => true, () => false);
  check(spoke, `6.4: S says it out loud too ("${await S.evaluate(() => document.getElementById('say').textContent)}")`);
  check(jm.strips === 4 && jm.title === 'Which side is the other screen?' && /^2$|^1$/.test(counting) && stripJoined && joinSnack === 'Joined with Guest, on your right',
    `join mode shows ${jm.strips} strips ("${jm.title}"), counts down ("${counting}"), the facing taps join (${stripJoined}) and S says "${joinSnack}"`);
  // 4.4: the joined line has Undo: both screens come apart again
  const undoShown = await S.evaluate(() => !document.getElementById('snackact').hidden);
  await S.click('#snackact');
  const apart = await until(G, () => window.__t.net.joins.length === 0, null, 10000).then(() => true, () => false);
  const apartS = await S.evaluate(() => window.__t.net.joins.length === 0);
  check(undoShown && apart && apartS, `Undo on "Joined with Guest" (${undoShown}) takes the screens apart on both (${apart}, ${apartS})`);
  // 2C: join again, then a third screen that isn't joined. The map shows all three; the table names its neighbour;
  // dragging with 3 screens brings the map up and a drop on the far screen's tile sends it there
  await joinModeOpen(S); await joinModeOpen(G);
  await S.click('#joinmode .strip[data-edge="R"]'); await G.click('#joinmode .strip[data-edge="L"]');
  await until(S, () => window.__t.net.joins.length === 1 && document.getElementById('joinmode').hidden, null, 15000);
  const T3 = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
  await T3.addInitScript(() => { try { localStorage.setItem('heap-name', 'Third'); } catch {} });
  await T3.goto(`${BASE}?room=${s1.tiles}&auto`); await enter(T3);
  await until(S, () => !document.getElementById('askbox').hidden, null, 15000); await S.click('#letin');
  await until(S, () => Object.keys(window.__t.net.peers).length === 3, null, 20000);
  const labels = await S.evaluate(() => window.__t.edgeLabels());
  await S.click('#mapbtn'); await until(S, () => !document.getElementById('mapbox').hidden, null, 5000);
  const mapSays = await S.evaluate(() => ({ title: document.getElementById('maptitle').textContent, key: document.getElementById('mapkey').textContent, tiles: window.__t.mapTiles().map((t) => [t.id === window.__t.id ? 'me' : t.name, t.joined]) }));
  await S.click('#mapbox .handle').catch(() => {}); await S.evaluate(() => { document.getElementById('mapbox').hidden = true; });
  check(labels.length === 1 && labels[0].side === 'R' && mapSays.title === 'Host’s heap · 3 screens' && /Third isn’t joined yet/.test(mapSays.key) && mapSays.tiles.length === 3,
    `S's table names its neighbour (${JSON.stringify(labels.map((l) => l.side))}); the map says "${mapSays.title}", "${mapSays.key}" with ${JSON.stringify(mapSays.tiles)}`);
  await S.setInputFiles('#pick', [{ name: 'map.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) }]);
  await until(S, () => [...window.__t.prints.values()].some((p) => p.name === 'map.jpg'), null, 10000);
  const mp = await S.evaluate(() => { const t = window.__t, p = [...t.prints.values()].find((p) => p.name === 'map.jpg'), [wx, wy] = t.world(p), me = t.layout.pos[t.id]; return { pid: p.pid, x: wx - me[0] + p.w / 2, y: wy - me[1] + p.h / 2 }; });
  await S.mouse.move(mp.x, mp.y); await S.mouse.down(); await S.mouse.move(mp.x + 20, mp.y + 20);
  const dm = await until(S, () => !document.getElementById('dropmap').hidden && !document.getElementById('dropmap').getAnimations().length, null, 3000).then(() => true, () => false);   // up, and done sliding
  const t3At = await S.evaluate(() => { const t = window.__t.mapHitBox(window.__t.mapTiles().find((x) => x.name === 'Third').id); return t; });
  if (t3At) { for (let k = 1; k <= 6; k++) await S.mouse.move(mp.x + 20 + (t3At.x - mp.x - 20) * k / 6, mp.y + 20 + (t3At.y - mp.y - 20) * k / 6); await new Promise((r) => setTimeout(r, 150)); await S.mouse.move(t3At.x + 1, t3At.y); }
  await S.mouse.up();
  const mapped = await until(T3, (pid) => window.__t.files.has(pid), mp.pid, 30000).then(() => true, () => false);
  check(dm && !!t3At && mapped, `dragging brings the map up (${dm}) and a drop on Third's tile sends it there (${mapped})`);
  await T3.context().close();
  await S.evaluate(() => window.__t.net.unjoin(Object.keys(window.__t.net.peers).find((k) => k !== window.__t.id)));
  await until(S, () => window.__t.net.joins.length === 0, null, 10000);
  // remove your own photos: G picks its 2 in its deck and removes them; S's table loses them; Undo brings them back
  await G.setInputFiles('#pick', ['g1.jpg', 'g2.jpg'].map((n) => ({ name: n, mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) })));
  await until(S, () => ['g1.jpg', 'g2.jpg'].every((n) => [...window.__t.prints.values()].some((p) => p.name === n)), null, 15000);
  const gd = await G.evaluate(() => { const t = window.__t, d = t.decks().find((d) => d.owner === t.id && d.pids.length === 2), [wx, wy] = t.world(d.top), me = t.layout.pos[t.id]; return { pids: d.pids, x: wx - me[0] + 75, y: wy - me[1] + 75 }; });
  await G.mouse.click(gd.x, gd.y); await until(G, () => !document.getElementById('deckbox').hidden && !document.querySelector('#deckbox .sheet').getAnimations().length, null, 5000);
  await G.click('#pickall');
  const rmSays = await G.evaluate(() => document.getElementById('removepick').hidden ? '' : document.getElementById('removepick').textContent);
  await G.click('#removepick');
  const rmGone = await until(S, (pids) => pids.every((p) => !window.__t.prints.has(p)), gd.pids, 10000).then(() => true, () => false);
  const rmLine = await G.evaluate(() => document.getElementById('snacktext').textContent);
  await G.click('#snackact');
  const backAgain = await until(S, (pids) => pids.every((p) => window.__t.prints.has(p)), gd.pids, 10000).then(() => true, () => false);
  check(rmSays === 'Remove 2' && rmGone && /^Removed 2 photos\./.test(rmLine) && backAgain, `"${rmSays}" takes G's photos off S's table (${rmGone}), G says "${rmLine}", and Undo puts them back (${backAgain})`);
  // the joined side shows in join mode; tapping it asks before it's joined to someone else
  await joinModeOpen(S); await joinModeOpen(G);
  await S.click('#joinmode .strip[data-edge="R"]'); await G.click('#joinmode .strip[data-edge="L"]');
  await until(S, () => window.__t.net.joins.length === 1 && document.getElementById('joinmode').hidden, null, 15000);
  await joinModeOpen(S);
  const rjSideShown = await S.evaluate(() => { const st = document.querySelector('#joinmode .strip[data-edge="R"]'); return [st.classList.contains('joined'), st.textContent]; });
  await S.click('#joinmode .strip[data-edge="R"]');
  const rjWarned = await until(S, () => !document.getElementById('rejoinbox').hidden, null, 3000).then(() => S.evaluate(() => document.getElementById('rejoinsub').textContent), () => '');
  await S.click('#rejoinkeep');
  const rjKept = await S.evaluate(() => window.__t.net.joins.length === 1 && document.getElementById('rejoinbox').hidden);
  await S.click('#joincancel'); await S.evaluate(() => window.__t.net.unjoin(Object.keys(window.__t.net.peers).find((k) => k !== window.__t.id)));
  await until(S, () => window.__t.net.joins.length === 0, null, 10000);
  check(rjSideShown[0] && rjSideShown[1] === 'Joined · Guest' && /You’ll lose the join with Guest/.test(rjWarned) && rjKept,
    `join mode shows the joined side ("${rjSideShown[1]}"); tapping it warns ("${rjWarned}") and Keep keeps the join (${rjKept})`);
  await joinModeOpen(S);
  await S.click('#joinmode .strip[data-edge="T"]');
  const noMatch = await until(S, () => document.getElementById('jointitle').textContent === 'No match' && !document.getElementById('jointry').hidden, null, 15000).then(() => true, () => false);
  await S.click('#joincancel');
  const cancelled = await until(S, () => document.getElementById('joinmode').hidden, null, 3000).then(() => true, () => false);
  check(noMatch && cancelled, `a tap with no other screen says "No match" with Try again (${noMatch}), and Cancel closes join mode (${cancelled})`);
  // 1.3: typing a code for a heap nobody is in goes back to the code screen and says so
  const NF = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
  await NF.addInitScript(() => { try { localStorage.setItem('heap-name', 'Typo'); } catch {} });
  await NF.goto(BASE);
  await NF.click('#joinwith'); await NF.fill('#code', 'ZZZZZ22222'); await NF.click('#f button'); await NF.click('#go');
  const nf = await until(NF, () => document.getElementById('lobby')?.hidden === false && document.getElementById('s-code')?.hidden === false && document.getElementById('codeerr')?.hidden === false, null, 20000).then(() => true, () => false);
  const nf1 = await NF.evaluate(() => ({ code: document.getElementById('code').value, room: sessionStorage.getItem('room'), url: location.href }));
  check(nf && nf1.code === 'ZZZZZ22222' && nf1.room === null && !nf1.url.includes('ZZZZZ'), `a typed code for an empty heap comes back to the code screen with the error (${nf}), keeps the code (${nf1.code}) and stores nothing (${nf1.room})`);
  await NF.context().close();
  // 4.7, 4.11, 4.12: the host puts G's screen below its own; G is mvAsked, says Move it, and can undo
  await sheetsDown(S); await sheetsDown(G);
  await S.click('#mapbtn'); await until(S, () => !document.getElementById('mapbox').hidden && !document.querySelector('#mapbox .sheet').getAnimations().length, null, 5000);
  const [gBox, sBox] = await S.evaluate(([g, me]) => [window.__t.mapTileBox(g), window.__t.mapTileBox(me)], [gId, sId]);
  await S.mouse.move(gBox.x, gBox.y); await S.mouse.down();
  for (let k = 1; k <= 8; k++) await S.mouse.move(gBox.x + (sBox.x - gBox.x) * k / 8, gBox.y + (sBox.y + sBox.h / 2 + 30 - gBox.y) * k / 8);
  await S.mouse.up();
  const askLine = await until(S, () => !document.getElementById('mapask').hidden, null, 5000).then(() => S.evaluate(() => document.getElementById('mapasktext').textContent), () => '');
  await S.click('#mapaskgo');
  const mvAsked = await until(G, () => !document.getElementById('movebox').hidden, null, 10000).then(() => G.evaluate(() => [document.getElementById('movetitle').textContent, document.getElementById('moveyes').textContent, document.getElementById('movecv').width > 0]), () => []);
  await G.click('#moveyes');
  const mvMoved = await until(S, ([g, me]) => window.__t.net.joins.some((j) => [j.a, j.b].includes(g) && [j.a, j.b].includes(me)), [gId, sId], 10000).then(() => true, () => false);
  const mvMovedSaid = await until(G, () => /^Moved below /.test(document.getElementById('snacktext').textContent) && !document.getElementById('snack').hidden, null, 5000).then(() => G.evaluate(() => document.getElementById('snacktext').textContent), () => '');
  await G.click('#snackact');
  const mvUnmoved = await until(S, () => window.__t.net.joins.length === 0, null, 10000).then(() => true, () => false);
  check(askLine === 'Ask Guest to move below your phone' && mvAsked[0] === 'The host wants to move your screen' && mvAsked[1] === 'Move it' && mvAsked[2] && mvMoved && mvMovedSaid === 'Moved below Host’s phone' && mvUnmoved,
    `G is mvAsked ("${mvAsked[0]}", "${mvAsked[1]}"), the move joins them (${mvMoved}), G says "${mvMovedSaid}" and Undo takes it back (${mvUnmoved})`);
  // 4.9: S invites its own other device: it's let in by itself and lines up on S's right
  await sheetsDown(S); await S.click('#joinbtn'); await until(S, () => !document.getElementById('joinmode').hidden, null, 5000);
  await S.click('#joinpair');
  const pairLink = await until(S, () => /&pair=/.test(document.getElementById('pairlink').value), null, 5000).then(() => S.evaluate(() => [document.getElementById('pairlink').value, document.querySelector('#pairbox h2').textContent]), () => ['', '']);
  await S.click('#pairclose'); await sheetsDown(S);
  const P2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await P2.goto(pairLink[0]);
  const pairName = await until(P2, () => document.getElementById('s-name')?.hidden === false && document.getElementById('yourname').value, null, 10000).then(() => P2.evaluate(() => document.getElementById('yourname').value), () => '');
  await P2.click('#go');
  const pIn = await until(P2, () => window.__t && window.__t.net.status === 'live' && document.getElementById('lobby').hidden, null, 20000).then(() => true, () => false);
  const askedHost = await S.evaluate(() => !document.getElementById('askbox').hidden);
  const pId = await P2.evaluate(() => window.__t?.id);
  const lined = await until(S, ([p, me]) => window.__t.net.joins.some((j) => j.a === p && j.b === me && j.edgeA === 'L'), [pId, sId], 15000).then(() => true, () => false);
  check(pairLink[1] === 'Add your other device' && pairName === 'Host (2)' && pIn && !askedHost && lined,
    `"${pairLink[1]}" gives a link; the other device is named "${pairName}", let in without asking (${pIn}, host asked: ${askedHost}) and lined up on S's right (${lined})`);
  await P2.context().close();
  await until(S, () => window.__t.net.joins.length === 0, null, 15000);
  // 3.1, 3.4: S writes a note from the share sheet: G gets it as plain text. A program is refused (3.9)
  await sheetsDown(S); await S.click('#share'); await until(S, () => !document.getElementById('sharebox').hidden, null, 5000);
  await S.click('#sharelink'); await until(S, () => !document.getElementById('textbox').hidden, null, 5000);
  await S.fill('#textfield', 'https://maps.example.com/gate'); await S.click('#textshare');
  const noteAt = await until(G, () => [...window.__t.prints.values()].some((p) => p.text === 'https://maps.example.com/gate' && p.type === 'text/plain'), null, 10000).then(() => true, () => false);
  await S.setInputFiles('#pickfile', [{ name: 'setup.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') }]);
  const refusedSaid = await until(S, () => document.getElementById('toast').textContent.startsWith('setup.exe'), null, 5000).then(() => toastOf(S), () => toastOf(S));
  check(noteAt && refusedSaid === 'setup.exe was refused. Programs and scripts can’t be shared here', `a link reaches G as plain text (${noteAt}); a program is refused ("${refusedSaid}")`);
  // 5.6: S blocks G: G's photos go from S's table and nothing new from G arrives
  await G.setInputFiles('#pick', [{ name: 'before.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) }]);
  await until(S, () => [...window.__t.prints.values()].some((p) => p.name === 'before.jpg'), null, 10000);
  await openPerson(S, gId); await S.click('#pblock'); await until(S, () => !document.getElementById('blockbox').hidden, null, 5000); await S.click('#blockyes');
  const hiddenNow = await until(S, (g) => !window.__t.decks().some((d) => d.owner === g), gId, 5000).then(() => true, () => false);
  await G.setInputFiles('#pick', [{ name: 'after.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) }]);
  await new Promise((r) => setTimeout(r, 3000));
  const sawAfter = await S.evaluate(() => [...window.__t.prints.values()].some((p) => p.name === 'after.jpg'));
  check(hiddenNow && !sawAfter, `after S blocks G, G's photos are gone from S (${hiddenNow}) and a new one doesn't arrive (${!sawAfter})`);
  // 1.5: someone else called Guest is sent back to pick another name; 1.7: Not now turns a device away
  const D2 = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
  await D2.addInitScript(() => { try { localStorage.setItem('heap-name', 'guest'); } catch {} });
  await D2.goto(`${BASE}?room=${s1.tiles}&auto`); await enter(D2);
  const taken = await until(D2, () => document.getElementById('s-name')?.hidden === false && !document.getElementById('nameerr').hidden, null, 20000).then(() => D2.evaluate(() => document.getElementById('nameerr').textContent), () => '');
  check(taken === 'Someone in this heap is already called Guest. Pick a different name.', `a second "guest" is asked for another name ("${taken}")`);
  await D2.fill('#yourname', 'Dee'); await D2.click('#go');
  await until(S, () => !document.getElementById('askbox').hidden && document.getElementById('asktitle').textContent.startsWith('Dee'), null, 20000);
  await S.click('#notnow');
  const turned = await until(D2, () => document.getElementById('s-home')?.hidden === false && document.getElementById('toast').textContent, null, 15000).then(() => D2.evaluate(() => document.getElementById('toast').textContent), () => '');
  check(turned === 'Host didn’t let you in this time', `Not now sends Dee back to the home screen ("${turned}")`);
  await D2.context().close();
  // 2D.11, 2D.12: the host ends the heap: G is told it closes in five minutes, adding stops, and at the end G sees it has ended
  await sheetsDown(S); await S.click('#menu'); await S.click('#endheap'); await until(S, () => !document.getElementById('endbox').hidden, null, 5000);
  const endAsk = await S.evaluate(() => document.getElementById('endtitle').textContent);
  await S.click('#endyes');
  const endLine = await until(G, () => !document.getElementById('endbanner').hidden, null, 10000).then(() => G.evaluate(() => [document.getElementById('endbanner').textContent, document.getElementById('share').disabled]), () => ['', false]);
  await G.evaluate(() => window.__t.endNow());
  const endedSaid = await until(G, () => document.getElementById('s-ended')?.hidden === false, null, 10000).then(() => G.evaluate(() => document.getElementById('endedsub').textContent), () => '');
  check(endAsk === 'End “Host’s heap” for everyone?' && /^Host ended the heap\. It closes in [45]:\d\d\.$/.test(endLine[0]) && endLine[1] && /^Nothing from “Host’s heap” is kept\.$/.test(endedSaid),
    `ending asks "${endAsk}"; G sees "${endLine[0]}" with adding off (${endLine[1]}), then "${endedSaid}"`);
  await G.context().close();
  // #160 review: on a short phone the whole invite sheet can be reached; a toast goes after its time; the glyph is sharp after Back
  const SP = await (await browser.newContext({ viewport: { width: 375, height: 560 } })).newPage();
  await SP.addInitScript(() => { try { localStorage.setItem('heap-name', 'Short'); } catch {} });
  await SP.goto(BASE); await SP.click('#new'); await SP.click('#go');
  await until(SP, () => !document.getElementById('invitebox').hidden && window.__t?.net.status === 'live', null, 20000);
  await new Promise((r) => setTimeout(r, 600));
  const fits = await SP.evaluate(() => { const r = document.querySelector('#invitebox .sheet').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; });
  await SP.evaluate(() => document.getElementById('closeinvite').scrollIntoView());
  await SP.click('#closeinvite');
  const closed = await until(SP, () => document.getElementById('invitebox').hidden, null, 3000).then(() => true, () => false);
  await SP.click('#menu'); await SP.click('#invite'); await until(SP, () => !document.getElementById('invitebox').hidden, null, 3000);   // Invite lives in the menu now
  await SP.evaluate(() => document.getElementById('copycode').scrollIntoView()); await SP.click('#copycode');   // says Code copied (or couldn't)
  await new Promise((r) => setTimeout(r, 3500));
  const toastGone = await SP.evaluate(() => getComputedStyle(document.getElementById('toast')).opacity === '0');
  check(fits && closed && toastGone, `on a short phone the invite sheet fits (${fits}) and Close can be reached (${closed}); a toast goes after its time (${toastGone})`);
  await SP.context().close();
  const GL = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
  await GL.goto(`${BASE}?room=ABCDEFGHJK&auto`);
  await until(GL, () => document.getElementById('s-name')?.hidden === false, null, 10000);
  await GL.click('#s-name .back');
  const sharp = await until(GL, () => document.getElementById('heap-a').width > 40, null, 5000).then(() => true, () => false);
  check(sharp, `after an invite link and Back, the wordmark's a is drawn at its size (${sharp})`);
  await GL.context().close();
  await S.context().close();
  // 2D.9, 2D.10: the host leaves: the other device is told, and it's the host now
  const hostPage = async (n) => { const p = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage(); await p.addInitScript((n) => { try { localStorage.setItem('heap-name', n); localStorage.setItem('heap-open', '1'); } catch {} }, n); return p; };
  const X = await hostPage('Xena'); await X.goto(BASE); await X.click('#new'); await X.click('#go');
  await until(X, () => window.__t?.net.status === 'live' && !document.getElementById('invitebox').hidden, null, 20000);
  const xc = await X.evaluate(() => [...document.querySelectorAll('#invcode span')].map((x) => x.textContent).join(''));
  const Y = await hostPage('Yuri'); await Y.goto(`${BASE}?room=${xc}&auto`); await enter(Y);
  await until(Y, () => window.__t?.net.status === 'live' && document.getElementById('lobby').hidden && Object.keys(window.__t.net.peers).length === 2, null, 20000);
  await X.context().close();
  const hostNow = await until(Y, () => !document.getElementById('hostbox').hidden, null, 45000).then(() => Y.evaluate(() => [document.getElementById('hostsub').textContent, window.__t.toasts.some((t) => t === 'Xena left. Yuri is now the host.')]), () => ['', false]);
  check(hostNow[0] === 'Xena left, so you look after the heap.' && hostNow[1], `when the host leaves, the other device is told (${hostNow[1]}) and sees "You’re the host now": "${hostNow[0]}"`);
  await Y.context().close();
  // L1, L2: on a laptop the actions sit in the top bar, and a deck opens full width with Picked on the right
  const W1 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await W1.addInitScript(() => { try { localStorage.setItem('heap-name', 'Wide'); } catch {} });
  await W1.goto(BASE); await W1.click('#new'); await W1.click('#go');
  await until(W1, () => window.__t?.net.status === 'live' && !document.getElementById('invitebox').hidden, null, 20000);
  await W1.click('#closeinvite'); await until(W1, () => document.getElementById('invitebox').hidden, null, 3000);
  const top = await W1.evaluate(() => ({ share: !!document.querySelector('#top #share'), picked: !!document.querySelector('#top #pickedbtn'), bar: getComputedStyle(document.getElementById('bar')).display }));
  await W1.setInputFiles('#pick', ['w1.jpg', 'w2.jpg', 'w3.jpg'].map((n) => ({ name: n, mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) })));
  await until(W1, () => window.__t.prints.size === 3, null, 10000);
  const wd = await W1.evaluate(() => { const t = window.__t, d = t.decks()[0], [wx, wy] = t.world(d.top), me = t.layout.pos[t.id]; return { x: wx - me[0] + 75, y: wy - me[1] + 75 }; });
  await W1.mouse.click(wd.x, wd.y); await until(W1, () => !document.getElementById('deckbox').hidden && !document.querySelector('#deckbox .sheet').getAnimations().length, null, 5000);
  await W1.click('#decktiles button[data-pid]');
  const panel = await W1.evaluate(() => { const r = document.querySelector('#deckbox .sheet').getBoundingClientRect(), p = document.getElementById('pickpanel'); return { w: Math.round(r.width), shown: getComputedStyle(p).display !== 'none', title: document.getElementById('pptitle').textContent, tiles: document.querySelectorAll('#pptiles img, #pptiles span').length }; });
  check(top.share && top.picked && top.bar === 'none' && panel.w === 1280 && panel.shown && panel.title === 'Picked · 1' && panel.tiles === 1,
    `on a laptop the actions are in the top bar (${top.share}, ${top.picked}, bar ${top.bar}); a deck opens ${panel.w} px wide with Picked on the right ("${panel.title}", ${panel.tiles} tile)`);
  // 6.1, 6.3, 6.5, 6.7: the laptop with a keyboard and a screen reader
  await W1.evaluate(() => { document.getElementById('deckbox').hidden = true; });
  const deckBtn = await until(W1, () => document.querySelectorAll('#decklayer .deckbtn').length === 1, null, 5000).then(() => W1.evaluate(() => document.querySelector('#decklayer .deckbtn').getAttribute('aria-label')), () => '');
  await W1.keyboard.press('m');
  const mapByKey = await until(W1, () => !document.getElementById('mapbox').hidden, null, 3000).then(() => true, () => false);
  await W1.keyboard.press('Escape');
  const mapClosed = await until(W1, () => document.getElementById('mapbox').hidden, null, 3000).then(() => true, () => false);
  await W1.keyboard.press('?');
  const keys = await until(W1, () => !document.getElementById('keysbox').hidden, null, 3000).then(() => W1.evaluate(() => document.querySelectorAll('#keyslist li').length), () => 0);
  await W1.keyboard.press('Escape');
  await W1.evaluate(() => document.querySelector('#decklayer .deckacts').click());
  const acts = await until(W1, () => !document.getElementById('deckacts').hidden, null, 3000).then(() => W1.evaluate(() => [document.getElementById('dapick').textContent, document.getElementById('dahide').hidden]), () => ['', false]);
  await W1.click('#dapick');
  const pickedAll = await W1.evaluate(() => document.getElementById('pickedbtn').textContent);
  await W1.click('#menu'); await W1.click('#listview');
  const rows = await until(W1, () => !document.getElementById('decklist').hidden, null, 3000).then(() => W1.evaluate(() => [...document.querySelectorAll('#decklist [role=listitem]')].map((r) => r.textContent)), () => []);
  check(deckBtn === 'Your deck, 3 photos.' && mapByKey && mapClosed && keys === 9 && acts[0] === 'Pick all 3' && acts[1] && /Picked · 3/.test(pickedAll) && rows.length === 1 && /Your photos · 3/.test(rows[0]) && /On this laptop/.test(rows[0]),
    `the deck reads "${deckBtn}"; M opens the map (${mapByKey}) and Esc closes it (${mapClosed}); ? lists ${keys} shortcuts; its actions say "${acts[0]}" (no Hide for my own: ${acts[1]}) and pick them ("${pickedAll}"); the list view shows ${JSON.stringify(rows)}`);
  await W1.context().close();
  // 2D.5 and 2D.13: two phones. M1 hosts; M2 can hold only a tiny amount (memcap), so a photo it asks for waits
  const mPage = async (n, q = '') => { const p = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage(); await p.addInitScript((n) => { try { localStorage.setItem('heap-name', n); localStorage.setItem('heap-open', '1'); } catch {} }, n); p._q = q; return p; };
  const M1 = await mPage('Mo'); await M1.goto(BASE); await M1.click('#new'); await M1.click('#go');
  await until(M1, () => window.__t?.net.status === 'live' && !document.getElementById('invitebox').hidden, null, 20000);
  const mc = await M1.evaluate(() => [...document.querySelectorAll('#invcode span')].map((x) => x.textContent).join(''));
  await M1.click('#closeinvite');
  const M2 = await mPage('Nell'); await M2.goto(`${BASE}?room=${mc}&auto&memcap=1`); await enter(M2);
  await until(M2, () => window.__t?.net.status === 'live' && document.getElementById('lobby').hidden && Object.keys(window.__t.net.peers).length === 2, null, 20000);
  await M1.setInputFiles('#pick', [{ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) }]);
  await until(M2, () => window.__t.prints.size === 1, null, 15000);
  await M2.evaluate(() => { const t = window.__t, p = [...t.prints.values()][0]; p.anchor = t.id; p.x = 60; p.y = 200; t.dropped(p, true); });   // on my screen, then asked for
  const mem = await until(M2, () => !document.getElementById('membox').hidden, null, 5000).then(() => M2.evaluate(() => [document.getElementById('memtitle').textContent, document.getElementById('memsub').textContent]), () => ['', '']);
  check(/^This tab is nearly full\./.test(mem[0]) && /^Paused at 0 of 1/.test(mem[1]), `2D.13: a nearly full tab pauses: "${mem[0]}" "${mem[1]}"`);
  // M2's own photo sits on M1's screen; M1 leaves; it comes back to M2
  await M2.setInputFiles('#pick', [{ name: 'mine.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(iphoneJpeg()) }]);
  const mine = await until(M2, () => [...window.__t.prints.values()].some((p) => p.name === 'mine.jpg'), null, 10000).then(() => M2.evaluate(() => { const t = window.__t, p = [...t.prints.values()].find((p) => p.name === 'mine.jpg'); p.anchor = Object.keys(t.net.peers).find((k) => k !== t.id); return p.pid; }));
  await M1.context().close();
  const mBack = await until(M2, (pid) => window.__t.prints.get(pid)?.anchor === window.__t.id && /left$/.test(document.getElementById('snacktext').textContent), mine, 60000).then(() => M2.evaluate(() => document.getElementById('snacktext').textContent), () => '');
  check(mBack === 'Mo’s phone left', `2D.5: my photo on a screen that left comes back to mine ("${mBack}")`);
  await M2.context().close();
} catch (e) {
  check(false, e.message.split('\n')[0]);
} finally {
  await browser.close(); server.close();
}
process.exit(failed ? 1 : 0);
