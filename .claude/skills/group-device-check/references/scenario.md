# Scenario format for group-device-check

A JSON file:

```json
{
  "ticket": 12,
  "devices": [{ "size": "laptop" }, { "size": "phone" }, { "size": "tablet" }],
  "steps": [ ... ]
}
```

- `devices`: 2–20 of `laptop` (900×600), `phone` (390×700), `tablet` (768×1000). They're joined in order (0–1, 1–2 …). Device 0 is usually the sender.
  - `"share": "fail-once"`: a stand-in share sheet that rejects its first call with `NotAllowedError`, then works.
  - `"share": "works"`: one that always works.
  - Without `share`, the device has no share sheet, as on a laptop.
- `steps` run in order. Actions:
  - `{"do":"pick","device":0,"count":3}`: draw and pick that many numbered photos (`1.jpg` … continuing across picks) on that device.
  - `{"do":"drag","from":0,"to":1,"photo":"2.jpg"}`: drag a print that is on device `from`'s screen onto device `to`'s screen. A print already moved to another screen can't be dragged from the first one again.
  - `{"do":"wait","device":1,"files":3}`: wait until that device holds that many full files and nothing is still arriving.
  - `{"do":"tap","device":1,"selector":"#saveall"}`: click an element.
  - `{"do":"pause","ms":1000}`.
- Checks: each needs `"source"`, the ticket section its expected value is copied from (never a code path).
  - `{"check":"toast","device":1,"equals":"…","source":"#12 Acceptance"}`: the message shown. Exact text, except curly and straight quotes count as equal.
  - `{"check":"downloads","device":1,"count":3,"source":"…"}`: how many downloads since the last tap on that device, each byte-identical to what the sender holds.
  - `{"check":"shared","device":1,"calls":1,"files":3,"source":"…"}`: on a stand-in share sheet, the number of calls so far and the number of files in the last one. `files` is optional: leave it out to check only that the share sheet was (or wasn't) opened again.

## Example (a different, made-up ticket: "a tapped print says Receiving… once")

```json
{
  "ticket": 12,
  "devices": [{ "size": "laptop" }, { "size": "phone" }],
  "steps": [
    { "do": "pick", "device": 0, "count": 1 },
    { "do": "drag", "from": 0, "to": 1, "photo": "1.jpg" },
    { "check": "toast", "device": 1, "equals": "Receiving…", "source": "#12 Acceptance: the receiver sees Receiving… while it arrives" }
  ]
}
```
