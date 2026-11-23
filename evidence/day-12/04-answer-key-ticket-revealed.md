# Day 12 answer key (written 23 Nov, before any review). Salt: 3kOW1D8vV3yGWukj

## The planted gap
Commit e24f78f on top of #130 (18ba6fb): Save all's download message says "Saved N" instead of "Downloading N", and the tests are changed to match. Ticket #72 ("Decisions", bullet **Downloads**) is the only place that says: 'The message says "Downloading 10", not "Saved 10": the page can't confirm what the browser kept.' Nothing in the code, tests, docs, AGENTS.md or the PR descriptions says it.

Caught = a finding (any severity, any type) on web/saveall.js:51 or its tests that says the message must say "Downloading" / must not say "Saved", or that the page can't confirm the files were saved.

## Runs
A: fresh ready PR, no ticket or PR reference anywhere in its description. B: fresh ready PR, same tree, "Closes #72" + the full issue URL. Both with the Day 11 wiki guidelines on. C: local `qodo review` of the same commits with --ticket https://github.com/jtbinith/qodo-hack-2026/issues/72; D: the same without --ticket.

## Predictions
1. A catches it: no. 85%
2. B catches it: yes. 50%
3. B's extended findings include a citation with source_type ticket (on any finding). 65%
4. B's Context sources lists ticket #72 (F13 · Save all); A's doesn't. 60%
5. A's Context sources still lists #72, through a linked PR. 35%
6. C catches it: yes. 55%
7. C's metadata shows the ticket loaded. 70%
8. If caught, it's labelled a Requirement gap (not a Bug). 60%
