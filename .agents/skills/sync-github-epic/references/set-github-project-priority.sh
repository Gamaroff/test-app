#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/set-github-project-priority.sh. Regenerate via `npm run bundle`.
# Set the "Priority" single-select field on every GitHub Project (v2) board
# that contains the given issue. Mirrors the priority:* label that GitHub
# does NOT auto-sync into Project custom fields.
#
# Usage:
#   set-github-project-priority.sh <issue_number> [priority]
#
# Args:
#   issue_number  Required. The GitHub issue number (numeric).
#   priority      Optional. One of: critical|high|medium|low (case-insensitive —
#                 callers pass Title Case from create-task's frontmatter flow
#                 and lowercase from review-task/review-story's label flow;
#                 helper normalises via `tr`).
#                 If omitted, derived from the issue's first matching
#                 priority:* label.
#
# Filename note: this script supersedes the working name "set-github-priority.sh"
# from the original design plan; "project" is included because it operates on
# Project v2 board fields, not on the issue itself.
#
# Exit code: always 0. Never fails the caller. Logs status to stdout.
#
# Requires: gh, jq. Repo context is detected via `gh repo view`.

set -u

ISSUE_NUM="${1:-}"
PRIORITY_IN="${2:-}"

if [ -z "$ISSUE_NUM" ]; then
  echo "⚠️  set-github-project-priority: missing <issue_number> — skipped" >&2
  exit 0
fi

if ! command -v gh >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "⚠️  set-github-project-priority: gh/jq not available — skipped"
  exit 0
fi

# ── ACCESS GATE (task.54) ────────────────────────────────────────────────────
#
# This script writes a board field with `gh api graphql` directly — it does NOT
# go through gh-stage.js, which deliberately owns the Status field and nothing
# else. So gh-stage's gate does not cover it, and it needs its own.
#
# The mode is resolved by ASKING defer-mutation.js, not by re-implementing the
# table here. That contract already had four copies in this tree and shell is
# where they drift: jira-sprint-lib.sh's comments record what open-coding it cost
# the last time. One flag, one JS implementation, shared with gh-stage.js — the
# two cannot disagree about whether this repo is restricted.
#
# FAIL CLOSED on a non-zero exit (an unrecognised mode, a missing writer, no
# node): `manual` is the safe answer when nothing can be verified, and defaulting
# to `full` is exactly how a declared restriction becomes an unintended write.
#
# Exit 0 either way — this script's contract is "never fails the caller", and a
# deferral is a recorded outcome, not an error.
#
# The deferred-mutation writer — shared/resources/defer-mutation.js — which the
# bundler ships next to this file, so the sibling lookup below resolves in-tree
# and in an installed skill alike.
#
# THAT PATH IS SPELLED OUT IN FULL DELIBERATELY, and must stay that way. It is the
# only thing that tells bundle_skill.py this file has a dependency: the bundler
# follows `source`/`exec` of a sibling `.sh`, and has no rule for a shell script
# that runs a sibling `.js`. Discovery falls to the literal string
# a literal shared-resources path spelled out in the file, as
# jira-sprint-lib.sh:32 relies on.
#
# Without it this script was bundled into 11 skills without the writer, and the
# branch below then skipped the write — under `full` too, since it runs before the
# mode is known. Board Priority writes silently stopped in every one of them
# (TASK-54-BUG-1). A test now pins the co-location.
# shellcheck disable=SC1007  # `CDPATH= cmd` is a one-command env prefix, not an empty assignment
GATE_DIR=$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd -P)
DEFER_WRITER="${GATE_DIR}/defer-mutation.js"

if [ -f "$DEFER_WRITER" ] && command -v node >/dev/null 2>&1; then
  ACCESS_MODE=$(node "$DEFER_WRITER" --resolve-access 2>/dev/null) || ACCESS_MODE="manual"
  [ -n "$ACCESS_MODE" ] || ACCESS_MODE="manual"
else
  # No writer means no way to read the config AND no way to record a deferral.
  # Proceeding would be an unrecorded write under a possible restriction; the
  # only honest move is to skip and say so.
  echo "⚠️  set-github-project-priority: defer-mutation.js not found beside this script — skipping the write rather than performing it unrecorded"
  exit 0
fi

if [ "$ACCESS_MODE" != "full" ]; then
  # Resolve the priority for the record even though we will not write it — a
  # record naming "P1 – High" is actionable; one naming "some priority" is not.
  # This duplicates the derivation below rather than restructuring the script,
  # because the gate must sit ABOVE the first `gh` call and the derivation needs
  # `gh issue view` when no priority argument was passed. Under a restricted mode
  # a read is permitted, so calling it here is allowed — but it may legitimately
  # fail (no auth at all, in `manual`), and an empty answer is still a usable
  # record: "set Priority to the value of the issue's priority:* label".
  GATE_PRIORITY="$PRIORITY_IN"
  if [ -z "$GATE_PRIORITY" ]; then
    GATE_PRIORITY=$(gh issue view "$ISSUE_NUM" --json labels -q '.labels[].name' 2>/dev/null \
      | sed -nE 's/^priority:(critical|high|medium|low)$/\1/p' | head -1)
  fi
  GATE_LC=$(echo "$GATE_PRIORITY" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
  case "$GATE_LC" in
    critical) GATE_VALUE="P0" ;; high) GATE_VALUE="P1" ;;
    medium)   GATE_VALUE="P2" ;; low)  GATE_VALUE="P3" ;;
    *)        GATE_VALUE="" ;;
  esac

  GATE_OWNER=$(gh repo view --json owner -q '.owner.login' 2>/dev/null || echo "OWNER")
  GATE_REPO=$(gh repo view --json name -q '.name' 2>/dev/null || echo "REPO")
  GATE_URL="https://github.com/${GATE_OWNER}/${GATE_REPO}/issues/${ISSUE_NUM}"

  RECORD_ID=$(node "$DEFER_WRITER" \
    --kind "github.board.field-set" \
    --system "github" \
    --access "$ACCESS_MODE" \
    --intent "Set Priority to ${GATE_VALUE:-the value of the priority label} on issue #${ISSUE_NUM}" \
    --target "{\"issue\":\"${ISSUE_NUM}\",\"url\":\"${GATE_URL}\",\"ui_url\":\"the project board → filter to this issue → set the field\"}" \
    --desired "{\"Priority\":\"${GATE_VALUE}\"}" \
    --skill "set-github-project-priority" \
    --manual-ui "Open the project board → find issue #${ISSUE_NUM} → set Priority" \
    --manual-deep-link "$GATE_URL" \
    --manual-field "Priority=${GATE_VALUE}" \
    --command-argv "[\"bash\",\"set-github-project-priority.sh\",\"${ISSUE_NUM}\",\"${GATE_LC}\"]" \
    --json 2>/dev/null \
    | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

  if [ -n "$RECORD_ID" ]; then
    echo "⏸️  access.tracker=${ACCESS_MODE} — not setting Priority on issue #${ISSUE_NUM}; recorded as ${RECORD_ID}."
  else
    # A journal we cannot write is a real problem, but it is NOT a reason to fall
    # through and perform the very mutation the mode forbids.
    echo "⚠️  access.tracker=${ACCESS_MODE} — not setting Priority on issue #${ISSUE_NUM}, and the deferred record could not be written." >&2
  fi
  exit 0
fi

# 1. Resolve priority — argument wins, else read from issue labels.
if [ -z "$PRIORITY_IN" ]; then
  LABELS=$(gh issue view "$ISSUE_NUM" --json labels -q '.labels[].name' 2>/dev/null || true)
  # BSD/macOS sed needs -E for alternation in regex; GNU sed accepts -E too.
  PRIORITY_IN=$(echo "$LABELS" | sed -nE 's/^priority:(critical|high|medium|low)$/\1/p' | head -1)
fi

# Lowercase + strip whitespace for matching.
PRIORITY_LC=$(echo "$PRIORITY_IN" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')

case "$PRIORITY_LC" in
  critical) P_PREFIX="P0" ;;
  high)     P_PREFIX="P1" ;;
  medium)   P_PREFIX="P2" ;;
  low)      P_PREFIX="P3" ;;
  *)
    echo "⚠️  set-github-project-priority: unknown priority '${PRIORITY_IN}' — skipped"
    exit 0
    ;;
esac

OWNER=$(gh repo view --json owner -q '.owner.login' 2>/dev/null || true)
REPO_NAME=$(gh repo view --json name -q '.name' 2>/dev/null || true)
if [ -z "$OWNER" ] || [ -z "$REPO_NAME" ]; then
  echo "⚠️  set-github-project-priority: cannot resolve repo context — skipped"
  exit 0
fi

# 2. Fetch all project items + Priority field metadata for this issue.
PROJ_RESPONSE=$(gh api graphql -f query='
{
  repository(owner: "'"$OWNER"'", name: "'"$REPO_NAME"'") {
    issue(number: '"$ISSUE_NUM"') {
      projectItems(first: 10) {
        nodes {
          id
          project {
            id
            title
            fields(first: 50) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id name options { id name }
                }
              }
            }
          }
        }
      }
    }
  }
}' 2>/dev/null || true)

if [ -z "$PROJ_RESPONSE" ]; then
  echo "⚠️  set-github-project-priority: GraphQL fetch failed for #${ISSUE_NUM} — skipped"
  exit 0
fi

NODE_COUNT=$(echo "$PROJ_RESPONSE" | jq -r '.data.repository.issue.projectItems.nodes | length // 0')
if [ "$NODE_COUNT" = "0" ] || [ -z "$NODE_COUNT" ]; then
  echo "⚠️  Priority skip — issue #${ISSUE_NUM} not on any Project board"
  exit 0
fi

# 3. For each project item, set the Priority field if found.
APPLIED=0
for i in $(seq 0 $((NODE_COUNT - 1))); do
  ITEM_ID=$(echo "$PROJ_RESPONSE" | jq -r ".data.repository.issue.projectItems.nodes[$i].id // empty")
  PROJECT_ID=$(echo "$PROJ_RESPONSE" | jq -r ".data.repository.issue.projectItems.nodes[$i].project.id // empty")
  PROJECT_TITLE=$(echo "$PROJ_RESPONSE" | jq -r ".data.repository.issue.projectItems.nodes[$i].project.title // \"unknown\"")
  FIELD_ID=$(echo "$PROJ_RESPONSE" | jq -r ".data.repository.issue.projectItems.nodes[$i].project.fields.nodes[]? | select(.name == \"Priority\") | .id // empty" | head -1)
  OPTION_ID=$(echo "$PROJ_RESPONSE" | jq -r --arg p "$P_PREFIX" ".data.repository.issue.projectItems.nodes[$i].project.fields.nodes[]? | select(.name == \"Priority\") | .options[]? | select(.name | startswith(\$p)) | .id // empty" | head -1)

  if [ -z "$ITEM_ID" ] || [ -z "$PROJECT_ID" ] || [ -z "$FIELD_ID" ] || [ -z "$OPTION_ID" ]; then
    echo "⚠️  Priority skip on '${PROJECT_TITLE}' — Priority field or '${P_PREFIX} *' option not found"
    continue
  fi

  if gh api graphql -f query='
    mutation {
      updateProjectV2ItemFieldValue(input: {
        projectId: "'"$PROJECT_ID"'"
        itemId: "'"$ITEM_ID"'"
        fieldId: "'"$FIELD_ID"'"
        value: { singleSelectOptionId: "'"$OPTION_ID"'" }
      }) { projectV2Item { id } }
    }' >/dev/null 2>&1; then
    echo "✅ Priority set to ${P_PREFIX} on '${PROJECT_TITLE}'"
    APPLIED=$((APPLIED + 1))
  else
    echo "⚠️  Priority mutation failed on '${PROJECT_TITLE}' — label priority:${PRIORITY_LC} still applied"
  fi
done

if [ "$APPLIED" = "0" ]; then
  echo "⚠️  Priority not applied on any board for #${ISSUE_NUM}"
fi

exit 0
