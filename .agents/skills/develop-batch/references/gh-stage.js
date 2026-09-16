#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/gh-stage.js. Regenerate via `npm run bundle`.
/**
 * gh-stage — set the GitHub Projects v2 Status field a pipeline MOMENT implies.
 *
 * The Jira twin walks a ladder because a Jira workflow can refuse a move. A
 * Projects v2 single-select cannot: every option is settable from every other.
 * So there is no transition graph, no "not reachable from here", and no walking.
 *
 * The consequence is that the backward-move guard is the ONLY thing stopping a
 * resumed run from dragging a card out of Done. On Jira the workflow is a second
 * brake; here there is none. The guard is therefore mandatory, not advisory.
 *
 * A skip here also means something different. On Jira "no transition from here"
 * is frequently correct. On GitHub `no-option` can only mean the Status field
 * has no such option at all — always a configuration error. Say so loudly.
 *
 * Usage:
 *   gh-stage.js --issue 123 --stage in-review [--json] [--dry-run]
 *               [--strict] [--allow-regress] [--add-to-board]
 *               [--board <number|name>] [--field <name>]
 *   gh-stage.js --probe-board [--write-ladder]   (read-only)
 *
 * Exit codes (transcribed from jira-stage.js:21-27 so this is a drop-in
 * replacement for the `|| echo "⚠️ …"` subshells the step files use today):
 *   0  transitioned, already there, stage-disabled, no-option, not-on-board,
 *      ambiguous-board, no-credentials, would-regress, dry-run — and any
 *      unhandled throw
 *   1  a skip, but only under --strict
 *   2  usage error (unknown moment, missing --issue)
 *
 * Zero non-transition exit codes matter: pipeline steps run inside shells, and
 * a non-zero exit on "this board has no review column" would kill the run.
 *
 * This module depends on tracker-workflow.js and NOTHING else in shared/. In
 * particular it must never require jira-sync.js: that file is ~4,100 lines of
 * Jira machinery, and a GitHub-only consumer bundling it would pay for a tracker
 * they do not use. `makeOutput` and `loadDotEnv` are therefore reimplemented
 * below rather than imported — see the comments on each.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const tw = require("./tracker-workflow.js");
const { parseYamlSubset } = require("./yaml-subset.js");
const dm = require("./defer-mutation.js");

const GIT_EXEC_OPTS = {
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "ignore"],
};

const DEFAULT_STATUS_FIELD = "Status";

// ---------------------------------------------------------------------------
// Output mode
// ---------------------------------------------------------------------------
// A verbatim reimplementation of jira-sync.js:79-96. Copied rather than imported
// for the dependency reason in the header. The semantics are load-bearing and
// easy to get subtly wrong:
//   log/info  suppressed by EITHER --json or --quiet
//   warn      suppressed only by --json, so it survives --quiet
//   err       always writes
//   emit      writes UNCONDITIONALLY, not gated on --json — that is what makes
//             --probe-board machine-readable on its own.
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
// Credential file loading
// ---------------------------------------------------------------------------
// Candidate files, in precedence order — kept identical to jira-sync.js's
// CREDENTIAL_FILES so a consumer has ONE credential location, not one per tool.
// `.secrets/tooling.env` leads because Nx auto-loads workspace `.env` files into
// every task's environment; `.secrets/` is outside the names Nx generates, so it
// is never auto-loaded. `.env` stays second — never replaced — so consumers who
// have not migrated keep working.
const CREDENTIAL_FILES = [".secrets/tooling.env", ".env"];

// Also a local copy (jira-sync.js). `gh` carries its own auth, so this is only
// here for the config keys below — a consumer who sets GH_PROJECT_STATUS_FIELD
// in a credential file rather than the shell should still be heard.
// Never overwrites an already-set key, and swallows everything.
//
// NO "missing credentials" warning here, deliberately, and this is the one place
// this module diverges from jira-sync.js. The only key this loader supplies is
// GH_PROJECT_STATUS_FIELD, which is optional, falls back to skills-config.yaml
// and then to a default — so its absence is the NORMAL case, not a fault. A
// warning here would fire on essentially every GitHub consumer and mean nothing,
// and a warning that is usually noise is one nobody reads when it is not.
// jira-sync.js warns because its keys are required and their absence is silent;
// that asymmetry is the point, not an oversight.
function loadDotEnv(repoRoot) {
  try {
    const root = repoRoot || repoRootOf();
    if (!root) return;
    // Every candidate is merged rather than stopping at the first that exists:
    // a consumer mid-migration has some keys in one file and some in the other,
    // and the `!(key in process.env)` guard already makes the earlier file
    // authoritative per key. This can only ADD a key, never lose one.
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
// Config resolution
// ---------------------------------------------------------------------------
// Mirrors set-github-project-estimate.sh:29-61's env → skills-config.yaml →
// default order, but reads the YAML with parseYamlSubset instead of shelling to
// python-or-awk. Same precedence, one implementation, no interpreter guessing.
function readYamlFile(root, rel) {
  try {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) return null;
    return parseYamlSubset(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function resolveStatusFieldName(root) {
  if (process.env.GH_PROJECT_STATUS_FIELD)
    return process.env.GH_PROJECT_STATUS_FIELD;
  const cfg = readYamlFile(root, "skills-config.yaml");
  const v = cfg && cfg.github && cfg.github.projectStatusField;
  return (v && String(v).trim()) || DEFAULT_STATUS_FIELD;
}

/** `{ owner, repo, board }` from project.yml, any of which may be empty. */
function readProjectYml(root) {
  const doc = readYamlFile(root, "project.yml");
  const gh = (doc && doc.github) || {};
  return {
    owner: gh.owner ? String(gh.owner).trim() : "",
    repo: gh.repo ? String(gh.repo).trim() : "",
    boardNumber:
      gh.project_board_number !== undefined && gh.project_board_number !== null
        ? String(gh.project_board_number).trim()
        : "",
    boardName: gh.project_board_name
      ? String(gh.project_board_name).trim()
      : "",
  };
}

function resolveConfiguredBoard(root) {
  const cfg = readYamlFile(root, "skills-config.yaml");
  const v = cfg && cfg.github && cfg.github.projectBoard;
  return v !== undefined && v !== null && String(v).trim()
    ? String(v).trim()
    : "";
}

// ---------------------------------------------------------------------------
// Option matching — the pure core
// ---------------------------------------------------------------------------
/**
 * Pick the board option a moment's candidates name.
 *
 * Deliberately dumber than jira-sync.js's resolveTransition:
 *   1 already · 2 exact case-insensitive match per candidate in order · 3 stop.
 *
 * No prefix matching — that is what makes "In Review" match "In Review
 * (blocked)". No fuzzy matching. No status-category analogue, because a
 * single-select has no categories. `eqName` (tracker-workflow.js) supplies the
 * one matching discipline: emoji-stripped, case-insensitive, trimmed.
 *
 * `candidates` is `resolveMoment(...).targets` — PLURAL, in preference order.
 * Reducing it to targets[0] makes alternative spellings of a column unreachable,
 * which is the regression the plural return exists to prevent.
 */
function resolveOption(options, candidates, current) {
  const opts = options || [];
  const cands = candidates || [];
  if (current && cands.some((c) => tw.eqName(c, current)))
    return { match: null, reason: "already" };
  for (const c of cands) {
    const hit = opts.find((o) => tw.eqName(o.name, c));
    if (hit) return { match: hit, rule: `option="${c}"` };
  }
  return { match: null, reason: "no-option" };
}

/**
 * Which OTHER moments the board's existing options already serve.
 *
 * The GitHub analogue of jira-stage.js:127 describeAlternatives, and the single
 * highest-value thing to bring across: it turns "nothing moved" into a one-line
 * diagnosis. The asymmetry is in the framing, not the mechanism — on Jira a
 * missing hop is often correct, so the hint reads as information; here it is
 * always a misconfiguration, so the hint reads as "you probably meant this".
 */
function describeAlternatives(options, moment, workflow, issueType) {
  const hints = [];
  const seen = new Set();
  for (const other of tw.MOMENTS) {
    if (other === moment) continue;
    const spec = tw.resolveMoment(other, workflow, { issueType });
    if (!spec) continue;
    for (const target of spec.targets || []) {
      const hit = (options || []).find((o) => tw.eqName(o.name, target));
      if (hit && !seen.has(hit.name)) {
        seen.add(hit.name);
        hints.push(
          `"${hit.name}" is present and is the target for moment ${other}`,
        );
        break;
      }
    }
  }
  return hints;
}

// ---------------------------------------------------------------------------
// gh transport
// ---------------------------------------------------------------------------
// Auth stays in `gh`, matching every other GitHub call in this repo. There is no
// second transport and no MCP fallback: `gh` is either authenticated or it is
// not, so `no-credentials` here is a dead end, not a handoff. Do not add a
// fallback protocol document for this — none can exist.
function makeExec(execImpl) {
  if (execImpl) return execImpl;
  return (args, opts) =>
    execFileSync("gh", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      ...(opts || {}),
    });
}

function ghAvailable(exec) {
  try {
    exec(["auth", "status"]);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Retry a `gh` call three times, sleeping 1s then 2s.
 *
 * The shell helper `tracker_call_with_retry` (resolve-platform.sh:69-80) wraps
 * `gh issue` calls but no board mutation, and board mutations fail transiently
 * at least as often. It is shell-only and cannot wrap a JS call, so the 3×
 * backoff is reimplemented here with the same shape — including the detail that
 * the last attempt does not sleep before returning.
 */
function withRetry(fn, { attempts = 3, sleepMs = sleepSync } = {}) {
  let lastErr;
  const delays = [1000, 2000];
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      if (i < delays.length) sleepMs(delays[i]);
    }
  }
  throw lastErr;
}

// Synchronous by design: every other call in this CLI is execFileSync, and an
// async sleep here would be the only await in the file.
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {}
}

const BOARD_QUERY = (owner, repo, issue, statusField) => `
{
  repository(owner: "${owner}", name: "${repo}") {
    issue(number: ${issue}) {
      projectItems(first: 10) {
        nodes {
          id
          fieldValueByName(name: "${statusField}") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          project {
            id
            title
            number
            fields(first: 50) {
              nodes {
                ... on ProjectV2SingleSelectField { id name options { id name } }
              }
            }
          }
        }
      }
    }
  }
}`;

/**
 * The single board read: item id, project id/title/number, the Status field id,
 * all its option ids/names in board order, AND the current value.
 *
 * That last one is the real addition — steps 0, 4 and 7 do not fetch the current
 * value today, which is why none of them can implement a guard. Option order
 * matters too: `options` comes back in board order, and a Projects board's
 * option order IS its workflow order, which is what --write-ladder reads.
 */
function readBoard({ exec, owner, repo, issue, statusField, onWarn }) {
  const raw = exec([
    "api",
    "graphql",
    "-f",
    `query=${BOARD_QUERY(owner, repo, issue, statusField)}`,
  ]);
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    throw new Error(`could not parse gh api response: ${e.message}`);
  }
  const errs =
    doc && Array.isArray(doc.errors) && doc.errors.length
      ? doc.errors.map((e) => e && e.message).join("; ")
      : "";
  const nodes =
    (doc &&
      doc.data &&
      doc.data.repository &&
      doc.data.repository.issue &&
      doc.data.repository.issue.projectItems &&
      doc.data.repository.issue.projectItems.nodes) ||
    [];
  const items = nodes.map((n) => normalizeItem(n, statusField)).filter(Boolean);

  // GraphQL answers partially: a response may carry `errors` for one board the
  // token cannot see AND usable nodes for the rest. Throwing on any error at all
  // would turn a perfectly movable card into `board-unreadable`.
  //
  // So: throw only when nothing usable came back — that is the real failure (bad
  // scope, rate limit, unknown repo), and it must not be reported as the benign
  // `not-on-board` skip. Otherwise warn and proceed with what resolved.
  //
  // Deliberately unlike setOption, where all-or-nothing IS correct: a mutation
  // either applied or it did not, and there is no partial state to salvage.
  // The array carries a non-enumerable `partial` marker rather than changing the
  // return type: every caller iterates it as a list, and the one caller that has
  // to make a safety decision (selectBoard) reads the flag. Non-enumerable so
  // JSON.stringify and deepEqual on the items are unaffected.
  if (errs && !items.length) throw new Error(errs);
  if (errs && onWarn) onWarn(errs);
  Object.defineProperty(items, "partial", {
    value: !!errs,
    enumerable: false,
  });
  return items;
}

function normalizeItem(node, statusField) {
  if (!node || !node.id) return null;
  const project = node.project || {};
  const fields = ((project.fields && project.fields.nodes) || []).filter(
    (f) => f && f.name,
  );
  // `fields(first: 50)` returns every field type; the inline fragment leaves
  // non-single-select ones as `{}`, which the filter above drops. A board with
  // no Status field at all lands here as `statusFieldId: null` — a skip, not a
  // crash.
  const statusFieldNode = fields.find((f) => tw.eqName(f.name, statusField));
  return {
    itemId: node.id,
    current: (node.fieldValueByName && node.fieldValueByName.name) || "",
    projectId: project.id || "",
    projectTitle: project.title || "",
    projectNumber:
      project.number !== undefined && project.number !== null
        ? String(project.number)
        : "",
    statusFieldId: statusFieldNode ? statusFieldNode.id : null,
    // Board order is preserved — --write-ladder depends on it.
    options: statusFieldNode ? (statusFieldNode.options || []).slice() : [],
  };
}

/**
 * Choose which board to act on.
 *
 * set-github-project-*.sh fan out to EVERY board the issue is on. That is fine
 * for an estimate and wrong for a status: a status change is a claim about where
 * the work is, visible to whoever reads that board. So: never fan out.
 *
 *   1 --board / github.projectBoard, when set → must MATCH, else fail closed
 *   2 exactly one board                      → use it
 *   3 project.yml number / name              → that one
 *   4 otherwise                              → skip, "ambiguous-board", naming them
 *
 * Two different kinds of hint, deliberately handled differently:
 *
 * `--board` and `github.projectBoard` are an OPERATOR NAMING A BOARD. If the
 * named board is not among those read, that is a question, not a licence to pick
 * another one — so it fails closed even when only one board came back. The
 * one-board short-circuit must therefore come AFTER this check: a read returns
 * one board for reasons other than the issue being on one board, and a
 * partially-failed read is exactly that — the named board is missing precisely
 * because the token could not see it, and the survivor would be written to
 * without its name ever being compared.
 *
 * `project.yml` is ambient repo config — where this repo's board generally is —
 * not an assertion about this issue. It DISAMBIGUATES when several boards are in
 * play; it must not veto a move on the single board an issue actually sits on,
 * which would refuse every issue that lives anywhere else.
 */
function selectBoard(
  items,
  { board, configured, projectYml, partial = false },
) {
  if (items.length === 0) return { item: null, reason: "not-on-board" };

  const yml = projectYml || {};
  const candidates = items.map(
    (i) => `${i.projectTitle} (#${i.projectNumber})`,
  );
  const match = (hint) => {
    const h = String(hint).trim();
    return items.find(
      (i) => i.projectNumber === h || tw.eqName(i.projectTitle, h),
    );
  };

  const fail = (set) => ({
    item: null,
    reason: "ambiguous-board",
    ...(set
      ? {
          unmatchedHint: set.map(([h]) => String(h).trim()).join(" / "),
          unmatchedRule: set.map(([, r]) => r).join(" / "),
        }
      : {}),
    // A partial read is the likeliest innocent explanation for a hint that
    // matches nothing, and the operator cannot guess it from the candidate
    // list — the board they named is precisely the one missing from it.
    partialRead: !!partial,
    candidates,
  });

  // 1. Operator-named board. `--board` and `github.projectBoard` are SEPARATE
  //    tiers — `--board` outranks the config, so a set-but-unmatched `--board`
  //    must fail closed without consulting the config either. Falling through is
  //    what let a mistyped `--board 999` land on another board entirely.
  for (const [hint, rule] of [
    [board, "--board"],
    [configured, "github.projectBoard"],
  ]) {
    if (!hint) continue; // absent — the next tier may answer
    const hit = match(hint);
    if (hit) return { item: hit, rule };
    return fail([[hint, rule]]);
  }

  // 2. Nothing named, and only one board exists — nothing to disambiguate.
  if (items.length === 1) return { item: items[0], rule: "only-board" };

  // 3. project.yml disambiguates. Its two keys are two spellings of ONE board,
  //    so they are one tier: a stale number must not make the name unreachable.
  const ymlHints = [
    [yml.boardNumber, "project.yml project_board_number"],
    [yml.boardName, "project.yml project_board_name"],
  ].filter(([h]) => !!h);
  for (const [hint, rule] of ymlHints) {
    const hit = match(hint);
    if (hit) return { item: hit, rule };
  }

  return fail(ymlHints.length ? ymlHints : null);
}

/**
 * Add the issue to the board, then wait for the Projects API to catch up.
 *
 * Ported from develop-pipeline-step-0-resolve-and-prepare.md:373-441 rather than
 * reinvented: item-add, sleep 3, read, and if the read comes back empty sleep 5
 * and read exactly once more. That delay is real Projects API propagation
 * behaviour, not scaffolding — the step file has carried it for as long as the
 * block has existed. The step file re-inlines the whole query for its retry;
 * here it is one function called twice.
 */
function ensureOnBoard({
  exec,
  owner,
  repo,
  issue,
  statusField,
  boardNum,
  sleepMs = sleepSync,
}) {
  try {
    withRetry(
      () =>
        exec([
          "project",
          "item-add",
          String(boardNum),
          "--owner",
          owner,
          "--url",
          `https://github.com/${owner}/${repo}/issues/${issue}`,
        ]),
      { sleepMs },
    );
  } catch (_) {
    // item-add is idempotent and commonly "fails" because the item is already
    // present. The read below is the actual test of whether it worked.
  }
  sleepMs(3000);
  let items = readBoard({ exec, owner, repo, issue, statusField });
  if (items.length === 0) {
    sleepMs(5000);
    items = readBoard({ exec, owner, repo, issue, statusField });
  }
  return items;
}

const MUTATION = (projectId, itemId, fieldId, optionId) => `
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "${projectId}"
    itemId: "${itemId}"
    fieldId: "${fieldId}"
    value: { singleSelectOptionId: "${optionId}" }
  }) { projectV2Item { id } }
}`;

function setOption({ exec, item, optionId, sleepMs = sleepSync }) {
  // The errors check lives INSIDE the retried closure on purpose. A GraphQL
  // error envelope is a *successful* process exit — `gh` returns 0 and prints
  // the errors — so checking it outside meant withRetry never saw a failure and
  // exactly one mutation was ever issued. Board mutations fail transiently at
  // least as often as the `gh issue` calls the shell helper already wraps, so
  // this is the one path that most needed the retry and was not getting it.
  withRetry(
    () => {
      const raw = exec([
        "api",
        "graphql",
        "-f",
        `query=${MUTATION(item.projectId, item.itemId, item.statusFieldId, optionId)}`,
      ]);
      let doc = null;
      try {
        doc = JSON.parse(raw);
      } catch (_) {}
      if (doc && Array.isArray(doc.errors) && doc.errors.length) {
        throw new Error(doc.errors.map((e) => e && e.message).join("; "));
      }
      return raw;
    },
    { sleepMs },
  );
  return true;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    issue: "",
    stage: "",
    json: false,
    quiet: false,
    dryRun: false,
    strict: false,
    allowRegress: false,
    addToBoard: false,
    probeBoard: false,
    printPlan: false,
    writeLadder: false,
    initWorkflow: false,
    force: false,
    check: false,
    offline: false,
    board: "",
    field: "",
    issueType: "",
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--issue":
      case "-i":
        opts.issue = args[++i];
        break;
      case "--stage":
      case "-s":
        opts.stage = args[++i];
        break;
      case "--board":
        opts.board = args[++i];
        break;
      case "--field":
        opts.field = args[++i];
        break;
      case "--issue-type":
        opts.issueType = args[++i];
        break;
      case "--probe-board":
        opts.probeBoard = true;
        break;
      case "--print-plan":
        opts.printPlan = true;
        break;
      case "--write-ladder":
        opts.writeLadder = true;
        break;
      case "--init-workflow":
        opts.initWorkflow = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--check":
        opts.check = true;
        break;
      case "--offline":
        opts.offline = true;
        break;
      case "--add-to-board":
        opts.addToBoard = true;
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
      case "--allow-regress":
        opts.allowRegress = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        if (args[i].startsWith("-"))
          throw new Error(`Unknown option: ${args[i]}`);
    }
  }
  return opts;
}

const USAGE = `Usage: gh-stage --issue <N> --stage <${tw.MOMENTS.join("|")}>
              [--json] [--quiet] [--dry-run] [--strict] [--allow-regress]
              [--add-to-board] [--board <number|name>] [--field <name>]
       gh-stage --stage <${tw.MOMENTS.join("|")}> --print-plan
              [--issue-type <type>]   (no credentials, no network)
       gh-stage --probe-board [--write-ladder] [--board <number|name>]
              (read-only; --write-ladder writes tracker-workflow.yaml only when absent)
       gh-stage --init-workflow [--force] [--board <number|name>]
              (writes a full tracker-workflow.yaml from the live board; refuses
               to overwrite without --force)
       gh-stage --check [--offline] [--board <number|name>]
              (validates tracker-workflow.yaml; EXITS NON-ZERO ON FAILURE —
               the only mode in this family that does. --offline skips the board)`;

function run({
  argv = process.argv,
  execImpl = null,
  repoRoot = undefined,
  // Injectable so tests exercise the retry and propagation paths without paying
  // their real wall-clock cost. Production always uses the real sleep.
  sleepImpl = sleepSync,
} = {}) {
  const root = repoRootOf(repoRoot);

  // ACCESS_TRACKER is captured from the REAL environment BEFORE loadDotEnv runs.
  //
  // loadDotEnv copies .secrets/tooling.env and .env into process.env. Reading the
  // access mode after it would create a second resolution path that
  // resolve-platform.sh never sees: a repo whose .env said ACCESS_TRACKER=manual
  // would make this CLI defer while the resolver reported `full` and printed no
  // restriction notice, and a typo in that file would make every one of the six
  // pipeline steps that call this CLI exit 2 with no indication of where the
  // value came from. The resolver owns this key; the dot-env file does not.
  //
  // BOTH names, because the resolver reads both: `ACCESS_TRACKER` is
  // resolve-platform.sh's output and `AGENT_SKILLS_ACCESS_TRACKER` is the knob
  // an operator sets. Capturing only the first made the shared resolver blind to
  // the operator knob no matter how many tiers it grew.
  //
  // SKILLS_CONFIG_FILE is captured here for the same reason and it is the whole
  // of C5-CR1: the config tier reads that variable to find the file, so a .env
  // line setting it would redirect the config path AFTER this snapshot and walk
  // straight around it. Capturing the mode but not the path to the mode leaves
  // the door the snapshot exists to shut.
  const accessEnv = {
    ACCESS_TRACKER: process.env.ACCESS_TRACKER,
    AGENT_SKILLS_ACCESS_TRACKER: process.env.AGENT_SKILLS_ACCESS_TRACKER,
    SKILLS_CONFIG_FILE: process.env.SKILLS_CONFIG_FILE,
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
    if (args.json) output.emit({ ...payload, stage: args.stage, exitCode });
    return { exitCode, ...payload };
  };

  // Surfaced when a board read returns errors for SOME board but usable nodes
  // for others — a warning, because the card we care about may still be movable.
  const onWarn = (m) =>
    output.warn(
      `⚠️  board read reported errors (continuing with what resolved): ${m}`,
    );

  // --probe-board reads a board; every other mode moves one card on it.
  // Hoisted out of the non-probe branch: EVERY path that reaches the network
  // interpolates --issue straight into the GraphQL document, and --probe-board
  // is no exception. Validating it only on the move path left the probe able to
  // inject arbitrary text into the query.
  if (args.issue && !/^\d+$/.test(String(args.issue).trim())) {
    output.err(`Error: --issue must be a number, got "${args.issue}"`);
    return { exitCode: 2 };
  }

  // --init-workflow is a probe that writes; --check is a probe that grades.
  // Both reuse the probe path wholesale rather than re-reading the board, so
  // neither can disagree with what --probe-board reports.
  if (args.initWorkflow) {
    args.probeBoard = true;
    args.writeLadder = true;
  }
  if (args.check) args.probeBoard = true;

  if (!args.probeBoard) {
    // --print-plan needs no issue: it reads a config file, not a board. It still
    // needs --stage, because the stage IS the question it answers.
    if ((!args.issue && !args.printPlan) || !args.stage) {
      output.err(
        args.printPlan
          ? "Error: --stage is required"
          : "Error: --issue and --stage are both required",
      );
      output.err(USAGE);
      return { exitCode: 2 };
    }
    if (!tw.MOMENTS.includes(String(args.stage).toLowerCase())) {
      output.err(
        `Error: unknown moment "${args.stage}". Known: ${tw.MOMENTS.join(", ")}`,
      );
      return { exitCode: 2 };
    }
    args.stage = String(args.stage).toLowerCase();
  }

  // The ladder is read before credentials are even looked at, because
  // --print-plan must work without them — that is the entire point of it. Never
  // throws: a missing or malformed file resolves to the built-in default ladder.
  const workflow = tw.loadWorkflow(repoRoot ? { repoRoot } : {});

  // --print-plan: resolve and print, no credentials, no network, exit 0.
  //
  // This is the GitHub half of the pair jira-stage.js has had since task.38, and
  // it must run BEFORE `ghAvailable` (the first credential read and the first
  // out-of-process call) for the same reason its sibling runs before `getAuth`:
  // the consumer who needs it MOST is the one with no credentials at all. A
  // `manual`-mode run has no `gh` auth by definition, and its handover checklist
  // still has to name the board's real column — "move the card somewhere" is not
  // an instruction anyone can follow.
  //
  // --dry-run is NOT a substitute and never was: it sits below `ghAvailable` and
  // reads a live board. That is also why every deferred record this CLI writes
  // now carries a --print-plan `verify.cmd` rather than a --dry-run one.
  //
  // `output.emit` writes unconditionally rather than only under --json, which is
  // what makes the flag machine-readable on its own — same contract as Jira's.
  //
  // GitHub has NO transition graph. A Projects v2 Status is a single-select
  // field: you set it, you do not walk to it. So there is no `hops`/`spansFrom`
  // pair here and no --from flag to feed one. The plan is the target rung, and
  // the rung carries every acceptable name so a caller can prefer its own.
  if (args.printPlan) {
    // Validated HERE, on this path's own terms — not inherited from the
    // `if (!args.probeBoard)` block above.
    //
    // That block is skipped whenever `probeBoard` is set, and three flags set it:
    // `--probe-board` directly, plus `--check` and `--init-workflow` which set it
    // internally. `--check` is the documented CI mode, so
    // `gh-stage.js --check --stage done --print-plan` is an ordinary script and
    // used to bypass both the MOMENTS check and the lowercasing.
    //
    // The consequence was not cosmetic: an unknown moment resolved to
    // `enabled: false, targets: null` exit 0 — byte-identical to the payload a
    // DELIBERATELY DISABLED moment produces. A caller could not tell a typo from
    // a moment the consumer had switched off, so a typo silently dropped a board
    // move from a manual checklist. That is the failure this whole mode exists to
    // prevent, so it is validated even though the shared block usually would.
    //
    // Sharing one gate was the mistake: --print-plan and the move path have
    // genuinely different argument requirements (this one needs no --issue), so
    // the requirements are stated separately rather than approximated by one
    // condition that has to be true of both.
    if (!tw.MOMENTS.includes(String(args.stage).toLowerCase())) {
      output.err(
        `Error: unknown moment "${args.stage}". Known: ${tw.MOMENTS.join(", ")}`,
      );
      return { exitCode: 2 };
    }
    args.stage = String(args.stage).toLowerCase();

    const moment = tw.resolveMoment(args.stage, workflow, {
      issueType: args.issueType,
    });
    const authored = tw.pipelineAuthoredFor(
      workflow,
      args.issueType,
      args.stage,
    );
    output.emit({
      stage: args.stage,
      reason: "plan",
      // A moment absent from `pipeline:` is deliberate disablement, not an
      // error — the same outcome `stage-disabled` reports on the move path.
      enabled: !!moment,
      targets: moment ? moment.targets : null,
      offLadder: moment ? moment.offLadder : null,
      isLastRung: moment ? moment.isLastRung : null,
      // Where this plan actually came from — which is not the same question as
      // "does a file exist". A statuses-only or malformed file is `source:
      // "file"` while contributing nothing to the plan, and this is the one
      // field a reader consults to answer "did my ladder do this?".
      source: authored ? workflow.source : "record",
      authored,
      exitCode: 0,
    });
    return {
      exitCode: 0,
      reason: "plan",
      targets: moment ? moment.targets : null,
    };
  }

  // --check is the ONE mode in this family that exits non-zero on failure.
  //
  // Every other entry point exits 0 on every documented skip, because pipeline
  // steps run inside shells where a non-zero exit would kill the run. --check
  // does not run inside a pipeline step — it runs in CI, where a green exit on a
  // broken file IS the failure. Do not "harmonise" this. (There is a test
  // asserting the non-zero exit; if you are here because that test failed, the
  // test is right.)
  //
  // The schema half runs here, before any network or credential concern, so
  // `--offline` genuinely issues no board call rather than making one and
  // ignoring it.
  let checkWarnings = 0;
  if (args.check) {
    const off = checkWorkflowOffline({ workflow, args, output });
    if (off.done) return off.result;
    checkWarnings = off.warnings;
  }

  // ── ACCESS GATE ───────────────────────────────────────────────────────────
  //
  // Under any non-`full` tracker access mode this CLI must not touch the board.
  // It records the field-set it wanted, exits 0 with `reason: "deferred"`, and
  // the run-end handover names the card and its target column.
  //
  // PLACEMENT IS THE WHOLE POINT. Everything above this line is local: arg
  // parsing, the workflow YAML, and the offline half of --check. Everything
  // below reaches out — `ghAvailable` shells `gh auth status`, which is both the
  // first credential read and the first out-of-process call. The gate sits
  // exactly between them, so a gated run demonstrably attempts no network call.
  //
  // `--probe-board` (and therefore `--check` and `--init-workflow`, which set
  // it) are NOT gated: they read a board, they do not mutate one, and every
  // non-`full` mode still permits reads. `--dry-run` is exempt for the same
  // reason. Gating them would break `scaffold-tracker-workflow` for exactly the
  // consumers who most need to see their board's real columns.
  //
  // The comparison is `!== "full"`, never truthiness or emptiness: an UNSET
  // variable must read as `full`, because this CLI is invoked from seven skills
  // and six pipeline steps and a gate that misfires stops every one of them
  // moving cards.
  let access;
  try {
    // `root` is the repo root computed above, before loadDotEnv — the same
    // anchor read-config.sh uses when a shell sources it from the root (C5-CR6).
    access = dm.resolveAccessTracker(accessEnv, { cwd: root || process.cwd() });
  } catch (e) {
    output.err(`Error: ${e.message}`);
    return { exitCode: 2 };
  }
  if (access !== "full" && !args.probeBoard && !args.dryRun) {
    const moment = tw.resolveMoment(args.stage, workflow, {
      issueType: args.issueType,
    });
    if (!moment) {
      // A moment omitted from `pipeline:` is deliberate disablement — there was
      // never a mutation to defer. Report it as an unrestricted run would.
      output.info(
        `⏭️  Moment ${args.stage} is not declared in the workflow — nothing to do.`,
      );
      return emit({ transitioned: false, reason: "stage-disabled" }, 0);
    }
    const target = (moment.targets && moment.targets[0]) || null;
    const gateProjectYml = readProjectYml(root);
    const issueUrl = `https://github.com/${gateProjectYml.owner || "OWNER"}/${
      gateProjectYml.repo || "REPO"
    }/issues/${args.issue}`;
    const field = args.field || resolveStatusFieldName(root);
    try {
      const rec = dm.defer(
        {
          kind: "github.board.field-set",
          system: "github",
          access,
          // Name the board ADD as well as the field-set when --add-to-board was
          // passed. Without this the checklist tells a human to set a field on
          // an item that may not be on the board at all — `ensureOnBoard` is
          // what would have put it there, and this gate returns before it runs.
          // The gate is upstream of the board read, so we cannot know whether
          // the item is already there; say "add if absent" rather than assert
          // either way.
          intent: args.addToBoard
            ? `Add issue #${args.issue} to the project board if absent, then set ` +
              `${field} to ${target || `the ${args.stage} column`}`
            : `Set ${field} to ${target || `the ${args.stage} column`} on issue #${args.issue}`,
          target: {
            issue: String(args.issue),
            url: issueUrl,
            // The object and the place you perform the action differ for a board
            // field: the issue lives in the repo, the field lives on the board.
            ui_url: "the project board → filter to this issue → set the field",
          },
          desired: args.addToBoard
            ? { onBoard: true, [field]: target }
            : { [field]: target },
          skill: "gh-stage",
          step: args.stage,
          run: process.env.PIPELINE_RUN || "",
          manual: {
            deepLink: issueUrl,
            ui: args.addToBoard
              ? `Open the project board → add issue #${args.issue} if it is not ` +
                `already there → set ${field}`
              : `Open the project board → find issue #${args.issue} → set ${field}`,
            fields: [{ name: field, value: target || "" }],
          },
          command: {
            argv: [
              "node",
              "gh-stage.js",
              "--issue",
              String(args.issue),
              "--stage",
              args.stage,
              // Preserve --add-to-board on the replay command. Dropping it made
              // the recorded command a DIFFERENT operation from the deferred
              // one: it would set the field and never add the item, so replaying
              // a manual run's journal left the card off the board.
              ...(args.addToBoard ? ["--add-to-board"] : []),
              "--json",
            ],
            stdin: null,
          },
          verify: {
            // --print-plan, NOT --dry-run. This record is written on a machine
            // running a non-`full` access mode, which in the `manual` case has
            // no `gh` auth at all — and --dry-run sits below `ghAvailable`, so
            // it cannot run there. Handing the operator a verification step that
            // fails on their own machine is worse than handing them none: it
            // reads as "the deferral is broken" rather than "here is the column".
            //
            // The two do not answer quite the same question — --print-plan reads
            // the ladder, --dry-run reads the board — so `expect` names the whole
            // rung, which is what --print-plan returns.
            cmd: `gh-stage.js --stage ${args.stage} --print-plan`,
            expect: `targets includes "${target || args.stage}" (set ${field} to it)`,
          },
          // The repo root, not process.cwd(). A step invoked from a subdirectory
          // would otherwise append to <subdir>/.claude/state/tracker-actions.jsonl
          // while the renderer reads the repo-root journal and reports it empty,
          // losing the deferred action with no warning.
        },
        { cwd: root },
      );
      output.info(
        `⏸️  access.tracker=${access} — not moving issue #${args.issue}; recorded as ${rec.id}.`,
      );
      return emit(
        {
          transitioned: false,
          reason: "deferred",
          access,
          target,
          record: rec.id,
        },
        0,
      );
    } catch (e) {
      // A journal we cannot write is a real problem, but it is not a reason to
      // fall through and perform the very mutation the mode forbids.
      output.warn(`⚠️  Could not record the deferred board move: ${e.message}`);
      return emit({ transitioned: false, reason: "deferred", access }, 0);
    }
  }

  const statusField = args.field || resolveStatusFieldName(root);
  const projectYml = readProjectYml(root);
  // Kept SEPARATE from args.board. Folding `--board` into this made the second
  // precedence tier in selectBoard dead whenever --board was given, and hid the
  // fail-closed behaviour behind a duplicate value.
  const configuredBoard = resolveConfiguredBoard(root);

  const exec = makeExec(execImpl);

  // `gh` missing or unauthenticated is a dead end, not a handoff — there is no
  // second transport. One warning, exit 0, and the message must not imply a
  // fallback exists.
  if (!ghAvailable(exec)) {
    // --check exits 0 here ON PURPOSE, and it is the one place the inverted exit
    // code does NOT apply. A fork's PR cannot hold the repo secret, so failing on
    // a missing credential would penalise exactly the contributors least able to
    // fix it. The schema half has already run and passed by this point; only the
    // board comparison is being skipped. `--check --offline` is the way to assert
    // the half that never needs credentials.
    if (args.check) {
      output.info(
        "⏭️  gh is unavailable or not authenticated — skipping the board half of " +
          "--check and exiting 0. The schema half passed. Use `--check --offline` " +
          "to assert only that half deliberately.",
      );
      const payload = {
        reason: "no-credentials",
        checked: true,
        errors: 0,
        warnings: checkWarnings,
      };
      if (args.json) output.emit({ ...payload, exitCode: 0 });
      return { exitCode: 0, ...payload };
    }
    output.info(
      "ℹ️  gh is unavailable or not authenticated — no board change attempted.",
    );
    return emit({ transitioned: false, reason: "no-credentials" }, 0);
  }

  const owner = projectYml.owner || repoContext(exec, "owner");
  const repo = projectYml.repo || repoContext(exec, "name");
  if (!owner || !repo) {
    output.warn("⚠️  Could not resolve repo context — skipping board update.");
    return emit({ transitioned: false, reason: "no-repo-context" }, 0);
  }

  if (args.probeBoard)
    return probeBoard({
      exec,
      owner,
      repo,
      statusField,
      workflow,
      args,
      output,
      emit,
      root,
      projectYml,
      configuredBoard,
      onWarn,
      checkWarnings,
    });

  // Omission from `pipeline:` is the only way to switch a moment off, so a null
  // here is deliberate disablement — never a reason to fall back to a default.
  const moment = tw.resolveMoment(args.stage, workflow, {
    issueType: args.issueType,
  });
  if (!moment) {
    output.info(
      `⏭️  Moment ${args.stage} is not declared in the workflow — nothing to do.`,
    );
    return emit({ transitioned: false, reason: "stage-disabled" }, 0);
  }

  // `item-add` takes a board NUMBER. A title cannot be turned into one from
  // anything this CLI reads: the only read it performs is issue-scoped
  // (`repository.issue.projectItems`), which by definition lists boards the issue
  // is ALREADY on — so resolving a title against it can only ever "add" the issue
  // to a board it is already on, which is the one case where the add is a no-op.
  // Mapping a title to a number properly needs the OWNER's project list, a
  // different API surface this task does not take on.
  //
  // So the honest contract is: --add-to-board needs a numeric hint. Say so, and
  // skip the add rather than performing a useless one or guessing another board.
  const addBoardNum = boardHintNumber(args.board, configuredBoard, projectYml);

  if (args.addToBoard && !args.dryRun && !addBoardNum) {
    output.warn(
      "⚠️  --add-to-board needs a board NUMBER and none was resolved — skipping the add. " +
        (args.board
          ? `"${args.board}" looks like a title; a title cannot be resolved to a board number ` +
            "from an issue-scoped read. "
          : "") +
        "Pass --board <number>, or set github.projectBoard / project.yml's project_board_number.",
    );
  }

  let items;
  try {
    items =
      args.addToBoard && !args.dryRun && addBoardNum
        ? ensureOnBoard({
            exec,
            owner,
            repo,
            issue: args.issue,
            statusField,
            boardNum: addBoardNum,
            sleepMs: sleepImpl,
          })
        : readBoard({
            exec,
            owner,
            repo,
            issue: args.issue,
            statusField,
            onWarn,
          });
  } catch (e) {
    output.warn(`⚠️  Could not read the board: ${e.message}`);
    return emit({ transitioned: false, reason: "board-unreadable" }, 0);
  }

  // --dry-run must not run item-add. This is the one place a naive port of
  // jira-stage.js is unsafe: the Jira dry-run is GET-only because that whole
  // flow is GET-then-POST, but step-0's GitHub block runs `gh project item-add`
  // BEFORE its read query. Announce the intent instead of performing it.
  if (args.dryRun && args.addToBoard) {
    output.info(
      `🔎 would add issue #${args.issue} to board ${addBoardNum || "(unresolved)"} (skipped: --dry-run)`,
    );
  }

  const picked = selectBoard(items, {
    board: args.board,
    configured: configuredBoard,
    projectYml,
    partial: !!items.partial,
  });

  if (!picked.item) {
    if (picked.reason === "ambiguous-board") {
      output.warn(
        picked.unmatchedHint
          ? `⚠️  ${picked.unmatchedRule} names "${picked.unmatchedHint}", which is not among the ` +
              `boards read for issue #${args.issue} — not guessing. Candidates: ${picked.candidates.join(", ")}`
          : `⚠️  issue #${args.issue} is on ${items.length} boards and none was selected — ` +
              `pass --board, or set github.projectBoard. Candidates: ${picked.candidates.join(", ")}`,
      );
      // The likeliest innocent explanation, and one the candidate list actively
      // hides: the named board is missing precisely because it could not be read.
      if (picked.partialRead)
        output.warn(
          "    NOTE: that read returned errors for at least one board, so the one you named " +
            "may exist but be unreadable with this token rather than be absent.",
        );
      return emit(
        {
          transitioned: false,
          reason: "ambiguous-board",
          candidates: picked.candidates,
          unmatchedHint: picked.unmatchedHint || null,
          unmatchedRule: picked.unmatchedRule || null,
          // Emitted so a --json consumer sees it too; output.warn is suppressed
          // under --json, which is the mode the pipelines use.
          partialRead: !!picked.partialRead,
        },
        args.strict ? 1 : 0,
      );
    }
    output.warn(
      `⚠️  issue #${args.issue} is not on any project board — nothing to move.`,
    );
    return emit(
      { transitioned: false, reason: "not-on-board" },
      args.strict ? 1 : 0,
    );
  }

  const item = picked.item;
  const label = `#${args.issue} [board "${item.projectTitle}"]`;

  if (!item.statusFieldId) {
    output.warn(
      `⚠️  board "${item.projectTitle}" has no "${statusField}" single-select field — skipping.`,
    );
    return emit(
      {
        transitioned: false,
        reason: "no-status-field",
        board: item.projectTitle,
      },
      args.strict ? 1 : 0,
    );
  }

  const r = resolveOption(item.options, moment.targets, item.current);

  if (r.reason === "already") {
    output.info(`✅ ${label} is already "${item.current}".`);
    return emit(
      { transitioned: false, reason: "already", from: item.current },
      0,
    );
  }

  if (!r.match) {
    const offered = item.options.map((o) => o.name).join(", ") || "(none)";
    // Deliberately NOT the Jira wording. On Jira "no transition from here" is
    // frequently correct; here it can only mean the field has no such option at
    // all, which is always a configuration error.
    output.warn(
      `⚠️  no option matching [${moment.targets.join(", ")}] on board ` +
        `"${item.projectTitle}" — board offers: ${offered}`,
    );
    for (const h of describeAlternatives(
      item.options,
      args.stage,
      workflow,
      args.issueType,
    ))
      output.warn(`   ↪ ${h}`);
    return emit(
      {
        transitioned: false,
        reason: "no-option",
        targets: moment.targets,
        offered: item.options.map((o) => o.name),
      },
      args.strict ? 1 : 0,
    );
  }

  // The guard. Ranks come from the ladder — which is exactly why the ladder
  // matters on a tracker with no transition graph: without a declared order
  // rankOf returns null for every bespoke column and the guard is inert.
  // Unranked either side → no opinion, allow (same semantics as the Jira
  // monotonicity guard at jira-sync.js:2933-2957).
  const curRank = tw.rankOf(item.current, workflow, {
    issueType: args.issueType,
  });
  const tgtRank = tw.rankOf(r.match.name, workflow, {
    issueType: args.issueType,
  });
  if (
    !args.allowRegress &&
    curRank != null &&
    tgtRank != null &&
    curRank > tgtRank
  ) {
    output.info(
      `⏭️  ${label} is already at "${item.current}" (rank ${curRank}), past ` +
        `"${r.match.name}" (rank ${tgtRank}) — not moving it backwards.`,
    );
    return emit(
      {
        transitioned: false,
        reason: "would-regress",
        from: item.current,
        to: r.match.name,
        currentRank: curRank,
        targetRank: tgtRank,
      },
      0,
    );
  }

  if (args.dryRun) {
    output.info(
      `🔎 ${label} @ "${item.current || "(unset)"}" — moment ${args.stage}: ` +
        `would set "${r.match.name}" (via ${r.rule})`,
    );
    return emit(
      {
        transitioned: false,
        reason: "dry-run",
        would: r.match.name,
        from: item.current,
        board: item.projectTitle,
      },
      0,
    );
  }

  try {
    setOption({ exec, item, optionId: r.match.id, sleepMs: sleepImpl });
  } catch (e) {
    output.warn(`⚠️  Could not set ${statusField} on ${label}: ${e.message}`);
    return emit(
      { transitioned: false, reason: "mutation-failed", detail: e.message },
      args.strict ? 1 : 0,
    );
  }

  // Re-read and report the option that actually landed, rather than the one we
  // asked for. A silent no-op mutation is otherwise indistinguishable from a
  // successful one.
  // Re-read to confirm the option that actually landed.
  //
  // The re-read is CONFIRMATION, not the source of truth. It is issued with no
  // propagation delay — unlike ensureOnBoard, which deliberately sleeps for the
  // same API — so a stale read returns the PREVIOUS status. Believing it would
  // make a successful move report the old column, which is the exact inverse of
  // the silent-no-op detection this exists for. So: trust it only when it agrees
  // with what we asked for; otherwise keep the requested name and say the
  // confirmation did not come back.
  // `observed` has THREE meanings and they must stay distinguishable:
  //   null  — the verify read did not happen or the item was absent from it.
  //           We know nothing about the board's current state.
  //   ""    — the read succeeded and the column is genuinely unset.
  //   "X"   — the read succeeded and the column shows X.
  //
  // Collapsing the first two lets the CLI assert the board "shows (unset)" when
  // it never managed to look, which is the same conflation the observed value was
  // introduced to remove, one level down.
  let landed = r.match.name;
  let verified = false;
  let observed = null;
  let verifyError = null;
  try {
    const after = readBoard({
      exec,
      owner,
      repo,
      issue: args.issue,
      statusField,
    });
    const same = after.find((i) => i.itemId === item.itemId);
    if (same) observed = same.current || "";
    else verifyError = "the item was not in the verify read";
    if (observed && tw.eqName(observed, r.match.name)) {
      landed = observed;
      verified = true;
    }
  } catch (e) {
    verifyError = (e && e.message) || "verify read failed";
  }

  if (verified) {
    output.info(`✅ ${label} → "${landed}".`);
  } else if (observed === null) {
    // Say only what is true: the move was issued, and we could not check it.
    output.warn(
      `⚠️  ${label} → "${landed}" requested, but it could not be confirmed ` +
        `(${verifyError}). The change may well have applied.`,
    );
  } else {
    output.warn(
      `⚠️  ${label} → "${landed}" requested, but the verify read shows ` +
        `"${observed || "(unset)"}" — either propagation lag or the change did not stick.`,
    );
  }
  return emit(
    {
      transitioned: true,
      reason: "transitioned",
      from: item.current,
      to: landed,
      verified,
      observed,
      verifyError,
      board: item.projectTitle,
      rule: r.rule,
    },
    0,
  );
}

function repoContext(exec, field) {
  try {
    return String(
      exec([
        "repo",
        "view",
        "--json",
        field,
        "-q",
        `.${field}${field === "owner" ? ".login" : ""}`,
      ]),
    ).trim();
  } catch (_) {
    return "";
  }
}

/**
 * The board NUMBER to hand `gh project item-add`, or "" when it cannot be known.
 *
 * `item-add` takes a number, but a board hint may legitimately be a TITLE — both
 * `--board 12` and `--board "Team Sprint"` are accepted by selectBoard, which
 * matches on either. Silently substituting `project.yml`'s number for an
 * unresolvable title used to add the issue to one board while the status was
 * written to another.
 *
 * So a hint that is SET but is not a number yields "" — meaning "no add" — and
 * never another board's number. Resolving a title properly would need the
 * owner's project list; an issue-scoped read cannot do it, because it only lists
 * boards the issue is already on.
 */
function boardHintNumber(board, configured, projectYml) {
  const yml = projectYml || {};
  const resolve = (hint) => {
    if (!hint) return null; // absent — try the next source
    const h = String(hint).trim();
    if (/^\d+$/.test(h)) return h;
    // Set but not a number: "" (no add), never a fallback to another board.
    return "";
  };
  for (const hint of [board, configured, yml.boardNumber, yml.boardName]) {
    const r = resolve(hint);
    if (r !== null) return r;
  }
  return "";
}

// ---------------------------------------------------------------------------
// --probe-board
// ---------------------------------------------------------------------------
/**
 * Read-only board enumeration, mirroring probeWorkflow's three-verdict shape
 * (`disabled` / `→ "X"` / `skip (no-option)`) so the two outputs read side by
 * side.
 *
 * The ergonomic win over Jira lives here: a Projects board's option order IS its
 * workflow order, so --write-ladder can simply read it. Jira needs statusRank
 * hand-authored because a workflow graph has no inherent order; a single-select
 * field is a list, and the team already put it in the order work flows.
 */
function probeBoard({
  exec,
  owner,
  repo,
  statusField,
  workflow,
  args,
  output,
  emit,
  root,
  projectYml,
  configuredBoard,
  onWarn,
  checkWarnings = 0,
}) {
  // Probing needs an issue only as a handle to reach the board through. Any
  // issue on the board answers the question "what are this board's columns?".
  const issue = args.issue || "";
  if (!issue) {
    const need = args.check
      ? "--check needs --issue <N> (any issue already on the board) to read it. " +
        "Use --check --offline to validate the file without a board."
      : args.initWorkflow
        ? "--init-workflow needs --issue <N> (any issue already on the board)"
        : "--probe-board needs --issue <N> (any issue already on the board)";
    output.err(`Error: ${need}`);
    return { exitCode: 2 };
  }

  let items;
  try {
    items = readBoard({ exec, owner, repo, issue, statusField, onWarn });
  } catch (e) {
    output.warn(`⚠️  Could not read the board: ${e.message}`);
    return emit({ reason: "board-unreadable" }, 0);
  }

  const picked = selectBoard(items, {
    board: args.board,
    configured: configuredBoard,
    projectYml,
    partial: !!items.partial,
  });
  if (!picked.item) {
    // Mirrors run()'s reporting. Kept in step deliberately: an unmatched hint can
    // now yield ambiguous-board with a SINGLE board, so the old "you are on
    // several boards — pass --board" line would tell an operator two things that
    // are both false, while they are staring at the one board they did name.
    if (picked.reason !== "ambiguous-board") {
      output.warn(`⚠️  issue #${issue} is not on any project board.`);
    } else if (picked.unmatchedHint) {
      output.warn(
        `⚠️  ${picked.unmatchedRule} names "${picked.unmatchedHint}", which is not among the ` +
          `boards read for issue #${issue}. Candidates: ${picked.candidates.join(", ")}`,
      );
      if (picked.partialRead)
        output.warn(
          "    NOTE: that read returned errors for at least one board, so the one you named " +
            "may exist but be unreadable with this token rather than be absent.",
        );
    } else {
      output.warn(
        `⚠️  issue #${issue} is on ${items.length} boards — pass --board. ` +
          `Candidates: ${picked.candidates.join(", ")}`,
      );
    }
    return emit(
      {
        reason: picked.reason,
        candidates: picked.candidates,
        unmatchedHint: picked.unmatchedHint || null,
        unmatchedRule: picked.unmatchedRule || null,
        partialRead: !!picked.partialRead,
      },
      0,
    );
  }

  const item = picked.item;
  const optionNames = item.options.map((o) => o.name);

  output.info(`Board "${item.projectTitle}" (#${item.projectNumber})`);
  output.info(
    `${statusField} options, in board order: ${optionNames.join(" → ") || "(none)"}`,
  );
  output.info("");

  const moments = {};
  for (const m of tw.MOMENTS) {
    const spec = tw.resolveMoment(m, workflow, { issueType: args.issueType });
    if (!spec) {
      moments[m] = { verdict: "disabled" };
      output.info(`  ${m.padEnd(18)} disabled`);
      continue;
    }
    const r = resolveOption(item.options, spec.targets, "");
    if (r.match) {
      moments[m] = { verdict: "resolved", option: r.match.name };
      output.info(`  ${m.padEnd(18)} → "${r.match.name}"`);
    } else {
      moments[m] = { verdict: "no-option", targets: spec.targets };
      output.info(
        `  ${m.padEnd(18)} skip (no-option) — wanted [${spec.targets.join(", ")}]`,
      );
    }
  }

  // --check grades the probe it just ran and returns its own exit code. It must
  // come before the ladder write: a --check run never writes anything.
  if (args.check)
    return checkDrift({
      moments,
      optionNames,
      boardTitle: item.projectTitle,
      warnings: checkWarnings,
      args,
      output,
    });

  let ladderWritten = null;
  if (args.writeLadder)
    ladderWritten = writeLadder({
      root,
      optionNames,
      output,
      dryRun: args.dryRun,
      force: args.force,
      // Only --init-workflow asks for the full file. Bare --write-ladder keeps
      // writing a statuses-only ladder, exactly as it always has.
      moments: args.initWorkflow ? moments : null,
    });

  const payload = {
    reason: "probe",
    board: item.projectTitle,
    boardNumber: item.projectNumber,
    statusField,
    options: optionNames,
    moments,
    ladderWritten,
  };
  if (args.json) output.emit({ ...payload, exitCode: 0 });
  return { exitCode: 0, ...payload };
}

/**
 * Write a `statuses:` ladder derived from the board's own option order.
 *
 * Preserve an existing ladder verbatim; never overwrite silently. This mirrors
 * buildWorkflowRecord's preserve-hand-authored-intent discipline
 * (jira-sync.js:3744, whose `...(existing.X ? { X: existing.X } : {})` spreads at
 * :3771-3781 do the same job) — a hand-authored ladder encodes intent a board
 * read cannot recover.
 */
function writeLadder({
  root,
  optionNames,
  output,
  dryRun = false,
  // --init-workflow adds these two. Defaulted so the --write-ladder call site is
  // byte-for-byte unchanged: same guard, same body, same return shape.
  force = false,
  moments = null,
}) {
  const target = path.join(root, tw.DEFAULT_WORKFLOW_PATH);
  if (fs.existsSync(target) && !force) {
    output.warn(
      `⚠️  ${tw.DEFAULT_WORKFLOW_PATH} already exists — leaving it untouched. ` +
        (moments
          ? "Pass --force to overwrite it."
          : "Delete it first if you want the board's order written fresh."),
    );
    return { written: false, reason: "exists", path: target };
  }
  if (!optionNames.length) {
    output.warn("⚠️  board offered no options — nothing to write.");
    return { written: false, reason: "no-options", path: target };
  }
  const body = moments
    ? renderWorkflowFile(optionNames, moments)
    : "# Generated by `gh-stage --probe-board --write-ladder`.\n" +
      "# A Projects board's option order IS its workflow order, so this ladder is\n" +
      "# the board's own Status options, read in board order. Edit freely — this\n" +
      "# file is never overwritten once it exists.\n" +
      "statuses:\n" +
      optionNames.map((n) => `  - ${JSON.stringify(n)}`).join("\n") +
      "\n";
  // --dry-run is a no-write contract for the whole CLI, not just for the board.
  // A filesystem write is still a write, and a caller checking "did --dry-run
  // touch anything" would have been wrong about this one.
  if (dryRun) {
    output.info(
      `🔎 would write ${tw.DEFAULT_WORKFLOW_PATH} with ${optionNames.length} rungs ` +
        `(skipped: --dry-run):\n${body.replace(/^/gm, "   ")}`,
    );
    return {
      written: false,
      reason: "dry-run",
      path: target,
      statuses: optionNames,
    };
  }
  try {
    fs.writeFileSync(target, body);
    // Drop tracker-workflow.js's parse cache. This run already called
    // loadWorkflow() — before the file existed — so the built-in default is
    // memoised under this exact path. Without the clear, anything that probes,
    // writes and then reads (this process, or a caller chaining --write-ladder
    // into a real move) sees the pre-write ladder forever, which is the cache's
    // own documented failure mode at tracker-workflow.js:392-393.
    tw.clearWorkflowCache();
    output.info(
      `✅ wrote ${tw.DEFAULT_WORKFLOW_PATH} with ${optionNames.length} rungs.`,
    );
    return { written: true, path: target, statuses: optionNames };
  } catch (e) {
    output.warn(
      `⚠️  Could not write ${tw.DEFAULT_WORKFLOW_PATH}: ${e.message}`,
    );
    return { written: false, reason: "write-failed", path: target };
  }
}

/**
 * `--check` — validate tracker-workflow.yaml, exiting NON-ZERO on failure.
 *
 * Two tiers, because they fail for different reasons and CI wants different
 * things from them:
 *
 *   --offline   schema self-consistency only. No network, no credentials, no
 *               board read. This is what most consumer CI should run: it is the
 *               half that can never flake, and it catches the typo class
 *               (unknown moment, duplicate rung, flow sequence).
 *   (default)   the above, plus a live board read: every status an enabled
 *               moment names must actually exist as an option, and the file's
 *               board must be the board this repo points at. This is the half
 *               that catches a RENAMED COLUMN, which is the most common way a
 *               working setup breaks and the one that breaks silently.
 *
 * Missing credentials exit 0 with a loud skip, deliberately: a fork's PR cannot
 * have the secret, and failing it on that basis would make the check hostile to
 * exactly the contributors least able to fix it.
 */
function checkWorkflowOffline({ workflow, args, output }) {
  const findings = tw.validateWorkflow(workflow) || [];
  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");

  for (const f of findings) {
    const tag = f.level === "error" ? "❌" : f.level === "warn" ? "⚠️ " : "ℹ️ ";
    output.info(`${tag} ${f.message}`);
  }

  if (workflow.source !== "file") {
    output.info(
      `ℹ️  No ${tw.DEFAULT_WORKFLOW_PATH} — using the built-in default ladder. ` +
        "Nothing to check. Generate one with `gh-stage --init-workflow`.",
    );
    const payload = {
      reason: "no-file",
      checked: false,
      errors: 0,
      warnings: 0,
    };
    if (args.json) output.emit({ ...payload, exitCode: 0 });
    return { done: true, result: { exitCode: 0, ...payload } };
  }

  // Fail now if the schema half found anything — a file that does not parse
  // cleanly cannot be meaningfully compared against a board.
  if (errors.length || args.offline) {
    const payload = {
      reason: errors.length ? "invalid" : "ok-offline",
      checked: true,
      offline: !!args.offline,
      errors: errors.length,
      warnings: warns.length,
      messages: findings.map((f) => `${f.level}: ${f.message}`),
    };
    const code = errors.length ? 1 : 0;
    if (args.json) output.emit({ ...payload, exitCode: code });
    else if (!errors.length)
      output.info("✅ tracker-workflow.yaml is self-consistent.");
    return { done: true, result: { exitCode: code, ...payload } };
  }

  // Schema half passed and the caller wants the board half too. The board read
  // is not duplicated here — run() continues into the ordinary probe path, which
  // already owns every piece of that plumbing, and `checkDrift` below grades its
  // result. Duplicating it was the first draft, and it re-derived owner/repo,
  // board selection and option matching in a second place that could disagree.
  return { done: false, warnings: warns.length };
}

/**
 * Grade a completed probe for drift. The board half of `--check`.
 *
 * A renamed column is the failure this exists for: the file still parses, every
 * moment still names a status, and nothing moves. It is invisible until someone
 * notices cards sitting still.
 */
function checkDrift({
  moments,
  optionNames,
  boardTitle,
  warnings,
  args,
  output,
}) {
  const drift = [];
  for (const [m, spec] of Object.entries(moments)) {
    if (spec.verdict === "no-option") {
      drift.push({
        moment: m,
        wanted: spec.targets,
        message:
          `\`${m}\` targets [${spec.targets.join(", ")}], which no column on ` +
          `"${boardTitle}" matches. Board columns: ${optionNames.join(" → ")}`,
      });
    }
  }

  for (const d of drift) output.err(`❌ ${d.message}`);

  if (drift.length) {
    output.err("");
    output.err("Fix it by regenerating the file from the live board:");
    output.err("  gh-stage --init-workflow --force");
    output.err(
      "…or edit the named statuses by hand to match the columns above.",
    );
  } else {
    output.info(
      `✅ tracker-workflow.yaml matches "${boardTitle}" — every enabled moment ` +
        "resolves to a real column.",
    );
  }

  const payload = {
    reason: drift.length ? "drift" : "ok",
    checked: true,
    board: boardTitle,
    options: optionNames,
    errors: drift.length,
    warnings: warnings || 0,
    drift,
  };
  const code = drift.length ? 1 : 0;
  if (args.json) output.emit({ ...payload, exitCode: code });
  return { exitCode: code, ...payload };
}

/**
 * Render a complete tracker-workflow.yaml from a live board read.
 *
 * `moments` is the probe's own moment→option map, so what this file says a
 * moment targets is exactly what the probe just reported it resolving to. A
 * moment that resolved to nothing is emitted COMMENTED OUT rather than omitted
 * silently: the author needs to see that the moment exists and that their board
 * has no column for it, which a missing line does not convey.
 *
 * Nothing here is inferred beyond the board read. `documentStatus:` maps the
 * lifecycle onto first/middle/last rungs, which is a guess — it is labelled as
 * one in the file it writes.
 */
// Why a moment came out commented, keyed on the moment. The two opt-in ones sit
// side by side here on purpose: both are off by DEFAULT rather than missing from
// the board, and a reader comparing them should not have to reconstruct that
// from a nested ternary.
const UNRESOLVED_MOMENT_NOTE = Object.freeze({
  "changes-requested":
    "off by default; fires once per QA fix cycle. Keep it OFF `statuses:` — a ranked target makes the 2nd move backward and the guard rejects it",
  "pr-merged":
    "off by default; fires after the PR merges, from /develop-next and /develop-batch. To gate on a real merge, omit `done:` above and let this be the last move",
  _default:
    "no matching column on this board — add the column and this line together",
});

function renderWorkflowFile(optionNames, moments) {
  const q = (n) => JSON.stringify(n);
  const first = optionNames[0];
  const last = optionNames[optionNames.length - 1];
  const resolved = (m) =>
    moments && moments[m] && moments[m].verdict === "resolved"
      ? moments[m].option
      : null;

  const lines = [];
  lines.push("# Generated by `gh-stage --init-workflow` from the live board.");
  lines.push("#");
  lines.push(
    "# Schema and worked examples: docs/reference/tracker-workflow.md",
  );
  lines.push("# Verify at any time:  gh-stage --probe-board");
  lines.push("# Check in CI:         gh-stage --check --offline");
  lines.push("");
  lines.push(
    "# The ladder, in board order. Order IS the workflow: a rung's index is its",
  );
  lines.push(
    "# rank, and the rungs between two positions are the path between them.",
  );
  lines.push("statuses:");
  for (const n of optionNames) lines.push(`  - ${q(n)}`);
  lines.push("");
  lines.push(
    "# Which status each pipeline moment targets. Omission is disablement —",
  );
  lines.push(
    "# there is no `enabled: false` and no second place to switch a moment off.",
  );
  lines.push(
    "# A status named here but absent from `statuses:` is an off-ladder",
  );
  lines.push("# side-state: entered directly, never walked to.");
  lines.push("pipeline:");
  for (const m of tw.MOMENTS) {
    const opt = resolved(m);
    if (opt) {
      lines.push(`  ${m}: ${q(opt)}`);
      continue;
    }
    // Commented, with the moment's own reason. `changes-requested` and
    // `pr-merged` are off by default, so they resolve to nothing on a fresh
    // read even on a board that has a perfectly good column for them.
    lines.push(
      `  # ${m}: ...   # ${UNRESOLVED_MOMENT_NOTE[m] || UNRESOLVED_MOMENT_NOTE._default}`,
    );
  }
  lines.push("");
  lines.push(
    "# Local document status -> board status, for the /sync-* skills.",
  );
  lines.push(
    "# GUESSED from ladder position — check these against how your team",
  );
  lines.push("# actually uses the board.");
  lines.push("documentStatus:");
  lines.push(`  draft: ${q(first)}`);
  lines.push(`  planned: ${q(first)}`);
  lines.push(`  ready-for-development: ${q(first)}`);
  lines.push(`  in-progress: ${q(resolved("work-started") || first)}`);
  lines.push(
    `  ready-for-review: ${q(resolved("in-review") || resolved("work-started") || first)}`,
  );
  lines.push(`  accepted: ${q(resolved("done") || last)}`);
  lines.push(`  cancelled: ${q(resolved("done") || last)}`);
  return lines.join("\n") + "\n";
}

if (require.main === module) {
  try {
    const r = run();
    process.exit(r.exitCode || 0);
  } catch (e) {
    console.error(`⚠️  gh-stage failed: ${e && e.message}`);
    // Even an unexpected throw must not kill a pipeline step — EXCEPT under
    // --check, whose whole contract is that a problem it cannot rule out is a
    // failure. Swallowing a throw to 0 there would produce the one outcome
    // --check exists to prevent: a green CI run over a file nobody validated.
    process.exit(process.argv.includes("--check") ? 1 : 0);
  }
}

module.exports = {
  run,
  loadDotEnv,
  CREDENTIAL_FILES,
  parseArgs,
  resolveOption,
  describeAlternatives,
  selectBoard,
  boardHintNumber,
  normalizeItem,
  readBoard,
  ensureOnBoard,
  writeLadder,
  renderWorkflowFile,
  checkWorkflowOffline,
  checkDrift,
  withRetry,
  makeOutput,
  USAGE,
};
