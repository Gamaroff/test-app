# Definition of Done Checklist

This document defines the comprehensive Definition of Done (DoD) criteria that must be verified before marking a story or task as "Accepted".

## Core Acceptance Criteria

### 1. Acceptance Criteria Verification

All acceptance criteria listed in the story/task document must be verified as complete:

**Check Format:**
- Look for markdown checkboxes in the document: `- [x]` indicates complete, `- [ ]` indicates incomplete
- All acceptance criteria checkboxes must be checked: `- [x]`
- If criteria are listed as numbered items without checkboxes, verify they are explicitly noted as complete

**Common Patterns:**
```markdown
## Acceptance Criteria
- [x] User can submit the form successfully
- [x] Validation errors are displayed correctly
- [x] Success message appears after submission
```

**Failure Pattern:**
```markdown
## Acceptance Criteria
- [x] User can submit the form successfully
- [ ] Validation errors are displayed correctly  ❌ INCOMPLETE
- [x] Success message appears after submission
```

### 2. Unit Tests and Code Review

**Required Evidence:**
- GitHub Pull Request number must be present in the document
- PR must exist and be accessible
- PR must have at least one approval from a code reviewer
- Test files must be referenced or linked

**Check Patterns:**
- PR references: `PR #123`, `Pull Request: #456`, `https://github.com/org/repo/pull/123`
- Test references: `tests written in src/feature.spec.ts`, `See test/integration/feature.test.ts`

**Verification Steps:**
1. Extract PR number from document
2. Use `gh pr view <number>` to check PR status
3. Verify PR has been reviewed and approved
4. Check that tests are mentioned or linked in PR description or story document

### 3. Documentation Updates

**Required Documentation:**
- If the story involves new features or API changes, documentation must be updated
- Common documentation locations:
  - `docs/` directory updates
  - README updates
  - API documentation (Swagger/OpenAPI)
  - Inline code comments for complex logic
  - Architecture decision records (ADRs) if applicable

**Check Patterns:**
- Look for documentation references in the story/task document
- Check PR description for documentation updates
- For API changes: Verify Swagger/OpenAPI specs are updated
- For new features: Verify user-facing documentation exists

**Common Documentation Requirements by Story Type:**
| Story Type | Documentation Required |
|------------|------------------------|
| API Endpoint | Swagger/OpenAPI spec, API docs |
| UI Feature | User guide, screenshots |
| Data Model | Schema documentation, ERD updates |
| Configuration | Configuration guide, environment variable docs |
| Bug Fix | Update known issues list if applicable |

## Security Review Checklist

The security review is **mandatory** for all stories. The depth of review varies by story type.

### Security Checklist by Story Type

#### API/Backend Stories

**Authentication & Authorization:**
- [ ] All endpoints have proper authentication checks
- [ ] Authorization rules are correctly implemented (role-based, permission-based)
- [ ] JWT tokens are validated correctly
- [ ] Session management is secure

**Input Validation:**
- [ ] All user inputs are validated (type, length, format)
- [ ] SQL injection prevention (parameterized queries, ORM usage)
- [ ] Command injection prevention (no unsanitized shell commands)
- [ ] Path traversal prevention (validate file paths)
- [ ] XSS prevention (output encoding, Content Security Policy)

**Data Protection:**
- [ ] Sensitive data is encrypted at rest (passwords, tokens, PII)
- [ ] Sensitive data is encrypted in transit (HTTPS/TLS)
- [ ] No sensitive data in logs or error messages
- [ ] Proper use of environment variables for secrets

**Error Handling:**
- [ ] No stack traces or sensitive info leaked in error responses
- [ ] Generic error messages to clients, detailed logs server-side
- [ ] Proper HTTP status codes used

**Dependencies:**
- [ ] No known vulnerabilities in dependencies (check `npm audit`)
- [ ] Dependencies are up-to-date or vulnerability is documented/accepted

#### UI/Frontend Stories

**XSS Prevention:**
- [ ] User input is properly sanitized before rendering
- [ ] Dangerous HTML is escaped or sanitized
- [ ] Content Security Policy (CSP) headers configured

**Authentication/Session:**
- [ ] Tokens stored securely (not in localStorage for sensitive apps, use httpOnly cookies)
- [ ] Logout functionality clears all auth state
- [ ] Session timeout implemented

**Data Exposure:**
- [ ] No sensitive data exposed in client-side code
- [ ] API keys not hardcoded
- [ ] No PII in analytics or logging

**Navigation Security:**
- [ ] Protected routes require authentication
- [ ] Unauthorized access redirects appropriately

#### Data/Database Stories

**Access Control:**
- [ ] Database credentials secured (environment variables, secrets management)
- [ ] Principle of least privilege applied (service accounts have minimal permissions)
- [ ] Row-level security (RLS) if applicable

**Data Integrity:**
- [ ] Foreign key constraints defined
- [ ] Unique constraints on appropriate fields
- [ ] Proper indexing for query performance

**Migration Safety:**
- [ ] Database migrations are reversible
- [ ] No data loss in migrations
- [ ] Backups verified before destructive operations

**Sensitive Data:**
- [ ] PII fields encrypted or hashed
- [ ] Proper retention policies applied
- [ ] GDPR/compliance requirements met

#### Authentication/Authorization Stories

**Password Security:**
- [ ] Passwords hashed with bcrypt/argon2 (never plain text or weak hashing)
- [ ] Minimum password strength enforced
- [ ] Password reset flow is secure (tokens expire, one-time use)

**Token Security:**
- [ ] JWT secrets are strong and stored securely
- [ ] Token expiration configured appropriately
- [ ] Refresh token rotation implemented
- [ ] No sensitive data in JWT payload

**Multi-Factor Authentication (if applicable):**
- [ ] MFA implementation follows TOTP/HOTP standards
- [ ] Backup codes generated securely

**Session Management:**
- [ ] Sessions expire after inactivity
- [ ] Sessions invalidated on logout
- [ ] Concurrent session handling defined

#### Infrastructure/DevOps Stories

**Deployment Security:**
- [ ] Secrets not committed to version control
- [ ] Environment variables properly configured
- [ ] Production environment isolated from dev/test

**Logging & Monitoring:**
- [ ] Security events logged (login attempts, access denials)
- [ ] Logs do not contain sensitive data
- [ ] Log retention policy defined

**Network Security:**
- [ ] Firewalls configured correctly
- [ ] Unnecessary ports closed
- [ ] TLS/SSL certificates valid and configured

### General Security Questions (All Story Types)

- [ ] Has the code been scanned for vulnerabilities? (SAST tools if available)
- [ ] Are there any TODOs or FIXMEs related to security?
- [ ] Does the implementation follow OWASP Top 10 guidelines?
- [ ] Have you considered the threat model for this feature?

## Compliance Review Checklist

Compliance requirements vary by project. This section covers common compliance areas.

### Data Privacy Compliance (GDPR, CCPA, etc.)

**If the story involves collecting, processing, or storing personal data:**

- [ ] **Data Minimization**: Only necessary data is collected
- [ ] **Consent**: User consent obtained where required
- [ ] **Right to Access**: Users can request their data
- [ ] **Right to Delete**: Users can request data deletion (GDPR Art. 17)
- [ ] **Right to Rectification**: Users can update their data
- [ ] **Data Portability**: Users can export their data (if applicable)
- [ ] **Data Retention**: Retention policy defined and implemented
- [ ] **Third-Party Sharing**: Any third-party data sharing is documented and consented

### Financial/Transaction Compliance (PCI-DSS, SOX, etc.)

**If the story involves financial transactions or payment data:**

- [ ] **PCI-DSS Compliance**: Payment card data handling meets PCI-DSS standards
- [ ] **No Card Data Storage**: Card numbers/CVV not stored unless PCI-DSS certified
- [ ] **Tokenization**: Payment details tokenized via payment processor
- [ ] **Audit Trail**: All transactions logged with timestamps and user IDs
- [ ] **Reconciliation**: Transaction records reconcilable with external systems

### Accessibility Compliance (WCAG, ADA, Section 508)

**If the story involves UI/UX changes:**

- [ ] **Keyboard Navigation**: All interactive elements accessible via keyboard
- [ ] **Screen Reader Support**: ARIA labels and roles properly used
- [ ] **Color Contrast**: WCAG AA contrast ratios met (4.5:1 for normal text)
- [ ] **Focus Indicators**: Visible focus states for interactive elements
- [ ] **Alternative Text**: Images have descriptive alt text

### Industry-Specific Compliance

**Healthcare (HIPAA):**
- [ ] Protected Health Information (PHI) encrypted
- [ ] Access controls and audit logs in place
- [ ] Business Associate Agreements (BAAs) with third parties

**Financial Services (SOX, FINRA):**
- [ ] Audit trails for all financial transactions
- [ ] Change management controls for production systems
- [ ] Data integrity and accuracy controls

**Government/Public Sector (FedRAMP, FISMA):**
- [ ] Security controls aligned with FedRAMP baseline
- [ ] Continuous monitoring implemented
- [ ] Incident response procedures documented

## Completion Status Decision Matrix

Use this matrix to determine if the story/task should be marked as "Accepted" or remain "In Progress":

| Criteria | Status | Decision |
|----------|--------|----------|
| All acceptance criteria met | ✅ Yes | Continue checking |
| All acceptance criteria met | ❌ No | **IN PROGRESS** - List missing criteria |
| Unit tests written & PR approved | ✅ Yes | Continue checking |
| Unit tests written & PR approved | ❌ No | **IN PROGRESS** - List missing tests/reviews |
| Documentation updated | ✅ Yes | Continue checking |
| Documentation updated | ❌ No | **IN PROGRESS** - List missing docs |
| Security review passed | ✅ Yes | Continue checking |
| Security review passed | ❌ No | **IN PROGRESS** - List security concerns |
| Compliance review passed | ✅ Yes | **ACCEPTED** ✅ |
| Compliance review passed | ❌ No | **IN PROGRESS** - List compliance issues |

## Gap Reporting Format

When criteria are not met, report gaps in this format:

```markdown
## Definition of Done - Gaps Identified

**Status:** IN PROGRESS

### Missing Criteria:

1. **Acceptance Criteria:**
   - [ ] Validation errors are displayed correctly (not yet implemented)

2. **Unit Tests:**
   - ⚠️ No PR number found in document. Please link the PR.

3. **Documentation:**
   - ⚠️ API endpoint documentation not updated in Swagger spec

4. **Security Review:**
   - ⚠️ Input validation missing for email field (XSS risk)
   - ⚠️ Password strength requirements not enforced

5. **Compliance Review:**
   - ⚠️ GDPR: No user consent flow implemented for data collection

### Next Steps:
- [ ] Complete missing acceptance criteria
- [ ] Add PR link to story document
- [ ] Update API documentation
- [ ] Implement input validation and password strength checks
- [ ] Add user consent flow for GDPR compliance

**Estimated Effort:** [Small/Medium/Large]
```

## Accepted Status Format

When all criteria are met, use this format:

```markdown
## Definition of Done - PASSED ✅

**Status:** ACCEPTED

All Definition of Done criteria have been verified:

✅ **Acceptance Criteria:** All 5 criteria met
✅ **Unit Tests:** PR #123 approved by 2 reviewers, tests in `src/feature.spec.ts`
✅ **Documentation:** API docs updated in `docs/api/endpoints.md`, Swagger spec updated
✅ **Security Review:** Input validation, authentication, and data protection verified
✅ **Compliance Review:** GDPR consent flow implemented, accessibility WCAG AA met

**Story marked as ACCEPTED on:** [Date]
```
