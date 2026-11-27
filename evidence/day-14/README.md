# Day 14: my quality gate as a Qodo workflow

## Result

| PR | Paths | Head | Qodo review | Qodo's decision | GitHub | `qodo-gate` | CI `npm test` |
|---|---|---|---|---|---|---|---|
| [#154](https://github.com/jtbinith/qodo-hack-2026/pull/154) Invite with a link and a QR code ([#102](https://github.com/jtbinith/qodo-hack-2026/issues/102)) | `web/`, `tests/`, `docs/` | `491b4ca` | complete, 0 findings (run 2187294) | `approve` · `approved_clean` · criterion `matched` · provider `confirmed` | `qodo-code-review[bot]` **APPROVED** 02:39:12Z | success | pass |
| [#155](https://github.com/jtbinith/qodo-hack-2026/pull/155) each unticked box once ([#151](https://github.com/jtbinith/qodo-hack-2026/issues/151)) | `scripts/agent-watch.mjs`, `scripts/runner-lib.mjs`, a test | `016c492` | complete, 0 findings (run 2187310) | `surface` · criterion `matched` · `withdraw_approval`; PR Triage: "Qodo's PR approval blocked" | **no approval, no label** | success | pass |

Same clean review, opposite outcome by path: the `scripts/**` guard holds #155 for me.

## Files
- `00-predictions-hash.md`: sha256 of my predictions, pushed before either PR existed (branch created 2026-11-26T20:43:48Z).
- `01-predictions.md`: the predictions themselves (`sha256sum` matches `86e7cfc8…`). Scored in `02-predictions-scored.md`.
- `01…05-*.png`: the guard and the label workflow as first set up (26 Nov), read back after a reload.
- `06-workflow-auto-approve-repo.png`: the final workflow, repository scope, Auto approve.
- `07-pr155-triage-approval-blocked.png`: PR Triage timeline for #155.
- `08-settings-fix-workspace.png`: the workspace settings read back after my fix.
- `data/`: unchanged extracts of Qodo's own data (PR Triage `pull-requests?sort=priority` and `config/v1/settings` responses) and GitHub's reviews and label events.

## What went wrong first, and the fix
1. **The label never came.** [#153](https://github.com/jtbinith/qodo-hack-2026/pull/153) (clean) matched the label workflow but Qodo decided `surface`, `advisoryResult: skipped` (`data/triage-153-decision.json`). #154's first clean review wasn't evaluated at all (`data/triage-154-decision.json`), and its second was `surface` with the label action skipped again.
2. **The cause was in the stored settings, not the panels** (`data/settings-before.json`):
   - `output_mode: native_vote`, the mode where the label action is skipped;
   - the guard panel showed "jtbinith/qodo-hack-2026 · Only these paths · scripts/**" but stored `deny_repos: ["jtbinith/qodo-hack-2026"]` plus `deny_paths: ["jtbinith/qodo-hack-2026:scripts/**"]`, which held every PR in the repository.
3. **Workspace fix** through the portal's own settings API (`PATCH /config/v1/settings`): `label_only`, `advisory_enabled: true`, `enabled: false`, and a bare `deny_paths: ["scripts/**"]` (`data/settings-after.json`). Reviews were then recorded but still not evaluated (`data/triage-154-after-fix.json`).
4. **Repository scope** overrode it with `enabled: true`, which Qodo's own validation rejects with `label_only` ("The effective merge-automation policy is invalid"). Writes to `enabled` saved but read back `true`. My API writes to the workflow list appended copies, which I then removed.
5. **Decision:** switch the action to **Auto approve**, which uses `native_vote` and needs `enabled: true`. Repository settings: `native_vote`, `advisory_enabled: false`, guard `scripts/**`. `main`'s ruleset requires `npm test` and `qodo-gate`, not approvals, so a `qodo-bot` approval can't merge anything. I merge.

## Real phone
#154 was checked on my iPhone after merging (live site at `7f129de`, revert ready): the Camera app scanned the QR code and joined the same room; no room code in the address bar; reload rejoins; a new tab shows the lobby; Copy works. Android not checked.
