# Replaying candidate gates on findings with known verdicts

Verdicts and labels: `02-verdicts-and-predictions.md` (hash `d113cd3b…` committed in 8d64903 before any
gate was written; GitHub activity log in `raw/00-branch-activity.txt`: branch created 20:43:30Z, gate
pushed 20:52:11Z). Labels are Qodo's `action_level`: action_required = High, remediation_recommended =
Medium, informational = Low (checked on the PR comments of #87 and #89).

"Let through" = a real finding the gate wouldn't make the agent fix. "Noise" = an out-of-scope or
wrong finding the gate would block on.

| Gate | Design set (Day 8, 11): let through / noise | Held-out (Days 5 and 7, 15, all real): let through | Held-out PRs called done with a real finding open |
|---|---|---|---|
| Zero open (the old factory gate) | 0 / 1 | 0 | 0 of 5 |
| High only | 7 / 0 | 9 | 4 of 5 (#87, #86, #64, #67) |
| **High + Medium** (saved) | 1 / 1 | 1 (a Low: #86's PR body says refunds work) | 1 of 5 (#86), flagged to the owner |

On the held-out set the old gate is the safest: all 15 findings were real, so it can't show the new
gate's advantage (not blocking on noise), which only shows in the design set. The finding High + Medium
lets through is real but labelled Low by Qodo, and it's a misleading PR description, not a code bug.

The "quick review never counts" rule adds nothing on the held-out set (#64's skipped review and #86's
incomplete one already had open High or Medium findings). Its only evidence is Day 8, where a quick
local rerun came back clean and Qodo's PR review then found 2 Mediums; even a full local rerun had missed them.

#86 note: it was clean at 2654fd1 (Day 7). Its 2 open Mediums came from later reviews of evidence-only
pushes (d99a0cf5 at c85b293, b76d976d at 42205e4), and I merged it with them unanswered.
