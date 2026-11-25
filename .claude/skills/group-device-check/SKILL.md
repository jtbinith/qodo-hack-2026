---
name: group-device-check
description: Check what a person sees on several devices at once. Opens a build of the app in N browser windows (phone, tablet, laptop sizes) on 127.0.0.1, joins them with the real orbs, runs a ticket's steps and compares every on-screen message, count and download with the ticket's expected text. Use before calling a ticket labelled "area: ui" or "area: sharing" done, or when asked to check a build or PR against a ticket on several devices.
---

# Group device check

You check one or more **builds** (a commit, branch or PR head) against one **ticket**, on 2–20 devices in the same room. The answer for each build is PASS, FAIL or STOP. The script does the clicking; you do the reading: the ticket, the scenario and the results.

**The rule that matters most:** every expected value comes from the **ticket** (its Acceptance and Decisions sections), never from the code. A check copied from the code only proves the code does what it does. You may read the code for selectors (`#saveall`, `#pick`), never for expected text.

## Inputs (ask for any that's missing)
- **Ticket number.** Read it with `gh issue view <n> --json title,body`.
- **Build(s):** commit SHAs, branches or PR numbers (`gh pr view <n> --json headRefOid`).
- **Devices:** count and sizes, default 3: `laptop`, `phone`, `tablet`. Device 0 is the sender.
- **Evidence folder:** an empty folder, one subfolder per build.

## Stop and ask, don't guess
- No build given, or the ticket number is missing.
- The ticket gives no expected text for what a person sees, or the only place you can find it is the code.
- More than 20 devices asked for.
- The evidence folder isn't empty.
- The script exits 2 (STOP). Report why and mark the run incomplete. **A STOP is never a pass.** That includes "not every device joined" and "the room server is unreachable".

## Steps
1. **Read the ticket.** List every expectation a person could see: a message, a count, a button, a download, a share sheet. Copy each one's exact wording and the section it's in.
2. **Write the scenario** as `<evidence>/scenario.json`, following [references/scenario.md](references/scenario.md). Every `check` has `"source"`: the ticket section its expected value comes from. Where the ticket gives an example ("Downloading 10"), use the number your scenario produces ("Downloading 3"). Run each part of the ticket that a person can see. If the ticket has a decision about failures, the scenario has to make that failure happen.
3. **Check out each build** in its own worktree, from the repo root:
   ```sh
   git fetch origin <branch-or-sha>
   git worktree add --detach /tmp/gdc-<ticket>-<sha7> <sha>
   ln -s "$PWD/node_modules" /tmp/gdc-<ticket>-<sha7>/node_modules
   ```
4. **Run the script once per build**, always from **this** checkout (the build under test may not have it):
   ```sh
   node scripts/group-check.mjs --app /tmp/gdc-<ticket>-<sha7> --scenario <evidence>/scenario.json --out <evidence>/<build>/
   ```
   To check that a missing device stops the run, add `--absent <i>`: device i opens a different room, as if it never joined. That run must STOP.
   It needs the internet (the room server). Exit codes: **0 PASS, 1 FAIL, 2 STOP.** It prints one line per check point and writes `<out>/facts.json` and screenshots. Use the same `scenario.json` for every build.
5. **Read `facts.json`** for each build, not only the last line. For a FAIL, name the check point: its ticket source, expected and actual. Look at the screenshot for that check point and say whether it shows the same thing.
6. **Report** a table: build, commit, verdict, the first failing or stopping check (expected vs actual), evidence folder. Say which windows used the stand-in share sheet (see below).
7. **Clean up:** `git worktree remove --force /tmp/gdc-<ticket>-<sha7>` for each build.

## What the script does (so you can check it did it)
- Serves the build's `web/` on 127.0.0.1 only.
- Opens each device in its own browser context, all in one fresh room.
- Joins neighbours with the orbs: device i's right edge to device i+1's left edge. Each window drags its own orb straight to the side edge, and both let go together. It retries a pair at most 3 times on "No match", and records every attempt in `facts.json` under `joinAttempts`. Every device must then see all the others and its share of the joins, or it's a STOP.
- Photos are numbered cards (`1.jpg`, `2.jpg` …) drawn on the sending device and picked through the real file input.
- Downloads are hashed against the bytes the sender holds.
- **Stand-in share sheet:** headless Chromium has none. A device with `"share": "fail-once"` or `"share": "works"` gets a stand-in that records each call (and with `fail-once`, rejects the first with `NotAllowedError`). Say so in your report. It shows the app's logic, not a real phone.
- Room codes are replaced with dots before every screenshot.

## Evidence to save
- `<evidence>/scenario.json`;
- for each build, `facts.json` and the screenshots;
- your report table.

Don't commit downloads or anything outside the evidence folder. Paths in your report start at the repo, never at a home folder.
