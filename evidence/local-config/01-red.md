# The guard test before the scrub (red)

`tests/no-local-details.test.mjs` failed, listing matches in these files (the matched words are left out on purpose):

- evidence/day-07/06-finding-1-check.md: 2 lines
- evidence/day-07/raw/08-read-agent-watch-130-164.json: 8 lines
- evidence/day-07/raw/35-claude-p-skill-list.jsonl: 6 lines
- evidence/day-07/raw/36-claude-p-plain-words.jsonl: 10 lines
- evidence/day-07/raw/37-claude-p-slash-qodo-review.jsonl: 6 lines
- evidence/day-07/raw/38-claude-p-direct-skill-call.jsonl: 8 lines
- evidence/day-07/raw/39-factory-flags-with-deny.jsonl: 16 lines
- evidence/day-07/raw/40-factory-flags-without-new-deny-entries.jsonl: 16 lines
- scripts/agent-watch.mjs: 8 lines
- scripts/systemd/qodo-agent.service: 2 lines

The settings test failed too: `lib.agentSettings` didn't exist yet.
