// Save all (F13): one tap hands every received photo to the share sheet, or downloads them.
// Kept apart from the page so its choices can be tested without a browser.

export const DOWNLOAD_GAP = 400;     // ms between two downloads of one batch: browsers block or prompt on a burst
export const REVOKE_AFTER = 10000;   // ms a download's object URL lives after its click, so the browser can read it
export const SHARE_TIMEOUT = 60000;  // ms a share sheet holds Save all: navigator.share can stay pending forever (WebKit)

// What Save all can hand over now: every verified file in `files` that isn't this device's own
// and hasn't been handed over yet. "Still arriving" counts only full photos on their way here:
// thumbnails (`thumb:` transfers) and prints never fetched aren't in it.
export function saveBatch({ prints, files, incoming, me, handed, only = null }) {   // only: just these pids (what's picked)
  const ready = [];
  for (const [pid, file] of files) {
    const p = prints.get(pid);
    if (p && p.owner !== me && !handed.has(pid) && (!only || only.has(pid))) ready.push({ pid, file });
  }
  let arriving = 0;
  for (const fid of incoming.keys()) if (!fid.startsWith('thumb:') && !files.has(fid) && (!only || only.has(fid))) arriving++;
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
  let release = false;        // the person was told a share didn't finish: the next tap downloads its photos too.
                              // This is its own download mode, gone if the share settles before that tap
  let shares = 0;             // share sheets opened so far, each numbered
  let released = 0;           // shares up to this number had their photos released to download after the ask
  const more = (n) => (n ? ` · ${n} still arriving` : '');

  // Everything is decided, and the share sheet opened, before the first await: the share sheet
  // only opens inside the tap (iOS rule)
  async function tap() {
    if (busy) return toast('Still saving');
    for (const pid of pending) if (handed.has(pid)) pending.delete(pid);   // saved by tapping it: nothing left to hold
    if (!pending.size) release = false;   // the hung share settled since: nothing left to release or download
    // a share that outlived SHARE_TIMEOUT may still finish: its photos aren't offered again
    // until it settles, or until the person has been told and taps again
    const { ready, arriving } = batch(release ? handed : new Set([...handed, ...pending]));
    if (!ready.length) {
      if (pending.size) {   // only the timed-out share's photos are left: ask first
        release = true;
        return toast('The share sheet didn’t finish. Tap Save all again to download them');
      }
      return toast(arriving ? `Nothing to save yet${more(arriving)}` : 'Nothing new to save');
    }
    const downloading = downloadNext || release;   // a failed sheet, or the ask about a hung one
    if (release) { release = false; released = shares; pending.clear(); }   // every share so far is released: none of their photos is held
    const list = ready.map((r) => r.file);
    let sharing = false;
    if (!downloading) { try { sharing = !!canShare(list); } catch { sharing = false; } }
    const mine = {};
    busy = mine;
    try {
      if (sharing) {
        // called now, inside the tap; a share that throws at once becomes a failure like any other
        let sheet;
        try { sheet = Promise.resolve(share(list)); } catch (e) { sheet = Promise.reject(e); }
        const id = ++shares;
        for (const r of ready) pending.add(r.pid);
        // what the share's end does, whenever it comes: before SHARE_TIMEOUT or after it
        const settled = sheet.then(() => {
          for (const r of ready) { handed.add(r.pid); if (id > released) pending.delete(r.pid); }   // released: a newer share may hold them
          toast(`Shared ${ready.length}${more(arriving)}`);
          return 'shared';
        }, (e) => {
          if (id <= released) return 'released';   // its photos were downloaded after the ask: nothing left to retry
          for (const r of ready) pending.delete(r.pid);   // settled: cancelled or failed, the photos stay available
          if (e?.name === 'AbortError') return 'cancelled';   // cancelled: nothing happens, the photos stay available
          downloadNext = true;
          toast('Couldn’t open the share sheet. Tap Save all again to download');
          return 'failed';
        });
        // a share that never settles ends the tap and frees Save all after SHARE_TIMEOUT. Its photos stay
        // held until it settles, or until the person is told and taps again (the ask above)
        return await Promise.race([settled, wait(SHARE_TIMEOUT).then(() => 'timeout')]);
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
