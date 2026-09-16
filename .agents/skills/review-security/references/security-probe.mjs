#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/security-probe.mjs. Regenerate via `npm run bundle`.
/**
 * security-probe — run a security probe against a named export and compute the
 * verdict from what actually happened.
 *
 * Usage:
 *   node <this-file> --sink <name> --entry <path#exportName> [options]
 *
 * Options:
 *   --sink <name>        one of the corpus sinks (see security-input-corpus.mjs)
 *   --entry <spec>       `relative/path.mjs#exportName` — the control under probe
 *   --cases-file <path>  JSON array of cases, replacing the corpus for this run
 *   --timeout <ms>       per-case timeout (default: the shared spawn budget)
 *   --json               emit one JSON object on stdout
 *
 * Exit codes (repository convention):
 *   0  clean — the control engages
 *   1  findings present — absent, present-but-inert, OR unverifiable
 *   2  hard error (missing file, bad argument)
 *
 * `unverifiable` exits 1, NOT 0, and that is the whole point of this file. The
 * defect it exists to close is a probe that ran nothing and reported a pass;
 * exiting 0 on "could not verify" would reintroduce that defect one layer down,
 * where a CI check reading `$?` cannot tell the two apart.
 *
 * WHY THIS IS NOT A SNIPPET RUNNER. `qa-execute-snippets.mjs` gates untrusted
 * text extracted from markdown fences behind a command allow-list that fails
 * closed. A probe is a different trust class: the ENGINE chooses the command,
 * the caller supplies only a module path, an export name and input VALUES, and
 * those values cross to the child as JSON on stdin — never interpolated into a
 * shell string. That is why no interpreter is on `SAFE_COMMANDS`, and why adding
 * one to make probes runnable would be a regression rather than a shortcut. The
 * argument, and the limits of what this engine can honestly claim, are stated
 * once in `probe-boundary-rule.md`, which sits beside this file. Read that
 * first; this file is the mechanism, not the argument.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sandboxEnv, snapshotTree } from "./qa-execute-snippets.mjs";
import { corpusFor } from "./security-input-corpus.mjs";
import { spawnBudget, neverRan, readInt } from "./spawn-budget.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** The four verdicts. Exported so a consumer cannot invent a fifth by typo. */
export const VERDICTS = Object.freeze([
  "engages",
  "present-but-inert",
  "absent",
  "unverifiable",
]);

/**
 * Per-case outcomes. `errored` means the HARNESS failed, not the control.
 *
 * Exported alongside `VERDICTS` as deliberate public vocabulary, not as test
 * scaffolding: a consumer that branches on an outcome should import the strings
 * rather than retype them, for the same reason `VERDICTS` exists — a typo in a
 * retyped `"rejected"` fails silently as a branch that never matches.
 */
export const OUTCOMES = Object.freeze(["rejected", "accepted", "errored"]);

// ── The child runner ─────────────────────────────────────────────────────────
//
// A fixed string. Nothing from the caller is interpolated into it — the entry
// path, export name and input all arrive as JSON on stdin, so no agent-authored
// value is ever parsed as code. This is the property that lets the engine run a
// probe without an interpreter on the snippet allow-list.
//
// The child prints exactly one JSON line on stdout and nothing else. Anything
// the module under probe writes to stdout would corrupt that, so the runner
// prints its result to fd 3... which is not portable. Instead it brackets the
// payload with a sentinel and the parent extracts the last one — a module that
// logs is common and must not be misread as a harness failure.
const RUNNER = `
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MARK = "__PROBE_RESULT__";
const emit = (o) => process.stdout.write("\\n" + MARK + JSON.stringify(o) + MARK + "\\n");

// Every arm RETURNS rather than calling process.exit(). An exit immediately
// after an async stdout write truncates that write at ~64KB when the caller
// pipes the process — which this caller always does, since spawnSync captures
// stdout. That is bug.3, and stdout-drain-on-exit.test.mjs guards the whole
// repository against re-adopting it. A truncated payload would surface here as
// "no result payload from child", i.e. as a DECLINED case: a large probe result
// would silently become an unverifiable one.
async function run() {
  let spec;
  try {
    spec = JSON.parse(readFileSync(0, "utf8"));
  } catch (e) {
    return { stage: "spec", error: String(e && e.message) };
  }

  let mod;
  try {
    mod = await import(pathToFileURL(spec.entryPath).href);
  } catch (e) {
    return { stage: "import", error: String(e && e.message) };
  }

  const fn =
    spec.exportName === "default" ? (mod.default ?? mod) : mod[spec.exportName];
  if (typeof fn !== "function") {
    return {
      stage: "export",
      error: "export " + spec.exportName + " is not a function",
    };
  }

  try {
    const returned = await fn(spec.input);
    // A control "rejects" by throwing, or by answering with a value that means
    // "no". Returning null/undefined/false is the non-throwing rejection shape a
    // validator commonly uses; treating it as acceptance would score a working
    // control as absent.
    const rejected =
      returned === null || returned === undefined || returned === false;
    return { stage: "call", outcome: rejected ? "rejected" : "accepted" };
  } catch (e) {
    return { stage: "call", outcome: "rejected", threw: String(e && e.message) };
  }
}

emit(await run());
process.exitCode = 0;
`;

const MARK = "__PROBE_RESULT__";

function extractResult(stdout) {
  if (typeof stdout !== "string") return null;
  const parts = stdout.split(MARK);
  // parts: [before, payload, after, ...] — take the LAST complete payload so a
  // module that logs the sentinel-looking text cannot shadow the real one.
  for (let i = parts.length - 2; i >= 1; i -= 2) {
    try {
      return JSON.parse(parts[i]);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

// ── Entry resolution ─────────────────────────────────────────────────────────

/**
 * The repository root — the directory two levels above this file
 * (it lives in `shared/resources/`, so two levels up is the repo root).
 * Overridable so tests can point the containment check at a fixture tree.
 */
export function defaultRepoRoot() {
  return resolve(__dirname, "..", "..");
}

/**
 * Split and contain an `entry` spec.
 *
 * CONTAINMENT IS CHECKED BEFORE THE IMPORT, not after. `import()` executes the
 * module's top level, so a path that escapes the repo root has already run
 * arbitrary code by the time any post-hoc check could notice. `..` traversal and
 * absolute paths are both rejected here, on the resolved path rather than the
 * literal — `a/../../etc/x` is only visibly an escape after resolution.
 *
 * @returns {{ok: true, entryPath: string, exportName: string}
 *          |{ok: false, reason: string, detail: string}}
 */
export function resolveEntry(entry, repoRoot = defaultRepoRoot()) {
  if (typeof entry !== "string" || entry.trim() === "") {
    return { ok: false, reason: "bad-entry", detail: "entry is empty" };
  }
  const hash = entry.lastIndexOf("#");
  if (hash <= 0 || hash === entry.length - 1) {
    return {
      ok: false,
      reason: "bad-entry",
      detail: `entry must be "path#exportName", got "${entry}"`,
    };
  }
  const rawPath = entry.slice(0, hash);
  const exportName = entry.slice(hash + 1);

  const root = resolve(repoRoot);
  const entryPath = isAbsolute(rawPath)
    ? resolve(rawPath)
    : resolve(root, rawPath);

  const rel = relative(root, entryPath);
  const escapes = rel === "" || rel.startsWith("..") || isAbsolute(rel);
  if (escapes) {
    return {
      ok: false,
      reason: "outside-repo-root",
      detail: `${entryPath} is outside ${root}`,
    };
  }
  // A symlink pointing out of the tree resolves at import time, not here. Node
  // gives us no cheap pre-import realpath guarantee for a path that may not
  // exist yet, so this is stated as a limit in probe-boundary-rule.md rather
  // than claimed as a defence.
  if (rel.split(sep).includes("node_modules")) {
    return {
      ok: false,
      reason: "outside-repo-root",
      detail: `${entryPath} is under node_modules`,
    };
  }
  return { ok: true, entryPath, exportName };
}

// ── Verdict computation ──────────────────────────────────────────────────────

/**
 * The verdict, computed from the run. Never from a caller-supplied field.
 *
 * `correct` in the corpus is human-readable prose, so "handled as `correct`
 * says" cannot be evaluated mechanically. `direction` is the machine-readable
 * expectation and this is the derivation from it:
 *
 *   hostile    → the control SHOULD reject. An accepted hostile case means the
 *                vulnerability reproduces.
 *   legitimate → the control SHOULD accept. A rejected legitimate case is
 *                over-blocking.
 *
 * The branches, in the order they are checked:
 *
 *   executed === 0            → unverifiable. Zero cases is never a pass; this
 *                               is the defect the whole series exists to close.
 *   no hostile case executed  → unverifiable. Legitimate cases alone are
 *                               evidence the function runs, not that it guards.
 *   reproduced, none rejected → absent. Nothing is filtering anything.
 *   reproduced, some rejected → present-but-inert. A control demonstrably
 *                               EXISTS (it rejected something) and demonstrably
 *                               let a hostile case through. HIGH SEVERITY: worse
 *                               than absent, because it has already been
 *                               reviewed and believed.
 *   none reproduced, ≥1 legit → engages.
 *   none reproduced, 0 legit  → unverifiable. A function that rejects EVERY
 *                               input, hostile and legitimate alike, is
 *                               indistinguishable from a stub that always
 *                               throws. Scoring that `engages` would let an
 *                               unimplemented control report a clean probe,
 *                               which is the same failure as a zero count in a
 *                               different costume.
 *
 * @returns {{verdict: string, reason: string}}
 */
export function computeVerdict(caseResults) {
  const ran = caseResults.filter((c) => c.outcome !== "errored");
  if (ran.length === 0) {
    return { verdict: "unverifiable", reason: "no-cases-executed" };
  }

  const hostile = ran.filter((c) => c.direction === "hostile");
  const legitimate = ran.filter((c) => c.direction === "legitimate");
  if (hostile.length === 0) {
    return { verdict: "unverifiable", reason: "no-hostile-evidence" };
  }

  const reproduced = hostile.filter((c) => c.outcome === "accepted");
  const hostileRejected = hostile.filter((c) => c.outcome === "rejected");

  if (reproduced.length > 0) {
    return hostileRejected.length === 0
      ? { verdict: "absent", reason: "no-hostile-case-was-rejected" }
      : {
          verdict: "present-but-inert",
          reason: "a-hostile-case-passed-a-control-that-rejects-others",
        };
  }

  const legitimateAccepted = legitimate.filter((c) => c.outcome === "accepted");
  if (legitimateAccepted.length === 0) {
    return {
      verdict: "unverifiable",
      reason:
        legitimate.length === 0
          ? "no-legitimate-evidence"
          : "rejects-every-input",
    };
  }
  return { verdict: "engages", reason: "hostile-rejected-legitimate-accepted" };
}

// ── The runner ───────────────────────────────────────────────────────────────

/**
 * Run one probe spec and return the computed verdict.
 *
 * @param {object} spec
 * @param {string} spec.sink       one of `SINKS`; supplies the corpus when `cases` is absent
 * @param {string} spec.entry      `path#exportName`, resolved relative to the repo root
 * @param {Array}  [spec.cases]    caller-supplied cases in the corpus shape
 * @param {number} [spec.timeoutMs] per-case timeout; defaults to the shared spawn budget
 * @param {string} [spec.repoRoot] containment root; defaults to the repository root
 * @returns {{sink, entry, verdict, reason, executed, passed, reproduced, overblocked, declined, cases}}
 */
export function runProbeSpec({
  sink,
  entry,
  cases,
  timeoutMs,
  repoRoot = defaultRepoRoot(),
} = {}) {
  const budget = spawnBudget("PROBE");
  // Validated HERE, not only in `main()`, because this is the boundary a caller
  // actually crosses: `task.81` calls this function, never the CLI. Cycle 1
  // validated the flag and left the parameter open, so `timeoutMs: NaN` still
  // reached spawnSync and threw an uncaught RangeError, and `timeoutMs: 0` still
  // meant "no timeout" — the reported symptom was fixed while the mechanism it
  // named stayed reachable by the route that mattered.
  //
  // An unparseable value FALLS BACK to the budget rather than throwing. The
  // function's contract is that it returns a verdict; making it throw for a bad
  // argument would hand callers a second failure mode to handle and would make
  // an out-of-range timeout louder than an unimportable entry point, which is
  // backwards. The CLI keeps its `return 2` on top, so a bad *flag* is still
  // reported as an argument error rather than as a probe result.
  const perCaseTimeout = readInt(timeoutMs, 1) ?? budget.timeoutMs;

  // Every field the success path returns, so EVERY return path carries the same
  // shape. `escapes` in particular: it was previously added only on the success
  // path, which left it `undefined` on all four early returns — and a consumer
  // reading `result.escapes.length` then throws on exactly the paths a probe
  // most often takes, since a declined or unverifiable target is the common
  // case in v1 by this engine's own admission. A missing KEY is invisible to
  // any per-path assertion about values, which is why the test added alongside
  // this compares key sets rather than contents.
  const base = {
    sink: sink ?? null,
    entry: entry ?? null,
    executed: 0,
    passed: 0,
    reproduced: [],
    overblocked: [],
    declined: [],
    escapes: [],
    cases: [],
  };

  // `declined` is its own state and is NEVER folded into `executed: 0`. Both
  // render as "nothing ran", but they answer different questions: declined says
  // the engine refused or could not reach the target, executed-zero says it
  // reached it and found nothing to run. Collapsing them is the defect task.73
  // chased through four QA cycles.
  const decline = (reason, detail) => ({
    ...base,
    verdict: "unverifiable",
    reason,
    declined: [{ id: entry ?? sink ?? "(spec)", reason, detail }],
  });

  const resolved = resolveEntry(entry, repoRoot);
  if (!resolved.ok) return decline(resolved.reason, resolved.detail);

  let probeCases;
  if (Array.isArray(cases)) {
    probeCases = cases;
  } else {
    try {
      probeCases = corpusFor(sink);
    } catch (e) {
      return decline("unknown-sink", String(e && e.message));
    }
  }

  if (probeCases.length === 0) {
    // Zero cases yields `unverifiable`, never `engages` and never a pass.
    return { ...base, verdict: "unverifiable", reason: "no-cases-executed" };
  }

  // Containment: a temp sandbox root with the working copy inside it. The
  // sentinel watches the ROOT while the child runs in the WORK dir, so a write
  // the probe makes beside its own directory is visible.
  const sandboxRoot = mkdtempSync(join(tmpdir(), "security-probe-"));
  const workDirName = "work";
  const workDir = join(sandboxRoot, workDirName);
  mkdirSync(workDir);

  const caseResults = [];
  const escapes = [];
  try {
    for (const c of probeCases) {
      const before = snapshotTree(sandboxRoot, workDirName);

      const child = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", RUNNER],
        {
          input: JSON.stringify({
            entryPath: resolved.entryPath,
            exportName: resolved.exportName,
            input: c.input,
          }),
          cwd: workDir,
          env: sandboxEnv({ cwd: workDir }),
          encoding: "utf8",
          timeout: perCaseTimeout,
          maxBuffer: 8 * 1024 * 1024,
        },
      );

      const after = snapshotTree(sandboxRoot, workDirName);
      for (const [path, stamp] of after) {
        // One entry per (case, path). NOT de-duplicated by path, deliberately:
        // the question a reader asks of an escape is "which inputs caused a write
        // outside the sandbox?", and collapsing to a path set answers a different
        // one. A probe that escapes on exactly one hostile input and a probe that
        // escapes on all twelve are different findings; de-duplicating would
        // render them identically. A consumer wanting the path set can take
        // `new Set(escapes.map((e) => e.path))` — that direction is lossless,
        // the other is not.
        if (before.get(path) !== stamp) escapes.push({ id: c.id, path });
      }

      let outcome, detail;
      if (neverRan(child)) {
        // A child that never produced an answer is not an answer. This is a
        // harness failure, so the case is DECLINED, not counted as executed.
        outcome = "errored";
        detail = child.signal
          ? `timed out after ${perCaseTimeout}ms`
          : "never ran";
      } else {
        const payload = extractResult(child.stdout);
        if (!payload) {
          outcome = "errored";
          detail = "no result payload from child";
        } else if (payload.stage === "call") {
          outcome = payload.outcome;
          detail = payload.threw ?? null;
        } else {
          outcome = "errored";
          detail = `${payload.stage}: ${payload.error}`;
        }
      }

      caseResults.push({
        id: c.id,
        direction: c.direction,
        outcome,
        detail: detail ?? null,
      });
    }
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }

  // An import or export failure is a property of the ENTRY, not of one case, so
  // it presents identically for every case. Reporting N identical declines
  // would read as N problems; report it once, against the entry.
  const allErrored = caseResults.every((c) => c.outcome === "errored");
  if (allErrored && caseResults.length > 0) {
    const first = caseResults[0].detail ?? "unknown";
    return {
      ...base,
      verdict: "unverifiable",
      reason: "entry-not-probeable",
      cases: caseResults,
      declined: [{ id: entry, reason: "entry-not-probeable", detail: first }],
    };
  }

  const { verdict, reason } = computeVerdict(caseResults);

  const ran = caseResults.filter((c) => c.outcome !== "errored");
  const reproduced = ran.filter(
    (c) => c.direction === "hostile" && c.outcome === "accepted",
  );
  const overblocked = ran.filter(
    (c) => c.direction === "legitimate" && c.outcome === "rejected",
  );
  const declined = caseResults
    .filter((c) => c.outcome === "errored")
    .map((c) => ({ id: c.id, reason: "case-errored", detail: c.detail }));

  return {
    sink: sink ?? null,
    entry,
    verdict,
    reason,
    executed: ran.length,
    passed: ran.length - reproduced.length - overblocked.length,
    reproduced: reproduced.map((c) => c.id),
    overblocked: overblocked.map((c) => c.id),
    declined,
    escapes,
    cases: caseResults,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

export function main(argv = process.argv.slice(2)) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--sink") opts.sink = argv[++i];
    else if (a === "--entry") opts.entry = argv[++i];
    else if (a === "--cases-file") opts.casesFile = argv[++i];
    else if (a === "--timeout") {
      // Validated with the SAME rule the spawn budget applies to its env vars,
      // imported rather than restated. `Number()` alone was the defect: it
      // yields NaN for a missing or non-numeric value, NaN is neither null nor
      // undefined so it survives the `??` default below, and `spawnSync` then
      // throws an uncaught RangeError instead of the exit 2 this file documents
      // for a bad argument. `0` was worse — it survives too, and `timeout: 0`
      // means NO timeout to spawnSync, silently removing per-case containment.
      // Hence a floor of 1, which is what `readInt`'s own `min` argument is for.
      const parsed = readInt(argv[++i], 1);
      if (parsed === undefined) {
        process.stderr.write(
          "--timeout must be a positive integer (milliseconds)\n",
        );
        return 2;
      }
      opts.timeoutMs = parsed;
    } else {
      process.stderr.write(`unknown argument: ${a}\n`);
      return 2;
    }
  }
  if (!opts.entry) {
    process.stderr.write("--entry <path#exportName> is required\n");
    return 2;
  }
  if (!opts.sink && !opts.casesFile) {
    process.stderr.write("one of --sink or --cases-file is required\n");
    return 2;
  }

  let cases;
  if (opts.casesFile) {
    try {
      cases = JSON.parse(readFileSync(opts.casesFile, "utf8"));
    } catch (e) {
      process.stderr.write(`cannot read --cases-file: ${e.message}\n`);
      return 2;
    }
  }

  const result = runProbeSpec({
    sink: opts.sink,
    entry: opts.entry,
    cases,
    timeoutMs: opts.timeoutMs,
  });

  const escaped = result.escapes?.length ?? 0;

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    // `escaped` is appended rather than folded into the counts, and it is never
    // omitted when non-zero. The escape sentinel is the last line of
    // containment, and it was the one result this line dropped: an escaping
    // probe printed a clean-looking summary while the sentinel had fired, and
    // only `--json` revealed it.
    process.stdout.write(
      `${result.verdict} (${result.reason}) — executed ${result.executed}, ` +
        `passed ${result.passed}, reproduced ${result.reproduced.length}, ` +
        `declined ${result.declined.length}` +
        (escaped > 0 ? `, ESCAPED ${escaped}` : "") +
        `\n`,
    );
  }

  // `unverifiable` exits 1, not 0. See the exit-code note at the top of the file.
  //
  // An ESCAPE also exits 1, even on an `engages` verdict. A probe that wrote
  // outside its sandbox is not a clean run whatever verdict it earned: the
  // verdict describes the control under probe, the escape describes the probe
  // itself, and a caller reading only `$?` must not be told the second was fine
  // because the first was.
  if (escaped > 0) return 1;
  return result.verdict === "engages" ? 0 : 1;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  process.exitCode = main();
}
