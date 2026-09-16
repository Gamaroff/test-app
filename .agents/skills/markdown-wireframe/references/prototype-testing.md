# Prototype Testing

## Validating Mobile Ergonomics

```yaml
Testing Plan:

Objective: Validate the bespoke mobile layout and Stitch code quality.

Test Method: Component Review and Mobile Viewport Emulation

Evaluation Criteria:
  1. Brief Adherence:
     - Does the layout match the custom requirements?
     - Are standard, boring templates completely avoided?
  
  2. Code Quality:
     - Are the TSX and SCSS files 100% complete?
     - Are snippets or placeholders absent?

  3. Aesthetic Rules (Low-Fidelity):
     - Are colors completely absent (strictly monochrome, grayscale outlines only)?
     - Are gradients completely absent?
     - Are real images replaced by outline boxes with crossed diagonals (X)?
     - Are icons absent (using simple shape boxes or text labels instead)?
     - Is the design clean, structural, and professional?

  4. Mobile Ergonomics:
     - Are touch targets at least 44x44px?
     - Does the UI scale fluidly within a 375px/393px width constraint?

Feedback Loop:
  - Identify missed requirements from the brief
  - Refine structural outline
  - Regenerate full Stitch files
```
