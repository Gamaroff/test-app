---
name: review-code
description: 'Standalone adversarial diff code review of the working tree or a pull request — surfaces correctness bugs (logic, null/async/race, API misuse, broken invariants) and reuse/simplification/efficiency cleanups. Advisory by default; `--comment` posts findings as inline PR comments, `--fix` applies them to the working tree. Use when the user wants a code review of their current changes, a diff, or a PR without running the full QA gate. Triggers: review my changes, review this diff, review code, review PR 123, /review-code.'
---

> **Platform detection**: see [`references/platform-detection.md`](references/platform-detection.md) and [`references/resolve-platform.sh`](references/resolve-platform.sh)

# Review Code

## Overview

`/review-code` runs an adversarial, diff-level code review and reports correctness bugs and quality cleanups. It is the standalone sibling of the diff-review pass embedded in `/qa-story` (Phase 1.6) and `/qa-task` (Step 3b): all three dispatch the **same** reviewer prompt — the single source of truth at [`references/code-review-prompt.md`](references/code-review-prompt.md). The difference is orchestration, not the reviewer:

- `/review-code` works on **any diff** (working tree or a PR), needs **no work-item document and no quality gate**, and can act on findings (`--comment`, `--fix`).
- The QA skills review a diff scoped to a tracked story/task and feed findings into the QA gate.

The reviewer subagent is **always read-only**. Posting comments and applying fixes are decisions this skill makes from the returned findings — never the subagent.

## When to Use This Skill

- "Review my changes" / "review this diff" / "code review my branch"
- "Review PR 123" / "review this pull request"
- Before opening a PR, to catch bugs and cleanups in the working tree
- As a customizable, self-hosted alternative to the built-in `/code-review` skill

Do **not** use this for a full QA gate against a story/task — use `/qa-story` or `/qa-task` (which already include this review as one phase).

## Arguments

Invoke as `/review-code [target] [--effort LEVEL] [--comment] [--fix]`.

| Arg | Values | Default | Meaning |
| --- | --- | --- | --- |
| `target` | _(none)_ \| `<PR-number>` \| `<base>...<head>` \| `--staged` | working-tree changes vs `HEAD` | What to review |
| `--effort` | `low` \| `medium` \| `high` \| `max` | `medium` | Breadth vs. precision (see below) |
| `--comment` | flag | off | Post findings as inline PR comments |
| `--fix` | flag | off | Apply findings to the working tree (no commit) |

**Effort** scales coverage, not the output contract:

- `low` / `medium` — few, high-confidence findings (favour precision).
- `high` / `max` — broader coverage; may surface `confidence: low` candidates, clearly labelled as uncertain.

`--comment` and `--fix` are independent and may be combined. With neither, the review is advisory — findings are printed only.

## Workflow

### Step 1 — Resolve scope and build the diff patch file

Keep raw diff bytes out of main context by writing the diff to a temp patch file (in the session scratchpad, not the repo). Pick the scope from `target`:

```bash
DIFF_FILE="$(mktemp -t review-code.XXXXXX.patch)"

# Default: uncommitted working changes
git diff HEAD > "$DIFF_FILE"

# --staged: staged changes only
# git diff --staged > "$DIFF_FILE"

# <base>...<head>: an explicit range
# git diff "$BASE"...HEAD > "$DIFF_FILE"

# <PR-number>: resolve the PR base, then diff against it
# BASE=$(gh pr view "$PR" --json baseRefName -q .baseRefName)   # GitHub
# git fetch -q origin "$BASE" && git diff "origin/$BASE"...HEAD > "$DIFF_FILE"
```

If the diff is empty, report "no changes to review" and stop.

### Step 2 — Dispatch the reviewer subagent (read-only)

Dispatch **one read-only Explore subagent** with the prompt from [`references/code-review-prompt.md`](references/code-review-prompt.md) — the single source of truth. Pass the **Prompt Template** verbatim, substituting `<DIFF_FILE>` with the patch path and `<WORKING_DIR>` with the repo root. Fold the resolved `--effort` level into the dispatch (more agents / broader instruction at `high`/`max`; one focused pass at `low`/`medium`). Never read the raw diff into main context.

The subagent returns a `code_review:` YAML findings block (schema defined in the prompt). Parse it; do not invent or augment findings.

### Step 3 — Render findings (always)

Print findings to the user, sorted bugs-before-cleanups then by severity, each as:

```
[CR-1] bug · high · confidence: high — src/x/y.ts:42
  what is wrong
  → suggested action
```

If `truncated_count > 0`, note that N additional lower-severity findings were omitted. If there are no findings, say so plainly.

### Step 4 — `--comment` (optional)

Only if `--comment` is set and a PR exists for the current branch (or `target` named one):

**Branch on `$VCS` for everything PR-shaped, on `$TRACKER` for everything issue-shaped.** They are separate axes — a repo can host code on Bitbucket and track work in Jira, or on Bitbucket with GitHub issues. Every branch in this step is PR-shaped and therefore keys off `$VCS`: a comment on a pull request is a property of where the code lives, not of where the issues live. `gh` cannot address a Bitbucket PR at all, so taking the GitHub arm on a Bitbucket repo does not degrade — the comment silently never lands and the run still reports success.

1. Source the platform helper and resolve the platform:
   ```bash
   # shellcheck source=references/resolve-platform.sh
   . "$(dirname "$0")/references/resolve-platform.sh" || exit 1   # adjust to the bundled path in this install
   # VCS = github | bitbucket   ← the axis this step branches on
   ```
2. **Both platforms**: post the findings inline with the shared primitive. It resolves `$VCS` itself, so this call does not branch — and it is real code rather than the prose that used to sit here describing behaviour no file implemented:

   ```bash
   # `.findings[]`, NOT `.[]` — the latter iterates the `code_review:` wrapper's
   # values (`reviewed`, the findings array, `truncated_count`), so the select
   # indexes a string and jq aborts. `.finding` is the schema's key, not
   # `.summary`; see `references/code-review-prompt.md` § Output contract.
   #
   # The `test()` guard is load-bearing: jq is all-or-nothing inside `[ … ]`, so a
   # single `file_line` of `src/x.ts:42-58` (a range) or `src/x.ts` (no line) would
   # abort the WHOLE program, leave `$INLINE_FILE` empty, and drop every finding —
   # not degrade them, drop them. `suggested_action` is likewise made optional.
   # A finding excluded here has no line to anchor to; carry it in your summary.
   jq '[ .code_review.findings[]?
         | select((.file_line? // "") | test("^.+:[0-9]+$"))
         | {path: (.file_line | split(":")[0]),
            line: (.file_line | split(":")[1] | tonumber),
            body: (.finding
                   + (if .suggested_action then "\n\n→ " + .suggested_action else "" end))} ]' \
      "$FINDINGS_JSON" > "$INLINE_FILE" || {
     echo "findings JSON did not match the schema — not posting inline"; exit 1; }

   node .agents/skills/review-code/references/pr-inline-comment.js \
     --pr "$PR_NUMBER" --findings-file "$INLINE_FILE" \
     --summary-file "$SUMMARY_FILE" --json
   ```

   **Anchoring failure degrades to the summary comment; it never drops a finding.** A line outside the diff hunk is rejected — routinely — and that finding is appended to the summary instead, reporting `anchor-failed` rather than `posted`. Pass `--summary-file` so the degraded findings land under your own summary rather than in a bare comment of their own. Read the per-finding `reason`s: a `partial` run delivered everything, just not all of it inline.

   **Do not pass the finding's `id` through.** `CR-{n}` is an ordinal that is
   stable *within a run*, so handing it over as a cross-run identity makes run 2's
   `CR-1` a different finding wearing run 1's name. Omitting it lets the CLI derive
   an identity from the anchor plus the body, which is the only signal this schema
   actually offers.

   Contract, `reason` vocabulary and the re-run rule (marker + update-in-place): [`references/pr-inline-comment-contract.md`](references/pr-inline-comment-contract.md).
3. **Summary-only fallback** — when no finding carries a `file_line`, or the CLI reports `no-credentials`. This step still branches, because the two platforms have no common transport for a conversation comment.

   Build the body **once**, with the lead above the branch, so the two arms post the same bytes.
   `$SUMMARY_FILE` is the summary you wrote for the inline path; reuse it rather than composing a
   second one:

   ```bash
   # `in-review` — this comment says a review has been done and what it found.
   # The findings body below it is unchanged; the lead is added, nothing removed.
   LEAD=$(node references/stakeholder-summary-cli.js --stage in-review) || exit 1

   PR_COMMENT_BODY_FILE="$(mktemp -t review-code-comment.XXXXXX.md)"
   {
     printf '%s\n\n---\n\n' "$LEAD"
     cat "$SUMMARY_FILE"
   } > "$PR_COMMENT_BODY_FILE"
   ```

   > This is the fallback path. The **inline** path above routes through `pr-inline-comment.js`,
   > which renders its own `pr-summary` lead inside `buildSummaryBody()` when it has to degrade —
   > and suppresses it when you pass `--summary-file`, because a caller-supplied summary already
   > *is* the lead. So `$SUMMARY_FILE` must stay lead-free: the engine adds one on the path that
   > needs it, and this block adds one on the path that does not go through the engine. Putting a
   > lead in the file itself would double-lead whichever path ran.

   **GitHub** (`VCS=github`): one summary comment via `tracker_call_with_retry gh pr comment "$PR_URL" --body-file "$PR_COMMENT_BODY_FILE"`, inheriting 3× exponential backoff and the `ACCESS_TRACKER` deferral gate for free.

   **Bitbucket** (`VCS=bitbucket`): via the Bitbucket REST API. Resolve the credential with `source references/bitbucket-auth.sh` (Bearer or Basic, chosen by variable name; non-zero when neither is set), then `POST` the contents of that same `$PR_COMMENT_BODY_FILE` as a `{content: {raw: …}}` body to `${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_ID}/comments`. Make it idempotent the way `/finalise` does: search the PR's existing comments for a leading HTML marker and `PUT` that comment id instead of posting a duplicate. The working dual-platform recipe is in [`skills/finalise/SKILL.md`](../finalise/SKILL.md) **Step 7 — "Mark as Accepted and Generate Artifacts"**, which carries both arms side by side; copy that shape rather than re-deriving it.

   > Inline comments now work on **both** platforms (task 70) — Bitbucket via the `inline: {path, to}` key, with `from` for a deletion. The Bitbucket arm is fixture-tested rather than exercised, since this repo is GitHub-hosted; treat a first Bitbucket run as a smoke test.
   >
   > `/qa-story` step 6 and `/qa-task` Step 13 now **do** carry a Bitbucket arm of their own (task 69), so they are a legitimate reference again — but reference them for the *transport*, not for this step's shape. They post one **per-cycle, deliberately non-idempotent** comment; this step wants the idempotent marker-and-`PUT` form, which is why `/finalise` remains the recipe to copy here.

Wrap every remote call in `tracker_call_with_retry` (3× exponential backoff) — see [`references/resolve-platform.sh`](references/resolve-platform.sh). Both bugs and cleanups post; commenting never gates anything.

### Step 5 — `--fix` (optional)

Only if `--fix` is set:

1. Apply each finding's `suggested_action` to the working tree. **Do not commit** — leave changes for the user to review.
2. Apply **bugs** by default; apply **cleanups** only when the user explicitly opts in (e.g. `--fix=all`), since cleanups are quality-of-life and may be subjective.
3. After applying, re-render which findings were applied vs. skipped (and why), so the user can audit the edits against the diff.

For a fix-and-simplify pass focused purely on quality (no bug hunting), prefer the `/simplify` skill.

### Step 6 — Cleanup

```bash
rm -f "$DIFF_FILE"
```

## Customization

Because this skill and the QA passes share one prompt, customise the reviewer in **one place** — the source prompt `code-review-prompt.md` under the repo's `shared/resources/` directory, **not** the bundled `references/` copy beside this skill (that copy carries an `AUTO-GENERATED — DO NOT EDIT` header and is overwritten by the bundler). After editing the source, run `npm run bundle`; the change propagates to `/review-code`, `/qa-story`, and `/qa-task` together. Add or reword the "What to look for" categories, tighten the discipline rules, or extend the output contract there.

Orchestration that is specific to standalone review — argument parsing, scoping, the `--comment`/`--fix` behaviour — lives in this SKILL.md and does not affect the QA skills.

## Relationship to Other Skills

- **`/code-review`** (built-in) — `/review-code` is the self-hosted, customizable replacement.
- **`/qa-story`, `/qa-task`** — run the same reviewer as one phase of the QA gate; use those when you have a tracked work item.
- **`/simplify`** — quality-only fix pass (reuse/simplification/efficiency); use when you do not want bug hunting.
- **`/qa-fix`** — consumes gate `top_issues[]`; the QA path (not `/review-code`) feeds it.

## Relationship to the develop pipelines

`/develop-story` and `/develop-task` do **not** call `/review-code`. They get the code-review-and-fix loop through their QA step: `qa-story`/`qa-task` already run this same reviewer prompt every cycle, and the pipeline passes `code_review_blocking=true` so high-confidence bugs gate the build and get fixed by `qa-fix` on the next cycle (a story/task opts out with `code_review_blocking: false`). Use `/review-code` for ad-hoc, human-in-the-loop reviews **outside** that automated loop — e.g. a quick sweep (and optional `--fix`) of the working tree before opening a PR.
