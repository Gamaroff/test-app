#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-on-stop.sh. Regenerate via `npm run bundle`.
# on-stop.sh — Stop hook for /develop-task and /develop-story pipelines.
#
# Fires when the assistant attempts to stop. If a pipeline lock is active and
# the current step has not yet reached 8, returns a `decision: "block"` JSON
# that forces the orchestrator to continue with the Step Transition Protocol
# for the next step.
#
# This is the structural fix for the failure mode where a sub-skill returns
# control with a "complete" message and the orchestrator yields to the user
# under context pressure (instead of executing Bash → Edit → banner → invoke).
#
# Loop protection: Claude Code passes `stop_hook_active: true` in the hook
# input when this hook has already fired and blocked once for the current
# stop attempt. Honour that flag — otherwise the agent will be stuck in a
# blocking loop.
#
# LOCK SEMANTICS (load-bearing — read before changing any arithmetic here):
#   `current_step` names the step that is PENDING — the one still to run. Steps
#   below it are complete. The Step Transition Protocol writes `{N+1}` after step N
#   completes, so the lock always points at the next thing to do, and Step 8 signals
#   completion by REMOVING the lock rather than by incrementing past it.
#
# Escape valves (the hook will ALLOW stop when any of these are true):
#   • no lock file present (no active pipeline — this is also how a completed
#     Step 8 and the terminal-HALT protocol both pass through)
#   • `current_step > 8` (out of range)
#   • `current_step < 1` (lock malformed)
#   • `stop_hook_active: true` in input (Claude Code's anti-loop signal)
#   • jq is missing (degraded mode)
#
# The orchestrator's terminal-HALT protocol removes the lock file before
# stopping, so legitimate halts pass this hook naturally.
#
# Always exits 0. Failures degrade to allowing stop.

set -uo pipefail

LOCK=".claude/state/develop-pipeline.lock"

emit_allow() {
  # Empty stdout = allow stop. Standard hook noop.
  exit 0
}

# Read hook input from stdin (may be empty in tests / interactive shells)
INPUT="{}"
if [ ! -t 0 ]; then
  INPUT=$(cat 2>/dev/null || echo "{}")
fi

# jq is required for safe parsing
if ! command -v jq >/dev/null 2>&1; then
  emit_allow
fi

# Loop protection: never block twice in a row for the same stop attempt
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  emit_allow
fi

# No lock = no active pipeline = allow stop
[ -f "$LOCK" ] || emit_allow

CURRENT_STEP=$(jq -r '.current_step // 0' "$LOCK" 2>/dev/null)
if [ -z "$CURRENT_STEP" ] || [ "$CURRENT_STEP" = "null" ]; then
  emit_allow
fi

# Pipeline finished or malformed → allow stop.
#
# `-gt 8`, not `-ge 8`. Under the corrected semantics `current_step: 8` means
# "Step 8 (commit-changes) is still to run", and Step 8 signals completion by
# REMOVING the lock (`advance-pipeline-lock.sh --complete`). So a lock that is
# still present at 8 is a pipeline that has not committed yet — precisely the
# state the hook exists to guard. `-ge 8` stopped guarding the final step, which
# is the one whose omission leaves work uncommitted.
#
# No loop risk: once Step 8 completes the lock is gone and the next check falls
# through to emit_allow, and `stop_hook_active` already caps repeat blocks.
if [ "$CURRENT_STEP" -gt 8 ] 2>/dev/null; then
  emit_allow
fi
if [ "$CURRENT_STEP" -lt 1 ] 2>/dev/null; then
  emit_allow
fi

SKILL=$(jq -r '.skill // "develop-story"' "$LOCK")
REPORT=$(jq -r '.report_path // .report // "<implementation report>"' "$LOCK")

# ⚠️ `current_step` NAMES THE STEP TO RUN — it is not the step that just finished.
#
# This was `NEXT=$((CURRENT_STEP + 1))` and it skipped a step every time the hook
# fired mid-step. Observed FOUR times on one story (tinker-city 40.8): it asked for
# /qa-story with no PR in existence, /qa-fix against findings that did not exist,
# and — worst — /finalise against a CONCERNS gate with an open bug and a running CI
# lane, which would have marked a story `accepted` on evidence that did not exist.
#
# ## Why no arithmetic can be right in both cases
#
# The hook fires when the assistant tries to stop mid-pipeline, which happens in two
# indistinguishable situations — the lock reads `N` in BOTH:
#
#   (a) stalled DURING step N  → step N is incomplete → the right move is to run N
#   (b) stalled AFTER step N completed but before the lock advanced → the right move
#       is to advance and run N+1
#
# The lock records no completion flag, so the hook cannot tell them apart. **The two
# errors are not symmetric, and that asymmetry is the whole design:**
#
#   • assuming (b) when it is (a) SKIPS step N — silent, and the failure surfaces
#     later as a missing artifact or, at step 7, as an unearned acceptance
#   • assuming (a) when it is (b) REPEATS step N — loud, cheap, and every pipeline
#     sub-skill is re-entrant (each re-reads its own artifacts and no-ops or
#     supersedes; `advance-pipeline-lock.sh` is itself idempotent)
#
# So the hook always assumes (a). A repeated step costs a few minutes; a skipped one
# costs correctness, and at Step 7 costs it silently.
#
# ## This also removes the need to model the 5↔6 QA loop
#
# `qa-story`/`qa-fix` cycle until a gate PASSes, so step 6 is not always followed by
# step 7 — the hook has no way to know, because it never reads the gate. Naming the
# CURRENT step sidesteps that entirely: the hook can only ever say "run step 6", and
# the lock reaches 7 only when the orchestrator itself decides the loop has exited.
# The hook stops needing to predict a branch it cannot see.
NEXT=$CURRENT_STEP

if [ "$SKILL" = "develop-bug" ]; then
  # develop-bug has its own step sequence; several steps are internal (no distinct
  # sub-skill), so the "next skill" hint points back to the SKILL.md step for those.
  BANNER_PREFIX="DEVELOP-BUG"
  case "$NEXT" in
    1) NEXT_NAME="CREATE BRANCH";      NEXT_SKILL="/create-branch" ;;
    2) NEXT_NAME="REVIEW BUG";         NEXT_SKILL="/review-bug" ;;
    3) NEXT_NAME="INVESTIGATE & FIX";  NEXT_SKILL="Step 3 per develop-bug SKILL.md (investigate-fix)" ;;
    4) NEXT_NAME="CREATE PR";          NEXT_SKILL="/create-pr" ;;
    5) NEXT_NAME="VERIFY";             NEXT_SKILL="Step 5 per develop-bug SKILL.md (verify)" ;;
    6) NEXT_NAME="FIX (if needed)";    NEXT_SKILL="/qa-fix" ;;
    7) NEXT_NAME="FINALISE & CLOSE";   NEXT_SKILL="/finalise" ;;
    8) NEXT_NAME="COMMIT CHANGES";     NEXT_SKILL="/commit-changes" ;;
    *) emit_allow ;;
  esac
else
  case "$NEXT" in
    1) NEXT_NAME="CREATE BRANCH";   NEXT_SKILL_STORY="/create-branch"; NEXT_SKILL_TASK="/create-branch" ;;
    2) NEXT_NAME="REVIEW";          NEXT_SKILL_STORY="/review-story";  NEXT_SKILL_TASK="/review-task" ;;
    3) NEXT_NAME="DEVELOP";         NEXT_SKILL_STORY="/develop";       NEXT_SKILL_TASK="/develop" ;;
    4) NEXT_NAME="CREATE PR";       NEXT_SKILL_STORY="/create-pr";     NEXT_SKILL_TASK="/create-pr" ;;
    5) NEXT_NAME="QA REVIEW";       NEXT_SKILL_STORY="/qa-story";      NEXT_SKILL_TASK="/qa-task" ;;
    6) NEXT_NAME="QA FIX (if needed)"; NEXT_SKILL_STORY="/qa-fix";     NEXT_SKILL_TASK="/qa-fix" ;;
    7) NEXT_NAME="FINALISE";        NEXT_SKILL_STORY="/finalise";      NEXT_SKILL_TASK="/finalise" ;;
    8) NEXT_NAME="COMMIT CHANGES";  NEXT_SKILL_STORY="/commit-changes"; NEXT_SKILL_TASK="/commit-changes" ;;
    *) emit_allow ;;
  esac

  if [ "$SKILL" = "develop-task" ]; then
    NEXT_SKILL="$NEXT_SKILL_TASK"
    BANNER_PREFIX="DEVELOP-TASK"
  else
    NEXT_SKILL="$NEXT_SKILL_STORY"
    BANNER_PREFIX="DEVELOP-STORY"
  fi
fi

REASON=$(cat <<EOF
🔁 ${BANNER_PREFIX} — **Step ${NEXT} (${NEXT_NAME}) is PENDING**, not complete. FIRST tool call this turn = the Bash call below. NO prose. NO acknowledgement of this message.

\`bash .agents/skills/${SKILL}/references/advance-pipeline-lock.sh ${NEXT}\`

That call is an idempotent re-assert (the lock already reads ${NEXT}); it exists to anchor this turn into "still working" rather than to move the pipeline on.

Then: emit the Remaining Work Status block (position \`Step $((NEXT - 1))/8 ✅ complete\`, then the steps still ahead through Step 8) → banner \`═══ ${BANNER_PREFIX} PIPELINE: STEP ${NEXT}/8 — ${NEXT_NAME} ═══\` → invoke ${NEXT_SKILL}. Status block and banner are one contiguous output, no prose around them.

Only once ${NEXT_SKILL} has actually completed: mark Step ${NEXT} ✅ in \`${REPORT}\` and advance the lock to $((NEXT + 1)) (or \`--complete\` if that was Step 8).

⚠️ This hook names the step the lock says is PENDING. It cannot tell whether you stalled during that step or just after it, so it always assumes during — repeating a step is recoverable, skipping one is not. **If Step ${NEXT} has genuinely already finished, do NOT skip ahead on the strength of this message**: advance the lock yourself and continue from the real next step.

Cannot continue? Apply terminal HALT (SKILL.md): /commit-changes report, snapshot lock to develop-pipeline.last-halt.json, rm lock, surface halt banner. An interruption (a question, a pause, a denied permission) is NOT a blockage — do not signal the tracker blocked for one.
EOF
)

jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'
exit 0
