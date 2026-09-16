#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/set-github-project-estimate.sh. Regenerate via `npm run bundle`.
# Set the "Estimate" number field on every GitHub Project (v2) board that
# contains the given issue. Mirrors `estimated_effort_hours` from story/task
# frontmatter onto the board so PMs can sort/filter by estimate.
#
# Usage:
#   set-github-project-estimate.sh <issue_number> <hours>
#
# Args:
#   issue_number  Required. The GitHub issue number (numeric).
#   hours         Required. Estimated effort in hours (number). Pass empty
#                 string to skip silently (caller uses this when frontmatter
#                 has no estimate).
#
# Field name resolution order:
#   1. GH_PROJECT_ESTIMATE_FIELD env var
#   2. github.projectEstimateField in skills-config.yaml at repo root
#   3. "Estimate" (default)
#
# Exit code: always 0. Never fails the caller. Logs status to stdout.
#
# Requires: gh, jq. Repo context is detected via `gh repo view`.

set -u

ISSUE_NUM="${1:-}"
HOURS_IN="${2:-}"

resolve_field_name() {
  if [ -n "${GH_PROJECT_ESTIMATE_FIELD:-}" ]; then
    echo "$GH_PROJECT_ESTIMATE_FIELD"
    return
  fi
  local val=""
  if [ -f skills-config.yaml ]; then
    val=$(python -c "
import yaml
try:
    with open('skills-config.yaml') as f:
        data = yaml.safe_load(f) or {}
        v = (data.get('github') or {}).get('projectEstimateField', '')
        print(v if v is not None else '')
except Exception:
    print('')
" 2>/dev/null) || val=""
    if [ -z "$val" ]; then
      val=$(awk '
        /^github:/ { in_block=1; next }
        in_block && /^[^[:space:]]/ { in_block=0 }
        in_block && /^[[:space:]]+projectEstimateField:/ {
          sub("^[[:space:]]+projectEstimateField:[[:space:]]*", "")
          gsub(/[[:space:]]+$/, "")
          gsub(/^["\x27]|["\x27]$/, "")
          print
          exit
        }
      ' skills-config.yaml 2>/dev/null)
    fi
  fi
  echo "${val:-Estimate}"
}

FIELD_NAME=$(resolve_field_name)

if [ -z "$ISSUE_NUM" ]; then
  echo "⚠️  set-github-project-estimate: missing <issue_number> — skipped" >&2
  exit 0
fi

if [ -z "$HOURS_IN" ]; then
  # No estimate to set — caller passed empty. Silent skip.
  exit 0
fi

if ! command -v gh >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "⚠️  set-github-project-estimate: gh/jq not available — skipped"
  exit 0
fi

# Validate numeric.
if ! echo "$HOURS_IN" | grep -Eq '^[0-9]+(\.[0-9]+)?$'; then
  echo "⚠️  set-github-project-estimate: '${HOURS_IN}' is not numeric — skipped"
  exit 0
fi

# ── ACCESS GATE (task.54) ────────────────────────────────────────────────────
#
# Same shape and same reasoning as set-github-project-priority.sh — see the long
# comment there. In short: this script writes a board field with `gh api graphql`
# directly rather than through gh-stage.js, so gh-stage's gate does not cover it;
# the mode comes from `defer-mutation.js --resolve-access` rather than a fifth
# shell copy of the mode table; it fails closed to `manual`; and it exits 0
# either way, because a deferral is a recorded outcome, not an error.
#
# Placed AFTER the numeric validation deliberately: a non-numeric estimate is not
# a mutation anyone wants recorded and replayed, it is a caller bug. The gate
# defers writes that would otherwise have happened, not ones already rejected.
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
# mode is known. Board Estimate writes silently stopped in every one of them
# (TASK-54-BUG-1). A test now pins the co-location.
# shellcheck disable=SC1007  # `CDPATH= cmd` is a one-command env prefix, not an empty assignment
GATE_DIR=$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd -P)
DEFER_WRITER="${GATE_DIR}/defer-mutation.js"

if [ -f "$DEFER_WRITER" ] && command -v node >/dev/null 2>&1; then
  ACCESS_MODE=$(node "$DEFER_WRITER" --resolve-access 2>/dev/null) || ACCESS_MODE="manual"
  [ -n "$ACCESS_MODE" ] || ACCESS_MODE="manual"
else
  echo "⚠️  set-github-project-estimate: defer-mutation.js not found beside this script — skipping the write rather than performing it unrecorded"
  exit 0
fi

if [ "$ACCESS_MODE" != "full" ]; then
  GATE_OWNER=$(gh repo view --json owner -q '.owner.login' 2>/dev/null || echo "OWNER")
  GATE_REPO=$(gh repo view --json name -q '.name' 2>/dev/null || echo "REPO")
  GATE_URL="https://github.com/${GATE_OWNER}/${GATE_REPO}/issues/${ISSUE_NUM}"

  RECORD_ID=$(node "$DEFER_WRITER" \
    --kind "github.board.field-set" \
    --system "github" \
    --access "$ACCESS_MODE" \
    --intent "Set ${FIELD_NAME} to ${HOURS_IN} on issue #${ISSUE_NUM}" \
    --target "{\"issue\":\"${ISSUE_NUM}\",\"url\":\"${GATE_URL}\",\"ui_url\":\"the project board → filter to this issue → set the field\"}" \
    --desired "{\"${FIELD_NAME}\":\"${HOURS_IN}\"}" \
    --skill "set-github-project-estimate" \
    --manual-ui "Open the project board → find issue #${ISSUE_NUM} → set ${FIELD_NAME}" \
    --manual-deep-link "$GATE_URL" \
    --manual-field "${FIELD_NAME}=${HOURS_IN}" \
    --command-argv "[\"bash\",\"set-github-project-estimate.sh\",\"${ISSUE_NUM}\",\"${HOURS_IN}\"]" \
    --json 2>/dev/null \
    | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

  if [ -n "$RECORD_ID" ]; then
    echo "⏸️  access.tracker=${ACCESS_MODE} — not setting ${FIELD_NAME} on issue #${ISSUE_NUM}; recorded as ${RECORD_ID}."
  else
    echo "⚠️  access.tracker=${ACCESS_MODE} — not setting ${FIELD_NAME} on issue #${ISSUE_NUM}, and the deferred record could not be written." >&2
  fi
  exit 0
fi

OWNER=$(gh repo view --json owner -q '.owner.login' 2>/dev/null || true)
REPO_NAME=$(gh repo view --json name -q '.name' 2>/dev/null || true)
if [ -z "$OWNER" ] || [ -z "$REPO_NAME" ]; then
  echo "⚠️  set-github-project-estimate: cannot resolve repo context — skipped"
  exit 0
fi

# Fetch project items + number field metadata.
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
                ... on ProjectV2Field {
                  id name dataType
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
  echo "⚠️  set-github-project-estimate: GraphQL fetch failed for #${ISSUE_NUM} — skipped"
  exit 0
fi

NODE_COUNT=$(echo "$PROJ_RESPONSE" | jq -r '.data.repository.issue.projectItems.nodes | length // 0')
if [ "$NODE_COUNT" = "0" ] || [ -z "$NODE_COUNT" ]; then
  echo "⚠️  Estimate skip — issue #${ISSUE_NUM} not on any Project board"
  exit 0
fi

APPLIED=0
for i in $(seq 0 $((NODE_COUNT - 1))); do
  ITEM_ID=$(echo "$PROJ_RESPONSE" | jq -r ".data.repository.issue.projectItems.nodes[$i].id // empty")
  PROJECT_ID=$(echo "$PROJ_RESPONSE" | jq -r ".data.repository.issue.projectItems.nodes[$i].project.id // empty")
  PROJECT_TITLE=$(echo "$PROJ_RESPONSE" | jq -r ".data.repository.issue.projectItems.nodes[$i].project.title // \"unknown\"")
  FIELD_ID=$(echo "$PROJ_RESPONSE" | jq -r --arg name "$FIELD_NAME" ".data.repository.issue.projectItems.nodes[$i].project.fields.nodes[]? | select(.name == \$name and .dataType == \"NUMBER\") | .id // empty" | head -1)

  if [ -z "$ITEM_ID" ] || [ -z "$PROJECT_ID" ] || [ -z "$FIELD_ID" ]; then
    echo "⚠️  Estimate skip on '${PROJECT_TITLE}' — '${FIELD_NAME}' number field not found"
    continue
  fi

  if gh api graphql -f query='
    mutation {
      updateProjectV2ItemFieldValue(input: {
        projectId: "'"$PROJECT_ID"'"
        itemId: "'"$ITEM_ID"'"
        fieldId: "'"$FIELD_ID"'"
        value: { number: '"$HOURS_IN"' }
      }) { projectV2Item { id } }
    }' >/dev/null 2>&1; then
    echo "✅ Estimate set to ${HOURS_IN}h on '${PROJECT_TITLE}'"
    APPLIED=$((APPLIED + 1))
  else
    echo "⚠️  Estimate mutation failed on '${PROJECT_TITLE}'"
  fi
done

if [ "$APPLIED" = "0" ]; then
  echo "⚠️  Estimate not applied on any board for #${ISSUE_NUM}"
fi

exit 0
