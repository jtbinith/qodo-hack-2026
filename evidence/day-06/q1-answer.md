A photo is never pushed to other devices. The sharer announces a small card (a "print") and its thumbnail to everyone. The full photo moves only when a receiver asks for it with `want`, and that ask happens only when the print ends up on the receiver's own screen after a drag, or when the receiver taps it there. Everything below is from `jtbinith/qodo-hack-2026` at **`96f0bbe`** (`main`), read with Qodo.

Tags: **[V]** means verified in the code at `96f0bbe`; **[A]** means an assumption or inference not directly shown.

## 1. Sharing: the photo goes on the sharer's table (`web/index.html`)
- **[V]** The picker handles each file in this order:
  - It rejects files over `LIMITS.fileBytes`, which is 200 MB (`index.html:130`, `check.js:6`).
  - It strips details with `prepareFile(picked, keep)`. `keep` is read once, before the first `await` (`index.html:126,132`).
  - It makes a thumbnail: a JPEG at most 220 px on its longest side, quality 0.7 (`index.html:105-116`).
  - It takes the SHA-256 of the cleaned file (`index.html:134`).
  - It builds a print with a random `pid` from `crypto.getRandomValues` and `holders: [id]`, then stores it in `prints` and the file in `files` (`index.html:121,136-139`).
- **[V]** `announce(peer, p)` then goes to every other device (`index.html:140,149-155`). It sends:
  - `{t:'print', ...meta, thumbSize}`, meaning the name, type, size, `sha`, owner and position, but not the thumbnail bytes (`index.html:151,153`).
  - The thumbnail as a separate file transfer with fid `'thumb:'+pid` (`index.html:154`).
- **[V]** A peer is marked as announced before the send. If the send returns `false`, the mark is removed so a later catch-up announces it again (`index.html:150,153`).

## 2. Receiving the announcement
- **[V]** `onMessage` handles `print` (`index.html:166-170`):
  - It drops the message if the pid is already known, if there are already 500 prints (`check.js:11`), or if `validPrint` fails (`check.js:22`).
  - Otherwise it stores the print without a picture.
  - If `thumbSize` is set, it calls `expect('thumb:'+pid, from, thumbSize)`.
- **[V]** `expect` opens a slot in `incoming`, capped at `LIMITS.incoming` = 20 (`index.html:160-164`, `check.js:10`). Pieces for any fid without a slot, or from a different device than the slot names, are dropped (`index.html:188-189`).
- **[V]** When the thumbnail finishes, it is decoded only if `thumbFits` passes (`index.html:204-209`, `check.js:72`).

## 3. What starts the full-photo fetch
- **[V]** `dropped(p)` is the only first-time trigger (`index.html:252-261`). It fires when the print's centre is on **my** screen, I don't have the file and I haven't already asked. It then:
  - picks a source: the first holder that is still here and isn't me, otherwise the owner (`index.html:255`);
  - calls `expect(pid, src, size)`; if that fails, it shows "Too many photos arriving" (`index.html:256`);
  - sends `{t:'want', pid}` to that source (`index.html:258`).
- **[V]** `dropped` runs in three cases:
  1. **On the device doing the drag, when the pointer is released.** That device broadcasts a final `move`, then `dropcheck`, then checks itself (`index.html:290-297`).
  2. **On every other device, when its `dropcheck` arrives.** This is handled in the `peers.on` wrapper, not in `onMessage`, after `validPidMsg` (`index.html:329-331`). This is how a photo dragged across joined screens reaches the device it lands on.
  3. **On a tap** of a print that's on my screen but isn't here yet (`index.html:305`).
- **[V]** Announcing never fetches, and `move` messages only update the position (`index.html:171-173`).
- **[A]** On the receiver, `dropcheck` relies on the final `move` having arrived first, so its own copy of the position is current. The two go out back to back (`index.html:295-296`), and both paths look order-preserving: the direct channel is `ordered: true` (`peers.js:60`) and the relay uses one queue (`peers.js:140-147`). I didn't check what happens if the link switches between the two messages.

## 4. Serving and moving the bytes (`web/peers.js`)
- **[V]** The source answers `want` if it holds the file (`files.get(pid)`). It calls `peers.sendFile`, and a failure goes to `gaveUp`, which shows a toast (`index.html:174-176,198-202`). Any device that holds the file can be a source, not only the owner.
- **[V]** `sendFile` streams `{t:'chunk', fid, i, n, cs}` frames with the piece bytes appended (`peers.js:190-198`).
  - The piece size is 64 KB on a direct link and 24 KB on the relay, chosen when the send starts (`peers.js:13-14,192`).
  - The receiver accepts only those two sizes (`check.js:9,40`). If `cs` changes mid-transfer, it starts collecting again (`index.html:190`).
- **[V]** Every frame is a 4-byte header length, then a JSON header, then the payload (`peers.js:5,115-121`). On receipt, a header over 4096 bytes is dropped (`peers.js:104-114`).
- **[V]** `sendFrame` picks the path (`peers.js:162-170`):
  - **Direct:** the WebRTC DataChannel, if it's open. If more than 1 MB is buffered, it waits to drain, and gives up after 10 s with no progress (`peers.js:17-18,165,173-181`).
  - **Relay** otherwise (`peers.js:150-160`):
    - The frame is sealed with the pair's ECDH-derived key (`peers.js:79,143`).
    - It's sent as `signal(peer, {r: base64})`, which becomes the Supabase broadcast event `'sig'` carrying `{from, to, data}` (`net.js:145`).
    - One queue serves the whole page, with 45 ms between sends (`peers.js:15,140-147`).
    - If the peer's key hasn't arrived yet, the frame waits in that peer's own outbox (up to 400) and gives up after `SEND_TIMEOUT` (`peers.js:16,154-159`).
- **[V]** The receiver checks `validSignal` and that `to === id` (`net.js:144`), opens the frame with the key (tampered frames are dropped silently, `peers.js:123-127`), then parses it the same way as a direct frame.
- **[V]** Connection setup (public keys, WebRTC descriptions and ICE candidates) travels over the same `'sig'` channel without encryption (`peers.js:51,62,64,96`).

## 5. Gaps, completion and the fingerprint
- **[V]** Every 1.5 s, the receiver re-asks for any transfer that's been quiet for 3 s (`index.html:229-239`).
  - It sends `{t:'need', fid, missing, cs}` with up to 300 missing piece numbers (`check.js:12`), or `null` for "everything".
  - After 20 asks (about a minute) it gives up and shows "A photo didn't arrive" (`index.html:233`).
  - The source answers `need` by resending just those pieces (`index.html:180-186`, `validNeed` at `check.js:108`).
- **[V]** When every piece is in, `done` runs (`index.html:193,203-225`). For a photo (not a thumbnail):
  - The SHA-256 of the pieces must match the print's `sha` (`index.html:213`).
  - **On a mismatch:** that source is removed from `holders`, another holder is picked, and `want` goes to it (`index.html:214-217`). If there's no other holder, the user is told "Drag it again".
  - **On a match:** the file is stored, the device adds itself to `holders` and broadcasts `{t:'have', pid}` (`index.html:220-224`). The others then add it as a holder, up to 50 (`index.html:177-179`), so it can serve later fetches.
- **[V]** A tap on a print whose file is here saves it with `navigator.share` or a download link (`index.html:300-311`).

## 6. Catch-up for late joiners
- **[V]** `catchUp` runs whenever the list of who's here changes, and whenever a peer's key arrives (`index.html:338-349`, `peers.js:133`). It re-announces prints to devices that haven't received them.
- **[V]** A print is re-announced by its owner, or by anyone holding the file once the owner has left (`index.html:340`).

## Messages and files involved
| Message | Sent by | Handled at | Check |
|---|---|---|---|
| `print` | sharer, catch-up | `index.html:166` | `validPrint` |
| `chunk` | `sendFile` | `index.html:187` | `validChunk` + expected slot + matching sender |
| `want` | receiver (`dropped`, retry after a damaged copy) | `index.html:174` | `validPidMsg` |
| `need` | receiver's re-ask timer | `index.html:180` | `validNeed` |
| `have` | receiver after the fingerprint matches | `index.html:177` | `validPidMsg` |
| `move` / `dropcheck` | the dragging device | `index.html:171` / `330` | `validMove` / `validPidMsg` |
| `'sig'` with `{pub}`, `{desc}`, `{cand}`, `{r}` | `peers.js` through `net.js:145` | `net.js:144`, then `peers.js:70` | `validSignal` |

The files involved are `web/index.html` (the flow), `web/peers.js` (paths and framing), `web/net.js` (the `'sig'` channel), `web/check.js` (checks and limits) and `web/seal.js` (encryption).

**Not read:** `web/seal.js`, the body of `validChunk` (`check.js:39` onward, beyond its first line) and `prepareFile` in `strip.js`. So I haven't verified how pieces are length-checked, how frames are sealed or what stripping does. I can read those next if you want them.

The raw outputs are saved as `04`–`09` in `evidence/day-06/raw/explore/`.
