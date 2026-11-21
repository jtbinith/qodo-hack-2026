// The two-browser test: two browser windows play two devices. They join a room, join
// screens, one shares photos and a video, drags them onto the other screen, and the other
// must end up with byte-identical files. An iPhone-style JPEG must arrive with its location
// and camera details removed, still upright, unless "Keep details" is ticked (S6). Also checks a stranger's malformed messages are
// ignored, that a send to a device that never answers gives up after 10 s without holding up
// anyone else (S1.3), that a print dropped while a device's key was late is announced again
// once the key comes (S1.3), that a thumbnail over 400 x 400 is never decoded (S14), that a device asking again and again
// for the same file gets it at most 3 times a minute (S1.5) and that a late guest can still download photos after their owner leaves.
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
async function device(w, h, { at = room, init, relay = RELAY } = {}) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  page.on('pageerror', (e) => { console.log('page error:', e.message); failed = true; });
  if (init) await page.addInitScript(init);
  await page.goto(`${BASE}?room=${at}&auto${relay ? '&relay' : ''}`);
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
// scratch for #92: only the late-key step, with A's presence delivered PRESENCE_DELAY ms late
const PRESENCE_DELAY = Number(process.env.PRESENCE_DELAY || 0);
const delayPresence = (ms) => { let sb; Object.defineProperty(window, 'supabase', { configurable: true, get: () => sb, set(v) {
  sb = { ...v, createClient: (...a) => { const c = v.createClient(...a), ch0 = c.channel.bind(c);
    c.channel = (...b) => { const ch = ch0(...b), on0 = ch.on.bind(ch); ch.on = (type, filter, cb) => on0(type, filter, type === 'presence' ? (...x) => setTimeout(() => cb(...x), ms) : cb); return ch; }; return c; } }; } }); };
try {
  const files = [{ name: 'photo-0.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(sizedJpeg(400, 300)) }];
  // a device whose key is late: in a fresh room, B holds back its key for 11 s after A's
  // arrives, so A's print to B is dropped at 10 s. When the key comes, A must announce the
  // print again and B must end up with it (S1.3). Both run relay-only, even in the direct run:
  // holding the key doesn't stop a direct link, which could deliver the print without one
  const KEY_LATE = 11000;
  const holdKey = (late) => {   // runs in B's page before the app: wrap the app's signal lane once it exists
    let t, heard = 0; const held = [];
    Object.defineProperty(window, '__t', { configurable: true, get: () => t, set(v) {
      t = v; const sig = v.net.signal, on = v.peers.onSignal;
      v.net.signal = (to, d) => (d?.pub && !window.__keySent ? held.push([to, d]) : sig(to, d));
      v.peers.onSignal = (from, d) => {
        if (d?.pub && !heard) { heard = Date.now(); setTimeout(() => { window.__printsAtKey = [...t.prints.keys()]; window.__keySent = Date.now(); v.net.signal = sig; held.splice(0).forEach(([to, x]) => sig(to, x)); }, late); }
        return on(from, d);
      };
    } });
  };
  const late = code();
  const A2 = await device(900, 600, { at: late, relay: true, init: `(${delayPresence})(${PRESENCE_DELAY})` });
  const dropped = [];
  A2.on('console', (m) => { if (m.text().startsWith('dropped message to')) dropped.push(m.text()); });
  await until(A2, () => window.__t && window.__t.net.status === 'live');
  await A2.setInputFiles('#pick', [files[0]]);
  await until(A2, () => window.__t.prints.size === 1);
  const pid = await A2.evaluate(() => [...window.__t.prints.keys()][0]);
  const B2 = await device(390, 700, { at: late, relay: true, init: `(${holdKey})(${KEY_LATE})` });
  const b2id = await until(B2, () => window.__t && window.__t.id).then((h) => h.jsonValue());
  await until(B2, () => window.__keySent, null, KEY_LATE + 20000);
  const early = await B2.evaluate((pid) => window.__printsAtKey.includes(pid), pid);   // B's prints as the key left, not now
  check(!early && dropped.some((d) => d.includes(b2id)), `A dropped its print to B while B's key was late (${dropped.find((d) => d.includes(b2id)) || 'nothing dropped'})`);
  const heard = await until(B2, (pid) => window.__t.prints.has(pid), pid, 20000).then(() => true, () => false);
  const took = await B2.evaluate(() => ((Date.now() - window.__keySent) / 1000).toFixed(1));
  check(heard, `A announced the print again once B's key came, and B has it (${took} s after the key)`);

} catch (e) { check(false, e.message.split('\n')[0]); } finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
