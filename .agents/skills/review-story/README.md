# Review Story Skill

**Interactive** comprehensive story document review that asks clarifying questions instead of making assumptions. Identifies inaccuracies, gaps, inconsistencies, and quality issues through collaborative user input.

## Key Features

🎯 **Interactive Review** - Asks clarifying questions rather than making assumptions
🤝 **User-Aligned** - Recommendations based on your vision and decisions
🔍 **Comprehensive Analysis** - 8-step review process with anti-hallucination detection
📊 **Batched Questions** - 3 question points (max 4 questions each) for efficient clarification
✅ **Actionable Output** - Specific fixes aligned with user's intent

## Quick Start

```bash
# Basic usage - review a story document
/review-story story.310.5.socketio-real-time-delivery.md

# With specific focus areas
/review-story story.2.3.auto-hide.md --focus testing,api-specs

# Quick review (15-30 min)
/review-story story.4.1.user-auth.md --depth quick

# Thorough review (60-90+ min)
/review-story story.1.5.critical-feature.md --depth thorough
```

## Interactive Review Process

Unlike traditional code review tools, `/review-story` **asks clarifying questions** instead of making assumptions:

### When Questions Are Asked

The skill asks questions when it encounters:

- **Ambiguities**: Multiple valid interpretations ("fast response" - how fast?)
- **Conflicts**: Story contradicts architecture/epic (Which is correct?)
- **Gaps**: Missing essential information (What error scenarios to handle?)
- **Hallucinations**: Technology not in docs (Use documented lib or add new?)
- **Technical Decisions**: Choice between approaches (WebSocket or Socket.IO?)

### Question Batching Strategy

Questions are asked in **3 batched rounds** (max 4 questions per round):

1. **After Steps 1-2**: Epic alignment & structure questions
2. **After Steps 3-4**: Technical accuracy & completeness questions
3. **After Steps 5-7**: Quality, clarity & consistency questions

This minimizes interruptions while ensuring all issues are clarified.

### Example Question

```
Q: "Story mentions 'react-native-super-cache' library not in tech stack.
    What caching solution should be used?"

Options:
  [Use documented lib] - Replace with existing solution from architecture
  [Add new library]    - Install and update tech stack docs
  [Clarify approach]   - Describe caching approach without assuming library
```

### Your Answers Drive Recommendations

All recommendations in the final report are based on **your decisions**, not AI assumptions:

- ✅ "Update AC #3 to specify <500ms response time (p95)" - _Per user decision_
- ✅ "Replace 'react-native-super-cache' with documented AsyncStorage" - _Per user decision_
- ❌ NOT: "Recommend using AsyncStorage" (without asking first)

## What It Does

The review-story skill performs an 8-step comprehensive analysis:

1. **Template Structure Compliance** - Verifies all required sections present
2. **Epic Alignment** - Ensures story implements epic requirements accurately
3. **Technical Accuracy** - Detects hallucinations and verifies technical claims
4. **Completeness & Gaps** - Identifies missing information
5. **Consistency & Conflicts** - Finds contradictions
6. **Quality & Clarity** - Assesses clarity and developer usability
7. **Previous Story Context** - Checks continuity with previous work
8. **Review Report** - Generates actionable recommendations

## Review Depths

### Quick (15-30 minutes)

- Critical issues only
- Template compliance
- Epic alignment
- Major hallucinations
- High-level completeness

**Use when**: Quick sanity check, time-constrained

### Standard (30-60 minutes) - DEFAULT

- All 8 steps fully executed
- Comprehensive issue detection
- Actionable recommendations
- Full report

**Use when**: Normal pre-implementation review, quality gate

### Thorough (60-90+ minutes)

- Deep analysis with cross-reference verification
- Detailed quality scoring
- Comparison with similar stories
- Comprehensive recommendations with examples

**Use when**: Critical story, high risk, quality audit

## Output

Generates a comprehensive review report:

```
[story-directory]/story.{epic}.{story}.review.{n}.{story-name}.md
```

Report includes:

- **Executive Summary** - Quick overview of findings
- **Issue Categories** - Critical, Important, Optional
- **Hallucination Detection** - Invented technical details
- **Gap Analysis** - Missing information
- **Consistency Report** - Conflicts and contradictions
- **Quality Scores** - Clarity ratings (1-10)
- **Implementation Readiness** - GO/NO-GO recommendation
- **Actionable Recommendations** - Specific fixes prioritized

## Issue Severity Levels

### 🚨 Critical (Must Fix)

- Missing epic requirements
- Invented libraries/APIs not in architecture
- ACs without implementing tasks
- Direct contradictions
- Ambiguous/unmeasurable ACs

**Impact**: Blocks implementation or causes major issues

### ⚠️ Important (Should Fix)

- Missing source references
- Vague file locations
- Incomplete testing specs
- Inconsistent naming
- Poor task granularity

**Impact**: Affects quality or maintainability

### 💡 Optional (Nice to Have)

- Additional helpful context
- Minor clarity improvements
- Enhanced documentation

**Impact**: Improves clarity or completeness

## Common Use Cases

### 1. Pre-Implementation Review

"Before starting story 2.3, check it for issues"

- Ensures story is ready for development
- Catches problems before they become code issues
- Saves developer time

### 2. Quality Audit

"Review all Epic 3 stories for consistency"

- Ensures pattern consistency across stories
- Validates architecture alignment
- Maintains quality standards

### 3. Post-Mortem Analysis

"Story 4.2 went off-track. Why?"

- Analyzes story gaps that led to implementation issues
- Identifies missing or unclear requirements
- Improves future story writing

### 4. Epic Migration Review

"Epic was updated. Does story 1.5 still align?"

- Validates story against updated epic
- Identifies new or removed requirements
- Ensures synchronization

### 5. Architecture Validation

"New architecture docs published. Review story 3.2"

- Verifies technical accuracy against new standards
- Checks for deprecated patterns
- Ensures compliance

## Anti-Hallucination Detection

The review skill rigorously detects:

- **Invented Technologies** - Libraries/frameworks not in tech stack
- **Incorrect APIs** - Endpoints that don't match API specs
- **Unsourced Claims** - Technical details without references
- **Conflicting Specs** - Contradictions with architecture docs
- **Vague Sources** - Generic references without specifics

**Example Detection**:

```markdown
#### Critical (Hallucination)

- **Invented Library**: Story mentions "react-native-navigation-pro"
  - **Location:** Dev Notes > Navigation section
  - **Issue:** This library is not in architecture/tech-stack.md
  - **Recommendation:** Replace with documented alternative (Expo Router)
```

## Integration with Other Skills

### Complements

- `/create-story` - Story creation workflow
- `/edit-story` - Modify existing stories
- `/develop` - Implementation guidance

## Tips for Best Results

1. **Run Before Starting** - Catch issues early
2. **Use Standard Depth** - Best balance of speed and thoroughness
3. **Act on Critical Issues** - Don't ignore must-fix items
4. **Review the Report** - Not just the summary scores
5. **Iterate** - Fix issues and re-review if needed
6. **Learn Patterns** - Use reviews to improve story writing

## Success Metrics

A story is ready when review shows:

- ✅ No critical issues
- ✅ Minimal important issues (< 3)
- ✅ Implementation readiness score ≥ 8/10
- ✅ All technical claims have sources
- ✅ All ACs covered by tasks
- ✅ Clear, actionable guidance for developer

## Resources


- Story template: `resources/story-template.yaml`
- Configuration: Inline configuration or explicit file references

## See Also

- `/create-story` - Create new story documents
- `/edit-story` - Modify existing stories
- `/develop` - Implement stories
