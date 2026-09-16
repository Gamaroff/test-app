#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/advance-pipeline-lock.sh. Regenerate via `npm run bundle`.
# advance-pipeline-lock.sh — single-source lock advancer for develop-{story,task} pipelines.
#
# Replaces the inline jq snippet that was duplicated across SKILL.md, on-stop.sh,
# step-N reference docs, and per-step orchestrator instructions. Centralising the
# advance logic enables:
#   • Sub-skill self-advance — each sub-skill calls this on successful completion
#   • Stop hook (on-stop.sh) — fallback advance instruction in block reason
#   • Orchestrator manual advance — same command, no jq one-liner to typo
#
# All paths share the same idempotency + safety semantics.
#
# Usage:
#   advance-pipeline-lock.sh <next_step_number>     # advance to specific step (1..8)
#   advance-pipeline-lock.sh --complete             # remove lock (Step 8 done)
#   advance-pipeline-lock.sh --skill <skill-name>   # advance based on sub-skill that just returned
#
# Behaviour:
#   • No lock file  → exit 0, silent noop (no active pipeline)
#   • jq missing    → exit 0, warn to stderr (degraded mode, same as on-stop.sh)
#   • lock that is not a JSON OBJECT (empty, whitespace-only, bare null/array/
#                     scalar, or malformed) → exit 1, lock untouched, no success
#                     line. Applies to every path that reads or writes the lock
#                     JSON; --complete is exempt so a corrupt lock stays clearable.
#   • next <= current → exit 0, idempotent noop (already advanced)
#   • next > current  → atomic write via mktemp + mv, print confirmation to stdout
#
# Skill→next-step mapping (--skill mode). Only unambiguous transitions advance;
# qa-story/qa-fix/review-pr are noops because Steps 5–6 form an iterative loop
# the orchestrator must manage explicitly.
#
#   create-branch   → 2   (Step 1 done)
#   review-story    → 3   (Step 2 done)
#   review-task     → 3
#   develop         → 4   (Step 3 done)
#   create-pr       → 5   (Step 4 done)
#   qa-story        → noop (loop)
#   qa-task         → noop (loop)
#   qa-fix          → noop (loop)
#   review-pr       → noop (loop — Step 5c, the loop's exit gate)
#   finalise        → 8   (Step 7 done)
#   commit-changes  → remove lock ONLY when current_step >= 8 (terminal commit);
#                     nested invocations (create-pr Step 4, qa-fix Steps 5–6) preserve the lock
#
# Always exits 0 on safe paths. Non-zero only on argument error or jq failure.

set -uo pipefail

LOCK="${PIPELINE_LOCK:-.claude/state/develop-pipeline.lock}"

usage() {
  cat <<USAGE >&2
Usage:
  $0 <next_step_number>     # 1..8
  $0 --complete             # remove lock (pipeline finished)
  $0 --skill <skill-name>   # advance based on returning sub-skill name
USAGE
  exit 1
}

[ $# -ge 1 ] || usage

[ -f "$LOCK" ] || exit 0

if ! command -v jq >/dev/null 2>&1; then
  echo "advance-pipeline-lock: jq not installed; cannot advance lock" >&2
  exit 0
fi

# Fail closed on an empty or whitespace-only lock, at every site that reads or
# writes the lock JSON.
#
# `jq` given empty input emits NOTHING and exits 0. Both consequences are silent:
# the read below falls back to 0, and the `if ! jq` write guard does not fire, so
# `mv` installs a zero-byte file and the caller is told "step 0 -> 5" for an
# advance that did not happen — in the pipeline's own state machine. A
# whitespace-only lock is worse: it TRUNCATES a file that had content.
#
# Every other malformed input (null, absent, "abc", -3, 3.7, 1e400, malformed
# JSON, non-JSON) already fails closed here. This was the one hole.
#
# Tested textually rather than with a second `jq` call: it tests exactly the
# stated condition and does not depend on jq's empty-input exit code, which is 4
# for `-e .` but 0 for a filter — the very inconsistency that caused the bug.
#
# NOT called from `--complete`, which removes the lock without parsing it.
# Gating that would make a corrupt lock permanently unclearable, which is a worse
# failure than the one being fixed. Pinned by a test so a later widening of this
# guard fails rather than ships.
require_parsable_lock() {
  # ONE decision predicate. `jq -e 'type == "object"'` rejects every shape that
  # cannot carry pipeline state:
  #   • empty            — jq exits 4 on empty input
  #   • whitespace-only  — same
  #   • malformed JSON   — parse error
  #   • parses, but is not an object (`null`, `[]`, `"str"`, `42`) — the case
  #     that matters most, because `jq` accepts these and `.current_step = $n`
  #     on any of them FABRICATES `{"current_step":5}` from a file that never
  #     held an object. Reported as a real advance. That is the defect this
  #     whole task exists to close, wearing a different shape.
  #
  # An earlier revision tested emptiness separately, as its own `exit 1` ahead
  # of this. Mutation proof retired it: with this predicate in place, deleting
  # that branch left all 30 tests green — it was control flow no test could
  # falsify. It survives below only to CHOOSE THE MESSAGE, never to decide.
  #
  # Not called from `--complete`, which removes the lock without parsing it.
  # Gating that would make a corrupt lock permanently unclearable — worse than
  # the bug being fixed. Pinned by scenario 11 so a later widening breaks.
  if ! jq -e 'type == "object"' "$LOCK" >/dev/null 2>&1; then
    if [ ! -s "$LOCK" ] || [ -z "$(tr -d '[:space:]' < "$LOCK")" ]; then
      echo "advance-pipeline-lock: lock file '$LOCK' is empty or whitespace-only; refusing to advance" >&2
    else
      echo "advance-pipeline-lock: lock file '$LOCK' is not a JSON object; refusing to advance" >&2
    fi
    exit 1
  fi
}

NEXT=""
case "$1" in
  --complete)
    rm -f "$LOCK"
    echo "advance-pipeline-lock: pipeline complete, lock removed"
    exit 0
    ;;
  --skill)
    [ $# -ge 2 ] || usage
    SKILL_NAME="$2"
    case "$SKILL_NAME" in
      create-branch)              NEXT=2 ;;
      review-story|review-task)   NEXT=3 ;;
      develop)                    NEXT=4 ;;
      create-pr)                  NEXT=5 ;;
      # review-pr is Step 5c, the QA loop's exit gate. It is listed explicitly
      # rather than left to the `*)` catch-all below: both arms exit 0, so this
      # is a documentation and testability change, not a behavioural one.
      qa-story|qa-task|qa-fix|review-pr)
                                  exit 0 ;;  # iterative loop, orchestrator manages
      finalise)                   NEXT=8 ;;
      commit-changes)
        # commit-changes is the ONLY pipeline sub-skill invoked at more than one step:
        #   - Step 4 (create-pr commits code before opening the PR)
        #   - Steps 5–6 (each qa-fix cycle commits fixes)
        #   - Step 8 (terminal commit)
        # Only the Step 8 invocation means "pipeline complete". For the nested
        # invocations the lock MUST be preserved so the PreCompact/Stop hooks keep
        # working through the back half of the run.
        require_parsable_lock
        CUR=$(jq -r '.current_step // 0' "$LOCK" 2>/dev/null)
        case "$CUR" in ''|null) CUR=0 ;; esac
        if [ "$CUR" -ge 8 ] 2>/dev/null; then
          rm -f "$LOCK"
          echo "advance-pipeline-lock: pipeline complete (commit-changes at step $CUR), lock removed"
        else
          echo "advance-pipeline-lock: commit-changes nested at step $CUR — lock preserved" >&2
        fi
        exit 0
        ;;
      *)
        # Unknown skill = not a pipeline sub-skill = silent noop
        exit 0
        ;;
    esac
    ;;
  --help|-h)
    usage
    ;;
  *)
    NEXT="$1"
    ;;
esac

# Validate NEXT is an integer 1..8
case "$NEXT" in
  1|2|3|4|5|6|7|8) ;;
  *)
    echo "advance-pipeline-lock: invalid next step '$NEXT' (expected 1..8)" >&2
    exit 1
    ;;
esac

require_parsable_lock
CURRENT=$(jq -r '.current_step // 0' "$LOCK" 2>/dev/null)
if [ -z "$CURRENT" ] || [ "$CURRENT" = "null" ]; then
  CURRENT=0
fi

# Idempotent: already at or past the target step
if [ "$NEXT" -le "$CURRENT" ] 2>/dev/null; then
  exit 0
fi

# Write through a `mktemp` file in the lock's own directory, not `$LOCK.tmp`.
# The old redirect FOLLOWED a pre-existing symlink on that predictable path,
# writing the JSON through to the target before `mv`. `mktemp` creates O_EXCL on
# an unpredictable name, so a planted symlink is never opened.
#
# `set -o noclobber` was the other candidate and is weaker: it refuses to
# overwrite an existing file, but a symlink pointing at a NON-EXISTENT target is
# still created through it, leaving the hole open.
#
# Side effect, deliberate: the lock's mode becomes 0600 (mktemp's default) rather
# than umask-derived 0644. `.claude/state/` is per-user state, so this is a
# tightening with no reader affected.
TMP=$(mktemp "$(dirname "$LOCK")/.advance-pipeline-lock.XXXXXX") || {
  echo "advance-pipeline-lock: could not create temp file beside '$LOCK'" >&2
  exit 1
}
if ! jq --argjson n "$NEXT" '.current_step = $n' "$LOCK" > "$TMP"; then
  rm -f "$TMP"
  echo "advance-pipeline-lock: jq write failed" >&2
  exit 1
fi
mv "$TMP" "$LOCK"
echo "advance-pipeline-lock: step $CURRENT → $NEXT"
exit 0
