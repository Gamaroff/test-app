---
name: correct-course
description: Change management and navigation skill for handling project pivots, blockers, and requirement changes. Uses change-checklist to analyze impacts, evaluate options, and generate Sprint Change Proposals with specific artifact edits.
---

# Correct Course (Change Navigation)

## When to Use This Skill

Use this skill when significant changes occur that affect project direction:

- **Project pivots** due to new requirements or business decisions ("we need to change direction", "requirements have changed")
- **Technical blockers** that prevent progress ("we hit a dead-end with this approach", "technology choice isn't working")
- **Failed stories** requiring new approaches ("story failed, need different strategy")
- **Discovered missing requirements** that impact existing work ("we missed a critical requirement")
- **Scope adjustments** to MVP or epic structure ("need to re-scope the MVP")

Natural language triggers:
- "We hit a blocker on story 2.1"
- "Need to reassess our approach"
- "Requirements changed for this epic"
- "This technology isn't working, need alternatives"
- "Story 1.3 failed, what's the impact?"

## Purpose

To guide a structured response to change triggers using the change-checklist. This skill:
- Analyzes impacts on epics, artifacts, and MVP
- Explores potential solutions (adjust scope, rollback, re-scope)
- Drafts specific, actionable proposed updates to project artifacts
- Produces consolidated "Sprint Change Proposal" for user review
- Ensures clear handoff path if fundamental replanning needed

## CRITICAL: When NOT to Use This Skill

**DO NOT use** for:
- Minor adjustments within a story (handle during implementation)
- Routine bug fixes (use standard issue tracking)
- Clarification questions (ask directly)
- Style or formatting changes (make directly)

**ONLY use** for significant changes that affect:
- Epic structure or dependencies
- Multiple stories
- PRD scope or MVP definition
- Architecture decisions
- Multiple project artifacts

---

## Workflow

### Step 1: Initial Setup & Mode Selection

#### 1.1 Acknowledge Task & Inputs

1. **Confirm Task Initiation**
   > "Correct Course Task (Change Navigation & Integration) initiated."

2. **Verify Change Trigger**
   Ask user to provide:
   - What triggered this change review?
   - Which story/epic is affected?
   - What is the observed issue or problem?
   - What is the perceived impact?

3. **Confirm Access to Artifacts**
   Ensure availability of:
   - PRD (sharded or monolithic)
   - Affected epic files
   - Affected story files
   - Architecture documents
   - UI/UX specifications (if applicable)
   - **Change-checklist**: `resources/change-checklist.md`
   - **Core config**: `resources/core-config.yaml`

> "We will now use the change-checklist to analyze the change and draft proposed updates. I will guide you through the checklist items section by section in an interactive manner."

---

### Step 2: Execute Checklist Analysis

**Purpose**: Systematically work through change-checklist Sections 1-4

**Checklist Sections**:
1. Understand Trigger & Context
2. Epic Impact Assessment
3. Artifact Conflict & Impact Analysis
4. Path Forward Evaluation

**Processing Approach** (Interactive):

For each checklist section:

1. **Present Section**
   - Show relevant prompts from checklist
   - Explain what information is needed

2. **Analyze Artifacts**
   - Read affected PRD sections
   - Review epic files
   - Check story files
   - Review architecture docs
   - Identify conflicts and impacts

3. **Discuss Findings**
   - Present analysis to user
   - Highlight key issues
   - Note dependencies affected

4. **Record Status**
   - Mark checklist items:
     - `[x]` Addressed
     - `[N/A]` Not applicable
     - `[!]` Further action needed
   - Document decisions and notes

5. **Get User Confirmation**
   - Ask if findings are accurate
   - Clarify any ambiguities
   - Document user input

6. **Proceed to Next Section**
   - Only after user approval
   - Build on previous findings

#### Checklist Section Details

**Section 1: Understand Trigger & Context**

Answer:
- What is the triggering story/issue?
- What is the precise problem?
  - Technical limitation/dead-end?
  - Newly discovered requirement?
  - Misunderstanding of existing requirements?
  - Pivot based on feedback?
  - Failed/abandoned story?
- What are immediate consequences?
- What evidence supports the issue?

**Section 2: Epic Impact Assessment**

Analyze:
- **Current Epic**:
  - Can it still be completed?
  - Does it need modification (story changes, additions, removals)?
  - Should it be abandoned or redefined?

- **Future Epics**:
  - Do remaining planned epics need changes?
  - Does the issue invalidate any future epics?
  - Are entirely new epics needed?
  - Should epic order/priority change?

- **Summary**: Document overall effect on epic structure and flow

**Section 3: Artifact Conflict & Impact Analysis**

Review each artifact:

- **PRD**:
  - Conflicts with core goals or requirements?
  - PRD needs clarification or updates?

- **Architecture Document**:
  - Conflicts with documented architecture?
  - Specific components/sections impacted?
  - Technology list needs updating?
  - Data models or schemas need revision?
  - External API integrations affected?

- **Frontend Spec** (if applicable):
  - Conflicts with FE architecture or UI/UX design?
  - Specific components or user flows impacted?

- **Other Artifacts**:
  - Deployment scripts, IaC, monitoring, etc.

- **Summary**: List all artifacts requiring updates and nature of changes

**Section 4: Path Forward Evaluation**

Evaluate options:

**Option 1: Direct Adjustment / Integration**
- Can issue be addressed by modifying/adding future stories?
- Define scope and nature of adjustments
- Assess feasibility, effort, and risks

**Option 2: Potential Rollback**
- Would reverting completed stories simplify addressing the issue?
- Identify specific stories/commits to consider
- Assess rollback effort and impact
- Compare net benefit/cost vs Direct Adjustment

**Option 3: PRD MVP Review & Re-scoping**
- Is original PRD MVP still achievable?
- Does MVP scope need reduction?
- Do core MVP goals need modification?
- Are alternative approaches needed?
- **Extreme Case**: Does issue require fundamental replan or new PRD V2?

**Select Recommended Path**:
- Based on evaluation, agree on most viable path forward
- Document rationale
- Identify risks and mitigation strategies

---

### Step 3: Draft Proposed Changes

**Purpose**: Create specific, actionable edits for affected artifacts

For each affected artifact, draft **exact** changes using this format:

**For User Stories**:
```markdown
**Story 1.2: User Authentication**

CHANGE FROM:
[original content]

CHANGE TO:
[new content]

**Rationale**: [Why this change is needed]
```

**For Epic Files, PRD, Architecture**: Similar explicit before/after format

**Critical**: Be specific - show exact text changes, not just "update story"

---

### Step 4: Generate "Sprint Change Proposal"

Create consolidated document with:
- Analysis summary (trigger, impact, path forward)
- Specific proposed edits for all affected artifacts
- Impact assessment (scope, timeline)
- **A "Change Log rows to add" block** (see below)
- Next steps and handoff requirements

**Document Location**: `docs/change-proposals/sprint-change-{date}-{issue}.md`

#### "Change Log rows to add" block

This skill does **not** apply edits — it emits a proposal that a PO or SM applies by hand. So it cannot write the Change Log rows itself; what it can do is hand over the exact text, one row per affected artifact, so the human applying the edits does not have to derive them. Append this subsection after the per-artifact edit sections:

```markdown
## Change Log rows to add

Paste one row into each artifact's Change Log when applying the edits above, and bump that
document's frontmatter `updated` in the same edit.
Canonical format: [document-change-log.md](references/document-change-log.md).

| Artifact | Row |
|---|---|
| `story.4.2.checkout.md` | `\| 2026-08-12 \| 1.3 \| AC2 relaxed — offline retry deferred to epic 5 \| correct-course \|` |
| `epic.4.checkout.md`    | `\| 2026-08-12 \| 1.2 \| Story 4.2 descoped per sprint change proposal \| correct-course \|` |
```

Describe the substance of each change, not that a proposal was applied. Omit the block entirely when `change-log.enabled: false` in `skills-config.yaml`.

---

### Step 5: Finalize & Determine Next Steps

1. Get user approval for proposal
2. Save finalized document
3. Determine handoff path:
   - **Direct implementation**: PO/SM handles backlog updates
   - **Fundamental replanning**: PM/Architect needs to engage

---

## Integration with Other Skills

**Calls**: `execute-checklist` - Uses change-checklist for structured analysis

**Outputs used by**: Product owners, managers, architects for implementation

---

## Common Change Scenarios

### Technical Dead-End
**Trigger**: "API library doesn't support required functionality"
**Likely Path**: Direct adjustment with technology swap

### Scope Creep
**Trigger**: "Discovered critical missing requirement"
**Likely Path**: Add to MVP or defer to v1.1

### Failed Story
**Trigger**: "Implementation revealed fundamental design flaw"
**Likely Path**: Rollback story, revise approach

---

## Success Criteria

✅ Change trigger clearly understood
✅ Impact fully analyzed
✅ Multiple options evaluated
✅ Specific edits drafted
✅ Sprint Change Proposal complete and approved
✅ Clear handoff path identified

---

## Notes

- For **significant changes** only, not minor adjustments
- Follow **change-checklist systematically**
- Draft **explicit edits** - show exact changes
- **Collaboration is key** - work with user throughout
- **Document everything** - decisions, alternatives, rationale
- Get **approval before implementation**

---

## Resources

This skill uses these resource files:

- `resources/change-checklist.md` - Systematic change analysis framework
- `resources/core-config.yaml` - Project configuration

**Output Location**: `docs/change-proposals/`
