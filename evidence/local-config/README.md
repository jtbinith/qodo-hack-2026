# The runner's machine-specific settings moved out of the repo

The runner named this machine's sign-in setup and work tooling in its code (a comment, the sign-in
settings key, two private folders in the agent's read ban) and in the systemd unit's PATH. Day 7's raw
evidence also carried the model provider in six `claude -p` outputs and in a copy of the runner's code.

**Now:** the runner reads them from an uncommitted local config, `~/.config/qodo-agent/local.json`
(`settingsKeys`, `denyDirs`, `passEnv`), and the unit reads a machine PATH from `~/.config/qodo-agent/env`.
`agentSettings` (`scripts/runner-lib.mjs`) builds the agent's settings: on this machine they're the same
as before the change (checked by comparing hashes). The Day 7 raw files were edited to drop those
values; everything else in them is unchanged.

`tests/no-local-details.test.mjs` fails if any tracked file names them again. Red: `01-red.txt` (the
words in it are broken with `·` so the file doesn't match its own test). Git history still has the old text.
