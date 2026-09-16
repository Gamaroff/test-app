---
name: change-management
description: Orchestrate structured response to project changes (pivots, tech issues, missing requirements, failed stories). Use when significant changes affect project direction requiring comprehensive impact analysis.
---

# Change Management

## When to Use This Skill

Activate when:

- Story fails or reveals significant issue
- Technical dead-end discovered
- New requirements emerge mid-project
- Pivot needed based on feedback
- Assumptions proven incorrect
- Significant change affects project direction

**Natural triggers:**

- "Story [X] failed because..."
- "We need to pivot on..."
- "Just discovered we need..."
- "This approach isn't working..."

**Do NOT use for:**

- Minor adjustments within story scope
- Bug fixes
- Small requirement clarifications

## Purpose

Guide structured response to change triggers:

- Analyze impacts on epics, artifacts, MVP scope
- Explore potential solutions (adjust, rollback, re-scope)
- Draft specific proposed updates to affected artifacts
- Produce Sprint Change Proposal for user approval
- Ensure clear handoff if fundamental replanning needed

## Workflow Overview

```
1. Initial Setup & Mode Selection
   ├─ Confirm change trigger
   ├─ Gather project context
   └─ Choose interaction mode (Incremental / YOLO)

2. Execute Change-Checklist Analysis (Sections 1-4)
   ├─ Understand trigger & context
   ├─ Epic impact assessment
   ├─ Artifact conflict analysis
   └─ Path forward evaluation

3. Draft Proposed Changes
   ├─ Identify specific artifacts requiring updates
   ├─ Draft explicit proposed edits
   └─ Refine with user (mode-dependent)

4. Generate Sprint Change Proposal
   ├─ Analysis summary
   ├─ Specific proposed edits
   └─ Present for user review

5. Finalize & Determine Next Steps
   ├─ Obtain user approval
   ├─ Determine if direct implementation or handoff to PM/Architect
   └─ Complete with clear next actions
```

## Detailed Steps

### Step 1: Initial Setup & Mode Selection

**Acknowledge Task:**

- Confirm "Change Management" initiated
- Verify change trigger and user explanation
- Confirm access to: PRD, Epics/Stories, Architecture, `change-checklist`

**Establish Interaction Mode:**

Ask user:

```
"How should we work through this change analysis?

1. **Incrementally (Recommended):** Work through change-checklist
   section by section, discussing findings and drafting proposed
   changes collaboratively. Detailed, step-by-step refinement.

2. **YOLO Mode:** Conduct batched analysis based on checklist,
   then present consolidated findings and proposed changes for
   broader review. Quicker initial assessment but more extensive
   review of combined proposals.

Which do you prefer?"
```

Confirm selection and proceed.

### Step 2: Execute Change-Checklist Analysis

Use `change-checklist` skill to work through Sections 1-4:

**Section 1: Understand Trigger & Context**

- Identify triggering story
- Define core problem
- Assess initial impact
- Gather evidence

**Section 2: Epic Impact Assessment**

- Analyze current epic (can complete? needs modification? abandon?)
- Analyze future epics (changes needed? invalidated? new epics? reorder?)
- Summarize epic impact

**Section 3: Artifact Conflict & Impact Analysis**

- Review PRD (conflicts with goals/requirements?)
- Review Architecture (conflicts with tech choices/components?)
- Review Frontend Spec (conflicts with UI/UX?)
- Review other artifacts (deployment, monitoring, etc.)
- Summarize artifact impact

**Section 4: Path Forward Evaluation**

- **Option 1:** Direct adjustment/integration (modify/add stories)
- **Option 2:** Potential rollback (revert completed stories)
- **Option 3:** PRD MVP review & re-scoping (reduce scope, modify goals, replan)
- **Select recommended path** with rationale

### Step 3: Draft Proposed Changes

Based on recommended path, draft specific edits:

**Examples:**

- Revise user story text, acceptance criteria, priority
- Add/remove/reorder/split stories within epics
- Propose modified architecture diagrams (Mermaid updates)
- Update technology lists, configuration details
- Modify PRD or architecture document sections
- Draft new supporting artifacts if needed

**Mode-dependent:**

- **Incremental:** Discuss and refine edits as drafted
- **YOLO:** Compile all edits for next step

### Step 4: Generate Sprint Change Proposal

Create comprehensive proposal:

```markdown
# Sprint Change Proposal

## Analysis Summary

### Original Issue

[Concise problem statement]

### Impact Analysis

- **Epic Impact:** [How epics affected]
- **Artifact Impact:** [Which documents need updates]
- **MVP Scope Impact:** [Changes to scope/goals]

### Rationale for Chosen Path

[Why this solution vs alternatives]

## Specific Proposed Edits

### Epic Changes

**[Epic N] Name**

- **Change:** [Description]
- **From:** [Old content]
- **To:** [New content]

### Story Changes

**Story [X.Y]: [Title]**

- **Change:** [Description]
- **From:** [Old text]
- **To:** [New text]

### PRD Updates

**Section [N]: [Title]**

- **Change:** [Description]
- **Updated Text:** [New content]

### Architecture Updates

**Component [Name]**

- **Change:** [Description]
- **Updated Diagram:** [Mermaid or description]

## Action Plan

1. [First action]
2. [Second action]
3. [Third action]

## Agent Handoff

**To:** [PM / Architect / PO / SM]
**Context:** [What they need to know]
**Deliverable:** [What they should produce]
```

**Append a "Change Log rows to add" block.** This skill does not apply edits — it emits a proposal that a PO or SM applies by hand — so it cannot write the Change Log rows itself. What it can do is hand over the exact text, one row per affected artifact, so the human applying the edits does not have to derive them:

```markdown
## Change Log rows to add

Paste one row into each artifact's Change Log when applying the edits above, and bump that
document's frontmatter `updated` in the same edit.
Canonical format: [document-change-log.md](references/document-change-log.md).

| Artifact | Row |
|---|---|
| `story.4.2.checkout.md` | `\| 2026-08-12 \| 1.3 \| AC2 relaxed — offline retry deferred to epic 5 \| change-management \|` |
| `epic.4.checkout.md`    | `\| 2026-08-12 \| 1.2 \| Story 4.2 descoped per sprint change proposal \| change-management \|` |
```

Describe the substance of each change, not that a proposal was applied. Omit the block entirely when `change-log.enabled: false` in `skills-config.yaml`.

Present to user for review and feedback.

### Step 5: Finalize & Determine Next Steps

**Obtain Approval:**

- Get explicit user approval for Sprint Change Proposal
- Incorporate any final adjustments

**Determine Next Steps:**

**If edits can be implemented directly:**

```
"Change Management complete. Approved edits documented in
Sprint Change Proposal. Proceed with:
1. Updating project documents
2. Organizing backlog items
3. [Any specific implementation steps]"
```

**If fundamental replan needed:**

```
"Analysis indicates this change requires fundamental replanning.
Next step: Engage [PM/Architect] agents with Sprint Change
Proposal as critical input for deeper replanning effort."
```

## Integration with Other Skills

**This skill orchestrates:**

- `correct-course` - Execution workflow (internal)
- `change-checklist` - Analysis framework

**May lead to:**

- PM replan (new-product-prd or create-prd)
- Architect redesign
- PO/SM backlog reorganization

## Key Principles

1. **Structured analysis** - Use checklist systematically
2. **Minimize waste** - Salvage existing work where possible
3. **User buy-in** - Explicit approval required
4. **Clear handoffs** - Next steps and ownership explicit
5. **Professional handling** - Changes are opportunities, not failures

## Success Criteria

- Change trigger fully understood
- Impact on epics/artifacts/MVP assessed comprehensively
- Multiple paths evaluated with pros/cons
- Specific edits drafted (not just analysis)
- Sprint Change Proposal approved by user
- Clear next steps with assigned ownership

## Notes

- Changes during development are inevitable
- Goal: minimize wasted work while adapting to reality
- User buy-in critical - they must understand and approve
- Handle constructively - changes are improvement opportunities
- Minor adjustments don't require this process
