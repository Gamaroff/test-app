---
name: qa-traceability-mapper-prompt
description: Read-only Explore subagent prompt for building an AC/Success-Criteria → spec → src traceability matrix before /qa-story or /qa-task runs. Reads the story or task file, extracts criteria, greps for related spec and source files, and writes a markdown table to <doc-dir>/.summaries/qa-traceability-matrix.md. Dispatched by the develop-story orchestrator in Step 5 (always in standard mode) and by the develop-task orchestrator in Step 5 (only when the task has a Success Criteria table — see lite-mode detector flag `has_success_criteria_table`).
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/qa-traceability-mapper-prompt.md. Regenerate via `npm run bundle`. -->

# QA Traceability Mapper — Explore Subagent

## Purpose

Read-only pre-QA mapping pass. Runs in an Explore subagent so grep output and file reads never land in main context. Produces a markdown table written to `<doc-dir>/.summaries/qa-traceability-matrix.md`. **Never mutates source files or QA artifacts.**

> **Doc type**: this prompt accepts both **story** and **task** documents. Variable names use `STORY_FILE`/`STORY_DIR` for backwards compatibility, but the values may point at a task file/directory. The mapper detects the doc type from the filename prefix (`story.*` vs `task.*`) and writes the title row accordingly. For task docs, the source criteria section is **Success Criteria** instead of **Acceptance Criteria** — both produce the same matrix shape.

> **Packaging note**: This file is referenced transitively from `develop-pipeline-step-5-6-qa-loop.md`. Verify that `package_skill.py` bundles it into the `develop-story` skill zip (run `package_skill.py skills/develop-story` and confirm `qa-traceability-mapper-prompt.md` appears in the zip). If not auto-detected, add an explicit `references/qa-traceability-mapper-prompt.md` reference to `skills/develop-story/SKILL.md`.

## Output

**File written**: `<story-dir>/.summaries/qa-traceability-matrix.md`

**Format**:

```markdown
# QA Traceability Matrix

**Story** (or **Task**): story.{epic}.{story}.{name}.md / task.{id}.{name}.md
**Generated**: {YYYY-MM-DD}

| Criterion | Spec files | Src files | Coverage | Uncertainty |
|-----------|-----------|-----------|----------|-------------|
| AC1 / SC1: {short description} | `path/to/foo.spec.ts` | `path/to/foo.ts` | full | — |
| AC2 / SC2: {short description} | `path/to/bar.spec.ts` | — | partial | No spec found for bar module |
| AC3 / SC3: {short description} | — | — | none | No matching spec or src found |
```

For **task** documents, use `SC` (Success Criterion) row prefixes; for **story** documents, use `AC` (Acceptance Criterion). The first row label is determined by the source section heading inside the doc.

**Constraints**:
- Maximum 30 rows (one per AC + edge cases; truncate with note if more)
- `Uncertainty` column: populate when grep yields ambiguous or zero matches; use `—` when confident
- `Coverage` values: `full` | `partial` | `none` | `integration` | `unit`
- Spec files: any file matching `*.spec.*` or `*.test.*` whose name or directory relates to the AC
- Src files: implementation files that the spec imports or that the AC description implies

## How to Invoke (from pipeline orchestrators)

Pass the following prompt to an Explore subagent via the `Agent` tool with `subagent_type="Explore"`. Substitute `{story-file}` and `{story-directory}` (resolved in Phase 0a) as the values for `STORY_FILE=` and `STORY_DIR=` before sending.

```
Run the QA traceability mapper (references/qa-traceability-mapper-prompt.md).
Inputs:
  STORY_FILE={story-file}       # absolute path to the story markdown file (resolved in Phase 0a)
  STORY_DIR={story-directory}   # absolute path to the story directory (resolved in Phase 0a)

Follow the Execution Protocol exactly. Write the matrix file and return a one-line confirmation: "Matrix written to {STORY_DIR}/.summaries/qa-traceability-matrix.md — {N} ACs mapped."
```

### Extracting results

After the subagent returns, the matrix is at `{STORY_DIR}/.summaries/qa-traceability-matrix.md`. Pass the path to `/qa-story` via Skill args:

```
args="traceability_matrix={STORY_DIR}/.summaries/qa-traceability-matrix.md"
```

Write a subagent summary JSON artifact to `{story-directory}/.summaries/step-5-traceability-mapper.json` using the schema from `references/subagent-summary-artifact.md`:

```json
{
  "schema_version": 1,
  "step": 5,
  "agent": "qa-traceability-mapper",
  "dispatched_at": "{ISO-8601}",
  "completed_at": "{ISO-8601}",
  "summary": {
    "ac_count": {N},
    "full": {N},
    "partial": {N},
    "none": {N},
    "uncertainty_flags": {N},
    "matrix_path": "{STORY_DIR}/.summaries/qa-traceability-matrix.md"
  },
  "raw_artifact_paths": [
    "{STORY_DIR}/.summaries/qa-traceability-matrix.md"
  ]
}
```

## Execution Protocol (run inside the Explore subagent)

### Step 1 — Read the doc file

Read `{STORY_FILE}` (may be a story or task file — detect via `basename` prefix). Extract:
- Title and epic/story or task numbers
- All criteria — for **story** docs, look for `## Acceptance Criteria`, `### AC`, or numbered list items under "Acceptance Criteria"; for **task** docs, look for `## Success Criteria`, `### SC`, or table rows under "Success Criteria". Treat both the same way for matrix generation.
- File List section if present (pre-populated spec/src hints)

### Step 2 — Derive search keywords per AC

For each AC, extract 2–4 distinctive keywords:
- Function names, entity names, route paths, or behaviour nouns from the AC text
- Avoid generic words like "user", "data", "should", "must"

### Step 3 — Grep for spec files

For each AC, run:

```bash
grep -rl "{keyword1}\|{keyword2}" . \
  --include="*.spec.ts" --include="*.spec.tsx" \
  --include="*.test.ts" --include="*.test.tsx" \
  --include="*.spec.js" --include="*.test.js" \
  2>/dev/null | head -5
```

If the story's File List names spec files explicitly, include those without grepping.

If grep yields zero results for an AC: note `none` coverage + populate `Uncertainty` column.

If grep yields more than 5 files for a keyword: narrow with a second keyword; if still >5, pick the 3 most relevant by path proximity and note count in `Uncertainty`.

### Step 4 — Grep for src files

For each AC, run:

```bash
grep -rl "{keyword1}\|{keyword2}" . \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.py" \
  --exclude="*.spec.*" --exclude="*.test.*" \
  2>/dev/null | head -5
```

Apply same narrowing logic as Step 3.

### Step 5 — Assess coverage

For each AC:
- Spec files found AND src files found → `full` (or `partial` if spec only covers one code path)
- Spec files found, src files uncertain → `partial`; note in `Uncertainty`
- Spec files found, no src files → `unit` (covered in isolation)
- No spec, but integration test dir has related file → `integration`; note path
- Nothing found → `none`; note in `Uncertainty`

### Step 6 — Ensure output directory exists and write matrix

```bash
mkdir -p {STORY_DIR}/.summaries
```

Write the markdown table to `{STORY_DIR}/.summaries/qa-traceability-matrix.md` following the Output format above.

### Step 7 — Return confirmation

Output a single line:

```
Matrix written to {STORY_DIR}/.summaries/qa-traceability-matrix.md — {N} ACs mapped.
```

No other prose. The pipeline orchestrator reads the matrix from disk.
