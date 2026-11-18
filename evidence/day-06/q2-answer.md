Two devices join their screens when each pushes its orb toward the other's screen within 2 seconds, on opposite edges. The earliest device in the room, the "time keeper", pairs those pushes, broadcasts the resulting list of joins, and every device turns that list into screen positions on each frame. Those positions decide which screen a print is on, so they also decide when a photo fetch starts. Everything is from `jtbinith/qodo-hack-2026` at **`96f0bbe`**, read with Qodo. **[V]** means verified in the code; **[A]** means an assumption or inference.

## How a join happens
1. **Pushing the orb.** [V] Dragging the orb at least 15% of the screen size works out which edge it leaves by (L/R/T/B) and where along that edge (`index.html:312-321`). It then calls `net.push(edge, along)`. That broadcasts `{dev, edge, along, t}` stamped with the shared clock, and also hands the push to the device's own handler (`net.js:138-142`).
2. **Choosing the time keeper.** [V] It's the device with the earliest `joinedAt` in presence, with ties broken by id (`net.js:31-37`). The others sync their clocks to it with ping/pong, keeping the median offset of the 5 fastest of the last 30 samples (`net.js:55-75`).
3. **Collecting pushes.** [V] Only the time keeper handles them (`net.js:92-102`).
   - `validPush` requires a device that's in the room, a known edge, a position inside that device's screen, and a time within 10 s of the shared clock (`net.js:86-91`).
   - Each device keeps at most 2 pending pushes (`PER_DEV`), and newer pushes replace older ones. A batch holds at most 8 (`MAX_BATCH`). A batch is solved 900 ms after the last push, and no later than 2.5 s after it started (`DEADLINE`).
4. **Pairing.** [V] `matchPushes` tries every way of pairing the pushes (`layout.js:131-174`).
   - Two pushes can pair if they come from different devices, use opposite edges, and are within `WINDOW` = 2000 ms of each other (`net.js:10`, `layout.js:133`).
   - It prefers the pairing that joins the most screens, then the one with fewest overlaps, then the one closest in time.
   - If a push that could have paired is left over, nobody joins and **every device in the batch** is asked to push again (`layout.js:169-171`).
   - A push with no possible partner waits out its window, then gets `nomatch` (`net.js:114-120`).
5. **Applying the joins.** [V] `addJoins` replaces any old join between the same two devices. If screens then overlap, or the layout is inconsistent by 12 px or more, it drops older joins that touch the new devices until the layout makes sense (`layout.js:48-62`). The time keeper broadcasts `layout {from, joins}` and one `joined` per new join (`net.js:108-111,122-126`).
6. **Receiving.** [V] A `layout` is accepted only if it comes from the current time keeper and passes `isValidJoins` (`net.js:128-133`, `layout.js:38-43`). `joined`, `retry` and `nomatch` are only shape-checked (`net.js:134-136`).
7. **Positions.** [V] Every animation frame runs `solveLayout(ids, net.joins, sizes)` (`index.html:372`).
   - Each connected group is solved on its own, and its smallest id sits at (0,0).
   - A first guess comes from walking the joins outward, then 200 rounds of averaging refine it, and the largest leftover disagreement is returned (`layout.js:69-111`).

## What depends on joins
- **Code**
  - [V] `index.html` uses the positions throughout:
    - `world`, `meWorld`, `setWorld` and `visible` place prints relative to the screen they sit on (`index.html:81-85,99-103`).
    - `rehome` moves prints whose screen left the room onto the smallest id in the group (`88-98`).
    - `screenAt` and `onMyScreen` (`242-251`) feed `dropped()`, which is **the trigger for every first fetch of a photo** (`252-261`, see Q1).
    - Drawing shows the other screens' outlines and a debug line counting joins (`380,408`).
  - [V] In `net.js`, the room's presence sync drops joins to devices that have left (`net.js:48`). Resizing re-announces the screen size (`net.js:143`, `index.html:66-70`), so the next frame's `solveLayout` uses the new size.
  - [A] A resize doesn't run `addJoins` again, so a resized screen could overlap a neighbour until someone pushes again. I didn't trace that path.
- **Checks** [V]: `validPeerMeta` (screens 100–20000 px), `validPing`, `validPong`, `validDevList` (at most 50 devices) and `validDev` are at `check.js:111-119`. `isValidJoins` is in `layout.js:38`. `validPush` lives in `net.js:86`, which `ARCHITECTURE.md:69` documents as the one exception to Rule 1's "checks live in check.js".
- **Limits** [V]:
  - Named constants: `WINDOW` 2000, `MAX_BATCH` 8, `PER_DEV` 2 and `DEADLINE` 2500 (`net.js:10,84`).
  - **Unnamed numbers:**
    - the 10 s recency window (`net.js:90`);
    - the 900 ms and 400 ms re-solve waits (`net.js:100,120`);
    - the ping cadence (500 ms, then every 2 s after 20) (`net.js:71-75`);
    - the overlap tolerance of 6 px and the 12 px disagreement limit (`layout.js:22,57`);
    - the 200 refinement rounds (`layout.js:98`).

    Rule 3 asks for limits to be named constants, so these are candidate findings.
- **Tests**
  - [V] `tests/two-browser.mjs` joins A's right edge to B's left (pushes at 300 and 350, then waits for `joins.length === 1`) (`two-browser.mjs:52-55`). It drags a photo across the seam (`116-117`) and later joins B to C (`287-288`).
  - [V] **No unit test covers `layout.js` or `net.js`.** No file in `tests/` imports them (repo-wide grep, `15-…json`), and `docs/TESTING.md:53` lists the layout unit tests as "to write". `check.test.mjs` exists, but I didn't read whether it covers `validPeerMeta`, `validPing`, `validPong`, `validDevList` or `validDev`.

## Gaps worth knowing
- [V] Only the `layout` handler checks that the sender is the time keeper. `joined`, `retry`, `nomatch` (`net.js:134-136`) and `pong` (`net.js:58-59`) accept any sender. `ARCHITECTURE.md:76,81` says they "should be the time keeper only". Today a forged `joined` only causes a "Screens joined ✨" toast (`index.html:351`). A forged `pong` can skew the device's clock. [A] That skew could make that device's pushes fail the 10 s recency check, though I didn't verify that.
- [A] The time keeper is self-declared: `joinedAt` comes from each device's own presence data, and `validPeerMeta` only checks that it's a number. So anyone with the room code could claim the earliest time, become the time keeper and send layouts. This is close to the known gap "anyone with the room code can join the room".
- [V] Nothing in `index.html` listens for `retry` or `nomatch`; the only join-related UI is the `joined` toast (`index.html:351`). [A] So when a push fails, the user gets no feedback.

The raw outputs are saved as `10`–`16` in `evidence/day-06/raw/explore/`.
