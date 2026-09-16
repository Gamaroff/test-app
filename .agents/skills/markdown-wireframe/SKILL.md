---
name: markdown-wireframe
description: >
  Create low-fidelity, mobile-focused outline wireframes to visualize bespoke user 
  interfaces based strictly on the provided brief. Use Stitch to generate fully 
  functional, monochrome, outline-based components before full development. 
  Ideal for early-stage mobile design validation, layout alignment, and rapid UI prototyping. 
  Triggers when requests mention wireframing, low-fidelity layouts, mobile prototypes, 
  monochrome outlines, or Stitch UI generation.
---

# Wireframe Prototyping

## Table of Contents

- [Overview](#overview)
- [When to Use](#when-to-use)
- [Quick Start](#quick-start)
- [Reference Guides](#reference-guides)
- [Best Practices](#best-practices)

## Overview

Wireframes and prototypes bridge the gap between raw ideas and implementation. For this agent, the process involves dynamically deconstructing a specific mobile brief into a text-based outline wireframe, getting user validation, and then using Stitch to output 100% complete, fully styled code without relying on generic, standard templates. 

## When to Use

- Early concept validation for bespoke mobile flows
- Structural alignment before writing complex code
- Rapid iteration based on precise user briefs
- Developer handoff (providing complete, production-ready TSX/SCSS files)
- Testing unique, non-standard layout interactions

## Quick Start

Minimal working example of the Agent Workflow:

```yaml
Agent Workflow:

1. Deconstruct Brief:
   Analyze request: "Mobile app, unique advertorial layout, no standard nav bars."

2. Generate Outline Wireframe:
   Format: Text/YAML structural map
   Detail: Mobile viewport constraints, specific element hierarchy based on brief
   Best For: Validating information architecture

3. Stitch Execution (Low Fidelity Wireframe):
   Tools: Stitch
   Detail: Fully functional TSX and SCSS files (no snippets)
   Style: Strictly monochrome grayscale outlines, NO colors, NO images (use box outlines with crossed diagonals or 'X'), NO icons (use text labels or simple box outlines).
   Best For: Visualizing information architecture and layout flow
```

## Reference Guides

Detailed implementations in the `references/` directory:

| Guide | Contents |
|---|---|
| [Prototyping Tools & Techniques](references/prototyping-tools-techniques.md) | Stitch Agent Workflow & Execution Rules |
| [Wireframe Examples](references/wireframe-examples.md) | Dynamic Brief-to-Outline Mapping |
| [Prototype Testing](references/prototype-testing.md) | Validating Mobile Ergonomics |

## Best Practices

### ✅ DO

- Extract layout structures directly from the user's brief.
- Provide the absolute full TSX and SCSS files when using Stitch.
- Use strictly monochrome, grayscale outline styling.
- Use box placeholders with crossed diagonal lines (the 'X' wireframe pattern) for images.
- Use text tags or simple geometric placeholders instead of real icons.
- Ensure fluid scaling, clean corner radii, and low-fidelity mockups.
- Create mobile-first, touch-optimized (44x44px minimum) targets.
- Get feedback on the text outline before generating code.

### ❌ DON'T

- Use any colors, gradients, images, or real icons.
- Use standard, generic, or "boring" templates (e.g., standard split screens).
- Provide code snippets or incomplete files (never use //...).
- Jump directly to Stitch before the outline is validated.
- Ignore the specific functional requirements of the brief.
