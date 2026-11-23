// navigator.share can stay pending (a sheet dismissed in a way WebKit never reports, the page
// hidden mid-share). Save all waits on it with no cap, so `busy` never clears and every later
// tap only says "Still saving": Save all is dead for the rest of the session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveBatch, createSaveAll } from '../../web/saveall.js';

test('a share sheet that never settles does not lock Save all forever', async () => {
  const prints = new Map(), files = new Map();
  for (const pid of ['r0', 'r1']) { prints.set(pid, { pid, owner: 'them' }); files.set(pid, { name: pid + '.jpg' }); }
  const toasts = [], shares = [];
  let realWaits = 0;
  const s = createSaveAll({
    batch: (handed) => saveBatch({ prints, files, incoming: new Map(), me: 'me', handed }),
    canShare: () => true,
    share: (l) => { shares.push(l); return new Promise(() => {}); },   // never settles
    download: () => {},
    wait: async () => { realWaits++; },
    toast: (m) => toasts.push(m),
  });
  s.tap();
  await new Promise((r) => setTimeout(r, 50));
  // long after: the user taps again
  await Promise.race([s.tap(), new Promise((r) => setTimeout(r, 50))]);
  assert.notEqual(toasts.at(-1), 'Still saving', 'Save all is stuck behind a share that never settles, with no timeout');
});
