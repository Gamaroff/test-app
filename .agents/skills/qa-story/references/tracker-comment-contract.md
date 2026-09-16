---
name: tracker-comment-contract
description: How every pipeline step and skill posts a comment to a tracker issue — the one tracker-comment.js call, its reason vocabulary, and the single circumstance under which the Atlassian MCP fallback is permitted. Referenced by every comment site rather than repeated at each one.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/tracker-comment-contract.md. Regenerate via `npm run bundle`. -->

# Posting a comment to a tracker issue

> **This is the primary path for a tracker-issue comment, and the only one on
> Jira.** Before task 55, every Jira comment in this repository was an
> `addCommentToJiraIssue` MCP call an agent made by following prose, and every
> GitHub issue comment was a bare `gh issue comment`. Neither could be
> intercepted, retried by code, or made idempotent, because interception needs a
> chokepoint and prose has none.
>
> **The GitHub picture is now complete too, and a test is what keeps it that
> way.** Until task 105 a number of authored prose sites still posted with a bare
> `gh issue comment`: covered by `tracker_write()` for interception, but carrying
> no marker, so they were not idempotent and a resumed run commented again — and
> being `gh`-only, they silently posted nothing at all on a Jira project. Seven
> such sites remained, across `develop-pipeline-step-7-finalise.md`, `qa-story`,
> `qa-task` and `review-story`. All seven now route through this CLI.
>
> **This paragraph is kept rather than deleted, because it is the record of why
> the guard exists.** A convention documented and not enforced is a convention
> that drifts: this one drifted for months while the sentence above it claimed
> otherwise, and nothing noticed, because a comment with no marker posts exactly
> as successfully as one with a marker. What changed is not that the prose was
> corrected — it is that `tests/mutation-call-site-coverage.test.js` now fails on
> a bare `gh issue comment` **invocation** in shipped source outside a named
> allowlist. Correct the prose and the drift returns; keep the test and it
> cannot.
>
> **One genuine exception exists, and it is a matter of scope rather than of
> allowlisting.** `develop-pipeline-on-precompact.sh` still posts with a bare
> `gh issue comment`, because it is a shell hook that must run with no Node
> available and must never block compaction. The guard reads **`.md` canonical
> prose** — skill bodies and the shared sources they are bundled from — so a
> `.sh` hook is outside its scope entirely and needs no entry. That is deliberate:
> it is the only shell site in the tree and its exclusion is permanent, so
> widening the guard to `.sh` would buy three allowlist entries and no protection.
>
> The allowlist proper (`NOT_CALL_SITES`) holds files whose mentions are
> *classification* — the defer roster, the CLI contracts — and each entry states
> why. Prose *about* a bare `gh issue comment`, including the sentences in this
> very paragraph, needs no entry at all: the guard matches invocation shape, not
> the bare literal. A guard that failed on the documentation of its own rule would
> be patched by widening its allowlist, which is how an allowlist stops meaning
> anything.
>
> PR comments are a different concern entirely and are not covered here.

## The call

One call covers both trackers — `tracker-comment.js` resolves `TRACKER` itself,
so a step doc never branches on it for a comment:

```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<'EOF'
{the markdown body}
EOF

node .agents/skills/{skill}/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage {moment} \
  --slot {name}="{value}" \
  --json
```

The `--slot` line is part of the canonical shape, not an optional extra: the
plain-language lead is rendered from the stage whether or not slots are supplied,
but with none it says the same thing every time, and a paragraph a reader has
seen five times is a paragraph they have learned to skip. **Which slot names a
stage reads is fixed** — see [`stakeholder-summary.md`](stakeholder-summary.md)
— and the engine validates none of them, so a name the stage's template does not
read is silently dropped.

**Always `--body-file`, never an inline `--body` string.** Comment bodies carry
backticks, `$(…)`, quotes and newlines; an interpolated body is a shell
injection waiting for the first comment that contains one. The file also means
the body reaches the deferred-mutation record through `command.stdin`, which is
what makes two different comments on the same issue hash to two different
records instead of collapsing into one.

**`--stage` is the comment's identity**, not a board column. It is what builds
the idempotency marker, so a resumed pipeline does not comment twice — and, since
the plain-language lead was added, it is also what selects the lead. A comment
that genuinely should be posted every time may still omit it, but must then pass
`--summary-file` (see below); an omitted `--stage` alone is now a usage error.

> `--stage` here is deliberately **not** read from `pipeline:` in
> `tracker-workflow.yaml`. That block decides which column a card moves to, and
> an omitted moment there means "do not move the card" — it does not mean "do
> not say anything". A project whose board has no review column still wants the
> PR-opened comment. There is therefore no `stage-disabled` reason on this CLI.

## The plain-language lead

Every posted body opens with a paragraph written for a reader with no technical
background. **The caller does not supply it** — the engine renders it from the
`--stage` it was already given and prepends it. Standard, writing rules and the
full per-stage catalogue: [`stakeholder-summary.md`](stakeholder-summary.md).

The composition order is fixed, and it is the thing a reader will get wrong:

```
{marker}
{lead}

---

{the caller's body, unchanged}
```

**The marker stays first.** The idempotency search and the update-in-place paths
both match on a prefix, so a lead that displaced the marker would break duplicate
detection silently rather than visibly. The lead is second — the first thing a
human sees, since the marker is an HTML comment.

Two flags exist for it, and neither is needed by an ordinary call site:

| Flag | Effect |
| :--- | :--- |
| `--slot k=v` | Fill a slot in the stage's lead. Repeatable. Every slot is optional — a template must read correctly with none |
| `--summary-file <path>` | A hand-written lead, overriding the template. The escape hatch, not an opt-out |

`--json` gains `lead: "template" | "summary-file"`, so a caller can assert which
route fired without parsing the body.

### The guard

**A comment for which no lead can be produced does not post.** A call with neither
a stage that has a template nor a `--summary-file` exits 2, having posted nothing,
and the error names both routes. This is what makes the lead a property of the
system rather than a convention: a call site cannot forget it, and a new stage
cannot be added without one.

Prefer adding a stage over reaching for `--summary-file`. A stage is reusable,
catalogued and tested; a summary file is a paragraph one call site knows about.

### Two consequences worth stating

**Deferred records changed shape.** The lead is composed *above* the access gate,
so it reaches `command.stdin`. That is deliberate — a deferred comment is the one a
human pastes by hand, so it is the last one that should arrive without its lead —
but it means the record's identity hash differs from one written before this change.
A replayed old record re-posts the old body, which is correct: the record is a
verbatim snapshot of an intended call.

**The `desired:` label is deliberately *not* the lead.** It is the one line a human
reads in the handover checklist to tell one pending action from another, and the lead
is by design near-identical across every comment of a given stage — so labelling with
it would stop the label labelling. The caller's own first line is captured before the
merge and threaded to both arms, GitHub's pre-gate record and Jira's in-flight one
alike. `command.stdin` still carries the composed body, because that is what posts.

**On Jira the `---` does not render.** `textToAdfNodes` emits no `rule` node, so the
lead arrives as its own ADF paragraph followed directly by the body's first node.
This is accepted rather than fixed: teaching the converter to emit rules would change
every Jira description this repository has ever rendered, far beyond a comment lead,
and the paragraph boundary already separates the two visually. The lead itself is a
real ADF node and is asserted as one — a string match would have passed on exactly
the malformed document that risk was about.

## Reading `reason`

| `reason` | Means | Do |
|---|---|---|
| `posted` | The comment was created | Nothing |
| `already` | Exactly one marker match — this moment was already commented | Nothing. This is a resume, not a failure |
| `deferred` | `access.tracker` is not `full`; recorded for the handover | Nothing — the record **is** the deliverable |
| `unverifiable` | 2+ marker matches, or the comment list could not be read | Log in the Issues Log and continue. **Never post anyway** |
| `no-credentials` | No usable auth | The one case where the MCP fallback applies — below |
| `dry-run` | `--dry-run` was passed; nothing read, nothing written | Nothing |

Exit codes match `jira-stage.js` and `gh-stage.js` exactly:

| Code | When |
|---|---|
| `0` | Every reason above |
| `1` | A skip, but **only** under `--strict` — never for `already`, which is success |
| `2` | A usage error: missing `--issue`; missing, unreadable or empty `--body-file`; an unknown flag; a value-taking flag with a missing or flag-shaped value; an unknown `--stage`; a non-numeric `--issue` on GitHub; an unresolvable access mode |

A comment failure must never kill a pipeline run, which is why almost everything
exits 0. Exit 2 is reserved for the caller getting the invocation wrong — a class
the pipeline should never reach at runtime, and wants to hear about loudly if it
does.

**`--stage` is validated against a known list** (`COMMENT_STAGES`, plus a numeric
suffix for the cycle-scoped `qa-cycle` / `qa-fix`, and for `pipeline-paused`, whose
suffix is the step the pipeline paused at — the PreCompact hook's comment, one per
distinct pause point). An unlisted stage is exit 2
rather than a silently unique marker that nothing could ever deduplicate against.

### Why `unverifiable` is not `already`

Two marker matches means something posted twice. Resolving that by adopting the
first — which is what `| head -1` does in the older PR-comment convention — is
how the duplicate becomes invisible and stays that way. The CLI reports the
count and refuses to choose. Treat it as a signal that something upstream ran
twice, not as noise.

`unverifiable` is a **reason**; it is unrelated to the deferred record's
`satisfied` **boolean**, which means "already correct, collapse me in the
renderer". An ambiguous match sets `reason: "unverifiable"` and leaves
`satisfied` false — the point being precisely that nothing could be verified.

## The MCP fallback — `no-credentials` only

When `TRACKER=jira` **and** the CLI reported `reason: "no-credentials"`, and only
then, call the Atlassian MCP tool:

- `addCommentToJiraIssue` with `cloudId` (the hostname from `JIRA_URL`),
  `issueIdOrKey: {TRACKER_ISSUE}`, the same `commentBody`, and
  `contentFormat: "markdown"`.
- If a call fails with a cloud resolution error, call
  `getAccessibleAtlassianResources` and use the `id` from the matching entry.
- On failure: log a warning and continue. Comments are non-blocking.

**Do not run both paths.** The CLI is authoritative whenever credentials exist.
This mirrors the fallback `jira-stage.js` already established for transitions,
and it exists for the same reason: a rule enforced only by prose fails silently,
and this repository has written down twice why that is the failure mode to
design out rather than to police.

Any other MCP comment call is a regression, and
`evals/shared/tests/transition-protocol-parity.test.mjs` enforces it as an
**absolute prohibition**: the literal `addCommentToJiraIssue` may not appear in
shipped prose at all, outside this file and `jira-transition-protocol.md`. A
bundled copy of either is exempt only when its content matches the shared source
— by content, never by filename.

That is why the fallback procedure above lives *here* and is referenced rather
than restated at each call site. The guard's first version tried to be cleverer
— it allowed a mention when the literal `no-credentials` appeared within twelve
lines above it — and that rule was **vacuous**: every rewritten site ends with a
reason table containing that literal, so the window was pre-satisfied
everywhere, and a verbatim bare MCP block re-inserted next to a reason table
produced zero offenders. A guard satisfied by the sentence documenting the
correct behaviour is worse than no guard, because it reports success. Keeping
the procedure in one place is what makes the rule enforceable.
