#!/usr/bin/env node
/**
 * schedule.mjs — deterministic placement + admission planner for develop-batch.
 *
 * Sibling of develop-next/scripts/select-next.mjs, and deliberately orthogonal
 * to it: the selector answers *what can run together* (dependency-ready,
 * write-disjoint); this answers *where and when* (which execution resource, and
 * whether a slot is free right now). Neither knows about the other's axis —
 * do not teach selectBatch about capacity, or this about `touches:`.
 *
 * Why this is code and not SKILL.md prose: placement, slot accounting, probe
 * interpretation, halt-vs-interrupt classification and the re-batch guard are
 * all routing / threshold / status-branching decisions. Left as prose they get
 * improvised differently on every run — which is exactly the failure this file
 * exists to remove — and they cannot be tested.
 *
 * Usage:
 *   schedule.mjs plan      --state <path> [--config <path>]
 *   schedule.mjs resources [--config <path>]
 *   schedule.mjs probe     [--config <path>]
 *
 * Output: JSON on stdout, always.
 * Exit codes: 0 = ok; 1 = bad usage or unreadable state/config.
 *
 * No dependencies. Node >= 22. Pure functions are exported for unit tests
 * (evals/develop-batch/unit/); the CLI runs only when invoked directly.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseYamlSubset } from "../references/yaml-subset.js";

const DEFAULT_CONFIG = "skills-config.yaml";
const DEFAULT_STATE = ".claude/state/develop-batch.state.json";
const DEFAULT_CAPACITY = 4; // matches develop-batch's historical maxParallel default
const DEFAULT_PROBE_INTERVAL_SEC = 60;
const DEFAULT_PROBE_TIMEOUT_SEC = 10;
const DEFAULT_MAX_RESUME_ATTEMPTS = 2;
const DEFAULT_MAX_REBATCHES = 3;

// Pipeline-gate HALT signatures. A dispatched pipeline that stops citing one of
// these has genuinely failed its own gate and must NOT be re-dispatched.
// Anything else that stopped mid-flight is an *external* interruption (plan
// mode, permission denial, context compaction, user interrupt, tool outage) and
// is resumable — see classifyStop.
const HALT_SIGNATURES = [
  /\breview\s+NO-?GO\b/i,
  /\bdevelop\s+stall\b/i,
  /\b5\s+QA\s+cycles?\b/i,
  /\bqa-fix\s+(?:with\s+)?no\s+changes\b/i,
  /\bDoD\s+gaps?\b/i,
  /\brebase\s+conflict\b/i,
  /\bmerge\s+failed\b/i,
  /\bgate\s+failed\b/i,
];

// Stop reasons that are external to the pipeline. Present for documentation and
// for the ambiguous-case tiebreak; absence of a HALT signature is what actually
// decides, so a novel external cause still classifies as interrupted.
const INTERRUPT_SIGNATURES = [
  /\bplan\s+mode\b/i,
  /\bpermission\s+deni/i,
  /\bcompact(?:ion|ed)\b/i,
  /\buser\s+interrupt/i,
  /\btool\s+unavailable\b/i,
  /\binterrupted\b/i,
];

// ── minimal YAML subset ──────────────────────────────────────────────────────
// Moved to shared/resources/yaml-subset.js, which is imported above. It was the
// most capable of this repo's five hand-rolled readers, and tracker-workflow.js
// needs the same shape — so it is shared rather than copied.
//
// Re-exported because the unit suite (evals/develop-batch/unit/schedule.test.mjs)
// imports it from here. Keeping the name exported from this module means the
// promotion is invisible to every existing caller.
export { parseYamlSubset };

// ── resources ────────────────────────────────────────────────────────────────

/**
 * Normalize `developBatch` config into a resource table + a global ceiling.
 *
 * Back-compat is the point here: a consumer that has only ever set
 * `maxParallel` must behave exactly as before, and a project with no config at
 * all must work with zero ceremony. Only `resources` unlocks per-resource caps.
 */
export function normalizeResources(config) {
  const db = (config && config.developBatch) || {};
  const declared = Array.isArray(db.resources) ? db.resources : null;
  const notes = [];

  if (!declared || declared.length === 0) {
    const cap =
      Number.isInteger(db.maxParallel) && db.maxParallel > 0
        ? db.maxParallel
        : DEFAULT_CAPACITY;
    if (declared && declared.length === 0) {
      notes.push(
        "developBatch.resources is empty — falling back to a single implicit resource",
      );
    }
    return {
      resources: [
        {
          name: "local",
          capacity: cap,
          testCommand: null,
          env: null,
          probe: null,
        },
      ],
      globalCap: cap,
      notes,
      implicit: true,
    };
  }

  const resources = [];
  for (const r of declared) {
    if (!r || typeof r.name !== "string" || !r.name.trim()) {
      notes.push("skipped a resource with no `name`");
      continue;
    }
    const capacity =
      Number.isInteger(r.capacity) && r.capacity > 0 ? r.capacity : 1;
    if (!(Number.isInteger(r.capacity) && r.capacity > 0)) {
      notes.push(
        `resource "${r.name}" has no valid capacity — defaulting to 1`,
      );
    }
    let probe = null;
    if (
      r.probe &&
      typeof r.probe.command === "string" &&
      r.probe.command.trim()
    ) {
      probe = {
        command: r.probe.command,
        intervalSec: Number.isFinite(r.probe.intervalSec)
          ? r.probe.intervalSec
          : DEFAULT_PROBE_INTERVAL_SEC,
        timeoutSec: Number.isFinite(r.probe.timeoutSec)
          ? r.probe.timeoutSec
          : DEFAULT_PROBE_TIMEOUT_SEC,
      };
      // The settle window defaults to the probe interval: load average has a
      // ~1-minute time constant, so without it three items land on a "load 0.5"
      // box in three seconds and the probe never sees what it caused.
      probe.settleSec = Number.isFinite(r.probe.settleSec)
        ? r.probe.settleSec
        : probe.intervalSec;
    } else if (r.probe) {
      notes.push(
        `resource "${r.name}" has a probe with no command — ignoring it`,
      );
    }
    resources.push({
      name: r.name.trim(),
      capacity,
      testCommand:
        typeof r.testCommand === "string" && r.testCommand.trim()
          ? r.testCommand.trim()
          : null,
      env: r.env && typeof r.env === "object" ? r.env : null,
      probe,
    });
  }

  if (!resources.length) {
    const cap =
      Number.isInteger(db.maxParallel) && db.maxParallel > 0
        ? db.maxParallel
        : DEFAULT_CAPACITY;
    notes.push(
      "no usable resources declared — falling back to a single implicit resource",
    );
    return {
      resources: [
        {
          name: "local",
          capacity: cap,
          testCommand: null,
          env: null,
          probe: null,
        },
      ],
      globalCap: cap,
      notes,
      implicit: true,
    };
  }

  const sum = resources.reduce((n, r) => n + r.capacity, 0);
  let globalCap = sum;
  if (Number.isInteger(db.maxParallel) && db.maxParallel > 0) {
    globalCap = Math.min(db.maxParallel, sum);
    if (db.maxParallel < sum) {
      notes.push(
        `developBatch.maxParallel (${db.maxParallel}) is below the sum of resource capacities (${sum}) — it is the binding constraint`,
      );
    }
  }
  return { resources, globalCap, notes, implicit: false };
}

// ── slot accounting ──────────────────────────────────────────────────────────

/**
 * In-flight count per resource, DERIVED from item flags — never from a
 * persisted counter. This is what makes slot accounting crash-safe: a resumed
 * run recomputes truth from the same booleans the pipelines write.
 */
export function computeInflight(state, resources) {
  const counts = {};
  for (const r of resources) counts[r.name] = 0;
  const fallback = resources.length ? resources[0].name : "local";
  for (const it of (state && state.items) || []) {
    if (!it.dispatched) continue;
    if (it.pipelineDone || it.halted || it.interrupted) continue;
    // A v1 state file has no `resource` — attribute it to the first resource
    // rather than halting. Migration must never cost a run.
    const name =
      it.resource && counts[it.resource] !== undefined ? it.resource : fallback;
    if (counts[name] === undefined) counts[name] = 0;
    counts[name]++;
  }
  return counts;
}

/**
 * Interpret a probe result. Exit-code-first, so a one-line `curl … | jq -e`
 * satisfies the contract and no interpreter code lives in this repo.
 *
 * A probe that times out or fails to spawn reports AVAILABLE, deliberately: a
 * flaky probe must never be able to stall a batch. It can only ever withhold a
 * slot when it affirmatively says so.
 */
export function interpretProbe({ code, stdout, timedOut, spawnError }) {
  if (timedOut || spawnError) {
    return {
      saturated: false,
      freeSlots: null,
      reason: timedOut
        ? "probe timed out — treating as available"
        : "probe failed to spawn — treating as available",
      degraded: true,
    };
  }
  if (code !== 0) {
    const reason =
      String(stdout || "")
        .trim()
        .split(/\r?\n/)[0] || `probe exited ${code}`;
    return { saturated: true, freeSlots: null, reason, degraded: false };
  }
  const text = String(stdout || "").trim();
  if (!text)
    return { saturated: false, freeSlots: null, reason: "", degraded: false };
  try {
    const parsed = JSON.parse(text);
    if (parsed && Number.isFinite(parsed.freeSlots)) {
      return {
        saturated: false,
        freeSlots: Math.max(0, Math.trunc(parsed.freeSlots)),
        reason: "",
        degraded: false,
      };
    }
  } catch {
    // Non-JSON stdout on a zero exit is not an error — the boolean form is
    // allowed to print anything. Fall through to "available".
  }
  return { saturated: false, freeSlots: null, reason: "", degraded: false };
}

/**
 * Effective capacity for a resource: static capacity, optionally reduced by a
 * probe. The probe can only ever SUBTRACT — static capacity stays the primary
 * guard, so a probe bug slows a batch but can never overload a host.
 */
export function effectiveCapacity(resource, inflight, probeResult) {
  const base = resource.capacity;
  if (
    !probeResult ||
    probeResult.freeSlots === null ||
    probeResult.freeSlots === undefined
  ) {
    return base;
  }
  return Math.min(base, inflight + probeResult.freeSlots);
}

/**
 * Choose a resource for one item, or null if none can take it now.
 *
 * Placement happens ONCE, at admission — no preemption, no migration of a
 * running item. That is both thrash-free by construction and exactly what a
 * human operator does: move the *next* item off a busy host, never the one
 * already running on it.
 */
export function placeItem(resources, inflight, probes = {}) {
  const candidates = [];
  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    const used = inflight[r.name] || 0;
    if (used >= r.capacity) continue;
    const p = probes[r.name];
    if (p && p.saturated) continue;
    if (used >= effectiveCapacity(r, used, p)) continue;
    candidates.push({ r, i, ratio: used / r.capacity });
  }
  if (!candidates.length) return null;
  // Spread by utilisation, then prefer declaration order.
  candidates.sort((a, b) => a.ratio - b.ratio || a.i - b.i);
  return candidates[0].r.name;
}

/**
 * Plan this tick's admissions: which pending items to dispatch, and where.
 *
 * Pending = not dispatched yet, OR interrupted and still under the resume
 * budget. An interrupted item is re-PLACED, not pinned to its old resource —
 * the whole point is that a different resource may now be idle.
 */
export function planAdmissions(
  state,
  { resources, globalCap },
  probes = {},
  opts = {},
) {
  const maxResumeAttempts = Number.isInteger(opts.maxResumeAttempts)
    ? opts.maxResumeAttempts
    : DEFAULT_MAX_RESUME_ATTEMPTS;
  const inflight = computeInflight(state, resources);
  const admit = [];
  const hold = [];
  const working = { ...inflight };
  let total = Object.values(working).reduce((n, v) => n + v, 0);

  for (const it of (state && state.items) || []) {
    if (it.ticked || it.merged || it.halted || it.pipelineDone) continue;
    const isPending = !it.dispatched || it.interrupted;
    if (!isPending) continue;

    if (it.interrupted && (it.attempts || 0) > maxResumeAttempts) {
      hold.push({
        id: it.id,
        reason: `resume budget exhausted (${it.attempts} > ${maxResumeAttempts})`,
      });
      continue;
    }
    if (total >= globalCap) {
      hold.push({ id: it.id, reason: `global cap reached (${globalCap})` });
      continue;
    }
    const target = placeItem(resources, working, probes);
    if (!target) {
      hold.push({
        id: it.id,
        reason: "all resources at capacity or saturated",
      });
      continue;
    }
    const res = resources.find((r) => r.name === target);
    admit.push({
      id: it.id,
      resource: target,
      testCommand: res.testCommand,
      env: res.env,
      dir: it.dir,
      branch: it.branch,
      run: it.commandArg ? `${it.command} ${it.commandArg}` : it.command,
      resuming: Boolean(it.interrupted),
      attempt: (it.attempts || 0) + 1,
    });
    working[target] = (working[target] || 0) + 1;
    total++;
  }
  return { admit, hold, inflight, globalCap };
}

/**
 * Did a dispatched pipeline HALT (its own gate failed) or was it INTERRUPTED
 * (something external stopped it mid-flight)?
 *
 * The distinction matters because they get opposite treatment: a HALT must not
 * be re-dispatched, an interruption must be. Grounded in an artifact rather
 * than vibes — absence of a pipeline-gate signature plus a live, non-terminal
 * pipeline lock means the work is mid-flight and resumable.
 *
 * Fail-safe: ambiguous text with NO lock classifies as `halt`. Wrongly halting
 * costs an operator one manual resume; wrongly resuming can re-run a pipeline
 * that already decided it should stop.
 */
export function classifyStop(reportText, lock) {
  const text = String(reportText || "");
  for (const re of HALT_SIGNATURES) {
    if (re.test(text))
      return { kind: "halt", reason: `matched pipeline-gate signature ${re}` };
  }
  for (const re of INTERRUPT_SIGNATURES) {
    if (re.test(text))
      return {
        kind: "interrupted",
        reason: `matched external-stop signature ${re}`,
      };
  }
  if (lock && lock.step && !lock.terminal) {
    return {
      kind: "interrupted",
      reason: `pipeline lock is live at step ${lock.step}`,
    };
  }
  return {
    kind: "halt",
    reason:
      "no external-stop signal and no live pipeline lock — failing safe to halt",
  };
}

/**
 * Should the run re-select the frontier and go again inside this invocation?
 *
 * The progress requirement is the real anti-spin guard: a re-batch is allowed
 * only if the previous batch actually ticked a roadmap row, which makes
 * progress monotonic against the roadmap and cannot loop forever.
 */
export function shouldRebatch({
  prevSignature,
  newIds,
  tickedCount,
  rebatchCount,
  maxRebatches,
}) {
  const max = Number.isInteger(maxRebatches)
    ? maxRebatches
    : DEFAULT_MAX_REBATCHES;
  if (!Array.isArray(newIds) || newIds.length === 0) {
    return { go: false, reason: "selector returned an empty batch" };
  }
  if (!tickedCount) {
    return {
      go: false,
      reason: "previous batch ticked no roadmap rows — no progress",
    };
  }
  if ((rebatchCount || 0) >= max) {
    return { go: false, reason: `re-batch cap reached (${max})` };
  }
  const sig = [...newIds].sort().join(",");
  if (prevSignature && sig === prevSignature) {
    return {
      go: false,
      reason: "selector returned the same batch — roadmap did not move",
    };
  }
  return {
    go: true,
    reason: "progress made and a new frontier is available",
    signature: sig,
  };
}

// ── impure edges (CLI only) ──────────────────────────────────────────────────

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readConfig(p) {
  try {
    return parseYamlSubset(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}

function runProbe(resource, cacheEntry, nowMs) {
  const probe = resource.probe;
  if (!probe) return null;
  if (cacheEntry && Number.isFinite(cacheEntry.at)) {
    const ageSec = (nowMs - cacheEntry.at) / 1000;
    const window = Math.max(probe.intervalSec, probe.settleSec || 0);
    if (ageSec < window) return { ...cacheEntry.result, cached: true, ageSec };
  }
  let code = 0;
  let stdout = "";
  let timedOut = false;
  let spawnError = false;
  try {
    stdout = execFileSync("/bin/sh", ["-c", probe.command], {
      encoding: "utf-8",
      timeout: probe.timeoutSec * 1000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    if (e.killed || e.signal === "SIGTERM") timedOut = true;
    else if (typeof e.status === "number") {
      code = e.status;
      stdout = String(e.stdout || "") + String(e.stderr || "");
    } else spawnError = true;
  }
  return {
    ...interpretProbe({ code, stdout, timedOut, spawnError }),
    cached: false,
    ageSec: 0,
  };
}

function gatherProbes(resources, state, nowMs) {
  const cache = (state && state.probeCache) || {};
  const probes = {};
  const fresh = {};
  for (const r of resources) {
    if (!r.probe) continue;
    const res = runProbe(r, cache[r.name], nowMs);
    if (res) {
      probes[r.name] = res;
      fresh[r.name] = res.cached ? cache[r.name] : { at: nowMs, result: res };
    }
  }
  return { probes, cache: { ...cache, ...fresh } };
}

function parseArgs(argv) {
  const args = { cmd: null, state: DEFAULT_STATE, config: DEFAULT_CONFIG };
  if (!argv.length) return args;
  args.cmd = argv[0];
  for (let i = 1; i < argv.length; i++) {
    switch (argv[i]) {
      case "--state":
        args.state = argv[++i];
        break;
      case "--config":
        args.config = argv[++i];
        break;
      default:
        process.stderr.write(`schedule: unknown argument ${argv[i]}\n`);
        process.exit(1);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const usage =
    "usage: schedule.mjs <plan|resources|probe> [--state <path>] [--config <path>]";
  if (!args.cmd || !["plan", "resources", "probe"].includes(args.cmd)) {
    process.stderr.write(usage + "\n");
    process.exit(1);
  }
  let config;
  try {
    config = readConfig(args.config);
  } catch (e) {
    process.stderr.write(
      `schedule: cannot read config ${args.config}: ${e.message}\n`,
    );
    process.exit(1);
  }
  const table = normalizeResources(config);
  const db = config.developBatch || {};

  if (args.cmd === "resources") {
    process.stdout.write(JSON.stringify({ ...table }, null, 2) + "\n");
    process.exit(0);
  }

  if (args.cmd === "probe") {
    const now = Date.now();
    const out = table.resources.map((r) => ({
      name: r.name,
      probe: r.probe ? r.probe.command : null,
      result: r.probe ? runProbe(r, null, now) : null,
    }));
    process.stdout.write(JSON.stringify({ probes: out }, null, 2) + "\n");
    process.exit(0);
  }

  let state;
  try {
    state = readJson(args.state);
  } catch (e) {
    process.stderr.write(
      `schedule: cannot read state ${args.state}: ${e.message}\n`,
    );
    process.exit(1);
  }
  const now = Date.now();
  const { probes, cache } = gatherProbes(table.resources, state, now);
  const plan = planAdmissions(state, table, probes, {
    maxResumeAttempts: db.maxResumeAttempts,
  });
  const notes = [...table.notes];
  for (const [name, p] of Object.entries(probes)) {
    if (p.saturated)
      notes.push(`resource "${name}" reported saturated: ${p.reason}`);
    if (p.degraded)
      notes.push(`resource "${name}" probe degraded: ${p.reason}`);
  }
  process.stdout.write(
    JSON.stringify(
      {
        ...plan,
        resources: table.resources.map((r) => ({
          name: r.name,
          capacity: r.capacity,
        })),
        probeCache: cache,
        notes,
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(0);
}

// Resolve BOTH sides through realpath: consumer projects symlink
// `.claude/skills` -> `.agents/skills`, and comparing a symlinked argv[1]
// against the realpath'd module URL silently no-ops the CLI (exit 0, no
// output). select-next.mjs carries the same guard; keep the two in step.
function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}
if (isInvokedDirectly()) main();
