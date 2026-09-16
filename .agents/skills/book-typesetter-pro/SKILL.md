---
name: book-typesetter-pro
description: "Formats Markdown into a novel-style book with highlighted AI-synthesized transitions for editorial review."
version: "1.2.0"
---

# Book Typesetter & Continuity Skill (Review Mode)

## 1. Structural Transformation
- **Chapters:** Treat each `#` or `##` as a Chapter start. 
- **Page Breaks:** Insert `<div style="page-break-after: always;"></div>` before headers.
- **Drop Caps:** Wrap the first character of every chapter in `<span class="drop-cap">`.
- **First Paragraphs:** Ensure the first paragraph of every chapter has `text-indent: 0`.

## 2. Transparent Continuity Engine
- **Task:** Generate 1–3 transitional sentences (the "Bridge") between Chapter N and Chapter N+1.
- **Logic:** 1. Analyze the concluding theme of Ch. N and the opening theme of Ch. N+1.
    2. Synthesize a bridge that links the two ideas using the author's established voice.
- **Review Highlighting (Mandatory):** - All AI-generated bridge sentences **must** be wrapped in `<mark>` tags or `==highlight==` syntax.
    - Prefix the bridge with a bracketed label: `[AI BRIDGE: ...]`.
    - Example: `[AI BRIDGE: ==Consequently, Lewis began to see that his intellectual fortress was not as impenetrable as he once believed.==]`

## 3. Advanced Typesetting Rules
- **Quotes:** Convert `> ` to `<blockquote class="novel-quote">` with a 1pt font reduction.
- **Images:** Wrap in `<figure>` tags, center-aligned, with a `2em` vertical buffer.
- **Micro-Typography:** - Apply "Smart Quotes" (“ ” and ‘ ’).
    - Convert `--` to em-dashes (—).
    - Move inline URLs to footnoted citations `[^n]`.

## 4. Final Verification
- Ensure no "widows/orphans" are created by the insertion of the new bridge sentences.
- Verify that the highlighted bridges do not exceed 3 sentences to keep the author's original work as the primary focus.
