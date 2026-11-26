# Replay of the 5 past stops: predictions before any run (written 25 Nov, runs started just before, no results read)

What really happened: at all 5 stops the agent said "not caused by this branch" and stopped; I resumed each and it went green on rerun. #41 :288 late-guest join timeout; #61a relay "nothing dropped" = flake #92 (fixed in #93); #61b and #96 = the #100 first-transfer timeout (~1 in 10).

Predictions at K=5 per side:
- 41-708c84b (direct, late-guest join): inconclusive (0/0 most likely). Never "branch broke it".
- 61a-ca6dbb8 (relay, nothing dropped): already flaky OR inconclusive; never "branch broke it".
- 61b-4947395 (direct, #100 timeout): inconclusive (0-1 hits a side).
- 96-4453961 (relay, #100 timeout): inconclusive.
Expected headline: K=5 is too small to settle a ~1-in-10 flake; the skill should say inconclusive, not guess. A "branch broke it" on any of them would be wrong (each went green on rerun with no code change).
#41 both stops were on 708c84b with the same failure, so one replay answers both.
