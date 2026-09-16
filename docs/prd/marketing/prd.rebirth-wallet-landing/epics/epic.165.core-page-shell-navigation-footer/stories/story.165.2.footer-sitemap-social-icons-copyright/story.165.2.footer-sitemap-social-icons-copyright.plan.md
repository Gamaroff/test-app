---
id: story.165.2.footer-sitemap-social-icons-copyright.plan
title: "Implementation Plan: Footer Sitemap, Social Icons & Copyright Section"
type: plan
story-ref: story.165.2.footer-sitemap-social-icons-copyright.md
---

# Implementation Plan: Footer Sitemap, Social Icons & Copyright Section

> Requirements and acceptance criteria: [story.165.2.footer-sitemap-social-icons-copyright.md](story.165.2.footer-sitemap-social-icons-copyright.md)

## Overview

Build semantic HTML5 footer section with Rebirth Wallet branding, sitemap navigation links, social media SVG icons, and legal copyright notice. Style using responsive CSS flexbox/grid layout and write unit tests in `tests/footer.test.js`.

## Task-by-Task Implementation Guide

### Task 1: HTML5 Footer Structure & Sitemap Markup

**Files to modify:**
- `index.html` — Add `<footer>` element after `<main id="main-content">` with semantic structure.

**Exact changes:**
- Add `<footer class="site-footer">` containing:
  - Brand section with SVG logo, title, and brand tagline.
  - Sitemap navigation links grouped into Product, Community, and Legal columns.
  - Social media icon links for Twitter/X, Discord, Telegram, and GitHub.
  - Ensure all external links include `target="_blank"` and `rel="noopener noreferrer"`.
  - Copyright line: `© 2026 Rebirth Wallet. All rights reserved.`

### Task 2: Responsive Footer Styling & Accessibility

**Files to modify:**
- `src/css/styles.css` — Add footer styling section.

**Exact changes:**
- Style `.site-footer` with background `var(--bg-secondary)` and top border `1px solid var(--border-glass)`.
- Use CSS Grid for 4-column desktop layout (`grid-template-columns: 2fr 1fr 1fr 1fr`) transitioning to single column on mobile viewport (`@media (max-width: 767px)`).
- Style social icon links with hover transition using `var(--accent-primary)`.
- Ensure proper focus indicator ring (`:focus-visible`) on all interactive footer links.

### Task 3: Footer Unit Testing & Verification

**Files to modify:**
- `tests/footer.test.js` — Create new test file for footer verification.
- `package.json` — Update test script to run all test files.

**Exact changes:**
- Create `tests/footer.test.js` using `node:test` and `node:assert/strict` to test `index.html` string content for:
  - Footer tag presence.
  - All 4 required social media links (Twitter/X, Discord, Telegram, GitHub).
  - Verification that every external link with `target="_blank"` has `rel="noopener noreferrer"`.
  - Copyright statement text.
- Update `package.json` `scripts.test` to `node --test tests/*.test.js`.

## Key Patterns and References

- Follow CSS custom property tokens defined in `src/css/styles.css` (`--bg-secondary`, `--text-secondary`, `--border-glass`, etc.).
- Follow testing pattern from `tests/navigation.test.js`.

## Testing Approach

- Execute `npm test` to run all unit tests.
