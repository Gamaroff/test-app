---
name: pm-checklist
description: Comprehensive PRD validation with 9 categories and 60+ checks. Use to validate PRD quality, completeness, and readiness for architecture phase before architect handoff.
---

# Product Manager (PM) Requirements Checklist

## When to Use This Skill

Activate this skill when:

- Validating PRD quality and completeness
- Checking if PRD is ready for architect handoff
- User asks "Is my PRD ready?" or "Validate my PRD"
- At end of PRD creation workflow (before Next Steps)
- User needs comprehensive quality assessment

**Do NOT use for:**

- Creating PRDs (use `new-product-prd` or `create-prd`)
- Quick spot-checks (this is comprehensive validation)

## Purpose

This checklist ensures Product Requirements Documents (PRDs) and epic definitions are:

- **Complete** - All necessary sections and details included
- **Well-structured** - Organized logically and consistently
- **MVP-focused** - Appropriately scoped for minimal viable product
- **Clear** - Unambiguous and testable
- **Ready for next phase** - Architect can begin design work

## Initialization

Before starting validation, ensure you have:

1. **prd.md** - The Product Requirements Document (check `docs/prd.md`)
2. Any user research, market analysis, or competitive analysis documents
3. Business goals and strategy documents
4. Any existing epic definitions or user stories

**IMPORTANT:** If PRD is missing, immediately ask user for location before proceeding.

## Validation Approach

### Core Principles

1. **User-Centric** - Every requirement ties back to user value
2. **MVP Focus** - Ensure scope is truly minimal while viable
3. **Clarity** - Requirements unambiguous and testable
4. **Completeness** - All aspects of product vision covered
5. **Feasibility** - Requirements technically achievable

### Execution Modes

Ask user to choose:

- **Section by section (interactive mode)** - Review each section, present findings, get confirmation before proceeding
- **All at once (comprehensive mode)** - Complete full analysis, present comprehensive report at end

## Checklist Categories

### 1. Problem Definition & Context

**Focus:** Foundation of any product is clear problem statement

**Validation Approach:**

1. Verify problem is real and worth solving
2. Check target audience is specific (not "everyone")
3. Ensure success metrics are measurable (not vague aspirations)
4. Look for evidence of user research (not just assumptions)
5. Confirm problem-solution fit is logical

**Checks (5 items):**

#### 1.1 Problem Statement

- [ ] Clear articulation of problem being solved
- [ ] Identification of who experiences the problem
- [ ] Explanation of why solving this problem matters
- [ ] Quantification of problem impact (if possible)
- [ ] Differentiation from existing solutions

#### 1.2 Business Goals & Success Metrics

- [ ] Specific, measurable business objectives defined
- [ ] Clear success metrics and KPIs established
- [ ] Metrics tied to user and business value
- [ ] Baseline measurements identified (if applicable)
- [ ] Timeframe for achieving goals specified

#### 1.3 User Research & Insights

- [ ] Target user personas clearly defined
- [ ] User needs and pain points documented
- [ ] User research findings summarized (if available)
- [ ] Competitive analysis included
- [ ] Market context provided

---

### 2. MVP Scope Definition

**Focus:** MVP scope is critical - too much wastes resources, too little can't validate

**Validation Approach:**

1. Is this truly minimal? Challenge every feature
2. Does each feature directly address core problem?
3. Are "nice-to-haves" clearly separated from "must-haves"?
4. Is rationale for inclusion/exclusion documented?
5. Can you ship this in target timeframe?

**Checks (3 subsections):**

#### 2.1 Core Functionality

- [ ] Essential features clearly distinguished from nice-to-haves
- [ ] Features directly address defined problem statement
- [ ] Each Epic ties back to specific user needs
- [ ] Features and Stories described from user perspective
- [ ] Minimum requirements for success defined

#### 2.2 Scope Boundaries

- [ ] Clear articulation of what is OUT of scope
- [ ] Future enhancements section included
- [ ] Rationale for scope decisions documented
- [ ] MVP minimizes functionality while maximizing learning
- [ ] Scope reviewed and refined multiple times

#### 2.3 MVP Validation Approach

- [ ] Method for testing MVP success defined
- [ ] Initial user feedback mechanisms planned
- [ ] Criteria for moving beyond MVP specified
- [ ] Learning goals for MVP articulated
- [ ] Timeline expectations set

---

### 3. User Experience Requirements

**Focus:** UX requirements bridge user needs and technical implementation

**Validation Approach:**

1. User flows cover primary use cases completely
2. Edge cases identified (even if deferred)
3. Accessibility isn't an afterthought
4. Performance expectations realistic
5. Error states and recovery planned

**Checks (3 subsections):**

#### 3.1 User Journeys & Flows

- [ ] Primary user flows documented
- [ ] Entry and exit points for each flow identified
- [ ] Decision points and branches mapped
- [ ] Critical path highlighted
- [ ] Edge cases considered

#### 3.2 Usability Requirements

- [ ] Accessibility considerations documented
- [ ] Platform/device compatibility specified
- [ ] Performance expectations from user perspective defined
- [ ] Error handling and recovery approaches outlined
- [ ] User feedback mechanisms identified

#### 3.3 UI Requirements

- [ ] Information architecture outlined
- [ ] Critical UI components identified
- [ ] Visual design guidelines referenced (if applicable)
- [ ] Content requirements specified
- [ ] High-level navigation structure defined

---

### 4. Functional Requirements

**Focus:** Functional requirements must be clear enough for implementation

**Validation Approach:**

1. Requirements focus on WHAT not HOW (no implementation details)
2. Each requirement testable (how would QA verify?)
3. Dependencies explicit (what needs to be built first?)
4. Requirements use consistent terminology
5. Complex features broken into manageable pieces

**Checks (3 subsections):**

#### 4.1 Feature Completeness

- [ ] All required features for MVP documented
- [ ] Features have clear, user-focused descriptions
- [ ] Feature priority/criticality indicated
- [ ] Requirements testable and verifiable
- [ ] Dependencies between features identified

#### 4.2 Requirements Quality

- [ ] Requirements specific and unambiguous
- [ ] Requirements focus on WHAT not HOW
- [ ] Requirements use consistent terminology
- [ ] Complex requirements broken into simpler parts
- [ ] Technical jargon minimized or explained

#### 4.3 User Stories & Acceptance Criteria

- [ ] Stories follow consistent format
- [ ] Acceptance criteria testable
- [ ] Stories sized appropriately (not too large)
- [ ] Stories independent where possible
- [ ] Stories include necessary context
- [ ] Local testability requirements defined in ACs for backend/data stories

---

### 5. Non-Functional Requirements

**Checks (4 subsections):**

#### 5.1 Performance Requirements

- [ ] Response time expectations defined
- [ ] Throughput/capacity requirements specified
- [ ] Scalability needs documented
- [ ] Resource utilization constraints identified
- [ ] Load handling expectations set

#### 5.2 Security & Compliance

- [ ] Data protection requirements specified
- [ ] Authentication/authorization needs defined
- [ ] Compliance requirements documented
- [ ] Security testing requirements outlined
- [ ] Privacy considerations addressed

#### 5.3 Reliability & Resilience

- [ ] Availability requirements defined
- [ ] Backup and recovery needs documented
- [ ] Fault tolerance expectations set
- [ ] Error handling requirements specified
- [ ] Maintenance and support considerations included

#### 5.4 Technical Constraints

- [ ] Platform/technology constraints documented
- [ ] Integration requirements outlined
- [ ] Third-party service dependencies identified
- [ ] Infrastructure requirements specified
- [ ] Development environment needs identified

---

### 6. Epic & Story Structure

**Checks (3 subsections):**

#### 6.1 Epic Definition

- [ ] Epics represent cohesive units of functionality
- [ ] Epics focus on user/business value delivery
- [ ] Epic goals clearly articulated
- [ ] Epics sized appropriately for incremental delivery
- [ ] Epic sequence and dependencies identified

#### 6.2 Story Breakdown

- [ ] Stories broken down to appropriate size
- [ ] Stories have clear, independent value
- [ ] Stories include appropriate acceptance criteria
- [ ] Story dependencies and sequence documented
- [ ] Stories aligned with epic goals

#### 6.3 First Epic Completeness

- [ ] First epic includes all necessary setup steps
- [ ] Project scaffolding and initialization addressed
- [ ] Core infrastructure setup included
- [ ] Development environment setup addressed
- [ ] Local testability established early

---

### 7. Technical Guidance

**Checks (3 subsections):**

#### 7.1 Architecture Guidance

- [ ] Initial architecture direction provided
- [ ] Technical constraints clearly communicated
- [ ] Integration points identified
- [ ] Performance considerations highlighted
- [ ] Security requirements articulated
- [ ] Known areas of high complexity or technical risk flagged for architectural deep-dive

#### 7.2 Technical Decision Framework

- [ ] Decision criteria for technical choices provided
- [ ] Trade-offs articulated for key decisions
- [ ] Rationale for selecting primary approach over alternatives documented
- [ ] Non-negotiable technical requirements highlighted
- [ ] Areas requiring technical investigation identified
- [ ] Guidance on technical debt approach provided

#### 7.3 Implementation Considerations

- [ ] Development approach guidance provided
- [ ] Testing requirements articulated
- [ ] Deployment expectations set
- [ ] Monitoring needs identified
- [ ] Documentation requirements specified

---

### 8. Cross-Functional Requirements

**Checks (3 subsections):**

#### 8.1 Data Requirements

- [ ] Data entities and relationships identified
- [ ] Data storage requirements specified
- [ ] Data quality requirements defined
- [ ] Data retention policies identified
- [ ] Data migration needs addressed (if applicable)
- [ ] Schema changes planned iteratively, tied to stories requiring them

#### 8.2 Integration Requirements

- [ ] External system integrations identified
- [ ] API requirements documented
- [ ] Authentication for integrations specified
- [ ] Data exchange formats defined
- [ ] Integration testing requirements outlined

#### 8.3 Operational Requirements

- [ ] Deployment frequency expectations set
- [ ] Environment requirements defined
- [ ] Monitoring and alerting needs identified
- [ ] Support requirements documented
- [ ] Performance monitoring approach specified

---

### 9. Clarity & Communication

**Checks (2 subsections):**

#### 9.1 Documentation Quality

- [ ] Documents use clear, consistent language
- [ ] Documents well-structured and organized
- [ ] Technical terms defined where necessary
- [ ] Diagrams/visuals included where helpful
- [ ] Documentation versioned appropriately

#### 9.2 Stakeholder Alignment

- [ ] Key stakeholders identified
- [ ] Stakeholder input incorporated
- [ ] Potential areas of disagreement addressed
- [ ] Communication plan for updates established
- [ ] Approval process defined

---

## Final Validation Report

After completing all checks, generate comprehensive validation report:

### 1. Executive Summary

- **Overall PRD completeness:** Percentage (0-100%)
- **MVP scope appropriateness:** Too Large | Just Right | Too Small
- **Readiness for architecture phase:** Ready | Nearly Ready | Not Ready
- **Most critical gaps or concerns:** Bullet list

### 2. Category Analysis Table

| Category                         | Status | Critical Issues |
| -------------------------------- | ------ | --------------- |
| 1. Problem Definition & Context  | _TBD_  |                 |
| 2. MVP Scope Definition          | _TBD_  |                 |
| 3. User Experience Requirements  | _TBD_  |                 |
| 4. Functional Requirements       | _TBD_  |                 |
| 5. Non-Functional Requirements   | _TBD_  |                 |
| 6. Epic & Story Structure        | _TBD_  |                 |
| 7. Technical Guidance            | _TBD_  |                 |
| 8. Cross-Functional Requirements | _TBD_  |                 |
| 9. Clarity & Communication       | _TBD_  |                 |

**Status Legend:**

- **PASS:** 90%+ complete (green light)
- **PARTIAL:** 60-89% complete (needs improvement)
- **FAIL:** <60% complete (blocker)

### 3. Top Issues by Priority

**BLOCKERS (Must fix before architect can proceed):**

- Issue 1
- Issue 2

**HIGH (Should fix for quality):**

- Issue 1
- Issue 2

**MEDIUM (Would improve clarity):**

- Issue 1

**LOW (Nice to have):**

- Issue 1

### 4. MVP Scope Assessment

- Features that might be cut for true MVP
- Missing features that are essential
- Complexity concerns
- Timeline realism

### 5. Technical Readiness

- Clarity of technical constraints
- Identified technical risks
- Areas needing architect investigation

### 6. Recommendations

- Specific actions to address each blocker
- Suggested improvements
- Next steps

### 7. Final Decision

**READY FOR ARCHITECT:** The PRD and epics are comprehensive, properly structured, and ready for architectural design.

**NEEDS REFINEMENT:** The requirements documentation requires additional work to address identified deficiencies.

## After Report Presentation

Ask user if they want:

- Detailed analysis of any failed sections
- Suggestions for improving specific areas
- Help with refining MVP scope
- Guidance on addressing blockers

## Integration with Other Skills

**Called by:**

- `create-doc` - At end of PRD creation
- `new-product-prd` - Before completion
- `create-prd` - Before completion

**May trigger:**

- Refinement workflows if issues found
- Direct edits to PRD sections
- Follow-up validation after fixes

## Key Principles

1. **Comprehensive but Practical** - 60+ checks, but focus on critical gaps
2. **MVP-Oriented** - Challenge scope bloat aggressively
3. **Quality Gates** - Blockers must be addressed before architect handoff
4. **Actionable Feedback** - Specific recommendations, not just criticism
5. **Context-Aware** - Different projects have different needs

## Success Criteria

A successful pm-checklist execution produces:

1. **Complete Validation** - All 9 categories checked systematically
2. **Clear Status** - Pass/Partial/Fail for each category
3. **Prioritized Issues** - Blockers, High, Medium, Low
4. **Actionable Recommendations** - Specific fixes for each issue
5. **Go/No-Go Decision** - Ready for Architect vs Needs Refinement

## Example Activation

**From new-product-prd:**

```
new-product-prd: PRD creation complete, running pm-checklist
→ pm-checklist activates
→ Asks: Interactive or comprehensive mode?
→ Validates all 9 categories
→ Generates comprehensive report
→ Returns to new-product-prd with results
```

**Direct activation:**

```
User: "Is my PRD at docs/prd.md ready for the architect?"
→ pm-checklist activates
→ Loads docs/prd.md
→ Runs validation
→ Presents report with recommendations
```

## Notes

- This checklist is **comprehensive** - expect 15-30 minutes for full validation
- Focus on **blockers first** - other issues can be addressed later
- **MVP scope** is the most common failure point - challenge everything
- Not all checks apply to all projects - use judgment
- Results guide improvements, not just pass/fail judgment
