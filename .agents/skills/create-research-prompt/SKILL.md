---
name: create-research-prompt
description: Create comprehensive research prompts for technical deep-dive analysis including product validation, market research, technology assessment, competitive intelligence, and strategic options. Use when needing structured research for architecture decisions or technology selection.
---

# Create Deep Research Prompt

## Purpose

Generate well-structured research prompts for various types of deep analysis. This skill can process inputs from brainstorming sessions, project briefs, market research, or specific research questions to generate targeted prompts for deeper investigation.

## When to Use This Skill

Use this skill when you need:
- Structured research framework for technology decisions
- Product validation and market fit analysis
- Competitive intelligence gathering
- Technology assessment and evaluation
- Strategic options analysis
- Risk and feasibility assessment
- User research and customer insights
- Industry and ecosystem understanding
- Comprehensive research planning for any domain

## Research Prompt Benefits

Generated prompts ensure:
- Clear research objectives and scope
- Appropriate research methodologies
- Expected deliverables and formats
- Systematic investigation of complex topics
- Actionable insights are captured
- Comprehensive coverage of important aspects

## Research Type Selection

**CRITICAL:** First, help the user select the most appropriate research focus based on their needs and any input documents they've provided.

### Available Research Types

#### 1. Product Validation Research
**Focus**: Validate product hypotheses and market fit

Use when you need to:
- Validate product hypotheses and assumptions
- Test assumptions about user needs and solutions
- Assess technical and business feasibility
- Identify risks and mitigation strategies
- Validate problem-solution fit

**Key Questions**:
- Does this product solve a real problem?
- Will users actually pay for this solution?
- Is this technically feasible?
- What are the critical risks?

#### 2. Market Opportunity Research
**Focus**: Analyze market size and growth potential

Use when you need to:
- Analyze market size and growth potential
- Identify market segments and dynamics
- Assess market entry strategies
- Evaluate timing and market readiness
- Understand competitive landscape

**Key Questions**:
- How big is this market?
- Is it growing or shrinking?
- Who are the key players?
- What's our opportunity window?

#### 3. User & Customer Research
**Focus**: Deep dive into user personas and behaviors

Use when you need to:
- Deep dive into user personas and behaviors
- Understand jobs-to-be-done and pain points
- Map customer journeys and touchpoints
- Analyze willingness to pay and value perception
- Identify user segments and priorities

**Key Questions**:
- Who are our users really?
- What problems do they face daily?
- What would they pay to solve these problems?
- How do they currently solve these problems?

#### 4. Competitive Intelligence Research
**Focus**: Detailed competitor analysis and positioning

Use when you need to:
- Detailed competitor analysis and positioning
- Feature and capability comparisons
- Business model and strategy analysis
- Identify competitive advantages and gaps
- Understand competitor strengths and weaknesses

**Key Questions**:
- Who are our main competitors?
- What are their strengths and weaknesses?
- How do we differentiate?
- What can we learn from their approach?

#### 5. Technology & Innovation Research
**Focus**: Assess technology trends and possibilities

Use when you need to:
- Assess technology trends and possibilities
- Evaluate technical approaches and architectures
- Identify emerging technologies and disruptions
- Analyze build vs. buy vs. partner options
- Understand technology maturity and risks

**Key Questions**:
- What technologies should we consider?
- What's the state of the art?
- Build, buy, or partner?
- What are the technical risks?

#### 6. Industry & Ecosystem Research
**Focus**: Map industry value chains and dynamics

Use when you need to:
- Map industry value chains and dynamics
- Identify key players and relationships
- Analyze regulatory and compliance factors
- Understand partnership opportunities
- Assess industry trends and shifts

**Key Questions**:
- How does this industry work?
- Who are the key players and influencers?
- What regulations apply?
- What partnerships make sense?

#### 7. Strategic Options Research
**Focus**: Evaluate different strategic directions

Use when you need to:
- Evaluate different strategic directions
- Assess business model alternatives
- Analyze go-to-market strategies
- Consider expansion and scaling paths
- Compare strategic trade-offs

**Key Questions**:
- What are our strategic options?
- Which path should we take?
- What are the trade-offs?
- How do we prioritize?

#### 8. Risk & Feasibility Research
**Focus**: Identify and assess various risk factors

Use when you need to:
- Identify and assess various risk factors
- Evaluate implementation challenges
- Analyze resource requirements
- Consider regulatory and legal implications
- Assess technical and operational feasibility

**Key Questions**:
- What could go wrong?
- Is this feasible given our resources?
- What are the regulatory hurdles?
- What's our risk mitigation strategy?

#### 9. Custom Research Focus
**Focus**: User-defined research objectives

Use when you need to:
- User-defined research objectives
- Specialized domain investigation
- Cross-functional research needs
- Unique research requirements

## Workflow Process

### Step 1: Input Processing

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

### Step 2: Research Focus Selection

Present the 9 research type options (see above) and ask:

"Which research focus best fits your needs? Select 1-9, or I can help you decide based on your context."

### Step 3: Research Prompt Development

**CRITICAL:** Collaboratively develop a comprehensive research prompt with these components.

#### A. Research Objectives

Articulate clear, specific objectives:
- **Primary Research Goal**: What is the main purpose?
- **Key Decisions**: What decisions will this research inform?
- **Success Criteria**: How will we know if research was successful?
- **Constraints & Boundaries**: What's in scope and out of scope?

#### B. Research Questions

Develop specific, actionable research questions organized by theme.

**Core Questions** (Must Answer):
- Central questions that must be answered
- Priority ranking of questions
- Dependencies between questions

**Supporting Questions** (Nice to Have):
- Additional context-building questions
- Nice-to-have insights
- Future-looking considerations

#### C. Research Methodology

**Data Collection Methods**:
- Secondary research sources (which types?)
- Primary research approaches (if applicable)
- Data quality requirements
- Source credibility criteria

**Analysis Frameworks**:
- Specific frameworks to apply (SWOT, Porter's Five Forces, etc.)
- Comparison criteria
- Evaluation methodologies
- Synthesis approaches

#### D. Output Requirements

**Format Specifications**:
- Executive summary requirements
- Detailed findings structure
- Visual/tabular presentations
- Supporting documentation needs

**Key Deliverables**:
- Must-have sections and insights
- Decision-support elements
- Action-oriented recommendations
- Risk and uncertainty documentation

### Step 4: Prompt Generation

Generate a comprehensive research prompt following this template:

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

1. **Use with AI Research Assistant**: Provide this prompt to an AI model with research capabilities
2. **Guide Human Research**: Use as a framework for manual research efforts
3. **Hybrid Approach**: Combine AI and human research using this structure

**Integration Points:**

- How findings will feed into next phases
- Which team members should review results
- How to validate findings
- When to revisit or expand research

## Research Type Templates

### Product Validation Research Template

```markdown
## Objective
Validate [product concept] solves real user problems and is technically/commercially feasible

## Core Questions
1. Does the problem we're solving actually exist and matter to users?
2. Will our proposed solution effectively address this problem?
3. Are users willing to pay for this solution?
4. Is this technically feasible with available resources?
5. What are the critical risks that could derail this product?

## Methodology
- User interviews and surveys
- Competitor analysis
- Technical feasibility assessment
- Market sizing
- Risk analysis

## Deliverables
- Problem validation report
- Solution validation findings
- Willingness-to-pay analysis
- Technical feasibility assessment
- Risk register with mitigations
```

### Technology Assessment Template

```markdown
## Objective
Evaluate technology options for [specific need] and recommend best approach

## Core Questions
1. What technology options exist for solving [problem]?
2. What are the pros/cons of each option?
3. Which option best fits our constraints (cost, timeline, team skills)?
4. What are the long-term implications of each choice?
5. Should we build, buy, or partner?

## Methodology
- Technology landscape analysis
- Capability comparison
- Cost-benefit analysis
- Risk assessment
- Team readiness evaluation

## Deliverables
- Technology comparison matrix
- Recommendation with clear rationale
- Implementation considerations
- Risk mitigation strategies
```

## Examples

### Example 1: Database Technology Selection

```
User: "Help me research database options for our new SaaS application"

Skill:
1. Identifies this as Technology & Innovation Research
2. Asks about context: scale, data model, team expertise
3. Generates research prompt covering:
   - SQL vs NoSQL trade-offs
   - Managed vs self-hosted
   - Cost at various scales
   - Team learning curve
   - Migration complexity
4. Provides framework for evaluating options
5. User can now use prompt with research tools
```

### Example 2: Market Opportunity Analysis

```
User: "We're considering building a project management tool for remote teams"

Skill:
1. Identifies this as Market Opportunity Research
2. Extracts key details from user's description
3. Generates comprehensive research prompt:
   - Market size and growth
   - Competitive landscape (Asana, Monday, etc.)
   - User segments and needs
   - Pricing analysis
   - Market entry strategy
4. Includes specific deliverables needed
```

## Important Notes

- **Quality of prompt directly impacts quality of insights** - be specific not general
- **Consider both current state and future implications** in questions
- **Balance comprehensiveness with focus** - don't try to answer everything
- **Document assumptions and limitations clearly**
- **Plan for iterative refinement** based on initial findings
- **Make questions actionable** - avoid vague or unanswerable questions

## Resources

This skill includes:

- **Research Type Templates** (`resources/research-types.md` - if created)
  - Pre-built templates for common research types
  - Sample questions and frameworks
  - Methodology guidance

## Success Criteria

A successful research prompt includes:

✅ Clear, specific research objectives
✅ Actionable, prioritized research questions
✅ Appropriate methodology defined
✅ Clear deliverable expectations
✅ Success criteria for evaluation
✅ Realistic scope and constraints
✅ Consideration of available resources
✅ Next steps and integration plan

## Notes

- Research prompts are planning tools - they guide but don't execute research
- Good prompts lead to focused, actionable insights
- Iterate on prompts as you learn more
- Share prompts with stakeholders for alignment
- Use prompts to coordinate between AI and human researchers
- Archive prompts and findings for future reference

---

**Remember**: A well-crafted research prompt is half the battle - it ensures you ask the right questions and get actionable insights that inform better decisions.
