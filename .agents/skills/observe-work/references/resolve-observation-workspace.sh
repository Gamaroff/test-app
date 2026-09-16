#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/resolve-observation-workspace.sh. Regenerate via `npm run bundle`.
# resolve-observation-workspace.sh — source this file to set OBS_WORKSPACE,
# OBS_LOG_DIR and OBS_STAGING_DIR.
#
# Usage (in a skill or script):
#   source shared/resources/resolve-observation-workspace.sh || exit 1
#   # The three variables are now set for the remainder of the shell session.
#
# The `|| exit 1` is not optional. This resolver rejects an ephemeral anchor by
# writing to stderr and returning non-zero; a caller that sources it bare prints
# the message and then carries on with a workspace that is about to be torn down
# with its checkout — which is the silent-data-loss outcome the check exists to
# prevent. Same rule, same reason, as resolve-platform.sh.
#
# Outputs:
#   OBS_WORKSPACE    — the anchor directory
#   OBS_LOG_DIR      — $OBS_WORKSPACE/skill-observations/observation-log
#   OBS_STAGING_DIR  — $OBS_WORKSPACE/skill-updates
#
# All three are exported, not just the root. Upstream records what happens
# otherwise: pinning only the log directory left the staging root to be
# re-derived per session, and parallel sessions derived it plausibly and
# differently — three writers, two staging roots, one manifest that saw half the
# work.
#
# Resolver order (per observation-log-contract.md):
#   1. skills-config.yaml → observations.workspace
#   2. $OBS_WORKSPACE environment variable
#   3. Default: the project-identity path
#      <home>/.claude/projects/<encoded-project-path>
#
# This is NOT the TRACKER/VCS axis. The observation log is local state with no
# remote. This file is a sibling of resolve-platform.sh in FORM only — it must
# never import it, and never branch on tracker or forge.
#
# On the project-identity default: skills/remember-insight/SKILL.md *documents*
# the pattern <backup-root>/.claude/projects/<encoded-project-path>/memory/ and
# says the directory "is defined in your system context". Nothing in this repo
# computes <encoded-project-path>, so this file is the FIRST implementation of
# the convention here, not a second copy of one. The encoding is: take the
# absolute project path and replace every "/" with "-", which leaves the leading
# separator as a leading hyphen.
#     /Users/x/Projects/agent-skills  ->  -Users-x-Projects-agent-skills

# BASH_SOURCE is bash-only and macOS logins are zsh, so fall back to zsh's %x
# prompt expansion. The eval keeps that zsh-only parameter form away from bash's
# parser. Transcribed from resolve-paths.sh, which solved this first.
_ow_self="${BASH_SOURCE[0]:-}"
if [ -z "$_ow_self" ] && [ -n "${ZSH_VERSION:-}" ]; then
  eval '_ow_self="${(%):-%x}"'
fi
[ -n "$_ow_self" ] || _ow_self="$0"
_ow_dir="$(dirname "$_ow_self")"

# read-config.sh sits beside this file in both layouts — shared/resources/
# in-tree, <skill>/references/ once bundled.
# shellcheck source=read-config.sh
if ! source "${_ow_dir}/read-config.sh"; then
  printf '⚠️  read-config.sh not found beside %s — config tier unavailable.\n' \
    "$_ow_self" >&2
fi

# _ow_encode_project_path <abs-path>
# Encodes an absolute path into the <encoded-project-path> segment. Every "/"
# becomes "-", which turns the leading separator into a leading hyphen.
_ow_encode_project_path() {
  printf '%s' "${1//\//-}"
}

# _ow_project_root
# The absolute path of the project this workspace belongs to.
#
# This resolves to the MAIN worktree, never the linked one. `--show-toplevel`
# would be the obvious call and it is wrong here: inside a linked worktree it
# returns the WORKTREE path, so the encoded project-identity segment differs per
# worktree and the same project resolves two different workspaces. That is the
# silent fork `doctor` exists to catch, manufactured by the resolver itself —
# and it is not hypothetical, because /develop-batch dispatches every parallel
# story into a linked worktree.
#
# `--git-common-dir` is shared by every worktree of a repository and points at
# the main checkout's `.git`, so its parent is the main worktree. Falls back to
# $PWD outside a repository.
_ow_project_root() {
  local common root
  if common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) &&
    [ -n "$common" ]; then
    root=$(dirname "$common")
    # A bare repository has no worktree to anchor to; fall through rather than
    # anchoring the workspace inside the repository's own git directory.
    if [ -n "$root" ] && [ "$root" != "/" ] && [ -d "$root" ]; then
      printf '%s' "$root"
      return 0
    fi
  fi
  if root=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$root" ]; then
    printf '%s' "$root"
  else
    printf '%s' "$PWD"
  fi
}

# _ow_is_ephemeral <abs-path>
# Returns 0 when the path must be refused, echoing the reason to stdout.
#
# Three anchors are ephemeral. Each is a directory whose whole purpose is to be
# removed, so state written inside it is removed with it.
_ow_is_ephemeral() {
  local candidate="$1"

  case "$candidate" in
    */.claude/worktrees/* | */.claude/worktrees)
      printf 'path is inside .claude/worktrees/'
      return 0
      ;;
    /tmp/* | /tmp | /private/tmp/* | /private/tmp | /var/tmp/* | /var/tmp)
      printf 'path is inside a temporary directory'
      return 0
      ;;
  esac

  # A LINKED git worktree has a git-dir distinct from its git-common-dir. The
  # main checkout has them equal. Resolve both to absolute paths before
  # comparing — `git rev-parse` reports the common dir relative to the current
  # directory in some layouts and absolute in others, so a string compare of the
  # raw output produces a false positive in the main checkout.
  local gitdir commondir
  if gitdir=$(git -C "$candidate" rev-parse --absolute-git-dir 2>/dev/null) &&
    commondir=$(git -C "$candidate" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    if [ -n "$gitdir" ] && [ -n "$commondir" ] && [ "$gitdir" != "$commondir" ]; then
      printf 'path is inside a linked git worktree'
      return 0
    fi
  fi

  return 1
}

_ow_source=""
_ow_candidate=""

# 1. skills-config.yaml → observations.workspace
if command -v read_nested_config_key >/dev/null 2>&1 ||
  declare -F read_nested_config_key >/dev/null 2>&1; then
  _ow_candidate=$(read_nested_config_key observations workspace)
  [ -n "$_ow_candidate" ] && _ow_source="skills-config.yaml (observations.workspace)"
fi

# 2. $OBS_WORKSPACE
if [ -z "$_ow_candidate" ] && [ -n "${OBS_WORKSPACE:-}" ]; then
  _ow_candidate="$OBS_WORKSPACE"
  _ow_source="OBS_WORKSPACE environment variable"
fi

# 3. Project-identity default
if [ -z "$_ow_candidate" ]; then
  _ow_candidate="${HOME}/.claude/projects/$(_ow_encode_project_path "$(_ow_project_root)")"
  _ow_source="project-identity default"
fi

# Expand a leading tilde that arrived from config as a LITERAL character, and
# make the path absolute — every downstream comparison and every write depends
# on it. The tilde is built rather than written inline: a quoted "~" is a
# literal here by design, but it is also indistinguishable from the SC2088
# mistake (someone quoting a tilde they expected the shell to expand), so it
# gets flagged as SC2088. Constructing the character sidesteps the ambiguity
# rather than suppressing the check.
#
# (Note the wording above avoids starting a comment line with the linter's own
# name — a comment that begins with it is parsed as a directive, SC1072.)
_ow_tilde=$(printf '\176')
if [ "$_ow_candidate" = "$_ow_tilde" ]; then
  _ow_candidate="$HOME"
elif [ "${_ow_candidate#"${_ow_tilde}/"}" != "$_ow_candidate" ]; then
  _ow_candidate="${HOME}/${_ow_candidate#"${_ow_tilde}/"}"
fi
unset _ow_tilde
case "$_ow_candidate" in
  /*) ;;
  *) _ow_candidate="${PWD}/${_ow_candidate}" ;;
esac

# Refuse an ephemeral anchor. This is `reason: ephemeral-workspace` in the
# engine's vocabulary, and it is a refusal rather than a warning.
if _ow_reason=$(_ow_is_ephemeral "$_ow_candidate"); then
  printf '❌ observation workspace refused: %s\n' "$_ow_reason" >&2
  printf '   resolved to: %s\n' "$_ow_candidate" >&2
  printf '   source:      %s\n' "$_ow_source" >&2
  printf '   State written to an ephemeral checkout is torn down with it. Set\n' >&2
  printf '   observations.workspace in skills-config.yaml, or OBS_WORKSPACE, to a\n' >&2
  printf '   durable path.\n' >&2
  unset _ow_self _ow_dir _ow_candidate _ow_source _ow_reason
  unset -f _ow_encode_project_path _ow_project_root _ow_is_ephemeral
  return 1
fi

OBS_WORKSPACE="$_ow_candidate"
OBS_LOG_DIR="${OBS_WORKSPACE}/skill-observations/observation-log"
OBS_STAGING_DIR="${OBS_WORKSPACE}/skill-updates"
export OBS_WORKSPACE OBS_LOG_DIR OBS_STAGING_DIR

unset _ow_self _ow_dir _ow_candidate _ow_source _ow_reason
unset -f _ow_encode_project_path _ow_project_root _ow_is_ephemeral
