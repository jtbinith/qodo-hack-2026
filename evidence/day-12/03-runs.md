# Day 12 runs: one tree (#130's Save all with a planted "Saved N"), five reviews

Planted gap: commit e24f78f changes Save all's download message from "Downloading N" to "Saved N" and the tests to match. Only ticket #72 (Decisions, **Downloads**) says: 'The message says "Downloading 10", not "Saved 10": the page can't confirm what the browser kept.' My check: #130's original `tests/saveall.test.mjs` fails on the planted code (2 failures: "Downloading 12", "Downloading 13").

All runs: same tree 0f9327b, one commit with a neutral message, Day 11 wiki guidelines on, Qodo portal on Recall. The diff's own comments name the PRD ID "F13" (also in the ticket's title). GitHub Issues is not connected in Qodo's Integrations; Figma is ([portal-integrations.png](portal-integrations.png)).

| Run | Source in description | Context sources | Finding on the message (`web/saveall.js:51`) |
|---|---|---|---|
| A [#135](https://github.com/jtbinith/qodo-hack-2026/pull/135) | none | no Tickets line, no linked PRs | Medium "Failed downloads still show as saved" (failure path, cites code only) |
| B [#136](https://github.com/jtbinith/qodo-hack-2026/pull/136) | `Closes #72` + issue URL | **Tickets: F13 · Save all** | **High** "Save all says saved before downloads run", citations include **`ticket` issues/72**; "The checklist calls for downloading-style wording rather than reporting a batch as saved before the browser confirms it." |
| C local, `--ticket` issues/72 | - | meta `ticket_bodies: [{input_chars: 2126}]` (issue body 2,128 chars) | none (5 findings, no ticket citation) |
| D local, no ticket | - | meta `ticket_bodies: []` | none |
| E [#137](https://github.com/jtbinith/qodo-hack-2026/pull/137) | Figma link to frame 3.7 only | **Figma design: Figma** | High "Save all reports photos as saved before downloads run", cites `rules` (not the ticket) |

Figma (E): 3 findings cite `figma` with node ids from the file (11:1049 Done card, 11:1052 button). Checked against the frame ([figma-frame-3-7.png](figma-frame-3-7.png)): Save all belongs in the Done card and "the code … adds no card or explanatory text" (right: the card says "They're only in this tab until you save them."); the label should be "Save all 12" (right); the button should be the white secondary variant (an accurate reading of a low-fi wireframe, not my visual style).
