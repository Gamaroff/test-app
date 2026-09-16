---
name: qa-planning
description: Use for upfront test planning and risk assessment before/during development. Provides risk profiling (probability × impact) and comprehensive test design (test levels, priorities, scenarios) to guide quality-focused implementation.
---

# QA Planning

Proactive quality assurance through risk assessment and test strategy design. Use this skill when planning implementation to identify risks early and design comprehensive test coverage.

## When to Use This Skill

- **Before Development**: Planning test strategy for upcoming stories
- **During Sprint Planning**: Assessing risks for proposed features
- **Architecture Review**: Identifying technical/security risks in designs
- **Test Design**: Creating comprehensive test scenarios with appropriate levels and priorities

**Related Skills**:

- After planning, use `qa-story` skill for story review and NFR assessment
- Use `qa-gate` skill to create quality gate decisions based on assessments

---

## Risk Profiling

Generate comprehensive risk assessment matrices for story implementation using probability × impact analysis.

### Risk Assessment Framework

#### Risk Categories

All risks must use these category prefixes:

- **TECH**: Technical Risks (architecture, integration, technical debt, scalability, dependencies)
- **SEC**: Security Risks (auth/authz, data exposure, injection, session management, crypto)
- **PERF**: Performance Risks (response time, throughput, resource exhaustion, queries, caching)
- **DATA**: Data Risks (data loss, corruption, privacy, compliance, backup/recovery)
- **BUS**: Business Risks (user needs, revenue, reputation, regulatory, market timing)
- **OPS**: Operational Risks (deployment, monitoring, incident response, documentation, knowledge transfer)

### Risk Analysis Process

#### Step 1: Risk Identification

For each category, identify specific risks:

```yaml
risk:
  id: "SEC-001" # Use category prefixes
  category: security
  title: "Insufficient input validation on user forms"
  description: "Form inputs not properly sanitized could lead to XSS attacks"
  affected_components:
    - "UserRegistrationForm"
    - "ProfileUpdateForm"
  detection_method: "Code review revealed missing validation"
```

**Interactive Elicitation** (when user context is unclear):

Use AskUserQuestion to gather risk context:

- Which components are most critical for this story?
- What are the highest-value targets for attackers?
- Which failure scenarios would have the most business impact?
- Are there any regulatory/compliance requirements?

#### Step 2: Risk Assessment

Evaluate each risk using probability × impact:

**Probability Levels:**

- `High (3)`: Likely to occur (>70% chance)
- `Medium (2)`: Possible occurrence (30-70% chance)
- `Low (1)`: Unlikely to occur (<30% chance)

**Impact Levels:**

- `High (3)`: Severe consequences (data breach, system down, major financial loss)
- `Medium (2)`: Moderate consequences (degraded performance, minor data issues)
- `Low (1)`: Minor consequences (cosmetic issues, slight inconvenience)

**Risk Score = Probability × Impact**

- **9**: Critical Risk (Red) - Immediate attention required
- **6**: High Risk (Orange) - Must address before release
- **4**: Medium Risk (Yellow) - Should address soon
- **2-3**: Low Risk (Green) - Monitor and track
- **1**: Minimal Risk (Blue) - Acknowledge and document

#### Step 3: Risk Prioritization

Create risk matrix:

```markdown
## Risk Matrix

| Risk ID  | Description             | Probability | Impact     | Score | Priority |
| -------- | ----------------------- | ----------- | ---------- | ----- | -------- |
| SEC-001  | XSS vulnerability       | High (3)    | High (3)   | 9     | Critical |
| PERF-001 | Slow query on dashboard | Medium (2)  | Medium (2) | 4     | Medium   |
| DATA-001 | Backup failure          | Low (1)     | High (3)   | 3     | Low      |
```

#### Step 4: Risk Mitigation Strategies

For each identified risk, provide mitigation:

```yaml
mitigation:
  risk_id: "SEC-001"
  strategy: "preventive" # preventive|detective|corrective
  actions:
    - "Implement input validation library (e.g., validator.js)"
    - "Add CSP headers to prevent XSS execution"
    - "Sanitize all user inputs before storage"
    - "Escape all outputs in templates"
  testing_requirements:
    - "Security testing with OWASP ZAP"
    - "Manual penetration testing of forms"
    - "Unit tests for validation functions"
  residual_risk: "Low - Some zero-day vulnerabilities may remain"
  owner: "dev"
  timeline: "Before deployment"
```

### Risk Profiling Outputs

#### Output 1: Gate YAML Block

Generate for pasting into gate file under `risk_summary`:

**Output Rules:**

- Only include assessed risks; do not emit placeholders
- Sort risks by score (descending) when emitting highest and any tabular lists
- If no risks: totals all zeros, omit highest, keep recommendations arrays empty

```yaml
# risk_summary (paste into gate file):
risk_summary:
  totals:
    critical: 1 # score 9
    high: 0 # score 6
    medium: 1 # score 4
    low: 1 # score 2-3
  highest:
    id: SEC-001
    score: 9
    title: "XSS on profile form"
  recommendations:
    must_fix:
      - "Add input sanitization & CSP"
    monitor:
      - "Add security alerts for auth endpoints"
```

#### Output 2: Markdown Risk Report

**Save to:** `{storyDirectory}/story.{epic}.{story}.risk.1.{story-name}.md`

- If re-running planning (rare): increment to `.risk.2.`, `.risk.3.` etc.
- For tasks: `{taskDirectory}/task.{id}.risk.1.{task-name}.md`

```markdown
# Risk Profile: Story {epic}.{story}

Date: {date}
Reviewer: QA Engineer

## Executive Summary

- Total Risks Identified: 3
- Critical Risks: 1
- High Risks: 0
- Risk Score: 80/100 (calculated)

## Critical Risks Requiring Immediate Attention

### 1. SEC-001: XSS Vulnerability

**Score: 9 (Critical)**
**Probability**: High - No validation currently implemented
**Impact**: High - Could compromise user data and session tokens
**Mitigation**:

- Implement validator.js for all form inputs
- Add CSP headers in middleware
- Sanitize data before database storage
  **Testing Focus**:
- OWASP ZAP automated scan
- Manual XSS payload testing
- Unit tests for validation functions

## Risk Distribution

### By Category

- Security: 1 risks (1 critical)
- Performance: 1 risks (0 critical)
- Data: 1 risks (0 critical)

### By Component

- Frontend Forms: 2 risks
- Backend API: 1 risks

## Detailed Risk Register

[Full table of all risks with scores and mitigations]

## Risk-Based Testing Strategy

### Priority 1: Critical Risk Tests

- XSS injection attempts on all user input fields
- CSP violation detection tests
- Authentication bypass attempts

### Priority 2: High Risk Tests

- Load testing for performance risks
- Data integrity validation tests

### Priority 3: Medium/Low Risk Tests

- Standard functional tests
- Regression test suite

## Risk Acceptance Criteria

### Must Fix Before Production

- All critical risks (score 9)
- High risks affecting security/data

### Can Deploy with Mitigation

- Medium risks with compensating controls
- Low risks with monitoring in place

### Accepted Risks

- Document any risks team accepts
- Include sign-off from appropriate authority

## Monitoring Requirements

Post-deployment monitoring for:

- Security alerts for authentication endpoints
- Performance metrics for slow queries
- Error rates for data operations
- Business KPIs for user experience

## Risk Review Triggers

Review and update risk profile when:

- Architecture changes significantly
- New integrations added
- Security vulnerabilities discovered
- Performance issues reported
- Regulatory requirements change
```

#### Output 3: Story Hook Line

**Print this line for qa-story skill to reference:**

```text
Risk profile: {storyDirectory}/story.{epic}.{story}.risk.1.{story-name}.md
```

### Risk Scoring Algorithm

Calculate overall story risk score:

```text
Base Score = 100
For each risk:
  - Critical (9): Deduct 20 points
  - High (6): Deduct 10 points
  - Medium (4): Deduct 5 points
  - Low (2-3): Deduct 2 points

Minimum score = 0 (extremely risky)
Maximum score = 100 (minimal risk)
```

### Risk-Based Recommendations

Based on risk profile, recommend:

1. **Testing Priority**
   - Which tests to run first
   - Additional test types needed
   - Test environment requirements

2. **Development Focus**
   - Code review emphasis areas
   - Additional validation needed
   - Security controls to implement

3. **Deployment Strategy**
   - Phased rollout for high-risk changes
   - Feature flags for risky features
   - Rollback procedures

4. **Monitoring Setup**
   - Metrics to track
   - Alerts to configure
   - Dashboard requirements

### Integration with Quality Gates

**Deterministic gate mapping:**

- Any risk with score ≥ 9 → Gate = FAIL (unless waived)
- Else if any score ≥ 6 → Gate = CONCERNS
- Else → Gate = PASS
- Unmitigated risks → Document in gate

---

## Test Design

Create comprehensive test scenarios with appropriate test level recommendations for story implementation.

### Purpose

Design a complete test strategy that identifies what to test, at which level (unit/integration/e2e), and why. This ensures efficient test coverage without redundancy while maintaining appropriate test boundaries.

### Test Design Process

#### Step 1: Analyze Story Requirements

Break down each acceptance criterion into testable scenarios. For each AC:

- Identify the core functionality to test
- Determine data variations needed
- Consider error conditions
- Note edge cases

**Interactive Elicitation** (when requirements are unclear):

Use AskUserQuestion to clarify:

- Which acceptance criteria are most critical?
- What are the expected data volumes?
- What edge cases should we consider?
- Are there specific performance/security requirements?

#### Step 2: Apply Test Level Framework

**Test Level Decision Criteria:**

**Unit Tests** - Use when:

- Pure logic, algorithms, calculations
- No external dependencies (DB, API, file system)
- Fast execution (<10ms per test)
- Isolated component behavior
- Example: Validation functions, business logic, utility functions

**Integration Tests** - Use when:

- Component interactions matter
- Database operations involved
- Multiple services coordinating
- External API calls (mocked or real)
- Example: Service layer tests, repository tests, API endpoint tests

**E2E Tests** - Use when:

- Critical user journeys (login, checkout, payment)
- Compliance requirements mandate end-to-end validation
- UI behavior depends on multiple backend services
- Cross-system workflows
- Example: User registration flow, payment processing, report generation

**Quick Rules:**

- Prefer unit over integration
- Prefer integration over e2e
- Test once at the right level (avoid duplication)
- Critical paths deserve multiple levels

#### Step 3: Assign Priorities

**Priority Classification:**

**P0 (Blocker)** - Must pass before any release:

- Revenue-critical features (payments, transactions)
- Security features (authentication, authorization, encryption)
- Compliance requirements (regulatory, legal, audit)
- Data integrity (user data, financial records)

**P1 (Critical)** - Core user journeys:

- Primary user workflows
- Frequently used features
- Features impacting majority of users
- Core business functionality

**P2 (Important)** - Secondary features:

- Admin functions
- Less frequently used features
- Features impacting subset of users
- Nice-to-have functionality

**P3 (Optional)** - Low priority:

- Edge cases for rarely used features
- Cosmetic improvements
- Optional enhancements
- Future-proofing tests

**Interactive Elicitation** (when priority is unclear):

Use AskUserQuestion to determine:

- What's the business impact if this fails?
- How many users are affected?
- Is this required for launch or nice-to-have?
- Are there regulatory/compliance implications?

#### Step 4: Design Test Scenarios

For each identified test need, create:

```yaml
test_scenario:
  id: "{epic}.{story}-{LEVEL}-{SEQ}"
  requirement: "AC1: User can login with valid credentials"
  priority: P0
  level: integration
  description: "Verify authentication service validates credentials and creates session"
  justification: "Multi-component flow (controller → service → database → session store)"
  mitigates_risks: ["SEC-001", "DATA-002"] # Reference risk profile if exists
  test_data:
    - Valid user credentials
    - Invalid credentials
    - Expired credentials
  expected_outcomes:
    - Valid: Session created, JWT returned
    - Invalid: 401 error, no session
    - Expired: 401 error, prompt to reset
```

#### Step 5: Validate Coverage

Ensure:

- Every AC has at least one test
- No duplicate coverage across levels
- Critical paths have multiple levels
- Risk mitigations are addressed
- Edge cases explicitly covered

### Test Design Outputs

#### Output 1: Test Design Document

**Save to:** `{storyDirectory}/story.{epic}.{story}.test-design.1.{story-name}.md`

- If re-running planning (rare): increment to `.test-design.2.`, `.test-design.3.` etc.
- For tasks: `{taskDirectory}/task.{id}.test-design.1.{task-name}.md`

```markdown
# Test Design: Story {epic}.{story}

Date: {date}
Designer: QA Engineer

## Test Strategy Overview

- Total test scenarios: 15
- Unit tests: 8 (53%)
- Integration tests: 5 (33%)
- E2E tests: 2 (14%)
- Priority distribution: P0: 5, P1: 7, P2: 3

## Test Scenarios by Acceptance Criteria

### AC1: User can login with valid credentials

#### Scenarios

| ID           | Level       | Priority | Test                       | Justification            |
| ------------ | ----------- | -------- | -------------------------- | ------------------------ |
| 1.3-UNIT-001 | Unit        | P0       | Validate credential format | Pure validation logic    |
| 1.3-INT-001  | Integration | P0       | Service processes login    | Multi-component flow     |
| 1.3-E2E-001  | E2E         | P1       | User completes login flow  | Critical path validation |

### AC2: Invalid credentials return error

| ID           | Level       | Priority | Test                          | Justification         |
| ------------ | ----------- | -------- | ----------------------------- | --------------------- |
| 1.3-UNIT-002 | Unit        | P0       | Validate error handling logic | Pure error logic      |
| 1.3-INT-002  | Integration | P0       | Service rejects invalid creds | Auth service behavior |

[Continue for all ACs...]

## Risk Coverage

| Risk ID  | Mitigating Tests          |
| -------- | ------------------------- |
| SEC-001  | 1.3-UNIT-001, 1.3-INT-001 |
| DATA-002 | 1.3-INT-003, 1.3-INT-004  |

## Recommended Execution Order

1. P0 Unit tests (fail fast)
2. P0 Integration tests
3. P0 E2E tests
4. P1 tests in order
5. P2+ as time permits

## Test Environment Requirements

- PostgreSQL test database with sample users
- Redis instance for session testing
- Mock email service for password reset tests
- Test JWT signing keys (not production keys)

## Test Data Strategy

- Fixtures for common user scenarios
- Factory functions for test data generation
- Cleanup after each test suite
- Isolated data per test (no shared state)
```

#### Output 2: Gate YAML Block

Generate for inclusion in quality gate:

```yaml
test_design:
  scenarios_total: 15
  by_level:
    unit: 8
    integration: 5
    e2e: 2
  by_priority:
    p0: 5
    p1: 7
    p2: 3
  coverage_gaps: [] # List any ACs without tests
```

#### Output 3: Trace References

Print for use by qa-story skill (trace-requirements workflow):

```text
Test design matrix: {storyDirectory}/story.{epic}.{story}.test-design.1.{story-name}.md
P0 tests identified: 5
```

### Test Design Quality Checklist

Before finalizing, verify:

- [ ] Every AC has test coverage
- [ ] Test levels are appropriate (not over-testing)
- [ ] No duplicate coverage across levels
- [ ] Priorities align with business risk
- [ ] Test IDs follow naming convention `{epic}.{story}-{LEVEL}-{SEQ}`
- [ ] Scenarios are atomic and independent
- [ ] Test data requirements documented
- [ ] Risk coverage mapped (if risk profile exists)

### Test Design Principles

- **Shift left**: Prefer unit over integration, integration over E2E
- **Risk-based**: Focus on what could go wrong
- **Efficient coverage**: Test once at the right level
- **Maintainability**: Consider long-term test maintenance cost
- **Fast feedback**: Quick tests run first (unit → integration → e2e)
- **Isolation**: Each test independent and repeatable

---

## Integration with QA Workflow

### Workflow Sequence

1. **Risk Profiling** (this skill)
   - Identify risks early in development
   - Determine testing focus areas
   - Output: Risk report + Gate YAML block

2. **Test Design** (this skill)
   - Create comprehensive test scenarios
   - Assign appropriate test levels
   - Output: Test design document + Gate YAML block

3. **Story Review** (qa-story skill)
   - Review implementation against test design
   - Validate risk mitigations
   - Trace requirements to tests

4. **Quality Gate** (qa-gate skill)
   - Create gate decision using risk and test data
   - Provide PASS/CONCERNS/FAIL/WAIVED status

### Cross-Skill References

**From this skill to qa-story**:

- "See qa-story skill for comprehensive story review process"
- "Use qa-story skill to validate risk mitigations are implemented"
- "Reference qa-story skill for NFR assessment and requirements traceability"

**From this skill to qa-gate**:

- "See qa-gate skill for creating quality gate files"
- "Use qa-gate skill to formalize PASS/CONCERNS/FAIL decisions"

---

## Configuration and File Locations

### Expected Configuration


All file locations should be defined in skill resources or explicit file references:

```yaml
qa:
  qaLocation: "docs/qa" # Base directory for QA files
```

### File Naming Conventions

All qa-planning outputs are co-located in the story (or task) directory following the canonical naming convention:

**Risk Reports** (stories): `story.{epic}.{story}.risk.{num}.{story-name}.md`
**Test Design** (stories): `story.{epic}.{story}.test-design.{num}.{story-name}.md`

**Risk Reports** (tasks): `task.{id}.risk.{num}.{task-name}.md`
**Test Design** (tasks): `task.{id}.test-design.{num}.{task-name}.md`

`{num}` starts at 1 and increments if qa-planning is re-run for the same story.

### Directory Structure

```
story.312.1.user-authentication/
├── story.312.1.user-authentication.md
├── story.312.1.risk.1.user-authentication.md       ← qa-planning (pre-dev)
├── story.312.1.test-design.1.user-authentication.md ← qa-planning (pre-dev)
├── story.312.1.qa.1.user-authentication.md         ← qa-story
├── story.312.1.gate.1.user-authentication.yml      ← qa-story
└── story.312.1.dod.1.user-authentication.md        ← finalise
```

---

## Key Principles

1. **Proactive Planning**: Assess risks and design tests before/during development
2. **Risk-Based Prioritization**: Focus effort where failure would hurt most
3. **Efficient Test Coverage**: Right level, right priority, no duplication
4. **Systematic Assessment**: Use frameworks (probability × impact, test levels, priorities)
5. **Actionable Outputs**: Generate concrete artifacts (YAML blocks, reports, test scenarios)
6. **Integrated Workflow**: Outputs feed into qa-story and qa-gate workflows
7. **Interactive When Needed**: Use AskUserQuestion for unclear requirements or priorities
