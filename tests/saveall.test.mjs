// Save all (F13): one tap saves every received photo. Phones get the share sheet once with
// all of them, laptops (or a share sheet that can't take the batch) download them one at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveBatch, createSaveAll, DOWNLOAD_GAP, REVOKE_AFTER } from '../web/saveall.js';

const ME = 'me', THEM = 'them';
// A table with `n` received photos, `own` of this device's own and `arriving` full photos on their way
function table({ n = 12, own = 0, arriving = 0, thumbs = 0, notFetched = 0 } = {}) {
  const prints = new Map(), files = new Map(), incoming = new Map();
  const add = (pid, owner, held) => { prints.set(pid, { pid, owner, name: pid + '.jpg' }); if (held) files.set(pid, { name: pid + '.jpg' }); };
  for (let i = 0; i < n; i++) add('r' + i, THEM, true);
  for (let i = 0; i < own; i++) add('o' + i, ME, true);
  for (let i = 0; i < arriving; i++) { add('a' + i, THEM, false); incoming.set('a' + i, {}); }
  for (let i = 0; i < thumbs; i++) { add('t' + i, THEM, false); incoming.set('thumb:t' + i, {}); }
  for (let i = 0; i < notFetched; i++) add('x' + i, THEM, false);
  return { prints, files, incoming, me: ME };
}
// A Save all wired to fakes. `share` decides what navigator.share does with each call
function rig(t, { canShare = () => true, share = async () => {} } = {}) {
  const log = { shares: [], downloads: [], toasts: [], waits: [] };
  const s = createSaveAll({
    batch: (handed) => saveBatch({ ...t, handed }),
    canShare: (files) => canShare(files),
    share: (files) => { log.shares.push(files.map((f) => f.name)); return share(files); },
    download: (file) => { log.downloads.push(file.name); },
    wait: async (ms) => { log.waits.push(ms); },
    toast: (msg) => log.toasts.push(msg),
  });
  return { s, log };
}
const abort = () => Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
const notAllowed = () => Promise.reject(Object.assign(new Error('no tap'), { name: 'NotAllowedError' }));

test('12 received photos: the share sheet opens once with all 12', async () => {
  const { s, log } = rig(table());
  await s.tap();
  assert.equal(log.shares.length, 1);
  assert.equal(log.shares[0].length, 12);
  assert.deepEqual(log.downloads, []);
  assert.deepEqual(log.toasts, ['Shared 12']);
});

test('the share sheet is opened inside the tap, before anything is awaited (iOS rule)', () => {
  const { s, log } = rig(table());
  s.tap();   // not awaited: share must already have been called
  assert.equal(log.shares.length, 1);
});

test('only fully received photos go: own photos, thumbnails and prints never fetched are left out', async () => {
  const t = table({ own: 3, arriving: 2, thumbs: 4, notFetched: 5 });
  const { s, log } = rig(t);
  await s.tap();
  assert.equal(log.shares.length, 1);
  assert.deepEqual(log.shares[0].sort(), [...Array(12).keys()].map((i) => `r${i}.jpg`).sort());
  assert.deepEqual(log.toasts, ['Shared 12 · 2 still arriving']);
});

test('saveBatch counts only full photos on their way here as still arriving', () => {
  const { ready, arriving } = saveBatch({ ...table({ n: 10, own: 1, arriving: 2, thumbs: 3, notFetched: 4 }), handed: new Set() });
  assert.equal(ready.length, 10);
  assert.equal(arriving, 2);
});

test('a laptop (no share sheet) downloads them all, one at a time, DOWNLOAD_GAP apart', async () => {
  const { s, log } = rig(table(), { canShare: () => false });
  await s.tap();
  assert.equal(log.shares.length, 0);
  assert.equal(log.downloads.length, 12);
  assert.equal(new Set(log.downloads).size, 12);
  assert.deepEqual(log.waits, Array(11).fill(DOWNLOAD_GAP));
  assert.deepEqual(log.toasts, ['Saved 12']);
});

test('the gap between downloads is 300 to 500 ms and object URLs are revoked later, both named', () => {
  assert.ok(DOWNLOAD_GAP >= 300 && DOWNLOAD_GAP <= 500, `DOWNLOAD_GAP ${DOWNLOAD_GAP}`);
  assert.ok(REVOKE_AFTER > 0, `REVOKE_AFTER ${REVOKE_AFTER}`);
});

test('a share sheet that refuses the batch: they all download, videos included', async () => {
  const t = table({ n: 3 });
  t.prints.set('v', { pid: 'v', owner: THEM, name: 'clip.mp4' }); t.files.set('v', { name: 'clip.mp4' });
  const { s, log } = rig(t, { canShare: (files) => !files.some((f) => f.name.endsWith('.mp4')) });
  await s.tap();
  assert.equal(log.shares.length, 0);
  assert.equal(log.downloads.length, 4);
  assert.ok(log.downloads.includes('clip.mp4'));
});

test('a cancelled share sheet does nothing, and the photos stay available', async () => {
  let first = true;
  const { s, log } = rig(table(), { share: () => (first ? (first = false, abort()) : Promise.resolve()) });
  await s.tap();
  assert.deepEqual(log.toasts, []);
  assert.deepEqual(log.downloads, []);
  await s.tap();   // the next tap tries the share sheet again, with all 12
  assert.equal(log.shares.length, 2);
  assert.equal(log.shares[1].length, 12);
  assert.deepEqual(log.toasts, ['Shared 12']);
});

test('another share failure starts no downloads by itself; the next tap downloads them all', async () => {
  const t = table();
  const { s, log } = rig(t, { share: notAllowed });
  await s.tap();
  assert.deepEqual(log.downloads, []);
  assert.deepEqual(log.toasts, ['Couldn’t open the share sheet. Tap Save all again to download']);
  // one more photo finishes arriving before the next tap
  t.prints.set('late', { pid: 'late', owner: THEM, name: 'late.jpg' }); t.files.set('late', { name: 'late.jpg' });
  await s.tap();
  assert.equal(log.shares.length, 1, 'the next tap downloads instead of trying the share sheet');
  assert.equal(log.downloads.length, 13);
  assert.ok(log.downloads.includes('late.jpg'));
  assert.equal(log.toasts.at(-1), 'Saved 13');
});

test('download mode ends after one batch: the tap after it tries the share sheet again', async () => {
  const t = table({ n: 2 });
  let fail = true;
  const { s, log } = rig(t, { share: () => (fail ? (fail = false, notAllowed()) : Promise.resolve()) });
  await s.tap();   // fails
  await s.tap();   // downloads 2
  t.prints.set('new', { pid: 'new', owner: THEM, name: 'new.jpg' }); t.files.set('new', { name: 'new.jpg' });
  await s.tap();
  assert.equal(log.shares.length, 2);
  assert.deepEqual(log.shares[1], ['new.jpg']);
  assert.equal(log.downloads.length, 2);
});

test('nothing is handed over twice: a second Save all hands over only new photos', async () => {
  const t = table({ n: 3 });
  const { s, log } = rig(t);
  await s.tap();
  await s.tap();
  assert.equal(log.shares.length, 1);
  assert.equal(log.toasts.at(-1), 'Nothing new to save');
  t.prints.set('new', { pid: 'new', owner: THEM, name: 'new.jpg' }); t.files.set('new', { name: 'new.jpg' });
  await s.tap();
  assert.deepEqual(log.shares[1], ['new.jpg']);
});

test('nothing fully arrived yet: Save all says how many are still arriving', async () => {
  const { s, log } = rig(table({ n: 0, arriving: 3 }));
  await s.tap();
  assert.equal(log.shares.length, 0);
  assert.deepEqual(log.toasts, ['Nothing to save yet · 3 still arriving']);
});

test('a photo saved by tapping it is skipped by Save all', async () => {
  const { s, log } = rig(table({ n: 3 }));
  s.handed.add('r1');
  await s.tap();
  assert.equal(log.shares.length, 1);
  assert.deepEqual(log.shares[0].sort(), ['r0.jpg', 'r2.jpg']);
});

test('a tap while a download batch is running starts nothing new', async () => {
  const t = table({ n: 3 });
  let release; const gate = new Promise((r) => { release = r; });
  const log = { shares: [], downloads: [], toasts: [] };
  const s = createSaveAll({
    batch: (handed) => saveBatch({ ...t, handed }),
    canShare: () => false, share: async (f) => { log.shares.push(f); },
    download: (file) => log.downloads.push(file.name),
    wait: () => gate, toast: (m) => log.toasts.push(m),
  });
  const first = s.tap();
  await Promise.resolve();
  await s.tap();
  assert.equal(log.downloads.length, 1, 'the second tap started no downloads');
  assert.equal(log.shares.length, 0);
  assert.equal(log.toasts.at(-1), 'Still saving');
  release(); await first;
  assert.equal(log.downloads.length, 3);
});

test('a photo is marked handed over only when its download starts: one that throws is tried again next time', async () => {
  const t = table({ n: 3 });
  const log = { downloads: [] };
  let broken = true;
  const s = createSaveAll({
    batch: (handed) => saveBatch({ ...t, handed }),
    canShare: () => false, share: async () => {},
    download: (file) => { if (broken && file.name === 'r1.jpg') throw new Error('blocked'); log.downloads.push(file.name); },
    wait: async () => {}, toast: () => {},
  });
  await s.tap();
  assert.deepEqual(log.downloads, ['r0.jpg', 'r2.jpg'], 'the others still download');
  assert.ok(!s.handed.has('r1'));
  broken = false;
  await s.tap();
  assert.deepEqual(log.downloads, ['r0.jpg', 'r2.jpg', 'r1.jpg']);
});
