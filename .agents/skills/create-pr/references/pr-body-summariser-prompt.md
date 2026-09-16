---
name: pr-body-summariser-prompt
description: Explore subagent prompt and output contract for generating a structured PR body from a git diff patch file. Used by create-pr Step 5 to keep diff bytes out of main context and produce a consistent 4-section body.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/pr-body-summariser-prompt.md. Regenerate via `npm run bundle`. -->

# PR Body Summariser — Explore Subagent Prompt

## Purpose

When composing a PR body, dispatch an Explore subagent with this prompt instead of reading the diff into main context. The subagent reads the patch file, produces structured markdown, and returns it as a string. Main context never reads the raw diff.

## Prompt Template

Substitute `<DIFF_FILE>` with the actual patch file path before dispatching.

```
Read <DIFF_FILE>.

Produce a markdown PR body with exactly these sections:

## Summary
3 bullets max. Plain prose — what changed and why, no jargon.

## Changes
Group by top-level directory. Each group: up to 4 bullets.
If the diff exceeds 5000 lines: replace this section with a one-line count per top-level directory (e.g. "src/: 12 files changed").

## Test plan
Checkbox list of what a reviewer should verify. Up to 6 items.

## Concerns
Risky or unusual changes a reviewer should focus on. Omit this section entirely if there are none.

Rules:
- Output markdown only — no prose outside the sections, no fences
- Total output ≤ 80 lines
- Do not invent changes not present in the diff
- If <DIFF_FILE> is empty or unreadable: return the single line "<!-- diff unavailable -->"
```

## Output Contract

The Explore subagent returns the PR body as a plain markdown string (no JSON wrapper needed). Store the returned string as `$PR_BODY`.

**Fallback** — if the subagent returns an empty response, returns `<!-- diff unavailable -->`, or errors:

```bash
PR_BODY=$(git log origin/$BASE_BRANCH..HEAD --pretty=format:"- %s")
```

Log the fallback reason in the implementation report Issues Log (or to stderr if no report is active).

## Cleanup

Remove the patch file after the PR is created (success or failure):

```bash
rm -f "$DIFF_FILE"
```
