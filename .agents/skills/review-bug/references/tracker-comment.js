#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/tracker-comment.js. Regenerate via `npm run bundle`.
/**
 * tracker-comment — post one comment to a tracker ISSUE, on either tracker.
 *
 * The third peer of jira-stage.js and gh-stage.js, and the one that had no code
 * to be a peer of. Before this file every Jira comment in the repository was an
 * `addCommentToJiraIssue` MCP call an agent made by following prose, and every
 * GitHub issue comment was a bare `gh issue comment` in prose. Neither could be
 * intercepted, because interception needs a chokepoint and prose has none.
 *
 * Three things follow from being a peer, and they are not stylistic:
 *
 *   1. The same exit codes, so the `|| echo "⚠️ …"` subshells in the step files
 *      keep working unchanged.
 *   2. The same `--json` `{ reason }` contract, so a step doc author who has
 *      read one of these CLIs has read all three.
 *   3. The same access gate in the same place, so a non-`full` run demonstrably
 *      makes no network call.
 *
 * Usage:
 *   tracker-comment.js --issue <key|N> --body-file <path>
 *                      (--stage <name> | --summary-file <path>) [--slot k=v ...]
 *                      [--json] [--quiet] [--dry-run] [--strict]
 *                      [--tracker jira|github]
 *
 * Exit codes (transcribed from jira-stage.js and gh-stage.js so this is a
 * drop-in for the same subshell idiom):
 *   0  posted, already, unverifiable, deferred, no-credentials, dry-run —
 *      and any unhandled throw
 *   1  a skip, but only under --strict
 *   2  usage error (missing --issue, missing/empty --body-file, unknown flag,
 *      no plain-language lead resolvable, missing/empty --summary-file)
 *
 * `reason` vocabulary:
 *   posted          the comment was created
 *   already         exactly one marker match — it is already there
 *   unverifiable    2+ marker matches, or the comment list could not be read;
 *                   NOT posted, and deliberately not resolved either
 *   deferred        access.tracker is not `full`; recorded, not performed
 *   no-credentials  no usable auth; the caller may fall back to MCP
 *   dry-run         --dry-run; nothing read, nothing written
 *
 * Deliberately NOT in the vocabulary: `stage-disabled`. The stage CLIs read
 * `pipeline:` from tracker-workflow.yaml to find a column, and an omitted moment
 * there means "do not move the card". It does not mean "do not say anything" —
 * a project whose board has no review column still wants the PR-opened comment.
 * Coupling the two would silence comments as a side effect of board config, so
 * `--stage` here is the comment's IDENTITY — it builds the marker and selects
 * the plain-language lead, and is required unless --summary-file supplies one.
 *
 * On requiring jira-sync.js: gh-stage.js states the rule this file has to bend
 * — that module depends on tracker-workflow.js and nothing else in shared/,
 * because a GitHub-only consumer should not bundle 4,800 lines of Jira. This CLI
 * covers both trackers, so it cannot honour that rule literally. It honours the
 * intent instead: the require is LAZY, inside the Jira branch, so a GitHub run
 * never loads or parses it. The bundler still copies the file (it scans source
 * text, not runtime paths), which bounds the runtime cost rather than the bundle
 * size — the accepted trade recorded in task 55's Decisions table. This file
 * therefore takes NO other shared/ dependency beyond defer-mutation.js.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const dm = require("./defer-mutation.js");
const { renderLead, LEAD_STAGES } = require("./stakeholder-summary.js");

const GIT_EXEC_OPTS = {
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "ignore"],
};

// The marker prefix is duplicated from jira-sync.js rather than imported: the
// GitHub branch needs it and must not pull that module in. The parity test
// asserts the two literals agree, which is the check that keeps them honest.
const COMMENT_MARKER_PREFIX = "agent-skills-comment:";

/**
 * The comment-stage namespace — a SUPERSET of the board-moment namespace.
 *
 * `work-started`, `in-review` and `done` are shared with jira-stage.js and
 * gh-stage.js on purpose: a step that moves a card and comments about it passes
 * the same name to both, and that symmetry is the reason this CLI spells the
 * flag `--stage` rather than inventing a synonym.
 *
 * The rest exist because a moment can be worth commenting on without being
 * worth a column. A QA cycle does not move the card; a review verdict does not
 * move the card. Requiring every comment stage to be a board moment would mean
 * either silencing those comments or inventing columns nobody wants.
 *
 * Cycle-scoped stages take a numeric suffix (`qa-cycle-2`), because each cycle
 * must post its own comment rather than being suppressed by the previous
 * cycle's marker.
 */
/**
 * The stages that may carry a numeric suffix (`qa-cycle-2`, `qa-fix-3`),
 * because each cycle must post its own comment rather than being suppressed by
 * the previous cycle's marker. Every other stage fires at most once per run.
 */
// `pipeline-paused` takes the STEP it paused at as its suffix (`pipeline-paused-4`),
// for the same reason: one pipeline can pause more than once, and each pause is
// its own event. Kept in step with CYCLE_SCOPED_LEAD_STAGES in
// stakeholder-summary.js, which a test holds equal to this list.
const CYCLE_SCOPED_STAGES = Object.freeze([
  "qa-cycle",
  "qa-fix",
  "pipeline-paused",
]);

const COMMENT_STAGES = Object.freeze([
  "work-started",
  "in-review",
  "develop-complete",
  "review",
  "review-story",
  "review-task",
  "review-bug",
  "qa-gate",
  "qa-cycle",
  "qa-fix",
  "pipeline-paused",
  "done",
]);

const USAGE = `tracker-comment — post one comment to a tracker issue

Usage:
  tracker-comment.js --issue <key|N> --body-file <path>
                     (--stage <name> | --summary-file <path>) [--slot k=v ...]
                     [--json] [--quiet] [--dry-run] [--strict]
                     [--tracker jira|github]

Options:
  --issue, -i     Issue key (PROJ-1) or number (42). Required.
  --body-file, -f Path to a file holding the comment body (markdown). Required.
                  A file, never an inline string: bodies contain backticks,
                  $(…) and newlines, and an interpolated body is a shell
                  injection waiting for the first comment that contains one.
  --slot k=v      Fill a slot in the stage's plain-language lead. Repeatable.
                  Boolean slots read "false"/"no"/"none"/"0" as absent; numeric
                  slots take a positive whole number.
  --summary-file, -S
                  Path to a hand-written plain-language lead, overriding the
                  stage's template. REQUIRED when --stage is omitted — every
                  known stage has a template, so that is the only case where a
                  lead cannot otherwise be produced. Must not be empty.
  --stage, -s     The comment's identity — builds the idempotency marker AND
                  selects the plain-language lead. REQUIRED unless --summary-file
                  is given: a comment for which no lead can be produced does not
                  post. Omitting it yields an unmarked comment, posted on every
                  run, and then --summary-file must supply the lead.
  --tracker       Force the tracker instead of detecting it.
  --json          Emit a JSON result object on stdout.
  --quiet         Suppress informational output.
  --dry-run       Resolve everything, read nothing, write nothing.
  --strict        Exit 1 on a skip instead of 0.
  --help, -h      Show this message.

Exit codes: 0 = every normal outcome, 1 = skip under --strict, 2 = usage error.
`;

// ---------------------------------------------------------------------------
// Output mode — a local copy, for the reason gh-stage.js gives: this file must
// not require jira-sync.js eagerly just to borrow a six-line helper.
// ---------------------------------------------------------------------------
function makeOutput({ json = false, quiet = false } = {}) {
  return {
    log: (...a) => {
      if (!json && !quiet) console.log(...a);
    },
    info: (...a) => {
      if (!json && !quiet) console.log(...a);
    },
    warn: (...a) => {
      if (!json) console.warn(...a);
    },
    err: (...a) => console.error(...a),
    emit: (payload) =>
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n"),
    isJson: json,
    isQuiet: quiet,
  };
}

// ---------------------------------------------------------------------------
// Credential file loading — same candidates and same never-overwrite rule as
// jira-sync.js and gh-stage.js, so a consumer has one credential location.
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
// Tracker detection
//
// Mirrors resolve-platform.sh's order for the part that matters here: an
// explicit flag, then TRACKER (which resolve-platform.sh exports when a skill
// has already resolved it), then the presence of JIRA_URL, then GitHub. There
// is no git-remote sniffing — by the time this CLI runs, a skill has sourced the
// resolver and exported TRACKER, and re-deriving it from a remote would let the
// two disagree.
// ---------------------------------------------------------------------------
function resolveTracker(explicit, env = process.env) {
  const want = (explicit || env.TRACKER || "").trim().toLowerCase();
  if (want === "jira" || want === "github") return want;
  if (want)
    throw new Error(`Unknown tracker: "${want}" (expected jira|github)`);
  return env.JIRA_URL ? "jira" : "github";
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

/**
 * Is this a stage this CLI knows? Exact member, or a cycle-scoped member with a
 * numeric suffix (`qa-cycle-2`, `qa-fix-3`).
 */
function isKnownStage(stage) {
  if (COMMENT_STAGES.includes(stage)) return true;
  // The numeric suffix is legal ONLY for the cycle-scoped stages, so the
  // runtime rule matches what the error message promises. Allowing `done-1`
  // was harmless but meant the two disagreed, and a rule nobody can predict
  // from its own message is one people route around.
  return CYCLE_SCOPED_STAGES.some(
    (k) => stage.startsWith(`${k}-`) && /^\d+$/.test(stage.slice(k.length + 1)),
  );
}

/** GitHub/Bitbucket: an HTML comment, invisible when rendered. */
/**
 * Is there anything a human would SEE in this text?
 *
 * `.trim()` removes whitespace but not the zero-width set (U+200B–U+200D,
 * U+FEFF, U+2060), so a file holding only those passes a bare `!text` check and
 * posts something invisible. Used for emptiness TESTS only — never to transform
 * the text that ships, because U+200D is meaningful inside emoji sequences and
 * in Indic/Arabic shaping.
 */
function isVisiblyNonEmpty(text) {
  return (
    typeof text === "string" &&
    text.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "").trim() !== ""
  );
}

function markerHtml(stage) {
  return `<!-- ${COMMENT_MARKER_PREFIX}${stage} -->`;
}

/** Jira: visible italic text — ADF drops nodes it does not recognise. */
function markerText(stage) {
  return `↳ ${COMMENT_MARKER_PREFIX}${stage}`;
}

// ---------------------------------------------------------------------------
// Arg parsing — hand-rolled switch, matching both peers.
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  // Every value-taking flag fails CLOSED. `--stage` used to fail open: a
  // missing value left `stage` undefined, `if (args.stage)` went false, and the
  // comment posted UNMARKED and unconditionally on every resume — while
  // `--issue` and `--body-file` correctly exited 2 in the same situation. A
  // flag-shaped value is rejected too, since `--stage --json` would otherwise
  // swallow the flag the caller parses `reason` from.
  const value = (i, name) => {
    const v = args[i];
    if (v === undefined || v.startsWith("-")) {
      throw new Error(`${name} requires a value`);
    }
    return v;
  };
  const opts = {
    issue: "",
    bodyFile: "",
    stage: "",
    tracker: "",
    summaryFile: "",
    slots: {},
    json: false,
    quiet: false,
    dryRun: false,
    strict: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--issue":
      case "-i":
        opts.issue = value(++i, "--issue");
        break;
      case "--body-file":
      case "-f":
        opts.bodyFile = value(++i, "--body-file");
        break;
      case "--stage":
      case "-s":
        opts.stage = value(++i, "--stage");
        break;
      case "--tracker":
        opts.tracker = value(++i, "--tracker");
        break;
      case "--summary-file":
      case "-S":
        opts.summaryFile = value(++i, "--summary-file");
        break;
      case "--slot": {
        // k=v rather than a JSON blob: a slot value is a short human string,
        // and a JSON argument would reintroduce the quoting problem
        // --body-file exists to avoid. Repeatable — the first such flag here,
        // so it assigns into an object rather than last-winning.
        const kv = value(++i, "--slot");
        const eq = kv.indexOf("=");
        if (eq < 1) {
          throw new Error(`--slot expects k=v, got "${kv}"`);
        }
        opts.slots[kv.slice(0, eq)] = kv.slice(eq + 1);
        break;
      }
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
// GitHub branch
// ---------------------------------------------------------------------------

function ghAvailable(execImpl) {
  try {
    execImpl("gh", ["auth", "status"], GIT_EXEC_OPTS);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Count existing comments carrying this marker.
 *
 * Returns { count, unreadable }. A read that FAILS is not evidence of absence,
 * so it reports `unreadable` and the caller degrades to `unverifiable` rather
 * than posting what may be a duplicate.
 */
function ghFindMarker(execImpl, issue, marker) {
  // `gh issue view --json comments` returns a bare array with no total and no
  // paging, so on a busy issue a marked comment can fall outside the window,
  // read as absent, and produce the duplicate the cardinality rule exists to
  // prevent. `gh api --paginate` walks every page, so absence means absence.
  //
  // The `issue view` path is kept as a fallback for a `gh` too old for
  // `--paginate` or a repo it cannot resolve — but a fallback read is a
  // PARTIAL read, so it reports `unreadable` rather than a count it cannot
  // stand behind.
  let repo = "";
  try {
    repo = String(
      execImpl(
        "gh",
        ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        GIT_EXEC_OPTS,
      ),
    ).trim();
  } catch (_) {
    /* fall through to the partial read */
  }

  if (repo) {
    try {
      const raw = execImpl(
        "gh",
        [
          "api",
          "--paginate",
          `repos/${repo}/issues/${String(issue)}/comments`,
          "--jq",
          ".[].body",
        ],
        GIT_EXEC_OPTS,
      );
      const bodies = String(raw).split("\n").filter(Boolean);
      const hits = bodies.filter((b) => b.includes(marker));
      return { count: hits.length, unreadable: false };
    } catch (_) {
      /* fall through */
    }
  }

  try {
    const data = JSON.parse(
      execImpl(
        "gh",
        ["issue", "view", String(issue), "--json", "comments"],
        GIT_EXEC_OPTS,
      ),
    );
    const hits = (data.comments || []).filter((c) =>
      String(c.body || "").includes(marker),
    );
    // A hit found in a partial list is still a hit — `already` is safe. Zero
    // hits in a partial list is NOT evidence of absence.
    if (hits.length > 0) return { count: hits.length, unreadable: false };
    return { count: null, unreadable: true, partial: true };
  } catch (_) {
    return { count: null, unreadable: true };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run({
  argv = process.argv,
  execImpl = execFileSync,
  repoRoot = "",
  fetchImpl = undefined,
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

  // Declared before `emit`, which closes over it. Stays null until the lead is
  // resolved below, so an exit that emits before the guard reports "no lead
  // resolved" rather than throwing on the temporal dead zone.
  let leadKind = null;

  const emit = (payload, exitCode) => {
    if (args.json)
      output.emit({ ...payload, stage: args.stage, lead: leadKind, exitCode });
    return { exitCode, ...payload };
  };

  // ── USAGE VALIDATION ──────────────────────────────────────────────────────
  // A missing --issue is exit 2 in both peers, so it is exit 2 here. It is NOT
  // a `no-issue` reason: an issue that is merely unlinked is the caller's
  // branch — the step doc skips the call entirely when TRACKER_ISSUE is empty.
  if (!args.issue || !String(args.issue).trim()) {
    output.err("Error: --issue is required");
    output.err(USAGE);
    return { exitCode: 2 };
  }
  if (!args.bodyFile) {
    output.err("Error: --body-file is required");
    output.err(USAGE);
    return { exitCode: 2 };
  }

  let body;
  try {
    body = fs.readFileSync(args.bodyFile, "utf-8");
  } catch (e) {
    output.err(
      `Error: cannot read --body-file "${args.bodyFile}": ${e.message}`,
    );
    return { exitCode: 2 };
  }
  // CRLF is normalised once, here, so neither branch has to think about it and
  // the marker match cannot fail on a stray \r.
  body = body.replace(/\r\n/g, "\n").trim();
  // Same visibility rule as --summary-file below: a body of only zero-width
  // characters is empty, and the two flags must agree about what "empty" means.
  if (!isVisiblyNonEmpty(body)) {
    output.err(`Error: --body-file "${args.bodyFile}" is empty`);
    return { exitCode: 2 };
  }

  let tracker;
  try {
    tracker = resolveTracker(args.tracker, env);
  } catch (e) {
    output.err(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  const issue = String(args.issue).trim();
  if (tracker === "github" && !/^\d+$/.test(issue)) {
    output.err(`Error: --issue must be a number on GitHub, got "${issue}"`);
    return { exitCode: 2 };
  }

  // QA-5: COMMENT_STAGES was documentation, never a constraint — any string
  // was accepted and produced a silently unique marker, so two step docs
  // spelling one moment differently could never reconcile. Validate it here.
  // The numeric-suffix form is legal for cycle-scoped stages (`qa-cycle-2`),
  // because each cycle must post its own comment.
  if (args.stage && !isKnownStage(args.stage)) {
    output.err(
      `Error: unknown --stage "${args.stage}". Known: ${COMMENT_STAGES.join(", ")} ` +
        `(cycle-scoped stages may take a numeric suffix, e.g. qa-cycle-2)`,
    );
    return { exitCode: 2 };
  }

  // ── THE PLAIN-LANGUAGE LEAD ───────────────────────────────────────────────
  // Standard and catalogue: stakeholder-summary.md. The engine renders the lead
  // from the --stage the caller already passes, so a call site cannot forget one
  // and a new stage cannot ship without one.
  //
  // The lead is merged into `body` HERE, above the access gate, and deliberately
  // so. The deferred-mutation record below snapshots `body` into command.stdin
  // and replays it through `gh issue comment --body-file -`, bypassing this file
  // entirely — so a lead composed further downstream would be missing from every
  // deferred comment, which is precisely the population that gets posted by hand
  // and read by someone outside the pipeline. It also means the record's
  // fingerprint changes, which the task documents as expected rather than a bug.
  let leadSource = null;
  if (args.summaryFile) {
    try {
      leadSource = fs
        .readFileSync(args.summaryFile, "utf-8")
        .replace(/\r\n/g, "\n")
        .trim();
    } catch (e) {
      output.err(
        `Error: cannot read --summary-file "${args.summaryFile}": ${e.message}`,
      );
      return { exitCode: 2 };
    }
    // Same rule as --body-file: an empty file is a usage error, not an empty
    // lead. Silently posting without one made --summary-file /dev/null a
    // one-flag bypass of the standard this module exists to enforce, while
    // --json still reported `lead: "summary-file"` — a contract that lied.
    //
    // Emptiness is tested against a STRIPPED COPY and the ORIGINAL is posted.
    // The first version of this check stripped the zero-width set from the
    // content itself, which deleted U+200D from what actually shipped — the
    // joiner inside every ZWJ emoji sequence, and load-bearing for Indic and
    // Arabic shaping. "Shipped by 👩‍💻" posted as "Shipped by 👩💻". Closing an
    // emptiness hole is no licence to rewrite a human's text.
    if (!isVisiblyNonEmpty(leadSource)) {
      output.err(`Error: --summary-file "${args.summaryFile}" is empty`);
      return { exitCode: 2 };
    }
  } else {
    leadSource = renderLead(args.stage, args.slots || {});
  }

  if (leadSource === null) {
    // Name BOTH routes. The reader who hits this is almost always someone who
    // omitted --stage deliberately for a repeat-every-run comment; a message
    // that says only "missing summary" sends them looking for a flag they have
    // never seen.
    output.err(
      `Error: no plain-language summary for --stage "${args.stage || "(omitted)"}". ` +
        `Either pass a --stage that has one (${LEAD_STAGES.join(", ")}) ` +
        `or pass --summary-file with a hand-written one. ` +
        `See shared/resources/stakeholder-summary.md.`,
    );
    return { exitCode: 2 };
  }

  leadKind = args.summaryFile ? "summary-file" : "template";

  // Captured BEFORE the merge below. `desired:` is the label a human reads in
  // the deferred/handover checklist to tell one pending action from another,
  // and the lead is by design near-identical across every comment of a given
  // stage — exactly the wrong thing to label them with. command.stdin still
  // carries the composed body, because that is what gets posted.
  const desiredLine = firstLineOf(body);
  // Unconditional: `null` is rejected by the guard above and `""` by the
  // empty-file check, so every path reaching here has a real lead.
  body = `${leadSource}\n\n---\n\n${body}`;

  const skipCode = args.strict ? 1 : 0;

  // ── ACCESS GATE ───────────────────────────────────────────────────────────
  //
  // Placement is the whole point, exactly as in gh-stage.js. Everything above
  // is local — arg parsing and one file read. Everything below reaches out. The
  // gate sits between them, so a gated run demonstrably attempts no network
  // call. `--dry-run` is exempt because it performs no mutation.
  //
  // The comparison is `!== "full"`, never truthiness: an unset variable must
  // read as `full`, or this CLI silently stops commenting everywhere.
  let access;
  try {
    access = dm.resolveAccessTracker(accessEnv, { cwd: root || process.cwd() });
  } catch (e) {
    output.err(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  if (access !== "full" && !args.dryRun) {
    const isJira = tracker === "jira";
    const baseUrl = (env.JIRA_URL || "").replace(/\/+$/, "");
    const uiUrl = isJira
      ? `${baseUrl || "https://your-jira"}/browse/${issue}`
      : `issue #${issue}`;
    try {
      const rec = dm.defer(
        {
          kind: isJira ? "jira.comment.add" : "github.issue.comment",
          system: isJira ? "jira" : "github",
          access,
          intent: `Comment on ${isJira ? issue : `#${issue}`}${
            args.stage ? ` (${args.stage})` : ""
          }`,
          target: {
            issue,
            url: isJira
              ? `${baseUrl}/rest/api/3/issue/${issue}/comment`
              : `issue #${issue}`,
            ui_url: uiUrl,
          },
          desired: desiredLine,
          manual: {
            deepLink: uiUrl,
            ui: "Open the issue → Comment → Paste → Save",
            // The full body, because a human performing this by hand needs the
            // text, not a summary of it.
            fields: [{ name: "Comment", value: body }],
          },
          // argv is an ARRAY and the body rides in `stdin`, never interpolated.
          // This is also what makes the record's fingerprint correct: it hashes
          // command.stdin, so two different comments on the same issue produce
          // two records instead of collapsing into one and losing a comment.
          command: {
            argv: isJira
              ? ["jira", "comment", issue]
              : ["gh", "issue", "comment", issue, "--body-file", "-"],
            stdin: body,
          },
          skill: "tracker-comment",
        },
        { cwd: root || process.cwd() },
      );
      output.info(
        `⏸️  access.tracker=${access} — not commenting on ${issue}; recorded as ${rec.id}.`,
      );
      return emit(
        { posted: false, reason: "deferred", access, record: rec.id },
        0,
      );
    } catch (e) {
      // A journal we cannot write is a WARNING, never a licence to perform the
      // mutation anyway. Same rule as gh-stage.js.
      output.warn(`⚠️  Could not record the deferred comment: ${e.message}`);
      return emit({ posted: false, reason: "deferred", access }, 0);
    }
  }

  if (args.dryRun) {
    output.info(
      `🔎 dry-run — would comment on ${issue}${args.stage ? ` (${args.stage})` : ""} via ${tracker}.`,
    );
    return emit({ posted: false, reason: "dry-run", tracker }, 0);
  }

  return tracker === "jira"
    ? runJira({
        args,
        issue,
        body,
        desiredLine,
        output,
        emit,
        env,
        root,
        fetchImpl,
        skipCode,
      })
    : runGithub({ args, issue, body, output, emit, execImpl, skipCode });
}

// ---------------------------------------------------------------------------
// GitHub path
// ---------------------------------------------------------------------------
function runGithub({ args, issue, body, output, emit, execImpl, skipCode }) {
  if (!ghAvailable(execImpl)) {
    output.info(
      "ℹ️  gh is unavailable or unauthenticated — no comment posted.",
    );
    return emit({ posted: false, reason: "no-credentials" }, skipCode);
  }

  let finalBody = body;
  if (args.stage) {
    const marker = markerHtml(args.stage);
    // Search the FULL marker, never the bare prefix. `<!-- …:review -->` is not
    // a substring of `<!-- …:review-story -->` because the marker terminates
    // itself; searching `…:review` alone matched both, so a Step 2 `review`
    // comment reported `already` against a `review-story` marker and was never
    // posted. Silent comment loss — the failure this module exists to prevent.
    const found = ghFindMarker(execImpl, issue, marker);
    if (found.unreadable) {
      output.warn(
        `⚠️  Could not read comments on #${issue} — not posting, to avoid a duplicate.`,
      );
      return emit(
        { posted: false, reason: "unverifiable", cause: "comments-unreadable" },
        skipCode,
      );
    }
    if (found.count === 1) {
      output.info(`✅ #${issue} already has the ${args.stage} comment.`);
      return emit({ posted: false, reason: "already", matches: 1 }, 0);
    }
    if (found.count > 1) {
      // The case the existing `| head -1` convention gets wrong. Two matches
      // means someone or something posted twice; adopting the first hides the
      // second forever. Report and stop.
      output.warn(
        `⚠️  #${issue} has ${found.count} comments marked ${args.stage} — ambiguous, not posting.`,
      );
      return emit(
        { posted: false, reason: "unverifiable", matches: found.count },
        skipCode,
      );
    }
    // Marker first, so a `startswith` match works as well as a `contains` one —
    // the shape the finalise PR-comment convention established.
    finalBody = `${marker}\n${body}`;
  }

  try {
    execImpl("gh", ["issue", "comment", issue, "--body-file", "-"], {
      ...GIT_EXEC_OPTS,
      input: finalBody,
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch (e) {
    output.warn(`⚠️  gh issue comment failed: ${e.message}`);
    return emit(
      { posted: false, reason: "unverifiable", cause: "post-failed" },
      skipCode,
    );
  }
  output.info(
    `💬 Commented on #${issue}${args.stage ? ` (${args.stage})` : ""}.`,
  );
  return emit({ posted: true, reason: "posted" }, 0);
}

// ---------------------------------------------------------------------------
// Jira path — the lazy require lives here, and only here.
// ---------------------------------------------------------------------------
async function runJira({
  args,
  issue,
  body,
  desiredLine,
  output,
  emit,
  env,
  root,
  fetchImpl,
  skipCode,
}) {
  // eslint-disable-next-line global-require
  const jira = require("./jira-sync.js");

  // Pass the SAME env `run()` resolved the tracker from. Reading process.env
  // here instead let the two disagree and made this whole branch unreachable
  // from a test.
  const auth = jira.getAuth({
    required: ["JIRA_URL", "JIRA_API_TOKEN", "JIRA_USER_EMAIL"],
    optional: [],
    source: env,
  });
  if (!auth.ok) {
    output.info(
      `ℹ️  No Jira credentials (${auth.missing.join(", ")}) — no comment posted.`,
    );
    return emit(
      { posted: false, reason: "no-credentials", missing: auth.missing },
      skipCode,
    );
  }

  const http = jira.makeHttp({
    ...(fetchImpl ? { fetchImpl } : {}),
    system: "jira",
    skill: "tracker-comment",
    cwd: root || process.cwd(),
    output,
  });

  const common = {
    http,
    baseUrl: auth.baseUrl,
    email: auth.email,
    token: auth.token,
    issueKey: issue,
  };

  if (args.stage) {
    let found;
    try {
      found = await jira.findCommentsByMarker({
        ...common,
        momentId: args.stage,
      });
    } catch (e) {
      output.warn(`⚠️  Could not read comments on ${issue}: ${e.message}`);
      return emit(
        { posted: false, reason: "unverifiable", cause: "comments-unreadable" },
        skipCode,
      );
    }
    if (found.unreadable) {
      output.warn(
        `⚠️  Could not read comments on ${issue} — not posting, to avoid a duplicate.`,
      );
      return emit(
        { posted: false, reason: "unverifiable", cause: "comments-unreadable" },
        skipCode,
      );
    }
    if (found.count === 1) {
      output.info(`✅ ${issue} already has the ${args.stage} comment.`);
      return emit({ posted: false, reason: "already", matches: 1 }, 0);
    }
    if (found.count > 1) {
      output.warn(
        `⚠️  ${issue} has ${found.count} comments marked ${args.stage} — ambiguous, not posting.`,
      );
      return emit(
        { posted: false, reason: "unverifiable", matches: found.count },
        skipCode,
      );
    }
  }

  let result;
  try {
    result = await jira.addComment({
      skill: "tracker-comment",
      ...common,
      body,
      desired: desiredLine,
      momentId: args.stage,
    });
  } catch (e) {
    output.warn(`⚠️  Jira comment failed: ${e.message}`);
    return emit(
      { posted: false, reason: "unverifiable", cause: "post-failed" },
      skipCode,
    );
  }

  // makeHttp's own access gate can defer even though the gate above passed —
  // the two read the same resolver, but this one is the authority for anything
  // routed through http(). Report what actually happened.
  if (result.deferred) {
    return emit(
      { posted: false, reason: "deferred", record: result.record },
      0,
    );
  }
  output.info(
    `💬 Commented on ${issue}${args.stage ? ` (${args.stage})` : ""}.`,
  );
  return emit({ posted: true, reason: "posted", id: result.id || null }, 0);
}

/** First non-empty line, trimmed of markdown marks — the record's `desired`. */
function firstLineOf(text) {
  if (!text) return "(empty comment)";
  const line = String(text)
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length);
  if (!line) return "(empty comment)";
  const stripped = line.replace(/^#+\s*/, "").replace(/\*\*/g, "");
  return stripped.length > 120 ? `${stripped.slice(0, 117)}...` : stripped;
}

module.exports = {
  run,
  parseArgs,
  makeOutput,
  resolveTracker,
  markerHtml,
  markerText,
  isKnownStage,
  firstLineOf,
  loadDotEnv,
  COMMENT_MARKER_PREFIX,
  COMMENT_STAGES,
  CYCLE_SCOPED_STAGES,
  USAGE,
};

if (require.main === module) {
  // Any unhandled throw exits 0, matching both peers: a pipeline step runs
  // inside a shell, and killing the run because a comment failed would trade a
  // missing comment for a stopped pipeline.
  run()
    .then((r) => process.exit(r && r.exitCode ? r.exitCode : 0))
    .catch((e) => {
      console.error(`⚠️  tracker-comment: ${e.message}`);
      process.exit(0);
    });
}
