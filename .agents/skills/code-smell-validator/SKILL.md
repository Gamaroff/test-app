---
name: code-smell-validator
description: This skill provides guidance for identifying and refactoring common code smells in any codebase. It utilizes sub-agents for parallel scanning and generates a comprehensive refactoring plan document (refactor-DDMMYYYY-N.md).
---

# Code Smell Validator

This skill provides a comprehensive framework for detecting and addressing common code smells across any programming language. It generalizes industry-standard patterns (like those from "Refactoring" by Martin Fowler and "Ruby Science") into actionable, language-agnostic guidance.

## When to Use This Skill

- **Code Reviews**: When identifying areas for improvement in pull requests.
- **Refactoring**: When planning to clean up complex or legacy code.
- **Technical Debt Assessment**: When evaluating the maintainability of a module or class.
- **Mentoring**: When explaining *why* certain code patterns should be avoided.

## Analysis and Output Workflow

Follow this strict procedural sequence. **DO NOT skip steps** unless the specified conditional criteria are met.

### Phase 1: Environment & Context
1. **Gather Environmental Context (Optional)**:
   - **Condition**: Only if MCP servers/plugins (GitHub, Postgres, Docs) are active.
   - **Action**: Query for recent bugs, database schemas, or architectural ADRs.
   - **Verification**: Summarize external signals and how they might influence severity.
2. **Detect Tech Stack**:
   - **Action**: MANDATORY: Run `scripts/detect_stack.sh`.
   - **Verification**: Confirm the script returned a valid stack string (e.g., "Node.js, TypeScript, React"). If undetermined, use "Generic".
3. **Determine Scope**:
   - **Action**: Define the file/directory set based on user request, recent changes, or full scan heuristic.
   - **Verification**: Verify all files in the scope exist and are accessible.

### Phase 2: Data Gathering & Analysis
4. **Automated Data Gathering**:
   - **Action**: Run `scripts/analyze_churn.sh` and `scripts/check_coverage.sh`.
   - **Action**: Run stack-specific tools (e.g., `scripts/check_ts_lint.sh` for TS/React).
   - **Verification**: Ensure all scripts executed without fatal errors and generated usable metrics.
5. **Hygiene Audit**:
   - **Action**: Run `scripts/check_hygiene.sh` to find TODOs, dead code, and naming inconsistencies.
   - **Verification**: Summarize findings and cross-reference with [Hygiene Reference](references/hygiene.md).
6. **Distribute Scanning (Optional)**:
   - **Condition**: Only if the scope involves more than 5–10 files.
   - **Action**: Partition the scope and marshal `generalist` sub-agents for parallel scanning.
   - **Verification**: Confirm all sub-agents have reported back their findings.
7. **Detailed Code Scanning**:
   - **Action**: Perform deep analysis for metrics, responsibilities, dependencies, duplication, and complex conditionals.
   - **Verification**: Check identified smells against the [Smells Reference](references/smells.md).

### Phase 3: Synthesis & Output
8. **Synthesis & Consistency Check**:
   - **Action**: Consolidate findings from all agents and automated tools.
   - **Check**: DO high-churn/low-coverage files correlate with identified smells?
   - **Check**: Are severity assessments consistent with the **Contextual Modifiers**?
   - **Verification**: Ensure cross-cutting smells (e.g., Shotgun Surgery) are identified across partitions.
9. **Prompt for Save Location**:
   - **Action**: MANDATORY: Ask the user where the plan document should be saved.
   - **Default**: `docs/refactoring`.
10. **Generate Refactoring Plan**:
   - **Action**: Create the plan using the [Plan Document Template](#refactoring-plan-document-template).
   - **Verification**: Confirm the file follows the naming convention: `refactor-DDMMYYYY-[N].md`.

### Parallel Analysis Strategy
When the scope involves more than 5–10 files, you MUST use sub-agents to maintain efficiency:

- **Partitioning**: Divide the codebase by directory or module. Assign each sub-agent a specific subset of files.
- **Marshalling**: Invoke `generalist` sub-agents with a clear request: *"Analyze these files for code smells using the code-smell-validator criteria. Report back with file:line, smell type, and a brief description."*
- **Synthesis**: The main agent (orchestrator) is responsible for merging these reports into a single, cohesive Refactoring Plan, ensuring that global smells like **Shotgun Surgery** or **Duplicated Code** across different modules are correctly identified.

### Naming Convention
The plan document MUST follow this naming pattern:
`refactor-DDMMYYYY-[incrementing number].md`

**Numbering Logic**:
- The `incrementing number` starts at **1** for the first refactor plan of the day.
- For each subsequent plan on the SAME day, increment the number (e.g., `-1`, `-2`, `-3`).
- On a **new day**, the numbering MUST **reset back to 1**.

*(Example: `refactor-09042026-1.md`)*

## Refactoring Plan Document Template

ALWAYS use this structure for the generated plan document:

```markdown
# Refactoring Plan: [Scope/Feature Name]
**Date**: DD/MM/YYYY
**Target Files**: [List of files to be refactored]

## 1. Executive Summary
A brief overview of the code quality issues identified and the primary goals of the refactoring effort.

## 2. Contextual Insights (MCP)
*Optional: Summary of findings from external tools (GitHub issues, database schemas, architectural docs).*

## 3. Identified Code Smells
| File:Line | Smell Type | Severity | Churn/Coverage | Description |
| :--- | :--- | :--- | :--- | :--- |
| `path/to/file:42` | Long Method | Medium | High/Low | `processData()` is 150 lines with multiple concerns. |

## 4. Code Hygiene & Consistency
*Identify dead code, naming issues, and organizational drift here.*

## 5. Refactoring Recommendations
Detailed explanation of *how* to address the smells identified above, including proposed structural changes.

### Dependency Visualization (Mermaid.js)
*If applicable (e.g., Feature Envy or God Class), include a Mermaid.js diagram here to visualize coupling.*

## 6. Actionable Tasks
A checklist of specific, sequential tasks to implement the refactoring:
- [ ] Task 1: Add missing unit tests for `MainController` (Priority: Low Coverage)
- [ ] Task 2: Cleanup "Zombie Code" in `MainController` (Priority: Hygiene)
- [ ] Task 3: Extract `ValidationLogic` from `MainController`
- [ ] Task 4: Implement `Strategy` pattern for `UserTypes`
- [ ] Task 5: Unit test the new `ValidationLogic` class

## 7. Risk Assessment
Potential side effects or areas requiring special attention during testing. Focus on high-churn files where regressions are likely.
```

## Refactoring Sub-Agents

For executing the tasks outlined in the plan, you can marshal a specialized sub-agent:

- **Goal**: Safely execute a specific refactoring task (e.g., "Extract Class").
- **Instructions**: Provide the sub-agent with the specific task from the Refactoring Plan and relevant file contents.
- **Safety**: Instruct the sub-agent to use AST-aware tools or surgical edits, followed immediately by running tests.

## Common Code Smells Reference

For detailed detection criteria and examples across different languages, see:
- [Code Smells Reference](references/smells.md)
- [Code Hygiene Reference](references/hygiene.md)
- [Code Smell Examples (Multi-Language)](references/examples.md)

### Summary Table

| Smell | Pattern | Severity | Primary Solution |
| :--- | :--- | :--- | :--- |
| **Long Method** | Method is difficult to understand at a glance | Medium | Extract Method |
| **Large Class** | Class has too many responsibilities | High | Extract Class / Value Object |
| **Feature Envy** | Method uses another object's data more than its own | Medium | Move Method |
| **Case Statement** | Conditional logic based on object type | High | Replace with Polymorphism |
| **Shotgun Surgery** | Single change requires edits across many files | High | Replace with Polymorphism |
| **Divergent Change** | Class changes for many unrelated reasons | High | Extract Class |
| **Duplicated Code** | Similar logic in multiple places | High | Extract Method / Class |
| **Primitive Obsession** | Using primitives instead of small objects | Medium | Replace with Value Object |
| **Data Clumps** | Groups of variables always passed together | Medium | Introduce Parameter Object |
| **God Class** | Class that knows too much about the system | Critical | Aggressive Extraction |

## Refactoring Strategies

When a smell is detected, apply these standard refactoring patterns:

- **Extract Method/Function**: Move a block of code into a new, well-named method.
- **Move Method**: Relocate a method to the class that uses its data most.
- **Extract Class**: Split a large class into smaller, cohesive classes.
- **Introduce Parameter Object**: Replace a long list of parameters with a single object.
- **Replace Conditional with Polymorphism**: Use inheritance or interfaces to handle type-specific logic.
- **Replace Temp with Query**: Replace a local variable with a method call to reduce method length.

## Priority Order for Addressing Smells

1. **Critical**: God Class, Security vulnerabilities disguised as complexity.
2. **High**: Duplicated Code, Case Statements, Large Class, Shotgun Surgery.
3. **Medium**: Long Method, Feature Envy, Long Parameter List, Primitive Obsession.
4. **Low**: Comments (explaining *what* instead of *why*), Dead Code.
