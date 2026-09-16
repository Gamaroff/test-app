---
name: research-prompt
description: Create comprehensive research prompts for deep analysis across product, market, user, competitive, and technical domains
---

# Deep Research Prompt Creation

## When to Use This Skill

Use this skill when you need to:
- **Plan comprehensive research** initiatives
- **Define research objectives** and methodologies
- **Structure investigation** of complex topics
- **Process brainstorming outputs** into research plans
- **Validate hypotheses** through systematic inquiry
- **Guide AI or human researchers** with clear prompts

## Purpose

This skill helps create well-structured research prompts that define clear objectives, specify appropriate methodologies, outline expected deliverables, guide systematic investigation, and ensure actionable insights are captured.

## Research Focus Types

The skill supports **9 research focus types** tailored to different analysis needs:

### 1. Product Validation Research
- Validate product hypotheses and market fit
- Test assumptions about user needs and solutions
- Assess technical and business feasibility
- Identify risks and mitigation strategies

### 2. Market Opportunity Research
- Analyze market size and growth potential
- Identify market segments and dynamics
- Assess market entry strategies
- Evaluate timing and market readiness

### 3. User & Customer Research
- Deep dive into user personas and behaviors
- Understand jobs-to-be-done and pain points
- Map customer journeys and touchpoints
- Analyze willingness to pay and value perception

### 4. Competitive Intelligence Research
- Detailed competitor analysis and positioning
- Feature and capability comparisons
- Business model and strategy analysis
- Identify competitive advantages and gaps

### 5. Technology & Innovation Research
- Assess technology trends and possibilities
- Evaluate technical approaches and architectures
- Identify emerging technologies and disruptions
- Analyze build vs. buy vs. partner options

### 6. Industry & Ecosystem Research
- Map industry value chains and dynamics
- Identify key players and relationships
- Analyze regulatory and compliance factors
- Understand partnership opportunities

### 7. Strategic Options Research
- Evaluate different strategic directions
- Assess business model alternatives
- Analyze go-to-market strategies
- Consider expansion and scaling paths

### 8. Risk & Feasibility Research
- Identify and assess various risk factors
- Evaluate implementation challenges
- Analyze resource requirements
- Consider regulatory and legal implications

### 9. Custom Research Focus
- User-defined research objectives
- Specialized domain investigation
- Cross-functional research needs

## Workflow

### Step 1: Research Focus Selection

**Present numbered options (1-9) to user:**
- Display all 9 research focus types
- Help user select most appropriate focus
- Can combine multiple focuses if needed
- Consider input documents to recommend focus

### Step 2: Input Processing

**If Project Brief provided:**
- Extract key product concepts and goals
- Identify target users and use cases
- Note technical constraints and preferences
- Highlight uncertainties and assumptions

**If Brainstorming Results provided:**
- Synthesize main ideas and themes
- Identify areas needing validation
- Extract hypotheses to test
- Note creative directions to explore

**If Market Research provided:**
- Build on identified opportunities
- Deepen specific market insights
- Validate initial findings
- Explore adjacent possibilities

**If Starting Fresh:**
- Gather essential context through questions
- Define the problem space
- Clarify research objectives
- Establish success criteria

### Step 3: Collaborative Prompt Development

**A. Research Objectives**

Collaborate with user to articulate:
- Primary research goal and purpose
- Key decisions the research will inform
- Success criteria for the research
- Constraints and boundaries

**B. Research Questions**

Develop specific, actionable research questions:

**Core Questions:**
- Central questions that must be answered
- Priority ranking of questions
- Dependencies between questions

**Supporting Questions:**
- Additional context-building questions
- Nice-to-have insights
- Future-looking considerations

**C. Research Methodology**

Define approach:

**Data Collection Methods:**
- Secondary research sources
- Primary research approaches (if applicable)
- Data quality requirements
- Source credibility criteria

**Analysis Frameworks:**
- Specific frameworks to apply (SWOT, Porter's Five Forces, etc.)
- Comparison criteria
- Evaluation methodologies
- Synthesis approaches

**D. Output Requirements**

Specify deliverables:

**Format Specifications:**
- Executive summary requirements
- Detailed findings structure
- Visual/tabular presentations
- Supporting documentation

**Key Deliverables:**
- Must-have sections and insights
- Decision-support elements
- Action-oriented recommendations
- Risk and uncertainty documentation

### Step 4: Prompt Generation

Generate comprehensive research prompt with this structure:

```markdown
## Research Objective

[Clear statement of what this research aims to achieve]

## Background Context

[Relevant information from project brief, brainstorming, or other inputs]

## Research Questions

### Primary Questions (Must Answer)

1. [Specific, actionable question]
2. [Specific, actionable question]
   ...

### Secondary Questions (Nice to Have)

1. [Supporting question]
2. [Supporting question]
   ...

## Research Methodology

### Information Sources

- [Specific source types and priorities]

### Analysis Frameworks

- [Specific frameworks to apply]

### Data Requirements

- [Quality, recency, credibility needs]

## Expected Deliverables

### Executive Summary

- Key findings and insights
- Critical implications
- Recommended actions

### Detailed Analysis

[Specific sections needed based on research type]

### Supporting Materials

- Data tables
- Comparison matrices
- Source documentation

## Success Criteria

[How to evaluate if research achieved its objectives]

## Timeline and Priority

[If applicable, any time constraints or phasing]
```

### Step 5: Review and Refinement

1. **Present Complete Prompt**
   - Show the full research prompt
   - Explain key elements and rationale
   - Highlight any assumptions made

2. **Gather Feedback**
   - Are the objectives clear and correct?
   - Do the questions address all concerns?
   - Is the scope appropriate?
   - Are output requirements sufficient?

3. **Refine as Needed**
   - Incorporate user feedback
   - Adjust scope or focus
   - Add missing elements
   - Clarify ambiguities

### Step 6: Next Steps Guidance

**Execution Options:**

1. **Use with AI Research Assistant** - Provide this prompt to an AI model with research capabilities
2. **Guide Human Research** - Use as a framework for manual research efforts
3. **Hybrid Approach** - Combine AI and human research using this structure

**Integration Points:**
- How findings will feed into next phases
- Which team members should review results
- How to validate findings
- When to revisit or expand research

## Integration with Other Skills

**Called by:**
- `analyst` - For research planning and deep analysis
- `pm` - For market and user research before PRD creation
- `architect` - For technical research and feasibility studies

**Calls:**
- None (standalone research planning skill)

**Outputs used by:**
- Any skill or team member conducting research
- Feeds research findings back into product/architecture planning
- Validates assumptions made in brainstorming or planning phases

## Best Practices

### Research Question Design
- **Be specific** - Avoid vague or overly broad questions
- **Make actionable** - Questions should lead to decisions
- **Prioritize** - Distinguish must-answer from nice-to-have
- **Consider dependencies** - Sequence questions logically

### Methodology Selection
- **Match method to question** - Different questions need different approaches
- **Consider resources** - Balance thoroughness with available time/budget
- **Ensure credibility** - Define source quality standards
- **Plan for synthesis** - How will disparate findings be combined?

### Output Specification
- **Define deliverables clearly** - What exactly should the researcher produce?
- **Include decision support** - Not just data, but implications and recommendations
- **Document uncertainty** - Where confidence is low or data unavailable
- **Enable action** - Clear next steps based on findings

## Common Research Focus Combinations

**Product Launch Research:**
- Product Validation + Market Opportunity + Competitive Intelligence

**Strategic Planning Research:**
- Market Opportunity + Strategic Options + Risk & Feasibility

**Feature Development Research:**
- User & Customer + Technology & Innovation + Competitive Intelligence

**Market Entry Research:**
- Market Opportunity + Industry & Ecosystem + Competitive Intelligence + Risk & Feasibility

## Success Criteria

A successful research prompt includes:

1. **Clear Objectives** - Unambiguous research goals
2. **Specific Questions** - Actionable, prioritized inquiry
3. **Appropriate Methodology** - Right approaches for the questions
4. **Defined Deliverables** - Exactly what will be produced
5. **Success Measures** - How to evaluate research quality
6. **Next Steps Clarity** - How findings will be used

## Important Notes

- **Quality in = quality out** - The prompt directly impacts insight quality
- **Be specific** - General prompts produce general results
- **Consider future** - Balance current state with implications
- **Balance scope** - Comprehensive but focused
- **Document assumptions** - Clarify what's assumed vs. what needs validation
- **Plan iteration** - Research often reveals new questions

## Example Use Cases

**Scenario 1: Post-Brainstorming Research**
- User completes brainstorming session on new feature
- Analyst invokes research-prompt skill
- Processes brainstorming output to identify validation needs
- Creates Product Validation Research prompt
- Output guides testing of brainstormed hypotheses

**Scenario 2: Market Entry Research**
- PM planning to enter new market segment
- Invokes research-prompt with Market Opportunity focus
- Develops comprehensive market sizing and analysis prompt
- Includes competitive and ecosystem research components
- Output guides deep market analysis

**Scenario 3: Technical Feasibility Study**
- Architect needs to evaluate technology options
- Invokes research-prompt with Technology & Innovation focus
- Creates structured evaluation framework
- Defines build/buy/partner decision criteria
- Output guides systematic technology assessment
