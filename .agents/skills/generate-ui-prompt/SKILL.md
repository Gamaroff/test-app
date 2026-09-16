---
name: generate-ui-prompt
description: Generate masterful, comprehensive prompts for AI-driven frontend development tools (v0, Lovable, etc.). Use when creating UI generation prompts that need to be optimized for code scaffolding and component generation.
---

# Generate AI Frontend Prompt

## Purpose

Create optimized, comprehensive prompts for AI-driven frontend development tools that generate high-quality UI code. This skill transforms your UI/UX specifications, architecture documents, and design files into powerful prompts that AI tools can use to scaffold components, pages, or entire applications.

## When to Use This Skill

Use this skill when you need to:

- **Generate UI components** using v0, Lovable, or similar AI tools
- **Scaffold new features** with proper structure and styling
- **Prototype interfaces** quickly with generated code
- **Create starting points** for frontend development
- **Translate designs to code** through AI assistance

**Prerequisites:** Have completed UI/UX specification and architecture documentation ready.

## Core Prompting Principles

Before generating prompts, understand these fundamental principles for effective AI code generation:

### 1. Be Explicit and Detailed

The AI cannot read your mind. Provide as much detail and context as possible. Vague requests lead to generic or incorrect outputs.

**Bad:** "Create a form"
**Good:** "Create a user registration form with React hooks, Tailwind CSS, real-time email validation, password strength indicator, and error states for each field"

### 2. Iterate, Don't Expect Perfection

Generating an entire complex application in one go is rare. The most effective method is to prompt for one component or one section at a time, then build upon the results.

**Strategy:** Start with core component → Add features → Refine styling → Integrate → Repeat

### 3. Provide Context First

Always start by providing the AI with necessary context:
- Tech stack (React, Vue, Svelte, etc.)
- Styling approach (Tailwind, CSS Modules, styled-components)
- Existing code snippets to match style
- Overall project goals and constraints

### 4. Mobile-First Approach

Frame all UI generation requests with a mobile-first design mindset:
1. Describe the mobile layout first
2. Provide separate instructions for tablet adaptations
3. Specify desktop enhancements last

## The Structured Prompting Framework

Every effective AI UI prompt follows this four-part framework:

### Part 1: High-Level Goal

Start with a clear, concise summary of the overall objective. This orients the AI on the primary task.

**Template:**
```
Create a [component/page type] that [main functionality] with [key features].
```

**Example:**
```
Create a responsive user registration form with client-side validation and API integration.
```

**Guidelines:**
- One sentence maximum
- Focus on the "what" not the "how"
- Mention the most important feature or constraint

### Part 2: Detailed, Step-by-Step Instructions

Provide a granular, numbered list of actions the AI should take. Break down complex tasks into smaller, sequential steps. This is the most critical part of the prompt.

**Template:**
```
1. [First action with specific details]
2. [Second action with specific details]
3. [Third action with specific details]
...
```

**Example:**
```
1. Create a new React component named `RegistrationForm.tsx`
2. Use React hooks (useState, useCallback) for state management
3. Add styled input fields using Tailwind CSS for: Name, Email, Password
4. For email field, implement real-time validation with regex pattern
5. For password field, show strength indicator (weak/medium/strong)
6. Add error message display below each field in red text
7. On form submission, call the /api/register endpoint
8. Show loading spinner during submission
9. Handle success by redirecting to /dashboard
10. Handle errors by displaying message and keeping form editable
```

**Guidelines:**
- Be extremely specific with each step
- Number all steps for clarity
- Include implementation details (hook names, CSS classes, API endpoints)
- Specify error handling and edge cases
- Mention state management approach

### Part 3: Code Examples, Data Structures & Constraints

Include relevant snippets of existing code, data structures, or API contracts. This gives the AI concrete examples to work with. **Crucially, state what NOT to do.**

**Template:**
```
Use this API endpoint:
[Endpoint details with request/response examples]

Expected data structure:
[JSON schema or TypeScript interfaces]

Styling guidelines:
[CSS framework, color palette, spacing rules]

Constraints:
- DO: [Required approaches]
- DO NOT: [Forbidden approaches]
```

**Example:**
```
Use this API endpoint:
POST /api/register
Request: { "name": "string", "email": "string", "password": "string" }
Response: { "success": boolean, "userId"?: string, "error"?: string }

Use these TypeScript interfaces:
interface RegistrationData {
  name: string;
  email: string;
  password: string;
}

interface ApiResponse {
  success: boolean;
  userId?: string;
  error?: string;
}

Styling guidelines:
- Use Tailwind CSS for all styling
- Primary color: blue-600
- Error color: red-500
- Border radius: rounded-lg
- Spacing: space-y-4 for form fields

Constraints:
- DO: Use controlled components with React hooks
- DO: Validate email format before submission
- DO: Show password as dots with toggle visibility option
- DO NOT: Include a 'confirm password' field
- DO NOT: Use class components
- DO NOT: Use inline styles
```

**Guidelines:**
- Provide actual code snippets when possible
- Include TypeScript types/interfaces
- Specify exact API contracts
- List styling requirements explicitly
- Be clear about forbidden approaches

### Part 4: Define a Strict Scope

Explicitly define the boundaries of the task. Tell the AI which files it can modify and, more importantly, which files to leave untouched to prevent unintended changes across the codebase.

**Template:**
```
File scope:
- CREATE: [New files to create]
- MODIFY: [Existing files to update]
- DO NOT MODIFY: [Files to leave untouched]

Component boundaries:
- This component should handle: [Responsibilities]
- This component should NOT handle: [Non-responsibilities]
```

**Example:**
```
File scope:
- CREATE: components/auth/RegistrationForm.tsx
- CREATE: hooks/useRegistration.ts
- MODIFY: pages/register.tsx (import and render RegistrationForm)
- DO NOT MODIFY: components/layout/Navbar.tsx
- DO NOT MODIFY: Any other existing pages or components

Component boundaries:
- RegistrationForm should handle: Form UI, validation, submission
- RegistrationForm should NOT handle: Routing, authentication state, session management
- Keep all API logic in useRegistration hook, not in the component
```

**Guidelines:**
- List all files to be created
- List all files to be modified
- Explicitly list files to NOT modify
- Define component responsibilities clearly
- Separate concerns (UI, logic, state management)

## Assembling the Master Prompt

Now that you understand the framework, here's how to create the complete prompt:

### Step 1: Gather Foundational Context

Start with a preamble describing:
- Overall project purpose
- Full tech stack (framework, language, styling, state management)
- Primary UI component library being used
- Project structure and conventions

**Example Preamble:**
```
I'm building a mobile account application using:
- React 18 with TypeScript
- Tailwind CSS for styling
- React Hook Form for form management
- Axios for API calls
- React Router for navigation

Project structure follows:
- components/ for reusable UI components
- pages/ for route components
- hooks/ for custom React hooks
- services/ for API integration
- types/ for TypeScript definitions

Naming conventions:
- PascalCase for components
- camelCase for functions and variables
- UPPERCASE for constants
```

### Step 2: Describe the Visuals

If design files exist:
- Provide Figma/Sketch links
- Reference specific frames or screens
- Include screenshots

If no design files:
- Describe visual style: color palette, typography, spacing
- Reference similar designs ("Material Design-like", "minimalist", "corporate")
- Specify overall aesthetic (modern, playful, professional, etc.)

**Example:**
```
Visual design:
- Style: Modern fintech aesthetic with soft shadows and rounded corners
- Colors: Primary #3B82F6 (blue), Success #10B981 (green), Error #EF4444 (red)
- Typography: Inter font family, 16px base, 1.5 line-height
- Spacing: 8px base unit (use Tailwind's spacing scale)
- Components: Material Design-inspired with subtle shadows
- Design file: https://figma.com/file/abc123 (Dashboard - Registration Flow frame)
```

### Step 3: Build the Four-Part Prompt

Combine all elements using the structured framework:

1. **High-Level Goal** (1-2 sentences)
2. **Detailed Instructions** (8-15 numbered steps)
3. **Code Examples & Constraints** (APIs, types, styling, DOs and DON'Ts)
4. **Strict Scope** (files to create/modify/avoid)

### Step 4: Present and Explain

Output the complete prompt in a copy-pasteable format:

````markdown
## Generated Prompt for AI UI Tool

```
[Complete prompt here with all four parts]
```
````

Then explain:
- Structure of the prompt and why each section is included
- Key decisions made and trade-offs considered
- Assumptions that should be validated
- Recommendations for iterative refinement

**IMPORTANT:** Remind the user that all AI-generated code requires:
- Careful human review for logic errors
- Testing (unit tests, integration tests, manual testing)
- Accessibility validation
- Security review (especially for auth and payment flows)
- Performance optimization
- Code style consistency with project standards

## Required Inputs

To generate an effective prompt, I need:

### Essential
1. **UI/UX Specification** - The completed front-end spec document
2. **Technical Architecture** - Frontend or full-stack architecture doc
3. **Component Description** - What you want to build
4. **Target AI Tool** - v0, Lovable, or other (for tool-specific optimizations)

### Highly Recommended
5. **Design Files** - Figma/Sketch links or screenshots
6. **API Contracts** - Endpoint definitions and response schemas
7. **Existing Code Context** - Similar components to match style

### Optional but Helpful
8. **Technical Preferences** - Specific libraries or patterns to use
9. **Accessibility Requirements** - WCAG level and specific needs
10. **Performance Constraints** - Load time or bundle size requirements

## Output Format

The generated prompt will be structured as:

```
=== FOUNDATIONAL CONTEXT ===
[Project overview, tech stack, conventions]

=== VISUAL DESIGN ===
[Style guide, colors, typography, design file references]

=== PROMPT ===

GOAL:
[High-level objective]

INSTRUCTIONS:
1. [Step 1]
2. [Step 2]
...

CODE EXAMPLES & CONSTRAINTS:
[API contracts]
[TypeScript types]
[Styling guidelines]
[DOs and DON'Ts]

SCOPE:
[Files to create/modify/avoid]
[Component boundaries]

===
```

## Best Practices

### For Mobile-First Prompts

1. **Describe mobile layout first:**
   - "On mobile (320-767px): Single column, stacked elements, full-width buttons"

2. **Then tablet adaptations:**
   - "On tablet (768-1023px): Two-column grid, side-by-side buttons"

3. **Finally desktop enhancements:**
   - "On desktop (1024px+): Three-column layout, hover states, expanded navigation"

### For Component Iteration

1. **Start basic:** Get core functionality working first
2. **Add features incrementally:** One at a time with new prompts
3. **Refine styling last:** Once functionality is solid
4. **Test between iterations:** Validate before adding more

### For Complex UIs

1. **Break into smaller components:** Don't prompt for entire pages
2. **Define clear interfaces:** Props, events, state for each component
3. **Build bottom-up:** Smallest components first, compose upward
4. **Use composition:** Smaller prompts with clear component boundaries

## Common Pitfalls to Avoid

❌ **Vague instructions** - "Make it look good"
✅ **Specific styling** - "Use Tailwind's shadow-lg, rounded-xl, and bg-blue-500"

❌ **No error handling** - Assuming happy path only
✅ **Explicit error states** - "Show red border and error message below field when validation fails"

❌ **Missing scope** - AI modifies unrelated files
✅ **Clear boundaries** - "Only create this component, don't modify routing"

❌ **Overambitious** - Entire app in one prompt
✅ **Incremental** - One component or feature at a time

## Integration with Workflow

This skill is typically used:

1. **After UI/UX specification** - Once design is documented
2. **Before manual coding** - To get a head start with generated code
3. **During prototyping** - For quick iterations on design ideas
4. **For routine components** - Forms, cards, lists that follow patterns

This skill works best alongside:
- **`create-frontend-spec`** - Provides the specification input
- **`ux-expert`** - Orchestrates the overall UX workflow
- Manual development - For refinement and integration

---

Remember: AI-generated code is a starting point, not a finish line. Always review, test, and refine!
