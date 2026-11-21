# #92: the late-key browser step

**Before:** B released its key a fixed 11 s after hearing A's key, and the check needed A's 10 s give-up to come first. It failed on unchanged main on Day 8 (`evidence/day-08/raw/browsers-main-run2.txt`), on #89's branch, and it stopped the factory's first #61 run.

**After:** B holds its key until the test sees A give up on its print to B, then releases it (or by itself after 40 s, so a broken give-up still fails the check). The order no longer depends on when anything arrives.

**Runs with the fix** (`15-runs-summary.txt`): 10 relay and 5 direct. The late-key step passed **14 of 14** times it ran. One relay run (`relay-6-transfer-timeout.txt`) stopped earlier, at the first transfer (`files.size === 4`, line 212): the other known flake, also seen on main on Day 8 before #89. Not this ticket.

**What I couldn't show:** a forced red. I tried delaying A's presence by 2.5 s and 6 s with a test-only wrapper (`_latekey-old.mjs`, `_latekey-new.mjs`, `presence-delay-try.txt`): the old step still passed, and the timing showed the delay didn't reliably reach A's presence handler. So the cause the #61 agent proposed (presence later than broadcast) is not confirmed. The fix doesn't depend on the cause: it removes the fixed-time race either way.

## Qodo on #93
- 372471f4 (Medium) "Evidence scripts fail before opening a browser": real, the imports were copied from tests/. Fixed; both scripts now run from evidence/flake-92 (`rerun-from-evidence.txt`).
