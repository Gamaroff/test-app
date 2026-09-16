---
name: tracker-state-poller-subagent
description: Read-only Explore subagent prompt for polling PR and issue state across GitHub/Jira/Bitbucket platforms. Returns compact JSON with pr and issue objects plus comments_count and errors[]. Used by pipeline steps 4, 5–6, and 7 to check tracker state without landing noisy CLI/API output in main context. Supports all four platform combos: GitHub/GitHub, GitHub/Bitbucket, Jira/GitHub, Jira/Bitbucket.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/tracker-state-poller-subagent.md. Regenerate via `npm run bundle`. -->

# Tracker State Poller — Explore Subagent

## Purpose

Read-only tracker state poll. Runs in an Explore subagent so raw CLI/MCP output never lands in main context. Returns compact JSON. **Never mutates tracker state.**

## Output Schema

```json
{
  "tracker": "jira|github",
  "vcs": "github|bitbucket",
  "pr": {
    "url": "https://...",
    "state": "OPEN|MERGED|CLOSED",
    "reviews_count": 0,
    "approved": false
  },
  "issue": {
    "key": "42 or PROJ-123",
    "state": "OPEN|CLOSED|In Progress|Done",
    "labels": [],
    "column": "In Progress|Done|null"
  },
  "comments_count": 0,
  "errors": []
}
```

- `pr` is `null` if `PR_NUMBER` is empty or not supplied.
- `issue` is `null` if `ISSUE_KEY` is empty or not supplied.
- `errors` accumulates error messages; main context checks this array before trusting state fields.

## How to Invoke (from pipeline orchestrators)

Pass the following prompt to an Explore subagent via the `Agent` tool with `subagent_type="Explore"`. Substitute `{PR_NUMBER}` and `{ISSUE_KEY}` before sending.

```
Run the tracker state poller (references/tracker-state-poller-subagent.md).
Inputs:
  PR_NUMBER={PR_NUMBER}       # integer or empty string
  ISSUE_KEY={ISSUE_KEY}       # GitHub: integer; Jira: PROJ-123; or empty string

Follow the Execution Protocol exactly. Return the compact JSON object only — no prose.
```

### Extracting results

After the subagent returns, parse its text output as JSON:

```
POLL=$(Agent subagent result text)
PR_STATE=$(echo "$POLL" | jq -r '.pr.state // "unknown"')
ISSUE_STATE=$(echo "$POLL" | jq -r '.issue.state // "unknown"')
ERRORS=$(echo "$POLL" | jq -r '.errors | length')
```

Always check `errors` before trusting the state fields:

- `errors | length > 0` → log each error in Issues Log; proceed with caution
- `errors | length == 0` → state fields are authoritative

## Execution Protocol (run inside the Explore subagent)

### Initialization

```bash
ERRORS=()
```

### Step 1 — Determine platform

Source `references/resolve-platform.sh` or replicate its logic inline:

```bash
# Tier 1: skills-config.yaml explicit keys
TRACKER=$(python -c "
import yaml
try:
    cfg = yaml.safe_load(open('skills-config.yaml'))
    print(cfg.get('tracker', 'auto'))
except Exception:
    print('auto')
" 2>/dev/null || echo auto)

VCS=$(python -c "
import yaml
try:
    cfg = yaml.safe_load(open('skills-config.yaml'))
    print(cfg.get('vcs', 'auto'))
except Exception:
    print('auto')
" 2>/dev/null || echo auto)

# Tier 2: env var / git remote
[ "$TRACKER" = "auto" ] && TRACKER=$([ -n "$JIRA_URL" ] && echo jira || echo github)
[ "$VCS" = "auto" ] && VCS=$(git remote get-url origin 2>/dev/null | grep -qi bitbucket.org && echo bitbucket || echo github)
```

### Step 2 — Poll PR state (if PR_NUMBER supplied)

#### VCS = github

```bash
PR_JSON=$(gh pr view {PR_NUMBER} --json url,state,reviewDecision,reviews 2>&1)
if echo "$PR_JSON" | jq -e '.url' >/dev/null 2>&1; then
  PR_URL=$(echo "$PR_JSON" | jq -r '.url')
  PR_STATE=$(echo "$PR_JSON" | jq -r '.state')                      # OPEN|MERGED|CLOSED
  PR_REVIEWS=$(echo "$PR_JSON" | jq -r '.reviews | length')
  PR_APPROVED=$(echo "$PR_JSON" | jq -r '.reviewDecision == "APPROVED"')
else
  PR_STATE="unknown"; PR_URL=""; PR_REVIEWS=0; PR_APPROVED=false
  ERRORS+=("gh pr view {PR_NUMBER}: $PR_JSON")
fi
```

#### VCS = bitbucket

Derive `{WORKSPACE}` and `{REPO_SLUG}` from git remote URL (`git remote get-url origin`), e.g. `git@bitbucket.org:{workspace}/{slug}.git`.

```bash
# Bearer or Basic, chosen by variable name — see references/platform-detection.md
if ! source references/bitbucket-auth.sh; then
  # Distinguish "no credential" from "PR not found". Without the credential a
  # private repo answers 404, which would otherwise be logged as a missing PR.
  PR_STATE="unknown"; PR_URL=""; PR_REVIEWS=0; PR_APPROVED=false
  ERRORS+=("Bitbucket: no credential resolved — PR state not polled")
else
  BB_RESP=$(curl -s "${BB_CURL_AUTH[@]}" \
    "https://api.bitbucket.org/2.0/repositories/{WORKSPACE}/{REPO_SLUG}/pullrequests/{PR_NUMBER}" 2>&1)
  if echo "$BB_RESP" | jq -e '.id' >/dev/null 2>&1; then
    PR_URL=$(echo "$BB_RESP" | jq -r '.links.html.href')
    PR_STATE=$(echo "$BB_RESP" | jq -r '.state')                    # OPEN|MERGED|DECLINED
    PR_REVIEWS=0; PR_APPROVED=false                                 # Bitbucket approval via participants
  else
    PR_STATE="unknown"; PR_URL=""; PR_REVIEWS=0; PR_APPROVED=false
    ERRORS+=("Bitbucket PR {PR_NUMBER}: $(echo "$BB_RESP" | jq -r '.error.message // "unknown error"' 2>/dev/null)")
  fi
fi
```

### Step 3 — Poll issue state (if ISSUE_KEY supplied)

#### TRACKER = github

```bash
ISSUE_JSON=$(gh issue view {ISSUE_KEY} --json number,state,labels,projectItems 2>&1)
if echo "$ISSUE_JSON" | jq -e '.number' >/dev/null 2>&1; then
  ISSUE_KEY_OUT=$(echo "$ISSUE_JSON" | jq -r '.number | tostring')
  ISSUE_STATE=$(echo "$ISSUE_JSON" | jq -r '.state')                # OPEN|CLOSED
  ISSUE_LABELS=$(echo "$ISSUE_JSON" | jq -c '[.labels[].name]')
  ISSUE_COLUMN=$(echo "$ISSUE_JSON" | jq -r '.projectItems[0].status.name // null')
  ISSUE_COMMENTS=$(gh issue view {ISSUE_KEY} --json comments --jq '.comments | length' 2>/dev/null || echo 0)
else
  ISSUE_STATE="unknown"; ISSUE_LABELS="[]"; ISSUE_COLUMN=null; ISSUE_COMMENTS=0
  ERRORS+=("gh issue view {ISSUE_KEY}: $ISSUE_JSON")
fi
```

#### TRACKER = jira

Call `getJiraIssue` MCP tool:

- `cloudId`: derived from `JIRA_URL` hostname
- `issueIdOrKey`: `{ISSUE_KEY}`
- `fields`: `["status", "labels", "parent", "comment"]`

Extract:

- `ISSUE_STATE` = `fields.status.name`
- `ISSUE_LABELS` = `fields.labels` (array of plain strings — e.g. `["bug", "critical"]`)
- `ISSUE_COLUMN` = `null` (Jira board column not directly available from issue fields)
- `ISSUE_COMMENTS` = `fields.comment.total`

On MCP tool failure: set `ISSUE_STATE="unknown"` and append error to `ERRORS`.

### Step 4 — Return JSON

Output ONLY the following JSON object (no prose, no markdown fences):

```
{
  "tracker": "{TRACKER}",
  "vcs": "{VCS}",
  "pr": {PR_NUMBER supplied? {"url": "{PR_URL}", "state": "{PR_STATE}", "reviews_count": {PR_REVIEWS}, "approved": {PR_APPROVED}} : null},
  "issue": {ISSUE_KEY supplied? {"key": "{ISSUE_KEY_OUT}", "state": "{ISSUE_STATE}", "labels": {ISSUE_LABELS}, "column": {ISSUE_COLUMN}} : null},
  "comments_count": {ISSUE_COMMENTS},
  "errors": [{ERRORS joined as JSON strings}]
}
```

## Error Handling Contract

- Never throw or exit non-zero. Always return the JSON object.
- Append human-readable error messages to `errors[]`.
- Leave affected fields as `"unknown"` or `null` when a query fails.
- Main context checks `errors | length` before trusting state values; a non-empty `errors` array means partial data — proceed with caution and log each error in Issues Log.

## Validation

```bash
jq -e '
  (.tracker | test("^(jira|github)$")) and
  (.vcs | test("^(github|bitbucket)$")) and
  (.errors | type == "array")
' <<< "$POLL_RESULT"
```

## Usage Patterns by Pipeline Step

### Step 4 — Post-PR state verification

After `/create-pr` completes, verify the PR is open before proceeding:

```
Invoke tracker state poller with PR_NUMBER={PR_NUMBER} and ISSUE_KEY=.
Check result.pr.state == "OPEN" → proceed.
If "CLOSED" or "MERGED" → log warning in Issues Log (PR may have been auto-merged/closed); proceed.
If errors[] non-empty → log each error; proceed (non-blocking).
```

Log in Decisions Log: "Post-PR state check: PR #{PR_NUMBER} state = {state}. errors = {count}."

### Step 5–6 — Post-fix PR state check (each qa-fix cycle)

After committing and pushing qa-fix changes, verify PR is still open:

```
Invoke tracker state poller with PR_NUMBER={PR_NUMBER} and ISSUE_KEY=.
Check result.pr.state == "OPEN" → continue QA loop.
If "MERGED" or "CLOSED" → halt QA loop; log in Issues Log.
If errors[] non-empty → log and continue (non-blocking).
```

### Step 7 — Pre-close issue state verification

After `gh issue close` / Jira Done transition, verify the issue actually changed state:

```
Invoke tracker state poller with PR_NUMBER= and ISSUE_KEY={TRACKER_ISSUE}.
Check result.issue.state:
  GitHub: "CLOSED" → ✅
  Jira: any status in the done category — commonly "Done", "Closed", "Resolved", "Complete", "Completed" → ✅
  Anything else → ⚠️ log and retry close once.
If errors[] non-empty → log and continue (non-blocking).
```

Log in Decisions Log: "Post-close state check: issue {ISSUE_KEY} state = {state}. errors = {count}."
