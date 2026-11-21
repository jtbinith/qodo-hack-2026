# Repros for the Day 8 verdicts

Run from the repo root: `node evidence/day-08/repro/<script>.mjs` (r3 takes a skew in ms: `r3.mjs 5000`).
`harness.mjs` is the fake room from `tests/net.test.mjs` (100 ms lag, mocked clock), importing the repo's
`web/net.js`. They print what a device heard, so on today's code the bugs they were written for are fixed:
the outputs quoted in `02-findings-and-verdicts.md` are from the code before each fix.

`../blind/` is the blind reviewer's scripts **as received**. They import its own scrubbed copy of the code
(`../code/web/net.js`), which isn't committed; the copies here (`r1`–`r3`) point at the repo instead, and
`r2.mjs` here logs push times from `t0` (the original used an unset field and printed NaN, Qodo 6e7378d4 on #89).
