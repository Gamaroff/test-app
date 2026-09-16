---
name: humanize-text
description: This skill should be used when rewriting AI-generated text to sound completely human, eliminating detection patterns and robotic flow. Use when content needs to pass AI detection tools, sound conversational, or add human personality to technical/formal content.
version: 1.0.0
tags: [writing, content, ai-detection, humanization, rewriting, text-transformation]
examples:
  - "Humanize this text: [paste AI text]"
  - "Make this sound more human: [paste text]"
  - "Rewrite to avoid AI detection: [paste text]"
  - "/humanize-text"
---

# Humanize Text

## Purpose

Transform AI-generated text into natural, human-sounding content by eliminating detection triggers, varying rhythm, adding imperfections, and injecting personality.

## When to Use This Skill

Use this skill when:
- AI-generated text sounds robotic or formulaic
- Content needs to pass AI detection tools
- Writing needs to sound conversational and authentic
- Text feels too polished, corporate, or patterned
- Adding human personality to technical or formal content is needed

## Skill Invocation Patterns

### With Text Provided
When the user provides text in the initial invocation:
- Proceed directly to the humanization process
- Apply all transformation rules
- Output the complete response format

### Without Text
When the user invokes `/humanize-text` without providing text:
1. Display: "Please provide the AI-generated text to humanize:"
2. Wait for user to paste content
3. Once received, proceed to humanization process
4. Apply all transformation rules
5. Output the complete response format

### Example Invocations
```
/humanize-text [paste AI text here]
/humanize-text
  → System prompts for text
  → User provides text
  → System processes and outputs result
```

## AI Detection Triggers (What to Eliminate)

❌ **Kill these patterns:**
- Perfect grammar (humans make small mistakes)
- Repetitive sentence structure (AI loves patterns)
- Corporate buzzwords ("leverage," "delve," "landscape")
- Overuse of transitions ("moreover," "furthermore," "however")
- Even pacing (humans speed up and slow down)
- No contractions (we use them constantly)
- Safe, sanitized language (humans have opinions)

## Humanization Rules

### 1. VARY RHYTHM
- Mix short punchy sentences with longer flowing ones
- Some incomplete thoughts. Because that's real.
- Occasional run-on that feels natural in conversation

### 2. ADD IMPERFECTION
- Start sentences with "And" or "But"
- Use casual connectors: "Look," "Here's the thing," "Honestly"
- Include subtle typos occasionally (not every time)
- Drop a comma here and there

### 3. INJECT PERSONALITY
- Use specific examples, not generic ones
- Add personal observations: "I've noticed," "In my experience"
- Include mild opinions: "which is insane," "surprisingly effective"
- Throw in rhetorical questions

### 4. KILL AI PHRASES

For a comprehensive list of AI phrases and their human alternatives, see `references/ai-phrases-database.md`.

**Most common replacements:**
- "Delve" → "dig into" or "explore"
- "Leverage" → "use"
- "Robust" → "strong" or specific descriptor
- "Streamline" → "simplify"
- "Moreover" → "Plus," "Also," or nothing
- "Ensure" → "make sure"
- "In order to" → "to"

### 5. NATURAL FLOW
- Humans digress slightly (add brief tangents)
- We emphasize with italics or bold
- We use dashes—like this—for emphasis
- Parentheticals (because we think while writing)

## The Humanization Process

When the user provides AI-generated text, follow this process:

### STEP 0: Assess Content Context
Before applying transformations:
1. Identify content type:
   - Blog posts → Very casual, conversational tone
   - Technical documentation → Less casual, maintain clarity
   - Social media → Maximum casualness, high personality
   - Business content → Moderately casual, professional but human
   - Legal/medical/academic → Minimal humanization (warning flag)

2. Adjust transformation intensity:
   - High casualness: 80-90% of transformations applied
   - Medium casualness: 50-70% of transformations applied
   - Low casualness: 30-50% of transformations applied
   - Minimal humanization: Focus only on removing obvious AI phrases

3. Warn user if context is inappropriate:
   "⚠️ This appears to be [legal/medical/academic] content. Minimal
   humanization will be applied to maintain professional accuracy."

### STEP 1: Rewrite with Transformations
- Vary sentence length wildly
- Replace 80% of transitions with casual ones
- Add 2-3 personal touches ("I think," "honestly," "look")
- Include 1-2 incomplete sentences or fragments
- Swap formal words for conversational ones
- Add emphasis (italics, bold, dashes)

### STEP 2: Read-Aloud Test
- Would someone actually say this?
- Does it flow like conversation?
- Does any word feel too "AI"?

### STEP 3: Final Pass
- Remove remaining stiffness
- Ensure contractions are used (don't, won't, I'm, they're)
- Check for repetitive structure
- Add one unexpected comparison or example

## Output Format

Provide the humanized text using this structure:

**Original Text:**
[Display the user's AI-generated text]

**Humanized Version:**
[Display the rewritten text with transformations applied]

**Changes Made:**
- [Transformation 1]
- [Transformation 2]
- [Transformation 3]
- [Additional transformations as needed]

**Detection Risk Assessment:**
- **Risk Level**: Low | Medium | High
- **Reasoning**: [Brief explanation of why this level was assigned]

## Example Transformation

**Original (AI-generated):**
```
In order to achieve optimal results in content marketing, it is essential to leverage data-driven insights and ensure consistent engagement with your target audience across multiple platforms.
```

**Humanized:**
```
Want better content marketing results? Use data to guide your decisions and actually engage with your audience. Consistently. Across whatever platforms they're on.

Not rocket science, but most people skip the data part.
```

**Changes Made:**
- Killed "in order to," "optimal," "leverage," "ensure"
- Added rhetorical question opening
- Split into two short paragraphs for breathing room
- Added casual observation at end
- Used contractions

**Detection Risk**: Low—reads like someone explaining over coffee.

## Usage Guidelines

1. **Preserve meaning**: While changing tone and structure, maintain the core message and key information.

2. **Match context**: Adjust the level of casualness based on the content type (see STEP 0 in The Humanization Process):
   - Blog posts: Very casual, conversational
   - Technical docs: Less casual, but still natural
   - Social media: Maximum casualness
   - Business content: Moderately casual, professional but human

3. **Balance imperfection**: The goal is natural, not sloppy. Balance imperfection with readability.

4. **Explain choices**: Always explain what was changed and why in the "Changes Made" section.

## Anti-Patterns (What NOT to Do)

- Don't replace every single word—selective changes are more effective
- Don't add profanity unless the context clearly calls for it
- Don't lose technical accuracy in pursuit of casualness
- Don't make it so casual it loses professionalism for business contexts
- Don't introduce factual errors or change the core message

## Success Criteria

A successfully humanized text should:
- Pass the "read it aloud" test
- Vary significantly in sentence length and structure
- Include at least 3-4 contractions
- Feel conversational without being unprofessional
- Have at least one personal touch or observation
- Eliminate all obvious AI buzzwords
- Flow naturally from one idea to the next

## Transformation Intensity Examples

### High Casualness (Blog Posts, Social Media)
**Original:** "In order to achieve optimal results, it is essential to leverage best practices."
**Transformed:** "Want better results? Use best practices."

### Medium Casualness (Business Content)
**Original:** "In order to achieve optimal results, it is essential to leverage best practices."
**Transformed:** "To achieve the best results, use proven best practices."

### Low Casualness (Technical Documentation)
**Original:** "In order to achieve optimal results, it is essential to leverage best practices."
**Transformed:** "To achieve optimal results, use established best practices."

## References

For comprehensive lists and detailed guidance:
- `references/ai-phrases-database.md` - Complete AI phrase replacements, context-specific examples, and transformation patterns

## Notes

- This skill is about **tone and style**, not content accuracy
- Some formal contexts (legal, medical, academic) may require less humanization
- The goal is "sounds human" not "sounds like a specific person"—avoid imitating particular writing styles unless requested

---

**Skill Version**: 1.0.0
**Last Updated**: 2026-02-11
**Maintainer**: your app System Skills
