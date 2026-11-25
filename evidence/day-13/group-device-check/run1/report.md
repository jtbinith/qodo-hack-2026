# Group device check: #72 (F13 · Save all), 3 devices

Devices: 0 laptop (sender, no share sheet), 1 phone (stand-in share sheet, `fail-once`), 2 tablet (stand-in share sheet, `works`).
Scenario: `scenario.json` (11 check points, every expected value from #72 Acceptance or Decisions).

| Build | Commit | Verdict | First failing or stopping check (expected vs actual) | Evidence |
|---|---|---|---|---|
| PR #130 | 18ba6fb | PASS | none (11/11) | `pr130-18ba6fb/` |
| PR #135 | bc2de62 | FAIL | step 13, phone, #72 Decisions: Downloads: expected "Downloading 3", actual "Saved 3" (also step 24, laptop: "Downloading 1" vs "Saved 1") | `pr135-bc2de62/` |
| PR #140 | 585b85a | PASS | none (11/11) | `pr140-585b85a/` |
| PR #142 | 941cf4f | PASS | none (11/11) | `pr142-941cf4f/` |
| PR #130, device 2 absent | 18ba6fb | STOP (run incomplete, not a pass) | not every device joined: device 2 sees 1 device, expected 3 | `pr130-18ba6fb-absent2/` |

Stand-in share sheet: the phone and tablet windows used it (headless Chromium has none). It shows the app's logic, not a real phone. The laptop had none.

Notes:
- The PR #135 screenshots for steps 13 and 24 show no toast: the toast had gone by the time the screenshot was taken (the check waits 4 s for the expected text). The failure comes from the toast text read in `facts.json`, not from the image.
- Not exercised: a cancelled share sheet (`AbortError`, the stand-in has no cancel mode), "· N still arriving" (the scenario can't hold a transfer in flight), and the tap after a download batch trying the share sheet again (the ticket doesn't say how many files that share should carry).
- "Shared 2" is inferred from the ticket's "Shared 10 · 2 still arriving" with nothing arriving.
- The script's room-code masking didn't hold: the HUD is rewritten every frame, so the code was back by screenshot time. Every PNG here was redacted afterwards (first HUD line blacked out). Downloads were deleted; their hashes are in each `facts.json`.
