---
epic_number: 165
title: "Core Page Shell, Navigation & Footer"
type: epic
description: "Core semantic layout, sticky top navigation header with mobile drawer, and comprehensive footer with social links and legal references for Rebirth Wallet landing page."
tags: [marketing, landing-page, rebirth-wallet, navigation, footer]
domain: "marketing"
status: "📋 Planned"
priority: "High"
estimated_stories: 2
created: 2026-09-16
target_completion: 2026-09-23
prd_source: "docs/prd/marketing/prd.rebirth-wallet-landing/prd.rebirth-wallet-landing.md"
github_issue: 1
---

# [Epic 165] Core Page Shell, Navigation & Footer - Brownfield Enhancement

## Epic Goal

Establish the semantic HTML5 core page shell, sticky responsive navigation header with mobile drawer toggle, and a comprehensive footer with social icons and legal references to provide structural foundation and smooth site navigation.

## Epic Description

**Source PRD**: [View document](https://github.com/Gamaroff/test-app/blob/main/docs/prd/marketing/prd.rebirth-wallet-landing/prd.rebirth-wallet-landing.md)

**Existing System Context:**

- Current relevant functionality: Standalone marketing landing page module for Rebirth Wallet.
- Technology stack: HTML5, Vanilla CSS3 (Custom Properties, Flexbox, Grid), Vanilla ES6+ JavaScript.
- Integration points: Structural container shell for Hero, Features, Testimonials, Contact Form, and Legal Modals.

**Enhancement Details:**

- What's being added/changed: Sticky top navigation bar with logo, desktop/mobile links, CTA download button, mobile hamburger drawer, and complete footer section with social media links and copyright notice.
- How it integrates: Serves as the outer layout shell wrapping all landing page sections and providing anchor navigation routing across the page.
- Success criteria: Sticky navigation works on desktop and mobile (<768px), hamburger menu opens/closes smoothly with proper ARIA attributes, footer renders all required links with `rel="noopener noreferrer"`, and page achieves 100/100 Lighthouse score for accessibility and performance.

## Stories Breakdown

### Stories Overview

| Story | Status | Priority | Description |
| ----- | ------ | -------- | ----------- |
| 165.1 | ✅ Done | High | HTML5 Semantic Layout & Sticky Navigation Header |
| 165.2 | 📝 Draft | Medium | Footer Sitemap, Social Icons & Copyright Section |

### Story 165.1: HTML5 Semantic Layout & Sticky Navigation Header

As a site visitor,  
I want a responsive navigation header with quick links and logo,  
So that I can easily navigate through the page sections on any device.

**Acceptance Criteria:**

**Given** a user loads the landing page on any device  
**When** viewing the top of the viewport  
**Then** a sticky navigation bar is present featuring the Rebirth Wallet logo, section anchor links (Features, Testimonials, Contact), and a "Download App" CTA button  

**Given** a mobile viewport width below 768px  
**When** the user taps the hamburger menu icon  
**Then** a responsive mobile menu drawer toggles smoothly with proper `aria-expanded` and focus management  

**Given** a user clicks any section navigation link  
**When** the link is activated  
**Then** the page smoothly scrolls to the target section element  

### Story 165.2: Footer Sitemap, Social Icons & Copyright Section

As a site visitor,  
I want a comprehensive footer with social links and legal references,  
So that I can access community channels and legal terms.

**Acceptance Criteria:**

**Given** a user scrolls to the bottom of the landing page  
**When** viewing the footer area  
**Then** Rebirth Wallet branding, sitemap navigation links, social media icons (Twitter/X, Discord, Telegram, GitHub), and copyright statement are rendered cleanly  

**Given** any external social media link in the footer  
**When** clicked by the user  
**Then** the link opens in a new tab with `rel="noopener noreferrer"` attributes for security  

## Compatibility Requirements

- [ ] Existing APIs remain unchanged
- [ ] Database schema changes backward compatible
- [ ] UI changes follow existing patterns
- [ ] Performance impact minimal

## Risk Mitigation

- **Primary Risk:** Sticky header overlay obscuring section headings or causing layout shift on scroll.
- **Mitigation:** Use `position: sticky; top: 0; z-index: 1000;` with CSS `scroll-margin-top` on target sections.
- **Rollback Plan:** Revert CSS positioning rules and simplify header layout to standard static flow.

## Definition of Done

- [ ] All stories completed with acceptance criteria
- [ ] Existing functionality verified through testing
- [ ] Integration points working correctly
- [ ] Documentation updated appropriately
- [ ] No regression in existing features

## Completion Tracking

**Epic Progress**: [0%] (Update as stories complete)

**Timeline**:

- **Started**: 2026-09-16
- **Target**: 2026-09-23
- **Completed**: [Date]

**Story Completion**:

- Story 165.1: ✅ Done
- Story 165.2: 📝 Draft

## Change Log

| Date | Version | Description | Author |
| :--- | :--- | :--- | :--- |
| 2026-09-16 | 1.0 | Initial draft | create-epic |
