#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/tracker-issue.js. Regenerate via `npm run bundle`.
/**
 * tracker-issue — perform one GitHub issue-lifecycle mutation.
 *
 * The fourth peer of jira-stage.js, gh-stage.js and tracker-comment.js, and the
 * one that exists for a reason none of them had: **its callers read its stdout.**
 *
 * `tracker_write` (resolve-platform.sh) is the right chokepoint for the ~38 `gh`
 * mutations nobody captures. It refuses the call, records it, writes its notice
 * to stderr, and returns 0. For a call whose value the caller binds —
 *
 *     ISSUE_URL=$(gh issue create …)
 *
 * — that is exactly wrong. The capture comes back EMPTY, and the caller writes
 * nothing, or garbage, into a document's frontmatter. A shell function cannot
 * both refuse a call and return the value the call would have produced, which is
 * why this is a CLI and not another wrapper arm.
 *
 * Three things follow from being a peer, and they are not stylistic:
 *
 *   1. The same exit codes, so the `|| echo "⚠️ …"` subshells in the step files
 *      keep working unchanged.
 *   2. The same `--json` `{ reason }` contract, so a step doc author who has
 *      read one of these CLIs has read all four.
 *   3. The same access gate in the same place, so a non-`full` run demonstrably
 *      makes no network call.
 *
 * ── The empty capture is the contract, not the bug ──────────────────────────
 *
 * Under a deferring mode this prints NOTHING to stdout and exits 0 with
 * `reason: "deferred"`. A caller doing `N=$(tracker-issue.js --kind create …)`
 * gets an empty string — deliberately, and documented here so the next reader
 * does not "fix" it.
 *
 * The alternative — emitting a placeholder — was rejected. Writing
 * `github_issue: 0` into frontmatter would defeat the idempotent
 * `synced-from-*` label search that stops the NEXT run creating a duplicate
 * issue. A wrong key is worse than no key: no key converges on the second run,
 * a wrong key never converges and leaves a duplicate behind.
 *
 * So the deferred record for a value-producing kind carries `produces` and
 * `blocking: true`, and the checklist opens with a banner telling the operator
 * to perform it, write the value into the document, and re-run. That is the
 * **two-run convergence**, and it uses machinery that already exists: the second
 * run finds the key present and takes the ordinary update path.
 *
 * Every `ensure-*` skill that captures from this already documents
 * "all failures are non-blocking" and sets an empty id on failure. That existing
 * tolerance is what makes an empty capture safe to continue past — this CLI did
 * not have to invent a new caller contract, only to reuse the one they have.
 *
 * Usage:
 *   tracker-issue.js --kind <kind> [kind-specific flags]
 *                    [--json] [--quiet] [--dry-run] [--strict]
 *
 * Exit codes (transcribed from its three siblings so this is a drop-in for the
 * same subshell idiom):
 *   0  performed, already, deferred, no-credentials, dry-run —
 *      and any unhandled throw
 *   1  a skip, but only under --strict
 *   2  usage error (unknown/missing --kind, missing required flag, bad value)
 *
 * Tested by tests/tracker-issue.test.mjs (`node --test` — see package.json).
 * The path is written relative on purpose: a shared-resources path prefix here
 * would make bundle_skill.py follow it and copy the test suite into every
 * consuming skill.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const dm = require("./defer-mutation.js");

const GIT_EXEC_OPTS = {
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "ignore"],
};

/**
 * The kinds this CLI performs, and what each yields.
 *
 * `kind` here is the FLAG value (`--kind create`), deliberately short because a
 * step doc writes it by hand; `recordKind` is the roster name the deferred
 * record carries. Keeping them separate means the flag vocabulary can stay
 * readable without weakening the roster's namespacing, and it is the roster name
 * — never the flag — that reaches defer-mutation.js, which refuses anything
 * off-roster.
 *
 * `produces` mirrors the roster and is asserted against it by the test suite:
 * a kind whose record says it yields a symbol, but whose CLI arm prints nothing
 * on success, is a caller-visible lie that no other check would catch.
 */
const KINDS = Object.freeze({
  create: {
    recordKind: "github.issue.create",
    produces: "github.issueNumber",
    // A create under defer strands every dependant action, so it is the case
    // `blocking` exists for. See tracker-access-record.md §Blocking.
    blocking: true,
    required: ["title"],
    summary: "create a GitHub issue",
  },
  edit: {
    recordKind: "github.issue.edit",
    produces: null,
    blocking: false,
    required: ["issue"],
    summary: "edit a GitHub issue",
  },
  close: {
    recordKind: "github.issue.close",
    produces: null,
    blocking: false,
    required: ["issue"],
    summary: "close a GitHub issue",
  },
  reopen: {
    recordKind: "github.issue.reopen",
    produces: null,
    blocking: false,
    required: ["issue"],
    summary: "reopen a GitHub issue",
  },
  milestone: {
    recordKind: "github.milestone.create",
    produces: "github.milestoneNumber",
    // Blocking for the same reason as create: the four call sites attach the
    // returned number to an issue, and have nothing to attach without it.
    blocking: true,
    required: ["title"],
    summary: "create a GitHub milestone",
  },
  "sub-issue-link": {
    recordKind: "github.sub-issue.add",
    produces: null,
    blocking: false,
    required: ["issue", "parent"],
    summary: "attach a GitHub issue as a sub-issue of its parent",
  },
});

const KIND_NAMES = Object.freeze(Object.keys(KINDS));

const USAGE = `tracker-issue — perform one GitHub issue-lifecycle mutation

Usage:
  tracker-issue.js --kind <${KIND_NAMES.join("|")}> [flags]
                   [--json] [--quiet] [--dry-run] [--strict]

Kinds and their required flags:
  --kind create           --title <t> [--body-file <p>] [--label <l>]…
                          [--milestone <m>] [--repo <owner/name>]
                          → prints the new issue NUMBER on stdout
  --kind edit             --issue <N> [--title <t>] [--body-file <p>]
                          [--milestone <m>] [--add-label <l>]…
  --kind close            --issue <N> [--reason <completed|not planned>]
  --kind reopen           --issue <N>
  --kind milestone        --title <t> [--state <open|closed>]
                          → prints the milestone NUMBER on stdout
  --kind sub-issue-link   --issue <N> --parent <N>

Options:
  --kind, -k      Which mutation. Required.
  --issue, -i     Issue number the mutation targets.
  --parent        Parent issue number (sub-issue-link).
  --title, -t     Title (create, edit, milestone).
  --body-file, -f Path to a file holding the body (markdown).
                  A file, never an inline string: bodies contain backticks,
                  $(…) and newlines, and an interpolated body is a shell
                  injection waiting for the first body that contains one.
  --label         Repeatable. Label to set at create time.
  --add-label     Repeatable. Label to add on edit.
  --remove-label  Repeatable. Label to remove on edit.
  --milestone     Milestone title to attach (create, edit).
  --reason        Close reason: completed | not planned.
                  ("duplicate" needs gh's --duplicate-of, which this CLI has no flag for.)
  --state         Milestone state: open | closed. Default open.
  --repo          owner/name. Default: the current repository.
  --json          Emit a JSON result object on stdout.
  --quiet         Suppress informational output.
  --dry-run       Resolve everything, read nothing, write nothing.
  --strict        Exit 1 on a skip instead of 0.
  --help, -h      Show this message.

Under a deferring access mode this prints NOTHING to stdout, records the
mutation, and exits 0 with reason "deferred". A value-producing kind records
blocking:true — perform it, write the value into the document, and re-run.

Exit codes: 0 = every normal outcome, 1 = skip under --strict, 2 = usage error.
`;

// ---------------------------------------------------------------------------
// Output mode — a local copy, for the reason gh-stage.js gives: this file must
// not require jira-sync.js eagerly just to borrow a six-line helper.
//
// ⚠️  STDOUT IS THE VALUE CHANNEL HERE, AND THAT IS THE ONE REAL DIVERGENCE
//     FROM THE THREE SIBLINGS. Do not "restore consistency" by moving these
//     back to console.log.
//
// In jira-stage.js / gh-stage.js / tracker-comment.js nothing reads stdout, so
// their `info` writes there harmlessly. Here a caller does
//
//     ISSUE=$(tracker-issue.js --kind create …)
//
// so ANY commentary on stdout is captured as if it were the value. Routing
// `info` through console.log put the "⏸️  access.tracker=manual — not
// performing…" notice straight into that capture: the caller would have written
// a paragraph of prose into a document's frontmatter instead of the empty string
// the deferred contract promises. Caught by the byte-empty-stdout test, which
// exists precisely because this looked correct by inspection.
//
// The split is therefore:
//   value() → stdout. The produced symbol, and nothing else. Never suppressed by
//             --quiet: a caller capturing `$( )` asked for exactly this, and
//             --quiet silences commentary, not the return value. Under --json it
//             rides in the payload instead, so stdout stays one JSON document.
//   emit()  → stdout. The --json payload.
//   log()   → stdout, but only for --help, which nobody captures.
//   info(), warn(), err() → stderr. All human commentary.
// ---------------------------------------------------------------------------
function makeOutput({ json = false, quiet = false } = {}) {
  return {
    // --help only. Everything else that talks to a human uses info().
    log: (...a) => {
      if (!json && !quiet) console.log(...a);
    },
    info: (...a) => {
      if (!json && !quiet) console.error(...a);
    },
    warn: (...a) => {
      if (!json) console.warn(...a);
    },
    err: (...a) => console.error(...a),
    value: (v) => {
      if (!json) process.stdout.write(String(v) + "\n");
    },
    emit: (payload) =>
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n"),
    isJson: json,
    isQuiet: quiet,
  };
}

// ---------------------------------------------------------------------------
// Credential file loading — same candidates and same never-overwrite rule as
// jira-sync.js, gh-stage.js and tracker-comment.js, so a consumer has one
// credential location.
// ---------------------------------------------------------------------------
const CREDENTIAL_FILES = [".secrets/tooling.env", ".env"];

function loadDotEnv(repoRoot) {
  try {
    const root = repoRoot || repoRootOf();
    if (!root) return;
    for (const rel of CREDENTIAL_FILES) {
      const envPath = path.join(root, rel);
      if (!fs.existsSync(envPath)) continue;
      for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 1) continue;
        const key = t.slice(0, eq).trim();
        const val = t
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (!(key in process.env)) process.env[key] = val;
      }
    }
  } catch (_) {}
}

function repoRootOf(repoRoot) {
  if (repoRoot) return repoRoot;
  try {
    return execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
  } catch (_) {
    return "";
  }
}

// ---------------------------------------------------------------------------
// gh helpers
// ---------------------------------------------------------------------------

function ghAvailable(execImpl, cwd = undefined) {
  try {
    execImpl("gh", ["auth", "status"], { ...GIT_EXEC_OPTS, cwd });
    return true;
  } catch (_) {
    return false;
  }
}

function gh(execImpl, argv, cwd = undefined) {
  // `cwd` on EVERY call, not just the resolver. Fixing ghRepoSlug alone left
  // the hazard one step down: `gh issue close 42` with no --repo and no cwd
  // resolves from wherever the PROCESS is, so with an unresolvable slug the
  // issue was closed in an unrelated repository — silently, and reported as
  // `performed`. That is precisely the failure the two-tier slug design exists
  // to prevent, arriving after the slug logic had already run.
  return String(execImpl("gh", argv, { ...GIT_EXEC_OPTS, cwd }) || "").trim();
}

/**
 * owner/name for the current repository, from a purely LOCAL source.
 *
 * Reads `git remote get-url origin` (and GH_REPO, which `gh` itself honours).
 * No network, so this is safe to call on the gated path — which it must be:
 * without a slug the deferred record's `command.argv` used to carry the literal
 * string `/repos/$OWNER/$REPO/milestones`, and handover-render.js POSIX-quotes
 * every argv element, so the generated handover script sent `$OWNER/$REPO`
 * verbatim to `gh api` and 404'd. The `sh` renderer exists to be RUNNABLE; an
 * unexpanded variable in it is the one thing that makes it not.
 *
 * An explicit --repo always wins.
 */
/**
 * Is this a slug we are willing to interpolate into a command?
 *
 * GitHub owner and repository names are drawn from [A-Za-z0-9._-]; anything else
 * did not come from GitHub, and the one place a slug reaches a shell STRING (the
 * recorded sub-issue-link `bash -c`) is exactly where a metacharacter would
 * matter.
 */
function isSlugShaped(slug) {
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(String(slug || ""));
}

function repoSlug(explicit, env = process.env, cwd = undefined) {
  if (explicit) return explicit;
  // gh documents GH_REPO as `[HOST/]OWNER/REPO`; a three-segment value would
  // break every `/repos/${slug}/…` path built from it, so take the last two.
  if (env.GH_REPO) {
    const parts = String(env.GH_REPO).split("/").filter(Boolean);
    if (parts.length === 2)
      return isSlugShaped(parts.join("/")) ? parts.join("/") : "";
    if (parts.length === 3) {
      // `[HOST/]OWNER/REPO`. Discarding the host unconditionally was the
      // previous behaviour and it let `GH_REPO=ghe.corp/acme/repo` with GH_HOST
      // unset emit `--repo acme/repo`, which gh then resolves against
      // github.com — the same wrong-target failure the host allowlist below
      // exists to stop, entering through a different door.
      const ghHost = (env.GH_HOST || "").trim();
      if (parts[0] === "github.com" || (ghHost && parts[0] === ghHost)) {
        const tail = parts.slice(-2).join("/");
        return isSlugShaped(tail) ? tail : "";
      }
      return "";
    }
    return "";
  }
  try {
    // `cwd` matters: without it git runs wherever the PROCESS happens to be,
    // which for an agent invoking this from a parent directory resolves some
    // OTHER repository's remote — a wrong slug is worse than no slug, because
    // it records a mutation against a repo nobody meant to touch.
    const url = String(
      execSync("git remote get-url origin", { ...GIT_EXEC_OPTS, cwd }) || "",
    ).trim();
    // Take the LAST TWO path segments, host-agnostically:
    //   git@github.com:owner/name.git
    //   https://github.com/owner/name(.git)(/)
    //   ssh://git@github.com/owner/name.git
    //   git@ghe.corp.example.com:owner/name.git   ← GitHub Enterprise
    //
    // Anchoring on the literal `github.com` looked safer and was not: it
    // silently returned "" for every Enterprise host, and for a URL with a
    // trailing slash. This CLI is GitHub-only by contract — it rejects a Jira
    // key in --issue — so `origin` is a GitHub remote by assumption, and the
    // host adds nothing to the match.
    // The HOST must look like GitHub. Matching any host was the previous
    // attempt and it was wrong in the way this function's own comment warns
    // about: `git@bitbucket.org:acme/repo.git` and `/srv/git/acme/repo.git`
    // both yielded `acme/repo`, which would then be handed to `gh --repo` and
    // aimed at an unrelated github.com repository. A plausible-but-wrong slug
    // is worse than none, so an unrecognised host returns "".
    const host = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[:/]/.exec(url);
    const ghHost = (env.GH_HOST || "").trim();
    // EXACT match only — `github.com`, or the host GH_HOST names.
    //
    // A `/(^|\.)github\./` heuristic was the previous attempt and it accepted
    // `github.evil.com` as readily as `github.mycorp.com`: the two are
    // indistinguishable by shape, and the slug it yields is handed to
    // `gh --repo` and aimed at github.com. GitHub Enterprise already requires
    // GH_HOST for `gh` itself to work, so naming it costs a GHE user nothing
    // and removes the guess entirely.
    const hostOk =
      host && (host[1] === "github.com" || (ghHost && host[1] === ghHost));
    if (!hostOk) return "";

    const m = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
    if (!m) return "";
    // Constrain the SHAPE, not just the host. The slug is interpolated into the
    // recorded sub-issue-link `bash -c` string, and handover-render.js quotes
    // that string as ONE argv element — quoting protects the rendering, not the
    // script inside it. So a hostile `origin` such as
    // `https://github.com/o/n$(cmd)` would execute if an operator ran the
    // generated handover script. GitHub owner and repo names are
    // [A-Za-z0-9._-] anyway, so this rejects nothing real.
    return isSlugShaped(`${m[1]}/${m[2]}`) ? `${m[1]}/${m[2]}` : "";
  } catch (_) {
    return "";
  }
}

/**
 * owner/name as `gh` itself resolves it. NETWORK — perform path only.
 *
 * This is what honours `gh repo set-default` and a fork's upstream, which the
 * git-remote read cannot see.
 */
function ghRepoSlug(execImpl, cwd = undefined) {
  try {
    // `cwd` for the same reason repoSlug passes it: without it gh resolves
    // wherever the PROCESS happens to be, which for an agent invoking this from
    // a parent directory is some OTHER repository. This tier takes precedence
    // over the local read, so leaving it unanchored reintroduced the exact
    // hazard the local read documents and guards against.
    return String(
      execImpl(
        "gh",
        ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        { ...GIT_EXEC_OPTS, cwd },
      ) || "",
    ).trim();
  } catch (_) {
    return "";
  }
}

/** The trailing number of an issue URL, or "" — `gh issue create` prints a URL. */
function numberFromUrl(url) {
  const m = /(\d+)\s*$/.exec(String(url || "").trim());
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  // Every value-taking flag fails CLOSED, and rejects a flag-shaped value —
  // transcribed from tracker-comment.js, where a fail-OPEN `--stage` posted
  // unmarked comments on every resume. `--kind --json` must exit 2, not select
  // a kind named "--json" and then fail deeper in with a worse message.
  const value = (i, name) => {
    const v = args[i];
    if (v === undefined || v.startsWith("-")) {
      throw new Error(`${name} requires a value`);
    }
    return v;
  };
  const opts = {
    kind: "",
    issue: "",
    parent: "",
    title: "",
    bodyFile: "",
    labels: [],
    addLabels: [],
    removeLabels: [],
    milestone: "",
    reason: "",
    state: "",
    repo: "",
    json: false,
    quiet: false,
    dryRun: false,
    strict: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--kind":
      case "-k":
        opts.kind = value(++i, "--kind");
        break;
      case "--issue":
      case "-i":
        opts.issue = value(++i, "--issue");
        break;
      case "--parent":
        opts.parent = value(++i, "--parent");
        break;
      case "--title":
      case "-t":
        opts.title = value(++i, "--title");
        break;
      case "--body-file":
      case "-f":
        opts.bodyFile = value(++i, "--body-file");
        break;
      case "--label":
        opts.labels.push(value(++i, "--label"));
        break;
      case "--add-label":
        opts.addLabels.push(value(++i, "--add-label"));
        break;
      case "--remove-label":
        opts.removeLabels.push(value(++i, "--remove-label"));
        break;
      case "--milestone":
        opts.milestone = value(++i, "--milestone");
        break;
      case "--reason":
        opts.reason = value(++i, "--reason");
        break;
      case "--state":
        opts.state = value(++i, "--state");
        break;
      case "--repo":
        opts.repo = value(++i, "--repo");
        break;
      case "--json":
        opts.json = true;
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--strict":
        opts.strict = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        if (args[i].startsWith("-")) {
          throw new Error(`Unknown option: ${args[i]}`);
        }
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Deferred-record shapes, one per kind
//
// Each returns the `manual` / `command` / `intent` / `target` a record needs.
// Kept beside each other rather than inline in run(), so that the six shapes can
// be read as a set — the sub-issue link in particular has to be recognisable as
// ONE record covering a fetch-then-mutate PAIR.
// ---------------------------------------------------------------------------

/**
 * The kinds whose recorded `command` embeds the repo slug in a REST path, and
 * which therefore cannot produce a runnable command without one.
 *
 * The issue verbs are absent deliberately: `gh issue create|edit|close|reopen`
 * with no `--repo` resolves the repository from the working directory, and the
 * handover script is generated into that directory — so their recorded commands
 * run correctly with no slug at all.
 */
const SLUG_EMBEDDING_KINDS = Object.freeze(["milestone", "sub-issue-link"]);

function recordShape({ kind, args, body, slug }) {
  const repoUi = slug || "the repository";
  const issueUrl = slug
    ? `https://github.com/${slug}/issues/${args.issue}`
    : `issue #${args.issue}`;

  switch (kind) {
    case "create":
      return {
        intent: `Create GitHub issue "${args.title}" in ${repoUi}`,
        target: {
          repo: slug,
          url: slug ? `https://github.com/${slug}/issues` : repoUi,
          ui_url: slug ? `https://github.com/${slug}/issues/new` : repoUi,
        },
        desired: {
          title: args.title,
          labels: args.labels,
          milestone: args.milestone || null,
        },
        manual: {
          deepLink: slug ? `https://github.com/${slug}/issues/new` : repoUi,
          ui: "Open the repository → Issues → New issue → paste title and body → Submit. Then write the new issue number into the document's frontmatter and re-run the skill.",
          fields: [
            { name: "Title", value: args.title },
            { name: "Body", value: body || "" },
            { name: "Labels", value: args.labels.join(", ") },
            { name: "Milestone", value: args.milestone || "" },
          ],
        },
        command: {
          argv: ghCreateArgv(args, slug),
          stdin: body || null,
        },
      };

    case "edit":
      return {
        intent: `Edit GitHub issue #${args.issue}`,
        target: { issue: args.issue, url: issueUrl, ui_url: issueUrl },
        desired: {
          title: args.title || null,
          milestone: args.milestone || null,
          addLabels: args.addLabels,
          removeLabels: args.removeLabels.filter(Boolean),
        },
        manual: {
          deepLink: issueUrl,
          ui: "Open the issue → Edit → apply the fields below → Save",
          fields: [
            { name: "Title", value: args.title || "" },
            { name: "Body", value: body || "" },
            { name: "Milestone", value: args.milestone || "" },
            { name: "Add labels", value: args.addLabels.join(", ") },
            {
              name: "Remove labels",
              value: args.removeLabels.filter(Boolean).join(", "),
            },
          ],
        },
        command: { argv: ghEditArgv(args, slug), stdin: body || null },
      };

    case "close":
      return {
        intent: `Close GitHub issue #${args.issue}`,
        target: { issue: args.issue, url: issueUrl, ui_url: issueUrl },
        desired: { state: "closed", reason: args.reason || "completed" },
        manual: {
          deepLink: issueUrl,
          ui: "Open the issue → Close issue",
          fields: [{ name: "Reason", value: args.reason || "completed" }],
        },
        command: { argv: ghCloseArgv(args, slug), stdin: null },
      };

    case "reopen":
      return {
        intent: `Reopen GitHub issue #${args.issue}`,
        target: { issue: args.issue, url: issueUrl, ui_url: issueUrl },
        desired: { state: "open" },
        manual: {
          deepLink: issueUrl,
          ui: "Open the issue → Reopen issue",
          fields: [],
        },
        command: { argv: ghReopenArgv(args, slug), stdin: null },
      };

    case "milestone":
      return {
        intent: `Create GitHub milestone "${args.title}" in ${repoUi}`,
        target: {
          repo: slug,
          url: slug
            ? `https://api.github.com/repos/${slug}/milestones`
            : repoUi,
          ui_url: slug ? `https://github.com/${slug}/milestones/new` : repoUi,
        },
        desired: { title: args.title, state: args.state || "open" },
        manual: {
          deepLink: slug ? `https://github.com/${slug}/milestones/new` : repoUi,
          ui: "Open the repository → Issues → Milestones → New milestone → Create. Then write the milestone number into the document and re-run the skill.",
          fields: [
            { name: "Title", value: args.title },
            { name: "State", value: args.state || "open" },
          ],
        },
        command: { argv: ghMilestoneArgv(args, slug), stdin: null },
      };

    case "sub-issue-link": {
      const parentUrl = slug
        ? `https://github.com/${slug}/issues/${args.parent}`
        : `issue #${args.parent}`;
      return {
        intent: `Attach issue #${args.issue} as a sub-issue of #${args.parent}`,
        target: { issue: args.parent, url: parentUrl, ui_url: parentUrl },
        desired: { parent: args.parent, child: args.issue },
        manual: {
          deepLink: parentUrl,
          ui: "Open the PARENT issue → Sub-issues → Add existing issue → enter the child number → Add",
          fields: [
            { name: "Parent", value: `#${args.parent}` },
            { name: "Child", value: `#${args.issue}` },
          ],
        },
        // ONE record for a fetch-then-mutate PAIR, deliberately.
        //
        // The sub-issues API needs the child's internal database id, which a
        // preceding `gh api /repos/{o}/{r}/issues/{n}` must fetch. Emitting two
        // records would produce two checklist items NEITHER of which a human can
        // perform alone: the fetch alone changes nothing, and the mutate alone
        // has no id to send. So the argv is the shell pipeline that does both,
        // and the `manual` path routes around the id entirely — the GitHub UI
        // takes the visible issue number.
        command: {
          argv: [
            "bash",
            "-c",
            `SUB_ID=$(gh api /repos/${slug}/issues/${args.issue} --jq .id) && ` +
              `gh api --method POST -H "Accept: application/vnd.github+json" ` +
              `/repos/${slug}/issues/${args.parent}/sub_issues ` +
              `-F sub_issue_id="$SUB_ID"`,
          ],
          stdin: null,
        },
      };
    }

    default:
      // Unreachable: run() validates --kind against KINDS before reaching here.
      throw new Error(`tracker-issue: no record shape for kind "${kind}"`);
  }
}

/**
 * recordShape, with the no-runnable-command rule applied AT CONSTRUCTION.
 *
 * The rule used to live in run(), one level above where the broken value was
 * built — so `recordShape` itself still returned `/repos//milestones` for a
 * slugless milestone, and the invariant "no record carries a command that
 * cannot run" held only because a caller remembered to null it afterwards.
 * Enforcing it here means the shape is never constructed wrong in the first
 * place, and a future caller cannot forget.
 */
function shapeFor({ kind, args, body, slug }) {
  const shape = recordShape({ kind, args, body, slug });
  if (!slug && SLUG_EMBEDDING_KINDS.includes(kind)) {
    shape.command = null;
  }
  return shape;
}

// ── argv builders, shared by the perform path and the recorded command ───────
//
// One builder per kind, used BOTH to run the mutation under `full` and to fill
// the record's `command.argv` under a deferring mode. Sharing them is what makes
// the recorded command provably the command that would have run — two separate
// spellings drift, and the drift is invisible until an operator runs the script
// and gets a different result from the pipeline.

function repoFlag(slug) {
  return slug ? ["--repo", slug] : [];
}

function ghCreateArgv(args, slug) {
  const a = ["issue", "create", ...repoFlag(slug), "--title", args.title];
  // `--body-file -` reads stdin. The body NEVER becomes an argv element: it
  // carries backticks and newlines, and the record's fingerprint hashes
  // command.stdin, so two different bodies stay two records.
  if (args.bodyFile) a.push("--body-file", "-");
  for (const l of args.labels) a.push("--label", l);
  if (args.milestone) a.push("--milestone", args.milestone);
  return ["gh", ...a];
}

function ghEditArgv(args, slug) {
  const a = ["issue", "edit", args.issue, ...repoFlag(slug)];
  if (args.title) a.push("--title", args.title);
  if (args.bodyFile) a.push("--body-file", "-");
  if (args.milestone) a.push("--milestone", args.milestone);
  for (const l of args.addLabels) a.push("--add-label", l);
  // An empty element is dropped rather than passed through: the sync skills
  // spell this as `--remove-label "$OLD_PRIORITY_LABEL_IF_DIFFERENT"`, which
  // expands to the empty string when the label did NOT change. `gh` reads a
  // bare `--remove-label ""` as a request to remove a label named "", fails the
  // whole edit, and the title/body/milestone changes in the same call are lost
  // with it.
  for (const l of args.removeLabels) if (l) a.push("--remove-label", l);
  return ["gh", ...a];
}

function ghCloseArgv(args, slug) {
  const a = ["issue", "close", args.issue, ...repoFlag(slug)];
  if (args.reason) a.push("--reason", args.reason);
  return ["gh", ...a];
}

function ghReopenArgv(args, slug) {
  return ["gh", "issue", "reopen", args.issue, ...repoFlag(slug)];
}

function ghMilestoneArgv(args, slug) {
  return [
    "gh",
    "api",
    "--method",
    "POST",
    `/repos/${slug}/milestones`,
    "-f",
    `title=${args.title}`,
    "-f",
    `state=${args.state || "open"}`,
  ];
}

// ---------------------------------------------------------------------------
// The perform path — only reached under `full`
// ---------------------------------------------------------------------------

function perform({
  kind,
  args,
  body,
  slug,
  execImpl,
  output,
  emit,
  skipCode,
  cwd,
}) {
  if (!ghAvailable(execImpl, cwd)) {
    output.warn("⚠️  gh is not authenticated — not performing the mutation.");
    return emit({ performed: false, reason: "no-credentials" }, 0);
  }

  const withStdin = (argv) =>
    String(
      execImpl(argv[0], argv.slice(1), {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        input: body || "",
        cwd,
      }) || "",
    ).trim();

  const plain = (argv) => gh(execImpl, argv.slice(1), cwd);

  switch (kind) {
    case "create": {
      const out = args.bodyFile
        ? withStdin(ghCreateArgv(args, slug))
        : plain(ghCreateArgv(args, slug));
      // `gh issue create` prints the issue URL. The caller wants the NUMBER, so
      // the number is what goes to stdout — every existing call site follows the
      // create with `grep -oE '[0-9]+$'`, and doing it here deletes that step
      // from six prose blocks rather than reproducing it in each.
      const num = numberFromUrl(out);
      if (!num) {
        output.warn(`⚠️  Could not read an issue number from: ${out}`);
        return emit(
          { performed: true, reason: "unverifiable", url: out },
          skipCode,
        );
      }
      output.value(num);
      return emit(
        { performed: true, reason: "performed", issue: num, url: out },
        0,
      );
    }

    case "edit": {
      if (args.bodyFile) withStdin(ghEditArgv(args, slug));
      else plain(ghEditArgv(args, slug));
      return emit(
        { performed: true, reason: "performed", issue: args.issue },
        0,
      );
    }

    case "close":
      plain(ghCloseArgv(args, slug));
      return emit(
        { performed: true, reason: "performed", issue: args.issue },
        0,
      );

    case "reopen":
      plain(ghReopenArgv(args, slug));
      return emit(
        { performed: true, reason: "performed", issue: args.issue },
        0,
      );

    case "milestone": {
      // Without a slug the lookup URL becomes `/repos//milestones`, the catch
      // swallows the error, and the code proceeds to a blind POST against the
      // same broken path. Refuse explicitly instead.
      if (!slug) {
        output.warn(
          "⚠️  Could not resolve owner/repo — not creating the milestone. " +
            "Pass --repo <owner/name>.",
        );
        return emit({ performed: false, reason: "unverifiable" }, skipCode);
      }
      // Idempotent by search-then-create: a milestone title that already exists
      // returns 422 from the API, and four call sites resolve-or-create rather
      // than create blindly. Doing the lookup here means those sites lose their
      // own copy of it.
      // Fetch and compare IN JAVASCRIPT. Interpolating the title into a jq
      // program made a title containing a double quote — `Epic 3 — the "new"
      // flow` — a jq syntax error, which surfaced as "no match" and led
      // straight to a blind POST and a 422.
      //
      // `--paginate` and `state=all` matter for the same reason: the endpoint
      // defaults to open-only, 30 per page, so a closed milestone or a busy
      // repo silently missed an existing title and tried to re-create it.
      let existing = "";
      try {
        // A CONSTANT jq filter — no interpolation, so no title can alter the
        // program — emitting NDJSON: one compact object per line. That makes
        // the response parseable line by line, with no need to split a
        // concatenated stream.
        //
        // Splitting `--paginate`'s concatenated arrays on /(?<=\])\s*(?=\[)/
        // was the first attempt and is WRONG: a milestone titled
        // `Epic ] [ bracket` splits inside the string, both halves fail to
        // parse, and the milestone is silently dropped — re-creating the exact
        // class of defect (a title's own characters breaking the lookup) that
        // moving off jq-interpolation was meant to remove.
        const raw = gh(
          execImpl,
          [
            "api",
            "--paginate",
            `/repos/${slug}/milestones?state=all&per_page=100`,
            "--jq",
            ".[] | {number, title}",
          ],
          cwd,
        );
        let hit = null;
        for (const line of String(raw).split("\n")) {
          const t = line.trim();
          if (!t) continue;
          try {
            const m = JSON.parse(t);
            if (m && m.title === args.title) {
              hit = m;
              break;
            }
          } catch (_) {
            /* a malformed line is skipped, never guessed at */
          }
        }
        existing = hit ? String(hit.number) : "";
      } catch (_) {
        existing = "";
      }
      if (existing) {
        output.value(existing);
        return emit(
          { performed: false, reason: "already", milestone: existing },
          0,
        );
      }
      const created = plain(ghMilestoneArgv(args, slug));
      let num = "";
      try {
        num = String(JSON.parse(created).number || "");
      } catch (_) {
        num = "";
      }
      if (!num) {
        output.warn("⚠️  Milestone created but its number could not be read.");
        return emit({ performed: true, reason: "unverifiable" }, skipCode);
      }
      output.value(num);
      return emit({ performed: true, reason: "performed", milestone: num }, 0);
    }

    case "sub-issue-link": {
      // Same guard as the milestone arm. Without it the fetch becomes
      // `/repos//issues/N`, the catch swallows it, and the operator is told
      // "could not resolve the internal id of issue #N" — safe, because it
      // still refuses, but pointing at the child issue instead of the real
      // cause. A refusal that names the wrong thing costs more time than one
      // that names the right thing.
      if (!slug) {
        output.warn(
          "⚠️  Could not resolve owner/repo — not linking the sub-issue. " +
            "Pass --repo <owner/name>.",
        );
        return emit({ performed: false, reason: "unverifiable" }, skipCode);
      }
      let subId = "";
      try {
        subId = gh(
          execImpl,
          ["api", `/repos/${slug}/issues/${args.issue}`, "--jq", ".id"],
          cwd,
        );
      } catch (_) {
        subId = "";
      }
      if (!subId) {
        output.warn(
          `⚠️  Could not resolve the internal id of issue #${args.issue} — not linking.`,
        );
        return emit({ performed: false, reason: "unverifiable" }, skipCode);
      }
      gh(
        execImpl,
        [
          "api",
          "--method",
          "POST",
          "-H",
          "Accept: application/vnd.github+json",
          `/repos/${slug}/issues/${args.parent}/sub_issues`,
          "-F",
          `sub_issue_id=${subId}`,
        ],
        cwd,
      );
      return emit(
        {
          performed: true,
          reason: "performed",
          issue: args.issue,
          parent: args.parent,
        },
        0,
      );
    }

    default:
      throw new Error(`tracker-issue: no perform arm for kind "${kind}"`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function run({
  argv = process.argv,
  execImpl = execFileSync,
  repoRoot = "",
  env = process.env,
} = {}) {
  const root = repoRootOf(repoRoot);

  // Snapshot the access keys BEFORE loadDotEnv, and all three of them. The
  // order is load-bearing and the reasoning is gh-stage.js's, transcribed: a
  // .env line must not be able to loosen the mode, and capturing the mode but
  // not SKILLS_CONFIG_FILE would leave the config path redirectable — the door
  // the snapshot exists to shut.
  const accessEnv = {
    ACCESS_TRACKER: env.ACCESS_TRACKER,
    AGENT_SKILLS_ACCESS_TRACKER: env.AGENT_SKILLS_ACCESS_TRACKER,
    SKILLS_CONFIG_FILE: env.SKILLS_CONFIG_FILE,
  };

  loadDotEnv(root);

  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    console.error(USAGE);
    return { exitCode: 2 };
  }

  const output = makeOutput({ json: args.json, quiet: args.quiet });

  if (args.help) {
    output.log(USAGE);
    return { exitCode: 0 };
  }

  const emit = (payload, exitCode) => {
    if (args.json) output.emit({ ...payload, kind: args.kind, exitCode });
    return { exitCode, ...payload };
  };

  // ── USAGE VALIDATION ──────────────────────────────────────────────────────
  // Everything here is local: no network, no journal. All of it exits 2.

  if (!args.kind) {
    output.err(`Error: --kind is required (one of: ${KIND_NAMES.join(", ")})`);
    output.err(USAGE);
    return { exitCode: 2 };
  }

  const spec = KINDS[args.kind];
  if (!spec) {
    output.err(
      `Error: unknown --kind "${args.kind}". Known: ${KIND_NAMES.join(", ")}`,
    );
    return { exitCode: 2 };
  }

  for (const req of spec.required) {
    if (!args[req]) {
      output.err(`Error: --kind ${args.kind} requires --${req}`);
      return { exitCode: 2 };
    }
  }

  // Numeric flags are validated as numbers. `gh issue close PROJ-1` would
  // otherwise reach the network and fail there with a worse message, and a
  // Jira key arriving here at all means a caller branched on the wrong tracker.
  // `--repo` is the ONLY slug source with no shape check, and it outranks every
  // validated one — so `--repo ghe.corp/acme/repo` (a form gh's own --repo
  // accepts, and one the GH_REPO branch explicitly recognises) produced
  // `/repos/ghe.corp/acme/repo/milestones`, and `--repo acme` produced
  // `/repos/acme/milestones`. Under a deferring mode the same malformed value
  // went into the record's command.argv — the unrunnable handover script the
  // slug-emptiness check exists to prevent, arriving through a value that is
  // non-empty but wrong.
  if (args.repo) {
    const parts = args.repo.split("/").filter(Boolean);
    if (parts.length === 3) {
      // `HOST/OWNER/REPO` — accept only a host we can vouch for, then strip it,
      // exactly as the GH_REPO branch does.
      const ghHost = (env.GH_HOST || "").trim();
      if (parts[0] === "github.com" || (ghHost && parts[0] === ghHost)) {
        args.repo = parts.slice(-2).join("/");
      } else {
        output.err(
          `Error: --repo "${args.repo}" names host "${parts[0]}", which is ` +
            `neither github.com nor $GH_HOST. Use OWNER/REPO, or set GH_HOST.`,
        );
        return { exitCode: 2 };
      }
    } else if (parts.length !== 2) {
      output.err(
        `Error: --repo must be OWNER/REPO (or HOST/OWNER/REPO) — got "${args.repo}"`,
      );
      return { exitCode: 2 };
    }
    if (!isSlugShaped(args.repo)) {
      output.err(
        `Error: --repo "${args.repo}" contains characters GitHub owner/repo names ` +
          `do not use. Allowed: letters, digits, dot, underscore, hyphen.`,
      );
      return { exitCode: 2 };
    }
  }

  // `gh issue close --reason` accepts only these three spellings. The sync
  // skills pass `not_planned` (the REST API's spelling), which gh rejects — so
  // a cancelled work item never closed and the run reported a warning only.
  // Normalise the underscore form rather than making six call sites remember.
  if (args.reason) {
    const normalised = args.reason.replace(/_/g, " ").toLowerCase();
    // `duplicate` is deliberately NOT accepted: `gh issue close --reason
    // duplicate` additionally requires `--duplicate-of <issue>`, which this CLI
    // has no flag for, so accepting it would produce a call gh rejects at run
    // time — a usage error discovered on the network rather than locally.
    const CLOSE_REASONS = ["completed", "not planned"];
    if (!CLOSE_REASONS.includes(normalised)) {
      output.err(
        `Error: --reason must be one of: ${CLOSE_REASONS.join(", ")} ` +
          `(got "${args.reason}")`,
      );
      return { exitCode: 2 };
    }
    args.reason = normalised;
  }

  for (const numeric of ["issue", "parent"]) {
    if (args[numeric] && !/^\d+$/.test(args[numeric])) {
      output.err(
        `Error: --${numeric} must be a number (got "${args[numeric]}"). ` +
          `This CLI is GitHub-only; a Jira key here means the caller did not branch on TRACKER.`,
      );
      return { exitCode: 2 };
    }
  }

  let body = "";
  if (args.bodyFile) {
    try {
      body = fs.readFileSync(args.bodyFile, "utf-8");
    } catch (e) {
      output.err(`Error: --body-file unreadable: ${e.message}`);
      return { exitCode: 2 };
    }
    if (!body.trim()) {
      output.err(`Error: --body-file is empty: ${args.bodyFile}`);
      return { exitCode: 2 };
    }
  }

  const skipCode = args.strict ? 1 : 0;

  // ── ACCESS GATE ───────────────────────────────────────────────────────────
  //
  // Placement is the whole point, exactly as in its three siblings. Everything
  // above is local — arg parsing and one file read. Everything below reaches
  // out. The gate sits between them, so a gated run demonstrably attempts no
  // network call. `--dry-run` is exempt because it performs no mutation.
  //
  // The comparison is `!== "full"`, never truthiness: an unset variable must
  // read as `full`, or this CLI silently stops mutating everywhere.
  let access;
  try {
    access = dm.resolveAccessTracker(accessEnv, { cwd: root || process.cwd() });
  } catch (e) {
    output.err(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  // TWO TIERS, and the split matters.
  //
  // On the PERFORM path (`full`), ask `gh` — it honours its own resolution:
  // `gh repo set-default`, a fork's upstream, GH_HOST. Reading the git remote
  // alone was a regression: in a fork clone every mutation would be aimed at
  // the FORK rather than the base repo, silently creating issues in the wrong
  // repository. A network call is already permitted here, so there is nothing
  // to save by guessing.
  //
  // On the GATED path, use the local git remote only — no network, so the
  // gate's promise holds — and accept it only when the host looks like GitHub.
  // When it cannot be resolved the record simply carries no `command` (see
  // recordShape), rather than a `$OWNER/$REPO` placeholder that renders into a
  // script which cannot run.
  // Gate on ACCESS ALONE, never on --dry-run.
  //
  // `access === "full" || args.dryRun` was the previous spelling and it put a
  // `gh repo view` back on the gated path: `--dry-run` under a restricted mode
  // made a network call, contradicting the header's promise in exactly the way
  // cycle 1 fixed and cycle 2 reintroduced from the other side.
  const local = () => repoSlug(args.repo, env, root || process.cwd());
  const slug =
    access === "full" && !args.dryRun
      ? // NO dry run asks gh, in any mode. A dry run reads `slug` nowhere — it
        // returns before recordShape and before perform — so the round trip
        // would be pure waste even under `full`.
        args.repo || ghRepoSlug(execImpl, root || process.cwd()) || local()
      : local();

  if (access !== "full" && !args.dryRun) {
    // shapeFor applies the rule: a record whose `command` cannot run carries no
    // command at all. The `sh` renderer would otherwise emit a script that
    // 404s, and an operator who runs it and sees no error assumes the action
    // was performed. `manual` always has a usable path (the GitHub UI takes the
    // visible numbers), so the record degrades rather than breaks.
    const shape = shapeFor({ kind: args.kind, args, body, slug });

    if (!shape.command && SLUG_EMBEDDING_KINDS.includes(args.kind)) {
      output.warn(
        `⚠️  Could not resolve owner/repo — recording ${spec.summary} without a ` +
          `runnable command. Perform it from the checklist's manual path, or ` +
          `re-run with --repo <owner/name>.`,
      );
    }

    try {
      const rec = dm.defer(
        {
          kind: spec.recordKind,
          system: "github",
          access,
          produces: spec.produces,
          blocking: spec.blocking,
          intent: shape.intent,
          target: shape.target,
          desired: shape.desired,
          manual: shape.manual,
          command: shape.command,
          skill: "tracker-issue",
        },
        { cwd: root || process.cwd() },
      );
      output.info(
        `⏸️  access.tracker=${access} — not performing ${spec.summary}; recorded as ${rec.id}.`,
      );
      if (spec.blocking) {
        output.info(
          `   ↳ BLOCKING: this yields ${spec.produces}, which nothing else can supply. ` +
            `Perform it, write the value into the document, then re-run.`,
        );
      }
      // NOTHING to stdout. A caller's `$( )` captures empty — see the header.
      return emit(
        {
          performed: false,
          reason: "deferred",
          access,
          record: rec.id,
          blocking: spec.blocking,
          produces: spec.produces,
        },
        0,
      );
    } catch (e) {
      // A journal we cannot write is a WARNING, never a licence to perform the
      // mutation anyway. Same rule as its three siblings.
      output.warn(`⚠️  Could not record the deferred mutation: ${e.message}`);
      return emit({ performed: false, reason: "deferred", access }, 0);
    }
  }

  if (args.dryRun) {
    output.info(`🔎 dry-run — would ${spec.summary}.`);
    return emit({ performed: false, reason: "dry-run" }, 0);
  }

  try {
    return perform({
      kind: args.kind,
      args,
      body,
      slug,
      execImpl,
      output,
      emit,
      skipCode,
      cwd: root || process.cwd(),
    });
  } catch (e) {
    output.warn(`⚠️  ${spec.summary} failed: ${e.message}`);
    return emit({ performed: false, reason: "failed" }, skipCode);
  }
}

module.exports = {
  run,
  parseArgs,
  makeOutput,
  recordShape,
  shapeFor,
  SLUG_EMBEDDING_KINDS,
  numberFromUrl,
  ghCreateArgv,
  ghEditArgv,
  ghCloseArgv,
  ghReopenArgv,
  ghMilestoneArgv,
  KINDS,
  KIND_NAMES,
  isSlugShaped,
  USAGE,
};

if (require.main === module) {
  let r;
  try {
    r = run();
  } catch (e) {
    // An unhandled throw exits 0, like every sibling: these calls sit in
    // `|| echo "⚠️ …"` subshells whose callers are documented non-blocking, and
    // a crash must not convert a best-effort tracker mutation into a pipeline
    // failure.
    console.error(`⚠️  tracker-issue: ${e && e.message ? e.message : e}`);
    process.exit(0);
  }
  process.exit(r && r.exitCode ? r.exitCode : 0);
}
