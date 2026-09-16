#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/jira-stage.js. Regenerate via `npm run bundle`.
/**
 * jira-stage — move a Jira issue to the status a develop-pipeline STAGE implies.
 *
 * The develop pipelines used to carry the transition protocol as prose, with
 * the candidate list written out as a literal in each step file, and an LLM
 * executing the matching loop against MCP tools. That had two costs: the rules
 * lived in two places (here and jira-transition-protocol.md) and had to be kept
 * in step by discipline, and the matching itself was model-driven — a shipped
 * bug had it pick "To Do" as a plausible fallback and silently revert an issue.
 *
 * This is the deterministic half. The prose protocol survives as the fallback
 * for consumers who have the Atlassian MCP connector but no API token; that is
 * why "no credentials" is a normal exit-0 outcome rather than an error.
 *
 * Usage:
 *   jira-stage.js --issue RAPP-123 --stage in-review [--json] [--dry-run]
 *                 [--strict] [--allow-regress] [--worklog 1m]
 *   jira-stage.js --stage done --print-plan [--from "In Progress"]
 *
 * Exit codes:
 *   0  transitioned, walked, parked mid-ladder (walk-incomplete), already there,
 *      disabled, no matching transition, a printed plan, or no credentials —
 *      every outcome the pipeline should shrug at
 *   1  a skip, but only under --strict. A parked walk counts as a skip: the card
 *      did not reach the status the moment asked for.
 *   2  usage error (unknown stage, missing --issue)
 *
 * Zero non-transition exit codes matter: pipeline steps run inside shells, and
 * a non-zero exit on "this board has no review column" would kill the run.
 *
 * The target comes from the consumer's tracker-workflow.yaml ladder when one
 * resolves, falling back to the JSON workflow record. When the target is not
 * directly reachable, the intermediate rungs the ladder declares are walked in
 * order, re-reading the available transitions after every hop — they are
 * position-dependent, which is the whole reason walking cannot be planned once
 * up front.
 *
 * --print-plan is credential-free and network-free: it resolves the hops and
 * prints them, which is what the MCP fallback protocol reads. --dry-run does
 * touch the network but can only verify the FIRST hop; later hops depend on
 * transitions that do not exist until the earlier ones fire, so it reports them
 * as unverified rather than claiming a destination it cannot observe.
 */

const fs = require("fs");
const path = require("path");
const lib = require("./jira-sync.js");
const tw = require("./tracker-workflow.js");
const dm = require("./defer-mutation.js");

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
    worklog: "",
    printPlan: false,
    // Where the card is. `planMove` needs a starting point, and --print-plan
    // cannot fetch one — without this flag every printed plan is a single rung
    // and the MCP fallback's "more than one hop → hand it to a human" rule can
    // never fire, because the condition it branches on is unreachable.
    from: "",
    issueType: "",
    initWorkflow: false,
    force: false,
    check: false,
    offline: false,
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
      case "--worklog":
        opts.worklog = args[++i];
        break;
      case "--from":
        opts.from = args[++i];
        break;
      case "--issue-type":
        opts.issueType = args[++i];
        break;
      case "--print-plan":
        opts.printPlan = true;
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

const USAGE = `Usage: jira-stage --issue <KEY> --stage <${lib.STAGE_NAMES.join("|")}>
              [--json] [--quiet] [--dry-run] [--strict] [--allow-regress] [--worklog <1m>]
       jira-stage --stage <${lib.STAGE_NAMES.join("|")}> --print-plan
              [--from <status>] [--issue-type <type>]   (no credentials, no network)
       jira-stage --init-workflow [--force] [--dry-run]
              (writes tracker-workflow.yaml, converting an existing
               jira.workflowRecord when one exists; refuses to overwrite
               without --force)
       jira-stage --check [--offline]
              (validates tracker-workflow.yaml; EXITS NON-ZERO ON FAILURE —
               the only mode in this family that does)`;

// A skip is only actionable if the operator can see what the board DID offer.
// Flagging transitions that lead somewhere a LATER stage wants is the useful
// part: stages are evaluated from wherever the issue currently sits, so one
// missed hop silently disables every stage after it. Naming the hop that was
// missed turns a silent ladder failure into a one-line diagnosis.
function describeAlternatives(transitions, stage, record, issueType) {
  const later = lib.STAGE_NAMES.slice(lib.STAGE_NAMES.indexOf(stage) + 1);
  const hints = [];
  for (const t of transitions || []) {
    const to = (t.to && t.to.name) || "";
    if (!to) continue;
    for (const other of later) {
      const spec = lib.resolveStage({ stage: other, issueType, record });
      if (!spec.known || !spec.enabled) continue;
      if (spec.candidates.some((c) => c.toLowerCase() === to.toLowerCase())) {
        hints.push(
          `"${to}" is reachable and is a candidate for stage ${other}`,
        );
        break;
      }
    }
  }
  return hints;
}

// Resolve where a moment wants the card, most specific source winning:
//   tracker-workflow.yaml ladder > JSON workflow record > built-in defaults
//
// The ladder path returns the same shape `resolveStage` does, so everything
// downstream is source-agnostic. Two fields deserve care:
//
//   candidates — `moment.targets`, PLURAL. There is no `target` field on the
//     result and reducing it to targets[0] makes alternative spellings of a
//     column unreachable, which is the regression task.37's plural return exists
//     to prevent.
//
//   terminal — the CONJUNCTION of two independent conditions. `done` is the only
//     moment DEFAULT_STAGE_MAP marks terminal, and position comes from the
//     ladder. A board that points `done` at a gate column has the name but not
//     the position, and the done-category fallback must stay shut for it: a
//     confident wrong transition into the board's real Done is not recoverable,
//     whereas a skip is.
function resolveMomentSpec({ stage, issueType, record, workflow }) {
  // Only an authored `pipeline:` outranks the JSON record.
  //
  // The discriminator is `pipelineAuthored`, NOT the mere existence of a file.
  // `loadWorkflow` never fails, and there are three separate ways to end up
  // holding a workflow whose `pipeline` is the BUILT-IN default: no file at all
  // (source "default"), a file that is empty or not a mapping (source "file",
  // built-in pipeline, plus a warning), and the documented `statuses:`-only shape
  // where an author declares their ladder and leaves the moments inherited.
  //
  // Keying on `source === "file"` treats the last two as authored, which is wrong
  // in both directions at once: for a moment the built-in default declares, the
  // built-in target would outrank the record's `enabled: false` and fire the
  // board's real Done; and for a moment it does NOT declare (in-qa,
  // ready-for-merge, blocked) `resolveMoment` returns null, which the branch
  // below reads as deliberate disablement — silently switching off a stage the
  // consumer explicitly opted into. A broken YAML would do the same thing.
  //
  // `tracker-workflow.js` answers this via `pipelineAuthoredFor`, at the same
  // granularity `resolveMoment` itself resolves at: per moment AND per issue
  // type. Anything coarser disagrees with it somewhere. The file-level flag
  // alone ignores an overlay-authored target, firing a built-in `done` instead
  // of the column the author named. A type-level answer lets an overlay that
  // names ONE moment — the documented `in-qa: ~` disable is exactly that —
  // claim authorship of all eight, so the seven it never mentions outrank the
  // record and `done` fires despite an explicit `enabled: false`.
  //
  // Consequence, deliberate: a `statuses:`-only file resolves its targets from
  // the record and does NOT walk. That is the conservative reading — its moment
  // targets are built-in-derived, so they belong below the record — and it keeps
  // the compatibility guarantee exact. Authoring one `pipeline:` line per moment
  // is what opts a board into walking.
  const authored = !!(
    workflow &&
    workflow.source === "file" &&
    tw.pipelineAuthoredFor(workflow, issueType, stage)
  );
  if (!authored) {
    return {
      spec: lib.resolveStage({ stage, issueType, record }),
      moment: null,
      authored: false,
    };
  }

  const moment = tw.resolveMoment(stage, workflow, { issueType });

  // Null from an authored file means DISABLED, not "unspecified". Omission from
  // `pipeline:` is the only way to switch a moment off, so falling back to the
  // built-in defaults here would fire a transition the author deliberately
  // removed — and for `done` that means firing the board's real Done. An
  // unwanted terminal transition is the one outcome that cannot be undone.
  if (!moment) {
    return {
      spec: {
        known: true,
        stage,
        enabled: false,
        candidates: [],
        rank: null,
        reason:
          "not declared in tracker-workflow.yaml — omission is disablement",
        terminal: false,
      },
      moment: null,
      // The FILE answered — it just answered "off". A reader asking which source
      // decided this must not be told "record".
      authored: true,
    };
  }

  return {
    spec: {
      known: true,
      stage,
      enabled: true,
      candidates: moment.targets,
      rank: moment.rank,
      reason: "",
      terminal: lib.isTerminalMoment(stage) && moment.isLastRung,
    },
    moment,
    authored: true,
  };
}

// Hop construction lives in jira-sync.js beside walkLadder, so the plan printed
// here is built by the same code that walks it. Re-exported for tests.
const planHops = lib.planHops;

async function run({
  argv = process.argv,
  fetchImpl = typeof fetch !== "undefined" ? fetch : null,
  // Where to look for tracker-workflow.yaml. Absent, `loadWorkflow` shells out to
  // `git rev-parse --show-toplevel` and reads the real repo's file — which makes
  // a test's outcome depend on a committed board description whose own comments
  // invite editing. Tests pin their own ladder through this.
  repoRoot = undefined,
} = {}) {
  // Captured BEFORE loadDotEnv. A dot-env file must not be able to restrict
  // (or, via a typo, hard-fail) every pipeline step behind the resolver's back.
  //
  // BOTH names, because the resolver reads both: `ACCESS_TRACKER` is
  // resolve-platform.sh's output and `AGENT_SKILLS_ACCESS_TRACKER` is the knob
  // an operator sets. Capturing only the first left this CLI's gate LOOSER than
  // the layer-1 net underneath it — it read "full", skipped the typed deferral
  // it exists to write, and the POST was then refused downstream as an untyped
  // unknown-mutation.
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

  lib.loadDotEnv();

  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    console.error(USAGE);
    return { exitCode: 2 };
  }

  const output = lib.makeOutput({ json: args.json, quiet: args.quiet });

  if (args.help) {
    output.log(USAGE);
    return { exitCode: 0 };
  }

  const emit = (payload, exitCode) => {
    if (args.json) output.emit({ ...payload, stage: args.stage, exitCode });
    return { exitCode, ...payload };
  };

  // --init-workflow and --check are file-level modes: they take no --stage and
  // no --issue, because neither is about one card. Handled before the
  // stage/issue validation below, which would otherwise reject them.
  if (args.initWorkflow || args.check) {
    const workflow = tw.loadWorkflow(repoRoot ? { repoRoot } : {});
    const root = repoRoot || gitToplevel();
    return args.check
      ? checkWorkflow({ args, output, workflow, repoRoot })
      : initWorkflow({ root, args, output, repoRoot });
  }

  // --print-plan needs no issue: it reads a config file, not a board.
  if ((!args.issue && !args.printPlan) || !args.stage) {
    output.err(
      args.printPlan
        ? "Error: --stage is required"
        : "Error: --issue and --stage are both required",
    );
    output.err(USAGE);
    return { exitCode: 2 };
  }
  if (!lib.STAGE_NAMES.includes(args.stage.toLowerCase())) {
    output.err(
      `Error: unknown stage "${args.stage}". Known: ${lib.STAGE_NAMES.join(", ")}`,
    );
    return { exitCode: 2 };
  }
  args.stage = args.stage.toLowerCase();

  // The ladder is read before credentials are even looked at, because
  // --print-plan must work without them — that is the entire point of it. Never
  // throws: a missing or malformed file resolves to the built-in default ladder.
  const workflow = tw.loadWorkflow(repoRoot ? { repoRoot } : {});

  // --print-plan: resolve and print, no credentials, no network, exit 0.
  //
  // This is what jira-transition-protocol.md consumes, so it must run BEFORE the
  // auth check — the fallback exists precisely because credentials are absent.
  // `output.emit` writes unconditionally rather than only under --json, which is
  // what makes the flag machine-readable on its own.
  if (args.printPlan) {
    const { spec, moment, authored } = resolveMomentSpec({
      stage: args.stage,
      issueType: args.issueType,
      record: lib.loadWorkflowRecord(repoRoot),
      workflow,
    });
    const targets = spec.enabled ? spec.candidates : [];
    const hops = spec.enabled
      ? planHops({
          from: args.from,
          targets,
          workflow: moment ? workflow : null,
          issueType: args.issueType,
        })
      : [];
    output.emit({
      stage: args.stage,
      reason: "plan",
      enabled: spec.enabled,
      targets: spec.enabled ? targets : null,
      hops,
      from: args.from || null,
      // Without --from, planMove has no starting point and returns [], so the
      // plan is the target rung ALONE. Say so explicitly rather than letting a
      // reader mistake a one-element plan for "this moment is one hop away".
      spansFrom: !!args.from,
      isLastRung: moment ? moment.isLastRung : null,
      terminal: spec.terminal,
      // Where this plan actually came from — which is not the same question as
      // "does a file exist". A statuses-only or malformed file is `source:
      // "file"` while contributing nothing to the plan, and this is the one
      // field a reader consults to answer "did my ladder do this?".
      //
      // A ladder-DISABLED moment came from the file too: `enabled: false` with
      // the omission reason is the file's answer, not the record's, so it must
      // not be labelled "record".
      source: authored ? workflow.source : "record",
      authored,
      exitCode: 0,
    });
    return { exitCode: 0, reason: "plan", hops, spansFrom: !!args.from };
  }

  // ── ACCESS GATE ───────────────────────────────────────────────────────────
  //
  // Under any non-`full` tracker access mode this CLI must not touch Jira. It
  // records what it wanted, exits 0 with `reason: "deferred"`, and the run-end
  // handover names the card and its target column.
  //
  // PLACEMENT IS THE WHOLE POINT. This sits after arg parsing and after the
  // credential-free modes (--print-plan, --init-workflow, --check) have already
  // returned, and immediately BEFORE `lib.getAuth()` on the next line — the
  // first credential read, itself ahead of the first network call. A gate placed
  // after the issue fetch would have already told the tracker who is asking.
  //
  // The comparison is `!== "full"`, never truthiness or emptiness: an UNSET
  // variable must read as `full`, because this CLI is invoked from seven skills
  // and six pipeline steps and a gate that misfires stops every one of them
  // moving cards. `resolveAccessTracker` holds that contract and refuses an
  // unrecognised value rather than defaulting either way.
  //
  // `--dry-run` is exempt: it is a preview that mutates nothing, and every
  // non-`full` mode still permits reads.
  let access;
  try {
    // `cwd` is the repo root this CLI already computes, not process.cwd(). A
    // bare `node jira-stage.js …` run from a subdirectory must see the same
    // declared restriction the resolver sees from the root (C5-CR6).
    access = dm.resolveAccessTracker(accessEnv, {
      cwd: repoRoot || gitToplevel() || process.cwd(),
    });
  } catch (e) {
    output.err(`Error: ${e.message}`);
    return { exitCode: 2 };
  }
  if (access !== "full" && !args.dryRun) {
    const { spec } = resolveMomentSpec({
      stage: args.stage,
      issueType: args.issueType,
      record: lib.loadWorkflowRecord(repoRoot),
      workflow,
    });
    if (!spec.enabled) {
      // A disabled moment is not a deferral — there was never a mutation to
      // defer. Report it exactly as an unrestricted run would.
      output.info(
        `⏭️  Stage ${args.stage} is not enabled${spec.reason ? ` (${spec.reason})` : ""} — nothing to do.`,
      );
      return emit({ transitioned: false, reason: "stage-disabled" }, 0);
    }
    const target = spec.candidates && spec.candidates[0];
    const baseUrl = (process.env.JIRA_URL || "").replace(/\/+$/, "");
    const issueUrl = baseUrl ? `${baseUrl}/browse/${args.issue}` : "";
    try {
      const rec = dm.defer(
        {
          kind: "jira.transition",
          system: "jira",
          access,
          intent: `Move ${args.issue} to ${target || `the ${args.stage} column`}`,
          target: { issue: args.issue, url: issueUrl, ui_url: issueUrl },
          desired: { status: target || null },
          skill: "jira-stage",
          step: args.stage,
          run: process.env.PIPELINE_RUN || "",
          manual: {
            deepLink: issueUrl,
            ui: `Open the issue → Status → ${target || `the ${args.stage} column`}`,
            fields: [{ name: "Status", value: target || "" }],
          },
          command: {
            argv: [
              "node",
              "jira-stage.js",
              "--issue",
              String(args.issue),
              "--stage",
              args.stage,
              "--json",
            ],
            stdin: null,
          },
          verify: {
            cmd: `jira-stage.js --issue ${args.issue} --stage ${args.stage} --dry-run --json`,
            expect: `status is "${target || args.stage}"`,
          },
          // The repo root, not process.cwd() — see gh-stage.js.
        },
        { cwd: repoRoot || gitToplevel() },
      );
      output.info(
        `⏸️  access.tracker=${access} — not transitioning ${args.issue}; recorded as ${rec.id}.`,
      );
      return emit(
        {
          transitioned: false,
          reason: "deferred",
          access,
          target: target || null,
          record: rec.id,
        },
        0,
      );
    } catch (e) {
      // A journal we cannot write is a real problem, but it is not a reason to
      // fall through and perform the very mutation the mode forbids.
      output.warn(`⚠️  Could not record the deferred transition: ${e.message}`);
      return emit({ transitioned: false, reason: "deferred", access }, 0);
    }
  }

  // Absent credentials is a documented, non-failing outcome: the caller falls
  // back to the MCP protocol. Anything else here would make the CLI a
  // regression for every consumer using the Atlassian connector.
  const auth = lib.getAuth();
  if (!auth.ok) {
    output.info(
      `ℹ️  JIRA_* env not set (${auth.missing.join(", ")}) — no transition attempted.`,
    );
    return emit({ transitioned: false, reason: "no-credentials" }, 0);
  }

  // The SAME anchor the CLI gate above used. Leaving it out let layer 1 resolve
  // the config tier against process.cwd() while the gate resolved it against the
  // repo root, so one run could hold two different answers (T61-M3).
  const http = lib.makeHttp({
    fetchImpl,
    cwd: repoRoot || gitToplevel() || process.cwd(),
  });
  const record = lib.loadWorkflowRecord(repoRoot);

  let issue;
  try {
    issue = await lib.fetchIssue({
      http,
      baseUrl: auth.baseUrl,
      email: auth.email,
      token: auth.token,
      issueKey: args.issue,
      fields: "status,issuetype",
    });
  } catch (e) {
    output.warn(`⚠️  Could not read ${args.issue}: ${e.message}`);
    return emit({ transitioned: false, reason: "issue-unreadable" }, 0);
  }

  const currentStatus = (issue && issue.status) || "";
  const issueType = (issue && issue.issueType) || "";

  const { spec, moment } = resolveMomentSpec({
    stage: args.stage,
    issueType,
    record,
    workflow,
  });
  if (!spec.enabled) {
    output.info(
      `⏭️  Stage ${args.stage} is not enabled${issueType ? ` for ${issueType}` : ""}` +
        `${spec.reason ? ` (${spec.reason})` : ""} — nothing to do.`,
    );
    return emit(
      { transitioned: false, reason: "stage-disabled", issueType },
      0,
    );
  }

  if (args.dryRun) {
    // Strictly GET-only — nothing moves. But it can only verify the FIRST hop:
    // the transitions available after a hop do not exist until that hop fires,
    // so a multi-hop plan's later rungs are reported as unverified rather than
    // claimed as a destination. Use --print-plan to see the full intended path.
    let transitions = [];
    try {
      transitions = await lib.getTransitions({
        http,
        baseUrl: auth.baseUrl,
        email: auth.email,
        token: auth.token,
        issueKey: args.issue,
      });
    } catch (_) {}
    const hops = planHops({
      from: currentStatus,
      targets: spec.candidates,
      workflow: moment ? workflow : null,
      issueType,
    });
    const r = lib.resolveTransition({
      transitions,
      candidates: hops[0] || spec.candidates,
      currentStatus,
      // Only the final rung can be terminal — see walkLadder.
      terminal: hops.length === 1 ? spec.terminal : false,
    });
    // Same distinction transitionToStatus draws: `to.name` is the destination
    // STATUS, `name` is the TRANSITION. A preview that prints the verb as though
    // it were the destination tells the operator this stage lands somewhere it
    // does not, which is worse than admitting the payload did not say.
    const to = r.match && r.match.to ? r.match.to.name : null;
    output.info(
      `🔎 ${args.issue} [${issueType}] @ "${currentStatus}" — stage ${args.stage}: ` +
        (r.match
          ? to
            ? `would move to "${to}" (via ${r.rule})`
            : `would fire "${r.match.name}" (destination not reported; via ${r.rule})`
          : `skip (${r.reason})`),
    );
    for (let i = 1; i < hops.length; i++) {
      output.info(
        `   ↪ then "${hops[i].join('" / "')}" — unverified (depends on hop 1)`,
      );
    }
    if (!r.match)
      for (const h of describeAlternatives(
        transitions,
        args.stage,
        record,
        issueType,
      ))
        output.info(`   ↪ ${h}`);
    return emit(
      {
        transitioned: false,
        reason: "dry-run",
        would: to,
        from: currentStatus,
        hops,
        // Everything after hop 1 is a plan, not an observation.
        unverifiedHops: hops.length - 1,
      },
      0,
    );
  }

  const res = await lib.walkLadder({
    http,
    baseUrl: auth.baseUrl,
    email: auth.email,
    token: auth.token,
    issueKey: args.issue,
    from: currentStatus,
    targets: spec.candidates,
    // Only pass the ladder when a moment actually resolved from it. On the
    // legacy JSON-record path there are no rungs to walk and no ladder ranks,
    // and handing one over would switch the monotonicity guard to a rank scale
    // the record-derived `minRank` is not measured on.
    workflow: moment ? workflow : null,
    issueType,
    // Deliberately NOT `spec.terminal ? "accepted" : ...`-driven for rule 4 —
    // that is what `terminal` below is for now. This still yields the literal
    // "done" for a retargeted done moment, which IS in TERMINAL_LOCAL_STATUSES,
    // so positive-resolution preference keeps working when a transition demands
    // a resolution. Correct, and load-bearing: do not "simplify" it.
    localStatus: spec.terminal ? "accepted" : args.stage,
    terminal: spec.terminal,
    doneResolution: lib.loadDoneResolution(repoRoot),
    cancelledResolution: lib.loadCancelledResolution(repoRoot),
    worklogTimeSpent: args.worklog || lib.loadWorklogTimeSpent(repoRoot),
    minRank: spec.rank,
    workflowRecord: record,
    allowRegress: args.allowRegress,
    output,
  });

  // A skip is only actionable if the operator can see what the board DID offer.
  // Shared by the walk-incomplete branch and the plain no-transition tail — two
  // copies of this drifted apart once already.
  const explainNoTransition = async () => {
    let transitions = [];
    try {
      transitions = await lib.getTransitions({
        http,
        baseUrl: auth.baseUrl,
        email: auth.email,
        token: auth.token,
        issueKey: args.issue,
      });
    } catch (_) {}
    for (const h of describeAlternatives(
      transitions,
      args.stage,
      record,
      issueType,
    ))
      output.warn(`   ↪ ${h}`);
  };

  // A partial walk is neither a success nor "nothing happened" — the card is
  // parked in a gate the board declares, and a reader must be able to tell that
  // from a card that never moved.
  //
  // This is tested FIRST, before the success branch. A partial walk that got
  // through the gate has `transitioned: true` — it really did move — so a
  // success branch checking `res.transitioned` would swallow it and report a
  // parked card as a clean pass, with no warning at all. The one outcome the
  // three-shape reporting exists to surface would be the one never surfaced.
  //
  // Exit 0 unless --strict, matching every other skip: a gate is a legitimate
  // board shape and stopping at one is the correct outcome, but a caller that
  // has opted into strictness wants to hear about anything short of arrival.
  if (res.reason === "walk-incomplete") {
    const remaining = (res.remaining || [])
      .map((rung) => rung.join(" / "))
      .join(" → ");
    const moved = res.landed && res.landed !== res.from;
    output.warn(
      moved
        ? `⏸️  ${args.issue} walked as far as "${res.landed}" — ${remaining || "the target"} not reachable from there.`
        : `⏸️  ${args.issue} did not move from "${res.from}" — ${remaining || "the target"} not reachable.`,
    );
    if (moved)
      output.warn(
        `    The card is parked mid-ladder, not un-moved. Move it on by hand, or declare the missing rung.`,
      );
    // The hop's own failure, which `incomplete()` carries up as `cause`. Without
    // this an HTTP error or a required-field refusal reads as a gate.
    if (res.cause && res.cause !== "no-transition")
      output.warn(
        `    Hop failed with: ${res.cause}${res.detail ? ` — ${res.detail}` : ""}.`,
      );
    if (res.cause === "no-transition") await explainNoTransition();
    return emit({ ...res, issueType }, args.strict ? 1 : 0);
  }

  // `walked` is the only success shape walkLadder can return with
  // `transitioned: true` once walk-incomplete is handled above; the second
  // disjunct is defensive and currently unreachable.
  if (res.reason === "walked" || res.transitioned) {
    return emit({ ...res, issueType }, 0);
  }

  if (res.reason === "already") {
    output.info(`✅ ${args.issue} is already "${currentStatus}".`);
    return emit({ ...res, issueType }, 0);
  }

  // Everything else is a skip. Surface why, then let the pipeline continue.
  if (res.reason === "no-transition") await explainNoTransition();

  return emit({ ...res, issueType }, args.strict ? 1 : 0);
}

if (require.main === module) {
  run()
    .then((r) => process.exit(r.exitCode || 0))
    .catch((e) => {
      console.error(`⚠️  jira-stage failed: ${e && e.message}`);
      // Even an unexpected throw must not kill a pipeline step — EXCEPT under
      // --check, whose whole contract is that a problem it cannot rule out is a
      // failure. Swallowing a throw to 0 there would produce the one outcome
      // --check exists to prevent: a green CI run over a file nobody validated.
      process.exit(process.argv.includes("--check") ? 1 : 0);
    });
}

// ---------------------------------------------------------------------------
// File-level modes: --init-workflow and --check
// ---------------------------------------------------------------------------

function gitToplevel() {
  try {
    return require("child_process")
      .execSync("git rev-parse --show-toplevel", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch (_) {
    return process.cwd();
  }
}

/**
 * Convert an existing `jira.workflowRecord` JSON into the YAML ladder.
 *
 * The record is the pre-task.37 way of saying the same thing, and a consumer
 * upgrading should not have to re-derive by hand what they already told the
 * probe. Two things are preserved rather than recomputed, both because they
 * encode a decision a human made and a board read cannot recover:
 *
 *   • `reason:` strings become YAML comments beside the moment they explain.
 *     `buildWorkflowRecord` (jira-sync.js:3744) already treats these as sacred
 *     across regenerations; dropping them here would undo that at the one moment
 *     the consumer is least able to notice.
 *   • `enabled: false` becomes omission — the YAML format's only way to say off.
 */
function recordToLadder(record) {
  const stages = (record && record.stages) || {};
  const ranked = Object.entries(stages)
    .filter(([, s]) => s && s.rank != null)
    .sort((a, b) => a[1].rank - b[1].rank);

  const statuses = [];
  for (const [, s] of ranked) {
    const first = (s.candidates || [])[0];
    if (first && !statuses.includes(first)) statuses.push(first);
  }

  const pipeline = [];
  for (const stage of lib.STAGE_NAMES) {
    const s = stages[stage];
    if (!s) continue;
    const first = (s.candidates || [])[0];
    const reason = s.reason ? `   # ${s.reason}` : "";
    if (s.enabled && first)
      pipeline.push(`  ${stage}: ${JSON.stringify(first)}${reason}`);
    else
      pipeline.push(
        `  # ${stage}: ${first ? JSON.stringify(first) : "..."}${reason || "   # disabled in the JSON record"}`,
      );
  }
  return { statuses, pipeline };
}

function renderJiraWorkflowFile({ record, statusesByType }) {
  const q = (n) => JSON.stringify(n);
  const lines = [];
  const converted = record ? recordToLadder(record) : null;

  // Prefer the record's own ranked ladder; fall back to a live status list.
  let statuses =
    converted && converted.statuses.length ? converted.statuses : null;
  if (!statuses && statusesByType) {
    const first = Object.values(statusesByType)[0];
    if (first && first.length) statuses = first.slice();
  }
  statuses = statuses || ["To Do", "In Progress", "Done"];

  lines.push(
    record
      ? "# Generated by `jira-stage --init-workflow` from an existing jira.workflowRecord."
      : "# Generated by `jira-stage --init-workflow`.",
  );
  lines.push("#");
  lines.push(
    "# Schema and worked examples: docs/reference/tracker-workflow.md",
  );
  lines.push("# Check in CI:  jira-stage --check --offline");
  if (record && record.project)
    lines.push(`# Source record project: ${record.project}`);
  lines.push("");
  lines.push(
    "# The ladder, in board order. Order IS the workflow: a rung's index is its",
  );
  lines.push(
    "# rank, and the rungs between two positions are the path between them.",
  );
  lines.push("statuses:");
  for (const s of statuses) lines.push(`  - ${q(s)}`);
  lines.push("");
  lines.push(
    "# Which status each pipeline moment targets. Omission is disablement.",
  );
  lines.push("pipeline:");
  if (converted) {
    lines.push(...converted.pipeline);
  } else {
    lines.push(`  work-started: ${q(statuses[1] || statuses[0])}`);
    lines.push(`  done: ${q(statuses[statuses.length - 1])}`);
    for (const m of tw.MOMENTS) {
      if (m === "work-started" || m === "done") continue;
      lines.push(`  # ${m}: ...   # add the column and this line together`);
    }
  }
  return lines.join("\n") + "\n";
}

function initWorkflow({ root, args, output, repoRoot }) {
  const target = path.join(root, tw.DEFAULT_WORKFLOW_PATH);
  if (fs.existsSync(target) && !args.force) {
    output.warn(
      `⚠️  ${tw.DEFAULT_WORKFLOW_PATH} already exists — leaving it untouched. ` +
        "Pass --force to overwrite it.",
    );
    const payload = { reason: "exists", written: false, path: target };
    if (args.json) output.emit({ ...payload, exitCode: 0 });
    return { exitCode: 0, ...payload };
  }

  // A record, when one exists, beats anything this can infer: it is the output
  // of a real probe of this very board, plus whatever a human then hand-edited.
  const record = lib.loadWorkflowRecord(repoRoot);
  const body = renderJiraWorkflowFile({
    record: record && record.stages ? record : null,
    statusesByType: record && record.statusesByIssueType,
  });

  if (args.dryRun) {
    output.info(
      `🔎 would write ${tw.DEFAULT_WORKFLOW_PATH} (skipped: --dry-run):`,
    );
    output.info(body.replace(/^/gm, "   "));
    const payload = { reason: "dry-run", written: false, path: target };
    if (args.json) output.emit({ ...payload, exitCode: 0 });
    return { exitCode: 0, ...payload };
  }

  try {
    fs.writeFileSync(target, body);
    // Same cache concern as gh-stage's writeLadder: this process already called
    // loadWorkflow before the file existed, so the built-in default is memoised
    // under this exact path.
    tw.clearWorkflowCache();
  } catch (e) {
    output.err(`⚠️  Could not write ${tw.DEFAULT_WORKFLOW_PATH}: ${e.message}`);
    const payload = { reason: "write-failed", written: false, path: target };
    if (args.json) output.emit({ ...payload, exitCode: 0 });
    return { exitCode: 0, ...payload };
  }

  if (record && record.stages) {
    output.info(
      `✅ wrote ${tw.DEFAULT_WORKFLOW_PATH} from the existing workflow record ` +
        "(reasons preserved as comments, `enabled: false` became omission).",
    );
  } else {
    output.info(`✅ wrote ${tw.DEFAULT_WORKFLOW_PATH}.`);
    output.warn(
      "⚠️  No workflow record to convert — this is a GENERIC ladder and your " +
        "board's real columns are almost certainly different. A ladder that does " +
        "not match resolves nothing, and fails SILENTLY. Edit it, or run " +
        "`jira-sync --probe-workflow --write-record` first and re-run with --force.",
    );
  }
  const payload = {
    reason: "written",
    written: true,
    path: target,
    fromRecord: !!(record && record.stages),
  };
  if (args.json) output.emit({ ...payload, exitCode: 0 });
  return { exitCode: 0, ...payload };
}

/**
 * `--check` — validate tracker-workflow.yaml, exiting NON-ZERO on failure.
 *
 * See the identical contract note in gh-stage.js.
 *
 * --check is the ONE mode in this family that exits non-zero on failure.
 *
 * It runs in CI, not inside a pipeline step, and a green exit over a broken file
 * is the whole failure being guarded against. Do not "harmonise" it with the
 * other modes, all of which exit 0 on every documented skip because a non-zero
 * exit inside a pipeline step would kill the run.
 *
 * The Jira board half needs credentials the CLI may not have; without them it
 * exits 0 with a loud skip, so a fork's PR cannot fail on a secret it cannot
 * hold. `--offline` asserts the schema half alone and is what most consumer CI
 * should run.
 */
function checkWorkflow({ args, output, workflow, repoRoot }) {
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
        "Nothing to check. Generate one with `jira-stage --init-workflow`.",
    );
    const payload = {
      reason: "no-file",
      checked: false,
      errors: 0,
      warnings: 0,
    };
    if (args.json) output.emit({ ...payload, exitCode: 0 });
    return { exitCode: 0, ...payload };
  }

  if (errors.length) {
    const payload = {
      reason: "invalid",
      checked: true,
      errors: errors.length,
      warnings: warns.length,
      messages: findings.map((f) => `${f.level}: ${f.message}`),
    };
    if (args.json) output.emit({ ...payload, exitCode: 1 });
    return { exitCode: 1, ...payload };
  }

  if (args.offline) {
    output.info("✅ tracker-workflow.yaml is self-consistent.");
    const payload = {
      reason: "ok-offline",
      checked: true,
      offline: true,
      errors: 0,
      warnings: warns.length,
    };
    if (args.json) output.emit({ ...payload, exitCode: 0 });
    return { exitCode: 0, ...payload };
  }

  // Board half. The record is the local snapshot of what the board offered when
  // it was last probed — comparing against it catches a file copied between
  // repos, and a status no issue type on this project has.
  const record = lib.loadWorkflowRecord(repoRoot);
  if (!record || !record.statusesByIssueType) {
    output.info(
      "⏭️  No workflow record to compare against — skipping the board half of " +
        "--check and exiting 0. The schema half passed. Run " +
        "`jira-sync --probe-workflow --write-record` to enable the board half, " +
        "or use `--check --offline` to assert only the schema half deliberately.",
    );
    const payload = {
      reason: "no-record",
      checked: true,
      errors: 0,
      warnings: warns.length,
    };
    if (args.json) output.emit({ ...payload, exitCode: 0 });
    return { exitCode: 0, ...payload };
  }

  const known = new Set();
  for (const list of Object.values(record.statusesByIssueType))
    for (const s of list || []) known.add(String(s).trim().toLowerCase());

  const drift = [];
  for (const m of tw.MOMENTS) {
    const spec = tw.resolveMoment(m, workflow, { issueType: args.issueType });
    if (!spec) continue;
    const hit = spec.targets.some((t) =>
      known.has(String(t).trim().toLowerCase()),
    );
    if (!hit)
      drift.push({
        moment: m,
        wanted: spec.targets,
        message:
          `\`${m}\` targets [${spec.targets.join(", ")}], which no status on ` +
          `project "${record.project || "?"}" has. Known statuses: ` +
          [...known].join(", "),
      });
  }

  // A file copied between repos is the other thing this catches, and it is worth
  // naming separately — the moments may all resolve while the file describes an
  // entirely different project.
  const envProject = process.env.JIRA_PROJECT_KEY;
  if (envProject && record.project && envProject !== record.project) {
    drift.push({
      moment: "(project)",
      message:
        `the workflow record names project "${record.project}" but JIRA_PROJECT_KEY ` +
        `is "${envProject}" — this file may have been copied from another repo`,
    });
  }

  for (const d of drift) output.err(`❌ ${d.message}`);
  if (drift.length) {
    output.err("");
    output.err("Fix it by regenerating from a fresh probe:");
    output.err("  jira-sync --probe-workflow --write-record");
    output.err("  jira-stage --init-workflow --force");
  } else {
    output.info("✅ tracker-workflow.yaml matches the probed board.");
  }

  const payload = {
    reason: drift.length ? "drift" : "ok",
    checked: true,
    project: record.project,
    errors: drift.length,
    warnings: warns.length,
    drift,
  };
  const code = drift.length ? 1 : 0;
  if (args.json) output.emit({ ...payload, exitCode: code });
  return { exitCode: code, ...payload };
}

module.exports = {
  run,
  parseArgs,
  describeAlternatives,
  resolveMomentSpec,
  planHops,
  recordToLadder,
  renderJiraWorkflowFile,
  initWorkflow,
  checkWorkflow,
  USAGE,
};
