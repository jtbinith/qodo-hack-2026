# The runner's machine-specific settings moved out of the repo

The runner named this machine's sign-in setup and work tooling in its code (a comment, the sign-in
settings key, two private folders in the agent's read ban) and in the systemd unit's PATH. Day 7's raw
evidence also carried the model provider in six `claude -p` outputs and in a copy of the runner's code.

**Now:** the runner reads them from an uncommitted local config, `~/.config/qodo-agent/local.json`
(`settingsKeys`, `denyDirs`, `passEnv`), and the unit reads a machine PATH from `~/.config/qodo-agent/env`.
`agentSettings` (`scripts/runner-lib.mjs`) builds the agent's settings: on this machine they're the same
as before the change (checked by comparing hashes). The Day 7 raw files were edited to drop those
values; everything else in them is unchanged.

`tests/no-local-details.test.mjs` fails if any tracked file names them again. Red: `01-red.md` (which files matched, without the words). Git history still has the old text.

## The gate on this PR (#99), review 1 (271128c): 2 High, 5 Medium
| Finding | Verdict | Action |
|---|---|---|
| 89e32357 Every ticket fails its sandboxed checks (High) | real: reproduced in the factory's container, `fatal: not a git repository` (`02-guard-red-in-container.txt`) | the guard reads the files from disk, not `git ls-files` |
| 8829f7df A config entry can bypass test isolation (High) | real | `agentEnv`: a listed name can't replace PATH or anything the runner sets |
| 4074a5ef Local keys can enable user hooks (Medium) | real | control keys (hooks, permissions, plugins, MCP...) can never come from the local config |
| 2c5a216f Invalid local settings crash the timer (Medium) | real | a malformed config counts as empty |
| 0ca5fed2 Tracked proof still reveals local details (Medium) | real: the middle dots didn't hide anything | the red transcript is replaced by a list of files, without the words |
| 40078388 Ticket runs cannot find the agent tool (Medium) | partly: the run already stops loudly ("didn't finish: exit …") | the stop now says where the machine setup goes |
| 89d294d4 Missing local settings break agent sign-in (Medium) | partly: the same loud stop | same hint |
Red: `03-red-round1.txt` (3 tests) and `02-guard-red-in-container.txt`.
