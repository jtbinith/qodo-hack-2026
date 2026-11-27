# Day 14 predictions, scored

Hashed and pushed before either PR existed (`00-predictions-hash.md`). The action was a label when I wrote them; I switched it to Auto approve later (README, step 5), so "label" below reads as "the workflow's action".

| # | Prediction | Confidence | Result |
|---|---|---|---|
| 1 | Outside: no label while a Medium+ is open; the label within ~2 min of a clean review | 70% | **Wrong.** No label ever came: the stored settings skipped the label action. After the switch, the approval came 29 s after the review. |
| 2 | Inside: no label on any head, including a clean one | 80% | **Right.** #155 clean, no label, no approval. |
| 3 | Decision data: outside eligible/approve; inside ineligible or "surface" | 60% | **Right** on the final heads: #154 `approve`, #155 `surface`. But #155's `approvalEligibility` still says `eligible`. |
| 4 | The action and `qodo-gate` agree on both final heads, or the disagreement is recorded | 65% | **Right, with the disagreement recorded:** #154 both say done; #155 `qodo-gate` success while Qodo holds it, because the guard sends it to me. That's intended. |
| 5 | A new push removes the label until the new head is reviewed | 55% | **Not tested.** Neither PR got a push after the action. |
| 6 | Qodo's first review of the outside PR has at least one Medium+ | 85% | **Right, locally:** Qodo's local review of `177a829` found a Medium ("Guests see the QR outside the invite dialog"), fixed test first before the push. Every PR review was clean. |
| 7 | No final head gets a skipped or incomplete review | 75% | **Right.** Both final heads complete. |

5 right, 1 wrong, 1 not tested. The wrong one is the one that mattered: I predicted when the label would come, not whether the settings would let it.
