---
name: review-epic
description: "Deep interactive epic review that checks template compliance, detects scope overlap with existing epics, validates against architecture docs, and scans the codebase for already-implemented features. Produces a co-located review report or inline action plan. Use before writing stories to catch structural, duplication, and conflict problems early."
invokes: [create-branch, mermaid-architect]
---

# Review Epic

## When to Use This Skill

Use this skill when:

- An epic has just been created and needs pre-story validation
- You want to catch scope overlap with other epics **before** writing stories
- You need to verify the epic conforms to the template structure
- You want to check for already-implemented features in the codebase
- You suspect conflicts with architecture documentation
- You need to check existing stories drift from the epic's stated deliverables

Natural language triggers:

- "Review epic 180"
- "Check this epic for conflicts"
- "Is this epic well-formed?"
- "Review the epic before we write stories"
- "Validate epic 276 against architecture"
- "Check epic for registry overlap"
- "Pre-story review on this epic"

## Purpose

To conduct a comprehensive, **interactive** pre-story review of an epic document, detecting:

- **Template gaps**: Missing or incomplete sections vs. `docs/templates/epic-template.md`
- **Registry conflicts**: Scope overlap or duplicate deliverables with other epics
- **Architecture violations**: Contradictions with `.claude/*.md` docs and routing/naming conventions
- **Codebase duplication**: Features the epic plans to build that already exist
- **Story drift**: Existing stories that diverge from the epic's stated deliverables

**CRITICAL - Anti-Hallucination Rules**:

- Every conflict citation MUST reference an actual file path and section
- Never invent architecture violations — cite the specific doc and line
- When Glob/Grep finds nothing, explicitly state "No existing implementation found"
- Registry overlap MUST quote the conflicting epic's actual title and number

---

## Required Inputs

```yaml
required:
  - epic: Path to epic file, epic number (e.g. "180"), or natural language name

optional:
  - output_mode: "report" | "inline"  # if omitted, ask user in Step 0
  - focus_areas: Specific areas to concentrate on (e.g., "registry conflicts only")
```

---

## Input Resolution

Before entering the workflow, resolve the input to an absolute file path stored as `DOC_FILE`.

**Step 1 — Detect input type:**

| Pattern                                | Matches               |
| -------------------------------------- | --------------------- |
| Path containing `/` or ending in `.md` | Direct file path      |
| All digits (e.g. `180`)                | Epic number           |
| Anything else                          | Natural-language name |

**Step 2 — Resolve to file:**

```bash
case "$INPUT" in
  */*|*.md)
    DOC_FILE="$INPUT"
    ;;
  [0-9]*)
    DOC_FILE=$(find docs/ -name "epic.${INPUT}.*.md" 2>/dev/null \
      | grep -v -E '\.(review|gate|implementation)\.' | head -1)
    ;;
  *)
    DOC_FILE=$(find docs/ -name "epic.*.md" 2>/dev/null \
      | grep -v -E '\.(review|gate|implementation)\.' \
      | grep -i "$INPUT" | head -1)
    ;;
esac

if [ ! -f "$DOC_FILE" ]; then
  echo "❌ Epic file not found for input: $INPUT"
  exit 1
fi
```

If multiple candidates: list and ask the user to confirm via `AskUserQuestion`.

**Step 3 — Continue with `DOC_FILE` resolved.** This file path is consumed by Step 0a (branch setup) and Step 1.

---

## 10-Step Workflow

### Step 0 — Determine Output Mode

**Purpose**: Choose between async review report or immediate action plan.

Use `AskUserQuestion`:

```yaml
question: "How would you like the review output delivered?"
header: "Output Mode"
options:
  - label: "Co-located report"
    description: "Save an epic.[N].review.[n].[name].md report alongside the epic file for async review and future reference."
  - label: "Inline action plan"
    description: "Present prioritised recommendations immediately as numbered steps to action now."
```

Store choice as `output_mode` for Step 9.

**Initialize task list** — use `TaskCreate` to register every step as a tracked task. Mark each `in_progress` before starting and `completed` immediately after finishing. This prevents silently skipping steps.

| Task Subject                | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| Determine output mode       | Capture report vs inline action-plan preference         |
| Branch setup                | Ensure review runs on a feature branch (Step 0a)        |
| Load epic & reference docs  | Locate epic file, template, registry, architecture docs |
| Template compliance         | Verify epic structure against template                  |
| Registry conflict detection | Check for epic number/scope collisions                  |
| Architecture conflicts      | Verify epic aligns with codebase patterns               |
| Existing story drift        | Check stories haven't diverged from epic intent         |
| Consistency check           | Detect internal contradictions                          |
| Quality & clarity           | Score epic readability and precision                    |
| Conflict recommendations    | Produce actionable fix list                             |
| Generate output             | Produce report file or inline action plan               |
| Post-review status update   | Offer to update epic frontmatter with review metadata   |
| Apply findings to epic      | Offer to apply recommended fixes directly to epic file  |
| Offer tracker sync          | Opt-in: create a tracker issue if the epic has none      |

---

### Step 0a — Branch Setup (BEFORE any document mutation)

**Purpose**: Ensure all review artifacts (status updates, Change Log entries, `.review-report.md`, Jira/GitHub sync) land on a dedicated feature branch — not on `develop`/`main`.

**Pre-conditions**: `DOC_FILE` (epic file path from Input Resolution), `SKILL_NAME=review-epic`. Review-epic has no validate mode — 0a.0 short-circuit does not apply.

**Actions**: Execute the full protocol in `references/review-pipeline-step-0a-branch-setup.md`. Apply the **review-epic** variant throughout:

- 0a.2 extract `EPIC_NUM`, `EPIC_SLUG`, `EPIC_BRANCH` from the epic filename (`epic.{N}.{slug}.md`).
- 0a.3 auto-skip when on `feature/epic.${EPIC_NUM}.*`.
- 0a.4 prompt: single question — "Create epic branch `${EPIC_BRANCH}` from `${BASE_DEFAULT}`?" (Recommended Yes / "Other (specify branch)" / "Abort review").
- 0a.5–0a.8 stash (`git stash create` + `store`) → ensure epic branch exists (guarded local create + push) → pop stash. No `/create-branch` invocation (the epic branch is created inline).

**Output**: `BRANCH_NAME`, `EPIC_BRANCH`, `AUTO_SKIPPED` exported. Decisions Log entry (or inline preamble) recorded per 0a.9.

**Failure**: HALT with the exact error; stash recovery instructions surfaced; no document edits attempted.

---

### Step 1 — Load Epic & Reference Documents

**Purpose**: Establish all context needed for the review.

**Actions** (run in parallel where possible):

0. **Resolve paths.** Source `references/resolve-paths.sh` to populate `${PRD_ROOT}` (default `docs/prd`) and `${ARCH_ROOT}` (default `docs/architecture`). Path operations below substitute these env vars.

1. **Locate epic file**
   - Accept: absolute path, epic number (e.g. `180`), or descriptive name
   - Search pattern: `${PRD_ROOT}/**/epics/epic.[N].*/epic.[N].*.md`
   - If ambiguous, list candidates and ask user to confirm

2. **Load core references**
   - `docs/templates/epic-template.md` — template compliance baseline
   - `docs/development/epic-registry.md` — registry conflict detection

3. **Load architecture docs** (all in parallel)
   - `.claude/backend-patterns.md`
   - `.claude/database-redis.md`
   - `.claude/testing.md`
   - `${ARCH_ROOT}/routing-and-file-structure.md`
   - `docs/standards/file-naming.md`
   - `.claude/notifications.md` (if epic touches notifications)

4. **Scan for existing stories**
   - Glob: `${PRD_ROOT}/**/epics/epic.[N].*/stories/**/story.*.md`
   - Read each story found

**Output**: Full context package ready for analysis.

---

### Step 2 — Template Structure Compliance Review

**Purpose**: Verify the epic contains every required section from the template.

Score each section: ✅ Complete | ⚠️ Partial | ❌ Missing

**Required sections to check**:

| Section                | Checks                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML Frontmatter       | `epic_number`, `title`, `type`, `domain`, `status`, `priority`, `estimated_stories`, `created`, `target_completion`, `prd_source` all present and valid values (these are the fields `create-epic` and `docs/templates/epic-template.md` emit). See the OKF frontmatter check below for `type`/`description`/`tags`/`resource` severities |
| Epic Goal              | Single clear statement (1-2 sentences), measurable, outcome-focused                                                                                 |
| Background & Context   | PRD source linked, system integration listed, prerequisites with status                                                                             |
| Epic Description       | Primary deliverables list, Out of Scope explicitly stated, Success Criteria with ≥3 measurable items                                                |
| Stories Breakdown      | ≥1 story defined, user story format ("As a / I want / So that"), ACs present                                                                        |
| Technical Architecture | Components, DB changes, API changes sections present                                                                                                |
| Dependencies           | Blocks and Blocked-by with epic references, parallel opportunities                                                                                  |
| Risks & Mitigation     | ≥1 risk with probability, impact, mitigation, and owner                                                                                             |
| Testing Strategy       | Unit, integration, and manual testing sections present                                                                                              |
| Definition of Done     | Story Completion, Code Quality, Testing, Integration, Documentation, Deployment, Acceptance categories                                              |
| Estimated Timeline     | Planning, Development, Testing phases with totals                                                                                                   |

**Also check**:

- No unfilled placeholders: `[N]`, `[Epic Name]`, `[Description]`, `YYYY-MM-DD`, `[Team]`
- YAML `dependencies` list matches `blocked_by` field (if present)
- Epic number in filename matches `title` field
- File naming: `epic.[N].[kebab-name]/epic.[N].[kebab-name].md` (DOTS.md convention, directory exactly matches filename)
- **Title format** (Major): if the `title` frontmatter embeds an epic number prefix it **must** use the canonical bracket form `[Epic N] Name` — not the colon form `Epic N: Name`. Detect by matching `^\s*Epic\s+\d+\s*:` against the title value. Flag as a **Major** issue when the colon form is found, because `sync-jira-epic` normalises on push but the local doc title and any manually-created Jira issue will show the wrong format until corrected. The fix is: update `title` in frontmatter to bracket form and re-run `sync-jira-epic` so the Jira issue summary is corrected in the same operation.
- **`prd_source` resolves to a real file** (Critical): unless the value is the standalone sentinel `brownfield-enhancement`, the path must point to an actual file in the repo. Flag as a **Critical** issue if the file is missing, the path is still the `[source-document].md` placeholder, or `prd_source` is absent entirely. Stakeholders cannot navigate to a PRD that isn't linked.
- **PRD reference visible in the body** (Major): the epic body must contain a clickable PRD reference (a `**Source PRD**:` line or any markdown link to the `prd_source` path), not just the frontmatter field. Flag as a **Major** issue if the path lives only in frontmatter — readers of the rendered markdown won't see it. (Skip both checks when `prd_source` is `brownfield-enhancement`.)
- **OKF frontmatter conformance** (see [`open-knowledge-format.md`](references/open-knowledge-format.md)):
  - `type: epic` present and non-empty → **Critical** if missing or empty (OKF's one hard requirement).
  - `description` present (one-sentence summary) → **Important** if missing.
  - `tags` is a YAML list (when present) and `resource` is a valid URI (when present) → **Optional** if malformed. Absence is not a finding.
- **Change Log — presence and currency** (conditional; canonical spec: [`document-change-log.md`](references/document-change-log.md)). Read `change-log.enabled` from `skills-config.yaml`; it defaults to **`true`**, unlike sign-off — a log is a record of what happened, not a gate on a human. Skip entirely when `change-log.enabled: false` or `change-log.enforcement: off`. Otherwise check two things:
  - **Presence** — a `## Change Log` section with the four canonical columns and at least one row.
  - **Currency** — the newest row is consistent with frontmatter `status`. Flag **only** when `status` has advanced past `draft` **and** no row mentions a review or status change. Define this narrowly: a heuristic eager enough to flag legitimately quiet epics trains reviewers to ignore it, and an ignored check is a check that does not exist. A no-findings review still writes a row (Step 11), so the quiet case is covered by a writer rather than exempted here.

  Severity is driven by `change-log.enforcement`:

  | `enforcement`        | Missing or stale                                | Effect                                                          |
  | -------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
  | `advisory` (default) | **Important** issue + readiness-score deduction | None — verdict may still be GO                                  |
  | `blocking`           | **Critical** issue → NO-GO                      | Story-writing should not begin until the log is current          |
  | `off`                | not checked                                     | None                                                            |

  Reviewer output: `- **[Important]** Change Log is stale — newest row is \`1.0 Initial draft\` (2026-05-11) but status is \`in-progress\`. Enforcement is \`advisory\`, so this does not block story writing.`

  **Expect legacy epics to report exactly one Important finding.** There is no backfill, and `advisory` is the default precisely so those documents score one point lower while still returning GO.

**Tracker Card Preflight**:

The tracker card is a **summary that points at this epic**, not a copy of it —
see [`references/tracker-card-summary.md`](./references/tracker-card-summary.md).
It is built from a couple of named `## ` headings plus the Stories Breakdown
overview table, so an epic whose headings do not match that list publishes a thin
or empty card **and the sync still reports success**. There is no error to raise,
which is why this is checked here rather than left to the sync.

Run the preflight (no auth, no network, no writes — it only reads the file):

```bash
node .agents/skills/sync-jira-epic/scripts/sync-jira-epic.js --file "{epic-file-path}" --check-card
```

Exit 0 = every card block resolves. Exit 1 = at least one finding, printed with
the exact fix. Add `--json` for a machine-readable `{ok, findings, blocks}`.

- A `missing` or `no-body` finding → **Critical**. The card loses a whole block,
  or publishes an empty description. The fix is always in the **epic document** —
  rename or add the heading; no sync-side change can invent content the file does
  not have.
- An `empty` finding → **Critical**. The heading exists but holds only a table or
  code block, so there is no prose to summarise.
- A `no-table` finding on Stories Breakdown → **Important**. The card cannot show
  which stories exist. Add a pipe table (commonly under `### Stories Overview`).
- Exit 0 → no finding. Do **not** raise anything about card length: the builder
  caps it (4-sentence summary, overview table only) and announces every omission
  with a `+N more` link, so a long epic cannot produce a long card.

**Collect all issues** — do NOT ask questions yet. Proceed to Step 3.

---

### Step 3 — Epic Registry Conflict Detection

**Purpose**: Detect scope overlap, duplication, and dependency errors against the registry.

**Actions**:

1. Read full `docs/development/epic-registry.md`
2. Extract this epic's domain, title, and primary deliverables
3. For every other epic in the registry:
   - Compare titles for near-duplicates (semantic overlap, not just exact string match)
   - Compare deliverables: flag if same feature/service/endpoint appears in both
   - Check dependency references: every epic listed in `dependencies` or `blocked_by` must exist in the registry
4. Verify this epic's registry entry exists and matches the file content (title, status, domain)
5. Verify epic number uniqueness (no two epics share the same number)

**Flag categories**:

- **Exact duplicate**: Same deliverable described identically
- **Partial overlap**: Overlapping feature domain (e.g., both epics create a "ContactService")
- **Dependency mismatch**: References an epic number that doesn't exist in registry
- **Missing registry entry**: This epic has no entry in the registry
- **Stale registry entry**: Registry entry contradicts the epic file (status, title mismatch)

**Collect all issues** — do NOT ask questions yet. Proceed to Step 4.

---

### Step 4 — Architecture & Codebase Conflict Detection

**Purpose**: Catch planned features that violate architecture rules or already exist in the codebase.

**Actions**:

1. **API endpoint validation** — for each new endpoint the epic plans:
   - Check against `.claude/backend-patterns.md` versioning rules
   - Grep codebase for existing route: `apps/{api-service}/src/**/*.controller.ts`
   - Validate naming: `@Controller({ path: '...', version: '...' })` pattern

2. **Service/module duplication check** — for each service/module planned:
   - Glob: `apps/{api-service}/src/**/*[service-name]*.ts`
   - Grep: `export class [ServiceName]Service`
   - If found: note file path and what it already implements

3. **Frontend component duplication check** — for each UI component planned:
   - Glob: `apps/{app-name}/**/*[component-name]*`
   - If found: note file path

4. **Platform separation check** — if epic touches shared libs:
   - Verify client/server separation is planned for `logging-lib`, `auth-lib`, `shared-utils`
   - No Node.js deps (bcrypt, winston, jsonwebtoken) referenced for client builds

5. **Naming convention check** against `docs/standards/file-naming.md`:
   - Route names: kebab-case
   - Components: PascalCase
   - "handle" not "username" for user identity

6. **Routing/structure check** against `${ARCH_ROOT}/routing-and-file-structure.md`:
   - Expo Router file conventions
   - Feature-first directory layout

**For each codebase search**:

- State result explicitly: either file path found, or "No existing implementation found for [X]"

**Collect all issues** — do NOT ask questions yet. Proceed to Step 5.

---

### Step 5 — Existing Story Drift Analysis

**Purpose**: If stories already exist under this epic, check they align with the epic's deliverables.

**Skip this step** if no stories found in Step 1.

**Actions**:

1. For each existing story, check:
   - Does the story implement a deliverable stated in the epic?
   - Does the story's scope stay within the epic's "What We're Building" section?
   - Do the story's ACs align with the epic's Success Criteria?
   - Are there story features that appear in the epic's "Out of Scope" section?

2. Build a **Story Coverage Matrix**:

| Epic Deliverable    | Covered By Story | Gap?           |
| ------------------- | ---------------- | -------------- |
| [Deliverable 1]     | story.N.1.name   | ✅             |
| [Deliverable 2]     | —                | ❌ No story    |
| [Out of Scope item] | story.N.3.name   | ⚠️ Scope creep |

**Collect all issues** — proceed to QUESTION POINT 1.

---

### QUESTION POINT 1 — Structure & Epic Context (batched, max 4 questions)

**Trigger**: After completing Steps 2–5 analysis.

**Ask questions about**:

- Critical missing sections from Step 2 (if multiple, batch into one multi-select)
- Ambiguous scope boundaries that need clarification before registry/arch analysis
- "Out of Scope" items that may be intentional vs. accidental gaps
- Dependencies referencing non-existent epic numbers (confirm correct number)

**Format**: Use `AskUserQuestion` with max 4 questions in one call. Use `multiSelect: true` for "which sections are missing by design?" type questions.

**After answers**: Update issue severity based on user's clarifications. Proceed to QUESTION POINT 2.

---

### QUESTION POINT 2 — Technical & Conflict Clarifications (batched, max 4 questions)

**Trigger**: After compiling all findings from Steps 3, 4, 5.

**Ask questions about**:

- Registry overlaps: intentional fork or oversight? (provide the conflicting epic title and number)
- Codebase duplication: extend existing implementation vs. create separate feature?
- Architecture violations: confirm intended deviation or needs updating?
- Dependency chain issues: is the blocked-by order correct?

**Example questions**:

```yaml
question: "Epic 180 plans to create a ContactService, but Epic 169 already implements ContactValidationService in libs/contact-lib. Should Epic 180 extend that service or create a separate one?"
header: "ContactService"
options:
  - label: "Extend Epic 169 service"
    description: "Add new methods to the existing ContactValidationService. Avoids duplication."
  - label: "Create separate service"
    description: "New ContactService with distinct responsibility. Requires clear boundary definition."
  - label: "Merge epics"
    description: "Epic 180 scope belongs in Epic 169. Fold deliverables there instead."
```

**After answers**: Proceed to Step 6.

---

### Step 5.5 — Mermaid Diagram Validation (via `mermaid-architect`)

**Purpose**: Validate any embedded Mermaid Value Stream diagram against syntax, metadata, and consistency rules. Recommend a diagram if the epic lacks one and a story-flow view would materially clarify sequencing.

**Actions**:

1. **Detect diagrams**: scan the epic for fenced ` ```mermaid ` blocks. Capture each block's section anchor and whether a YAML metadata header (`<!-- mermaid-architect: ... -->`) precedes it.
2. **Invoke `mermaid-architect` in review mode** for each block. Pass: epic file path, the section anchor, and the Stories Breakdown table so the skill can verify each story node in the diagram maps to a real story (and vice versa) and detect drift between the diagram and the table.
3. **Collect verdicts**: `pass`, `pass with notes`, `fail`. `fail` → Major Issue; `pass with notes` → Minor.
4. **If absent and the epic has 3+ stories with non-trivial sequencing, parallel tracks, or cross-story dependencies**: add a Recommendation to invoke `create-epic`'s diagram step (or the user can ask `mermaid-architect` directly). Do not flag absence as an issue when the table already conveys the order clearly.
5. **If a diagram restates the table verbatim with no added information**: recommend removing it.

**Output**: append to Critical/Major/Minor buckets. Defer any user decisions to QUESTION POINT 2 or 3 as appropriate.

---

### Step 6 — Consistency & Internal Conflict Check

**Purpose**: Cross-reference within the epic for internal contradictions.

**Checks**:

1. **Stories vs. ACs**: Do the stories cover all acceptance criteria in "Success Criteria"? Flag uncovered criteria.
2. **YAML `dependencies` vs. `blocked_by`** _(only if both fields are present — Schema A epics omit them)_: Must match exactly.
3. **Timeline vs. estimate** _(only if the relevant field is present)_: the Development Phase sprint count should be consistent with `estimated_sprints`, or — for Schema A epics — the story count should be consistent with `estimated_stories`.
4. **Out of Scope vs. Stories**: Do any existing stories implement items listed as out of scope?
5. **Deliverables vs. Stories**: Every primary deliverable should map to ≥1 story (or be flagged as unmapped).
6. **Risk coverage**: Are all high-risk stories in the Stories Breakdown also mentioned in Risks & Mitigation?

---

### Step 7 — Quality & Clarity Assessment

**Purpose**: Score the epic on 6 dimensions.

Score each dimension 1–5:

| Dimension                  | 1 (Poor)                            | 3 (Adequate)                             | 5 (Excellent)                                      |
| -------------------------- | ----------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| **Template Compliance**    | Multiple missing sections           | Most sections present                    | All sections complete, no placeholders, Change Log present and current |
| **Registry Integrity**     | Not in registry or wrong number     | In registry but stale                    | Registry entry accurate and current                |
| **Architecture Alignment** | Multiple violations                 | Minor deviations                         | Fully compliant with all arch docs                 |
| **Scope Clarity**          | Vague deliverables, no out-of-scope | Deliverables listed, out-of-scope sparse | Crystal clear deliverables and explicit exclusions |
| **Dependency Accuracy**    | Invalid epic references             | All exist but direction wrong            | All valid, bidirectional, and documented           |
| **Story Coverage**         | Deliverables unmapped               | Partial mapping                          | All deliverables mapped to stories                 |

**Overall score**: Average of 6 dimensions. Interpret as:

- 4.5–5.0: Excellent — proceed to story writing
- 3.5–4.4: Good — minor fixes recommended
- 2.5–3.4: Fair — significant gaps, fix before stories
- 1.0–2.4: Poor — major rework needed

**Epic Split Detection** — flag if ANY of:

- More than 8 stories defined (or `estimated_stories` > 8 for Schema A epics)
- `estimated_sprints` > 4 (when that field is present)
- Deliverables span more than 2 distinct feature domains (e.g., payments + notifications + UI)

If flagged: recommend splitting into sub-epics and suggest how to divide the scope.

---

### QUESTION POINT 3 — Quality & Final Clarifications (batched, max 4 questions)

**Trigger**: After Step 7 scoring.

**Ask questions about**:

- Epic split recommendation (confirm if scope is intended to be large or should be divided)
- Priority/timeline concerns discovered during review
- Any remaining ambiguities before generating output
- Whether to update the YAML `status` and add `last_reviewed` field now

---

### Step 8 — Conflict Recommendations

**Purpose**: For every issue found, produce a specific, actionable recommendation.

**Recommendation format**:

```
**Issue**: [Clear description of the problem]
**Location**: [File path + section/line]
**Severity**: Critical | Major | Minor
**Recommendation**: [Specific action to take]
**Reference**: [Exact doc/file that defines the correct approach]
```

**By issue type**:

| Issue Type             | Recommendation Approach                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Title format           | Change `title:` frontmatter from `Epic N: Name` → `[Epic N] Name`; then run `sync-jira-epic` to propagate the corrected summary to the Jira issue. Apply this fix in Step 11 before any Jira sync. |
| Registry overlap       | Suggest merge, scope reduction, or explicit differentiation with different wording  |
| Codebase duplication   | Reference the existing file path, suggest extend vs. create new with justification  |
| Architecture violation | Cite the specific `.claude/*.md` doc and section, provide the compliant alternative |
| Template gap           | Quote the exact template section header and provide example content                 |
| Internal contradiction | Show both conflicting statements, propose resolution                                |
| Epic split needed      | Suggest two or more sub-epic scope boundaries with story assignments                |

---

### Step 9 — Generate Output

**Option A — Co-located Report**:

Save to: `${PRD_ROOT}/[domain]/[feature]/epics/epic.[N].[name]/epic.[N].review.[n].[name].md`

- `[N]` is the epic number; `[name]` is the parent epic file's own name slug (the hyphenated portion after `epic.[N].` in the epic filename) — NOT a free-form summary of the review focus.
- `[n]` is a sequence number for multiple reviews of the same epic; it starts at 1 and increments on re-reviews (mirrors the QA `qa.{n}` and story `review.{n}` patterns). Use DOTS as structural separators and hyphens within the name slug.
- Example: epic file `epic.1.mastra-runtime-foundation.md` → review file `epic.1.review.1.mastra-runtime-foundation.md`.

**Report structure**:

```markdown
# Epic Review Report: Epic [N] — [Epic Name]

**Review Date**: YYYY-MM-DD
**Reviewer**: Claude (review-epic skill)
**Output Mode**: Report
**Epic File**: [relative path to epic file]

---

## Executive Summary

**Overall Score**: [X.X / 5.0] — [Excellent | Good | Fair | Poor]
**Critical Issues**: [N]
**Major Issues**: [N]
**Minor Issues**: [N]
**Total Recommendations**: [N]
**Story Writing Readiness**: ✅ Ready | ⚠️ Fix First | ❌ Major Rework Needed

---

## Score Card

| Dimension              | Score     | Notes        |
| ---------------------- | --------- | ------------ |
| Template Compliance    | [X/5]     | [brief note] |
| Registry Integrity     | [X/5]     | [brief note] |
| Architecture Alignment | [X/5]     | [brief note] |
| Scope Clarity          | [X/5]     | [brief note] |
| Dependency Accuracy    | [X/5]     | [brief note] |
| Story Coverage         | [X/5]     | [brief note] |
| **Overall**            | **[X/5]** |              |

---

## Critical Issues (Must Fix Before Story Work)

[List each critical issue with file + section reference and recommendation]

---

## Major Issues (High Priority Fixes)

[List each major issue]

---

## Minor Issues / Suggestions

[List each minor issue]

---

## Conflict Analysis

### Registry Conflicts

[Per-conflict findings: quote conflicting epic title, number, and specific deliverable overlap]

### Codebase Duplication

[Per-duplicate: file path found, what it implements, recommended action]

### Architecture Violations

[Per-violation: doc cited, section, what the epic proposes vs. what's required]

---

## Architecture Audit

| Doc                                          | Status   | Notes     |
| -------------------------------------------- | -------- | --------- |
| `.claude/backend-patterns.md`                | ✅/⚠️/❌ | [finding] |
| `.claude/database-redis.md`                  | ✅/⚠️/❌ | [finding] |
| `.claude/testing.md`                         | ✅/⚠️/❌ | [finding] |
| `${ARCH_ROOT}/routing-and-file-structure.md` | ✅/⚠️/❌ | [finding] |
| `docs/standards/file-naming.md`       | ✅/⚠️/❌ | [finding] |

---

## Story Coverage Matrix

| Epic Deliverable | Story              | Status          |
| ---------------- | ------------------ | --------------- |
| [Deliverable 1]  | story.[N].1.[name] | ✅ Covered      |
| [Deliverable 2]  | —                  | ❌ No story yet |

---

## Recommended Actions (Prioritised)

1. [Action 1 — Critical]
2. [Action 2 — Critical]
3. [Action 3 — Major]
   ...

---

## User Decisions Captured

[Record answers from all 3 question points]

---

## Epic Split Recommendation

[If applicable: proposed sub-epic split with scope boundaries]
```

**Option B — Inline Action Plan**:

Present immediately in conversation as:

```
## Epic [N] Review: Inline Action Plan

**Score**: [X.X/5.0] | **Ready for stories**: ✅/⚠️/❌

### Fix Template (do these first)
1. [Specific fix with section reference]
2. ...

### Resolve Registry Conflicts
1. [Specific fix — quote conflicting epic]
2. ...

### Address Architecture Violations
1. [Specific fix — cite doc and section]
2. ...

### Update Existing Stories
1. [Specific fix — story file and AC reference]
2. ...

### Epic Split Recommendation
[If applicable]
```

---

### Step 10 — Post-Review Status Update

**Purpose**: Offer to update the epic file with review metadata.

Ask (inline, no AskUserQuestion needed for this binary choice):

> "Would you like me to add `last_reviewed: YYYY-MM-DD` to the epic's YAML frontmatter and update the `status` field if it's stale?"

If yes:

- Add/update `last_reviewed` field in YAML with today's date
- Update `status` if user confirmed a change during the review
- Do NOT change any other content

**When the `status` changes**, append a Change Log row to the epic recording the transition, and bump frontmatter `updated` in the same edit. Format: [document-change-log.md](references/document-change-log.md). A status transition leaves `Version` blank — only the verdict row in Step 11 bumps it:

| 2026-08-12 |  | Status → ready-for-development | review-epic |

Skip when `change-log.enabled: false`.

---

### Step 11 — Apply Findings to Epic

**Purpose**: Offer to apply the findings from the report/plan directly to the epic file.

Use `AskUserQuestion`:

```yaml
question: "Would you like the findings from the review to be applied to the epic file now?"
header: "Apply Fixes"
options:
  - label: "Yes — apply all fixes"
    description: "Apply every Critical and Major fix from the report/plan directly to the epic file now."
  - label: "Yes — apply critical only"
    description: "Apply only Critical fixes now. Leave Major and Minor for a later pass."
  - label: "No — I will apply them manually"
    description: "Leave the epic file unchanged. Use the report/plan as a reference to apply fixes yourself."
```

**If "Yes — apply all fixes" or "Yes — apply critical only"**:

1. Work through each applicable recommendation from Step 8 in order of severity (Critical first, then Major)
2. For each fix, use the Edit tool to apply the change directly to the epic file
3. Do NOT rewrite sections that were not flagged — only touch what the recommendation covers
4. After all edits, read back the changed sections to verify correctness
5. Report which fixes were applied and which (if any) were skipped with reason
6. **Mark recommendations as implemented** — update both documents:

   **In the review report** (`epic.[N].review.[n].[name].md`):
   - Add the following line immediately after the Story Writing Readiness line in the Executive Summary:
     `> **Implementation Status**: ✅ All [N] recommendations implemented — YYYY-MM-DD`
     (or: `> **Implementation Status**: ✅ Critical/Major recommendations implemented — YYYY-MM-DD` if partial)
   - In the Recommended Actions list, prefix each applied recommendation with `✅ ` and each skipped one with `⏭️ skipped —` followed by the reason

   **In the epic file** (`epic.[N].[name].md`):
   - Add the following line immediately after the `**Last Updated**` status line:
     `**Review**: ✅ All review recommendations from \`epic.[N].review.[n].[name].md\` implemented YYYY-MM-DD`(or:`**Review**: ✅ Critical/Major recommendations implemented YYYY-MM-DD — see review report for details`)
   - Update the `last_reviewed` YAML frontmatter field to today's date if not already done in Step 10

7. **Append a Change Log row** recording the review outcome, and bump frontmatter `updated` to today in the same edit. Canonical format: [document-change-log.md](references/document-change-log.md). A review verdict bumps the minor version; `Author` is the skill name. Illustrative row:

   | 2026-08-12 | 1.1 | Review passed (8/10) — 3 fixes applied, scope overlap with epic 2 noted | review-epic |

   Describe **what the review found and changed**, not that a review happened. Skip when `change-log.enabled: false` in `skills-config.yaml`.

   > Write this row **regardless of tracker platform**. Step 11.5's Jira sync also appends a row on the Jira path, but that is a *sync* record, not the *review* record — and the GitHub and no-tracker paths get nothing at all without this step. This is the write that makes the local file the authoritative history the [tracker card contract](references/tracker-card-summary.md) already claims it is.

**If "No — I will apply them manually"**:

- Confirm the report/plan file path for reference and close the skill

---

### Step 11.5 — Push Body Changes to Jira (when `TRACKER=jira` and fixes were applied)

**Purpose**: When Step 11 applied any Edit to the epic body, the local body hash will diverge from `jira_last_body_hash` and the Jira description must be re-rendered. Execute the bundled `sync-jira-epic` script directly — do NOT speculate about other paths.

**When to Execute**:

- `TRACKER=jira` AND
- At least one fix was applied in Step 11 OR `jira_last_body_hash` is missing/stale

**Skip when**: `TRACKER=github` or no body edits were made.

**Command**:

```bash
node .agents/skills/sync-jira-epic/scripts/sync-jira-epic.js \
  --file "$EPIC_FILE_PATH" \
  --no-transition
```

> **`--no-transition` is required here, not tidiness.** This step pushes body/description changes only. Without the flag the sync also resolves the epic's frontmatter `status:` through its own `loadStatusMap` and transitions the card — a second resolver running after the `tracker-workflow.yaml` ladder has already placed it, undoing the ladder's move on a sync that was meant to carry a description (bug.12; same shape as bug.11). `review-epic` has no deliberate status-push invocation: Step 11.6 delegates unlinked epics to `ensure-epic-jira-issue`, which is where a create-and-push belongs.

> **Path note**: the script is bundled with the skill at `.agents/skills/sync-jira-epic/scripts/sync-jira-epic.js` (installed by `setup-consumer.sh`). Do **NOT** look for `.scripts/jira-sync*.js` in the consumer repo root — that path does not exist. Do **NOT** hand-craft a REST PUT, and do **NOT** leave `jira_last_body_hash` stale.

On success → `sync-jira-epic` updates the Jira description, refreshes `jira_last_body_hash` in frontmatter, and appends a Change Log entry. Confirm: `✅ Pushed body update to Jira {jira_key}`.

On non-zero exit → log warning `⚠️ sync-jira-epic failed — Jira description may be stale` and continue (do not halt).

---

### Step 11.6 — Offer Tracker Sync for Unlinked Epic (opt-in)

**Purpose**: If the epic has no tracker issue yet, offer to create one. Mirrors the opt-in gate in `/create-epic` and `/review-story` — **never creates a remote issue unprompted**. This step and Step 11.5 are mutually exclusive: 11.5 re-syncs an epic that **already** has a `jira_key`; this step creates one for an epic that **doesn't**.

**Detect platform** (if not already sourced this run) using the canonical resolver (see `references/platform-detection.md`):

```bash
source references/resolve-platform.sh || exit 1
# TRACKER = jira | github   (empty/unknown if neither is configured)
```

**Decision:**

- **Frontmatter already has `github_issue` or `jira_key`** → the epic is already linked. Skip this step (Step 11.5 handles keeping a linked Jira description in sync). Log `"ℹ️  tracker issue already linked — skipping create offer"`.
- **No tracker key in frontmatter** → prompt with `AskUserQuestion` (same gate as `/create-epic`):

  > **Header:** `Tracker sync`
  > **Question:** "This epic has no tracker issue. Create one now? Detected platform: {TRACKER or 'none detected'}."
  > **Options:**
  > - **Sync to GitHub** — append `(Recommended)` when `TRACKER=github`. Create the epic issue, add it to the project board, and write `github_issue` to frontmatter.
  > - **Sync to Jira** — append `(Recommended)` when `TRACKER=jira`. Create the epic issue and write `jira_key`/`jira_url` to frontmatter.
  > - **Skip — leave unlinked** — make no remote changes; leave the missing-issue gap flagged. The user can sync later (`/sync-jira-epic` for Jira, or re-run `/create-epic` for GitHub).
  >
  > The user may also pick "Other" (auto-provided) to skip or explain.

**Act on the answer:**

- **Skip / no sync chosen** → make no remote changes, keep the unlinked-epic gap flagged in the review output, log `"Tracker sync skipped by user — run /sync-jira-epic later (Jira) or re-run /create-epic to sync to GitHub."` and continue. Do NOT halt.
- **Sync to Jira** → invoke the `ensure-epic-jira-issue` sub-routine with the epic file path. On return, `EPIC_JIRA_KEY` is set (e.g. `PROJ-42`) or empty. The sub-routine delegates to `sync-jira-epic` for idempotent create, renders the body via ADF, and writes `jira_key`/`jira_url` back to frontmatter. On failure it logs a warning and returns empty — never halts.
- **Sync to GitHub** → invoke the `ensure-epic-github-issue` sub-routine with the epic file path. On return, `EPIC_ISSUE_NUM` is set (integer) or empty. The sub-routine creates the issue, adds it to the project board, and writes `github_issue` back to frontmatter. On failure it logs a warning and returns empty — never halts.

> **Note:** If the user picks a platform that isn't actually configured (e.g. Jira while `JIRA_URL` is unset), the sub-routine logs a warning and creates nothing — it never halts. Surface the warning and continue.

---

## Key Anti-Hallucination Rules

1. **Every conflict citation** must reference an actual file path and section header
2. **Never invent architecture violations** — if you're not sure, say "could not verify against [doc]"
3. **Codebase search results**: When Glob/Grep finds nothing, state explicitly: "No existing implementation found for [X]"
4. **Registry overlap**: Must quote the conflicting epic's actual title and number from the registry file
5. **Recommendations** must be specific actions, not vague suggestions like "improve this section"
6. **Score justifications**: Every score must reference specific issues or confirm specific compliance

---

## Critical Files Reference

| File                                         | Purpose                                           |
| -------------------------------------------- | ------------------------------------------------- |
| `docs/templates/epic-template.md`            | Template compliance baseline                      |
| `docs/development/epic-registry.md`          | Registry conflict detection                       |
| `.claude/backend-patterns.md`                | Architecture source — NestJS, API, DI             |
| `.claude/database-redis.md`                  | Architecture source — DB, Redis, safety rules     |
| `.claude/testing.md`                         | Architecture source — test standards, co-location |
| `${ARCH_ROOT}/routing-and-file-structure.md` | Routing and file structure                        |
| `docs/standards/file-naming.md`       | Naming rules (PascalCase, kebab-case, handle)     |
| `.agents/skills/review-story/SKILL.md`       | Reference for question batching patterns          |
