# Implementation Plan - Story 165.1: HTML5 Semantic Layout & Sticky Navigation Header

## Objective
Build the semantic HTML5 core page shell, sticky responsive navigation header with logo, anchor links, CTA button, and mobile drawer toggle for the Rebirth Wallet landing page.

## Execution Steps

1. **Step 1: Core HTML5 Markup Structure**
   - Create `index.html` with semantic `<header>`, `<nav>`, `<main>`, and target section anchors (`#features`, `#testimonials`, `#contact`, `#download`).
   - Include ARIA attributes (`aria-expanded`, `aria-controls`, `aria-label`) on mobile menu toggle button.

2. **Step 2: CSS Stylesheet & Layout System**
   - Create CSS custom properties for dark theme tokens, glassmorphism backdrop filters, typography, and responsive grid layout.
   - Implement sticky positioning for navigation header (`position: sticky; top: 0; z-index: 1000`).
   - Add media queries for mobile viewports (<768px) and drawer styling.

3. **Step 3: Vanilla JS Navigation Controller**
   - Implement `navigation.js` to manage mobile hamburger toggle click events, `aria-expanded` toggling, focus trapping, and `Escape` key listeners.
   - Enable smooth section scrolling and target section scroll margins.

4. **Step 4: Verification & Smoke Test**
   - Verify viewport responsiveness, keyboard navigation, and ARIA state updates.
