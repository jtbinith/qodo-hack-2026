# My factory after Day 10

Drawn from `scripts/agent-watch.mjs`, `scripts/qodo-gate.mjs` and the `protect main` ruleset on main at f78fee9. Compare [before](01-diagram-before.md). Green: steps [#21](https://github.com/jtbinith/qodo-hack-2026/issues/21) went through ([07-run-21.md](07-run-21.md)). Orange: where I stepped in.

```mermaid
flowchart TD
  T[I write a ticket and label it] --> G0["0 · Pre-checks<br/>my ticket, no blockers, no open PR"]
  G0 --> G1["1 · Codebase Wisdom checks the ticket<br/>runner finds each quote at file:line"]
  G1 -- "claim proven wrong" --> STOP
  G1 -- "design question open<br/>(after 2 stops: agent decides, lists it)" --> STOP
  G1 --> AG[Agent: failing test first, then fix]
  AG --> G2["2 · Runner: npm test,<br/>each test: commit red on its own"]
  G2 --> G3["3 · Qodo local review<br/>of unpushed commits"]
  G3 -- "High or Medium<br/>(2 rounds)" --> AG
  G3 --> PUSH[Runner pushes, opens PR]
  PUSH --> G4["4 · CI npm test (required)"]
  PUSH --> G5["5 · Qodo PR review of the head<br/>complete, no High/Medium open"]
  G5 -- "finding" --> SC{"Scope: repro on branch and main.<br/>Introduced or in acceptance?"}
  G5 -- met --> G6["6 · Blind review<br/>can't see Qodo or the agent's notes"]
  G6 -- "repro fails" --> SC
  SC -- yes --> AG
  SC -- no --> DEF[Defer to a ticket]
  G6 -- "nothing reproduced" --> GREEN[qodo-gate green]
  G4 --> MERGE{{I read the diff and merge}}
  GREEN --> MERGE
  AG -- "3 rounds or 2 fix-caused<br/>findings in a row" --> STOP{{"NOT DONE comes to me:<br/>dismiss with evidence, /agent, defer"}}
  STOP -. "my call" .-> BYPASS{{Bypass merge, recorded}}
  class G0,G1,AG,G2,G3,PUSH,G4,G5,SC,G6 used
  class STOP,BYPASS me
  classDef used fill:#d7f5dd,stroke:#2b8a3e
  classDef me fill:#ffe8cc,stroke:#d9480f
```
