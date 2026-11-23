# Qodo setup before Day 11 (23 Nov, 16:25Z)

- Repository wiki: none (enabled, no pages).
- `.pr_agent.toml`: none in the repo root, no `pr-agent-settings` repo.
- `REVIEW.md`: none.
- Qodo portal (Configurations, unchanged during the experiment):
  - Preset: **Recall** (finding agents: issue finder always on, 22 active rule standards, skills, cross-repo, spec and UI agents on; spec and UI have no source connected).
  - Custom instructions: all three boxes empty (issue finding agent, rule enforcer, review depth: 0 / 2,000 characters each).
  - Context: REVIEW.md instructions on (no REVIEW.md in the repo); mine rules from review history on, with auto-approve on, so rules could change between runs. They didn't: every review reports the same 22 platform rules. Rule import from AGENTS.md, CLAUDE.md and similar files, auto-approve off.
  - Display (workspace level): **"Show context" is off** ("Disable to hide the 'Context sources' section"), [screenshot](portal-display-show-context-off.png). So a "Context sources" section on a review can only come from the wiki's `show_context_used = true`.
- What the reviews themselves report: 22 platform compliance rules, review mode "Auto", no "Context sources" section on the control (#132).
