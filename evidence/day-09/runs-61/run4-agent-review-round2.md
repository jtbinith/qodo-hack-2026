# Review of PR #95 at b5c2dd1

## Quality gate
Fix these if valid (High or Medium, or a label the gate couldn't read):

### Medium · Bug · A dropped request leaves stale joins in place (web/net.js:49)
`electLeader()` sends `layoutask` only once when it has no usable kept layout, with no retry or acknowledgement if the request or its answer is lost. When a late old-time-keeper layout has cleared the cached new layout, either dropped broadcast leaves the device using the old joins until an unrelated presence update or layout broadcast occurs.

Don't fix these Lows. List each in your report for jtbinith:
none

## Qodo's open findings
- A dropped request leaves stale joins in place 🐞 Bug ⭐ New

## Qodo's review comment
<h3>Code Review by Qodo</h3>

<code>🐞 Bugs (1)</code>

<img src="https://www.qodo.ai/wp-content/uploads/2025/11/light-grey-line.svg" height="10%" alt="Grey Divider">

<br/>

<img src="https://img.shields.io/badge/Medium-634FD1?style=flat-square" height="20px" alt="Remediation recommended">

<details>
<summary>  1.  A dropped request leaves stale joins in place <code>🐞 Bug</code> <code>⭐ New</code></summary>

<br/>

> <details>
><summary>Description</summary>
><br/>
>
><pre>
><b><i>electLeader()</i></b> sends <b><i>layoutask</i></b> only once when it has no usable kept layout, with no retry or
>acknowledgement if the request or its answer is lost. When a late old-time-keeper layout has cleared
>the cached new layout, either dropped broadcast leaves the device using the old joins until an
>unrelated presence update or layout broadcast occurs.
></pre>
></details>

> <details>
><summary>Code</summary>
><br/>
>
><code>[web/net.js[49]](https://github.com/jtbinith/qodo-hack-2026/pull/95/files#diff-67bd078e2174e8557f7469480176ed543833e3184890b02288abccd16ddf82d0R49-R49)</code>
>
>```diff
>+      else if (prev !== null) send('layoutask', { from: id, to: s.leader });
>```
></details>

> <details>
><summary>Agent prompt</summary>
><br/>
>
>```
>The issue below was found during a code review. Follow the provided context and guidance below and implement a solution
>
>## Issue description
>A one-shot layout request cannot recover when Supabase drops the request or its answer; the device can retain stale joins indefinitely.
>## Fix Focus Areas
>- web/net.js[46-49]
>- web/net.js[175-178]
>- web/net.js[200-200]
>## Recommended Fix
>Retry the request at a bounded, jittered interval while the same remote leader remains elected and no layout from it has been accepted. Stop the retry on a valid leader layout, another election, or leave; retain the leader's response throttle.
>```
> <code>ⓘ Copy this prompt and use it to remediate the issue with your preferred AI generation tools</code>
></details>

[Dismiss ↗](https://app.qodo.ai/findings/287350c4-888e-4d9f-b628-29727b4bf0df?action=dismiss&origin=git) | [View ↗](https://app.qodo.ai/findings/287350c4-888e-4d9f-b628-29727b4bf0df)

<hr/>
</details>



<img src="https://www.qodo.ai/wp-content/uploads/2025/11/light-grey-line.svg" height="10%" alt="Grey Divider">

<details><summary><strong>Resolved findings</strong></summary>

<br/>

<details>
<summary>  1.  <s>Late devices can lose the new layout</s> <code>✓ Resolved</code> <code>Medium</code></summary>

<br/>

<p><b>Resolving commit:</b> <a href="https://github.com/jtbinith/qodo-hack-2026/commit/b5c2dd14fce2ff58b9f5d36b4827640136fef036"><code>b5c2dd1</code></a></p>

> <details>
><summary>Resolution reason</summary>
><br/>
>
><pre>
>Adds a &#x27;layoutask&#x27; message: when a device&#x27;s time keeper changes and nothing usable was kept, it
>sends layoutask to the new time keeper (net.js line 46-ish election branch, `else if (prev !== null)
>send(&#x27;layoutask&#x27;, ...)`). The time keeper answers by sending its layout to the room, rate-limited to
>once per LAYOUT_GAP via a new layoutask handler. Adds validLayoutAsk in check.js and tests covering
>the late-old-layout ordering scenario (C asks A and holds its layout), only-time-keeper-answers, and
>rate limiting. This is the suggested remediation&#x27;s mechanism (a layout request the new time keeper
>answers), implemented with a rate limit and validation, while the earlyLayouts.clear() behavior is
>left as is.
></pre>
></details>

<!-- qodo-finding-reference
<code>↗ web/net.js[R160]</code> <code>●● Moderate</code>
-->
> <details>
><summary>Description</summary>
><br/>
>
><pre>
>The <b><i>layout</i></b> handler clears <b><i>earlyLayouts</i></b> whenever a message names the device it still considers
>time keeper, even if it has already cached a layout from the successor. If that older time keeper’s
>broadcast arrives after the successor’s layout but before the delayed presence update,
><b><i>electLeader()</i></b> finds nothing to adopt; joins between devices still present can remain stale because
>the successor is not asked to resend.
></pre>
></details>

<hr/>
</details>


</details>

<img src="https://www.qodo.ai/wp-content/uploads/2025/11/light-grey-line.svg" height="10%" alt="Grey Divider">

<!-- qodo-self-review-slot -->



<!-- qodo-daily-tip:start -->

<details>
<summary><strong>Tip of the day</strong></summary>

<br/>

<pre>💡 Did you know, you can route each severity your way: inline, summary, both, or drop</pre>

<a href="https://docs.qodo.ai/tips-and-tricks">More tips ↗</a> | <a href="https://app.qodo.ai/configurations?tab=display-preferences">Customize Qodo ↗</a> | <a href="https://docs.qodo.ai">Qodo docs ↗</a>

</details>

<img src="https://www.qodo.ai/wp-content/uploads/2025/11/light-grey-line.svg" height="10%" alt="Grey Divider">
<!-- qodo-daily-tip:end -->


<!-- https://github.com/jtbinith/qodo-hack-2026/commit/b5c2dd14fce2ff58b9f5d36b4827640136fef036 -->

<a href="https://www.qodo.ai"><img src="https://www.qodo.ai/wp-content/uploads/2025/03/qodo-logo.svg" width="80" alt="Qodo Logo"></a>

## Qodo's inline comments
none

