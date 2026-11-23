```toml
[review_agent]
issues_user_guidelines = """
Universal sharing is a website: phones, tablets and laptops in one room share photos in the browser, with no app and no account.

Product decisions to respect:
- Every file arrives as the original (only location and device details are removed, unless the sender keeps them). Saving or sharing a received photo hands over those original bytes, never a thumbnail or a re-encoded copy.
- Received files live only in the tab's memory and are never written to disk, except when the person saves them themselves.
- On iOS the share sheet only opens inside the person's tap: don't suggest awaiting anything before navigator.share.

What I want review to help me catch:
- What happens when the person taps again, or uses another button, while an earlier share or download is still running.
- A browser promise (share sheet, download) that rejects late or never settles.
"""

[review_agent_ux]
show_context_used = true
```
