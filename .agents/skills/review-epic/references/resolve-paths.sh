#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/resolve-paths.sh. Regenerate via `npm run bundle`.
# resolve-paths.sh — source this file to set PRD_ROOT and ARCH_ROOT.
#
# Usage (in a skill or script):
#   source shared/resources/resolve-paths.sh
#   # PRD_ROOT and ARCH_ROOT are now set for the remainder of the shell session.
#
# Outputs:
#   PRD_ROOT   — directory containing the PRD shard tree (default: docs/prd)
#   ARCH_ROOT  — directory containing architecture documents (default: docs/architecture)
#
# Configurable keys in skills-config.yaml at repo root:
#   prd:
#     prdShardedLocation: docs/prd
#   architecture:
#     architectureShardedLocation: docs/architecture
#
# The *nested* structure under each root is a fixed convention:
#   ${PRD_ROOT}/{domain}/{feature}/epics/epic.{N}.{name}/stories/story.{E}.{S}.{name}/
#   ${ARCH_ROOT}/concepts/{coding-standards,tech-stack,source-tree}.md
#
# Resolver order:
#   1. skills-config.yaml nested key
#   2. Default (docs/prd or docs/architecture)
#
# Graceful degrade: python+pyyaml is tried first (full YAML parsing). If pyyaml
# is unavailable, awk handles the common 2-level nested case. If skills-
# config.yaml is missing/malformed at both tiers, the default is returned.
#
# The reader itself lives in read-config.sh, shared with resolve-platform.sh.
# This file resolves paths only — it never validates and never returns non-zero,
# because its defaults (docs/prd, docs/architecture) are safe when unset.

# `read_nested_config_key` lives in read-config.sh, which sits beside this file in both layouts —
# shared/resources/ in-tree, <skill>/references/ once bundled. It used to be defined here and
# copied by hand into anything else that needed it; one copy means one place to fix, and the
# bare-`python` interpreter bug both copies carried is fixed there.
#
# BASH_SOURCE is bash-only and macOS logins are zsh, so fall back to zsh's %x prompt expansion.
# The eval keeps that zsh-only parameter form away from bash's parser.
_rp_self="${BASH_SOURCE[0]:-}"
if [ -z "$_rp_self" ] && [ -n "${ZSH_VERSION:-}" ]; then
  eval '_rp_self="${(%):-%x}"'
fi
[ -n "$_rp_self" ] || _rp_self="$0"
# shellcheck source=read-config.sh
source "$(dirname "$_rp_self")/read-config.sh" || {
  printf '⚠️  read-config.sh not found beside %s — using default roots.\n' "$_rp_self" >&2
  PRD_ROOT="docs/prd"; ARCH_ROOT="docs/architecture"; export PRD_ROOT ARCH_ROOT
  unset _rp_self
  return 0
}
unset _rp_self

PRD_ROOT=$(read_nested_config_key prd prdShardedLocation)
[ -z "$PRD_ROOT" ] && PRD_ROOT="docs/prd"

ARCH_ROOT=$(read_nested_config_key architecture architectureShardedLocation)
[ -z "$ARCH_ROOT" ] && ARCH_ROOT="docs/architecture"

export PRD_ROOT ARCH_ROOT
