---
name: change-checklist
description: Change impact assessment framework with 6 sections. Systematic guide for analyzing significant project changes. Used by correct-course and change-management skills.
---

# Change Navigation Checklist

## Purpose

Systematic framework to analyze and plan response when significant change identified (pivot, tech issue, missing requirement, failed story) during development.

**Used by:** `correct-course` and `change-management` skills

## When to Use

- **SIGNIFICANT changes** affecting project direction
- **NOT for** minor adjustments within story scope

## Required Context

- Triggering story or issue
- Current project state (completed stories, current epic)
- Access to PRD, architecture, key documents
- Understanding of remaining work planned

## Checklist Structure

### Section 1: Understand Trigger & Context

**Goal:** Fully understand what went wrong and why

**Checks:**
- [ ] **Identify Triggering Story:** Which story revealed issue
- [ ] **Define the Issue:** Core problem precisely
  - [ ] Technical limitation/dead-end?
  - [ ] Newly discovered requirement?
  - [ ] Fundamental misunderstanding?
  - [ ] Necessary pivot based on feedback?
  - [ ] Failed/abandoned story?
- [ ] **Assess Initial Impact:** Immediate consequences
- [ ] **Gather Evidence:** Logs, errors, feedback, analysis

**Approach:**
- Be specific and factual (not blame-oriented)
- Ask probing questions
- Understand if one-time or symptomatic of larger problem
- Identify incorrect assumptions

### Section 2: Epic Impact Assessment

**Goal:** Evaluate ripple effects through project structure

**Checks:**

**Analyze Current Epic:**
- [ ] Can current epic still be completed?
- [ ] Does current epic need modification (story changes)?
- [ ] Should current epic be abandoned or redefined?

**Analyze Future Epics:**
- [ ] Review all remaining planned epics
- [ ] Does issue require changes to planned stories?
- [ ] Does issue invalidate any future epics?
- [ ] Does issue necessitate new epics?
- [ ] Should order/priority of epics change?

- [ ] **Summarize Epic Impact:** Overall effect on epic structure

**Approach:**
- Think immediate and downstream effects
- Consider dependencies (created or eliminated)
- Assess if epic sequence needs reordering

### Section 3: Artifact Conflict & Impact Analysis

**Goal:** Check documentation for conflicts and needed updates

**Checks:**

**Review PRD:**
- [ ] Conflicts with core goals or requirements?
- [ ] Needs clarification or updates?

**Review Architecture Document:**
- [ ] Conflicts with documented architecture?
- [ ] Specific components/diagrams/sections impacted?
- [ ] Technology list needs updating?
- [ ] Data models or schemas need revision?
- [ ] External API integrations affected?

**Review Frontend Spec (if applicable):**
- [ ] Conflicts with FE architecture or design?
- [ ] Specific components or user flows impacted?

**Review Other Artifacts:**
- [ ] Deployment scripts, IaC, monitoring affected?

- [ ] **Summarize Artifact Impact:** List all requiring updates

**Approach:**
- Documentation drives development
- Be thorough - missed conflicts cause future problems
- Check if documented decisions still valid

### Section 4: Path Forward Evaluation

**Goal:** Present clear options with trade-offs

**Options:**

**Option 1: Direct Adjustment / Integration**
- [ ] Can issue be addressed by modifying/adding future stories?
- [ ] Define scope and nature of adjustments
- [ ] Assess feasibility, effort, risks

**Option 2: Potential Rollback**
- [ ] Would reverting completed stories simplify addressing issue?
- [ ] Identify specific stories/commits to rollback
- [ ] Assess effort required for rollback
- [ ] Assess impact (lost work, data implications)
- [ ] Compare net benefit/cost vs Direct Adjustment

**Option 3: PRD MVP Review & Re-scoping**
- [ ] Is original PRD MVP still achievable?
- [ ] Does MVP scope need reduction?
- [ ] Do core MVP goals need modification?
- [ ] Are alternative approaches needed?
- [ ] **Extreme:** Fundamental replan or PRD V2 needed?

- [ ] **Select Recommended Path:** Most viable path with rationale

**Approach:**
- Present pros/cons for each option
- Consider: effort, wasted work, risks, timeline, sustainability
- Be honest about trade-offs

### Section 5: Sprint Change Proposal Components

**Goal:** Create actionable, clear proposal

**Components:**
- [ ] **Identified Issue Summary:** Clear problem statement
- [ ] **Epic Impact Summary:** How epics affected
- [ ] **Artifact Adjustment Needs:** Documents to change
- [ ] **Recommended Path Forward:** Chosen solution with rationale
- [ ] **PRD MVP Impact:** Changes to scope/goals (if any)
- [ ] **High-Level Action Plan:** Next steps
- [ ] **Agent Handoff Plan:** Roles needed (PM, Arch, Design Arch, PO)

**Approach:**
- Issue explained in plain language
- Impacts quantified where possible
- Recommended path has clear rationale
- Next steps specific and assigned
- Success criteria for change defined

### Section 6: Final Review & Handoff

**Goal:** Ensure coordination and approval

**Checks:**
- [ ] **Review Checklist:** All relevant items discussed
- [ ] **Review Sprint Change Proposal:** Accurately reflects decisions
- [ ] **User Approval:** Explicit approval obtained
- [ ] **Confirm Next Steps:** Reiterate handoff and actions

**Approach:**
- Is user fully aligned?
- Do stakeholders understand impacts?
- Are handoffs to other agents clear?
- Is there rollback plan if change fails?
- How will we validate change worked?

**Final Report:**
- What changed and why
- What we're doing about it
- Who needs to do what
- When we'll know if it worked

## Key Principles

1. **Interactive process** - Work through with user
2. **User makes decisions** - Provide expert guidance
3. **Minimize wasted work** - Salvage where possible
4. **Professional handling** - Changes are opportunities
5. **Explicit approval** - Get clear user agreement

## Success Criteria

- All checklist sections completed
- Clear understanding of change and impacts
- Multiple paths evaluated
- Recommended path with solid rationale
- Sprint Change Proposal drafted and approved
- Clear next steps with ownership

## Notes

- Changes are inevitable - handle constructively
- This is interactive with user (not solo AI analysis)
- Changes are opportunities to improve, not failures
- Get explicit approval - implicit agreement causes problems
- Keep final report action-oriented and forward-looking
