# Review Task Skill

**Interactive** comprehensive task document review that asks clarifying questions instead of making assumptions. Identifies inaccuracies, gaps, inconsistencies, and implementation issues through collaborative user input.

## Key Features

🎯 **Interactive Review** - Asks clarifying questions rather than making assumptions
🤝 **User-Aligned** - Recommendations based on your vision and decisions
🔍 **Comprehensive Analysis** - 7-step review process with anti-hallucination detection
📊 **Batched Questions** - 3 question points (max 4 questions each) for efficient clarification
✅ **Actionable Output** - Specific fixes aligned with user's intent
🛠️ **Implementation-Ready** - Verifies task has enough detail for developer handoff

## Quick Start

```bash
# Basic usage - review a task document
/review-task task.50.expired-otp-auto-regeneration.md

# Quick review (10-20 min)
/review-task task.42.notifications.md --depth quick

# Thorough review (45-60+ min)
/review-task task.55.critical-feature.md --depth thorough
```

## Interactive Review Process

Unlike traditional code review tools, `/review-task` **asks clarifying questions** instead of making assumptions:

### When Questions Are Asked

The skill asks questions when it encounters:

- **Ambiguities**: Vague implementation steps ("update service" - which methods?)
- **Conflicts**: Task contradicts architecture (REST vs GraphQL?)
- **Gaps**: Missing details (no file paths, unclear changes)
- **Hallucinations**: Technology not in docs (library not in package.json?)
- **Technical Decisions**: Choice between approaches (caching strategy?)

### Question Batching Strategy

Questions are asked in **3 batched rounds** (max 4 questions per round):

1. **After Step 1**: Structure, scope, and metadata questions
2. **After Steps 2-3**: Technical accuracy & implementation clarity questions
3. **After Steps 4-5**: Completeness, risk, and rollback questions

This minimizes interruptions while ensuring all issues are clarified.

### Example Question

```
Q: "Phase 2 lists 'auth-service.ts' but doesn't specify client or server.
    Which path is correct?"

Options:
  [Server path]    - apps/{api-service}/src/modules/auth/auth-service.ts (NestJS)
  [Client path]    - apps/{app-name}/src/services/auth-service.ts (React Native)
  [Both needed]    - Changes required in both client and server
```

### Your Answers Drive Recommendations

All recommendations in the final report are based on **your decisions**, not AI assumptions:

- ✅ "Update `apps/{api-service}/src/modules/auth/auth-service.ts`" - _Per user decision_
- ✅ "Use REST endpoints per architecture standard" - _Per user decision_
- ❌ NOT: "Recommend using GraphQL" (without asking first)

## What It Does

The review-task skill performs a 7-step comprehensive analysis:

1. **Template Structure Compliance** - Verifies all required sections present
2. **Technical Accuracy & Anti-Hallucination** - Detects invented technologies
3. **Implementation Plan Completeness** - Ensures phases are detailed and actionable
4. **Consistency & Completeness** - Finds contradictions and gaps
5. **Risk Assessment Review** - Evaluates risk identification and mitigation
6. **Report Generation** - Creates actionable recommendations with user decisions
7. **Implementation Readiness Scoring** - GO/NO-GO recommendation (1-10 scale)

## Output

Generates a comprehensive review report:

```
[task-directory]/task.{n}.review.{descriptive-name}.md
```

Report includes:

- **Executive Summary** - Quick overview of findings
- **User Decisions Section** - Documents all clarifications made
- **Issue Categories** - Critical, Important, Optional
- **Hallucination Detection** - Invented technical details
- **Gap Analysis** - Missing implementation details
- **Consistency Report** - Internal contradictions
- **Implementation Readiness Score** - 1-10 rating
- **Actionable Recommendations** - Specific fixes based on user input

## Issue Severity Levels

### 🚨 Critical (Must Fix)

- Missing implementation details (vague "update service")
- Invented libraries/APIs not in tech stack
- Missing database schema for schema changes
- No rollback plan for high-risk changes
- Major inconsistencies between sections

**Impact**: Blocks implementation or causes major issues

### ⚠️ Important (Should Fix)

- Incomplete test coverage
- Unclear file paths
- Missing risk mitigation
- Vague success criteria
- Insufficient phase details

**Impact**: Affects quality or maintainability

### 💡 Optional (Nice to Have)

- Additional helpful context
- More detailed rationale
- Enhanced documentation

**Impact**: Improves clarity or completeness

## Common Use Cases

### 1. Pre-Implementation Review

"Before starting task 50, check it for issues"

- Ensures task is ready for development
- Catches problems before they become code issues
- Validates implementation plan clarity

### 2. Quality Audit

"Review all tasks in the database migration category"

- Ensures consistency across related tasks
- Validates standard adherence
- Checks for missing rollback plans

### 3. Post-Mortem Analysis

"Task 42 went off-track. Why?"

- Analyzes task gaps that led to implementation issues
- Identifies missing or unclear requirements
- Improves future task writing

### 4. Architecture Validation

"New architecture standards published. Review task 55"

- Verifies task accuracy against new standards
- Checks for deprecated patterns
- Ensures compliance with updated guidelines

### 5. Developer Handoff Check

"Is this task ready for the team to start?"

- Validates implementation readiness
- Ensures sufficient detail for developers
- Checks for blocking ambiguities

## Anti-Hallucination Detection

The review skill rigorously detects:

- **Invented Technologies** - Libraries/frameworks not in tech stack
- **Incorrect Paths** - Files that don't match project structure
- **Wrong Patterns** - Code patterns not documented in architecture
- **Invalid APIs** - Endpoints that don't match API specs
- **Schema Errors** - Database fields not in Prisma schema

**Example Detection**:

```markdown
#### Critical (Hallucination)

- **Invented Library**: Task mentions "react-native-super-auth"
  - **Location:** Phase 2, auth-service.ts modifications
  - **Issue:** Library not in package.json or tech-stack.md
  - **Recommendation:** Use documented authentication library (per user decision)
```

## Review Depths

### Quick (10-20 minutes)

- Critical issues only
- Template compliance
- Major hallucinations
- High-level gaps

**Use when**: Quick sanity check, time-constrained

### Standard (30-45 minutes) - DEFAULT

- All 7 steps fully executed
- Comprehensive issue detection
- Actionable recommendations
- Full report

**Use when**: Normal pre-implementation review, quality gate

### Thorough (45-60+ minutes)

- Deep analysis with source verification
- Detailed implementation review
- Comprehensive recommendations
- Cross-task consistency checks

**Use when**: Critical task, high risk, complex changes, quality audit

## Integration with Other Skills

### Complements

- `/create-task` - Task creation workflow
- `/qa-technical-task` - QA review for tasks
- `/develop` - Implementation guidance

### Differences from review-story

| Feature | review-task | review-story |
|---------|------------|--------------|
| **Target** | Technical implementation tasks | User stories |
| **Focus** | Implementation details, phases, rollback | Requirements, ACs, Dev Notes |
| **Depth** | Technical accuracy, code paths | Epic alignment, testing coverage |
| **Questions** | File locations, tech decisions, risks | Scope, technical approaches, ACs |

## Tips for Best Results

1. **Run Before Starting** - Catch issues early before implementation
2. **Use Standard Depth** - Best balance of speed and thoroughness
3. **Act on Critical Issues** - Don't ignore must-fix items
4. **Review the Report** - Not just the summary scores
5. **Iterate** - Fix issues and re-review if needed
6. **Answer Questions Thoughtfully** - Your decisions drive recommendations

## Success Metrics

A task is ready when review shows:

- ✅ No critical issues
- ✅ Minimal important issues (< 3)
- ✅ Implementation readiness score ≥ 8/10
- ✅ All file paths are complete and accurate
- ✅ All phases have detailed, actionable changes
- ✅ Testing and rollback plans are adequate
- ✅ Clear, specific implementation guidance

## Resources

- Task template: `resources/task-template.md`
- Architecture docs: `docs/architecture/`

## See Also

- `/create-task` - Create new task documents
- `/qa-technical-task` - QA review for tasks
- `/review-story` - Review story documents
- `/develop` - Implement tasks
