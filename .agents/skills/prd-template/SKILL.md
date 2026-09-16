---
name: prd-template
description: Greenfield PRD template structure and guidance. Defines the complete structure for Product Requirements Documents for new products from scratch.
---

# Greenfield PRD Template

## When to Use This Skill

This skill provides the template structure for creating Product Requirements Documents (PRDs) for **greenfield projects** - new products or features built from scratch without existing codebase constraints.

**Typical users:** The `create-doc` skill or `new-product-prd` workflow skill

**Not for:**

- Brownfield enhancements (use `brownfield-prd-template` instead)
- Direct user interaction (users should interact with `new-product-prd`)

## Template Overview

The greenfield PRD template (`resources/prd-tmpl.yaml`) provides a comprehensive structure for defining:

1. **Goals and Background Context** - Product vision and objectives
2. **Requirements** - Functional and non-functional requirements
3. **UI Design Goals** - High-level UX/UI vision
4. **Technical Assumptions** - Technology stack and architectural constraints
5. **Epic List** - High-level epic overview for user approval
6. **Epic Details** - Detailed epic goals with user stories and acceptance criteria
7. **Checklist Results** - PM checklist validation report
8. **Next Steps** - Handoff prompts for UX Expert and Architect

## Template Structure

### Section 1: Goals and Background Context

**Purpose:** Establish product vision and foundation

**Subsections:**

- **Goals:** Bullet list of desired outcomes
- **Background Context:** 1-2 paragraphs explaining what this solves and why
- **Change Log:** Version tracking table — four columns (`Date`, `Version`, `Description`, `Author`),
  append-only, newest row last, nested as `### Change Log` under §1. Canonical format:
  `references/document-change-log.md`

**Critical Guidance:**

- Strongly recommend Project Brief first (provides problem statement, target users, success metrics, MVP scope)
- If no brief exists, gather this information during Goals section
- Goals must be specific and measurable
- Background provides context without redundancy with goals

### Section 2: Requirements

**Purpose:** Define what the product must do

**Subsections:**

- **Functional Requirements (FR):** Numbered list with FR prefix (e.g., FR1, FR2)
- **Non-Functional Requirements (NFR):** Numbered list with NFR prefix (e.g., NFR1, NFR2)

**Elicitation:** YES - Mandatory user interaction

**Key Principles:**

- Focus on WHAT not HOW
- Each requirement testable and verifiable
- Use specific, unambiguous language
- MVP-focused (minimal scope)

**Examples:**

```
FR6: The Todo List uses AI to detect and warn against potentially
     duplicate todo items that are worded differently.

NFR1: AWS service usage must aim to stay within free-tier limits
      where feasible.
```

### Section 3: UI Design Goals

**Purpose:** High-level UX/UI vision to guide Design Architect

**Condition:** Only included if PRD has UX/UI requirements

**Subsections:**

- Overall UX Vision
- Key Interaction Paradigms
- Core Screens and Views (conceptual high-level)
- Accessibility (None|WCAG AA|WCAG AAA|Custom)
- Branding (style guides, brand elements)
- Target Platforms (Web|Mobile|Desktop|Cross-Platform)

**Elicitation:** YES - Mandatory user interaction

**Process:**

1. Pre-fill all subsections with educated guesses
2. Present complete section
3. Clearly indicate where assumptions were made
4. Ask targeted questions for unclear elements
5. Focus on product vision, not detailed UI spec

**Examples:**

```
Core Screens:
- Login Screen
- Main Dashboard
- Item Detail Page
- Settings Page

Branding:
- Replicate the look and feel of early 1900s black and white cinema,
  including animated effects replicating film damage or projector
  glitches during page or state transitions.
```

### Section 4: Technical Assumptions

**Purpose:** Guide Architect with technical decisions

**Subsections:**

- Repository Structure (Monorepo|Polyrepo|Multi-repo)
- Service Architecture (Monolith|Microservices|Serverless)
- Testing Requirements (Unit Only|Unit + Integration|Full Pyramid)
- Additional Technical Assumptions

**Elicitation:** YES - Mandatory user interaction

**Process:**


1. Check for an attached technical-preferences file to pre-populate
2. Ask user about: languages, frameworks, starter templates, libraries, APIs, deployment
3. Offer guidance based on project goals and MVP scope
4. Document ALL choices with rationale
5. These become constraints for Architect

**Critical Decisions:**

- Repository structure impacts tooling and workflow
- Service architecture affects scalability and complexity
- Testing requirements define quality standards

### Section 5: Epic List

**Purpose:** High-level epic overview for user approval before detailing

**Elicitation:** YES - Mandatory user interaction

**Critical Rules:**

- Epics MUST be logically sequential (Agile best practices)
- Each epic delivers significant, deployable, testable functionality
- **Epic 1 must establish foundation** (project setup, Git, CI/CD, core services) PLUS initial functionality (even if simple like health-check route)
- Each subsequent epic builds on previous epics
- Not every project needs multiple epics (epics must deliver value)
- Err on side of fewer epics
- Cross-cutting concerns flow through epics (not final stories)

**Examples:**

```
Epic 1: Foundation & Core Infrastructure
  Establish project setup, authentication, and basic user management

Epic 2: Core Business Entities
  Create and manage primary domain objects with CRUD operations

Epic 3: User Workflows & Interactions
  Enable key user journeys and business processes

Epic 4: Reporting & Analytics
  Provide insights and data visualization for users
```

### Section 6: Epic Details (Repeatable)

**Purpose:** Detailed epic specifications with stories

**Elicitation:** YES - Mandatory user interaction (per epic)

**Repeatable:** YES - One instance per epic

**Structure:**

```
[Epic {{epic_number}}] {{epic_title}}
  Epic Goal: 2-3 sentences describing objective and value

  [Story {{epic_number}}.{{story_number}}] {{story_title}}
    As a {{user_type}},
    I want {{action}},
    so that {{benefit}}.

    Acceptance Criteria:
    1. {{criterion}}
    2. {{criterion}}
    ...
```

**Critical Story Sequencing Requirements:**

- Stories MUST be logically sequential within each epic
- Each story is a "vertical slice" delivering complete functionality
- No story depends on work from later story or epic
- Identify direct prerequisite stories
- Focus on "what" and "why" not "how"
- Each story delivers clear user or business value
- **Size for AI agents:** 2-4 hours, single focused session (think "junior developer")
- If complex, break down further (while maintaining vertical slice)

**Acceptance Criteria Requirements:**

- Precisely define "done" from functional perspective
- Unambiguous and testable
- Include critical non-functional requirements from PRD
- Consider local testability for backend/data components
- Specify UI/UX requirements and framework adherence
- Avoid cross-cutting concerns (should be in other stories or PRD)

### Section 7: Checklist Results Report

**Purpose:** Validate PRD quality before architect handoff

**Process:**

1. Offer to output full updated PRD
2. Confirm with user
3. Execute `pm-checklist` skill
4. Populate results in this section

**Content:** PM checklist validation report with 9 category analysis

### Section 8: Next Steps

**Purpose:** Clear handoffs to next phase

**Subsections:**

- **UX Expert Prompt:** Short prompt to initiate UX design using PRD
- **Architect Prompt:** Short prompt to initiate architecture design using PRD

**Keep concise and action-oriented**

## Template Metadata

**From `resources/prd-tmpl.yaml`:**

```yaml
template:
  id: prd-template-v2
  name: Product Requirements Document
  version: 2.0
  output:
    format: markdown
    filename: docs/prd.md
    title: "{{project_name}} Product Requirements Document (PRD)"

workflow:
  mode: interactive
  elicitation: advanced-elicitation
```

## Key Design Principles

### 1. MVP-First Approach

- Every section emphasizes minimal viable scope
- Challenges "nice-to-haves" vs "must-haves"
- Recommends Project Brief first for foundational clarity

### 2. Logical Sequencing

- Epic 1 = Foundation + initial functionality
- Subsequent epics build incrementally
- Cross-cutting concerns integrated throughout (not isolated at end)

### 3. AI-Agent-Sized Stories

- Stories must be completable in 2-4 hours by AI agent
- Small, focused, self-contained vertical slices
- Avoids context overflow in AI agent execution

### 4. Testability Focus

- All requirements testable and verifiable
- Acceptance criteria precise and unambiguous
- Local testability for backend/data components

### 5. Collaborative Creation

- Elicitation stops at critical decision points
- User validation required for requirements, UI goals, technical assumptions, epics
- Detailed rationale provided for all AI-drafted content

## Integration with Other Skills

**Used by:**

- `new-product-prd` - User-facing entry point (greenfield)
- `create-prd` (mode=greenfield) - Orchestrator invoked by `new-product-prd`
- `create-doc` - Execution engine

**References:**

- `pm-checklist` - Validation before completion
- `elicitation-methods` - Interactive methods for elicit sections

## Common Patterns

### Pattern 1: Standard Greenfield Flow

```
1. User wants PRD for new product
2. new-product-prd activates (user-facing entry point)
3. new-product-prd delegates to create-prd with mode=greenfield
4. create-prd calls create-doc with prd-template
5. create-doc processes template section by section
6. At completion, create-prd runs pm-checklist
7. create-prd outputs UX Expert and Architect prompts
```

### Pattern 2: Epic Expansion

```
Epic Details section is repeatable:
- Present Epic 1 details with all stories
- User validates
- Present Epic 2 details with all stories
- User validates
- Continue for all epics
```

### Pattern 3: Technical Pre-Population

```
1. Check for an attached technical-preferences file
2. Pre-fill Technical Assumptions section
3. Present to user with "pre-populated from preferences" note
4. User confirms or modifies
```

## Success Criteria

A successful PRD using this template produces:

1. **Clear product vision** - Goals and background well-articulated
2. **Comprehensive requirements** - Functional and non-functional complete
3. **UX guidance** - High-level vision for design phase
4. **Technical constraints** - Clear guidance for architect
5. **Logical epic structure** - Sequential, value-delivering increments
6. **AI-agent-sized stories** - 2-4 hour focused sessions
7. **Quality validated** - Passed pm-checklist
8. **Ready for handoff** - UX and Architect prompts prepared

## Notes

- This template is optimized for greenfield projects
- Brownfield projects should use `brownfield-prd-template`
- Template structure is rigid, content is flexible
- Elicitation points are mandatory for quality
- Users interact with `new-product-prd`, not this template directly
