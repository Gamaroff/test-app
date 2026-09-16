---
name: deep-research-prompt
description: Generate comprehensive research prompts for various analysis types (product validation, market opportunity, competitive intelligence, etc.). Use when market validation or deep investigation needed before PRD creation.
---

# Deep Research Prompt Generation

## When to Use This Skill

Activate when user needs:

- Market validation before product development
- Competitive intelligence gathering
- User research and persona development
- Technology assessment and feasibility analysis
- Strategic options evaluation
- Risk and feasibility assessment

**Natural triggers:**

- "Need market research for..."
- "Generate research prompt for..."
- "Validate product hypothesis..."
- "Investigate competitive landscape..."

**Recommended by:** `new-product-prd` and `create-prd` when market validation uncertainty exists

## Purpose

Generate well-structured research prompts that:

- Define clear research objectives and scope
- Specify appropriate methodologies
- Outline expected deliverables and formats
- Guide systematic investigation
- Ensure actionable insights captured

## Research Type Options

**Present these 9 options to user:**

1. **Product Validation Research** - Validate hypotheses, test assumptions, assess feasibility
2. **Market Opportunity Research** - Analyze market size, segments, entry strategies
3. **User & Customer Research** - Deep dive into personas, behaviors, pain points, journeys
4. **Competitive Intelligence Research** - Competitor analysis, positioning, business models
5. **Technology & Innovation Research** - Tech trends, approaches, build vs buy
6. **Industry & Ecosystem Research** - Value chains, key players, regulatory factors
7. **Strategic Options Research** - Strategic directions, business models, GTM strategies
8. **Risk & Feasibility Research** - Risk factors, implementation challenges, resource needs
9. **Custom Research Focus** - User-defined objectives and specialized investigation

## Workflow

```
1. Research Type Selection
   └─ User selects from 9 options

2. Input Processing
   ├─ If Project Brief provided → extract concepts, goals, uncertainties
   ├─ If Brainstorming Results → synthesize themes, hypotheses
   ├─ If Market Research → build on findings, deepen insights
   └─ If Starting Fresh → gather context through questions

3. Collaborative Prompt Development
   ├─ Research Objectives (primary goal, key decisions, success criteria)
   ├─ Research Questions (core + supporting, prioritized)
   ├─ Research Methodology (data collection, analysis frameworks)
   └─ Output Requirements (format specs, deliverables)

4. Prompt Generation
   └─ Use standardized template

5. Review and Refinement
   ├─ Present complete prompt
   ├─ Gather feedback
   └─ Refine as needed

6. Next Steps Guidance
   ├─ Execution options (AI assistant, human research, hybrid)
   └─ Integration points (how findings feed next phases)
```

## Research Prompt Template

```markdown
## Research Objective

[Clear statement of what research aims to achieve]

## Background Context

[Relevant information from inputs]

## Research Questions

### Primary Questions (Must Answer)

1. [Specific, actionable question]
2. [Specific, actionable question]

### Secondary Questions (Nice to Have)

1. [Supporting question]
2. [Supporting question]

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

[Specific sections based on research type]

### Supporting Materials

- Data tables
- Comparison matrices
- Source documentation

## Success Criteria

[How to evaluate if research achieved objectives]

## Timeline and Priority

[Time constraints or phasing if applicable]
```

## Key Principles

1. **Collaborative development** - Work with user to define objectives and questions
2. **Specificity** - Specific questions over general ones
3. **Actionability** - Questions lead to decisions
4. **Balance** - Comprehensiveness with focus
5. **Documentation** - Assumptions and limitations clear
6. **Iteration planning** - Refine based on initial findings

## Integration with Other Skills

**Recommended by:**

- `new-product-prd` - Before PRD if market validation needed
- `create-prd` - For competitive or technical research

**Feeds into:**

- PRD creation (informed by research findings)
- Architecture decisions (technical research)
- Product strategy (market and competitive research)

## Success Criteria

- Research objectives clearly articulated
- Specific, prioritized questions defined
- Appropriate methodologies specified
- Output requirements comprehensive
- User validated and approved prompt
- Next steps guidance clear

## Notes

- Quality of prompt directly impacts quality of insights
- Be specific in research questions
- Consider current state and future implications
- Balance comprehensiveness with focus
- Plan for iterative refinement
