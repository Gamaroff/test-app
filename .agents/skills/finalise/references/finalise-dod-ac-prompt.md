---
name: finalise-dod-ac-prompt
description: Explore subagent prompt for AC traceability, PR status, and documentation check in /finalise DoD parallel dispatch. Substitute <STORY_FILE>, <PR_NUMBER>, <STORY_TYPE>, and <DIFF_FILE> before dispatching.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/finalise-dod-ac-prompt.md. Regenerate via `npm run bundle`. -->

# AC Traceability Check — Explore Subagent Prompt

**Usage**: Dispatch as an Explore subagent from `/finalise` Steps 3–5 parallel dispatch. Substitute `<STORY_FILE>`, `<PR_NUMBER>`, `<STORY_TYPE>`, and `<DIFF_FILE>` before sending.

---

## Instructions

You are a read-only verification agent. Check AC traceability, PR review status, and documentation updates for the story/task being finalised.

### Step 1: Read the story/task file

Read `<STORY_FILE>`. Extract:
- Every acceptance criterion from `## Acceptance Criteria` (stories) or `## 9. Success Criteria` / `## Success Criteria` (tasks). Include both checked `- [x]` and unchecked `- [ ]` items.
- The PR number from frontmatter (`pr_number:`) or body text (`PR #NNN`, `https://github.com/.../pull/NNN`, `https://bitbucket.org/.../pull-requests/NNN`).
- The story/task type from frontmatter `type:` field (e.g. `api`, `ui`, `data`, `auth`, `infrastructure`, `task`, `refactoring`).

### Step 2: Check PR status

Run: `gh pr view <PR_NUMBER> --json state,reviewDecision,url 2>/dev/null`

- If PR number not found: set pr_status = NOT_FOUND, pr_review_decision = null.
- Parse `state` (OPEN | MERGED) and `reviewDecision` (APPROVED | REVIEW_REQUIRED | CHANGES_REQUESTED | null).

### Step 3: Check each acceptance criterion

For each AC item extracted in Step 1:
1. Read `<DIFF_FILE>` to find file paths modified in the PR.
2. For each modified file path: search for code that implements the AC (grep key terms from the AC description).
3. Also search for a test file (`.spec.ts`, `.test.ts`, `.spec.js`) that covers the AC — grep for the same key terms.
4. **Citation rule**: A `PASS` requires BOTH a non-null `code_citation` AND a non-null `test_citation`. Missing either → `FAIL`. No exceptions.
5. **Execution rule**: the cited test must actually run in a lane that gates this change. A test that exists but never executes on the PR is not evidence — it is a citation. Determine the lane from the test's path and the project's CI config (e.g. a `paths-ignore`d job, a suite excluded by the runner's default scope, a directory the per-PR job does not select). If the cited test does not run per-PR, set `status: FAIL` and name the lane in `note`, even though the file exists.

⚠️ **A ticked AC checkbox is a claim, not evidence.** Verify against the diff and the test lane; never treat the story's own checkbox as satisfying either rule. Both failure modes below have occurred and neither was caught by the checkbox:

- An AC ticked complete with **no test written at all**. When the assertion was finally written it went **red immediately**, having concealed a live defect for the whole period it was assumed present.
- A test written and cited, but placed in a **smoke/e2e directory excluded from the per-PR job** — so it would never have guarded the PR it was authored for.

Tasks / refactoring work: `test_citation` may be `NOT_APPLICABLE` if the task explicitly states "no unit tests applicable" (cite that line) — mark status `PASS` with note.

### Step 4: Check documentation updates

Based on `<STORY_TYPE>`:
- **api / backend**: Is there an updated OpenAPI/Swagger spec, or API docs file? Search for `.yaml`/`.json` files with `paths:` or `swagger:` content, or `docs/api/`.
- **ui / frontend**: Are there updated screenshots or user guide markdown files in `docs/`?
- **data**: Is schema documentation updated? Search `docs/` for ERD or schema doc mentions.
- **refactoring / task**: Are any README or skill files updated where behaviour changed? Check `CHANGELOG.md` for an entry matching this story/task.

If no documentation update is required for the story type (e.g. pure internal refactor): mark `NOT_APPLICABLE` with a note citing the reason from the story file.

---

## Output

Return **YAML only** — no prose, no markdown wrapping around the YAML block:

```yaml
ac_traceability:
  story_file: "<STORY_FILE>"
  pr_number: <number or null>
  pr_status: APPROVED | OPEN | MERGED | NOT_FOUND
  pr_review_decision: APPROVED | REVIEW_REQUIRED | CHANGES_REQUESTED | null
  acs:
    - ac_id: "AC1"
      description: "brief AC description (≤15 words)"
      status: PASS | FAIL
      code_citation: "path/to/file.ts:NN"   # null if not found
      test_citation: "path/to/file.spec.ts:NN"  # null if not found, or "NOT_APPLICABLE: reason"
      test_runs_per_pr: true | false            # false → status must be FAIL; name the lane in note
      note: "optional explanation"
  docs:
    - item: "description of doc item"
      status: PASS | FAIL | NOT_APPLICABLE
      citation: "path/to/file.md:NN"   # null if not found
      note: "optional, required if NOT_APPLICABLE"
  overall: PASS | FAIL | PARTIAL
  summary: "one-line summary of AC traceability results"
```

**Citation rule**: `status: PASS` requires a non-null citation. Null citation → `status: FAIL`. `NOT_APPLICABLE` must have a `note`.

**Execution rule**: for acceptance criteria, `status: PASS` additionally requires `test_runs_per_pr: true`. A cited test in a lane the PR does not run is a citation, not evidence → `status: FAIL` with the lane named in `note`.
