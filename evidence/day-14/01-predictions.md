# Day 14 predictions (written 26 Nov, before either PR exists). Salt: BfqHgJSYTjvaq8

Setup: guard jtbinith/qodo-hack-2026 · only scripts/** · workflow scoped to this repository: when Qodo finishes reviewing a PR, if no findings at Medium or higher (all categories and types), then add the "Qodo approved" label.
Outside PR = #102 (Invite with a link and a QR code, web/). Inside PR = #151 (repeated device-check boxes, scripts/).

1. Outside: no label while a Medium or higher is open; the label appears within about 2 min of a complete, clean review of the head. 70%
2. Inside: no label on any head, including a clean one. 80%
3. Qodo's decision data: outside reads eligible / approve; inside reads ineligible because of the guard (or "surface"). 60%
4. The label and qodo-gate agree on both final heads; any disagreement is recorded with its cause. 65%
5. A new push removes the label until the new head is reviewed. 55%
6. Qodo's first review of the outside PR has at least one Medium or higher. 85%
7. No final head gets a skipped or incomplete review. 75%
