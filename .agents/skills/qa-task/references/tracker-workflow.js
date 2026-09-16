// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/tracker-workflow.js. Regenerate via `npm run bundle`.
"use strict";

// ---------------------------------------------------------------------------
// tracker-workflow.js — the consumer-owned status ladder, resolved
// ---------------------------------------------------------------------------
// A consumer declares its board once, in `tracker-workflow.yaml`, as an ORDERED
// list of statuses plus a map from pipeline moment to status. Three properties
// fall out of that ordering, and they are the whole design:
//
//   1. Order IS rank.        The index of a rung is its rank, so a bespoke column
//                            like "Ready for Showcase" is ranked automatically and
//                            the backward-move guard finally has an opinion about
//                            it. Nothing to hand-author.
//   2. Omission IS disablement. A moment absent from `pipeline:` does not fire.
//                            No `enabled: false`, no `defaultEnabled` to reason
//                            about, no second place a moment can be switched off.
//   3. Off-ladder IS free.   A status named under `pipeline:` but absent from
//                            `statuses:` is a side-state (Blocked, Cancelled).
//                            It is entered directly and never walked to, and
//                            there is no second list to keep in sync.
//
// Order is also the PATH: the rungs between where a card sits and where it must
// go are already declared, so multi-hop movement needs no transition graph.
//
// This module is PURE. No HTTP, no `gh`, no Jira vocabulary, and deliberately no
// `require("./jira-sync.js")` — a GitHub-only consumer must never pull the Jira
// client in behind this. The only shell-out is the `git rev-parse` fallback used
// when the caller injects no `repoRoot`, exactly as loadWorkflowRecord does.
// Tracker-specific execution: Jira reads this module (task.38 — jira-stage.js
// resolves every moment from the ladder and jira-sync.js walks it); GitHub is
// task.39 and step-file wiring is task.40.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { parseYamlSubset } = require("./yaml-subset.js");

// Match jira-sync.js: swallow git's stderr so a non-repo cwd does not print
// `fatal: not a git repository` and look like a broken tool in pipeline output.
const GIT_EXEC_OPTS = {
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "ignore"],
};

const DEFAULT_WORKFLOW_PATH = "tracker-workflow.yaml";

// ---------------------------------------------------------------------------
// Moment vocabulary
// ---------------------------------------------------------------------------
// A CLOSED set, because each moment is a line of code in a step file. Config
// chooses which status a moment targets; it can never invent a new moment.
//
// All eight are wired as of task.41: `changes-requested` fires per QA fix cycle
// from the shared QA-loop step file, and `pr-merged` fires from the orchestrators
// that actually merge (`/develop-next`, `/develop-batch`) — not from the develop
// pipelines, which finish while the PR is still open. Both remain absent from
// DEFAULT_PIPELINE, so they fire nowhere until a consumer names a status for them.
const MOMENTS = Object.freeze([
  "work-started",
  "in-review",
  "changes-requested",
  "in-qa",
  "ready-for-merge",
  "pr-merged",
  "blocked",
  "done",
]);

const MOMENT_SET = new Set(MOMENTS);

// ---------------------------------------------------------------------------
// The built-in default — the compatibility contract
// ---------------------------------------------------------------------------
// Every consumer with no file resolves through this, so it must reproduce
// today's behaviour exactly. Today's defaults are candidate *lists* (several
// acceptable names per moment), not single statuses. A ladder is ordered, but a
// rung may still carry alternatives — collapsing these lists to one name per
// rung would change behaviour for every unconfigured consumer, which is
// precisely what this default exists to prevent.
//
// Mirrors jira-sync.js's *_CANDIDATES constants and DEFAULT_STAGE_MAP's ranks
// (10/20/30/40/50/60 → indices 0..5). It is duplicated rather than imported to
// keep this module free of jira-sync.js; the snapshot test derives its
// expectations from those constants, so drift fails loudly instead of silently.
const DEFAULT_LADDER = Object.freeze([
  Object.freeze({
    names: Object.freeze([
      "To Do",
      "Backlog",
      "Open",
      "New",
      "Selected for Development",
    ]),
  }),
  Object.freeze({
    names: Object.freeze(["In Progress", "Doing", "Started", "Development"]),
  }),
  Object.freeze({
    names: Object.freeze([
      "In Review",
      "Code Review",
      "Ready for Review",
      "Waiting for Review",
      "Peer Review",
      "Review",
    ]),
  }),
  Object.freeze({
    names: Object.freeze([
      "Testing",
      "Ready for Testing",
      "In Testing",
      "QA",
      "In QA",
    ]),
  }),
  Object.freeze({
    names: Object.freeze([
      "Waiting for merge",
      "Ready to Merge",
      "Ready for Merge",
      "Awaiting Merge",
    ]),
  }),
  Object.freeze({
    names: Object.freeze([
      "Done",
      "Closed",
      "Resolved",
      "Complete",
      "Completed",
    ]),
  }),
]);

// Status NAMES, not rung indices. This is load-bearing: `buildWorkflow` replaces
// the ladder when a file declares `statuses:` but leaves the pipeline at this
// default when the file omits `pipeline:`. Indices authored against the built-in
// six-rung ladder mean nothing against a consumer's own ladder — and the failure
// is not a clean one. On a four-rung board they resolve *partially*: two moments
// land correctly by coincidence of position while `done` (index 5) falls off the
// end and silently never fires, which reads as "mostly working" rather than
// "misconfigured".
//
// Names resolve against whichever ladder is in play, so the same default is
// correct for the built-in ladder and for any board using conventional column
// names. A board using unconventional names gets an off-ladder miss that
// validateWorkflow reports and tells the author how to fix.
//
// The five moments absent here are absent on purpose: `changes-requested`,
// `in-qa`, `ready-for-merge`, `pr-merged` and `blocked` are all
// `defaultEnabled: false` in DEFAULT_STAGE_MAP, and omission is how this format
// spells "off". Count them against DEFAULT_STAGE_MAP rather than trusting this
// sentence — it said "three" for a release after `changes-requested` and
// `pr-merged` joined MOMENTS, which is exactly the drift `--check` now catches.
const DEFAULT_PIPELINE = Object.freeze({
  "work-started": "In Progress",
  "in-review": "In Review",
  done: "Done",
});

// Which DEFAULT_LADDER rung each moment corresponds to. Used only to resolve an
// INHERITED target — one that came from the built-in default, or from a base
// `pipeline:` applied to a ladder a `byIssueType` overlay replaced. In both cases
// nobody chose that target for the ladder it is being resolved against, so if the
// primary name misses, the rung's other historical names are the right thing to
// try before giving up and calling it a side-state.
//
// It is deliberately NOT consulted for an authored target. `done: Ready for
// Showcase` on a board that also has a "Closed" column must resolve to Showcase
// or not at all — silently rerouting an explicit choice through an alias list
// would be worse than the miss.
//
// `blocked` is absent because it is off-ladder by nature; an inherited miss there
// is a side-state, which is exactly right.
const DEFAULT_RUNG_FOR_MOMENT = Object.freeze({
  "work-started": 1,
  "in-review": 2,
  "in-qa": 3,
  "ready-for-merge": 4,
  done: 5,
});

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
// Real boards need both of these. A live GitHub column is routinely
// "🚧 In Progress", and a live Jira column is routinely "READY FOR SHOWCASE".
// Copied from jira-sync.js rather than imported, for the purity reason above;
// task.38 makes jira-sync.js re-export from here so there is one implementation.

function stripStatusEmoji(s) {
  return String(s || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .trim();
}

/** Canonical comparison key for a status name. */
function normalizeName(s) {
  return stripStatusEmoji(s).toLowerCase();
}

const eqName = (a, b) => normalizeName(a) === normalizeName(b);

// ---------------------------------------------------------------------------
// Shape normalization
// ---------------------------------------------------------------------------

/**
 * Coerce one authored rung into the internal `{ names: [...] }` shape.
 *
 * The YAML plain-string form is sugar for a one-name rung, so `- Backlog` and
 * `- names: [Backlog]` are the same thing internally. Returns null for anything
 * unusable, so the caller can drop it and warn.
 */
function normalizeRung(raw) {
  if (typeof raw === "string") {
    const n = raw.trim();
    return n ? { names: [n] } : null;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const names = raw.names;
    if (Array.isArray(names)) {
      const clean = names.map((n) => String(n).trim()).filter(Boolean);
      return clean.length ? { names: clean } : null;
    }
    // A flow sequence (`names: [A, B]`) reaches here as a plain STRING, because
    // parseYamlSubset does not read flow collections. Salvaging it silently
    // would make the documented-block-sequence rule unenforceable, so it is
    // rejected here and reported by validateWorkflow.
    if (typeof names === "string") return null;
  }
  return null;
}

/** True for the string a flow collection degrades into — used only for warnings. */
function looksLikeFlowCollection(v) {
  return typeof v === "string" && /^\[.*\]$/.test(v.trim());
}

// ---------------------------------------------------------------------------
// Config path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve `tracker.workflowFile` from skills-config.yaml, env override winning.
 *
 * Tolerates `tracker` being a SCALAR. It is documented today as a scalar
 * platform override (`tracker: jira`), and a consumer who has set it that way
 * must not crash this loader — they simply have no `workflowFile`, and the
 * default path applies.
 */
function resolveWorkflowFileSetting(repoRoot) {
  const fromEnv = process.env.TRACKER_WORKFLOW_FILE;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  try {
    const cfgPath = path.join(repoRoot, "skills-config.yaml");
    if (!fs.existsSync(cfgPath)) return "";
    const cfg = parseYamlSubset(fs.readFileSync(cfgPath, "utf-8"));
    const tracker = cfg && cfg.tracker;
    if (!tracker || typeof tracker !== "object" || Array.isArray(tracker))
      return "";
    const v = tracker.workflowFile;
    return typeof v === "string" && v.trim() ? v.trim() : "";
  } catch (_) {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function defaultWorkflow(extra) {
  return Object.assign(
    {
      ladder: DEFAULT_LADDER.map((r) => ({ names: r.names.slice() })),
      pipeline: Object.assign({}, DEFAULT_PIPELINE),
      pipelineAuthored: false,
      documentStatus: {},
      byIssueType: {},
      source: "default",
      path: null,
      warnings: [],
    },
    extra || {},
  );
}

/**
 * Build the internal workflow object from an already-parsed YAML document.
 *
 * Separate from loadWorkflow so tests and callers can resolve a document they
 * hold in memory without touching the filesystem.
 */
function buildWorkflow(doc, meta) {
  const warnings = [];
  const base = defaultWorkflow(meta);
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    warnings.push({
      level: "warn",
      message:
        "tracker-workflow file is not a mapping — using built-in defaults",
    });
    base.warnings = warnings;
    return base;
  }

  // --- statuses → ladder -----------------------------------------------------
  let ladder = base.ladder;
  if (doc.statuses !== undefined) {
    if (looksLikeFlowCollection(doc.statuses)) {
      warnings.push({
        level: "error",
        message:
          "`statuses:` looks like a flow sequence (`[A, B, C]`). Flow collections are " +
          "not supported — write a block sequence (one `- Name` per line). Using built-in defaults.",
      });
    } else if (!Array.isArray(doc.statuses)) {
      warnings.push({
        level: "error",
        message: "`statuses:` must be a list — using built-in defaults",
      });
    } else {
      const rungs = [];
      for (const raw of doc.statuses) {
        const rung = normalizeRung(raw);
        if (!rung) {
          if (
            raw &&
            typeof raw === "object" &&
            looksLikeFlowCollection(raw.names)
          ) {
            warnings.push({
              level: "error",
              message:
                "a rung's `names:` looks like a flow sequence (`[A, B]`) and was skipped. " +
                "Flow collections are not supported — use a block sequence.",
            });
          } else {
            warnings.push({
              level: "error",
              message: `unusable rung in \`statuses:\` — skipped: ${JSON.stringify(raw)}`,
            });
          }
          continue;
        }
        rungs.push(rung);
      }
      if (!rungs.length) {
        warnings.push({
          level: "error",
          message:
            "`statuses:` yielded no usable rungs — using built-in defaults",
        });
      } else {
        ladder = rungs;
      }
    }
  }

  // --- pipeline → moment targets --------------------------------------------
  // Authored as moment → status NAME. Resolved to a rung index where the name is
  // on the ladder, and kept as a bare name where it is not (an off-ladder
  // side-state). A moment whose value is `~`/null/empty is absent by intent.
  let pipeline = base.pipeline;
  let pipelineAuthored = false;
  if (doc.pipeline !== undefined) {
    const p = doc.pipeline;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      // Reset only once the shape is known good. Resetting first meant a
      // wrong-shaped block disabled every moment while the warning said
      // "ignoring it" and the reference doc promised a fallback to defaults.
      pipeline = {};
      pipelineAuthored = true;
      for (const [moment, target] of Object.entries(p)) {
        if (
          target === null ||
          target === undefined ||
          String(target).trim() === ""
        )
          continue;
        pipeline[moment] = String(target).trim();
      }
    } else if (p === null) {
      // `pipeline:` with nothing under it — an explicit, empty declaration.
      pipeline = {};
      pipelineAuthored = true;
    } else {
      warnings.push({
        level: "error",
        message:
          "`pipeline:` must be a mapping — ignoring it and using the built-in default moments",
      });
    }
  }

  // --- documentStatus --------------------------------------------------------
  let documentStatus = {};
  if (
    doc.documentStatus &&
    typeof doc.documentStatus === "object" &&
    !Array.isArray(doc.documentStatus)
  ) {
    for (const [local, target] of Object.entries(doc.documentStatus)) {
      if (
        target === null ||
        target === undefined ||
        String(target).trim() === ""
      )
        continue;
      documentStatus[local] = String(target).trim();
    }
  } else if (doc.documentStatus !== undefined && doc.documentStatus !== null) {
    warnings.push({
      level: "error",
      message: "`documentStatus:` must be a mapping — ignoring it",
    });
  }

  // --- byIssueType overlay ---------------------------------------------------
  const byIssueType = {};
  if (
    doc.byIssueType &&
    typeof doc.byIssueType === "object" &&
    !Array.isArray(doc.byIssueType)
  ) {
    for (const [type, spec] of Object.entries(doc.byIssueType)) {
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) continue;
      byIssueType[type] = spec;
    }
  } else if (doc.byIssueType !== undefined && doc.byIssueType !== null) {
    warnings.push({
      level: "error",
      message: "`byIssueType:` must be a mapping — ignoring it",
    });
  }

  return Object.assign(base, {
    ladder,
    pipeline,
    pipelineAuthored,
    documentStatus,
    byIssueType,
    warnings,
  });
}

// Parse cache, keyed on the resolved absolute path. The file is read once per
// pipeline step today, and a step may resolve several moments; without this the
// same file is re-read and re-parsed for each one. Keyed on path rather than
// repoRoot so `tracker.workflowFile` relocations and absolute paths share
// correctly. Cleared by clearWorkflowCache() — which tests need, since a process
// that rewrites the same path would otherwise see the first parse forever.
const _cache = new Map();

/** Drop the parse cache. Intended for tests and long-lived processes. */
function clearWorkflowCache() {
  _cache.clear();
}

/**
 * Load the workflow for a repo. Never throws.
 *
 * Missing file, unreadable file, malformed YAML or a wrong-shaped document all
 * resolve to the built-in default with `source: "default"`. This is the same
 * swallow-everything discipline as loadWorkflowRecord, and it is what makes
 * "no file → today's behaviour" safe to rely on.
 *
 * The returned object is a fresh deep-ish copy each call, so a caller that
 * mutates it cannot poison the cache for the next one.
 */
function loadWorkflow(opts) {
  const { repoRoot } = opts || {};
  try {
    const root =
      repoRoot ||
      execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
    const rel = resolveWorkflowFileSetting(root) || DEFAULT_WORKFLOW_PATH;
    const p = path.isAbsolute(rel) ? rel : path.join(root, rel);

    if (_cache.has(p)) return cloneWorkflow(_cache.get(p));

    let wf;
    if (!fs.existsSync(p)) {
      wf = defaultWorkflow({
        warnings: [
          {
            level: "info",
            message:
              `No ${rel} found — using the built-in default ladder. ` +
              "Run `/scaffold-tracker-workflow` (task.41) to write one for this board.",
          },
        ],
      });
    } else {
      const doc = parseYamlSubset(fs.readFileSync(p, "utf-8"));
      wf = buildWorkflow(doc, { source: "file", path: p });
    }
    _cache.set(p, wf);
    return cloneWorkflow(wf);
  } catch (_) {
    return defaultWorkflow({
      warnings: [
        {
          level: "warn",
          message:
            "tracker-workflow could not be read — using built-in defaults",
        },
      ],
    });
  }
}

/**
 * Structural copy deep enough that no caller can mutate the cached entry.
 *
 * `byIssueType` nests two levels (type → { statuses, pipeline }), so a shallow
 * copy would leave every overlay shared with the cache — one caller mutating
 * `wf.byIssueType[type].pipeline` would poison every later load in the process.
 * The overlay values are plain parsed YAML, so a JSON round-trip is both correct
 * and cheaper to keep right than a hand-written walk.
 */
function cloneWorkflow(wf) {
  // No catch here on purpose. The values are plain parsed YAML — strings, arrays,
  // objects, null — so the round-trip cannot throw. Guarding it would mean
  // substituting `{}` for the whole map on failure, converting an impossible error
  // into the total, silent loss of every per-type overlay. If the impossible does
  // happen, loadWorkflow's own catch turns it into the built-in default plus a
  // warning, which is the honest outcome.
  const byIssueType = JSON.parse(JSON.stringify(wf.byIssueType || {}));
  return {
    ladder: wf.ladder.map((r) => ({ names: r.names.slice() })),
    pipeline: Object.assign({}, wf.pipeline),
    pipelineAuthored: wf.pipelineAuthored,
    documentStatus: Object.assign({}, wf.documentStatus),
    byIssueType,
    source: wf.source,
    path: wf.path,
    warnings: wf.warnings.slice(),
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * The ladder a given issue type sees, and whether the overlay actually supplied it.
 *
 * Both answers come from one place on purpose. They were previously computed
 * separately — `ladderFor` required at least one rung surviving `normalizeRung`,
 * while the inherited check only tested `overlay.statuses.length` — so an overlay
 * whose `statuses:` was non-empty but wholly unusable left the BASE ladder in play
 * while still counting as overlaid. That combination silently alias-rerouted an
 * explicitly authored target, which is the one thing the inherited fallback must
 * never do.
 */
function resolveLadder(workflow, issueType) {
  const base = (workflow && workflow.ladder) || [];
  const overlay = overlayFor(workflow, issueType);
  if (overlay && Array.isArray(overlay.statuses)) {
    const rungs = overlay.statuses.map(normalizeRung).filter(Boolean);
    // `fromOverlay` must mean "the ladder in play DIFFERS from the base one",
    // not merely "an overlay supplied rungs". An overlay that restates the base
    // ladder inherits nothing — the base targets were chosen against exactly the
    // ladder still in use, so alias-rerouting them would corrupt an authored
    // choice for one issue type while leaving it correct for every other.
    if (rungs.length)
      return { ladder: rungs, fromOverlay: !sameLadder(rungs, base) };
  }
  return { ladder: base, fromOverlay: false };
}

/** Do two ladders describe the same positions with the same names, in order? */
function sameLadder(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i].names.map(normalizeName);
    const y = b[i].names.map(normalizeName);
    if (x.length !== y.length) return false;
    for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) return false;
  }
  return true;
}

/** The ladder a given issue type sees, after the byIssueType overlay. */
function ladderFor(workflow, issueType) {
  return resolveLadder(workflow, issueType).ladder;
}

/**
 * The single ladder scan. Three copies of this loop existed at one point — in
 * `rankOf`, `describeTarget` and `planMove` — which is how emoji stripping, case
 * folding and empty handling get to drift apart. One implementation, three callers.
 */
function rankIn(ladder, status) {
  const target = normalizeName(status);
  if (!target) return null;
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i].names.some((n) => normalizeName(n) === target)) return i;
  }
  return null;
}

/**
 * The byIssueType entry for a live issue type name, matched case-insensitively.
 *
 * Case-insensitive because the key is a live tracker issue type name that a
 * human typed into a config file — matching resolveStage's existing behaviour.
 */
function overlayFor(workflow, issueType) {
  if (!issueType || !workflow || !workflow.byIssueType) return null;
  const byType = workflow.byIssueType;
  if (byType[issueType]) return byType[issueType];
  const key = Object.keys(byType).find(
    (k) => k.toLowerCase() === String(issueType).toLowerCase(),
  );
  return key ? byType[key] : null;
}

/**
 * Did a human author the target for THIS moment, for THIS issue type?
 *
 * The granularity matters, and getting it wrong is dangerous in both directions.
 * `resolveMoment` resolves per key, so an authorship gate coarser than per-key
 * will disagree with it somewhere:
 *
 *  - Too coarse in the FALSE direction (file-level `pipelineAuthored` alone): an
 *    overlay-authored type reads as unauthored, its explicit target is ignored,
 *    and a built-in default is used instead. For `done` that fires the board's
 *    real Done rather than the column the author named.
 *
 *  - Too coarse in the TRUE direction (type-level): an overlay that names ONE
 *    moment — the documented per-type disable `in-qa: ~` is exactly this —
 *    claims authorship of all eight. The seven it never mentions then resolve
 *    from the built-in default and outrank the consumer's own config, so `done`
 *    fires despite an explicit `enabled: false`. Worse than not looking at the
 *    overlay at all.
 *
 * So: the base pipeline being authored makes every moment authored (falling
 * through to it is legitimate — a human wrote it). Otherwise only the moments the
 * overlay actually names are authored; the rest are not, and the caller's older
 * configuration keeps deciding them, exactly as it did before this file existed.
 *
 * `moment` is optional — omit it for the type-level question ("does this issue
 * type have any authored pipeline at all?").
 *
 * A caller cannot compute this: `overlayFor` matches the issue-type key
 * case-insensitively and is not exported, so any call-site version would either
 * duplicate that matching or get it subtly wrong. Same reason `isLastRung` lives
 * in here.
 */
function pipelineAuthoredFor(workflow, issueType, moment) {
  if (!workflow) return false;
  if (workflow.pipelineAuthored === true) return true;
  const overlay = overlayFor(workflow, issueType);
  const p = overlay && overlay.pipeline;
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  if (moment === undefined || moment === null) return true;
  const key = String(moment).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(p, key);
}

/**
 * Rank a status: its index on the ladder, or null when off-ladder.
 *
 * Matches ANY name on a rung, not just the first — a board whose column is
 * "Waiting for Review" must rank the same as one whose column is "In Review",
 * because they are the same position expressed differently.
 *
 * null means "no opinion" and the backward-move guard reads it as allow, exactly
 * as resolveStatusRank does today.
 */
function rankOf(status, workflow, opts) {
  return rankIn(ladderFor(workflow, opts && opts.issueType), status);
}

/**
 * Resolve one pipeline moment.
 *
 * Returns null when the moment is absent — omission is disablement, and there is
 * no other way to switch a moment off.
 *
 * `targets` is PLURAL and carries the rung's full name list in preference order.
 * Returning `names[0]` instead would make every alternative unreachable as a
 * move target: a board whose column is "Waiting for Review" would be moved to
 * "In Review", which is exactly the behaviour change the default ladder exists to
 * prevent. Task.38/39 try the candidates in order, as resolveTransition already does.
 *
 * The result also carries `isLastRung` — see describeTarget for why that answer
 * belongs in here rather than at the call site.
 */
function resolveMoment(moment, workflow, opts) {
  const key = String(moment || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const issueType = opts && opts.issueType;

  // The ladder is resolved ONCE per call and threaded down — previously
  // resolveMoment, isInherited and describeTarget each re-derived it, which is how
  // the copies came to disagree in the first place. It is also resolved LAZILY:
  // most moments return null (five of the eight are disabled under the built-in
  // default), and the expensive part — a normalizeRung pass over every overlay
  // rung plus a sameLadder comparison — would answer a question never asked.
  //
  // `overlayFor` stays eager and separate because it is a single key lookup; only
  // the ladder build is worth deferring.
  let _ctx = null;
  const ctx = () => _ctx || (_ctx = resolveLadder(workflow, issueType));

  // The overlay may null out a moment for one issue type.
  const overlay = overlayFor(workflow, issueType);
  if (overlay && overlay.pipeline && typeof overlay.pipeline === "object") {
    if (Object.prototype.hasOwnProperty.call(overlay.pipeline, key)) {
      const v = overlay.pipeline[key];
      if (v === null || v === undefined || String(v).trim() === "") return null;
      // Authored for this exact type — never alias-resolved.
      return describeTarget(String(v).trim(), ctx().ladder, key, false);
    }
  }

  const pipeline = (workflow && workflow.pipeline) || {};
  if (!Object.prototype.hasOwnProperty.call(pipeline, key)) return null;
  const raw = pipeline[key];
  if (raw === null || raw === undefined || String(raw).trim() === "")
    return null;

  // Always a status NAME — the built-in default and a loaded file use the same
  // representation, so there is no second code path that can diverge.
  // INHERITED — the base target was chosen against a different ladder than the one
  // it is about to be resolved against. Two ways that happens, and they are the
  // same mistake wearing different clothes:
  //
  //   1. The file declares `statuses:` but no `pipeline:`, so the built-in default
  //      moments apply to a ladder they were not written for.
  //   2. A `byIssueType` overlay replaces `statuses:` with a DIFFERENT ladder and
  //      does not re-declare a moment, so that moment keeps a base target chosen
  //      against a ladder this type does not use.
  //
  // An overlay that restates the base ladder is neither: `fromOverlay` is false
  // for it, so authored targets stay authored.
  const resolved = ctx();
  const inherited =
    resolved.fromOverlay || (workflow && workflow.pipelineAuthored === false);
  return describeTarget(String(raw).trim(), resolved.ladder, key, !!inherited);
}

/**
 * Turn a target name into `{ targets, rank, offLadder, isLastRung }`.
 *
 * When the target is INHERITED and its name misses the ladder in play, fall back
 * to the other historical names on the same default rung before declaring it a
 * side-state. This is what lets a board spelled `Doing` / `Review` work with no
 * `pipeline:` block at all, and what stops an overlay type being sent to a base
 * ladder's column. An *authored* target never takes this path — an explicit
 * choice that misses is a side-state, which is a thing authors deliberately do.
 *
 * `isLastRung` answers "is this target the end of the ladder?" and is computed
 * HERE, against `ladder` — the ladder already resolved for this issue type —
 * rather than at the call site. A caller cannot get it right: `workflow.ladder`
 * is the BASE ladder, which a `byIssueType` overlay may replace with one of a
 * different length, and `ladderFor` is not exported. It is the input to Jira's
 * terminal rule (task.38): the done-category fallback asks "is there exactly one
 * way to finish?", a question that only has a right answer when the target IS
 * the finish. Off-ladder is never a last rung — a side-state is not a position.
 */
function describeTarget(name, ladder, moment, inherited) {
  let rank = rankIn(ladder, name);

  if (rank == null && inherited && moment != null) {
    const defaultRung = DEFAULT_RUNG_FOR_MOMENT[moment];
    const aliases = defaultRung == null ? null : DEFAULT_LADDER[defaultRung];
    if (aliases) {
      for (const alt of aliases.names) {
        const r = rankIn(ladder, alt);
        if (r != null) {
          rank = r;
          break;
        }
      }
    }
  }

  if (rank == null) {
    // Off-ladder: a side-state, entered directly and never walked to. Free by
    // construction — there is no second list to declare it in.
    return { targets: [name], rank: null, offLadder: true, isLastRung: false };
  }
  return {
    targets: ladder[rank].names.slice(),
    rank,
    offLadder: false,
    isLastRung: rank === ladder.length - 1,
  };
}

/**
 * The rungs strictly between `from` and `to`, in ladder order.
 *
 * This is the whole multi-hop story: a board that gates Done behind a showcase
 * column needs no transition graph authored, because the ladder already says
 * what lies between. Each element is a full rung, so the caller can try that
 * rung's names in preference order rather than being locked to names[0].
 *
 * Returns [] when already at the target, when moving backwards, or when either
 * end is off-ladder — a side-state is entered directly, never walked to.
 */
function planMove(from, to, workflow, opts) {
  // Resolve the ladder once and scan it directly, rather than going through
  // rankOf twice and ladderFor again — three rebuilds per call, each re-running
  // normalizeRung over every authored rung.
  const ladder = ladderFor(workflow, opts && opts.issueType);
  const a = rankIn(ladder, from);
  const b = rankIn(ladder, to);
  if (a == null || b == null || b <= a) return [];
  return ladder.slice(a + 1, b).map((r) => ({ names: r.names.slice() }));
}

/** Map a local document status to a board status via `documentStatus:`. */
function resolveDocumentStatus(local, workflow) {
  const key = String(local || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const map = (workflow && workflow.documentStatus) || {};
  for (const [k, v] of Object.entries(map)) {
    if (String(k).trim().toLowerCase() === key) return v;
  }
  return null;
}

/**
 * Report problems with a loaded workflow. Returns warnings; never throws.
 *
 * Includes the warnings gathered during load, so one call surfaces both parse
 * problems and semantic ones.
 */
function validateWorkflow(workflow) {
  const out = ((workflow && workflow.warnings) || []).slice();
  if (!workflow) return out;

  const ladder = workflow.ladder || [];

  // One base resolution per moment, shared by both loops below. The base loop asks
  // "is this off-ladder?" and the per-type loop asks the inverse; computing it in
  // both places is precisely the duplication that produced a finding in each of
  // cycles 2, 3 and 4.
  const _baseCache = new Map();
  const baseResolution = (moment) => {
    if (!_baseCache.has(moment))
      _baseCache.set(moment, resolveMoment(moment, workflow));
    return _baseCache.get(moment);
  };

  // Duplicate names across rungs make rankOf's answer depend on rung order,
  // which is not something an author can reason about.
  const seen = new Map();
  ladder.forEach((rung, i) => {
    for (const name of rung.names) {
      const k = normalizeName(name);
      if (seen.has(k)) {
        out.push({
          level: "error",
          message: `status "${name}" appears on rung ${seen.get(k)} and rung ${i} — a status may sit at only one position`,
        });
      } else {
        seen.set(k, i);
      }
    }
  });

  for (const [moment, target] of Object.entries(workflow.pipeline || {})) {
    if (!MOMENT_SET.has(moment)) {
      out.push({
        level: "error",
        message: `unknown moment "${moment}" in \`pipeline:\` — moments are a closed set: ${MOMENTS.join(", ")}`,
      });
      continue;
    }
    if (looksLikeFlowCollection(target)) {
      out.push({
        level: "error",
        message: `\`pipeline.${moment}\` looks like a flow sequence — a moment targets exactly one status`,
      });
      continue;
    }
    // Resolve exactly as resolveMoment would, so validation cannot disagree with
    // behaviour — including the inherited-alias fallback. Memoised because the
    // per-issue-type loop below needs the same answer for every moment, and
    // deriving it twice with opposite polarity is the duplication that produced a
    // finding in each of the preceding cycles.
    const resolved = baseResolution(moment);
    if (resolved && !resolved.offLadder) continue;

    // Reaching here means the target is off-ladder. Off-ladder is a legitimate
    // pattern (Blocked, Cancelled) when the author chose the target — but nobody
    // chose the built-in default, so the same shape means something quite
    // different there: the ladder was declared and the moments were not, and this
    // moment now points at a column the board does not have.
    if (workflow.pipelineAuthored === false && workflow.source === "file") {
      out.push({
        level: "warn",
        message:
          `\`${moment}\` falls back to the built-in default target "${target}", which is not on this ladder — ` +
          "declare a `pipeline:` block naming the status this board actually uses, or the moment will be treated as an off-ladder side-state",
      });
    } else {
      out.push({
        level: "info",
        message: `\`pipeline.${moment}\` targets "${target}", which is not on the ladder — treating it as an off-ladder side-state`,
      });
    }
  }

  for (const [type, spec] of Object.entries(workflow.byIssueType || {})) {
    if (spec.statuses !== undefined && looksLikeFlowCollection(spec.statuses)) {
      out.push({
        level: "error",
        message: `\`byIssueType."${type}".statuses\` looks like a flow sequence — use a block sequence`,
      });
    }
    const overlayPipeline =
      spec.pipeline && typeof spec.pipeline === "object" ? spec.pipeline : {};
    for (const moment of Object.keys(overlayPipeline)) {
      if (!MOMENT_SET.has(moment)) {
        out.push({
          level: "error",
          message: `unknown moment "${moment}" in \`byIssueType."${type}".pipeline\``,
        });
      }
    }

    // A type whose overlay REPLACES the ladder inherits every base moment it does
    // not re-declare — and those were chosen against the base ladder. Check each
    // one against the ladder this type actually uses, or the overlay's whole point
    // (that this type's workflow differs) is silently undone at resolution time.
    // Only when the overlay ladder is genuinely in play — an overlay whose
    // `statuses:` yields no usable rung leaves the base ladder standing, and
    // nothing is inherited in that case.
    if (!resolveLadder(workflow, type).fromOverlay) continue;
    for (const moment of Object.keys(workflow.pipeline || {})) {
      if (!MOMENT_SET.has(moment)) continue;
      if (Object.prototype.hasOwnProperty.call(overlayPipeline, moment))
        continue;
      // Skip only when the moment is ALREADY off-ladder for the base — that is a
      // deliberate side-state (`blocked: Blocked`), and warning about it would
      // contradict the base loop, which reports the very same target as info.
      //
      // Keying on "has no default rung" instead was too broad: it also silenced
      // `changes-requested` and `pr-merged` when their base target WAS on the base
      // ladder and genuinely missing from this type's — the exact unreported
      // inherited miss the warning exists for.
      const baseRes = baseResolution(moment);
      if (!baseRes || baseRes.offLadder) continue;
      const resolved = resolveMoment(moment, workflow, { issueType: type });
      if (resolved && resolved.offLadder) {
        out.push({
          level: "warn",
          message:
            `\`${moment}\` for issue type "${type}" inherits the base target "${resolved.targets[0]}", ` +
            "which is not on that type's ladder — declare it under " +
            `\`byIssueType."${type}".pipeline\`, or set it to \`~\` to disable it for this type`,
        });
      }
    }
  }

  return out;
}

module.exports = {
  loadWorkflow,
  clearWorkflowCache,
  buildWorkflow,
  rankOf,
  resolveMoment,
  planMove,
  pipelineAuthoredFor,
  resolveDocumentStatus,
  validateWorkflow,
  normalizeRung,
  stripStatusEmoji,
  eqName,
  MOMENTS,
  DEFAULT_LADDER,
  DEFAULT_PIPELINE,
  DEFAULT_WORKFLOW_PATH,
};
