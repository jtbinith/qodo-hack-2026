# Day 7: resolving Qodo's finding on PR #86

**Outcome:** Qodo's re-review of the new head **`cc26e6e`** completed and re-attributed the finding to `implemented` by itself, and it raised no new findings. No status write was needed: `mark-implemented` wasn't used and nothing was posted to the PR by hand.

## The finding
- **PR:** [jtbinith/qodo-hack-2026#86](https://github.com/jtbinith/qodo-hack-2026/pull/86).
- **First review:** run `2022639` at `b41eb40`, which was the head at the time (`raw/04`, `raw/05`).
- **Finding:** `69808cf1-03a0-4513-8256-adf53318aa70`, *"Private code reaches Qodo without consent"*. Security, `remediation_recommended`, at `.claude/skills/qodo-review/agents/openai.yaml:8` (`allow_implicit_invocation: true`).
- **The claim:** the `qodo-review` skill can start without being asked, and it uploads the local diff, untracked files and session context to Qodo with no consent step. So unpublished code could leave the machine during ordinary coding.

## What I checked
The full analysis is in `00-finding.md`. All references are at `b41eb40`, read with Qodo. **[V]** means verified in the code; **[A]** means an assumption or Claude Code behaviour not shown in this repo.

- **Codex [V]:** `agents/openai.yaml` is the Codex adapter. It's generated ("Do not edit by hand", `:1`) and sets `allow_implicit_invocation: true` (`:7-8`).
- **Claude Code [V]:** the `SKILL.md` frontmatter (`:1-11`) has no `disable-model-invocation`, and a repo-wide grep finds the key nowhere. [A] So Claude Code may invoke the skill by itself.
- **The skill invites unprompted use [V]:** the description says "Use light background checkpoints while coding" (`SKILL.md:3`). The body calls for automatic `--fast --async` checkpoints (`:31,35,50`).
- **What leaves the machine [V]:** the diff, untracked files and session context (`SKILL.md:17,284-289`). The prerequisites ask for no consent (`:21-25`).
- **The factory (`scripts/agent-watch.mjs`):**
  - [V] `Skill` is allowed (`:145-146`) and project skills load (`--setting-sources project`, `:161`).
  - [V] Bash is limited to the test and git commands (`:149-151`), and `qodo` isn't among them.
  - [A] So in headless `claude -p` a `qodo review` call was already refused.
  - [V] `GUARDED` (`:44-45`) stops only the factory agent's own runs from touching `scripts/` and `.claude/` (`:173-175`). You confirmed it doesn't apply to your commits.
- **Verdict:** the finding is valid for both Codex and Claude Code.

## The fix and its commits
| Commit | Change |
|---|---|
| `a740101` | `00-finding.md` and Qodo's raw outputs. The whoami output was replaced with a redacted copy when you rewrote the commit. |
| `b1319f4` | `.claude/skills/qodo-review/SKILL.md`: `disable-model-invocation: true` (Claude Code). `.claude/skills/qodo-review/agents/openai.yaml`: `allow_implicit_invocation: false` (Codex). Patch record: `local-patches.md`. |
| `cc26e6e` | `scripts/agent-watch.mjs` DENY: `Skill(qodo-review)`, `Skill(qodo-review-resolver)`, `Skill(qodo-codebase-wisdom)` and `Bash(qodo:*)`, with a one-line comment. |

- **Effect:** neither agent starts the skill on its own. In Claude Code, only `/qodo-review` starts it: because of `disable-model-invocation: true`, asking in plain words ("run qodo review") likely no longer does. [A] Not checked. In Codex, `$qodo-review` starts it.
- **Vendored files:** `local-patches.md` records the patch and its reason, plus a grep to re-check it after a skill update.
- **Not changed, on purpose:** the other two Qodo skills, `qodo-codebase-wisdom` and `qodo-review-resolver`, still allow implicit invocation. Neither uploads local source.
- **Tests:** `npm run test:unit` passed after each code change, 57/57 at `cc26e6e`. `node --check scripts/agent-watch.mjs` passed.
- **Not run:** the two-browser test, because nothing under `web/` changed (Rule 5).
- **Pushed:** `b41eb40..cc26e6e` to `qodo-toolbox`. The PR head is `cc26e6e` (`raw/17-pr-86-meta-after-push.json`).

## Does Qodo's re-review clear it?
**Yes.**
- **The re-review:** run `2022774`, started 01:52:27Z and `completed` at commit `cc26e6e09826b65d920fbf242030b21b7d5d497e`, which equals the PR head. I first saw it completed at 01:57:31Z (`raw/15-findings-at-cc26e6e.json`, `.time`).
- **The finding:** `69808cf1…` is now `attribution_status: implemented`. That is a closed status, set by the review itself, with no dismissal reason (`raw/16-findings-extended-at-cc26e6e.json`).
- **Review history:** `review_runs` lists `2022774` at `cc26e6e` and `2022639` at `b41eb40`, both completed.
- **New findings:** none. The only finding on the PR is this one, now closed.
- **No status write:** the finding cleared on its own, so the "wait about 10 minutes, then ask before `mark-implemented`" fallback wasn't needed.

**Process note:** the poll checked once a minute and saved only the review-session output. No `whoami` output went into `raw/` this time.
