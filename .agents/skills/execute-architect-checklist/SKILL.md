---
name: execute-architect-checklist
description: Comprehensive architecture validation using the Architect Solution Validation Checklist. Validates technical design for robustness, scalability, security, and requirements alignment. Use before finalizing architecture documents or during architecture reviews.
---

# Execute Architect Checklist

## Purpose

Systematic validation of architecture documents against comprehensive quality criteria. This skill ensures architectures are robust, scalable, secure, aligned with requirements, and ready for AI agent implementation.

## When to Use This Skill

Use this skill when:
- Finalizing architecture documents before development
- Conducting architecture reviews
- Validating brownfield documentation completeness
- Before developer/AI agent handoff
- Ensuring architecture meets all quality standards
- Identifying gaps or risks in architecture design
- Preparing for stakeholder architecture review

## Validation Framework

The checklist validates 10 comprehensive areas:

### 1. Requirements Alignment (3 subsections)
- Functional requirements coverage
- Non-functional requirements alignment
- Technical constraints adherence

### 2. Architecture Fundamentals (4 subsections)
- Architecture clarity
- Separation of concerns
- Design patterns & best practices
- Modularity & maintainability

### 3. Technical Stack & Decisions (4 subsections)
- Technology selection
- Frontend architecture (if applicable)
- Backend architecture
- Data architecture

### 4. Frontend Design & Implementation (6 subsections) [FRONTEND ONLY]
- Frontend philosophy & patterns
- Frontend structure & organization
- Component design
- Frontend-backend integration
- Routing & navigation
- Frontend performance

### 5. Resilience & Operational Readiness (4 subsections)
- Error handling & resilience
- Monitoring & observability
- Performance & scaling
- Deployment & DevOps

### 6. Security & Compliance (4 subsections)
- Authentication & authorization
- Data security
- API & service security
- Infrastructure security

### 7. Implementation Guidance (5 subsections)
- Coding standards & practices
- Testing strategy
- Frontend testing (if applicable)
- Development environment
- Technical documentation

### 8. Dependency & Integration Management (3 subsections)
- External dependencies
- Internal dependencies
- Third-party integrations

### 9. AI Agent Implementation Suitability (4 subsections)
- Modularity for AI agents
- Clarity & predictability
- Implementation guidance
- Error prevention & handling

### 10. Accessibility Implementation (2 subsections) [FRONTEND ONLY]
- Accessibility standards
- Accessibility testing

**Total**: 40+ validation sections with 200+ individual checklist items

## Workflow Process

### Step 1: Initialization

**REQUIRED ARTIFACTS:**

Before proceeding, ensure you have access to:

1. **architecture.md** - The primary architecture document (check `docs/architecture.md`)
2. **prd.md** - Product Requirements Document (check `docs/prd.md`)
3. **frontend-architecture.md** or **fe-architecture.md** - If this is a UI project (check `docs/frontend-architecture.md`)
4. Any system diagrams referenced in the architecture
5. API documentation if available
6. Technology stack details and version specifications

**IMPORTANT:** If any required documents are missing or inaccessible, immediately ask the user for their location or content before proceeding.

### Step 2: Project Type Detection

Determine the project type by checking:
- Does the architecture include a frontend/UI component?
- Is there a frontend-architecture.md document?
- Does the PRD mention user interfaces or frontend requirements?

**If backend-only or service-only project:**
- Skip sections marked with **[FRONTEND ONLY]**
- Focus extra attention on API design, service architecture, and integration patterns
- Note in your final report that frontend sections were skipped due to project type

### Step 3: Choose Execution Mode

Ask the user which mode they prefer:

**Section by Section (Interactive Mode)**
- Review each section individually
- Present findings for that section
- Get confirmation before proceeding
- **Best for:** Thorough review, learning, complex architectures
- **Time:** More time-consuming but comprehensive

**All at Once (YOLO/Comprehensive Mode)**
- Process all sections at once
- Create a comprehensive report
- Present complete analysis at end
- **Best for:** Quick validation, final checks, experienced teams
- **Time:** Faster but less interactive

### Step 4: Validation Approach

For each checklist item:

1. **Read and Understand** - Fully comprehend the requirement
2. **Seek Evidence** - Look for explicit or implicit coverage in documentation
3. **Critical Analysis** - Don't just check boxes, thoroughly analyze
4. **Cite Specifics** - Quote sections or provide specific references
5. **Question Assumptions** - Challenge and verify design decisions
6. **Assess Risk** - Consider what could go wrong

Mark items as:
- ✅ **PASS**: Requirement clearly met with evidence
- ❌ **FAIL**: Requirement not met or insufficient coverage
- ⚠️ **PARTIAL**: Some aspects covered but needs improvement
- **N/A**: Not applicable to this project (with clear justification)

### Step 5: Section Analysis

For each section:
- Calculate pass rate (think step by step)
- Identify common themes in failed items
- Provide specific recommendations for improvement
- In interactive mode: Discuss findings with user
- Document any user decisions or explanations

### Step 6: Final Validation Report

Generate a comprehensive report that includes:

#### 1. Executive Summary
- **Overall Architecture Readiness** (High/Medium/Low)
- **Critical Risks Identified** (top 3-5)
- **Key Strengths** of the architecture
- **Project Type** and sections evaluated (Full-stack/Frontend/Backend)

#### 2. Section Analysis
- **Pass Rate** for each major section (percentage)
- **Most Concerning Failures** or gaps
- **Sections Requiring Immediate Attention**
- Note any sections skipped due to project type

#### 3. Risk Assessment
- **Top 5 Risks** by severity
- **Mitigation Recommendations** for each
- **Timeline Impact** of addressing issues

#### 4. Recommendations

**Must-Fix Items** (before development)
- Critical gaps that block development
- Security vulnerabilities
- Missing essential components

**Should-Fix Items** (for better quality)
- Important improvements
- Quality enhancements
- Optimization opportunities

**Nice-to-Have Improvements**
- Optional enhancements
- Future considerations
- Advanced optimizations

#### 5. AI Implementation Readiness
- Specific concerns for AI agent implementation
- Areas needing additional clarification
- Complexity hotspots to address
- Recommended simplifications

#### 6. Frontend-Specific Assessment (if applicable)
- Frontend architecture completeness
- Alignment between main and frontend architecture docs
- UI/UX specification coverage
- Component design clarity

#### 7. Detailed Findings by Section
- Section-by-section breakdown
- Pass/fail counts
- Specific issues and recommendations

After presenting the report, ask the user if they would like:
- Detailed analysis of any specific section
- Focus on sections with warnings or failures
- Recommendations for addressing specific issues
- Priority order for fixing issues

## Validation Methodology

### Deep Analysis Guidelines

Each section includes embedded LLM prompts for thorough thinking:

**Requirements Alignment**
- Understand product's purpose and goals from PRD
- What is the core problem being solved?
- Who are the users?
- What are critical success factors?
- Verify concrete technical solutions exist

**Architecture Fundamentals**
- Visualize system as if explaining to new developer
- Look for ambiguities that could cause misinterpretation
- Check for specific diagrams, component definitions
- Verify clear interaction patterns

**Technical Stack & Decisions**
- Consider long-term implications
- Is this the simplest solution that could work?
- Are we over-engineering?
- Will this scale?
- What are maintenance implications?
- Verify specific versions (not ranges)

**Resilience & Operational Readiness**
- Think about Murphy's Law - what could go wrong?
- Consider peak load scenarios
- What happens when critical service is down?
- Can operations team diagnose issues at 3 AM?
- Look for specific resilience patterns

**Security & Compliance**
- Review with hacker's mindset
- How could someone exploit this system?
- Consider industry-specific regulations (GDPR, HIPAA, PCI)
- Look for specific security controls, not general statements

**Implementation Guidance**
- Imagine being developer on day one
- Do they have everything to be productive?
- Are coding standards clear for consistency?
- Look for specific examples and patterns

**Dependencies**
- For each dependency: What if it's unavailable?
- Are there newer versions with security patches?
- Are we locked into a vendor?
- What's our contingency plan?

**AI Agent Suitability**
- Will AI agents make incorrect assumptions?
- Are patterns consistent?
- Is complexity minimized?
- Explicit is better than implicit

## Interactive Mode Flow

If user selects interactive mode:

1. **Process Section**
   - Review all items in section
   - Apply section-specific validation approach
   - Mark each item (✅❌⚠️N/A)

2. **Present Findings**
   - Section pass rate
   - Key issues found
   - Recommendations
   - Highlight warnings and errors

3. **Get Confirmation**
   - Ask if any major issues need immediate attention
   - Document any user explanations
   - Confirm before proceeding to next section

4. **Repeat** for all sections

5. **Generate Final Report**

## YOLO Mode Flow

If user selects YOLO/comprehensive mode:

1. **Process All Sections** silently
2. **Build Comprehensive Report** with all findings
3. **Present Complete Analysis** at end
4. **Offer Deep Dive** on specific sections if needed

## Success Criteria

A successful validation includes:

✅ All applicable sections reviewed
✅ Evidence-based assessments (not just checkmarks)
✅ Specific recommendations with rationale
✅ Risk prioritization
✅ Clear pass/fail rates
✅ Actionable next steps
✅ Project-type appropriate (frontend sections skipped if not applicable)
✅ Honest, critical evaluation

## Examples

### Example 1: Backend API Architecture

```
User: "Validate my REST API architecture"

Skill:
1. Loads architecture.md and prd.md
2. Detects backend-only project (no frontend)
3. Skips frontend-specific sections
4. User selects YOLO mode
5. Validates all backend sections
6. Identifies missing rate limiting strategy
7. Notes excellent security implementation
8. Provides comprehensive report with 85% pass rate
9. Recommends fixing 3 critical gaps before development
```

### Example 2: Full-Stack Application

```
User: "Review my full-stack architecture document"

Skill:
1. Loads architecture.md, frontend-architecture.md, prd.md
2. Detects full-stack project
3. User selects interactive mode
4. Reviews section 1 - identifies requirements alignment issue
5. User provides clarification, proceeds
6. Continues through all 10 sections
7. Generates final report with 92% pass rate
8. Highlights 2 frontend concerns and 1 security gap
```

## Resources

This skill includes:

- **Architect Checklist** (`resources/architect-checklist.md`)
  - Complete 200+ item validation framework
  - Embedded LLM prompts for deep analysis
  - Section-specific guidance
  - Risk assessment criteria

## Notes

- This skill enforces systematic, comprehensive validation
- Evidence-based approach (cite specific documentation)
- Critical thinking over checkbox mentality
- Honest assessment of readiness
- Project-type aware (skips inapplicable sections)
- Optimized for both human and AI development
- Results directly inform architecture improvements

---

**Remember**: The goal is not to achieve 100% pass rate, but to ensure the architecture is fit for purpose, addresses critical risks, and provides clear guidance for implementation.
