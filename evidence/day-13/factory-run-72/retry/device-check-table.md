**Device check (group-device-check), run by the runner** on `1fd6967`: **PASS on what was checked**, 22 check points, 7 devices (phone, laptop, phone, laptop, phone, laptop, phone), joined with the orbs. Every expected text is quoted in #72. Windows with a stand-in share sheet: device 0 (works), device 2 (fail-once), device 4 (hang-then-works), device 6 (hang-then-cancel).

| Step | Check | Device | Expected | Actual | Result | Ticket source |
|---|---|---|---|---|---|---|
| 10 | shared | 0 | 1 share sheet calls, the last with 3 files | 1 share sheet calls, the last with 3 files | pass | #72 Acceptance: when "Save all" is tapped, then the share sheet opens once with all 12 |
| 12 | shared | 0 | 1 share sheet calls | 1 share sheet calls | pass | #72 Decisions, After the share sheet fails: a per-photo "handed over" flag means nothing is downloaded twice and nothing |
| 14 | toast | 2 | Couldn't open the share sheet. Tap Save all again to download | Couldn’t open the share sheet. Tap Save all again to download | pass | #72 Decisions, Cancel or failure: a toast says "Couldn't open the share sheet. Tap Save all again to download" |
| 15 | downloads | 2 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass | #72 Decisions, Cancel or failure: any other failure doesn't start downloads by itself |
| 17 | toast | 2 | Downloading 3 | Downloading 3 | pass | #72 Decisions, Downloads: the message says "Downloading 10" |
| 19 | downloads | 2 | 3 downloads, each byte-identical to what the sender holds | 3 downloads, all byte-identical | pass | #72 Decisions, Cancel or failure: the next tap downloads them all |
| 20 | shared | 2 | 1 share sheet calls | 1 share sheet calls | pass | #72 Decisions, Cancel or failure: the next tap downloads them all (no second share sheet) |
| 25 | shared | 2 | 2 share sheet calls, the last with 1 files | 2 share sheet calls, the last with 1 files | pass | #72 Decisions, After the share sheet fails: download mode ends after one download batch: the tap after that tries the sh |
| 26 | downloads | 2 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass | #72 Decisions, After the share sheet fails: nothing is downloaded twice |
| 33 | toast | 3 | Downloading 3 | Downloading 3 | pass | #72 Decisions, Downloads: the message says "Downloading 10" |
| 35 | downloads | 3 | 3 downloads, each byte-identical to what the sender holds | 3 downloads, all byte-identical | pass | #72 Acceptance: On a laptop they download |
| 38 | downloads | 3 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass | #72 Decisions, After the share sheet fails: nothing is downloaded twice and nothing is missed |
| 48 | shared | 4 | 1 share sheet calls, the last with 2 files | 1 share sheet calls, the last with 2 files | pass | #72 Acceptance: when "Save all" is tapped, then the share sheet opens once with all 12 |
| 49 | shared | 6 | 1 share sheet calls, the last with 2 files | 1 share sheet calls, the last with 2 files | pass | #72 Acceptance: when "Save all" is tapped, then the share sheet opens once with all 12 |
| 53 | toast | 4 | The share sheet didn't finish. Tap Save all again to download them | The share sheet didn’t finish. Tap Save all again to download them | pass | #72 Decisions, A share sheet that never finishes: a tap that finds only photos still held by that share says "The share  |
| 54 | toast | 6 | The share sheet didn't finish. Tap Save all again to download them | The share sheet didn’t finish. Tap Save all again to download them | pass | #72 Decisions, A share sheet that never finishes: a tap that finds only photos still held by that share says "The share  |
| 55 | downloads | 4 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass | #72 Decisions, A share sheet that never finishes: a photo is then handed over twice only if the person asks for it, afte |
| 56 | shared | 4 | 1 share sheet calls | 1 share sheet calls | pass | #72 Decisions, A share sheet that never finishes: a photo is then handed over twice only if the person asks for it, afte |
| 62 | downloads | 4 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass | #72 Decisions, A share sheet that never finishes: a photo is then handed over twice only if the person asks for it, afte |
| 63 | shared | 4 | 2 share sheet calls, the last with 1 files | 2 share sheet calls, the last with 1 files | pass | #72 Acceptance: when "Save all" is tapped, then the share sheet opens; Decisions, After the share sheet fails: nothing i |
| 65 | downloads | 6 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass | #72 Decisions, Cancel or failure: a cancelled share sheet (AbortError) does nothing |
| 66 | shared | 6 | 2 share sheet calls, the last with 2 files | 2 share sheet calls, the last with 2 files | pass | #72 Decisions, When the message shows: after a cancel, nothing is shown, and the photos stay available |

- [ ] Not checked: "Shared 10 · 2 still arriving" and "· N still arriving": the scenario can't hold a full photo partway through its transfer at the moment of a tap, so the arriving count can't be made non-zero on purpose.
- [ ] Not checked: The share sheet can't take the batch (canShare false): download them all, videos included. Picked photos are numbered JPEG cards, never videos, and the stand-in takes every batch.
- [ ] Not checked: Real iPhone and Android share sheets (the ticket's edge case): the stand-in shows the app's logic, not a real phone.
- [ ] Checked on real phones (iPhone and Android): the device check uses headless browser windows and a stand-in share sheet

