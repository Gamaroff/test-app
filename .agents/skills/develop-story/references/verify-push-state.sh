#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/verify-push-state.sh. Regenerate via `npm run bundle`.
# verify-push-state.sh — assert that reported work actually exists on the remote.
#
# WHY THIS EXISTS
#
# On 2026-08-13 a develop-story pipeline reported "PR-ready branch pushed" and,
# separately, that a trunk fix had been "isolated in its own commit so the
# orchestrator can drop it at rebase". Neither was true: the branch ref existed on
# the remote but pointed at the base tip — 0 commits — and every file was still an
# uncommitted working-tree modification. The orchestrator relayed that claim to two
# sibling pipelines and planned a merge around it.
#
# The develop-batch merge gate's head-SHA check would have refused the merge, so
# nothing broken could ship. But that check runs at MERGE time, and the false claim
# was acted on well before it — which is the actual cost, and why this check belongs
# at REPORT time instead.
#
# Prose cannot fix this. The pipeline prompt already said to report the PR; adding
# "and be accurate" changes nothing, because the failure mode is not disobedience,
# it is reporting an intention as an accomplishment without looking. So this is a
# mechanical assertion the pipeline runs and pastes, not an instruction it follows.
#
# NOTE ON EXIT CODES: this script never pipes a status-bearing command into another
# command. The same 2026-08-13 session produced three separate false passes from
# exactly that (`npm test | tail -80` reporting tail's exit 0 over a failed suite;
# twice more from a wrapper script whose status came from a trailing grep/echo).
# Every check here captures the command's own status directly.
#
# Usage:
#   verify-push-state.sh --base <branch> [--pr <number>] [--remote <name>]
#
# Exit codes:
#   0  every check passed — the reported state is real
#   1  a check failed — the report would have been false
#   2  usage error / not a git repository

set -uo pipefail

BASE=""
PR=""
REMOTE="origin"

while [ $# -gt 0 ]; do
  case "$1" in
    --base)   BASE="${2:-}"; shift 2 ;;
    --pr)     PR="${2:-}"; shift 2 ;;
    --remote) REMOTE="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '28,36p' "$0"; exit 0 ;;
    *) echo "verify-push-state: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

[ -n "$BASE" ] || { echo "verify-push-state: --base <branch> is required" >&2; exit 2; }

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || { echo "verify-push-state: not a git repository" >&2; exit 2; }

FAILURES=0
note() { printf '  %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
ok()   { printf '  ✓ %s\n' "$1"; }

echo "verify-push-state: asserting the reported branch state is real"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null)
note "branch=${BRANCH}  head=${HEAD_SHA}  base=${BASE}  remote=${REMOTE}"

# ── 1. No rebase/merge/cherry-pick left in progress ───────────────────────────
# A half-finished rebase leaves a detached HEAD that can look plausible.
GITDIR=$(git rev-parse --git-dir 2>/dev/null)
if [ -d "$GITDIR/rebase-merge" ] || [ -d "$GITDIR/rebase-apply" ]; then
  fail "a rebase is IN PROGRESS — resolve or abort it before reporting"
elif [ -f "$GITDIR/MERGE_HEAD" ]; then
  fail "a merge is IN PROGRESS — resolve or abort it before reporting"
elif [ -f "$GITDIR/CHERRY_PICK_HEAD" ]; then
  fail "a cherry-pick is IN PROGRESS — resolve or abort it before reporting"
else
  ok "no rebase/merge/cherry-pick in progress"
fi

# ── 2. Commits actually exist on top of the base ──────────────────────────────
# THE headline check. An "empty branch push" satisfies every naive test for
# "did you push?" — the ref exists, the push succeeded, the PR opens — and
# contains none of the work.
if ! git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1; then
  fail "base ref '${BASE}' does not resolve — cannot count commits"
else
  AHEAD=$(git rev-list --count "${BASE}..HEAD" 2>/dev/null)
  if [ -z "$AHEAD" ]; then
    fail "could not count commits ahead of '${BASE}'"
  elif [ "$AHEAD" -eq 0 ]; then
    fail "0 commits ahead of '${BASE}' — the branch is EMPTY. Nothing was committed."
  else
    ok "${AHEAD} commit(s) ahead of ${BASE}"
  fi
fi

# ── 3. Working tree is clean ──────────────────────────────────────────────────
# Uncommitted work is work that will not reach the PR, however green the suite was
# when it ran against the working tree.
DIRTY=$(git status --porcelain 2>/dev/null)
if [ -n "$DIRTY" ]; then
  fail "working tree is DIRTY — $(printf '%s\n' "$DIRTY" | grep -c .) uncommitted path(s):"
  printf '%s\n' "$DIRTY" | head -20 | sed 's/^/      /'
else
  ok "working tree clean"
fi

# ── 4. Local HEAD is on the remote ────────────────────────────────────────────
git fetch "$REMOTE" "$BRANCH" --quiet 2>/dev/null
REMOTE_SHA=$(git rev-parse --verify --quiet "${REMOTE}/${BRANCH}" 2>/dev/null)
if [ -z "$REMOTE_SHA" ]; then
  fail "branch '${BRANCH}' does not exist on '${REMOTE}' — nothing was pushed"
elif [ "$REMOTE_SHA" != "$HEAD_SHA" ]; then
  UNPUSHED=$(git rev-list --count "${REMOTE}/${BRANCH}..HEAD" 2>/dev/null || echo "?")
  fail "local HEAD != ${REMOTE}/${BRANCH} (${UNPUSHED} unpushed commit(s)) — push before reporting"
  note "      local:  ${HEAD_SHA}"
  note "      remote: ${REMOTE_SHA}"
else
  ok "local HEAD == ${REMOTE}/${BRANCH}"
fi

# ── 5. The PR points at this exact commit ─────────────────────────────────────
# Optional: only when a PR number is supplied and gh is available. This mirrors
# the develop-batch merge gate's head-SHA check, moved earlier so a false report
# is caught at the moment it would be made rather than at merge time.
if [ -n "$PR" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    note "! gh not on PATH — PR head check skipped (not a failure)"
  else
    PR_SHA=$(gh pr view "$PR" --json headRefOid --jq .headRefOid 2>/dev/null)
    if [ -z "$PR_SHA" ]; then
      fail "could not read PR #${PR} head — cannot confirm the PR matches this commit"
    elif [ "$PR_SHA" != "$HEAD_SHA" ]; then
      fail "PR #${PR} head != local HEAD — the PR does not contain this commit"
      note "      local:   ${HEAD_SHA}"
      note "      PR head: ${PR_SHA}"
    else
      ok "PR #${PR} head == local HEAD"
    fi
  fi
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "verify-push-state: FAILED (${FAILURES} check(s)) — do NOT report this work as pushed."
  exit 1
fi
echo "verify-push-state: OK — the reported state is real."
exit 0
