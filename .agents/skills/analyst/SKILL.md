---
name: analyst
description: Market research, competitive analysis, project briefs, and brainstorming for strategic business insights
---

# Business Analysis & Strategic Research

## When to Use This Skill

Use this skill when you need to:
- **Perform market research** and assess market opportunities
- **Create competitive analysis** reports and positioning strategies
- **Develop project briefs** for new initiatives
- **Facilitate brainstorming sessions** for ideation and problem-solving
- **Generate deep research prompts** for comprehensive analysis
- **Document existing projects** for AI-assisted development (brownfield)

## Purpose

This skill provides strategic analysis and research capabilities to support business decision-making, product planning, and project initiation. It helps gather insights, validate assumptions, and create foundational documents that guide product development.

## Available Commands

### Market Research
- **perform-market-research** - Create comprehensive market research report
  - Use the `create-doc` skill with market-research template
  - Analyzes TAM/SAM/SOM, customer segments, competitive landscape, industry trends
  - Produces structured markdown report with data-driven insights

### Competitive Analysis
- **create-competitor-analysis** - Generate detailed competitive analysis
  - Use the `create-doc` skill with competitor-analysis template
  - Profiles competitors, SWOT analysis, positioning maps, strategic recommendations
  - Includes monitoring plan for ongoing competitive intelligence

### Project Briefs
- **create-project-brief** - Develop comprehensive project brief
  - Use the `create-doc` skill with project-brief template
  - Defines problem, solution, target users, MVP scope, success metrics
  - Serves as input for PRD creation and architecture planning

### Brainstorming
- **brainstorm {topic}** - Facilitate structured brainstorming session
  - Delegates to `brainstorming` skill
  - Interactive session using proven ideation techniques
  - Produces categorized ideas with action planning

### Research Planning
- **research-prompt {topic}** - Create deep research prompt
  - Delegates to `research-prompt` skill
  - Develops comprehensive research objectives and methodology
  - Outputs structured prompt for thorough analysis

### Brownfield Documentation
- **document-existing-project** - Generate documentation for existing projects
  - Delegates to `document-existing-project` skill
  - Creates comprehensive technical documentation from codebase
  - Optimized for AI-assisted development workflows

## Integration with Other Skills

**Called by:**
- Project managers and product owners initiating new work
- Architects needing market context for technical decisions
- Scrum masters planning feature work

**Calls:**
- `create-doc` - For all template-based document creation
- `brainstorming` - For facilitated ideation sessions
- `research-prompt` - For research planning
- `document-existing-project` - For brownfield project documentation

**Outputs used by:**
- `pm` skill - Uses briefs and research for PRD creation
- `architect` skill - Uses technical research for architecture decisions
- `ux-expert` skill - Uses market research for design decisions

## Workflow

### 1. Market Research Workflow
```
1. Invoke: analyst perform-market-research
2. Define research objectives and methodology
3. Work through market overview, customer analysis, competitive landscape
4. Analyze industry using Porter's Five Forces
5. Assess opportunities and provide strategic recommendations
6. Output: docs/market-research.md
```

### 2. Competitive Analysis Workflow
```
1. Invoke: analyst create-competitor-analysis
2. Define analysis scope and prioritize competitors
3. Create detailed competitor profiles
4. Develop feature comparison matrices
5. Perform SWOT and positioning analysis
6. Generate strategic recommendations and monitoring plan
7. Output: docs/competitor-analysis.md
```

### 3. Project Brief Workflow
```
1. Invoke: analyst create-project-brief
2. Define problem statement and proposed solution
3. Identify target users and their needs
4. Establish goals and success metrics
5. Define MVP scope and post-MVP vision
6. Document constraints, risks, and open questions
7. Output: docs/brief.md
```

### 4. Brainstorming Workflow
```
1. Invoke: analyst brainstorm {topic}
2. Skill delegates to brainstorming skill
3. Interactive session with technique selection
4. Ideas captured and categorized
5. Action planning for top priorities
6. Output: docs/brainstorming-session-results.md
```

### 5. Research Prompt Workflow
```
1. Invoke: analyst research-prompt {topic}
2. Skill delegates to research-prompt skill
3. Select research focus type (9 options)
4. Develop objectives, questions, methodology
5. Define output requirements and success criteria
6. Output: Structured research prompt
```

### 6. Brownfield Documentation Workflow
```
1. Invoke: analyst document-existing-project
2. Skill delegates to document-existing-project skill
3. Analyze existing codebase
4. Document actual state (not aspirational)
5. Capture technical debt and constraints
6. Output: Comprehensive architecture documentation
```

## Resources

This skill uses the following resource files:

### Templates
- `resources/competitor-analysis-tmpl.yaml` - Competitive analysis report structure
- `resources/market-research-tmpl.yaml` - Market research report structure
- `resources/project-brief-tmpl.yaml` - Project brief document structure

## Best Practices

### Market Research
- **Start with clear objectives** - Define what decisions the research will inform
- **Quantify where possible** - Use data to support market sizing and opportunity assessment
- **Consider multiple perspectives** - Apply frameworks like PESTEL, Porter's Five Forces
- **Validate assumptions** - Test market hypotheses with evidence

### Competitive Analysis
- **Prioritize competitors** - Focus deep analysis on high-threat competitors
- **Look for gaps** - Identify unserved segments and blue ocean opportunities
- **Stay current** - Establish ongoing monitoring processes
- **Think strategically** - Go beyond features to business models and positioning

### Project Briefs
- **Be specific** - Avoid vague problem statements and solutions
- **Define MVP clearly** - Distinguish must-haves from nice-to-haves
- **Set measurable goals** - Use SMART criteria for objectives
- **Acknowledge unknowns** - Document risks and open questions proactively

### Brainstorming
- **Facilitate, don't dictate** - Guide the user to generate ideas, don't brainstorm for them
- **Use appropriate techniques** - Match technique to the problem type
- **Encourage divergence first** - Generate many ideas before converging
- **Capture everything** - No idea is too wild during ideation

## Notes

- **Task-focused approach**: This skill focuses on delivering specific analytical outputs rather than role-playing
- **Delegation pattern**: Complex workflows delegate to specialized skills (brainstorming, research-prompt, document-existing-project)
- **Template-driven**: Most documents use YAML templates processed by the create-doc skill
- **Integration ready**: Outputs are designed to feed into downstream PM, Architect, and UX workflows
