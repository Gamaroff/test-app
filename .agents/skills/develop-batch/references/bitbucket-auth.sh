#!/usr/bin/env bash
# AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/bitbucket-auth.sh. Regenerate via `npm run bundle`.
# bitbucket-auth.sh — source this file to resolve Bitbucket REST authentication.
#
# Usage (in a skill or script) — an installed skill sources the bundled copy at
# references/bitbucket-auth.sh; in this repo the path is
# shared/resources/bitbucket-auth.sh:
#   source references/bitbucket-auth.sh || { echo "no Bitbucket credential"; exit 1; }
#   curl -sf "${BB_CURL_AUTH[@]}" "https://api.bitbucket.org/2.0/..."
#
# Outputs:
#   BB_AUTH_SCHEME — "bearer" | "basic" | "none"
#   BB_CURL_AUTH   — array of curl arguments; EMPTY when the scheme is "none"
#
# Exit status: 0 when a credential was resolved; 1 when none was, with a
# diagnosis on stderr. Callers MUST check it — see "Why this returns non-zero".
#
# ---------------------------------------------------------------------------
# Scheme selection is by variable NAME, never by inspecting the token's value
# ---------------------------------------------------------------------------
#   BITBUCKET_ACCESS_TOKEN set → Authorization: Bearer <token>
#   otherwise                  → --user "$BITBUCKET_USERNAME:<basic token>"
#
# Bitbucket repository, project and workspace access tokens authenticate with
# Bearer. Atlassian API tokens authenticate with Basic, alongside a username.
# Both are legitimate; which one a team may use is often decided by whoever
# controls token issuance, not by whoever writes the tooling.
#
# The selector is the variable name because the alternative — sniffing the
# token's prefix (`ATATT…`) to guess the scheme — silently mis-authenticates
# the day Atlassian changes a credential format. That is not hypothetical:
# app passwords were removed on 2026-07-28, inside this project's lifetime. A
# name is a decision the operator made; a prefix is a guess about a vendor.
#
# Precedence is Bearer-first and deliberate: a consumer that sets
# BITBUCKET_ACCESS_TOKEN has opted in explicitly, and leaving stale Basic vars
# in a .env should not silently override that choice. An existing consumer sets
# no BITBUCKET_ACCESS_TOKEN, falls through to Basic, and sees no change — the
# back-compatibility here is structural rather than promised.
#
# A Bearer access token has no username. That is the real structural difference
# between the two credential types, and it is why BITBUCKET_USERNAME is
# required on the Basic branch and unused on the Bearer one.
#
# ---------------------------------------------------------------------------
# Why this returns non-zero rather than emitting an empty credential
# ---------------------------------------------------------------------------
# Bitbucket answers an unauthenticated request to a private repository with
# 404, not 401 — it hides the repository rather than refusing the caller. So a
# missing, empty or wrong-scheme credential does not surface as an auth error.
# It surfaces as an empty list, which reads exactly like "there is nothing
# there". A half-formed `--user user:` or an empty `Authorization: Bearer`
# header would therefore fail *silently*, which is the single failure mode this
# helper exists to prevent. When nothing resolves, BB_CURL_AUTH is left empty
# and the status is 1; make the caller stop, and never paper over it.
#
# For the same reason: verify auth by STATUS CODE (a repo-root probe returning
# 200), never by the length of a returned list.

# Resolve into BB_AUTH_SCHEME / BB_CURL_AUTH. Called once at source time;
# re-callable if the environment changes underneath a long-running shell.
bitbucket_resolve_auth() {
  BB_AUTH_SCHEME="none"
  BB_CURL_AUTH=()

  if [ -n "${BITBUCKET_ACCESS_TOKEN:-}" ]; then
    BB_AUTH_SCHEME="bearer"
    BB_CURL_AUTH=(--header "Authorization: Bearer ${BITBUCKET_ACCESS_TOKEN}")
    return 0
  fi

  # New name preferred; the legacy name is still honoured. Consumers commonly
  # set both to the same value on purpose — do not "tidy" one away.
  local basic_token="${BITBUCKET_API_TOKEN:-${BITBUCKET_APP_PASSWORD:-}}"
  if [ -n "${BITBUCKET_USERNAME:-}" ] && [ -n "$basic_token" ]; then
    # shellcheck disable=SC2034  # output contract: set here, read by the sourcing caller (see header)
    BB_AUTH_SCHEME="basic"
    # shellcheck disable=SC2034  # ditto. NOT `export`ed: bash cannot export an array, so `export`
    # here would silence the warning while doing nothing a child process could observe.
    BB_CURL_AUTH=(--user "${BITBUCKET_USERNAME}:${basic_token}")
    return 0
  fi

  # Name what is missing, never what was found — no credential value, or part
  # of one, may reach a log.
  {
    echo "Error: no Bitbucket credential resolved."
    echo "  Set BITBUCKET_ACCESS_TOKEN (repository/project/workspace access token — Bearer),"
    echo "  or BITBUCKET_USERNAME plus BITBUCKET_API_TOKEN (Atlassian API token with Bitbucket"
    echo "  scopes ticked — Basic). BITBUCKET_APP_PASSWORD is read as a legacy fallback."
    echo "  Bitbucket answers unauthenticated calls to private repos with 404, so an unset"
    echo "  credential otherwise looks like an empty result rather than an error."
  } >&2
  return 1
}

bitbucket_resolve_auth
# `return` when sourced (the supported use); `exit` when run directly, so the
# status is still observable either way.
_bb_auth_rc=$?
return $_bb_auth_rc 2>/dev/null || exit $_bb_auth_rc
