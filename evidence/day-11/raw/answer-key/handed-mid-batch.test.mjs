// A photo saved by tapping it while a Save all download batch is running is downloaded again
// by the batch: the batch list is fixed before the first wait and `handed` is never re-checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveBatch, createSaveAll } from '../../web/saveall.js';

test('a photo handed over during a download batch is not downloaded again by it', async () => {
  const prints = new Map(), files = new Map();
  for (const pid of ['r0', 'r1', 'r2']) { prints.set(pid, { pid, owner: 'them' }); files.set(pid, { name: pid + '.jpg' }); }
  const downloads = [];
  let s;
  s = createSaveAll({
    batch: (handed) => saveBatch({ prints, files, incoming: new Map(), me: 'me', handed }),
    canShare: () => false, share: async () => {},
    download: (f) => downloads.push(f.name),
    // during the first gap the user taps r2 and save() downloads it and marks it handed over
    wait: async () => { if (!s.handed.has('r2')) { downloads.push('r2.jpg'); s.handed.add('r2'); } },
    toast: () => {},
  });
  await s.tap();
  assert.equal(downloads.filter((n) => n === 'r2.jpg').length, 1, `r2 downloaded ${downloads.filter((n) => n === 'r2.jpg').length} times: ${downloads}`);
});
