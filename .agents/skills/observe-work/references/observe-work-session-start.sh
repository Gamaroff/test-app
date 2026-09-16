#!/bin/sh
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/observe-work-session-start.sh. Regenerate via `npm run bundle`.
# observe-work-session-start.sh — SessionStart hook for the observe-work skill.
#
# Emits the observation backlog's state as `hookSpecificOutput.additionalContext`
# so the agent starts the session already knowing what the review trigger would
# have told it. Reads only; writes nothing.
#
# SHIPPED, NOT INSTALLED. Register it as a SessionStart hook yourself — see
# skills/observe-work/references/environments.md.
#
# Why this exists: capture is hard-enforced by checkpoints hooked onto tool calls
# that were happening anyway. The review trigger is not — it is a soft step (read
# a file, compare a date) and gets skipped the same way activation does. That
# failure is self-concealing: capture keeps producing, the log looks healthy, and
# the only artefact recording the miss is a file reading `never` that nobody
# reads. So compute the state and inject it rather than asking the agent to look.
#
# ── The open count comes from the ENGINE, and there is no shell fallback. ─────
#
# Three QA cycles produced three counting defects here, all from one root cause:
# this hook used to reimplement `observation-log.js`'s queue rule in shell.
#
#   cycle 1  undercount  — `grep -l '^status: open$'` missed `status: open `
#                          (trailing space) AND missed the statusless fallback,
#                          so such a file counted as neither.
#   cycle 2  overcount   — the match was not scoped to the frontmatter, so a
#                          RESOLVED observation quoting `status: open` in its
#                          body counted as open.
#   cycle 3  both, and they CANCELLED — a quoted `status: "open"` read as
#                          not-open while a frontmatter-less file read as open.
#                          Hook and engine both said "2 open" and looked to
#                          agree; only `total` disagreed, 3 against 2.
#
# The queue rule is not hard, but it has enough edges — optional field, absent
# means open, parked excluded, resolved excluded, quoted scalars, non-observation
# files — that a second implementation is a second thing to keep true, and it was
# not kept true three times running. So the rule now lives in exactly one place.
#
# When the engine cannot be reached this hook is SILENT. It does not fall back to
# counting by hand. The entire justification for this file is an accurate number;
# a wrong one is worse than none, because a wrong number is acted on.
#
# Environment:
#   OBS_WORKSPACE  the observation workspace anchor. Required — this hook does
#                  NOT source the resolver, because a hook that exits non-zero
#                  can block session start. Unset or missing => silent exit 0.
#   OBS_ENGINE     path to observation-log.js. Defaults to the copy bundled
#                  beside this script inside the skill.
#   OBS_STALE_DAYS review-staleness threshold in days (default 14).
#
# POSIX sh. No bashisms: this runs under whatever /bin/sh the harness provides.

set -u

WORKSPACE="${OBS_WORKSPACE:-}"
[ -n "$WORKSPACE" ] || exit 0

OBS_DIR="${WORKSPACE}/skill-observations"
[ -d "${OBS_DIR}/observation-log" ] || exit 0

# The engine ships beside this script once bundled into the skill's references/.
# CDPATH is unset (not assigned inline) so `cd` cannot resolve somewhere else;
# an inline `CDPATH= cd` reads as an assignment to shellcheck (SC1007).
unset CDPATH
script_dir=$(cd -- "$(dirname -- "$0")" && pwd) || exit 0
ENGINE="${OBS_ENGINE:-${script_dir}/observation-log.js}"
[ -f "$ENGINE" ] || exit 0

# `command node`, never bare `node`: where `node` is an nvm shell function the
# bare form prints nvm's help to stdout and corrupts the JSON captured here.
command -v node >/dev/null 2>&1 || exit 0

queue_json=$(command node "$ENGINE" queue --workspace "$WORKSPACE" --json 2>/dev/null) || exit 0
[ -n "$queue_json" ] || exit 0

# Read `total` and the length of the `open` list straight out of the engine's
# payload. Both are the ENGINE's numbers — nothing here re-derives the queue
# rule; this only transcribes. Emits nothing when the shape is not what we
# expect, which falls through to the silent exit below.
read_counts=$(
  printf '%s' "$queue_json" | tr -d '\n' | awk '
    {
      total = ""
      if (match($0, /"total"[[:space:]]*:[[:space:]]*[0-9]+/)) {
        total = substr($0, RSTART, RLENGTH)
        sub(/.*:[[:space:]]*/, "", total)
      }
      open = ""
      if (match($0, /"open"[[:space:]]*:[[:space:]]*\[[^]]*\]/)) {
        seg = substr($0, RSTART, RLENGTH)
        # Count entries INSIDE the brackets only. Matching from `"open"` through
        # `]` leaves the key itself in the segment, and counting quoted strings
        # across the whole segment then counts it too — an off-by-one that reads
        # as one extra open observation. Strip everything up to `[` first.
        sub(/^[^[]*\[/, "", seg)
        open = gsub(/"[^"]*"/, "", seg)
      }
      if (total != "" && open != "") print total " " open
    }
  '
)
[ -n "$read_counts" ] || exit 0
total=${read_counts% *}
open=${read_counts#* }

[ "$total" -gt 0 ] || exit 0

last=$(cat "${OBS_DIR}/last-review-date.txt" 2>/dev/null || echo never)
[ -n "$last" ] || last=never

stale_days="${OBS_STALE_DAYS:-14}"
# BSD and GNU date disagree on relative-date syntax; try both, and fall back to
# treating every date as stale rather than silently skipping the check.
cutoff=$(date -u -v-"${stale_days}"d +%Y-%m-%d 2>/dev/null \
  || date -u -d "${stale_days} days ago" +%Y-%m-%d 2>/dev/null \
  || echo 9999-12-31)

# Compare ISO dates WITHOUT `<` inside `[ ]`. ISO dates sort lexically, so this
# is true exactly when $last is not later than $cutoff — in every POSIX shell.
# `\<` is a bash/ksh extension that zsh rejects and sh does not know.
if [ "$last" = "never" ]; then
  review_state="never run"
elif [ "$(printf '%s\n%s\n' "$last" "$cutoff" | sort | head -1)" = "$last" ]; then
  review_state="last run ${last} — stale (over ${stale_days} days)"
else
  review_state=""
fi

# Silence is a correct outcome: a fresh review with nothing to nag about must
# emit nothing at all, which is why the branch above can leave review_state
# empty and why the fixtures prove that third branch explicitly.
if [ "$open" -eq 0 ] && [ -z "$review_state" ]; then
  exit 0
fi

msg="observe-work: ${open} open observation(s) of ${total} in the log."
[ -n "$review_state" ] && msg="${msg} Skill review ${review_state}."
msg="${msg} Run the Session Start Protocol; offer the review in one line and do not gate the user's task on it."

# Hand-rolled JSON escaping: the payload is a single line of our own prose, so
# only the quote and backslash cases can arise.
escaped=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$escaped"
