// Save all (F13): one tap hands every received photo to the share sheet, or downloads them.
// Kept apart from the page so its choices can be tested without a browser.

export const DOWNLOAD_GAP = 400;     // ms between two downloads of one batch: browsers block or prompt on a burst
export const REVOKE_AFTER = 10000;   // ms a download's object URL lives after its click, so the browser can read it

// What Save all can hand over now: every verified file in `files` that isn't this device's own
// and hasn't been handed over yet. "Still arriving" counts only full photos on their way here:
// thumbnails (`thumb:` transfers) and prints never fetched aren't in it.
export function saveBatch({ prints, files, incoming, me, handed }) {
  const ready = [];
  for (const [pid, file] of files) {
    const p = prints.get(pid);
    if (p && p.owner !== me && !handed.has(pid)) ready.push({ pid, file });
  }
  let arriving = 0;
  for (const fid of incoming.keys()) if (!fid.startsWith('thumb:') && !files.has(fid)) arriving++;
  return { ready, arriving };
}

// batch(handed) gives saveBatch's answer. canShare(files) and share(files) wrap the share sheet,
// download(file) starts one download. `handed` holds the pid of every photo shared or downloaded,
// so nothing is handed over twice. A photo counts as handed over only once that has happened.
export function createSaveAll({ batch, canShare, share, download, toast, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const handed = new Set();
  let downloadNext = false;   // the share sheet failed: the next tap downloads instead
  let busy = false;           // a share sheet or a download batch is still running
  const more = (n) => (n ? ` · ${n} still arriving` : '');

  // Everything is decided, and the share sheet opened, before the first await: the share sheet
  // only opens inside the tap (iOS rule)
  async function tap() {
    if (busy) return toast('Still saving');
    const { ready, arriving } = batch(handed);
    if (!ready.length) return toast(arriving ? `Nothing to save yet${more(arriving)}` : 'Nothing new to save');
    const list = ready.map((r) => r.file);
    let sharing = false;
    if (!downloadNext) { try { sharing = !!canShare(list); } catch { sharing = false; } }
    busy = true;
    try {
      if (sharing) {
        try { await share(list); } catch (e) {
          if (e?.name === 'AbortError') return;   // cancelled: nothing happens, the photos stay available
          downloadNext = true;
          return toast('Couldn’t open the share sheet. Tap Save all again to download');
        }
        for (const r of ready) handed.add(r.pid);
        return toast(`Shared ${ready.length}${more(arriving)}`);
      }
      downloadNext = false;   // download mode lasts one batch
      toast(`Downloading ${ready.length}${more(arriving)}`);
      for (let i = 0; i < ready.length; i++) {
        if (i) await wait(DOWNLOAD_GAP);
        try { download(ready[i].file); handed.add(ready[i].pid); } catch (e) { console.warn('download failed', ready[i].file?.name, e); }
      }
    } finally { busy = false; }
  }
  return { handed, tap };
}
