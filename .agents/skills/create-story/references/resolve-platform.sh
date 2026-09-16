#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/resolve-platform.sh. Regenerate via `npm run bundle`.
# resolve-platform.sh — source this file to set TRACKER, VCS, ACCESS_TRACKER and ACCESS_VCS.
#
# Usage (in a skill or script):
#   source shared/resources/resolve-platform.sh || exit 1
#   # The four variables are now set for the remainder of the shell session.
#
# The `|| exit 1` is not optional. This resolver rejects an unrecognised value by writing to
# stderr and returning non-zero; a caller that sources it bare prints the message and carries on
# with a default — which for an access control is the exact silent-permissive outcome the
# validation exists to prevent.
#
# Outputs:
#   TRACKER        — "jira" or "github"          (identity: which tracker)
#   VCS            — "github" or "bitbucket"     (identity: which forge)
#   ACCESS_TRACKER — full | read-only | approve | command | manual   (access: how much it may do)
#   ACCESS_VCS     — full                        (only `full` is supported today; see below)
#
# Identity and access are separate axes. Knowing the tracker is Jira is what lets a restricted run
# still emit "move RAPP-605 to In Review" with the right URL and field names, so `manual` is a
# value of `access.tracker`, never of `tracker`.
#
# Resolver order for identity (per shared/resources/platform-detection.md):
#   1. skills-config.yaml keys (tracker:, vcs:)
#   2. Env vars (JIRA_URL → jira)
#   3. .env at the repo root (JIRA_URL=… → jira)  [TRACKER only]
#   4. Git remote (bitbucket.org → bitbucket)     [VCS only]
#   5. Default: github / github
#
# Resolver order for access — deliberately NOT the same:
#   Config and env are each read independently, then the MORE RESTRICTIVE of the two wins,
#   ordering the modes  manual < command < approve < read-only < full  by permissiveness.
#   Identity uses config → env → detect because picking the wrong tracker is a mistake; access
#   uses most-restrictive-wins because picking the wrong access is an escalation. A CI job or a
#   single run can therefore lock itself down without editing committed config, while a stray env
#   var can never loosen a config that deliberately restricts.
#
# Graceful degrade: see read-config.sh for the two tiers. A skills-config.yaml that is missing, or
# unparseable and carrying no `access:` block, still degrades to detection exactly as it always
# has. A malformed file that DOES carry an `access:` block fails closed instead — the default for
# access is `full`, so degrading there would silently re-grant the credentials the operator meant
# to withhold.

# Locate this file's own directory so the shared reader can be sourced as a sibling. read-config.sh
# sits beside this file in both layouts — shared/resources/ in-tree, <skill>/references/ once
# bundled — so a sibling path is correct in both and needs no rewrite.
#
# BASH_SOURCE is bash-only and macOS logins are zsh, so fall back to zsh's %x prompt expansion.
# The eval keeps that zsh-only parameter form away from bash's parser, which would otherwise
# reject it as a bad substitution even on the branch it never takes.
_rp_self="${BASH_SOURCE[0]:-}"
if [ -z "$_rp_self" ] && [ -n "${ZSH_VERSION:-}" ]; then
  eval '_rp_self="${(%):-%x}"'
fi
[ -n "$_rp_self" ] || _rp_self="$0"

# Resolved HERE and deliberately kept beyond the `unset _rp_self` below, because
# tracker_write() needs to find defer-mutation.js beside this file at CALL time —
# and at call time neither form above still works: BASH_SOURCE inside a function
# is bash-only, and zsh's %x would expand to the CALLER's file, not this one.
# Resolve once, at source time, where both forms are still correct.
#
# CDPATH= because `cd` prints the resolved directory on stdout when a CDPATH
# entry matches, which lands straight in the capture; an operator with CDPATH
# exported (common in dotfiles) would otherwise get a garbage path and a silent
# "writer not found" on every deferral.
# shellcheck disable=SC1007  # `CDPATH= cmd` is a one-command env prefix, not an empty assignment
_RP_SELF_DIR=$(CDPATH= cd -P -- "$(dirname -- "$_rp_self")" >/dev/null 2>&1 && pwd -P)

# shellcheck source=read-config.sh
source "$(dirname "$_rp_self")/read-config.sh" || {
  printf '❌ read-config.sh not found beside %s — cannot resolve platform.\n' "$_rp_self" >&2
  unset _rp_self
  return 1
}
unset _rp_self

# Permissiveness order, least to most — see access_rank below for the canonical ordering.
#
# The legal set is passed to validate_enum as SEPARATE LITERAL ARGUMENTS by validate_access_mode,
# never as one unquoted string relying on word splitting. zsh does not word-split an unquoted
# parameter expansion, so `$ACCESS_MODES` arrived there as a single candidate and rejected every
# legal value — and a bash caller that had set IFS would have hit the same thing.
validate_access_mode() {
  # validate_access_mode <source-label> <key-label> <value>
  validate_enum "$1" "$2" "$3" manual command approve read-only full
}

access_rank() {
  case "$1" in
    manual)    echo 0 ;;
    command)   echo 1 ;;
    approve)   echo 2 ;;
    read-only) echo 3 ;;
    full)      echo 4 ;;
    *)         echo -1 ;;
  esac
}

# validate_enum <source-label> <key-label> <value> <legal>...
# Legal sets are passed PER KEY, never shared. One set across `tracker` and `vcs` would accept
# `tracker: bitbucket` and `vcs: jira` — misconfigurations of exactly the class being closed here.
#
# <source-label> names where the value came from. It used to be hardcoded to the config filename,
# which sent an operator hunting through skills-config.yaml for a value that was actually set in
# their environment.
validate_enum() {
  local src="$1" key="$2" value="$3"
  shift 3
  local legal="$*" candidate
  for candidate in "$@"; do
    [ "$value" = "$candidate" ] && return 0
  done
  printf '❌ %s: %s: "%s" is not a recognised value.\n' "$src" "$key" "$value" >&2
  printf '   Legal values for %s: %s\n' "$key" "$legal" >&2
  return 1
}

# resolve_access <system>   (system = "tracker" | "vcs")
# Echoes the resolved mode. Returns 1 if either tier holds an unrecognised value.
resolve_access() {
  local system="$1" cfg env_name env_val resolved

  # LOW-6: whitelist rather than relying on the uppercasing to mangle hostile input, since this
  # function stays defined in the caller's shell after sourcing and its value reaches an `eval`.
  case "$system" in
    tracker) cfg="${_RP_ACC_T-$(read_nested_config_key_strict access tracker)}" ;;
    vcs)     cfg="${_RP_ACC_V-$(read_nested_config_key_strict access vcs)}" ;;
    *)       printf '❌ resolve_access: unknown system "%s".\n' "$system" >&2; return 1 ;;
  esac

  # A mapping where a mode belongs. `access:` -> `tracker:` -> `mode: manual` is a nesting typo,
  # and BOTH tiers used to read it as absent — pyyaml because the strict reader collapsed its
  # `__MAP__` signal to "", awk because an empty child value is indistinguishable from a null
  # unless you look at the next line. Absent means `full`, so the typo silently granted everything
  # it was written to withhold. Refusing is the point.
  #
  # The multi-line-flow-mapping branch that used to sit here (`__UNREADABLE__`, added narrowly in
  # task.51) is GONE, not running beside this one: the tier-2 subset scan sees that construct
  # file-wide and the hoisted check below halts on it before this function is ever reached.
  if [ "$cfg" = "__MAP__" ]; then
    printf '❌ %s: access.%s is a mapping; expected one of the five modes.\n' "$SKILLS_CONFIG_FILE" "$system" >&2
    printf '   Write the mode directly:\n     access:\n       %s: manual\n' "$system" >&2
    printf '   Legal values for access.%s: manual command approve read-only full\n' "$system" >&2
    return 1
  fi
  env_name="AGENT_SKILLS_ACCESS_$(printf '%s' "$system" | tr '[:lower:]' '[:upper:]')"
  # Portable indirect read. `${!name}` is bash-only and aborts under zsh with `bad substitution`,
  # which made this function — and so every guarded call site — fail on EVERY config on macOS.
  # `env_name` is built from the literals `tracker`/`vcs`, so there is nothing to inject.
  eval "env_val=\${$env_name:-}"

  # Both tiers are validated. An env var that bypassed validation would be a hole straight
  # through the check, since it is the tier a CI environment can set most easily.
  [ -n "$cfg" ] && { validate_access_mode "$SKILLS_CONFIG_FILE" "access.$system" "$cfg" || return 1; }
  [ -n "$env_val" ] && { validate_access_mode "environment" "$env_name" "$env_val" || return 1; }

  if [ -n "$cfg" ] && [ -n "$env_val" ]; then
    if [ "$(access_rank "$cfg")" -le "$(access_rank "$env_val")" ]; then
      resolved="$cfg"
    else
      resolved="$env_val"
    fi
  elif [ -n "$cfg" ]; then
    resolved="$cfg"
  elif [ -n "$env_val" ]; then
    resolved="$env_val"
  else
    resolved="full"
  fi
  echo "$resolved"
}

# ── One batched read of everything this file needs ──────────────────────────
# Six questions, one python spawn. Asking them one at a time cost ~500 ms per source, multiplied by
# every call site in a pipeline run. Falls back to the individual readers when tier 1 is
# unavailable — the awk tier has to answer each question separately anyway.
# Cleared unconditionally first. These used to be unset only on the success path, so after a
# failing source they persisted in the caller's shell — and because the access lookups use
# `${_RP_ACC_T-…}` (unset-only), a stale empty string suppressed the awk read entirely. A second
# source in the same shell then resolved against the first repo's config.
_RP_BULK=""; _RP_STATUS=""; _RP_TRACKER=""; _RP_VCS=""; _RP_SHAPE=""
unset _RP_ACC_T _RP_ACC_V 2>/dev/null || true
# The OUTPUTS too. Every early `return 1` below happens before these are assigned, so a failed
# source used to leave the previous repo's values — including an exported ACCESS_TRACKER=full —
# visible to the caller and inherited by every child process it spawns.
unset TRACKER VCS ACCESS_TRACKER ACCESS_VCS 2>/dev/null || true

# ── An explicit SKILLS_CONFIG_FILE must name a real config ──────────────────
# read-config.sh makes the config path env-overridable. Pointing it at an absent file, or at
# /dev/null (which is not a regular file, so it reads as "no config at all"), discarded a committed
# restriction silently on both tiers — falsifying the guarantee in that file's own header that a
# stray env var can never loosen a config that deliberately restricts. The AGENT_SKILLS_ACCESS_*
# vars are hardened with most-restrictive-wins; this sibling bypassed that by changing WHICH FILE is
# read rather than what it says.
#
# The rule is narrow on purpose: a redirect may point somewhere else, it may not point nowhere.
# Redirecting at a real config that happens to be permissive is a deliberate operator act, the same
# as editing the file — and it is the form the test suites and cross-repo callers legitimately use.
if [ "${_CONFIG_FILE_ORIGIN:-default}" = "env" ]; then
  if [ ! -f "$SKILLS_CONFIG_FILE" ] || [ ! -r "$SKILLS_CONFIG_FILE" ]; then
    printf '❌ SKILLS_CONFIG_FILE=%s does not name a readable config file.\n' "$SKILLS_CONFIG_FILE" >&2
    printf '   Refusing to resolve access from a config that is not there: a redirect that lands on\n' >&2
    printf '   nothing would silently discard any restriction the real config declares. Point it at\n' >&2
    printf '   a readable file, or unset it to use ./skills-config.yaml.\n' >&2
    return 1
  fi
fi

_RP_PARSE_REASON=""
if _RP_BULK=$(config_bulk status key:tracker key:vcs shape:access nested:access.tracker nested:access.vcs 2>/dev/null); then
  # A parse failure short-circuits the whole program before a single record is framed, so it
  # arrives as a bare line rather than a record. It now carries `<line>:<reason>` with it — the
  # malformed halt below reports that instead of listing the shapes this reader rejects and
  # inviting the operator to guess which one is theirs.
  case "$_RP_BULK" in
    __ERR__:*) _RP_PARSE_REASON="${_RP_BULK#__ERR__:}" ;;
  esac
  # Typed, NUL-framed records — see config_bulk's wire-format note. `_rp_val` yields a payload only
  # when the record is a VALUE; a signal (or a config that spells one) never reaches the logic below
  # as if it were data.
  _rp_rec() { config_bulk_get "$1" "$_RP_BULK"; }
  _rp_val() { local r; r=$(_rp_rec "$1"); case "$r" in "v "*) printf '%s' "${r#v }" ;; *) printf '' ;; esac; }
  _rp_sig() { local r; r=$(_rp_rec "$1"); case "$r" in "s "*) printf '%s' "${r#s }" ;; *) printf '' ;; esac; }
  _RP_STATUS=$([ "$(_rp_sig 1)" = "ok" ] && echo ok || echo malformed)
  [ -f "$SKILLS_CONFIG_FILE" ] || _RP_STATUS=missing

  # A signal means "not a scalar the config supplied"; a value is used verbatim, whatever it spells.
  # A SIGNAL of __MAP__ (the tracker.workflowFile form) means "no scalar override" → auto. It is
  # resolved here so the literal string never enters the logic below: a config whose tracker VALUE
  # spells __MAP__ must stay data and be rejected by validation, not be read as that signal.
  # An __ERR__ signal means the reader REFUSED the payload (it carried a framing separator). That is
  # a corrupt value, not an absent one, so it must fail closed — degrading it to `auto` would turn a
  # poisoned value into silent platform detection, which is the fall-through this task exists to end.
  # Every index, not just the config-derived ones. 1 (status) and 4 (shape) cannot be __ERR__ by
  # construction, so covering them is free — and it removes a positional coupling to the spec list
  # above, where inserting or reordering a spec would otherwise silently drop a value out of the
  # halt, in the permissive direction.
  for _rp_i in 1 2 3 4 5 6; do
    if [ "$(_rp_sig "$_rp_i")" = "__ERR__" ]; then
      case "$_rp_i" in
        2) _rp_k=tracker ;; 3) _rp_k=vcs ;;
        5) _rp_k=access.tracker ;; 6) _rp_k=access.vcs ;;
        *) _rp_k="a configured key" ;;
      esac
      printf '❌ %s: %s: the value contains a character that cannot be read safely.\n' \
        "$SKILLS_CONFIG_FILE" "$_rp_k" >&2
      printf '   Remove any \\x00 / \\x1e / \\x1f escape from the value and re-run.\n' >&2
      unset _rp_i _rp_k
      return 1
    fi
  done
  unset _rp_i

  _RP_TRACKER=$(_rp_val 2); [ -n "$_RP_TRACKER" ] || _RP_TRACKER=auto
  # `tracker:` above may legitimately be a mapping — that is the documented `tracker.workflowFile`
  # form, which means "no scalar override" → auto. `vcs:` has no mapping form, so collapsing its
  # __MAP__ signal to `auto` here silently accepted a misconfiguration that the awk tier rejects,
  # leaving the two tiers disagreeing about the same file. Keep the signal distinguishable so the
  # validation below can refuse it, in the same words on either tier.
  _RP_VCS=$(_rp_val 3)
  if [ -z "$_RP_VCS" ]; then
    [ "$(_rp_sig 3)" = "__MAP__" ] && _RP_VCS="__MAP__" || _RP_VCS=auto
  fi
  _RP_SHAPE=$(_rp_val 4); [ -n "$_RP_SHAPE" ] || _RP_SHAPE=absent
  # `_rp_val` yields nothing for a signal, so a `__MAP__` at index 5 or 6 used to arrive here as an
  # empty string — indistinguishable from "the key is not there", which resolves to `full`. That is
  # the tier-1 half of the same escalation the subset scan closes on tier 2: read from the SIGNAL,
  # not the value, so the shape is refused rather than defaulted. A config whose access.tracker
  # VALUE spells `__MAP__` is a value, carries kind `v`, and is rejected by enum validation instead.
  #
  # ONE record read per index, matched on the kind byte, rather than `_rp_val` followed by `_rp_sig`.
  # Each of those helpers spawns its own awk, so asking twice cost two spawns per key on the tier-1
  # path — for an answer the single record already carries. Measured: it is the difference between
  # this file costing 13 awk invocations per source and 15.
  _rp_acc() {
    local r; r=$(_rp_rec "$1")
    case "$r" in
      "v "*)       printf '%s' "${r#v }" ;;
      "s __MAP__") printf '__MAP__' ;;
      *)           printf '' ;;
    esac
  }
  _RP_ACC_T=$(_rp_acc 5)
  _RP_ACC_V=$(_rp_acc 6)
else
  _RP_STATUS=""   # empty ⇒ the helpers below are consulted individually
fi

# ── Fail-closed branch for an unreadable config ─────────────────────────────
# Separating "never opted in" from "opted in and now unreadable" is what lets a broken file warn for
# the first and halt for the second. The probe that draws that line has to fail CLOSED, because
# getting it wrong in the permissive direction is a silent escalation and getting it wrong in the
# restrictive direction is a loud, fixable error on a file that is already broken.
#
# `grep -q '^access:'` failed closed in neither respect:
#   * It greps the very file the parser has just failed to read. On a file that is unreadable rather
#     than malformed — chmod 000, root-owned, a bad mount — the grep fails too, and the branch fell
#     through to detection. The canonical documented `access:\n  tracker: manual`, merely made
#     unreadable, resolved to `full` at exit 0. The gate failed open exactly when it was needed.
#   * `^access:` matches only block form at column 0, so a root flow mapping, a quoted `"access":`,
#     a space before the colon, a leading BOM, or an access block supplied through a `<<` merge all
#     missed it, and a declared `manual` again resolved to `full`.
#
# _rp_access_may_be_declared answers the question the branch actually needs — "can I PROVE this file
# declares no access?" — and answers "no, I cannot" whenever it cannot read the file. It matches
# `access` used as a key in any spelling: after a line start, a brace, a comma, or whitespace, with
# optional quotes, optional space before the colon. `accessToken:` does not match. A mention inside a
# comment does, which is a deliberate over-match: the only consequence is that an ALREADY-MALFORMED
# file halts instead of warning.
_rp_access_may_be_declared() {
  [ -f "$SKILLS_CONFIG_FILE" ] || return 1          # no file at all — nothing was declared
  [ -r "$SKILLS_CONFIG_FILE" ] || return 0          # cannot read it — cannot prove absence
  # Two spellings, because YAML has two ways to write a key. The first alternative is the ordinary
  # one — `access` followed by its colon, after a line start, a brace, a comma or whitespace, with
  # optional quotes and optional space before the colon. The second is EXPLICIT KEY syntax, where
  # the colon is on the NEXT line (`? access` / `: {tracker: manual}`) and so cannot appear in the
  # first pattern at all.
  grep -qE '(^|[^[:alnum:]_-])["'"'"']?access["'"'"']?[[:space:]]*:|^[[:space:]]*\?[[:space:]]+["'"'"']?access["'"'"']?[[:space:]]*$' \
    "$SKILLS_CONFIG_FILE" 2>/dev/null && return 0
  # grep itself failing (a binary file, an I/O error) is also "cannot prove absence".
  [ $? -gt 1 ] && return 0
  return 1
}

if [ "${_RP_STATUS:-$(config_file_status)}" = "malformed" ]; then
  if [ -f "$SKILLS_CONFIG_FILE" ] && [ ! -r "$SKILLS_CONFIG_FILE" ]; then
    printf '❌ %s exists but cannot be read.\n' "$SKILLS_CONFIG_FILE" >&2
    printf '   Whether it declares an access level is therefore unknowable, and the default for\n' >&2
    printf '   access is `full` — so falling back would risk re-granting exactly what the file may\n' >&2
    printf '   have been written to withhold. Fix the permissions (chmod +r) and re-run.\n' >&2
    unset -f _rp_access_may_be_declared 2>/dev/null || true
    return 1
  fi
  if _rp_access_may_be_declared; then
    printf '❌ %s: access may be configured, and the file could not be parsed.\n' "$SKILLS_CONFIG_FILE" >&2
    printf '   The access level therefore cannot be determined. Refusing to fall back to `full` —\n' >&2
    printf '   fix the YAML and re-run.\n' >&2
    # Name the actual cause when the reader could supply one. This replaces the enumerated list of
    # shapes ("duplicate key / two overlapping merge sources / a NUL byte") added in task.51: the
    # list existed only because the sentinel carried no reason, and an operator reading three
    # candidate causes still has to work out which is theirs.
    if [ -n "$_RP_PARSE_REASON" ]; then
      _rp_line="${_RP_PARSE_REASON%%:*}"
      _rp_why="${_RP_PARSE_REASON#*:}"
      if [ "$_rp_line" = "0" ]; then
        printf '   Cause: %s\n' "$_rp_why" >&2
      else
        printf '   Cause: line %s: %s\n' "$_rp_line" "$_rp_why" >&2
      fi
      unset _rp_line _rp_why
    else
      printf '   Beyond ordinary syntax errors this reader also rejects a duplicate key, two `<<`\n' >&2
      printf '   merge sources defining the same key, and a value containing a NUL or an ASCII\n' >&2
      printf '   US/RS byte — each of which a YAML parser would resolve silently and permissively.\n' >&2
    fi
    printf '   If `access` appears only inside a comment, the file still needs fixing — but the\n' >&2
    printf '   halt itself will go away once it parses.\n' >&2
    unset -f _rp_access_may_be_declared 2>/dev/null || true
    return 1
  fi
  printf '⚠️  %s could not be parsed — falling back to platform detection.\n' "$SKILLS_CONFIG_FILE" >&2
fi

# ── Tier 2 met something outside its documented subset ──────────────────────
# ONE site, ONE message, covering every key this file consumes.
#
# It sits ABOVE the identity block deliberately, and that position is the whole point. Identity
# runs first: `TRACKER=$(read_config_key tracker)` a few lines below would receive
# `__UNSUPPORTED__`, validate_enum would reject it, and the run would halt with
#
#     ❌ skills-config.yaml: tracker: "__UNSUPPORTED__" is not a recognised value.
#        Legal values for tracker: jira github auto
#
# — no line, no construct, and neither migration path, on a config whose `tracker:` may be
# perfectly fine. The message below is the ENTIRE migration path for this breaking change, so a
# refusal that does not print it is a refusal that has failed. A suite asserting `rc=1` alone would
# have called that a pass; the stderr assertions in tracker-access.test.sh §42 are what hold it here.
#
# It reads the scan verdict GLOBAL directly and never a reader stdout. Tier 2 answers on a plain
# channel with no kind byte, so a config whose `tracker:` VALUE spells `__UNSUPPORTED__` would be
# indistinguishable from the signal there — the `__MAP__` forgery class task.51 spent three QA
# cycles closing, with no framing to lean on on this tier. Read the verdict; the forgery stays data
# and fails enum validation like any other bad value.
#
# GATED on the same fail-closed probe the malformed branch uses, for the same reason and with the
# same asymmetry. The default for ACCESS is `full`, so a file that may declare a restriction and
# cannot be read correctly must HALT. The default for IDENTITY is *detect*, which is neither
# permissive nor a guess — so a file that provably declares no access degrades with a warning, as a
# malformed file always has (platform-detection.md, "Malformed or unreachable skills-config.yaml").
# Halting there would lock a consumer out of a working repo over a key nobody read, which is the
# over-refusal this task was warned about at review time and the failure mode R-1 names.
#
# `_rp_access_may_be_declared` over-matches on purpose — `access` inside a comment counts — so the
# gate itself fails closed, and it greps the file independently of the reader that just refused it.
if _config_subset_refuses; then
  _rp_line="${_CONFIG_SUBSET_VERDICT%%:*}"
  _rp_what="${_CONFIG_SUBSET_VERDICT#*:}"
  if ! _rp_access_may_be_declared; then
    printf '⚠️  %s:%s: %s is outside what the no-dependency config reader can parse — falling back\n' \
      "$SKILLS_CONFIG_FILE" "$_rp_line" "$_rp_what" >&2
    printf '   to platform detection. No access level is declared here, so nothing is at risk; the\n' >&2
    printf '   identity default is detection, not a guess.\n' >&2
    unset _rp_line _rp_what
    unset -f _rp_access_may_be_declared 2>/dev/null || true
    _CONFIG_SUBSET_VERDICT="-"
  else
    printf '❌ %s:%s: this file uses %s, which the no-dependency config reader cannot parse.\n' \
      "$SKILLS_CONFIG_FILE" "$_rp_line" "$_rp_what" >&2
    printf '\n' >&2
    printf '   This host has no python3 + pyyaml, so the reader is running in its limited mode.\n' >&2
    printf '   Rather than guess — and risk resolving a declared access restriction to `full` —\n' >&2
    printf '   it is refusing. Two ways forward:\n' >&2
    printf '\n' >&2
    printf '     1. Rewrite the file in the documented subset:\n' >&2
    printf '        shared/resources/platform-detection.md → "Tier 2 — the strict subset"\n' >&2
    printf '     2. Install pyyaml (`pip install pyyaml`); the full-YAML tier accepts this file\n' >&2
    printf '        as written.\n' >&2
    unset _rp_line _rp_what
    unset -f _rp_access_may_be_declared 2>/dev/null || true
    return 1
  fi
fi
unset -f _rp_access_may_be_declared 2>/dev/null || true

# ── Identity ────────────────────────────────────────────────────────────────
if [ -n "$_RP_TRACKER" ]; then
  # From the typed bulk read: a mapping already became `auto`, so anything here is DATA — including
  # a value that happens to spell __MAP__, which must reach validation and be rejected.
  TRACKER="$_RP_TRACKER"
else
  TRACKER=$(read_config_key tracker)
  # Fallback path only: this reader still signals a mapping in-band.
  [ "$TRACKER" = "__MAP__" ] && TRACKER="auto"
fi
# A mapping-valued `tracker:` is the documented `tracker.workflowFile` form (see
# docs/reference/tracker-workflow.md). It is not a platform override and must not be graded as
# one — it means "no scalar override", i.e. detect.
validate_enum "$SKILLS_CONFIG_FILE" tracker "$TRACKER" jira github auto || return 1
# `.env` is read as the LAST positive probe, below the process environment, and only when the
# config declared nothing. Rationale, and the reason this is a deliberate behaviour change:
# `setup-consumer.sh` has always probed `.env` here while this file did not, so a repo with no
# `tracker:` key and JIRA_URL only in `.env` installed the Jira skill set and then resolved
# `github` at run time — it installed one platform and ran as the other. Closing that by DELETING
# the installer's probe was considered and rejected (task.83.bug.2): the installer runs once, often
# in a plain shell, while skills run later in a shell that has JIRA_URL because they need it, so
# dropping it trades a rare disagreement for a common one. Teaching this file to read `.env` is the
# other direction, and it is what lets the installer delegate here instead of re-implementing.
#
# The known cost: a repo with no `tracker:` key and a STALE JIRA_URL in `.env` — one that outlived
# the setup that wrote it — now resolves `jira` where it used to resolve `github`. The one-line
# opt-out is an explicit `tracker: github`, which still wins outright above. Since task 83 the
# wizard always writes a `tracker:` key, so no wizard-generated config can reach this rung at all.
#
# Parsed, not `source`d: `.env` is data, and sourcing it would execute whatever a checked-in file
# happens to contain.
#
# THE PATTERN IS NOT `^JIRA_URL=.+`, AND THE THREE DIFFERENCES ARE EACH A REAL BUG THAT SHIPPED:
#
#   `export JIRA_URL=…`   was MISSED. It is a very common .env spelling, and missing it reproduces
#                         the exact bug this rung exists to close — a shell that sourced such a
#                         .env has JIRA_URL exported and resolves jira, while an un-sourced shell
#                         resolved github.
#   `JIRA_URL=` + CRLF    was a FALSE POSITIVE: the carriage return satisfies `.+`, so an
#                         explicitly emptied key resolved jira. CRLF is the precise spelling task
#                         83 was written to fix; `.+` reintroduced it on the other side.
#   `JIRA_URL=""`         was a FALSE POSITIVE for the same reason, contradicting this comment.
#
# So: accept an optional `export` prefix, strip a trailing CR and one surrounding quote pair, trim
# whitespace, and only then ask whether anything is left. An empty value means NOT SET.
_rp_dotenv_has_jira() {
  [ -f .env ] && [ -r .env ] || return 1
  # -v q="'" builds the quote class dynamically: a literal single quote cannot appear inside a
  # single-quoted awk program, and escaping around it is where this kind of parser usually breaks.
  awk -v q="'" '
    /^[[:space:]]*(export[[:space:]]+)?JIRA_URL=/ {
      sub(/^[[:space:]]*(export[[:space:]]+)?JIRA_URL=/, "")
      sub(/\r$/, "")
      gsub("^[\"" q "]|[\"" q "]$", "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      # LAST match wins, not first — no `exit` here. A shell that sources this
      # file takes the last assignment, so a .env carrying `JIRA_URL=https://x`
      # followed by `JIRA_URL=` is UNSET to that shell. Stopping at the first
      # non-empty line would report it set, which is the same install-vs-run
      # asymmetry this rung exists to close, one level down.
      found = (length($0) > 0)
    }
    END { exit !found }
  ' .env 2>/dev/null
}
if [ "$TRACKER" = "auto" ]; then
  if [ -n "${JIRA_URL:-}" ]; then
    TRACKER=jira
  elif _rp_dotenv_has_jira; then
    TRACKER=jira
  else
    TRACKER=github
  fi
fi
unset -f _rp_dotenv_has_jira 2>/dev/null || true

if [ -n "$_RP_VCS" ]; then
  VCS="$_RP_VCS"
else
  VCS=$(read_config_key vcs)
fi
# `vcs:` has no documented mapping form, so a mapping is a mistake — but say so precisely rather
# than reporting the literal `__MAP__` sentinel as the offending value.
[ "$VCS" = "__MAP__" ] && VCS="(a mapping)"
validate_enum "$SKILLS_CONFIG_FILE" vcs "$VCS" github bitbucket auto || return 1
[ "$VCS" = "auto" ] && VCS=$(git remote get-url origin 2>/dev/null | grep -qi bitbucket.org && echo bitbucket || echo github)

# ── Access ──────────────────────────────────────────────────────────────────
# Reject an `access:` written in a shape the per-system reader cannot honour, rather than reading
# nothing out of it and returning the permissive default. `access: manual` (scalar) used to resolve
# to `full` with exit 0 — a silent escalation, and the precise failure this validation exists to
# stop. Checked once here rather than inside resolve_access, which runs twice.
if [ "${_RP_SHAPE:-$(config_child_shape access)}" = "scalar" ]; then
  printf '❌ %s: access: expected a mapping of per-system values, found a scalar.\n' "$SKILLS_CONFIG_FILE" >&2
  printf '   Write it per system, e.g.\n     access:\n       tracker: manual\n' >&2
  return 1
fi

ACCESS_TRACKER=$(resolve_access tracker) || return 1
ACCESS_VCS=$(resolve_access vcs) || return 1

# `access.vcs` is accepted and validated so the schema is stable, but only `full` works today.
# VCS write is a hard requirement for the whole pipeline: /create-pr returns a PR URL that later
# steps consume, and /develop-next gates on `gh pr merge`. Rejecting with the reason beats
# accepting a value that would be silently ignored.
if [ "$ACCESS_VCS" != "full" ]; then
  printf '❌ access.vcs: "%s" is accepted as a key but not supported as a value.\n' "$ACCESS_VCS" >&2
  printf '   VCS write access is a hard requirement: /create-pr returns a PR URL that later\n' >&2
  printf '   pipeline steps consume, and /develop-next gates on `gh pr merge`. Only `full` is\n' >&2
  printf '   supported today — remove the key or set `access.vcs: full`.\n' >&2
  return 1
fi

# Say plainly how far enforcement actually reaches. Without this an operator who sets
# `access: {tracker: manual}` gets a normal-looking run and reasonably concludes they are fully
# protected. Coverage as of task.54:
#   - the two stage CLIs (jira-stage.js, gh-stage.js) decline the board move and record it (task.52);
#   - Jira REST through jira-sync.js — every non-GET, annotated or not — plus the sprint scripts
#     and jira-epic-creator.js, are refused and recorded (task.53);
#   - the two GitHub board-field helpers (set-github-project-{priority,estimate}.sh) and every `gh`
#     mutation routed through `tracker_write` below — ~38 call sites, covering `gh issue comment`,
#     `gh pr comment`, `gh issue close` and the rest — are deferred and recorded (task.54);
#   - the GitHub issue lifecycle — create, edit, close, reopen, milestone create and the
#     sub-issue link — goes through `tracker-issue.js`, a CLI rather than a wrapper because
#     its callers CAPTURE its stdout. Under a deferring mode it records the mutation and
#     prints nothing, so the caller's `$( )` is empty by contract; a create additionally
#     records `blocking: true` and the checklist opens with the two-run convergence
#     instruction (task.56);
#   - NOT gated: Jira writes issued as raw `curl` from skill prose or through the Atlassian
#     MCP tools.
# Keep this notice accurate as each one lands; a warning that overstates coverage is worse than none.
# CR-5: the previous wording claimed every Jira write was covered, which the raw-curl and MCP
# paths falsify. Name the gated paths instead of generalising over them.
if [ "$ACCESS_TRACKER" != "full" ]; then
  printf '⚠️  access.tracker=%s is PARTIALLY ENFORCED — Jira REST via jira-sync.js, the sprint scripts, board/status moves, the GitHub board-field helpers, every gh mutation routed through tracker_write, and the GitHub issue lifecycle via tracker-issue.js (create, edit, close, reopen, milestone, sub-issue link) are deferred and recorded, but Jira writes made by raw curl or the Atlassian MCP tools still proceed normally.\n' \
    "$ACCESS_TRACKER" >&2
fi

unset _RP_BULK _RP_STATUS _RP_TRACKER _RP_VCS _RP_SHAPE _RP_ACC_T _RP_ACC_V _RP_PARSE_REASON
unset -f _rp_rec _rp_val _rp_sig _rp_acc 2>/dev/null || true

export TRACKER VCS ACCESS_TRACKER ACCESS_VCS

# tracker_call_with_retry — wrap a non-blocking tracker mutation (gh api,
# gh issue comment, gh pr comment, gh project, etc.) with 3× exponential
# backoff (1s, 2s, 4s).
#
# Usage:
#   tracker_call_with_retry gh api graphql -f query='...'
#   tracker_call_with_retry gh issue close 42
#
# Exit code: 0 on first success; non-zero (last attempt's code) after 3 failures.
# Stdout/stderr of the wrapped command are passed through.
#
# Caller policy: failures from this helper are non-blocking — log a warning
# in the Issues Log and continue. Tracker mutations are best-effort by design;
# the implementation report + PR remain the source of truth.
#
# Note for MCP-driven Jira calls: this helper is shell-only and cannot wrap
# Atlassian MCP tool invocations. Skill-level retry is required for MCP calls;
# orchestrator skills that call MCP should implement equivalent 3× retry
# inline (see develop-pipeline-step-0-resolve-and-prepare.md "Jira path").
tracker_write() {
  # ── ACCESS GATE (task.54) ─────────────────────────────────────────────────
  #
  # Prepended to the retry wrapper rather than added at each of its ~38 call
  # sites, which is the whole reason the rename is worth doing: one mode check
  # covers every `gh issue comment`, `gh pr comment` and `gh api graphql` that
  # already goes through here, with ZERO call-site edits.
  #
  # Mode comes from ACCESS_TRACKER, which this file has already resolved and
  # exported by the time any caller can reach this function — the config tier,
  # the env tier and the most-restrictive-wins reduction all happened above.
  # There is deliberately no second resolution here: unlike the two board-field
  # `.sh` helpers, a caller of this function has sourced this file by definition.
  #
  # `!= "full"` never truthiness: an UNSET ACCESS_TRACKER must read as `full`,
  # because a gate that misfires silences every tracker comment in the pipeline.
  if [ "${ACCESS_TRACKER:-full}" != "full" ]; then
    local _tw_writer _tw_id _tw_kind
    # The deferred-mutation writer — shared/resources/defer-mutation.js — which
    # the bundler ships next to this file, so the sibling lookup below resolves
    # in-tree and in an installed skill alike.
    #
    # THAT PATH IS SPELLED OUT IN FULL DELIBERATELY, and must stay that way. It is
    # the only thing that tells bundle_skill.py this file has a dependency: the
    # bundler's shell rule follows `source`/`exec` of a sibling `.sh`, and has no
    # rule for a shell script that runs a sibling `.js` via `node "$dir/x.js"`.
    # Discovery falls to a literal shared-resources path spelled out in the file,
    # exactly as
    # jira-sprint-lib.sh:32 and defer-mutation.js's own header both rely on.
    #
    # Without it the bundler copied resolve-platform.sh into 17 skills and left
    # the writer behind, so every deferral in an installed skill went unrecorded
    # while the whole suite stayed green in-repo (TASK-54-BUG-1). A test now pins
    # the co-location, because a comment is exactly what a later cleanup deletes.
    #
    # _RP_SELF_DIR, not a fresh BASH_SOURCE lookup: see its definition near the
    # top of this file for why the path cannot be re-derived from inside a
    # function. A `local` here would shadow it to empty under bash's dynamic
    # scope, which is why it is not in the `local` list above.
    _tw_writer="${_RP_SELF_DIR:-/nonexistent}/defer-mutation.js"

    # Infer the kind from argv for the shapes this wrapper actually sees, so the
    # checklist says "post a comment on issue #232" rather than "run some gh
    # command". An explicit TRACKER_WRITE_KIND always wins — a caller that knows
    # what it is doing outranks a pattern match on `$1 $2`.
    #
    # Anything unrecognised lands on `github.unknown-mutation`, whose consequence
    # is `irreversible` on purpose: nothing here knows what the call would have
    # done, and a confirm gate is the only honest default for that. Such a record
    # is also a signal that a path exists which nobody has annotated yet.
    _tw_kind="${TRACKER_WRITE_KIND:-}"
    if [ -z "$_tw_kind" ]; then
      case "${1:-} ${2:-}" in
        "gh issue")
          case "${3:-}" in
            comment) _tw_kind="github.issue.comment" ;;
            close)   _tw_kind="github.issue.close" ;;
            reopen)  _tw_kind="github.issue.reopen" ;;
            edit)    _tw_kind="github.issue.edit" ;;
            create)  _tw_kind="github.issue.create" ;;
          esac
          ;;
        "gh pr")
          case "${3:-}" in
            comment) _tw_kind="github.pr.comment" ;;
            create)  _tw_kind="github.pr.create" ;;
            merge)   _tw_kind="github.pr.merge" ;;
          esac
          ;;
        "gh project")
          [ "${3:-}" = "item-add" ] && _tw_kind="github.board.item-add"
          ;;
      esac
    fi
    [ -n "$_tw_kind" ] || _tw_kind="github.unknown-mutation"

    # The object the action is performed ON. `gh issue comment 42` and
    # `gh pr comment 42` both put the number in $3, which is the only shape this
    # needs to handle — every kind inferred above is a `gh <noun> <verb> <N>`.
    # Without it the checklist says "post a comment" and never says on what,
    # which is a line no human can action. Left empty for an unrecognised shape
    # rather than guessed at: the recorded argv is then the only honest answer.
    # Always passed, defaulting to `{}` — NEVER via `${_tw_target:+--target "$x"}`.
    # That form relies on the expansion word-splitting into two arguments, which
    # bash does and **zsh does not**: under zsh the whole thing arrived as one
    # argument, defer-mutation.js rejected it, and every `tracker_write` deferral
    # went unrecorded while still (correctly) refusing the write. The refusal is
    # the safety property, so nothing unsafe happened — but the audit trail was
    # silently empty, which is the failure this mechanism exists to prevent. This
    # is the same zsh word-splitting rule already documented at the top of this
    # file for `validate_enum`; it applies here for the same reason.
    _tw_target="{}"
    if [ "$_tw_kind" != "github.unknown-mutation" ] && \
       printf '%s' "${4:-}" | grep -qE '^[0-9]+$'; then
      _tw_target="{\"issue\":\"${4}\"}"
    fi

    if [ -f "$_tw_writer" ] && command -v node >/dev/null 2>&1; then
      _tw_id=$(node "$_tw_writer" \
        --kind "$_tw_kind" \
        --access "$ACCESS_TRACKER" \
        --intent "${TRACKER_WRITE_INTENT:-Run \`$*\` by hand — no semantic annotation, so what it would have changed is not known here}" \
        --target "$_tw_target" \
        --command-argv "$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "$@" 2>/dev/null || echo '[]')" \
        --skill "${TRACKER_WRITE_SKILL:-resolve-platform}" \
        --json 2>/dev/null \
        | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
      if [ -n "$_tw_id" ]; then
        echo "⏸️  access.tracker=${ACCESS_TRACKER} — not running \`${1:-} ${2:-} ${3:-}\`; recorded as ${_tw_id}." >&2
      else
        echo "⚠️  access.tracker=${ACCESS_TRACKER} — not running \`${1:-} ${2:-} ${3:-}\`, and the deferred record could not be written." >&2
      fi
    else
      echo "⚠️  access.tracker=${ACCESS_TRACKER} — not running \`${1:-} ${2:-} ${3:-}\`; defer-mutation.js not found, so it could not be recorded either." >&2
    fi
    # 0, deliberately. Callers of this helper are documented as non-blocking:
    # they log a warning and continue. Returning non-zero would convert a policy
    # deferral into a pipeline failure at ~38 sites at once.
    return 0
  fi

  local rc=0
  local delay
  for delay in 1 2 4; do
    "$@" && return 0
    rc=$?
    # On the last attempt, do not sleep — just return the failure code.
    [ "$delay" = "4" ] && return "$rc"
    sleep "$delay"
  done
  return "$rc"
}

# tracker_call_with_retry — the original name, kept as an alias.
#
# NOT redundant, and not safe to delete in a later cleanup. ~38 call sites across
# 11 skill and pipeline-step files invoke this name, several of them in prose that
# a reader copies by hand. Renaming the function without keeping this would break
# every one of them for no gain — the rename exists to make the NAME honest about
# the mode check now living inside it, not to force a corpus-wide edit.
#
# There is a test asserting this alias resolves and behaves identically. If you
# are here because that test failed after you removed this, the test is right.
tracker_call_with_retry() {
  tracker_write "$@"
}
