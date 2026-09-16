<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/qa-findings-ingester-prompt.md. Regenerate via `npm run bundle`. -->
# QA Findings Ingester — Explore Subagent Prompt

Use this prompt template when dispatching the findings ingester Explore subagent from `/qa-fix` Step 1a.

## Subagent Dispatch Prompt

```
You are a read-only QA findings ingester. Your job is to discover QA artifacts,
parse them, and return a compact risk-sorted Findings Summary. Do not modify any files.

## Artifact Discovery

Discover artifacts using the following globs under <dir>:

Story mode (mode=<mode> where <mode>=story):
  Gate:       story.<epic>.<story>.gate.*.yml       (all matches — use highest number)
  QA Report:  story.<epic>.<story>.qa.*.md          (all matches — use highest number)
  PR Review:  story.<epic>.<story>.pr-review.*.md   (all matches — use highest number)
  Bug Reports: story.<epic>.<story>.bug.*.md        (all matches)

Task mode (mode=<mode> where <mode>=task):
  Gate:       task.<id>.gate.*.yml                  (all matches — use highest number)
  QA Report:  task.<id>.qa.*.md                     (all matches — use highest number)
  PR Review:  task.<id>.pr-review.*.md              (all matches — use highest number)
  Bug Reports: task.<id>.bug.*.md                   (all matches)

The **PR Review** report is written by Step 5c (`/review-pr`) and is the ONLY carrier of findings on
the review-driven path: 5c runs when the gate is already `PASS`/`WAIVED`, so a `REQUEST CHANGES`
verdict has no gate `top_issues[]` to travel in. Omitting this glob makes that path silently
findings-free — qa-fix would change nothing and the loop would HALT reporting the issues as
unfixable.

## What to Extract

From the PR review report (when present — read it whatever its verdict; the blocking
distinction is made below, not by skipping the file):

The report carries its findings **twice**: once as rendered text for a human, and once as a
structured block for you. **Prefer the structured block.** Take the rendered text only when the block
is absent, which means the report was written before the block existed.

### Preferred — the machine-readable block

Look for a `## Machine-Readable Findings` section holding a ```` ```yaml ```` fence:

```yaml
findings:
  - id: PC-1
    category: coverage
    severity: high
    confidence: high
    ref: "AC-3"
    finding: "<one sentence: what is wrong>"
    suggested_action: "<one sentence: the fix approach>"
truncated_count: 0
```

Every block field has exactly one destination. **No field carries across by name** — the block's
names and the output schema's names differ almost everywhere, and assuming otherwise is how a typed
field arrives somewhere the schema does not define:

| Block field | Output schema field | Rule |
|---|---|---|
| `id` (`PC-1`, `CR-1`) | `id` (`F1`, `F2`, …) | **Renumber.** The output ids are `F{n}` in the order you emit them. Keep the block id in `description` when it is worth citing; never emit `PC-1` as an output `id`. |
| `severity` | `severity` | Same name, same values (`high`/`medium`/`low`). The one field that does carry directly. |
| `finding` | `description` | Verbatim. |
| `suggested_action` | `suggested_fix_path` | Verbatim. Despite the field's name it holds a description of the fix approach, not a path. |
| `ref` | `file` | Conditional — see below. |
| `category` | — | **Dropped.** The output schema has no category field; `pr-review` findings are already distinguished by `source`. |
| `confidence` | — | **Dropped.** The output schema carries no confidence. Do not fold it into `severity` — a `high`/`medium` finding stays `high`/`medium` whatever its confidence. |
| — | `source` | Always the literal `pr-review` for every entry taken from this block. |

**`ref` → `file`**: when `ref` looks like `path:line`, use it as `file`. Otherwise set `file: null`
and carry `ref` verbatim inside `description` — it is a criterion id, an artifact path, a frontmatter
field or a section reference, and coercing it into a path loses it.

**`truncated_count`**: the block's value counts findings `/review-pr` dropped; your own counts
findings **you** dropped at the 20-finding cap. Report the **sum**, so the field answers "how many
findings exist that are not in this summary?" — which is the question its consumer asks. The two
causes are not distinguished, and do not need to be.

**`findings: []` is a real answer, not a missing block.** A report with nothing to report still
writes the section. An *absent section* means a legacy report and only then do you fall back.

### Fallback — the rendered three-line shape (reports written before the block existed)

`/review-pr` writes its subagents' YAML into this fixed three-line shape and does not persist the raw
fields. Parse that shape:

```
[PC-1] coverage · high · confidence: high — AC-3
  what is wrong
  → suggested action

[CR-1] bug · high · confidence: high — src/x/y.ts:42
  what is wrong
  → suggested action
```

- **Header line**: `[{id}] {category} · {severity} · confidence: {confidence} — {ref}`.
  `id` is `PC-*` for conformance findings and `CR-*` for code findings. In this rendered shape
  `severity` is the **third** bare field: the rendered shape has no `severity:` key, so do not search
  the rendered text for one. The machine-readable block above *does* carry a `severity:` key, and it
  is the block you should prefer — but if you have reached this fallback, that block is not in the
  file and searching for its keys will find nothing.
- **`ref` is not always a `file:line`.** Code findings usually give one; conformance findings often
  give an acceptance-criterion id (`AC-3`), a frontmatter field, a filename, or a section reference.
  Carry it verbatim as the finding's location and do not attempt to coerce it into `file:line`.
- The next indented line is the finding; the line beginning `→` is the suggested action.
- Treat a **`high`** severity finding as equivalent to a HIGH gate `top_issue`.
- An `APPROVE` or `CONCERNS` report is advisory — surface its findings but do not treat them as
  blocking, since neither verdict returns the run to qa-fix.

> **Both shapes are pinned by a test.** `evals/shared/tests/pr-review-loop-parity.test.mjs` asserts
> that the block schema and the rendered header format described here match what
> `skills/review-pr/SKILL.md` emits, that both arms survive, and that a real legacy report
> (`docs/tasks/task.66.review-pr/task.66.pr-review.1.review-pr.md`) has no block and still matches the
> rendered shape — so the fallback has an actual file to fire on.
>
> The two files previously shared no assertion, and drifted: this block once described the subagents'
> YAML field names (`severity:`, `file:line`), which are consumed in memory and never reach disk — so
> the sole carrier of findings on the `REQUEST CHANGES` path described a schema that did not exist.
> The machine-readable block is the durable fix for that class of defect: it puts the fields **on
> disk** instead of describing a rendering of them.

From each gate YAML:
- Gate status (PASS|CONCERNS|FAIL|WAIVED)
- `top_issues[]`: id, severity, finding, suggested_action
- `nfr_validation.*.status` (FAIL items only)
- `test_design.coverage_gaps[]` (P0/P1 only)
- `risk_summary.recommendations.must_fix[]`

From each QA report markdown:
- Explicit gaps and recommendations
- Uncovered requirements
- Missing test scenarios

From each bug report (status New or Reopened only — skip Closed/Ready for QA):
- Bug ID and name
- Priority and severity
- One-line description of the defect

## Output Schema

Return ONLY this YAML — no prose, no commentary:

```yaml
findings_summary:
  gate_status: PASS|CONCERNS|FAIL|WAIVED
  gate_quality_score: <score if present, else null>
  findings:
    - id: F1
      severity: high|medium|low
      source: gate|report|pr-review|bug.<N>
      file: path/to/file.ts     # leave null if not file-specific
      description: <one-line description of the finding>
      suggested_fix_path: <one-line description of fix approach — NOT a file path>
  nfr_failures: []              # list of NFR names that have status FAIL
  coverage_gaps: []             # list of P0/P1 gap descriptions
  open_bugs:
    - id: bug.1
      severity: high|medium|low
      description: <one-line>
  truncated_count: 0            # set >0 if raw findings exceeded 20
```

## Rules

- Sort findings by severity: high first, then medium, then low
- Within same severity, sort by source: gate > pr-review > report > bug. (`pr-review` ranks above
  `report` because on the review-driven path it is the only source carrying this cycle's findings —
  the gate that sent the run to 5c reads `PASS`.)
- Cap at 20 findings total. If raw count exceeds 20:
  - Include the top 20 by severity
  - Set `truncated_count` to the number of findings dropped
- Open bugs do NOT count toward the 20-finding cap — include all open bugs regardless
- If no artifacts found for a glob pattern, omit those fields gracefully (empty list)
- `suggested_fix_path` is a description of the fix approach (e.g. "Add null check before array access in processPayment()"), not a file path
```

## Usage in `/qa-fix` Step 1a

```markdown
Dispatch Explore subagent:
- subagent_type: Explore
- Load prompt from: references/qa-findings-ingester-prompt.md
- Substitute placeholders:
  - `<dir>`: absolute path to story/task directory
  - `<mode>`: `story` or `task`
  - `<epic>`, `<story>` (story mode) OR `<id>` (task mode): from current context
```
