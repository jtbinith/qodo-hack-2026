# Day 11 runs: #130 (#72 Save all) at 18ba6fb, same tree 339358f in every run

Answer key hashed first ([00-answer-key-hash.md](00-answer-key-hash.md), revealed in [04-answer-key-revealed.md](04-answer-key-revealed.md)). K1: a photo tapped during a Save all download batch downloads twice. K2: a share sheet that never settles locks Save all. Both reproduced by my blind review with failing tests on this tree ([raw/answer-key/](raw/answer-key/)).

| Run | Config | Review asked | Findings | K1 | K2 |
|---|---|---|---|---|---|
| [#130](https://github.com/jtbinith/qodo-hack-2026/pull/130) original (15:05Z) | none | on push | 0 | – | – |
| [#132](https://github.com/jtbinith/qodo-hack-2026/pull/132) control | none | 16:20:17Z | 2 Medium: a pending photo can be shared twice (opposite order to K1); download failures aren't shown | partly | – |
| [#133](https://github.com/jtbinith/qodo-hack-2026/pull/133) | wiki page pushed 16:27:52Z, 32 s after the ask (it still read it: Context sources shows) | 16:27:20Z | 1 High: photo taps duplicate batch downloads; 2 Medium: an unsettled share blocks later saves, verifying photos disappear from counts | yes (High) | yes |
| [#134](https://github.com/jtbinith/qodo-hack-2026/pull/134) configured | wiki on | 16:28:22Z | 2 Medium: a photo downloads twice during a batch, a verifying photo disappears from counts | yes | – |
| #130 rerun, same PR | wiki on | 16:37:12Z | 0 (run 2116680, done in 50 s, review comment unchanged) | – | – |

Other differences between runs (not the config): #133 and #134 show a "Context sources" section, #132 doesn't (that's what `show_context_used` turns on). #134 lists #130 and #133 as linked PRs, so the replays aren't independent. #134 used the `qodo-codebase-wisdom` skill and looked up MDN's `navigator.share` page; #133 used no skill and its router downgraded the depth from extended to standard. One run per setup.

Decisions: no finding or suggested fix in any run breaks D1-D3. #133's fix for K2 says "preserving the synchronous call to `share()` inside the tap" (D3). Lost in the configured runs: the control's "Users aren't told when downloads fail".

Qodo's chat on #134 couldn't name the guidelines: "The checkout I can read has no `.pr_agent.toml`" ([comment](https://github.com/jtbinith/qodo-hack-2026/pull/134#issuecomment-7107488040)).
