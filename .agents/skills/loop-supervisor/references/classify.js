"use strict";

/**
 * classify.js — pure outcome classifier for loop-supervisor.
 *
 * This is the whole correctness surface of the supervisor, which is why it is
 * its own module with no I/O of its own: it takes a snapshot object and returns
 * `{ outcome, reason }`. Everything that reads the filesystem lives in
 * run-loop.mjs; everything that *decides* lives here and is unit-tested.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: never classify from the assistant's
 * prose. `/develop-next` signals its stop conditions only in its final message
 * — there is no exit code that distinguishes them, no run-report file, no
 * stop-marker. Grepping that message would put a model call inside a
 * control-flow decision (the thing this repo's "No Model Calls for
 * Deterministic Decisions" principle exists to prevent) and would break
 * silently the first time the wording changed. So: filesystem post-conditions
 * only.
 *
 * CommonJS, matching shared/resources/yaml-subset.js — `references/*.js` in
 * this repo are CJS and are imported from `.mjs` callers through Node's
 * named-export interop. No dependencies. Node >= 22.
 */

/** Every outcome this module can return, in precedence order. */
const OUTCOMES = ["done", "error", "halt", "incomplete", "progress", "idle"];

/** Result-envelope `subtype` values that mean the child failed. */
const ERROR_SUBTYPES = new Set(["error_max_turns", "error_during_execution"]);

/**
 * Is a halt/pause file newer than the iteration that just ran?
 *
 * TRAP 1, and the reason this comparison is load-bearing: **the halt file is
 * never deleted by a successful run.** It is overwritten on each halt and left
 * behind forever otherwise, so its mere existence proves nothing. A repo that
 * halted once in March would classify every iteration in April as `halt` and
 * end every loop on its first pass.
 *
 * Both unknown directions fail *stale* on purpose:
 *   - neither timestamp field present   -> stale
 *   - timestamp present but unparseable -> stale
 * Treating an unprovable file as fresh would resurrect exactly the bug above.
 * Treating it as stale costs at most one extra iteration, which a genuine halt
 * will then re-record with a fresh timestamp.
 *
 * @param {object|null} halt parsed halt-file contents, or null when absent
 * @param {number} iterationStartMs epoch ms captured before the child spawned
 * @returns {boolean}
 */
function isHaltFresh(halt, iterationStartMs) {
  if (!halt || typeof halt !== "object") return false;
  const raw = halt.halted_at || halt.paused_at;
  if (!raw) return false;
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return false;
  return ts > iterationStartMs;
}

/**
 * Did the child process itself fail?
 *
 * Distinct from a *pipeline* halt: a pipeline that HALTs at its own gate still
 * exits 0 (the assistant simply stops talking). A non-zero exit, an `is_error`
 * envelope, or an error `subtype` means the supervisor's child broke, which is
 * an infrastructure problem the operator must fix before anything else.
 */
function isChildError(envelope) {
  const { exitCode, isError, subtype } = envelope || {};
  if (isError === true) return true;
  if (typeof subtype === "string" && ERROR_SUBTYPES.has(subtype)) return true;
  if (typeof exitCode === "number" && exitCode !== 0) return true;
  return false;
}

/**
 * Classify one finished iteration.
 *
 * @param {object} snapshot
 * @param {string|null}  snapshot.probeStatus       `selected` | `stop` | `halt` | null
 *        (`null` = adapter has no probe, or the probe was skipped because a
 *        run-state file was already present)
 * @param {string}       [snapshot.probeReason]     the selector's `stopReason`
 * @param {boolean}      snapshot.spawned           did an iteration actually run?
 * @param {boolean}      snapshot.stateFilePresent  run-state file on disk AFTER the child exited
 * @param {boolean}      snapshot.lockPresent       develop-pipeline.lock on disk AFTER the child exited
 * @param {number|null}  [snapshot.lockCurrentStep] `current_step` from that lock
 * @param {object|null}  snapshot.halt              parsed halt-file contents, or null
 * @param {number}       snapshot.iterationStartMs  epoch ms captured before spawn
 * @param {number|null}  snapshot.exitCode          child exit code
 * @param {string|null}  [snapshot.subtype]         result-envelope `subtype`
 * @param {boolean}      [snapshot.isError]         result-envelope `is_error`
 * @param {boolean}      snapshot.progressed        did the adapter's progress oracle fire?
 * @returns {{outcome: string, reason: string}}
 */
function classify(snapshot) {
  const s = snapshot || {};
  const probeStatus = s.probeStatus === undefined ? null : s.probeStatus;
  const probeReason = s.probeReason || "";
  const spawned = s.spawned === true;
  const stateFilePresent = s.stateFilePresent === true;
  const lockPresent = s.lockPresent === true;
  const lockCurrentStep =
    s.lockCurrentStep === undefined ? null : s.lockCurrentStep;
  const halt = s.halt || null;
  const iterationStartMs = s.iterationStartMs || 0;
  const exitCode = s.exitCode === undefined ? null : s.exitCode;
  const subtype = s.subtype === undefined ? null : s.subtype;
  const isError = s.isError === true;
  const progressed = s.progressed === true;

  // 1. `done` — the probe said there is nothing to do, so nothing was spawned.
  //    This is the cheapest possible exit and the one the design optimises for:
  //    never spend a model invocation to learn the frontier is empty.
  if (!spawned) {
    if (probeStatus === "stop") {
      return {
        outcome: "done",
        reason: probeReason
          ? "frontier empty before spawn (" + probeReason + ")"
          : "frontier empty before spawn",
      };
    }
    if (probeStatus === "halt") {
      return {
        outcome: "halt",
        reason: probeReason
          ? "probe could not parse the roadmap (" + probeReason + ")"
          : "probe could not parse the roadmap",
      };
    }
    // The probe itself failed. Its `reason` is the whole value of this branch —
    // it is where the empty-stdout / realpath diagnostic lives, and dropping it
    // would leave the operator with "probe status was error" and nothing to act
    // on. Carry it verbatim.
    return {
      outcome: "error",
      reason: probeReason
        ? "probe failed: " + probeReason
        : "nothing spawned and probe status was " + JSON.stringify(probeStatus),
    };
  }

  // 2. `error` — the child broke. Checked BEFORE `halt` deliberately: a
  //    pipeline halt exits 0, so the two almost never coincide, and when they
  //    do (child killed part-way through writing its halt snapshot) the dead
  //    process is the thing that needs fixing first. A stale halt file must
  //    never be allowed to dress a crash up as an orderly stop.
  if (isChildError({ exitCode, isError, subtype })) {
    const bits = [];
    if (typeof exitCode === "number" && exitCode !== 0) {
      bits.push("exit " + exitCode);
    }
    if (subtype && ERROR_SUBTYPES.has(subtype)) bits.push("subtype " + subtype);
    if (isError === true) bits.push("is_error");
    return { outcome: "error", reason: "child failed (" + bits.join(", ") + ")" };
  }

  // 3. `halt` — a halt file whose timestamp is newer than this iteration's
  //    start. See isHaltFresh for why the comparison, not the existence, is
  //    what counts.
  if (isHaltFresh(halt, iterationStartMs)) {
    const step = halt.halt_step != null ? halt.halt_step : halt.current_step;
    const why = halt.halt_reason || halt.pause_reason || "unspecified";
    const when = halt.halted_at || halt.paused_at;
    return {
      outcome: "halt",
      reason:
        "pipeline halted at step " +
        (step != null ? step : "?") +
        " (" +
        why +
        ")" +
        (when ? " at " + when : ""),
    };
  }

  // 4. `incomplete` — the run did not finish tidying up after itself.
  //
  //    TRAP 2: this is NOT an error, and getting that wrong would end most
  //    long runs prematurely. `develop-pipeline-on-stop.sh` returns
  //    `decision: "block"` while the lock sits at 1 <= current_step <= 8,
  //    forcing one continuation; Claude Code's `stop_hook_active` flag then
  //    caps that to a single block per stop attempt. The net effect is that a
  //    stalled iteration exits cleanly *with the lock still on disk*. That is
  //    the system working as designed, so it gets a first-class outcome and a
  //    bounded resume budget rather than a red light.
  if (stateFilePresent) {
    return {
      outcome: "incomplete",
      reason:
        "run-state file still present — the run did not reach its final step",
    };
  }
  if (lockPresent) {
    return {
      outcome: "incomplete",
      reason:
        "pipeline lock left behind at step " +
        (lockCurrentStep != null ? lockCurrentStep : "?") +
        " — iteration stopped mid-pipeline",
    };
  }

  // 5. `progress` — nothing left behind and the adapter's oracle fired.
  if (progressed) {
    return {
      outcome: "progress",
      reason: "progress oracle fired; no state left behind",
    };
  }

  // 6. `idle` — a clean exit that moved nothing. Benign once; a run of them is
  //    silent spinning, which `--max-idle` catches.
  return {
    outcome: "idle",
    reason: "clean exit but the progress oracle did not fire",
  };
}

/**
 * Does this outcome end the loop, given the configured error policy?
 *
 * `incomplete` is the only outcome whose answer depends on state outside the
 * snapshot — the consecutive-resume budget — so the caller passes it in.
 *
 * @param {string} outcome
 * @param {object} [policy]
 * @param {"stop"|"continue"} [policy.onError] the CLI accepts these two only.
 *        (`retry-once` appears in the design of record but is deliberately not
 *        implemented — `--max-resume-attempts` already bounds the one retry
 *        case that occurs in practice, `incomplete`.)
 * @param {number} [policy.resumeAttempts]    consecutive `incomplete`s so far, including this one
 * @param {number} [policy.maxResumeAttempts]
 * @returns {{stop: boolean, reason: string}}
 */
function shouldStop(outcome, policy) {
  const p = policy || {};
  const onError = p.onError || "stop";
  const resumeAttempts = p.resumeAttempts || 0;
  const maxResumeAttempts =
    p.maxResumeAttempts == null ? 2 : p.maxResumeAttempts;

  switch (outcome) {
    case "done":
      return { stop: true, reason: "frontier empty" };
    case "halt":
    case "error":
      if (onError === "continue") {
        return {
          stop: false,
          reason: outcome + " tolerated by --on-error continue",
        };
      }
      return { stop: true, reason: outcome + " under --on-error " + onError };
    case "incomplete":
      if (resumeAttempts >= maxResumeAttempts) {
        return {
          stop: true,
          reason:
            "resume budget exhausted (" +
            resumeAttempts +
            "/" +
            maxResumeAttempts +
            " consecutive incomplete iterations)",
        };
      }
      return {
        stop: false,
        reason: "resuming (" + resumeAttempts + "/" + maxResumeAttempts + ")",
      };
    case "progress":
    case "idle":
      return { stop: false, reason: "" };
    default:
      return { stop: true, reason: "unknown outcome " + JSON.stringify(outcome) };
  }
}

module.exports = {
  OUTCOMES,
  ERROR_SUBTYPES,
  isHaltFresh,
  isChildError,
  classify,
  shouldStop,
};
