---
name: execute-checklist
description: Generic checklist validation engine for systematically validating documentation, code, or processes against predefined quality criteria. Supports interactive and batch modes with comprehensive reporting.
---

# Execute Checklist Validation

## When to Use This Skill

Use this skill when you need to:

- **Validate story completeness** before developer handoff ("validate story", "check story readiness")
- **Assess documentation quality** against standards ("run architecture checklist", "validate PRD")
- **Verify definition of done** for completed work ("run DoD checklist", "check story completion")
- **Evaluate change impacts** during pivots ("run change checklist", "assess impact")
- **Execute any quality gate** with structured validation criteria

Natural language triggers:

- "Validate story 2.3 with the story draft checklist"
- "Run the DoD checklist for completed story"
- "Check if the architecture doc passes the checklist"
- "Validate this PRD against the PM checklist"

## Purpose

This skill provides systematic validation of documentation against structured checklists. It ensures thorough and consistent evaluation of documents, identifies gaps, and generates actionable reports for improvement.

## Available Checklists

This skill uses checklist files from `resources/` directory:

**Core Checklists**:

- `story-draft-checklist.md` - Validates story completeness before implementation
- `story-dod-checklist.md` - Verifies developer completion against Definition of Done
- `change-checklist.md` - Guides change navigation when pivots occur

**Usage**: Reference checklists by name, and the skill will use fuzzy matching to find the appropriate file.

## Execution Mode

This skill uses **interactive mode** for thorough, collaborative validation:

- Work through checklist section by section
- Review and discuss findings after each section
- Get user confirmation before proceeding
- Ensures detailed collaboration and prevents missing critical issues

---

## Workflow

### Step 1: Initial Assessment

#### 1.1 Checklist Selection

**If checklist name provided by user or calling skill**:

1. Try fuzzy matching against available checklists
   - Example: "architecture checklist" → "architect-checklist.md"
   - Example: "story draft" → "story-draft-checklist.md"
2. If multiple matches found, ask user to clarify
3. Load the appropriate checklist from `resources/`

**If no checklist specified**:

1. List available checklists from the checklists folder
2. Ask user which checklist to use
3. Present options clearly:
   ```
   Available checklists:
   1. story-draft-checklist - Validate story before implementation
   2. story-dod-checklist - Verify developer completion
   3. change-checklist - Navigate project pivots
   4. po-master-checklist - Product Owner master validation
   [etc.]
   ```

---

### Step 2: Document and Artifact Gathering

**Purpose**: Collect all documents needed for validation

1. Each checklist specifies required documents/artifacts at the beginning
2. Follow checklist-specific instructions for what to gather
3. Common document locations:
   - Stories: `{epic-directory}/stories/story.{epic}.{story}.{name}/story.{epic}.{story}.{name}.md` (co-located inside epic dir, e.g. `${PRD_ROOT}/<domain>/<feature>/epics/epic.{N}.<name>/stories/`)
   - Epics: `${PRD_ROOT}/{domain}/{feature}/epics/epic.{n}.{name}/epic.{n}.{name}.md`
   - Architecture: `${ARCH_ROOT}/`
   - Previous stories for context

**If document location unclear**:

- **HALT** and ask user for clarification
- Suggest likely locations based on standard structure
- Confirm file path before proceeding

---

### Step 3: Checklist Processing

**For each section**:

1. **Review Section Items**
   - Read all items in the section
   - Follow instructions embedded in the checklist (marked with `[[LLM: ...]]`)
   - Check each item against relevant documentation

2. **Validation Per Item**
   - Read and understand the requirement
   - Look for evidence in documentation
   - Consider both explicit mentions and implicit coverage
   - Apply checklist-specific LLM instructions

3. **Mark Item Status**:
   - ✅ **PASS**: Requirement clearly met
   - ❌ **FAIL**: Requirement not met or insufficient coverage
   - ⚠️ **PARTIAL**: Some aspects covered but needs improvement
   - **N/A**: Not applicable to this case (with rationale)

4. **Present Section Summary**
   - Highlight warnings and errors
   - Note non-applicable items with rationale
   - Calculate section pass rate
   - Identify common themes

5. **Get User Confirmation**
   - Ask if findings are acceptable
   - Check if corrective action needed before proceeding
   - Document any user decisions or explanations

6. **Proceed to Next Section** (only after user approval)

---

### Step 4: Validation Approach

**For each checklist item**:

1. **Understand the Requirement**
   - Read item carefully
   - Note what evidence would satisfy it
   - Consider context and intent

2. **Search for Evidence**
   - Look in specified documents
   - Check both explicit statements and implicit coverage
   - Follow checklist-specific LLM guidance prompts

3. **Evaluate Coverage**
   - **Full Coverage** → ✅ PASS
   - **No Coverage** → ❌ FAIL
   - **Incomplete Coverage** → ⚠️ PARTIAL (note what's missing)
   - **Not Relevant** → N/A (explain why)

4. **Document Findings**
   - Note specific location where requirement is met (or not)
   - Provide context for failures or partials
   - Include recommendations for improvement

**Embedded LLM Prompts**:

- Checklists contain `[[LLM: ...]]` blocks with specific instructions
- These provide contextual guidance for validation
- Follow these prompts exactly as written
- They ensure thorough analysis and consistent evaluation

---

### Step 5: Section Analysis

**For each section**:

1. **Calculate Pass Rate**
   - Think step by step
   - Formula: `(PASS items / Total applicable items) * 100`
   - Exclude N/A items from denominator
   - Example: 8 PASS + 2 FAIL + 1 N/A = 8/10 = 80% pass rate

2. **Identify Patterns**
   - Common themes in failed items
   - Related issues across multiple items
   - Systematic gaps vs isolated problems

3. **Generate Recommendations**
   - Specific, actionable improvements
   - Prioritize critical failures
   - Suggest concrete next steps

4. **Discuss with user**
   - Present findings
   - Get feedback or explanations
   - Document user decisions

---

### Step 6: Final Report

Generate comprehensive summary with:

#### Report Structure

```markdown
# Checklist Validation Report

## Executive Summary

**Checklist**: {checklist-name}
**Document(s) Validated**: {document-list}
**Date**: {date}
**Overall Status**: {READY / NEEDS REVISION / BLOCKED}

## Overall Results

**Total Items**: {count}
**Passed**: {count} ({percentage}%)
**Failed**: {count} ({percentage}%)
**Partial**: {count} ({percentage}%)
**Not Applicable**: {count}

## Section Breakdown

### Section 1: {Section Name}

**Pass Rate**: {percentage}% ({passed}/{total})
**Status**: {PASS / NEEDS WORK / FAIL}

**Key Findings**:

- {finding 1}
- {finding 2}

**Failed Items**:

- ❌ {item description} - {reason for failure}

**Partial Items**:

- ⚠️ {item description} - {what's missing}

**Recommendations**:

1. {specific action}
2. {specific action}

---

[Repeat for each section]

## Critical Issues

{List of all failed items across sections with context}

## Improvement Recommendations

**High Priority**:

1. {critical fix}
2. {critical fix}

**Medium Priority**:

1. {improvement}
2. {improvement}

**Low Priority** (Nice-to-have):

1. {enhancement}

## Items Marked N/A

{List with justifications}

## Overall Assessment

{Narrative summary of findings}

**Readiness**: READY / NEEDS REVISION / BLOCKED

**Next Steps**:

1. {action item}
2. {action item}
```

---

## Integration with Other Skills

**Called by**:

- `create-story` - Validates story completeness after creation
- `correct-course` - Uses change-checklist for impact assessment
- `develop` - Developers run DoD checklist before completion
- `qa-story` - QA validation of completed work

**Uses resources from**:

- `resources/` - Checklist definitions
- `.agents/skills/execute-checklist/resources/` - Local checklist copies

**Outputs used by**:

- Any agent or skill requiring validation reports
- Decision gates in workflows
- Quality assurance processes

---

## Checklist Format Requirements

Checklists used by this skill should follow this structure:

```markdown
# Checklist Title

Brief description of purpose

[[LLM: INITIALIZATION INSTRUCTIONS
Context and preparation instructions for the AI]]

## Section 1: Category Name

[[LLM: Section-specific instructions
Guidance for validating this section]]

- [ ] Item 1: Requirement description
- [ ] Item 2: Requirement description

## Section 2: Another Category

[[LLM: Section-specific instructions]]

- [ ] Item 1: Requirement description

## VALIDATION RESULT

[[LLM: FINAL SUMMARY INSTRUCTIONS
Format and content for final report]]

| Category  | Status | Issues |
| --------- | ------ | ------ |
| Section 1 | _TBD_  |        |
| Section 2 | _TBD_  |        |

**Final Assessment**: {Assessment criteria}
```

**Key Elements**:

- `[[LLM: ...]]` blocks for AI guidance
- Hierarchical sections
- Checkable items
- Final assessment template

---

## Best Practices

### For Validators (Running the Skill)

1. **Choose the right checklist** for the validation goal
2. **Gather all documents first** before starting validation
3. **Engage actively in each section** - provide feedback and context
4. **Review the full report** before taking action on findings
5. **Focus on critical issues first** from the recommendations
6. **Collaborate throughout** - the interactive approach ensures thoroughness

### For Checklist Authors

1. **Include embedded LLM prompts** for guidance
2. **Group related items** into logical sections
3. **Be specific** in item descriptions
4. **Provide clear criteria** for pass/fail
5. **Include final assessment template** for consistency

---

## Common Validation Scenarios

### Story Draft Validation

**Checklist**: `story-draft-checklist.md`

**Validates**:

- Goal and context clarity
- Technical implementation guidance
- Reference effectiveness
- Self-containment assessment
- Testing guidance

**Output**: Story readiness (READY / NEEDS REVISION / BLOCKED)

### Developer Completion Validation

**Checklist**: `story-dod-checklist.md`

**Validates**:

- All requirements met
- Coding standards compliance
- Testing completed
- Functionality verified
- Documentation updated

**Output**: Definition of Done compliance report

### Change Impact Assessment

**Checklist**: `change-checklist.md`

**Validates**:

- Issue understanding
- Epic impact
- Artifact conflicts
- Path forward evaluation
- Sprint change proposal

**Output**: Change navigation report with recommendations

---

## Troubleshooting

### Checklist Not Found

**Problem**: Fuzzy matching fails to find checklist

**Solution**:

1. List all available checklists from folders
2. Ask user to select from numbered list
3. Try exact filename if fuzzy match fails

### Document Not Accessible

**Problem**: Required document can't be found

**Solution**:

1. Ask user for document location
2. Suggest likely paths based on project structure
3. Allow validation to proceed with partial document set (note limitations)

### Ambiguous Validation Criteria

**Problem**: Unclear whether item passes or fails

**Solution**:

1. Mark as ⚠️ PARTIAL
2. Document the ambiguity in findings
3. Provide recommendation for clarification
4. In Interactive mode, ask user for guidance

---

## Success Criteria

A checklist execution is successful when:

✅ Appropriate checklist selected and loaded
✅ All required documents gathered
✅ All sections processed according to mode
✅ Every item marked with status (✅/❌/⚠️/N/A)
✅ Pass rates calculated for all sections
✅ Comprehensive final report generated
✅ Actionable recommendations provided
✅ User understands findings and next steps

---

## Notes

- This is a **generic validation engine** - works with any properly formatted checklist
- **Interactive mode** ensures thorough, collaborative validation with step-by-step review
- Embedded LLM prompts ensure consistent, thorough validation
- Reports are designed to be actionable, not just informational
- The skill adapts to different checklist formats and requirements

---

## Resources

This skill uses these resource files:

- `resources/story-draft-checklist.md` - Story completeness validation
- `resources/story-dod-checklist.md` - Developer Definition of Done
- `resources/change-checklist.md` - Change navigation guidance
- `resources/po-master-checklist.md` - Product Owner master validation
- `resources/core-config.yaml` - Project configuration

Additional checklists can be added to the `resources/` directory.
