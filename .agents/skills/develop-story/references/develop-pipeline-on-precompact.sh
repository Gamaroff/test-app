#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-on-precompact.sh. Regenerate via `npm run bundle`.
# on-precompact.sh — PreCompact hook for /develop-task and /develop-story pipelines.
#
# Runs when Claude Code is about to compact the conversation. If a develop-task
# or develop-story pipeline is active (lock file present), this hook:
#   0. Writes a develop-pipeline.last-halt.json resume snapshot (a lock superset,
#      pause_reason: "precompact") BEFORE any lock removal, so even a hook run killed
#      mid-flow by the harness (SIGTERM/timeout) leaves recoverable resume state for
#      the Phase 0b resume detector
#   1. Appends a "Paused — Context Compaction" entry to the implementation report
#   2. Commits the report and pushes to remote (best-effort)
#   3. Posts a pause comment to the PR (best-effort) — through the access gate
#      (`tracker_write`), opening with the plain-language lead for the
#      `pipeline-paused` stage, body carried by --body-file
#   4. Posts a pause comment to the tracker issue (best-effort) — ONE
#      tracker-comment.js call, which resolves the tracker itself, renders the
#      same lead, carries the idempotency marker, and honours the access gate
#   5. Removes the lock file
#   6. Emits a PIPELINE-PAUSE-SIGNAL via additionalContext so the agent halts cleanly
#
# Both tracker writes go through the contract (bug.14). Before that fix they were
# bare `gh … comment --body "…"` calls: no lead, no marker, and — the part that
# mattered — no access gate, so a consumer that had declared
# `access.tracker: read-only` still got a write from the one caller no prose
# step sits behind. Both arms now FAIL CLOSED: if the sibling engine cannot be
# found or sourced, the comment is skipped and said so in the signal — never
# posted bare as a fallback.
#
# Jira: the issue comment reaches Jira when JIRA_URL / JIRA_API_TOKEN /
# JIRA_USER_EMAIL are in the hook's environment (or a .env the engine reads);
# without them the engine reports `no-credentials` and the pause is silent on
# the Jira side. The PR comment is GitHub-only (`gh`), as before.
#
# Sibling engines this hook runs — spelled out as shared-resources paths so the
# bundler ships them beside the hook (its shell rule follows `source`/`exec`
# of a sibling .sh, not `node "$dir/x.js"`):
#   shared/resources/resolve-platform.sh        (tracker_write + ACCESS_TRACKER)
#   shared/resources/tracker-comment.js         (issue comment, marker, lead, gate)
#   shared/resources/stakeholder-summary-cli.js (the lead for the PR comment)
#   shared/resources/defer-mutation.js          (the deferred record, via both)
#
# Always exits 0. Failures are logged to stderr and never block compaction.

set -uo pipefail

# Lock path — env-overridable for test isolation (mirrors advance-pipeline-lock.sh).
LOCK="${PIPELINE_LOCK:-.claude/state/develop-pipeline.lock}"
# Resume snapshot, co-located with the lock. Written BEFORE any lock removal so a
# killed/partial hook run always leaves a recoverable artifact (see write_pause_snapshot).
SNAPSHOT="$(dirname "$LOCK")/develop-pipeline.last-halt.json"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Where the sibling engines live: shared/resources/ in-tree, references/ when
# bundled. BASH_SOURCE rather than $0 so the wrapper's `exec` resolves to the
# canonical file's own directory, not the wrapper's.
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$(dirname "$LOCK")"

emit_empty() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreCompact","additionalContext":""}}'
  exit 0
}

# write_pause_snapshot — persist a resume snapshot (a superset of the lock) to
# $SNAPSHOT. Tagged pause_reason: "precompact" + paused_at, and aliases the lock's
# current_step to halt_step — the field the Phase 0b resume detector maps to LOCK_STEP.
# This MUST run before the EXIT trap is armed and before any rm of the lock, so every
# exit path — success OR harness-kill (SIGTERM/timeout) — leaves a recoverable artifact.
# Degrades to a verbatim cp when jq is unavailable (current_step is still preserved in
# the copied lock). Guarded with || true: a snapshot failure must never abort the hook
# or block compaction.
write_pause_snapshot() {
  if command -v jq >/dev/null 2>&1; then
    jq --arg ts "$NOW" \
       '. + {paused_at: $ts, pause_reason: "precompact", halt_step: .current_step}' \
       "$LOCK" > "$SNAPSHOT" 2>/dev/null || cp -f "$LOCK" "$SNAPSHOT" 2>/dev/null || true
  else
    cp -f "$LOCK" "$SNAPSHOT" 2>/dev/null || true
  fi
}

# No lock = no active pipeline = noop. Return BEFORE writing a snapshot or arming the
# EXIT trap, so a stray re-fire neither clobbers an existing snapshot nor touches a
# lock that isn't there (idempotence).
if [ ! -f "$LOCK" ]; then
  emit_empty
fi

# Lock confirmed present — write the resume snapshot NOW, before the EXIT trap that
# removes the lock is even armed. This closes the "lock removed, no snapshot" window
# that a mid-run harness kill would otherwise open.
write_pause_snapshot

# Always-run cleanup: ensure lock is removed regardless of which exit path is
# taken (including SIGTERM/timeout from the harness, jq-missing degraded mode,
# or unexpected errors). A leftover lock would block the next pipeline
# invocation with a collision halt — so removing it on any exit is safer than
# leaving it. Safe because write_pause_snapshot already persisted resume state.
# Idempotent — `rm -f` on success path is a noop.
trap 'rm -f "$LOCK"' EXIT

# jq is required for safe parsing — degrade gracefully if missing.
# The EXIT trap will remove the lock; the cp-fallback snapshot above already
# preserved resume state so the next invocation can recover via Phase 0b.
if ! command -v jq >/dev/null 2>&1; then
  echo "on-precompact: jq not found, skipping pause processing (lock removed by EXIT trap; resume snapshot preserved at $SNAPSHOT)" >&2
  emit_empty
fi

SKILL=$(jq -r '.skill // ""' "$LOCK" 2>/dev/null)
REPORT=$(jq -r '.report_path // ""' "$LOCK" 2>/dev/null)
BRANCH=$(jq -r '.branch // ""' "$LOCK" 2>/dev/null)
PR_URL=$(jq -r '.pr_url // ""' "$LOCK" 2>/dev/null)
# Hook-private name, deliberately not TRACKER: sourcing resolve-platform.sh below
# unsets and re-resolves TRACKER (and leaves it unset when it returns 1 part-way),
# so a shared name would have the signal report whatever the resolver decided —
# or nothing — instead of what the lock said.
LOCK_TRACKER=$(jq -r '.tracker // ""' "$LOCK" 2>/dev/null)
TRACKER_ISSUE=$(jq -r '.tracker_issue // ""' "$LOCK" 2>/dev/null)
CURRENT_STEP=$(jq -r '.current_step // 0' "$LOCK" 2>/dev/null)
# NOW is set once near the top (used by both write_pause_snapshot and the report entry).

# Sanity: if we don't even know which skill, bail gracefully
if [ -z "$SKILL" ]; then
  echo "on-precompact: lock file missing 'skill' field, skipping" >&2
  rm -f "$LOCK"
  emit_empty
fi

# Append pause entry to report
if [ -n "$REPORT" ] && [ -f "$REPORT" ]; then
  {
    echo ""
    echo "---"
    echo ""
    echo "## Pipeline Paused — $NOW"
    echo ""
    echo "⏸️ **Context compaction imminent.** The \`/${SKILL}\` orchestrator was halted by the PreCompact hook before Claude's context could be summarised."
    echo ""
    echo "**State at pause**:"
    echo ""
    echo "- Skill: \`/${SKILL}\`"
    echo "- Branch: \`${BRANCH}\`"
    echo "- Last step boundary: Step ${CURRENT_STEP}"
    echo "- PR: ${PR_URL:-not yet created}"
    echo "- Tracker: ${LOCK_TRACKER:-none} ${TRACKER_ISSUE:+#${TRACKER_ISSUE}}"
    echo ""
    echo "**Resume**: re-invoke \`/${SKILL} <path>\` (same path) and choose **Resume from last completed step** when prompted. Phase 0b will read this report, verify completed-step artifacts, and re-run Step ${CURRENT_STEP}."
    echo ""
    echo "**Pipeline Progress** for this step is now \`⏸️ Paused\` — equivalent to \`⏳ Pending\` for resume purposes (the step will re-run from the start)."
    echo ""
  } >> "$REPORT" || echo "on-precompact: failed to append to report" >&2

  # Best-effort commit + push
  git add "$REPORT" 2>/dev/null || true
  git commit -m "docs(${SKILL}): pipeline paused at step ${CURRENT_STEP} — context compaction imminent" >/dev/null 2>&1 || true
  git push origin HEAD >/dev/null 2>&1 || true
fi

# Best-effort PR comment — through the access gate, lead first, body by file.
#
# `tracker_write` is what makes a declared `access.tracker` restriction hold
# here: under anything but `full` it records the comment in the deferred
# journal instead of posting it. The body lives in the state dir rather than a
# mktemp so the recorded argv still names a file a human can post by hand.
# Fail closed: no resolver, no lead → no comment, and the signal says which.
PR_COMMENT_OUTCOME="(no PR yet)"
if [ -n "$PR_URL" ]; then
  PR_COMMENT_OUTCOME="skipped — gh not on PATH"
  if command -v gh >/dev/null 2>&1; then
    PR_COMMENT_OUTCOME="skipped — node not on PATH (nothing posted)"
    RESOLVER_OK=false
    if command -v node >/dev/null 2>&1; then
      # Three different failures, three different outcomes. A missing sibling
      # means the hook was copied without its bundle (re-run the bundler) —
      # and resolve-platform.sh itself returns 1 before reading any config when
      # read-config.sh is absent beside it, so that file is checked here too, or
      # a partial bundle would be reported as a rejected config. A resolver that
      # is present and returns non-zero has REJECTED the config (malformed
      # access: block, unsupported access.vcs); sending that operator to the
      # bundler is the wrong troubleshooting row.
      PR_COMMENT_OUTCOME="skipped — resolve-platform.sh or read-config.sh not found beside the hook (nothing posted)"
      if [ -f "$HOOK_DIR/resolve-platform.sh" ] && [ -f "$HOOK_DIR/read-config.sh" ]; then
        PR_COMMENT_OUTCOME="skipped — resolve-platform.sh failed to load: it rejected the config (nothing posted)"
        source "$HOOK_DIR/resolve-platform.sh" 2>/dev/null && RESOLVER_OK=true
      fi
    fi
    if [ "$RESOLVER_OK" = true ]; then
      PR_COMMENT_OUTCOME="skipped — stakeholder-summary-cli.js could not render the lead (nothing posted)"
      LEAD=$(command node "$HOOK_DIR/stakeholder-summary-cli.js" --stage pipeline-paused 2>/dev/null) || LEAD=""
      if [ -n "$LEAD" ]; then
        PR_BODY=$(printf '⏸️ **Pipeline paused — context compaction imminent**\n\nThe `/%s` orchestrator paused at Step %s because Claude'\''s context window approached its limit.\n\n**State saved in**: `%s`\n\n**To resume**: re-invoke `/%s <path>` (same path) and choose **Resume from last completed step** when prompted.' \
          "$SKILL" "$CURRENT_STEP" "$REPORT" "$SKILL")
        # Step-suffixed, and the step is in the intent too. A deferred record's
        # id is derived from intent + argv + target + stdin; with one body path
        # and no step, a pause at Step 3 and a pause at Step 6 produced two
        # records with ONE id — the handover kept the first and the hook had
        # overwritten the body with the second. Each pause now names its own
        # body file, so each record is distinct and points at the text that
        # belongs to it.
        PR_BODY_FILE="$STATE_DIR/precompact-pr-comment.step-${CURRENT_STEP}.md"
        printf '%s\n\n---\n\n%s\n' "$LEAD" "$PR_BODY" > "$PR_BODY_FILE"
        # tracker_write returns 0 on EVERY deferral branch, including "the record
        # could not be written" — it says so only on stderr. Capture that and
        # read it, so the signal never asserts a journal record that does not
        # exist; an audit trail that claims more than it holds is the failure
        # the journal exists to prevent.
        TW_ERR="$STATE_DIR/precompact-pr-comment.step-${CURRENT_STEP}.stderr"
        TRACKER_WRITE_KIND=github.pr.comment \
        TRACKER_WRITE_SKILL="$SKILL" \
        TRACKER_WRITE_INTENT="Post the pipeline-paused notice (Step ${CURRENT_STEP}) on the pull request (body: $PR_BODY_FILE)" \
          tracker_write gh pr comment "$PR_URL" --body-file "$PR_BODY_FILE" >/dev/null 2>"$TW_ERR"
        TW_RC=$?
        if [ "${ACCESS_TRACKER:-full}" != "full" ]; then
          if grep -q 'recorded as' "$TW_ERR" 2>/dev/null; then
            PR_COMMENT_OUTCOME="deferred — access.tracker=${ACCESS_TRACKER} (recorded in the deferred-mutation journal, not posted)"
          else
            PR_COMMENT_OUTCOME="deferred — access.tracker=${ACCESS_TRACKER}, but the deferred record was NOT written (not posted; body kept at $PR_BODY_FILE)"
          fi
        elif [ "$TW_RC" -eq 0 ]; then
          PR_COMMENT_OUTCOME="posted: $PR_URL"
        else
          PR_COMMENT_OUTCOME="failed — gh pr comment returned non-zero (body kept at $PR_BODY_FILE)"
        fi
        rm -f "$TW_ERR"
      fi
    fi
  fi
fi

# Best-effort tracker-issue comment — one tracker-comment.js call. The engine
# resolves the tracker (GitHub or Jira), renders the same lead, adds the
# idempotency marker and applies the access gate; this hook does none of that
# itself, which is the whole point. The stage is scoped by the step it paused
# at, so a second pause later in the run is a second comment rather than a
# suppressed one. Fail closed: engine or node missing → skipped, never bare.
ISSUE_COMMENT_OUTCOME="(no tracker issue)"
if [ -n "$TRACKER_ISSUE" ]; then
  ISSUE_COMMENT_OUTCOME="skipped — node or tracker-comment.js not found beside the hook (nothing posted)"
  if command -v node >/dev/null 2>&1 && [ -f "$HOOK_DIR/tracker-comment.js" ]; then
    ISSUE_BODY_FILE="$STATE_DIR/precompact-issue-comment.step-${CURRENT_STEP}.md"
    printf '⏸️ Pipeline paused at Step %s — context compaction imminent. State saved in `%s`. Resume with `/%s <path>`.\n' \
      "$CURRENT_STEP" "$REPORT" "$SKILL" > "$ISSUE_BODY_FILE"
    # --tracker from the LOCK, explicitly. Left to itself the engine resolves the
    # tracker from its environment, and this hook's environment is whatever the
    # PR arm happened to leave: TRACKER exported when resolve-platform.sh was
    # sourced, nothing when there was no PR yet. With nothing, the engine falls
    # back to JIRA_URL presence — and a GitHub project whose shell carries a
    # JIRA_URL would post issue #42 to Jira. The lock knows which tracker the
    # pipeline is on; routing must not depend on which arms ran before this one.
    # Expanded below as ${arr[@]+"${arr[@]}"}: under `set -u` a bare "${arr[@]}"
    # on an EMPTY array is "unbound variable" in bash 3.2 (macOS /bin/bash),
    # which is a bash `#!/usr/bin/env bash` can resolve to on a consumer machine.
    case "$LOCK_TRACKER" in
      jira|github) TRACKER_FLAG=(--tracker "$LOCK_TRACKER") ;;
      *)           TRACKER_FLAG=() ;;
    esac
    ISSUE_COMMENT_JSON=$(command node "$HOOK_DIR/tracker-comment.js" \
      --issue "$TRACKER_ISSUE" --stage "pipeline-paused-${CURRENT_STEP}" \
      --body-file "$ISSUE_BODY_FILE" ${TRACKER_FLAG[@]+"${TRACKER_FLAG[@]}"} --quiet --json 2>/dev/null) || true
    ISSUE_COMMENT_REASON=$(printf '%s' "$ISSUE_COMMENT_JSON" | jq -r '.reason // "unknown"' 2>/dev/null)
    ISSUE_COMMENT_OUTCOME="${ISSUE_COMMENT_REASON:-unknown} — #${TRACKER_ISSUE}${LOCK_TRACKER:+ (${LOCK_TRACKER})}"
  fi
fi

# Remove the lock file so a stray re-fire is a noop
rm -f "$LOCK"

# Build the agent signal
SIGNAL=$(cat <<EOF
🛑 PIPELINE-PAUSE-SIGNAL

The \`/${SKILL}\` pipeline was paused at Step ${CURRENT_STEP} due to imminent context compaction.

**Done by the hook (no action needed from you):**
- Implementation report appended with pause entry, committed, and pushed: \`${REPORT}\`
- PR comment: ${PR_COMMENT_OUTCOME}
- Tracker issue comment: ${ISSUE_COMMENT_OUTCOME}
- Lock file removed

**What you must do now:**
1. STOP all further pipeline work immediately. Do not invoke any more sub-skills, do not update the report, do not run any tools.
2. Output the user-facing pause summary below, then HALT.
3. Report the two comment outcomes above verbatim in the summary. \`deferred\` means the consumer's access.tracker setting held and the comment is in the deferred-mutation journal; \`no-credentials\` on a Jira issue means the hook's environment carried no JIRA_* credentials, so the Jira side was not commented on.

**User-facing summary template:**

\`\`\`
⏸️ Pipeline Paused — Context Compaction Imminent

Skill:                 /${SKILL}
Paused at:             Step ${CURRENT_STEP}
Branch:                ${BRANCH}
PR:                    ${PR_URL:-(none yet)}
Implementation Report: ${REPORT}

The hook saved state, committed the report, and pushed to remote.
PR comment:            ${PR_COMMENT_OUTCOME}
Tracker issue comment: ${ISSUE_COMMENT_OUTCOME}
Resume with: /${SKILL} <path>   (choose 'Resume from last completed step' when prompted)
\`\`\`
EOF
)

jq -n --arg msg "$SIGNAL" '{hookSpecificOutput: {hookEventName: "PreCompact", additionalContext: $msg}}'

exit 0
