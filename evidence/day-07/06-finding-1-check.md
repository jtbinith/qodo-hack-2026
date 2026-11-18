# Day 7: checking finding 1's fix in fresh Claude Code runs

**Finding:** `69808cf1`, *Private code reaches Qodo without consent*. The fix:
- `disable-model-invocation: true` in `.claude/skills/qodo-review/SKILL.md`;
- `allow_implicit_invocation: false` in its Codex adapter (`b1319f4`);
- four DENY entries in `scripts/agent-watch.mjs` (`cc26e6e`).

**How it was checked:**
- **Where:** fresh `claude -p` runs in `<checkout>`, the `qodo-toolbox` worktree at `2c9d9b8`. Claude Code `2.1.327.1766`.
- **Settings:** `--setting-sources project` (only this project's skills and settings), `--strict-mcp-config` (no MCP servers), and a settings file carrying only sign-in (`awsCredentialExport`, `env`, `model`), as the factory does (`agent-watch.mjs:139-143`).
- **Safety:** runs A–D had **no Bash** (`--tools Skill,Read`, `--disallowedTools Bash`), so nothing could be uploaded even if the skill started. Run E used the factory's own tool flags.

**Outputs:** `raw/35`–`40` (stream-json), and `raw/41-factory-run.mjs` for the script that built run E's flags. Paths are redacted to `<checkout>`, `<home>`, `<project>`, `<scratch>` and `<socket>`. No whoami.

**[V]** means verified by these runs; **[A]** means an assumption or not checked.

## Results
| Run | Prompt | What happened | Raw |
|---|---|---|---|
| A | "List the exact names of every skill you could invoke yourself…" | The model's list **omits `qodo-review`**, while `qodo-review-resolver` and `qodo-codebase-wisdom` are on it. The session's own `skills` list includes `qodo-review`, so it is loaded, just not for the model. [V] | `35` |
| B | "run qodo review on my changes" | The model called **`Skill(qodo-review-resolver)`**, not `qodo-review`. It then stopped, because it had no shell. **Plain words don't start `qodo-review`.** [V] | `36` |
| C | "/qodo-review" | No Skill call was needed: the slash command loaded the skill. The reply follows `qodo-review`'s own steps: it names `qodo --version`, `qodo read whoami`, `git merge-base`, `qodo review` and "the MCP path", then stops for lack of a shell. [V] [A] The expanded skill text itself isn't shown in the stream; I'm inferring that it loaded from the reply. | `37` |
| D | "Use the Skill tool to invoke the skill named exactly qodo-review…" | Refused: `Skill qodo-review cannot be used with Skill tool due to disable-model-invocation. Ask the user to run /qodo-review themselves…` [V] | `38` |
| E1 | The factory's flags (`TOOLS`, `ALLOW` and `DENY` read from `scripts/agent-watch.mjs`); asked to call the three Qodo skills, then `qodo --version` | `qodo-review` was refused (disable-model-invocation). `qodo-review-resolver` and `qodo-codebase-wisdom` each gave "**Skill execution blocked by permission rules**". `qodo --version` gave "**Permission to use Bash with command qodo --version has been denied.**" [V] | `39` |
| E2 | The same, with `DENY` **minus the four new entries** (a control) | `qodo-review` was still refused (disable-model-invocation). `qodo-review-resolver` and `qodo-codebase-wisdom` **launched**. `qodo --version` gave "This command requires approval", which in `-p` means it didn't run. [V] | `40` |

## What this shows
- **Plain words:** they no longer start `qodo-review` in Claude Code (B). A direct model call is refused (D). The model doesn't list it among the skills it can invoke (A).
- **Explicit request:** `/qodo-review` is the only way to start it in Claude Code (C). [A] Other user-side routes weren't tried.
- **Codex:** `$qodo-review` is untested. There's no Codex here, so `allow_implicit_invocation: false` is [A].
- **The factory's DENY refuses all four.** E1 vs E2 shows what each layer does:
  - `disable-model-invocation` alone already blocks `qodo-review`.
  - Without the new entries, the factory agent could load `qodo-review-resolver` and `qodo-codebase-wisdom`.
  - `qodo` was already refused before the new DENY entries, because Bash allows only the test and git commands. That matches what I read from the code earlier (`00-finding.md`). Now it's denied outright.
- **A side effect worth knowing:** "run qodo review on my changes" now starts **`qodo-review-resolver`**, which reads the remote PR review rather than reviewing local changes. [A] That's harmless for the upload risk, since the resolver doesn't send local code, but it isn't what the user asked for.

## Corrected lines
- `local-patches.md:15`: now says only `/qodo-review` starts it in Claude Code, citing runs B–D, and that Codex's `$qodo-review` wasn't checked.
- `01-resolution.md`, "Effect": the same, replacing the earlier [A] "likely no longer does… Not checked" with the [V] result.
