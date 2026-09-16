---
name: brownfield-prd-template
description: Brownfield PRD template structure for existing project enhancements. Defines structure for PRDs that add features to established codebases with emphasis on compatibility and integration.
---

# Brownfield PRD Template

## When to Use This Skill

Provides template structure for **brownfield enhancements** - adding significant features to existing codebases (4+ stories, architectural changes).

**Typical users:** `create-doc` skill or `create-prd` workflow skill

**Not for direct user interaction** - users should use `create-prd`

## Template Overview

The brownfield PRD template (`resources/brownfield-prd-tmpl.yaml`) emphasizes:

1. **Deep Project Analysis** - Existing project understanding required
2. **Compatibility Requirements** - Backward compatibility mandatory
3. **Integration Focus** - How enhancement integrates with existing system
4. **Risk Assessment** - Technical debt and integration risks
5. **Incremental Sequencing** - Stories minimize risk to existing system

## Key Differences from Greenfield Template

**Unique to Brownfield:**

- **Intro Project Analysis** section (existing project overview, documentation analysis)
- **Compatibility Requirements** subsection (CR1-CR4: API, database, UI, integration compatibility)
- **Integration Verification** in stories (IV1-IV3: existing functionality, integration points, performance)
- **Risk Assessment** incorporates technical debt
- **Single epic approach** (unless multiple unrelated enhancements)

**De-emphasized in Brownfield:**

- Technical Assumptions (becomes Technical Constraints based on existing stack)
- Epic List (usually single epic, so less planning needed)

## Template Structure

### Section 1: Intro Project Analysis and Context

**Purpose:** Establish existing project understanding BEFORE requirements

**Critical Guidance:**

- MUST assess enhancement complexity first
- If simple (1-2 sessions) → Recommend brownfield-story instead
- If medium (1-3 stories) → Recommend create-epic instead
- Check for document-existing-project output
- Analyze existing documentation
- Confirm understanding with user before proceeding

**Subsections:**

- Existing Project Overview (analysis source, current state)
- Available Documentation Analysis
- Enhancement Scope Definition (type, description, impact assessment)
- Goals and Background Context
- Change Log — four columns (`Date`, `Version`, `Description`, `Author`), append-only, newest row
  last, nested as `### Change Log` under §1. Canonical format:
  `references/document-change-log.md`

### Section 2: Requirements (MANDATORY ELICITATION)

**Emphasis:** Integration with existing system, backward compatibility

**Subsections:**

- Functional Requirements (FR) - with integration awareness
- Non-Functional Requirements (NFR) - existing system constraints
- **Compatibility Requirements (CR)** - UNIQUE TO BROWNFIELD:
  - CR1: Existing API compatibility
  - CR2: Database schema compatibility
  - CR3: UI/UX consistency
  - CR4: Integration compatibility

**Examples:**

```
FR1: The existing Todo List will integrate with the new AI duplicate
     detection service without breaking current functionality.

NFR1: Enhancement must maintain existing performance characteristics
      and not exceed current memory usage by more than 20%.

CR1: All existing API endpoints must remain functional with identical
     request/response formats.
```

### Section 3: UI Enhancement Goals (conditional)

**Condition:** Only if enhancement includes UI changes

**Focus:**

- Integration with existing UI patterns
- Modified/new screens only (not complete redesign)
- UI consistency requirements
- Design system adherence

### Section 4: Technical Constraints and Integration Requirements

**Replaces "Technical Assumptions" from greenfield**

**Purpose:** Document existing tech stack and integration approach

**Subsections:**

- Existing Technology Stack (from document-existing-project or analysis)
- Integration Approach (database, API, frontend, testing)
- Code Organization and Standards (how new code fits existing patterns)
- Deployment and Operations (build, deployment, monitoring, config)
- Risk Assessment and Mitigation (technical debt, integration risks, deployment risks)

**If document-existing-project available:**

- Extract from "Actual Tech Stack" table
- Reference "Technical Debt and Known Issues"
- Include "Workarounds and Gotchas"

### Section 5: Epic and Story Structure (MANDATORY ELICITATION)

**Brownfield Principle:** Single comprehensive epic unless multiple unrelated enhancements

**Guidance:**

- Assess epic structure with user
- Present rationale based on project analysis
- Confirm: "Does this align with your understanding of the work required?"

### Section 6: Epic Details (MANDATORY per epic)

**CRITICAL BROWNFIELD STORY SEQUENCING:**

**Rules:**

- Stories MUST ensure existing functionality remains intact
- Each story MUST verify existing features still work
- Sequence to minimize risk to existing system
- Include rollback considerations
- Incremental integration (not big-bang)
- AI-agent-sized in existing codebase context

**Story Structure:**

- User story (As a...I want...So that...)
- Acceptance Criteria (new functionality + existing system integrity)
- **Integration Verification (IV)** - UNIQUE TO BROWNFIELD:
  - IV1: Existing functionality verification
  - IV2: Integration point verification
  - IV3: Performance impact verification

**Confirmation Required:**
"This story sequence is designed to minimize risk to your existing system.
Does this order make sense given your project's architecture and constraints?"

## Template Metadata

**From `resources/brownfield-prd-tmpl.yaml`:**

```yaml
template:
  id: brownfield-prd-template-v2
  name: Brownfield Enhancement PRD
  version: 2.0
  output:
    format: markdown
    filename: docs/prd.md
    title: '{{project_name}} Brownfield Enhancement PRD'

workflow:
  mode: interactive
  elicitation: advanced-elicitation
```

## Key Design Principles

### 1. Deep Analysis Required

- Cannot proceed without understanding existing project
- Every recommendation grounded in actual analysis
- Confirm understanding at every step

### 2. Compatibility First

- Backward compatibility mandatory
- Existing functionality protected
- Integration verification explicit

### 3. Risk-Aware Planning

- Technical debt incorporated
- Integration risks identified
- Mitigation strategies defined
- Rollback procedures planned

### 4. Incremental Integration

- Stories sequenced for lowest risk
- Gradual rollout approach
- No big-bang changes
- Each story validates existing functionality

### 5. Technical Debt Awareness

- Acknowledge existing debt
- Plan for working around constraints
- Don't make debt worse

## Integration with Other Skills

**Used by:**

- `create-prd` - Primary consumer
- `create-doc` - Execution engine

**References:**

- `pm-checklist` - Validation
- `document-existing-project` - Existing project analysis (if available)

## Common Patterns

### Pattern 1: Document-Project Available

```
1. Check for document-existing-project output
2. Extract tech stack from "Actual Tech Stack" table
3. Reference "Technical Debt and Known Issues"
4. Use "Workarounds and Gotchas" in risk assessment
5. Pre-populate Technical Constraints section
```

### Pattern 2: IDE-Based Analysis

```
1. Explore project structure
2. Identify tech stack from files
3. Analyze architecture patterns
4. Note integration points
5. Document findings in Existing Project Overview
```

### Pattern 3: Single Epic Structure

```
1. Assess enhancement scope
2. Determine single epic appropriate
3. Document rationale
4. Create comprehensive story breakdown
5. Emphasize incremental integration
```

## Success Criteria

A successful brownfield PRD using this template produces:

1. **Deep project understanding** - Existing architecture analyzed
2. **Comprehensive compatibility requirements** - Backward compatibility ensured
3. **Risk-aware planning** - Technical debt incorporated
4. **Incremental story sequencing** - Risk minimization approach
5. **Integration verification** - Existing functionality protected
6. **Quality validated** - Passed pm-checklist

## Notes

- This template emphasizes existing system analysis over greenfield planning
- Compatibility Requirements section is mandatory for brownfield
- Integration Verification in stories is unique to brownfield
- Single epic approach is typical (not multiple epics)
- Technical debt must be incorporated into risk assessment
- Users interact with `create-prd`, not this template directly
