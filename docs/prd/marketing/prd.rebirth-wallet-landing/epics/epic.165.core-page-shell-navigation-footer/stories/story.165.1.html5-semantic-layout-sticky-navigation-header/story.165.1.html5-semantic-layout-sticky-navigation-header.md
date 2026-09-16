---
epic: epic.165.core-page-shell-navigation-footer
title: "HTML5 Semantic Layout & Sticky Navigation Header"
type: story
description: "Build semantic HTML5 core page shell, sticky responsive navigation header with Rebirth Wallet logo, section anchor links, CTA button, and mobile hamburger drawer."
tags: [marketing, landing-page, navigation, header, layout]
status: Ready for Review
priority: High
estimated_effort_hours: 2
assignee: TBD
github_issue: 2
created: 2026-09-16
updated: 2026-09-16
---

# [Story 165.1] HTML5 Semantic Layout & Sticky Navigation Header

## Story Statement

**As a** site visitor,  
**I want** a responsive navigation header with quick links and logo,  
**so that** I can easily navigate through the page sections on any device.

## Story Information

| Field | Value |
| --- | --- |
| Epic | [Epic 165: Core Page Shell, Navigation & Footer](../../epic.165.core-page-shell-navigation-footer.md) |
| Priority | High |
| Effort Estimate | 2h |
| Status | Ready for Review |
| GitHub Issue | [#2](https://github.com/Gamaroff/test-app/issues/2) |

## Acceptance Criteria

1. **Given** a user loads the landing page on any device  
   **When** viewing the top of the viewport  
   **Then** a sticky navigation bar is present featuring the Rebirth Wallet logo, section anchor links (Features, Testimonials, Contact), and a "Download App" CTA button

2. **Given** a mobile viewport width below 768px  
   **When** the user taps the hamburger menu icon  
   **Then** a responsive mobile menu drawer toggles smoothly with proper `aria-expanded` and focus management

3. **Given** a user clicks any section navigation link  
   **When** the link is activated  
   **Then** the page smoothly scrolls to the target section element

## Dev Notes

### Previous Story Insights
- No previous story exists in this epic (first story in Epic 165).

### Git History Insights
- Initial commit created on `develop` branch.

### Data Models
- No server or database models required for this static landing page shell.
- Local UI State (ES6 Module / DOM):
  - `isMenuOpen`: Boolean state toggling `.is-open` class on mobile menu container and updating `aria-expanded="true|false"` on hamburger button.

### API Specifications
- No API endpoints required for this story. Navigation relies on client-side HTML anchor tags (`href="#features"`, `href="#testimonials"`, `href="#contact"`).

### Component Specifications
- **Header Shell (`<header class="site-header">`)**:
  - CSS layout: `position: sticky; top: 0; z-index: 1000; backdrop-filter: blur(12px); background: rgba(11, 15, 25, 0.85); border-bottom: 1px solid rgba(255, 255, 255, 0.1);` [Source: docs/prd/marketing/prd.rebirth-wallet-landing/prd.rebirth-wallet-landing.md#section-3]
- **Logo Container (`<a href="#" class="brand-logo">`)**:
  - Inline SVG or WebP logo mark with "Rebirth Wallet" text brand mark.
- **Desktop Navigation Links (`<nav class="nav-desktop">`)**:
  - Unordered list of anchor links: `<a href="#features">Features</a>`, `<a href="#testimonials">Testimonials</a>`, `<a href="#contact">Contact</a>`.
  - Download CTA button: `<a href="#download" class="btn btn-primary">Download App</a>`.
- **Mobile Menu Hamburger Toggle (`<button class="hamburger-toggle" aria-expanded="false" aria-controls="mobile-drawer" aria-label="Toggle navigation menu">`)**:
  - Visible only on viewports `< 768px`.
  - Icon: SVG 3-bar hamburger animating to X (close) when active.
- **Mobile Navigation Drawer (`<div id="mobile-drawer" class="mobile-drawer" aria-hidden="true">`)**:
  - Slide-down or fade-in overlay drawer containing navigation links and CTA.
  - Focus trapping and Escape key handler for WCAG 2.1 AA accessibility compliance. [Source: docs/prd/marketing/prd.rebirth-wallet-landing/prd.rebirth-wallet-landing.md#section-22]

### File Locations
- HTML document shell: `index.html`
- Global & layout styles: `src/css/styles.css`
- Navigation JS module: `src/js/navigation.js`
- Test suite: `tests/navigation.test.js`

### Testing Requirements
- **Unit/DOM Tests**:
  - Verify hamburger toggle updates `aria-expanded` attributes on click.
  - Verify mobile menu drawer receives `aria-hidden="false"` when opened.
- **Accessibility Audit**:
  - Validate 100/100 Lighthouse accessibility rating.
  - Verify keyboard focus indicator is visible on desktop links and mobile drawer buttons.

### Manual Testing Steps
**Prerequisites**:
- Serve static files using local HTTP server (e.g. `npx serve` or Live Server).

**Step 1: Desktop Navigation & Sticky Scroll Test**
1. Open browser on desktop resolution (1280px+).
2. Observe sticky header at top with logo, links (Features, Testimonials, Contact), and CTA button.
3. Scroll down the page; verify header remains fixed at the top with translucent dark glassmorphism background.
4. Click "Features"; verify smooth scroll transition to `#features` section.

**Step 2: Mobile Viewport & Hamburger Drawer Test**
1. Resize browser window to mobile width (<768px) or use Chrome DevTools Mobile View.
2. Verify desktop links hide and hamburger toggle button appears.
3. Click/tap hamburger icon; verify mobile menu drawer opens smoothly and `aria-expanded="true"` is set.
4. Press `Escape` key or click a navigation link; verify mobile drawer closes smoothly and focus returns to the toggle button.

### Security & Performance Notes
- Anchor navigation must avoid layout shifts (`scroll-margin-top: 80px` on sections to account for sticky header height). [Source: docs/prd/marketing/prd.rebirth-wallet-landing/epics/epic.165.core-page-shell-navigation-footer/epic.165.core-page-shell-navigation-footer.md#risk-mitigation]
- Zero external heavy JS framework dependencies to maintain LCP < 1.5s.

## Integration Verification

- **IV1**: Verify header renders sticky layout across Chrome, Safari, Firefox, and mobile viewport (<768px).
- **IV2**: Verify keyboard tab key navigation reaches logo, links, and CTA button in logical visual sequence.

## Tasks & Subtasks

- [x] **Task 1: HTML5 Semantic Document Shell & Navigation Markup**
  - [x] Create `index.html` with semantic `<header>`, `<nav>`, `<main>`, and empty target section stubs (`#features`, `#testimonials`, `#contact`, `#download`).
  - [x] Add logo link, navigation menu lists, and CTA button with accessible ARIA attributes.
- [x] **Task 2: CSS Layout, Sticky Header & Responsive Glassmorphism Styling**
  - [x] Define CSS custom properties for dark theme (#0B0F19 background, accent gradients, glassmorphism blur).
  - [x] Style sticky header bar (`position: sticky`, `top: 0`, `z-index: 1000`) and smooth scroll behavior (`html { scroll-behavior: smooth; }`).
  - [x] Style mobile navigation drawer and breakpoint media queries (`@media (max-width: 767px)`).
- [x] **Task 3: JavaScript Navigation Module & Mobile Drawer Toggle**
  - [x] Implement `src/js/navigation.js` to handle mobile drawer open/close toggling, `aria-expanded` updates, and Escape key dismissal.
  - [x] Implement smooth scrolling fallback/enhancement and active link highlighting on scroll.

## Dev Agent Record

### Implementation Notes
- Story drafted and initialized via `/create-story`.

### Debug Log References
- Pending implementation.

### Change Log
| Date | Version | Description | Author |
| :--- | :--- | :--- | :--- |
| 2026-09-16 | 1.0 | Initial story draft created | create-story |
