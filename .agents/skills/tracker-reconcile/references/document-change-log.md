<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/document-change-log.md. Regenerate via `npm run bundle`. -->
# Document Change Log

> **Canonical spec.** Consumed by `create-{prd,epic,story,task}`, `review-{prd,epic,story,task}`,
> `edit-{epic,story}`, `correct-course`, `develop`, `qa-{story,task}`, `finalise`, and the six
> `sync-{jira,github}-{epic,story,task}` skills. Implemented by
> [`change-log.js`](change-log.js).

A PRD, epic, story, or task document carries a **Change Log** section: an append-only table
recording what changed about the document, when, and who changed it. It is the document's own
history, written in the document, next to the thing it describes.

## Why it looks like this

A tracker already keeps an issue history, and `git log` already keeps a commit history. The
Change Log exists because neither answers the question a stakeholder actually asks — *what
changed about this requirement, and when did it change?* Git tells you a file was edited;
the tracker tells you a card moved. Only the Change Log tells you `AC3 was added on the 13th,
after review`.

Four columns, because two audiences read the same table:

- **Humans authoring and reviewing** care about the document's *version* — `1.0` at first
  draft, `1.1` after a review pass changes the acceptance criteria.
- **Machines syncing and gating** care about the *moment* — a Jira issue was created, a QA
  gate passed, a status moved.

A machine writer leaves `Version` blank. That single convention is what lets one table serve
both, instead of a human log and a separate machine log that disagree about what happened.

## The section

```markdown
<!-- change-log-start -->
## Change Log

| Date       | Version | Description                                  | Author          |
|------------|---------|----------------------------------------------|-----------------|
| 2026-05-11 | 1.0     | Initial draft                                | create-story    |
| 2026-05-13 | 1.1     | Review passed (9/10) — ready for development | review-story    |
| 2026-08-12 |         | Jira story created (PROJ-42)                 | sync-jira-story |
<!-- change-log-end -->
```

Rules:

- **Exactly four columns**, in that order: `Date`, `Version`, `Description`, `Author`.
- **`Date` is `YYYY-MM-DD`**, matching frontmatter `created` / `updated`. The legacy
  `YYYY-MM-DD HH:MM` form is *read* (so old rows migrate) but never *written*.
- **`Version` is a document version** — `1.0`, `1.1`, `2.0` — bumped by authoring, review, and
  edit skills only. Machine writers (sync, QA, finalise, develop) leave it blank.
- **`Author` is the skill name** that wrote the row (`create-story`, `review-task`,
  `sync-jira-story`, `qa-task`, `finalise`), or a person's name for a hand edit.
- **Append-only.** Newest at the bottom. Existing rows are never rewritten, reordered, or
  removed. The one exception is *widening* a legacy two-column row during migration, which
  preserves its content exactly and only adds the two missing cells.
- **Every entry bumps frontmatter `updated:` in the same edit.** `updated` is this repo's OKF
  `timestamp` (see [`open-knowledge-format.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/open-knowledge-format.md)); a Change Log row
  that does not move it leaves the document claiming it was last touched before its own most
  recent recorded change. `bumpUpdated()` exists so no caller has to remember.

### Heading

The heading is `## Change Log` at top level for epic, story, and task documents.

**PRDs keep `### Change Log` nested under §1** — the PRD section contract is asserted in
[`docs/standards/prd-documents.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/standards/prd-documents.md) and the `create-doc`
engine owns section nesting. Rather than force PRDs to restructure, readers accept:

- **H2 or H3** — `## Change Log` or `### Change Log`
- **optional section numbering** — `### 1.5 Change Log`, `## 12. Change Log`

`Change Log` must be the entire heading text after any numbering. The level found is the level
preserved on rewrite: an H3 log stays H3.

### Markers

`<!-- change-log-start -->` and `<!-- change-log-end -->` wrap the block. Two legacy pairs are
**superseded** — read and migrated in place, never written:

| Legacy pair | Was written by | Migrates to `Author` |
|---|---|---|
| `<!-- jira-sync-changelog-start/end -->` | the three `sync-jira-*` skills | `sync-jira-{doctype}` |
| `<!-- github-sync-changelog-start/end -->` | the three `sync-github-*` skills | `sync-github-{doctype}` |

A document that was synced to both trackers grew two independent blocks. On first write through
this engine they **collapse into one**, rows merged in date order, with no duplication.

**Migration is a side effect of writing a row, never a write of its own.** It happens inside
`upsertChangeLog`, so a sync that earns no row never passes the document through the engine and
never rewrites it. This is load-bearing rather than incidental: migrating unconditionally would
make every sync rewrite every document, churning git history and firing writes that change
nothing — the same defect `37bcf3f` fixed by hashing only what is published. A document therefore
migrates exactly once, on the first sync that was already writing for another reason.

### What a sync logs, and what it does not

The tracker syncs write a row for **two events only**: the issue being created, and a status
transition driven from frontmatter. A body, summary, title, priority, label or milestone update
writes **nothing**.

This is deliberate and it is not a loss of history. Both trackers keep a full issue history with
actor and timestamp — strictly better than a local row naming only which fields moved — and the
document now records *why* the body changed through its own review, develop, QA and acceptance
rows. `jira_last_synced_at` in frontmatter still records the last sync time. Before this rule, a
document taken through one pipeline run accumulated roughly a dozen `Updated: summary, description`
rows: the same churn that got the Change Log removed from tracker cards entirely.

### An example is not a Change Log

Every match — marker pair or heading — is ignored when it falls inside:

- a ` ``` ` or `~~~` **fenced code block**, or
- an **inline code span** (`` `<!-- change-log-start -->` ``).

This is the sibling of the frontmatter guard (`bodyStart()`), and all three answer the same
question: **is this text content, or a picture of content?**

The rule is not theoretical tidiness. Documentation about the Change Log necessarily contains
examples of a Change Log — this very file contains several, and the task documents that
specified this engine contain eleven fenced headings plus two complete fenced marker pairs.
Without the fence guard, running the engine over its own specification appends live rows into a
code fence, and `migrateLegacyEntries()` "migrates" an illustrative row into real history.

The inline-code half is the less obvious one and was found by running the engine against the
task document that specified it. Prose that *names* the markers puts them in backticks:

```markdown
- [ ] Create `change-log.js` with `CL_START`/`CL_END` = `<!-- change-log-start -->` /
      `<!-- change-log-end -->` plus a `LEGACY_MARKER_PAIRS` table
```

Unguarded, that pair of mentions reads as a complete marker block, and the whole checklist
bullet is replaced by a generated table. The guard is scoped per line, because a genuine marker
always sits alone on its own line, unbackticked — so prose naming the markers next to a real
block still resolves to the real block.

## Insertion — where a new block goes

When a document has no Change Log at all, the engine inserts one **before a doc-type anchor**,
falling back to end-of-document:

| Doc type | Insert before |
|---|---|
| `story` | `## Dev Agent Record` |
| `task`  | `## Progress Tracking` |
| `epic`  | `## Notes & Updates` |
| `prd`   | (nested — the engine only ever updates an existing heading) |
| unknown, or anchor absent | end of document |

**Never "before the first `##`".** That was the old fallback, and it is how a Change Log ended
up above the Epic Goal at the top of the document body. An anchor that does not match falls
through to EOF, which is harmless; guessing the top of the document is not.

## Who writes what

The moment table. This is the contract the writing skills implement against — be literal about
the `Author` cell and whether `Version` moves.

| Moment | Written by | Version | Example `Description` |
|---|---|---|---|
| Document created | `create-{prd,epic,story,task}` | `1.0` | `Initial draft` |
| Review verdict | `review-{prd,epic,story,task}` | bump minor | `Review passed (9/10) — ready for development` |
| Scope or AC edit | `edit-{epic,story}`, `correct-course` | bump minor | `AC3 added — offline retry` |
| Tracker issue created | `sync-*`, `ensure-*` | — | `Jira story created (PROJ-42)` |
| Status transition | `review-*`, `develop`, `finalise`, `sync-*` | — | `Status → in-progress` |
| Implementation complete | `develop` | — | `Implemented — 12 files, 34 tests` |
| QA verdict | `qa-story`, `qa-task` | — | `QA gate PASS (8/10)` |
| Accepted | `finalise` | bump minor | `DoD passed — accepted` |

"bump minor" means `1.0` → `1.1`. A major bump (`1.x` → `2.0`) is a human decision, never
automatic.

## Exclusions

**Bug reports carry no Change Log.** `## Status History` in
[`bug-report-template.md`](https://github.com/Gamaroff/agent-skills/blob/develop/skills/create-bug-report/assets/bug-report-template.md) is
already the bug-type equivalent, and it is richer — it carries a `Status` column, which is the
thing a bug's history is actually about. Do not add a second table to bug reports.

That table has its own engine — [`status-history.js`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/status-history.js), the peer of
`change-log.js` — so a writer that needs to record a moment on a bug has somewhere correct to go.
Reaching for `upsertChangeLog(content, entry, { docType: "bug" })` instead does **not** fail: there
is no `bug` anchor, so it falls through to the end-of-file path and appends the one table this
exclusion forbids, silently. Use the engine, not the `docType`.

**Tracker cards never carry the Change Log.**
[`tracker-card-summary.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/tracker-card-summary.md) is explicit about why: *"Jira and GitHub
both keep their own issue history, and the local file holds the authoritative log. A third copy
grew on every sync and told a reader nothing new."*

## Configuration

Read from `skills-config.yaml` at the repository root:

```yaml
change-log:
  enabled: true
  enforcement: advisory # advisory | blocking | off
```

| Key | Type | Default | Effect |
|---|---|---|---|
| `change-log.enabled` | boolean | `true` | Master switch. `false` → `create-*` emits no section and `review-*` checks nothing. |
| `change-log.enforcement` | `advisory` \| `blocking` \| `off` | `advisory` | How `review-*` grades a missing or stale log. |

Unlike sign-off, this defaults to **on**: a Change Log is a description of what happened, not a
gate on a human, so an absent config means "keep the history" rather than "skip it".

## Enforcement

| `enforcement` | Missing or stale Change Log | Effect on the pipeline |
|---|---|---|
| `advisory` (default) | **Important** issue + readiness-score deduction | None — verdict may still be GO |
| `blocking` | **Critical** issue → NO-GO | `develop-*` HALTs at Step 2 via the status gate |
| `off` | not checked | None |

**No backfill.** Adoption is additive and going-forward only, matching how sign-off and OKF
v0.1 were adopted. A document written before this spec existed has no section, and nothing
rewrites it; the first skill to record a moment on it creates the section at the correct
anchor.

## See also

- [`change-log.js`](change-log.js) — the engine implementing this spec
- [`open-knowledge-format.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/open-knowledge-format.md) — `updated` ≡ OKF `timestamp`
- [`tracker-card-summary.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/tracker-card-summary.md) — why cards never carry the log
- [`sign-off.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/sign-off.md) — the structural precedent for a config-gated document section
- [`document-status-lifecycle.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/document-status-lifecycle.md) — the status transitions the log records
- [`docs/reference/configuration.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/reference/configuration.md) — full `skills-config.yaml` schema
