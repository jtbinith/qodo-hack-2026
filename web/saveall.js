// Save all (F13): one tap hands every received photo to the share sheet, or downloads them.
// Kept apart from the page so its choices can be tested without a browser.

export const DOWNLOAD_GAP = 400;     // ms between two downloads of one batch: browsers block or prompt on a burst
export const REVOKE_AFTER = 10000;   // ms a download's object URL lives after its click, so the browser can read it
export const SHARE_TIMEOUT = 60000;  // ms a share sheet holds Save all: navigator.share can stay pending forever (WebKit)

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
  let busy = null;            // the tap whose share sheet or download batch is still running
  const pending = new Set();  // pids in a share sheet that hasn't settled, even after SHARE_TIMEOUT
  const more = (n) => (n ? ` · ${n} still arriving` : '');

  // Everything is decided, and the share sheet opened, before the first await: the share sheet
  // only opens inside the tap (iOS rule)
  async function tap() {
    if (busy) return toast('Still saving');
    // a share that outlived SHARE_TIMEOUT may still finish: its photos aren't offered again until it settles
    const { ready, arriving } = batch(new Set([...handed, ...pending]));
    if (!ready.length) {
      if (pending.size) return toast('Still saving');
      return toast(arriving ? `Nothing to save yet${more(arriving)}` : 'Nothing new to save');
    }
    const list = ready.map((r) => r.file);
    let sharing = false;
    if (!downloadNext) { try { sharing = !!canShare(list); } catch { sharing = false; } }
    const mine = {};
    busy = mine;
    try {
      if (sharing) {
        // called now, inside the tap; a share that throws at once becomes a failure like any other
        const sheet = (async () => share(list))();
        for (const r of ready) pending.add(r.pid);
        // a share that never settles frees Save all after SHARE_TIMEOUT; if it finishes later it still counts
        wait(SHARE_TIMEOUT).then(() => { if (busy === mine) busy = null; });
        try { await sheet; } catch (e) {
          for (const r of ready) pending.delete(r.pid);   // settled: cancelled or failed, the photos stay available
          if (e?.name === 'AbortError') return;   // cancelled: nothing happens, the photos stay available
          downloadNext = true;
          return toast('Couldn’t open the share sheet. Tap Save all again to download');
        }
        for (const r of ready) { handed.add(r.pid); pending.delete(r.pid); }
        return toast(`Shared ${ready.length}${more(arriving)}`);
      }
      downloadNext = false;   // download mode lasts one batch
      toast(`Downloading ${ready.length}${more(arriving)}`);
      for (let i = 0; i < ready.length; i++) {
        if (i) await wait(DOWNLOAD_GAP);
        if (handed.has(ready[i].pid)) continue;   // tapped and saved during the gap: read again after the await
        try { download(ready[i].file); handed.add(ready[i].pid); } catch (e) { console.warn('download failed', ready[i].file?.name, e); }
      }
    } finally { if (busy === mine) busy = null; }   // a late share doesn't free a newer tap's batch
  }
  return { handed, tap };
}
