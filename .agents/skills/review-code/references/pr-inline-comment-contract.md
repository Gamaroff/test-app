---
name: pr-inline-comment-contract
description: How a review skill posts findings as inline comments on a pull request — the one pr-inline-comment.js call, its per-finding reason vocabulary, the degradation rule that guarantees a finding is never dropped, and the re-run rule. Referenced by every inline-comment site rather than repeated at each one.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/pr-inline-comment-contract.md. Regenerate via `npm run bundle`. -->

# Posting findings as inline comments on a pull request

> **A finding is never dropped.** That is the single property this file exists to
> guarantee, and every rule below serves it. A review that silently loses
> findings is worse than one that posts none, because the reader believes they
> have seen everything.

`tracker-comment.js` covers a comment on a tracker **issue**. This covers a
comment on a pull request **anchored to a line of the diff** — a different
concern, a different transport on both platforms, and a different failure mode:
issue comments cannot fail to anchor, and inline comments routinely do.

## The call

One call covers both platforms — `pr-inline-comment.js` resolves `VCS` itself,
so a step doc never branches on it:

```bash
node .agents/skills/{skill}/references/pr-inline-comment.js \
  --pr {PR_NUMBER} --findings-file .claude/state/findings.json \
  --summary-file .claude/state/summary.md --json
```

`--findings-file` is a JSON array. Each entry:

| Field    | Required | Meaning                                                                |
| -------- | -------- | ---------------------------------------------------------------------- |
| `path`   | yes      | Repo-relative file path, exactly as it appears in the diff             |
| `line`   | yes      | 1-based line number in the **destination** file                        |
| `body`   | yes      | The finding's markdown                                                 |
| `side`   | no       | `RIGHT` (default) or `LEFT`. `LEFT` anchors a **deleted** line         |
| `id`     | no       | A **namespace**, not an identity — the body is always hashed in. `CR-{n}` is stable only within one run, so a bare ordinal would make run 2's `CR-1` a different finding wearing run 1's name |

**Never an inline `--body`.** Bodies carry backticks, `$(…)`, quotes and
newlines; an interpolated body is a shell injection waiting for the first
finding that quotes the code it is about. The file is also what carries each
body into the deferred-mutation record's `command.stdin`, which is what makes
two different findings hash to two different records instead of collapsing into
one and losing a comment.

## The degradation rule

**Anchoring failure degrades to the summary comment. It never drops a finding
and never fails the run.**

A line outside the diff hunk is rejected by GitHub with a 422, and this is
common rather than exceptional — a finding about a function whose body did not
change, but whose caller did, has no line in the diff to attach to. So:

1. Every finding is attempted inline first.
2. A finding the platform will not anchor is **collected**, not discarded.
3. After the inline pass, every collected finding is appended to a **single
   summary comment** on the PR conversation, under a heading that says why it is
   there.
4. That finding's per-finding `reason` is `anchor-failed` — **never** `posted`.

The distinction in step 4 is the whole point. Reporting a degraded finding as
`posted` would make the failure invisible, which is the same outcome as dropping
it from the caller's perspective.

If the summary comment *itself* cannot be posted, the run reports
`summary-failed` and exits non-zero **only under `--strict`** — but it prints
every undelivered finding to stderr first, so the text still reaches a human.

### What the summary comment is composed of, in order

The summary comment is the one a non-technical reader reaches — it is what the
tracker comment's link leads to — so it opens with a plain-language lead. The
composition is exactly:

| Position | Content | When |
| :-- | :--- | :--- |
| 1 | the caller's `--summary-file`, verbatim | whenever one is supplied |
| 1 | `renderLead("pr-summary", {degraded})` | **only** when no `--summary-file` was supplied *and* there is at least one degraded finding |
| 2 | `DEGRADED_HEADING` and the count sentence | when there is at least one degraded finding |
| 3 | one block per degraded finding: `path:line`, why, body | as above |

Two rules that are easy to get wrong in opposite directions:

**A caller-supplied summary wins outright and is never double-led.** The review
skills write their own summary, and that summary *is* the lead. Prepending a
catalogue lead as well gives the reader two orienting paragraphs before any
content, the second contradicting the first whenever the caller's summary is
about something other than anchoring. So do not put a lead in your
`--summary-file`: the engine adds one on the path that needs it.

**A caller summary with no degraded findings gets no lead at all.** The summary
comment is posted when *either* a caller summary or a degraded finding is
present, so that combination is reachable — and a `pr-summary` lead there would
explain unanchored findings that do not exist.

## Inline findings carry no lead, deliberately

Each **inline** body is `marker + finding.body` and nothing else. This is a
design decision, not an omission.

A comment anchored to line 47 of a diff has exactly one reader — the developer
who wrote line 47. A non-technical paragraph on each of forty findings is noise
for the only audience they have, and it would push the actual finding below the
fold. The lead belongs on the **summary** comment, which is the one a reader
outside the review loop actually reaches.

Because this reads as an oversight, it is held by tests rather than by prose:
`pr-inline-comment.test.mjs` §10 asserts that no catalogue lead appears in an
inline body, *and* that the source still builds that shape — the second exists
because a shape assertion alone would keep passing on its own fixture after the
real construction had changed. "Fixing" the exclusion turns both red.

## The re-run rule: marker + update-in-place

Each inline body is prefixed with an invisible marker (`<!-- agent-skills-inline:{id} -->`
on GitHub, the same HTML comment on Bitbucket). On a re-run:

| Situation                                             | Behaviour                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| Marker found, anchor still valid                      | `PATCH`/`PUT` that comment in place → `updated`                    |
| Marker found, anchor no longer in the diff            | Leave the old comment alone; degrade this finding → `anchor-failed` |
| Marker found more than once                           | `unverifiable` — do not post, do not edit, do not resolve          |
| No marker                                             | Post fresh → `posted`                                              |

**Resolving and replying to existing threads is deliberately out of scope.**
Update-in-place was chosen precisely because it needs neither: a stale comment
whose anchor moved is left for a human, which is noisier than resolving it but
cannot destroy a thread someone was using. The cardinality rule is
`tracker-comment.js`'s, transcribed — two markers means someone posted twice,
and adopting the first with `| head -1` hides the second forever.

## Reading `reason`

The top-level `reason` describes the **run**; each entry in `findings[]` carries
its own. Read both: a run whose top-level reason is `posted` may still contain
`anchor-failed` entries, and those are the ones a human needs to know about.

| `reason` | Means | Do |
|---|---|---|
| `posted` | Every finding landed where it was aimed | Nothing |
| `partial` | Some inline, some degraded to the summary | Report the `anchor-failed` count — the findings are delivered, just not beside their lines |
| `already` | Every finding's marker was already present and current | Nothing — this is a resume, not a failure |
| `anchor-failed` | *(per-finding only)* This finding degraded to the summary comment | Nothing — it was delivered. Never treat it as a drop |
| `updated` | *(per-finding only)* An existing comment was edited in place | Nothing |
| `unverifiable` | Duplicate markers, or the comment list could not be read | Log it and continue. **Do not post anyway** |
| `deferred` | `access.tracker` is not `full`; recorded for the handover | Nothing — the record is the deliverable |
| `no-credentials` | No usable auth (`gh` unauthenticated, or no Bitbucket credential) | Fall back to the caller's own summary comment |
| `no-pr` | No pull request for this branch | Print the findings; there is nowhere to comment |
| `dry-run` | `--dry-run`; everything resolved, nothing read, nothing written | Nothing |

## Exit codes

Transcribed from `tracker-comment.js` so this is a drop-in for the same
`|| echo "⚠️ …"` subshell idiom:

- **0** — every normal outcome, including `anchor-failed`, `unverifiable`,
  `deferred`, `no-credentials` and any unhandled throw.
- **1** — a skip, but only under `--strict`.
- **2** — usage error: missing `--pr`, missing/unreadable `--findings-file`,
  malformed findings JSON, unknown flag.

**Commenting never gates anything.** A review whose comments failed is still a
review that ran; exiting non-zero by default would let a comment failure stop a
pipeline that had already done its work.

## Platform notes

**GitHub** posts one **batched review** (`POST /repos/{o}/{r}/pulls/{n}/reviews`
with `event: COMMENT` and a `comments[]` array) — one API call and one
notification instead of N. `commit_id` is the PR **head SHA**, never `HEAD`:
gating one commit and annotating another is how a comment lands on a line
nobody wrote. If the batched call is rejected wholesale, the CLI falls back to
per-comment `POST /pulls/{n}/comments`, which isolates the rejection to the
findings that actually caused it.

**Bitbucket** posts one comment per finding, `{content: {raw}, inline: {path, to}}`.
`to` is the **destination**-file line; a finding anchored to a deleted line uses
`from` instead. The re-run rule applies here too: the arm scans
`GET …/comments` for markers and `PUT`s the matching comment rather than posting
again. It is **single-shot on write** — there is no Bitbucket retry helper in
this repo, and this CLI does not invent one. A transient failure degrades that
finding to the summary comment like any other anchoring failure, which is the
correct behaviour anyway.

Bitbucket has no equivalent of GitHub's `position: null`, but that is not the
check that matters: the two comparisons that actually fire are **path** and
**line**, and Bitbucket returns `inline.path` / `inline.to` on every inline
comment. Both arms therefore implement the stale-anchor row identically — a
marker found on a comment that is no longer where the finding points is degraded,
never rewritten in place and reported `updated`.

> **The Bitbucket arm ships fixture-tested, not exercised.** This repository is
> GitHub-hosted, so the payload shape is asserted against fixtures and the
> transport is not run in anger. Treat a first Bitbucket run as a smoke test.

## Access gate

The gate sits between the local work (arg parsing, file reads, marker
construction) and the first remote call, exactly as in `tracker-comment.js` and
`gh-stage.js` — so a gated run demonstrably attempts no network call. Under any
mode other than `full`, each finding is recorded as a deferred mutation
(`github.pr.comment` / `bitbucket.pr.comment`) and the run reports `deferred`.

The comparison is `!== "full"`, never truthiness: an unset variable must read as
`full`, or this CLI silently stops commenting everywhere.
