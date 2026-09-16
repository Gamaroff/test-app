---
name: tracker-access-record
description: Canonical schema for the deferred-mutation record, the append-only journal it lands in, and the roster of the 23 tracker mutation kinds. Read by defer-mutation.js (which refuses an unknown kind) and by handover-render.js (whose totality test enumerates the roster from this file).
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/tracker-access-record.md. Regenerate via `npm run bundle`. -->

# The deferred-mutation record

> **One planned-mutation record. The access mode decides only who executes it and how it is
> rendered.**

A tracker mutation that cannot — or should not — be performed becomes a **record** appended to a
per-run NDJSON **journal**. Everything a human or a script needs afterwards is a *rendering* of that
journal. This file is the canonical definition of both, and of the roster of mutation kinds a record
may name.

**This file is load-bearing, not descriptive.** `defer-mutation.js` refuses to write a record whose
`kind` is absent from §"The 23 kinds" below, and `handover-render.js`'s totality test enumerates the
roster *from this file* rather than from a hand-written list in the test. A kind added here without a
renderer fails the suite; a kind added to a renderer without a row here is never reachable. Any count
that disagrees with the roster is a bug in one of the two.

---

## Two axes, kept distinct

| Axis | Values | Meaning |
| ---- | ------ | ------- |
| **Access mode** | `full` · `read-only` · `approve` · `command` · `manual` | *Who executes the mutation.* Resolved by `resolve-platform.sh` into `ACCESS_TRACKER`. |
| **Output format** ("renderer") | `md` · `sh` · `json` · `summary` | *How the record list is presented.* Each is a pure function of the record list. |

A mode is a **selection over renderers**, never a renderer itself:

| Mode | Renderers selected | Rationale |
| ---- | ------------------ | --------- |
| `full` | `summary` (only when a `retry_of` record exists) | Nothing is deferred by policy; a record here means something *failed*. |
| `read-only` | `json` + `summary` | The JSON is [task.57](https://github.com/Gamaroff/agent-skills/blob/develop/docs/tasks/task.57.readonly-verification-and-reconcile/task.57.readonly-verification-and-reconcile.md)'s reconcile input. |
| `approve` | `md` + `sh` + `summary` | A consent manifest: read the checklist, then run the script. |
| `command` | `sh` + `summary` | The operator holds the credential and runs the script. |
| `manual` | `md` + `summary` | The operator clicks through the UI. |

The test matrix is therefore **23 kinds × 4 output formats**, not 23 × 5.

---

## The record

One JSON object per line of the journal. Field order below is the canonical order the writer emits.

```jsonc
{
  "v": 1,                        // schema version — bump on a breaking field change
  "id": "a3f19c02",              // sha1-8 idempotency key; see §Identity
  "order": 17,                   // monotonic within a run; ties broken by ts then id
  "dependsOn": ["c81be440"],     // ids that must be performed first; [] when free-standing
  "ts": "2026-08-18T10:04:11Z",  // ISO-8601 UTC, seconds precision

  "run": "feature/task.52.foo",  // branch or run identifier
  "step": "7",                   // pipeline step that wanted the mutation
  "skill": "finalise",           // skill that wanted it

  "system": "jira",              // jira | github
  "access": "manual",            // the mode in force when the record was written
  "kind": "jira.comment.add",    // one of the 23; see roster
  "consequence": "communication",// state-drift | communication | irreversible
  "produces": null,              // symbol the operator's action yields, or null

  "intent": "Post the Definition of Done summary",
  "target": {
    "issue": "PROJ-123",
    "url":    "https://acme.atlassian.net/browse/PROJ-123",
    "ui_url": "https://acme.atlassian.net/browse/PROJ-123"
  },
  "desired":   { "status": "In Review" },
  "observed":  null,             // the verification pass populates (handover-verify.js)
  "satisfied": false,            // true → already correct, collapsed by the renderers
  "verification": null,          // optional; written by handover-verify.js — see §Verification

  "manual": {
    "deepLink": "https://acme.atlassian.net/browse/PROJ-123",
    "ui": "Open the issue → Comment → Paste → Save",
    "fields": [{ "name": "Comment", "value": "…" }]
  },
  "command": {
    "argv":  ["gh", "issue", "comment", "42", "--body-file", "-"],
    "stdin": "…"
  },
  "verify": {
    "cmd":    "gh issue view 42 --json comments",
    "expect": "contains 'Accepted'"
  },

  "blocking": false,             // true → nothing after this can proceed; see §Blocking
  "retry_of": null               // non-null → this is a FAILED full-access mutation, not a policy deferral
}
```

### Field reference

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `v` | integer | yes | `1` today. A reader that meets a higher `v` must skip the line with a warning, not guess. |
| `id` | string(8) | yes | Content hash. See §Identity. |
| `order` | integer | yes | Monotonic within a run. Not globally unique; not a sort key on its own. |
| `dependsOn` | string[] | yes | May be `[]`. Ids referring to records in the same journal. A dangling id is tolerated and warned about, never fatal. |
| `ts` | string | yes | ISO-8601 UTC. |
| `run` / `step` / `skill` | string | yes | Provenance. `step` is a string because bug and batch pipelines use non-numeric step labels. |
| `system` | `"jira"` \| `"github"` | yes | Must agree with the `kind`'s namespace. |
| `access` | one of the five modes | yes | What the mode *was*, not what it is at render time. |
| `kind` | string | yes | Must appear in the roster. |
| `consequence` | `state-drift` \| `communication` \| `irreversible` | yes | Defaults from the roster; a caller may not soften it, only harden it. |
| `produces` | string \| null | yes | The symbol the action yields (e.g. `github.issueNumber`). Records that `dependsOn` this one consume it. |
| `intent` | string | yes | One line, imperative, human-facing. Never an argv restatement. |
| `target` | object | yes | `url` is *the object*; `ui_url` is *where you perform the action*. They differ for board-field sets and sprint operations. |
| `desired` | object \| null | yes | The state wanted. |
| `observed` | object \| null | yes | `null` until the verification pass (`handover-verify.js`) populates it. Holds the observed value — for a value read that has not yet reached the desired state, this is the **pre-action baseline** later passes use to detect `divergent`. |
| `satisfied` | boolean | yes | `true` → collapsed into "already correct" by every renderer — ticked and struck through, never deleted. |
| `verification` | object \| null | no | Written by `handover-verify.js` / `/tracker-reconcile`: `{state, at, observed, detail, baseline?}` where `state` ∈ `satisfied` · `pending` · `divergent` · `unverifiable`. Kept verbatim (timestamp included) when a re-read agrees, which is what makes reconciling twice byte-identical. `unverifiable` is **never** coerced to `satisfied`. |
| `manual` | object \| null | yes | `null` only when the kind genuinely has no UI path. |
| `command` | object \| null | yes | `argv` is an **array** — never a joined string. `stdin` carries bodies. |
| `verify` | object \| null | no | Omitted when there is no cheap read-back. |
| `blocking` | boolean | no | Defaults `false`. `true` → the run cannot converge until a human performs this action. See §Blocking. |
| `retry_of` | string \| null | no | The `id` of the record whose execution failed, or a short failure token. |

### Blocking

A record is **blocking** when the run cannot finish correctly until a human performs it — not merely
when it is important. The test is mechanical and narrow:

> A record is blocking if some later action in the same run needs the value it `produces`, and no
> other path can supply that value.

`github.issue.create` under a deferring mode is the case this field exists for. The caller wanted an
issue number to write into frontmatter; it did not get one, so the document is left unwritten and
every dependant action is stranded. The operator must create the issue, write the key into the
document, and re-run — the **two-run convergence**. Until they do, re-running changes nothing, and a
run that appears to do nothing twice is indistinguishable from a broken one. That is the failure this
field is here to make loud.

**`blocking` is not a severity.** `consequence: irreversible` says *this cannot be undone*;
`blocking: true` says *nothing after this can proceed*. They are independent: a `jira.sprint.set-state`
is irreversible and not blocking; a milestone create is reversible and blocking for the issue that
needs its number.

**Never fabricate the produced value to clear a block.** Writing `github_issue: 0` or
`jira_key: <pending>` would defeat the idempotent `synced-from-*` label search that stops the next run
creating a duplicate. A wrong key is worse than no key, and the empty capture is the honest answer.

Renderers must surface blocking records **at the top**, not in document order — `md` and `summary`
both open with a banner naming them and the convergence instruction. A blocking record buried at
position 17 of a checklist is a blocking record nobody acts on first.

### Identity

```
id = sha1( system + "|" + kind + "|" + targetKey + "|" + fingerprint ).slice(0, 8)
```

- `targetKey` — the `target` object serialised with keys sorted, so field order cannot change identity.
- `fingerprint` — **all** of: `intent`, `desired`, the `manual.fields` name/value pairs,
  `command.argv`, and `command.stdin`.

The pipelines are resumable with per-step artifact verification, so a re-run re-emits records.
Deduplicating on `id` is what makes every renderer idempotent across a resume, for free.

**Every payload-bearing field is in the fingerprint, deliberately.** It once used `command.argv`
alone as the fallback, so two comments posted to the same issue — identical argv
(`gh issue comment 230 --body-file -`), different bodies — collapsed to one `id` and the renderer
silently dropped one. A wanted tracker action vanished from all four outputs with nothing to signal
it: the invisible-drift failure this sequence exists to remove, and strictly worse than the
behaviour it replaces.

> **`intent` must therefore be deterministic for a given action.** It is part of identity, so an
> intent embedding a timestamp, a duration or a counter makes a resume emit a *second* record for
> the same action, and the checklist then lists it twice. Write intents from the action's own inputs
> only — `Move PROJ-1 to Done`, not `Move PROJ-1 to Done at 10:04`.

### Credential safety — an invariant, not a hope

**No record may contain a credential value.** The writer redacts before the line is written, and every
renderer redacts again on the way out. Both layers are mutation-proven.

Redaction replaces a secret **value** with its environment variable **name**, so the output stays
actionable:

```
"argv": ["curl", "-H", "Authorization: Bearer $JIRA_API_TOKEN"]
```

Three rules, applied in order:

1. **Environment sweep.** Any `process.env` entry whose *name* matches
   `TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_KEY|APIKEY|_PAT|AUTH` and whose value is ≥ 8
   characters is replaced, wherever that value appears in any string in the record, by `$NAME`.
2. **Flag pairs.** In `command.argv`, the value following `--token`, `--password`, `--api-key`,
   `--secret`, `-p`, `-u`, `--auth`, `--header`/`-H` (when the header is an auth header) is replaced
   by `«redacted»` unless rule 1 already named it.
3. **Shape match.** Strings matching an *unambiguous* secret shape — `ghp_`/`gho_`/`ghs_`/`ghu_`/
   `github_pat_` prefixes, Atlassian `ATATT…`, `Bearer <opaque>`, `Basic <base64>`, `xox…`, and a
   password in a URL's userinfo — are replaced by `«redacted»`. These are safe on every string,
   because nothing else looks like them.

**The generic "long unbroken high-entropy run" heuristic applies only in credential-bearing
positions** — the value after a secret flag, and an auth header's value. Applied to free text it
corrupted real content: a 40-character commit SHA, an embedded base64 asset, a long URL path and the
branch name `feature/task.52.deferred-mutation-record-and-renderers` all became `«redacted»`,
silently mangling the text a human is told to paste. The residual gap is deliberate — an unprefixed
token is caught by the environment sweep if it is configured anywhere, and a 40-char hex run is
genuinely ambiguous between a token and a SHA. Corrupting every SHA to catch a hypothetical bare
token is the wrong trade.

`-u` and `-p` are credential flags **only for clients that use them that way** (`curl`, `mysql`,
`psql`, …). Masking them unconditionally turned `git push -u origin HEAD` into
`git push -u «redacted» HEAD`.

Redaction is **idempotent**: it runs on write and again on render, and a value already reduced to
`$NAME` or `«redacted»` is left alone. Without that the second pass masked the name the first pass
produced, and the committed script could no longer tell an operator what to export.

Object **keys** are redacted as well as values — a credential used as a key otherwise survived
untouched into the checklist and the JSON sidecar.

Committing the rendered script and JSON is defensible **only** because this holds. It is watched
failing under mutation (see the task's Testing Strategy).

Bodies are passed to CLIs via `--body-file -` with `stdin`, **never** `--body "$(cat …)"`. A body
containing backticks, `$(…)`, a heredoc terminator or CRLF must round-trip unchanged.

---

## The journal

**Path:** `.claude/state/tracker-actions.jsonl` — append-only NDJSON, one record per line.

| Property | Why |
| -------- | --- |
| **Append-only** | Appends under 4 KiB are atomic on POSIX, so a node script and a shell function writing in the same step cannot corrupt each other. |
| **Crash-safe prefix** | A crash mid-run leaves a readable prefix; a malformed trailing line is skipped with a warning and the rest still render. |
| **Gitignored** | `.claude/` is already ignored. The *journal* is runtime state; the *renderings* are the committed artifacts. |
| **Per-worktree by construction** | `develop-batch` gives each item its own worktree and therefore its own `.claude/`, so journals are isolated with no locking. |

Override the path with `TRACKER_ACTIONS_JOURNAL` (absolute or repo-relative). Tests use this; the
pipelines do not.

### Committed renderings

`handover` is an artifact kind in the existing grammar beside `implementation`, `qa`, `gate`, `dod`:

```
task.{n}.handover.{n}.{name}.{md,sh,json}
story.{epic}.{story}.handover.{n}.{name}.{md,sh,json}
```

Co-located in the work-item directory, so `/commit-changes --scope {work-item-dir}` already picks
them up. The `summary` format is inline output, not a file, and takes no pattern. The script ships
mode `0644` and dry-run-by-default so nobody runs it by accident.

---

## The 24 kinds

Every row is one mutation kind. `Consequence` is the default a record inherits; a caller may harden
it (`state-drift` → `irreversible`) but never soften it. `Produces` names the symbol an operator's
action yields, which dependants consume via `dependsOn`.

**Jira — 10** (6 REST mutators + 2 sprint + 1 transition + 1 catch-all)

| `kind` | Consequence | Produces | Underlying call |
| ------ | ----------- | -------- | --------------- |
| `jira.issue.create` | irreversible | `jira.issueKey` | `POST /rest/api/3/issue` |
| `jira.issue.update` | state-drift | — | `PUT /rest/api/3/issue/{key}?returnIssue=true` |
| `jira.comment.add` | communication | — | `POST /rest/api/3/issue/{key}/comment` |
| `jira.issue.link` | state-drift | — | `POST /rest/api/3/issueLink` |
| `jira.worklog.add` | communication | — | `POST /rest/api/3/issue/{key}/worklog` |
| `jira.backlog.add` | state-drift | — | `POST /rest/agile/1.0/backlog/issue` |
| `jira.sprint.move-issues` | state-drift | — | `POST /rest/agile/1.0/sprint/{id}/issue` |
| `jira.sprint.set-state` | irreversible | — | `POST\|PUT /rest/agile/1.0/sprint/{id}` |
| `jira.transition` | state-drift | — | `POST /rest/api/3/issue/{key}/transitions` |
| `jira.unknown-mutation` | irreversible | — | any non-GET through `makeHttp` that no semantic mutator annotated |

`jira.unknown-mutation` is the catch-all the fail-closed HTTP gate writes: a non-GET that reached
`makeHttp` under a non-`full` mode and that no semantic mutator annotated. Its consequence is
`irreversible` because nothing knows what the call would have done — a confirm gate is the only
honest default for a mutation the system cannot describe. A record of this kind is also a signal:
it means a mutation path exists that nobody has annotated yet.

**GitHub — 13** (board, issue, milestone, PR and comment kinds)

| `kind` | Consequence | Produces | Underlying call |
| ------ | ----------- | -------- | --------------- |
| `github.issue.create` | irreversible | `github.issueNumber` | `gh issue create` |
| `github.issue.edit` | state-drift | — | `gh issue edit` (title, body, milestone, labels) |
| `github.issue.close` | state-drift | — | `gh issue close` |
| `github.issue.reopen` | state-drift | — | `gh issue reopen` |
| `github.issue.comment` | communication | — | `gh issue comment` |
| `github.milestone.create` | state-drift | `github.milestoneNumber` | `POST /repos/{o}/{r}/milestones` |
| `github.sub-issue.add` | state-drift | — | `POST /repos/{o}/{r}/issues/{n}/sub_issues` |
| `github.board.item-add` | state-drift | `github.projectItemId` | `gh project item-add` |
| `github.board.field-set` | state-drift | — | `updateProjectV2ItemFieldValue` (Status, Priority, Estimate) |
| `github.pr.create` | irreversible | `github.prNumber` | `gh pr create` |
| `github.pr.comment` | communication | — | `gh pr comment` |
| `github.pr.merge` | irreversible | — | `gh pr merge` |
| `github.unknown-mutation` | irreversible | — | any `gh` mutation through `tracker_write` that named no kind |

`github.unknown-mutation` is the GitHub twin of `jira.unknown-mutation`, and exists for the same
reason: `tracker_write` in `resolve-platform.sh` wraps ~38 `gh` mutations generically, and a caller
that sets no `TRACKER_WRITE_KIND` gives the gate no way to say what the call would have done. The
wrapper infers the kind from argv for the shapes it recognises (`gh issue comment`, `gh pr comment`,
`gh issue close`, …); anything else lands here. Its consequence is `irreversible` because nothing
knows what the call would have done — a confirm gate is the only honest default for a mutation the
system cannot describe. A record of this kind is also a signal: it means a `gh` mutation path exists
that nobody has annotated yet.

**Bitbucket — 1** (the inline PR comment)

| `kind` | Consequence | Produces | Underlying call |
| ------ | ----------- | -------- | --------------- |
| `bitbucket.pr.comment` | communication | — | `POST /2.0/repositories/{ws}/{repo}/pullrequests/{n}/comments` |

Bitbucket's first kind, and for a long while its only one. Every other Bitbucket call in this
repository is a read, or is authored prose that predates the interception layers; `pr-inline-comment.js`
is the first Bitbucket **mutation** written as code, so it is the first that can be gated. Its GitHub
twin is `github.pr.comment` — the same consequence, because an unposted comment costs a record nobody
reads and breaks nothing.

**Total: 24.**

`github.milestone.create` is a **create**, not an edit, and that distinction is the reason it is its
own kind rather than a case of `github.issue.edit`. The four call sites that reach it
(`ensure-{story,epic,task}-github-issue`, `sync-github-epic`) resolve a milestone by title and create
it when absent; the number that comes back is then attached to an issue. It therefore `produces` a
symbol a dependant consumes — the property that defines this class — where `github.issue.edit`
attaching an *already existing* milestone produces nothing. Reading the parenthetical
"(title, body, milestone, labels)" on `github.issue.edit` as covering creation is the mistake this
row exists to prevent.

> The roster is parsed mechanically. A kind row is a table row whose first cell is a single
> backtick-quoted token containing a `.`, in a table whose header reads `` `kind` `` followed by a
> `Consequence` column. Keep that shape when editing.
>
> Two guards make a bad edit loud rather than silent. A first cell containing a backtick that does
> not parse as a kind **throws** — bolding one row used to drop every kind below it while
> `roster.size` stayed non-zero, so nothing complained until `defer()` threw *inside the stage-CLI
> gate*, which swallows the throw and returns `deferred` with no record at all. And the parsed total
> is asserted against `EXPECTED_KIND_COUNT` in `defer-mutation.js`: **adding or removing a kind means
> changing that constant in the same commit.** The friction is the point — it is what stops a
> truncated roster from looking like a smaller one.

### Consequence classes

| Class | What skipping costs | Script behaviour |
| ----- | ------------------- | ---------------- |
| `state-drift` | The board and reality disagree. Recoverable by re-running. | Runs under `--apply` without further prompting. |
| `communication` | A record nobody reads is lost. Nothing breaks. | Runs under `--apply` without further prompting. |
| `irreversible` | Cannot be undone, or is not idempotent (a second run creates a duplicate). | Emits a **confirm gate**, never a bare command. |

Grouping by consequence is what stops a missed board move and an un-merged PR being buried in the
same undifferentiated list.

---

## `⚠️ UNRECORDED`

A renderer is given, alongside the journal, the set of moments the run was *expected* to record. A
moment that produced no record renders as `⚠️ UNRECORDED` rather than being silently absent — the
invisible-drift failure this whole sequence exists to remove.

---

## See also

- [`defer-mutation.js`](defer-mutation.js) — the single writer (CLI + `require`)
- [`handover-render.js`](handover-render.js) — the four renderers
- [`platform-detection.md`](platform-detection.md) — how `ACCESS_TRACKER` is resolved
