# Day 6: questions for Codebase Wisdom, written before asking

Repo state when written: main at 96f0bbe. Asked one at a time in a fresh Claude Code session that loads the project's qodo-codebase-wisdom skill.
Earlier notes made without the Toolbox are kept out of this evidence, so only what Wisdom found is here.

## Explore
1. How does a photo get from the device that shared it to another device today, end to end? Which messages, which files, and what decides when a fetch starts?
2. How does joining screens work, and what depends on it: code, limits and tests?

## Review the backlog
3. Which open tickets deserve a closer look before anyone builds them, because their scope or approach may not fit the current code? I choose the ticket from this shortlist.

## Investigate the chosen ticket
4. What existing code could it reuse, what else would it affect, and is there a better approach? Include past PRs or Qodo findings that changed this area.
Then the challenge's own prompt, word for word.

## How answers are checked
Every claim that changes the plan is checked against the code at the commit Qodo read. Results go in a claims table: held, partly held or did not hold.
