---
name: qa-gate
description: Use for creating or updating quality gate decision files for stories. Provides clear PASS/CONCERNS/FAIL/WAIVED decisions with actionable feedback based on review findings. Advisory checkpoint for teams to understand quality status.
---

# QA Gate

Create or update quality gate decision files that provide clear pass/fail decisions with actionable feedback. Gates serve as advisory checkpoints for teams to understand quality status and make informed release decisions.

## When to Use This Skill

- **After Story Review**: When qa-story skill has completed comprehensive assessment
- **Creating Gate Files**: Formalizing quality decisions in standardized YAML format
- **Updating Gates**: Revising gate status after bug fixes or improvements
- **Gate Decisions**: Determining PASS/CONCERNS/FAIL/WAIVED status based on findings

**Related Skills**:

- Use `qa-planning` skill for upfront risk and test planning (inputs to gate)
- Use `qa-story` skill for comprehensive review (primary input to gate)

---

## Gate File Purpose

Quality gates provide:

- **Clear Decision**: PASS/CONCERNS/FAIL/WAIVED status with rationale
- **Actionable Feedback**: Specific issues with suggested fixes
- **Traceability**: Links to risk assessments, NFR validations, test coverage
- **Advisory Guidance**: Help teams understand quality status without blocking progress

Gates are **advisory** - teams choose their quality bar, but gates provide transparency.

---

## Prerequisites

- Story has been reviewed (manually or via qa-story skill)
- Review findings are available
- Understanding of story requirements and implementation

---

## Gate File Location and Naming

### Location Configuration


**ALWAYS** check skill resources or explicit file references for the `qa.qaLocation/gates` setting.

### Naming Convention

**Format**: `story.[epic].[story].gate.[number].[descriptive-name].yml`

**Examples**:

- `story.1.1.5.gate.1.feature-implementation.yml`
- `story.2.3.1.gate.1.payment-processing-integration.yml`

### Directory Structure

Gate files are **co-located** in the same directory as the story they belong to. Never use a central `docs/qa/gates/` path.

```
${PRD_ROOT}/<domain>/<feature>/epics/epic.<N>.<name>/stories/story.<N>.<M>.<slug>/
├── story.<N>.<M>.<slug>.md
├── story.<N>.<M>.qa.1.<name>.md      # QA report
└── story.<N>.<M>.gate.1.<name>.yml   # Gate file (co-located)
```

**Example**: If story is at `${PRD_ROOT}/domain-name/module-name/epics/epic.1.<name>/stories/story.1.1.5.<slug>/story.1.1.5.<slug>.md`, gate goes to `${PRD_ROOT}/domain-name/module-name/epics/epic.1.<name>/stories/story.1.1.5.<slug>/story.1.1.5.gate.1.feature-cache.yml`

For tasks: gate is co-located in the task directory at `docs/tasks/task.<id>.<name>/task.<id>.gate.<N>.<name>.yml`.

---

## Gate File Schema

### Minimal Required Schema

**Use this when creating simple gates:**

```yaml
schema: 1
story: "1.3"
gate: PASS # PASS|CONCERNS|FAIL|WAIVED
status_reason: "1-2 sentence explanation of gate decision"
reviewer: "QA Engineer"
updated: "2025-01-12T10:15:00Z" # ISO-8601 timestamp
top_issues: [] # Empty array if no issues
waiver: { active: false } # Only set active: true if WAIVED
```

### Schema with Issues

**Use this when issues are found:**

```yaml
schema: 1
story: "1.3"
gate: CONCERNS
status_reason: "Missing rate limiting on auth endpoints poses security risk."
reviewer: "QA Engineer"
updated: "2025-01-12T10:15:00Z"
top_issues:
  - id: "SEC-001"
    severity: high # ONLY: low|medium|high (no other values)
    file: "apps/api/src/auth/login.controller.ts" # REQUIRED — repo-relative, in the change set
    finding: "No rate limiting on login endpoint"
    suggested_action: "Add rate limiting middleware before production"
    suggested_owner: "dev" # dev|sm|po
  - id: "TEST-001"
    severity: medium
    file: "apps/api/src/auth/auth.controller.spec.ts"
    finding: "No integration tests for auth flow"
    suggested_action: "Add integration test coverage"
    suggested_owner: "dev"
waiver: { active: false }
```

### Schema with Waiver

**Use this when issues are acknowledged but waived:**

```yaml
schema: 1
story: "1.3"
gate: WAIVED
status_reason: "Known issues accepted for MVP release."
reviewer: "QA Engineer"
updated: "2025-01-12T10:15:00Z"
top_issues:
  - id: "PERF-001"
    severity: low
    file: "apps/web/src/dashboard/DashboardList.tsx"
    finding: "Dashboard loads slowly with 1000+ items"
    suggested_action: "Implement pagination in next sprint"
waiver:
  active: true
  reason: "MVP release - performance optimization deferred"
  approved_by: "Product Owner"
```

### Extended Schema (Optional but Recommended)

**Use this for comprehensive gates with full traceability:**

```yaml
schema: 1
story: "1.3"
story_title: "Implement user authentication"
gate: CONCERNS
status_reason: "Security gaps identified - rate limiting and enhanced testing needed."
reviewer: "QA Engineer"
updated: "2025-01-12T10:15:00Z"

top_issues:
  - id: "SEC-001"
    severity: high
    file: "apps/api/src/auth/login.controller.ts"
    finding: "No rate limiting on login endpoint"
    suggested_action: "Add rate limiting middleware"
    suggested_owner: "dev"

waiver: { active: false }

# Optional extended fields
quality_score: 80 # 100 - (20*FAILs) - (10*CONCERNS)
expires: "2025-01-26T00:00:00Z" # Typically 2 weeks from review

evidence:
  tests_reviewed: 15
  risks_identified: 3
  trace:
    ac_covered: [1, 2, 3] # AC numbers with test coverage
    ac_gaps: [4] # AC numbers lacking coverage

nfr_validation:
  security:
    status: CONCERNS
    notes: "Rate limiting missing on auth endpoints"
  performance:
    status: PASS
    notes: "Response times < 200ms verified"
  reliability:
    status: PASS
    notes: "Error handling and retries implemented"
  maintainability:
    status: PASS
    notes: "Test coverage at 82%"

risk_summary:
  totals:
    critical: 0 # score 9
    high: 1 # score 6
    medium: 1 # score 4
    low: 1 # score 2-3
  highest:
    id: SEC-001
    score: 6
    title: "Rate limiting missing"
  recommendations:
    must_fix:
      - "Add rate limiting to auth endpoints"
    monitor:
      - "Monitor authentication failure rates"

recommendations:
  immediate: # Must fix before production
    - action: "Add rate limiting"
      refs: ["api/auth/login.ts"]
  future: # Can be addressed later
    - action: "Consider caching"
      refs: ["services/data.ts"]

# Optional: Audit trail
history:
  - at: "2025-01-12T10:00:00Z"
    gate: FAIL
    note: "Initial review - missing tests"
  - at: "2025-01-12T15:00:00Z"
    gate: CONCERNS
    note: "Tests added but rate limiting still missing"
```

---

## Gate Decision Criteria

### Deterministic Rule (Apply in Order)

Apply these rules in sequence to determine gate status:

**1. Risk Thresholds (if risk_summary present from qa-planning)**:

- If any risk score ≥ 9 → Gate = **FAIL** (unless waived)
- Else if any risk score ≥ 6 → Gate = **CONCERNS**

**2. Test Coverage Gaps (if trace available from qa-story)**:

- If any P0 test from test-design is missing → Gate = **CONCERNS**
- If security/data-loss P0 test missing → Gate = **FAIL**

**3. Issue Severity**:

> **`file:` is required on every `top_issues[]` entry.** It must be a repo-relative path that
> appears in the change set — not a description, not a module name, not `unknown`. The develop
> pipelines' **third-strike rule** reads it to detect a file that HIGH findings keep circling across
> QA cycles, and that rule works only because `file:` is checkable against the diff. A finding that
> spans several files names the one a fix would edit first; a finding with no file (a missing
> artifact) names the path it *should* exist at.

- If any `top_issues.severity == high` → Gate = **FAIL** (unless waived)
- Else if any `top_issues.severity == medium` → Gate = **CONCERNS**

**4. NFR Statuses**:

- If any NFR status is FAIL → Gate = **FAIL**
- Else if any NFR status is CONCERNS → Gate = **CONCERNS**
- Else → Gate = **PASS**

**5. Waived Only When**:

- `waiver.active: true` with reason and approver

### Gate Status Definitions

**PASS**

- All acceptance criteria met
- No high-severity issues
- Test coverage meets project standards
- All P0 tests present and passing
- All NFRs meet targets

**CONCERNS**

- Non-blocking issues present
- Should be tracked and scheduled
- Can proceed with awareness
- Medium-severity issues or minor gaps
- Some P1 tests missing
- NFRs partially met

**FAIL**

- Acceptance criteria not met
- High-severity issues present
- Recommend return to InProgress
- Security/data integrity risks
- P0 tests missing or failing
- Critical NFRs not met

**WAIVED**

- Issues explicitly accepted
- Requires approval and reason
- Proceed despite known issues
- Document risk acceptance
- Include approver name

---

## Issue Classification

### Severity Scale

**CRITICAL - Use ONLY these exact values:**

- `low`: Minor issues, cosmetic problems, edge cases
- `medium`: Should fix soon, not blocking, affects subset of users
- `high`: Critical issues, should block release, security/data risks

**No other values allowed** (not "critical", not "severe", not "minor")

### Issue ID Prefixes

Use these standard prefixes for issue IDs:

- **SEC-**: Security issues (auth, encryption, vulnerabilities)
- **PERF-**: Performance issues (slow queries, memory leaks, bottlenecks)
- **REL-**: Reliability issues (error handling, recovery, resilience)
- **TEST-**: Testing gaps (missing coverage, flaky tests, test quality)
- **MNT-**: Maintainability concerns (code structure, documentation, complexity)
- **ARCH-**: Architecture issues (design patterns, coupling, scalability)
- **DOC-**: Documentation gaps (missing docs, outdated guides, unclear comments)
- **REQ-**: Requirements issues (unclear specs, missing acceptance criteria)

### Suggested Owner

For each issue, include `suggested_owner`:

- **dev**: Code changes needed (developers)
- **sm**: Requirements clarification needed (scrum master/team lead)
- **po**: Business decision needed (product owner)

---

## Quality Score Calculation

### Standard Formula

```text
quality_score = 100
For each NFR or issue:
  - FAIL status: Deduct 20 points
  - CONCERNS status: Deduct 10 points

Minimum: 0 (critical quality issues)
Maximum: 100 (perfect quality)
```

### Custom Weights

If `docs/technical-preferences.md` defines custom weights, use those instead.

**Example custom weights:**

```yaml
quality_weights:
  security_fail: 30
  security_concerns: 15
  performance_fail: 20
  performance_concerns: 10
  test_coverage_fail: 25
  test_coverage_concerns: 10
```

---

## Output Requirements

### File Creation Steps

1. **Create gate file** at: `{qa.qaLocation}/gates/[prd-path]/story.[epic].[story].gate.[number].[descriptive-name].yml`
2. **Keep status_reason** to 1-2 sentences maximum
3. **Use severity values exactly**: `low`, `medium`, or `high` (no variations)
4. **Mirror PRD structure**: Gate file directory matches story file location
5. **Include timestamp**: ISO-8601 format (e.g., `2025-01-12T10:15:00Z`)

### Validation Checklist

Before finalizing gate file, verify:

- [ ] Gate status follows deterministic rules
- [ ] Severity values are `low`, `medium`, or `high` only
- [ ] Issue IDs use standard prefixes (SEC-, PERF-, etc.)
- [ ] Status reason is 1-2 sentences
- [ ] Timestamp is ISO-8601 format
- [ ] Waiver includes reason and approver if active
- [ ] File saved to correct mirrored directory structure

---

## Interactive Elicitation

When gate decision is unclear, use AskUserQuestion to clarify:

**Severity Assessment**:

- How critical is this issue to the business?
- What's the blast radius if this fails in production?
- Can we ship with this issue and fix later?

**Waiver Decisions**:

- Are we willing to accept this risk for this release?
- Who has authority to approve this waiver?
- What's our plan to address this in the future?

**Priority Conflicts**:

- Business wants to ship, but security issues exist - what takes priority?
- How do we balance speed vs quality in this case?

---

## Integration with QA Workflow

### Workflow Sequence

1. **Planning** (qa-planning skill)
   - Risk profiling → Feeds `risk_summary` section
   - Test design → Feeds `evidence.tests_reviewed` and `trace` sections

2. **Review** (qa-story skill)
   - Story review → Generates `top_issues`
   - NFR assessment → Feeds `nfr_validation` section
   - Requirements traceability → Feeds `trace` section

3. **Gate Decision** (this skill)
   - Aggregate all assessment data
   - Apply deterministic decision rules
   - Create standardized gate file

### Cross-Skill References

**From this skill to qa-planning**:

- "Reference risk_summary from qa-planning skill's risk profile output"
- "Use test design data from qa-planning skill for evidence section"

**From this skill to qa-story**:

- "Pull top_issues from qa-story skill's QA report"
- "Use nfr_validation data from qa-story skill's NFR assessment"
- "Reference trace data from qa-story skill's traceability matrix"

---

## Configuration and File Locations

### Expected Configuration


All file locations should be defined in skill resources or explicit file references:

```yaml
qa:
  qaLocation: "docs/qa" # Base directory for QA assessments and other artifacts (NOT gates — gates are co-located with their story/task)
```

### Directory Structure

Gate files are co-located alongside their story or task — not under `docs/qa/gates/`. See "Directory Structure" earlier in this skill for the canonical layout.

---

## Gate File Template Reference

### Minimal Template

```yaml
schema: 1
story: "{epic}.{story}"
gate: PASS|CONCERNS|FAIL|WAIVED
status_reason: "{1-2 sentence explanation}"
reviewer: "QA Engineer"
updated: "{ISO-8601 timestamp}"
top_issues: []
waiver: { active: false }
```

### Comprehensive Template

```yaml
schema: 1
story: "{epic}.{story}"
story_title: "{story title}"
gate: PASS|CONCERNS|FAIL|WAIVED
status_reason: "{1-2 sentence explanation}"
reviewer: "QA Engineer"
updated: "{ISO-8601 timestamp}"

top_issues:
  - id: "{PREFIX-###}"
    severity: low|medium|high
    file: "{repo-relative path the finding is IN}" # REQUIRED
    finding: "{description}"
    suggested_action: "{fix}"
    suggested_owner: dev|sm|po

waiver:
  active: false # or true with reason/approved_by

quality_score: 0-100
expires: "{ISO-8601 timestamp}"

evidence:
  tests_reviewed: { count }
  risks_identified: { count }
  trace:
    ac_covered: [{ list }]
    ac_gaps: [{ list }]

nfr_validation:
  security: { status: PASS|CONCERNS|FAIL, notes: "" }
  performance: { status: PASS|CONCERNS|FAIL, notes: "" }
  reliability: { status: PASS|CONCERNS|FAIL, notes: "" }
  maintainability: { status: PASS|CONCERNS|FAIL, notes: "" }

risk_summary:
  totals: { critical: 0, high: 0, medium: 0, low: 0 }
  highest: { id: "", score: 0, title: "" } # Only if risks exist
  recommendations:
    must_fix: []
    monitor: []

recommendations:
  immediate:
    - action: ""
      refs: []
  future:
    - action: ""
      refs: []

history:
  - at: "{ISO-8601 timestamp}"
    gate: PASS|CONCERNS|FAIL|WAIVED
    note: "{change description}"
```

---

## Key Principles

1. **Minimal and Predictable**: Keep schema simple, use fixed values
2. **Fixed Severity Scale**: Only `low`, `medium`, `high` (no variations)
3. **Standard File Paths**: Always use convention per QA Execution Playbook
4. **Clear, Actionable Findings**: Each issue has suggested action and owner
5. **Deterministic Decisions**: Apply rules consistently for gate status
6. **Advisory, Not Blocking**: Gates inform teams, teams decide to proceed or not
7. **Mirrored Structure**: Gate files mirror PRD directory structure
8. **ISO-8601 Timestamps**: Consistent timestamp format across all gates
9. **Traceability**: Link back to assessments, risks, and reviews
10. **Audit Trail**: Optional history section for gate status changes
