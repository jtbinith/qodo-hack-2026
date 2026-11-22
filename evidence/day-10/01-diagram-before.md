# My factory before Day 10 (22 Nov, main at 14c3520)

Drawn from `scripts/agent-watch.mjs` and `.claude/skills/work-ticket/SKILL.md` as they are on main, before any Day 10 change.

- Solid box: runs today, in the factory.
- Dashed box: in the brief, but not in the factory (done by hand, or not at all).
- Hexagon: I decide.

```mermaid
flowchart TD
  T[I write a ticket] --> RL{{I label it ready-for-agent}}
  RL --> PRE["Runner pre-checks<br/>written by me, labelled by me,<br/>blockers closed, no open PR, machine ready"]
  PRE -- fails --> REF[refused: label + comment]
  PRE --> WIS["Codebase Wisdom checks the ticket's claims"]:::planned
  WIS --> AG["Agent works the ticket<br/>(work-ticket skill: test first, implement, npm test)"]
  AG -- agent writes stop.md --> HELP
  AG --> CHK["Runner checks the agent's work<br/>factory files untouched, GitHub untouched,<br/>nothing uncommitted, npm test,<br/>each test: commit fails on its own"]
  CHK -- npm test fails, 2 tries max --> FIX[Agent fixes the failing test run] --> CHK
  CHK -- any other failure --> HELP
  CHK --> LOC["Qodo local review of the uncommitted change"]:::planned
  LOC --> PUSH[Runner pushes and opens the PR]
  PUSH --> QR["Qodo reviews the PR head<br/>(runner waits up to 10 min)"]
  QR --> GATE{"gateVerdict<br/>reads Qodo's stored review of the head"}
  GATE -- "no review in 10 min, incomplete,<br/>or head moved" --> HELP
  GATE -- "High or Medium open,<br/>round < 3" --> RR["Agent handles the review<br/>(reproduce, test:, fix:) = Review Resolver step"]
  RR --> CHK
  RR -- agent disputes every finding --> HELP
  GATE -- "High or Medium open after 3 rounds" --> HELP
  GATE -- "none open (Lows flagged)" --> DONE[agent-done]
  DONE --> BLIND["Blind reviewer"]:::planned
  BLIND --> CI["Required checks on the PR"]:::missing
  CI --> MERGE{{I read the diff and merge}}
  HELP{{agent-needs-help:<br/>I dismiss in Qodo, comment /agent …, or stop}}
  HELP -- "/agent comment or dismiss" --> GATE
  classDef planned stroke-dasharray: 5 5,fill:#fff
  classDef missing stroke-dasharray: 5 5,fill:#fde8e8,stroke:#c8332b
```

## Gaps the drawing shows

| Step in the brief | Today | Where |
|---|---|---|
| Wisdom checks the ticket before work | Not in the factory. Done by hand on Day 6 only. | `agent-watch.mjs` goes from pre-checks straight to the agent |
| Qodo local review of uncommitted code | Not in the factory. Unattended runs turn Qodo off because `qodo review` uploads local files (Qodo on #86). Done by hand on Day 8 only. | `agent-watch.mjs:169` |
| Required checks before merge | None. The only workflow is `pages.yml`. The `protect main` ruleset requires a PR, no status checks. | `.github/workflows/`, ruleset 27124387 |
| Completed Qodo review of the head before merge | `gateVerdict` decides DONE, but nothing stops me merging a NOT DONE PR. | `agent-watch.mjs` ends at a label |
| Blind review | Done by hand on Days 7–9. It found something Qodo didn't each time. | not in the runner |

Predictions for this run, written before any change (SHA-256 of the file published with the post): `3132909369f9b00d9d9183fd7cf2c308725a69c9b482092c7b5bc14400b34aa4`
