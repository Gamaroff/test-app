---
epic: epic.165.core-page-shell-navigation-footer
title: "Footer Sitemap, Social Icons & Copyright Section"
type: story
description: "Build comprehensive responsive footer section with Rebirth Wallet branding, sitemap navigation links, social media icons, and legal references."
tags: [marketing, landing-page, footer, sitemap, social-links]
status: Ready for Review
priority: Medium
estimated_effort_hours: 2
assignee: TBD
github_issue: 4
created: 2026-09-16
updated: 2026-09-16
---

# [Story 165.2] Footer Sitemap, Social Icons & Copyright Section

## Story Statement

**As a** site visitor,  
**I want** a comprehensive footer with social links and legal references,  
**so that** I can access community channels and legal terms.

## Story Information

| Field | Value |
| --- | --- |
| Epic | [Epic 165: Core Page Shell, Navigation & Footer](../../epic.165.core-page-shell-navigation-footer.md) |
| Priority | Medium |
| Effort Estimate | 2h |
| Status | Ready for Review |
| GitHub Issue | [#4](https://github.com/Gamaroff/test-app/issues/4) |

## Acceptance Criteria

1. **Given** a user scrolls to the bottom of the landing page  
   **When** viewing the footer area  
   **Then** Rebirth Wallet branding, sitemap navigation links, social media icons (Twitter/X, Discord, Telegram, GitHub), and copyright statement are rendered cleanly  

2. **Given** any external social media link in the footer  
   **When** clicked by the user  
   **Then** the link opens in a new tab with `rel="noopener noreferrer"` attributes for security  

## Dev Notes

### Previous Story Insights

- Story 165.1 established `index.html` page shell, `src/css/styles.css` design tokens (`--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent-primary`, `--border-glass`), and Node unit test runner (`node --test`).
- Mobile breakpoint is established at `< 768px` using CSS `@media (max-width: 767px)` for responsive single-column layouts.

### Data Models

- No specific database or backend data models required for landing page footer. [Source: docs/architecture/concepts/coding-standards.md]

### API Specifications

- No API endpoints required for static marketing footer section. [Source: docs/architecture/concepts/tech-stack.md]

### Component Specifications

- HTML5 semantic `<footer>` element with class `site-footer`.
- Rebirth Wallet branding block with brand logo SVG, brand title, and product tagline.
- Sitemap navigation columns:
  - **Product**: Features (`#features`), Download (`#download`), Security (`#features`).
  - **Community**: Twitter/X, Discord, Telegram, GitHub.
  - **Legal**: Privacy Policy (`#`), Terms of Service (`#`).
- Social media icon grid featuring SVGs for Twitter/X, Discord, Telegram, and GitHub.
- Security requirement: All external links (`target="_blank"`) MUST carry `rel="noopener noreferrer"`.
- Bottom bar containing copyright notice (`© 2026 Rebirth Wallet. All rights reserved.`) and legal links.
- Responsive layout: 4-column grid on desktop (>=768px), stacked single column on mobile (<768px). [Source: docs/architecture/concepts/coding-standards.md]

### File Locations

- Page markup: `index.html` (inside `<footer>` tag at bottom of body) [Source: docs/architecture/concepts/source-tree.md]
- CSS styling: `src/css/styles.css` (Section 5: Footer Styles) [Source: docs/architecture/concepts/source-tree.md]
- Unit tests: `tests/footer.test.js` [Source: docs/architecture/concepts/source-tree.md]

### Testing Requirements

- Unit test runner: `node --test tests/footer.test.js` using `node:test` and `node:assert/strict`.
- Verify presence of `<footer>` semantic tag in `index.html`.
- Verify external links for Twitter/X, Discord, Telegram, and GitHub have `target="_blank"` and `rel="noopener noreferrer"`.
- Verify copyright notice text. [Source: docs/architecture/concepts/coding-standards.md]

### Manual Testing Steps

**Prerequisites**:
- Serve or open `index.html` in a web browser.

**Navigation Path**:
1. Open `index.html` → Scroll down to the bottom of the viewport to view the footer.

**Verification Steps**:
- **AC1**: Scroll to bottom → Verify Rebirth Wallet logo, tagline, sitemap links (Product, Community, Legal), social media SVG icons, and copyright text are rendered cleanly. Resize browser window below 768px to confirm columns stack into a single vertical column.
- **AC2**: Click each social media icon and legal link → Verify link opens in a new tab and HTML source contains `target="_blank"` and `rel="noopener noreferrer"`.

**Edge Cases / Key Risks**:
- Tabnabbing security risk if `rel="noopener noreferrer"` is omitted on `target="_blank"` links.
- Layout breaking or icon misalignments on small viewports (<360px).

### Rollback Plan

- Revert additions to `index.html` and `src/css/styles.css`.
- Delete `tests/footer.test.js` and restore `package.json` test script.
- Rollback complexity: Simple (git revert).

### Technical Constraints

- Vanilla HTML5 and CSS3 only. No external frameworks or JS dependencies for rendering footer markup.
- Accessibility: Semantic HTML5 `<footer>`, aria labels on social links, focus outlines (`:focus-visible`), color contrast compliance.

## Tasks / Subtasks

> Detailed implementation guide: [story.165.2.footer-sitemap-social-icons-copyright.plan.md](story.165.2.footer-sitemap-social-icons-copyright.plan.md)

- [x] Task 1: Add HTML5 Semantic Footer Markup to `index.html` (AC: 1, 2)
  - [x] Add `<footer class="site-footer">` container at the bottom of `index.html`
  - [x] Add Rebirth Wallet branding block with SVG logo, title, and tagline
  - [x] Add sitemap navigation grid with Product, Community, and Legal link columns
  - [x] Add SVG icons for Twitter/X, Discord, Telegram, and GitHub with `target="_blank"` and `rel="noopener noreferrer"`
  - [x] Add bottom bar with copyright notice (`© 2026 Rebirth Wallet. All rights reserved.`)
- [x] Task 2: Implement Responsive CSS Styles for Footer (AC: 1)
  - [x] Add `.site-footer` base styles with `--bg-secondary` and top border `--border-glass` in `src/css/styles.css`
  - [x] Add CSS Grid layout for 4-column desktop display (min-width: 768px)
  - [x] Add mobile media query styling for stacked single-column layout (max-width: 767px)
  - [x] Add hover and focus-visible state styles for all footer links and social icons
- [x] Task 3: Create Unit Test Suite for Footer (AC: 1, 2)
  - [x] Create `tests/footer.test.js` to assert footer element presence and copyright text
  - [x] Add test assertion confirming all external links (`target="_blank"`) include `rel="noopener noreferrer"`
  - [x] Update `package.json` `test` script to execute all test files
  - [x] Run `npm test` and ensure all tests pass

## QA Handoff

**Completed**: [Date]  
**Developer**: [Name]  
**Branch**: [branch-name]  
**PR**: [PR link]  

### Summary of Changes

[Developer: describe what was built and any implementation decisions that affect testing]

### Testing Instructions for QA

[Developer: step-by-step instructions to verify the acceptance criteria manually]

### Areas Requiring Special Attention

[Developer: edge cases, integration points, or regressions most likely to surface]

### Known Limitations

[Developer: constraints, workarounds, or descoped items the QA tester should know]

### QA Prerequisites Checklist

- [ ] All acceptance criteria implemented
- [ ] Unit tests written and passing
- [ ] Integration tests passing (if applicable)
- [ ] Code review completed and approved
- [ ] PR merged to develop branch
- [ ] No console.log statements or debugging code left in
- [ ] CI/CD pipeline passing

## QA Report

[Link to QA report will be added here when QA testing is complete]

## Bug Reports

### Open Bugs

[No open bugs]

### In QA Verification

[No bugs in verification]

### Closed Bugs

[No closed bugs]

## Change Log

| Date | Version | Description | Author |
| :--- | :--- | :--- | :--- |
| 2026-09-16 | 1.0 | Initial draft | create-story |
