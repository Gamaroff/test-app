---
name: develop-pipeline-readme-mermaid-theme
description: Shared Mermaid theme/init block referenced by develop-story and develop-task README diagrams. Single source of truth — update here, both READMEs inherit. Mermaid treats `;` as a statement separator inside messages — do not use semicolons in arrow labels or notes.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-readme-mermaid-theme.md. Regenerate via `npm run bundle`. -->

# Mermaid Theme — develop-pipeline READMEs

> Mermaid treats `;` as a statement separator inside messages — do not use semicolons in arrow labels or notes.

```text
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#1f2937",
    "primaryTextColor": "#f3f4f6",
    "primaryBorderColor": "#9ca3af",
    "lineColor": "#9ca3af",
    "actorBkg": "#1f2937",
    "actorBorder": "#9ca3af",
    "actorTextColor": "#f9fafb",
    "signalColor": "#e5e7eb",
    "signalTextColor": "#e5e7eb",
    "labelBoxBkgColor": "#374151",
    "labelBoxBorderColor": "#9ca3af",
    "labelTextColor": "#f9fafb",
    "loopTextColor": "#f9fafb",
    "noteBkgColor": "#fde68a",
    "noteTextColor": "#1f2937",
    "noteBorderColor": "#b45309",
    "altBackground": "#374151",
    "sequenceNumberColor": "#1f2937"
  }
}}%%
```

## Usage

Per-skill READMEs reference this file in their "Mermaid Theme" section instead of embedding the init block. The block is documentation-only — diagrams below it use default Mermaid styling unless individually annotated.
