#!/usr/bin/env node
/**
 * select-next.mjs — deterministic roadmap selector for the develop-next skill.
 *
 * Parses a project-completion roadmap (markdown checkbox rows + marker
 * vocabulary defined in references/roadmap-selection.md) and emits a JSON
 * verdict: which item to build next, or why the loop must stop/halt.
 *
 * Design stance: the roadmap is a *living backlog* — completed items are
 * archived out (to roadmap-history.md), so a dep that names no current row
 * means "already shipped", not "error". Parsing is therefore tolerant:
 * halts are reserved for a roadmap that yields no parseable content at all;
 * everything questionable is a warning, surfaced but non-fatal. This is
 * validated against a real ~370-line production roadmap (captured, sanitized,
 * as the 10-real-world unit fixture).
 *
 * Usage:
 *   select-next.mjs [--roadmap <path>]                      # selection (default)
 *   select-next.mjs --batch [--roadmap <path>]              # parallel worktree batch
 *   select-next.mjs --batch --require-touches [...]         # defer un-annotated rows
 *   select-next.mjs --lint [--roadmap <path>]               # format lint + registry frontier
 *   select-next.mjs [--bug-registry <p>] [--task-registry <p>]  # override registry paths
 *
 * Output: JSON on stdout, always.
 * Exit codes:
 *   selection    0 = status "selected" or "stop"; 1 = status "halt" or I/O error
 *   --batch      0 = status "batch"; 1 = status "halt" or I/O error
 *   --lint       0 = no errors (warnings allowed); 1 = errors
 *
 * No dependencies. Node >= 22. Pure functions are exported for unit tests
 * (evals/develop-next/unit/); the CLI runs only when invoked directly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ROADMAP = "docs/development/project-completion-roadmap.md";

// ── Registry fallback frontier ────────────────────────────────────────────────
//
// The roadmap is a hand-maintained index of work that already has two other
// indexes. Filing a bug appends a row to the bug registry; creating a task
// appends a row to the task registry. Both carry a path, a status and a
// priority — everything selection needs. Asking a human to transcribe a subset
// of that into a third place is one manual step between "work exists" and "the
// loop can see it", and it is a step nobody notices skipping, because the
// failure mode is SILENCE: the loop reports `roadmap-complete` and stops, which
// is indistinguishable from there genuinely being nothing to do.
//
// So the registries are a **fallback frontier**, consulted at exactly one point
// — the terminal `roadmap-complete` return — and never before it. Explicit
// human sequencing in a phase always wins; the registries are a floor, not a
// re-ranking. See references/roadmap-selection.md §"Registry fallback frontier".
export const DEFAULT_BUG_REGISTRY = "docs/bugs/bug-registry.md";
export const DEFAULT_TASK_REGISTRY = "docs/tasks/task-registry.md";

// **The task floor EQUALS the set of statuses the dispatching pipeline accepts.**
// That is the load-bearing rule, and it is not a stylistic one: the frontier
// names a command, so a status the command refuses produces a selection nothing
// can act on. `develop-task` Phase 0c HALTs on `Ready for Review`, `accepted`
// and `Cancelled`, so a task in any of those states must stay out — it would
// stop an unattended loop, and because `/develop-next` leaves its run-state file
// in place across a pipeline HALT, the next invocation would resume at the same
// item and stop again. The loop could not self-recover, which is a *worse*
// failure than the silence this whole mechanism exists to remove: it is
// silence's loud cousin, and equally terminal for an overnight run. Found by QA
// (task.65 cycle 1).
//
// The rule was originally the weaker `⊆`. Task 71 tightened it to `===` on the
// task axis, because a strict subset is a gap the selector cannot explain: it
// refuses work the thing it dispatches to would happily accept. Pinned by
// `evals/develop-next/unit/select-next.test.mjs` §"eligibility floor vs
// dispatcher", which parses `develop-task`'s own status table and fails on a
// divergence in EITHER direction — under-widening and over-widening both.
//
// Task 72 then pinned the BUG axis's divergence exactly, against `develop-bug`'s
// own table. So neither axis is `⊆` any more: the task axis asserts equality,
// the bug axis asserts a known two-status gap. See below.
//
// **There is no opt-out, and that is deliberate.** An earlier version of this
// comment argued the opposite — that the floor itself *was* the opt-out, so a
// `draft` task sat outside the frontier BY CONSTRUCTION and no `deferred` park
// value was needed. That argument was coherent and it has been overturned
// (task.71 §2). Three things answer it:
//
//   1. The opt-out was never free — it was paid for by everyone. It parked
//      speculative filings at no cost to their author and charged every REAL
//      filing a manual promotion step. `/create-task` emits `status: planned`,
//      so under the old floor every task in existence entered the world
//      invisible to `/develop-next` and stayed there until a human remembered
//      to run `/review-task` — exactly the manual tracking the registry
//      fallback above was built to remove.
//   2. The failure it prevented costs one visible cycle. A speculative task
//      selected by an unattended loop halts at `develop-task` Step 2 with review
//      findings; nothing merges. The failure it caused costs indefinite silence.
//      A wasted cycle is strictly better than a task nobody can see.
//   3. The review gate moved, it did not disappear. A `draft` task still gets
//      reviewed before any code is written — by `develop-task` Step 2, which is
//      where the review belongs and where it already HALTs on NEEDS REVISION or
//      REQUIRES REWORK.
//
// So a filing that should not be worked is `cancelled`, or is not filed. Adding
// `deferred` to the lifecycle would re-import the "something new to remember"
// cost the old argument correctly warned about.
//
// The two sets are deliberately different, because bugs and tasks do not share
// a lifecycle (docs/standards/bug-documents.md says so explicitly):
//   bug:  new → in-progress → ready-for-qa → closed | reopened
//   task: draft → planned → ready-for-development → in-progress →
//         ready-for-review → accepted | cancelled
//
// **The bug axis keeps a divergence, and task 72 pinned it EXACTLY.** Measured:
// `develop-bug` proceeds on {new, reopened, in-progress, ready-for-qa} while the
// set below is {new, reopened} — a real two-status gap, now asserted as that
// exact set rather than as a subset, so it fails on a change in either
// direction.
//
// The reason it stays is semantic before it is about risk. `develop-bug`'s two
// extra statuses are RESUME AFFORDANCES — `in-progress` is "a prior run may have
// started; resume-aware", `ready-for-qa` is "proceed toward verification if a fix
// already exists". They exist so a re-invoked pipeline does not HALT on its own
// half-finished work; they are not a claim that work is available to nominate.
// Selecting on them would hand an unattended loop a bug a human may be actively
// holding, or one whose fix is written and only awaiting verification. That is
// why task 71's equality rule is right for the task axis and wrong for this one.
// See the bug half of §"eligibility floor vs dispatcher" in the test file.
export const BUG_ELIGIBLE_STATUSES = new Set(["new", "reopened"]);
export const TASK_ELIGIBLE_STATUSES = new Set([
  "draft",
  "planned",
  "ready-for-development",
  "in-progress",
]);

// The full LIFECYCLES — every status a document of that kind may legally carry.
// A strict superset of the floors above, and a different question from them:
//
//   floor     : "should this row be nominated for work now?"
//   lifecycle : "is this string a status at all?"
//
// bug.8. Until these existed, the frontier could only answer the first, so its
// rejection branch gave `closed` (valid, terminal, nothing to do) and `open`
// (not a status — a filing typo) the identical sentence. On this repo's own
// corpus that hid a real typo among 8 closed bugs and ~90 accepted tasks, and
// the two bugs it actually happened to sat unselectable on `develop` for days.
//
// Do NOT collapse these into the floors. The gap between them is deliberate and
// argued at length above; what was missing was the second vocabulary, not a
// wider first one.
//
// Sources of truth these mirror, and which a test in
// evals/develop-next/unit/select-next.test.mjs parses and compares against:
//   bug  → docs/standards/bug-documents.md §"Frontmatter schema"
//   task → shared/resources/document-status-lifecycle.md
export const BUG_LIFECYCLE_STATUSES = new Set([
  "new",
  "in-progress",
  "ready-for-qa",
  "closed",
  "reopened",
]);
export const TASK_LIFECYCLE_STATUSES = new Set([
  "draft",
  "planned",
  "ready-for-development",
  "in-progress",
  "ready-for-review",
  "accepted",
  "cancelled",
]);

// Ordering vocabularies. Lower rank sorts first. An unrecognised value sorts
// LAST within its tier rather than throwing — a registry is hand-maintained and
// a typo in a severity cell must not decide whether work is visible at all.
const SEVERITY_RANK = {
  blocker: 0,
  critical: 0,
  major: 1,
  minor: 2,
  trivial: 3,
};
const PRIORITY_RANK = {
  highest: 0,
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
};
const UNRANKED = 99;

const rankOf = (table, v) =>
  (v && table[String(v).trim().toLowerCase()]) ?? UNRANKED;

// Item ids: 5.1a, 8.4-2, 17.3-1, 13.1-1, 21.2a, 7.11-NFR2 …
// …plus two prefixed standalone forms: `T` for tasks (T22, T26) and `B` for
// general bugs (B2). The prefix is load-bearing: task, epic and bug numbers all
// share this namespace (a Task 22, an Epic 22 and a Bug 22 can coexist), so a
// bare `22` would be ambiguous. Without the `T` alternative those rows parsed as
// id-less and — worse — `deps: T22` was silently dropped, letting a dependent be
// selected while its hard prerequisite was unbuilt.
//
// `B` was added for the same reason, found the same way. A bug row could always
// borrow a story-shaped id from its surrounding epic (`4.1`), but a GENERAL bug has
// no parent epic to borrow from — so in a maintenance phase, which has no epic at
// all, there was no correct id to write. `**B2**` fell outside the grammar, the row
// was rejected as "no item id" and SILENTLY SKIPPED, and the loop selected the row
// below it. A backlog row that cannot be named cannot be worked.
//
// Both letters must be followed by a digit, so prose like "Task 22" still yields
// only `22`. The residual cost is the same for both: a bare `B2`-shaped token in
// free text inside a `deps:` or `⛔` segment would read as an id.
const ID_RE_SRC = "[TB]?\\d+(?:\\.\\d+)*[a-z]?(?:-[A-Za-z0-9]+)*";
const ID_RE = new RegExp(ID_RE_SRC);
const ID_TOKEN_RE = new RegExp(`(?<![\\w.-])(${ID_RE_SRC})`, "g");
const ROW_RE = /^(\s*)[-*]\s*\[([ xX])\]\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const EXCLUDED_HEADING_RE = /deferred|human.?gated|housekeeping|change\s*log/i;
// The optional inline path must not start with `[`. Both an inline path and a
// markdown link are documented as valid ways to name the work item, but without
// that exclusion the inline alternative wins on a link-form row and captures the
// SYNTAX rather than the href — `/develop-bug [bug](x/y.md)` yielded the literal
// `[bug](x/y.md` (the class stops at `)`, so even the bracket is unbalanced).
// That is worse than not matching: it is a malformed path the caller would go on
// to dispatch, instead of falling through to MD_LINK_RE which resolves it
// correctly. Excluding `[` makes the two forms unambiguous rather than racing.
const COMMAND_RE =
  /\/(develop-story|develop-task|develop-bug|create-story|create-epic|create-task)(?:\s+`?([^\s`)\[]+\.md))?/;
const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const SKIP_RE = /⏭️|⏭|\bSKIP\b/;
// `touches:` — the write-footprint field (see references/roadmap-selection.md and
// the roadmap's "Conflict footprint" legend). Comma-separated resource tags, each
// optionally suffixed `!` (hard/exclusive — serialize) or `~`/unmarked (soft/additive
// — parallel OK, second-merger rebases). `+own` / `-` mean "no shared resource".
// Terminated by ` · ` like deps:/gate:/flag:, so it never disturbs their captures.
const TOUCHES_RE = /touches:\s*([^·|]+?)(?=·|\bgate:|\bflag:|$)/i;

/** Strip leading markdown decoration (strikethrough, bold, emphasis) so ids parse. */
function undecorate(s) {
  return s.replace(/^\s*(?:~~|\*\*|\*|_)+\s*/, "");
}

/** Parse a `touches:` field into [{tag, hard}]. `!`=hard, `~`/unmarked=soft, `+own`/`-`=dropped. */
export function parseTouches(rest) {
  const m = rest.match(TOUCHES_RE);
  if (!m) return [];
  const out = [];
  for (const seg of m[1].split(",")) {
    let s = seg.trim();
    if (!s || s === "+own" || s === "-") continue;
    const hard = /!$/.test(s);
    s = s.replace(/[~!]+$/, "").trim();
    if (s) out.push({ tag: s, hard });
  }
  return out;
}

function idTokens(text) {
  return [...text.matchAll(ID_TOKEN_RE)].map((m) => m[1]);
}

/**
 * `T22` (task) or `B2` (general bug) — a STANDALONE row, as opposed to an epic
 * story row. Both are excluded from their surrounding epic's completion set: they
 * are conventionally written inside a consumer epic's section for readability, but
 * an epic is complete once its own stories are accepted regardless of them.
 */
function isStandaloneId(id) {
  return /^[TB]\d/.test(id);
}

/**
 * First markdown-link href that points at a story/task/bug file, else null.
 *
 * `bug` is load-bearing for general bugs only: story bugs
 * (`story.2.3.bug.1.x.md`) and task bugs (`task.44.bug.1.x.md`) already match on
 * their `story.`/`task.` prefix, but a general bug is `bug.{N}.{name}.md`
 * (docs/standards/file-naming.md) and would otherwise resolve to null — turning
 * an otherwise-valid `/develop-bug` row into a "no resolvable path" stop.
 */
function workItemPath(text) {
  for (const m of text.matchAll(MD_LINK_RE)) {
    if (isWorkItemHref(m[1])) return m[1];
  }
  return null;
}

/**
 * Does this href name a work-item document (`story.` / `task.` / `bug.` stem)?
 *
 * Shared by `workItemPath` (roadmap rows) and `parseRegistry` (registry rows).
 * They used to disagree: the registry parser accepted any `.md`, so a title
 * carrying a nested or preceding link — `[See [x](y.md)](task.1.a/task.1.a.md)` —
 * resolved to `y.md`. That fails conservatively (the row is then rejected as
 * "document missing", so nothing wrong is dispatched) but it makes work
 * invisible for an unobvious reason, which is the failure this file exists to
 * stop producing. One predicate, one behaviour.
 */
function isWorkItemHref(href) {
  return /(?:^|\/)(?:story|task|bug)\.[^/]*\.md$/i.test(href);
}

/**
 * Parse roadmap markdown into a structural model.
 * @param {string} text
 * @returns {object} model: { phases, rows, flows, epicSections, byId, errors, warnings }
 */
export function parseRoadmap(text) {
  const lines = text.split("\n");
  const model = {
    phases: [], // { index, name, line }
    rows: [], // see row shape below
    flows: {}, // epicNum -> [ [ids…], … ] (→-separated segments; ‖ within)
    epicSections: {}, // epicNum -> { name, depth, rowIds: [] }
    // Checkbox rows seen but dropped for sitting in an excluded section. Kept so
    // "this file has no rows at all" can be told apart from "every row is archived
    // or deferred" — the first is the wrong file, the second is a finished roadmap.
    excludedRows: 0,
    errors: [],
    warnings: [],
  };

  let phaseIdx = null;
  let excluded = null; // { depth } when inside an excluded section
  let epic = null; // { num, depth } when inside an Epic section
  const sawPhaseHeading = () => model.phases.length > 0;

  lines.forEach((line, i) => {
    const ln = i + 1;
    const h = line.match(HEADING_RE);
    if (h) {
      const depth = h[1].length;
      const title = h[2].trim();
      if (excluded && depth <= excluded.depth) excluded = null;
      if (epic && depth <= epic.depth) epic = null;

      if (/\bPHASE\b/i.test(title)) {
        model.phases.push({
          index: model.phases.length,
          name: title,
          line: ln,
        });
        phaseIdx = model.phases.length - 1;
        excluded = null;
        return;
      }
      if (EXCLUDED_HEADING_RE.test(title)) {
        excluded = { depth };
        return;
      }
      const em = title.match(/\bEpic\s+(\d+)\b/i);
      if (em) {
        epic = { num: em[1], depth };
        if (!model.epicSections[epic.num])
          model.epicSections[epic.num] = { name: title, depth, rowIds: [] };
      }
      return;
    }

    // Epic flow line: "**Flow: `17.1 → 17.2 → (17.4 ‖ 17.3-1)`.**"
    const fm = line.match(/^\s*(?:[-*]\s*)?\**Flow\**\s*:?\s*[^`]*`?(.+)$/i);
    if (fm && epic && /→|->/.test(fm[1])) {
      const segments = fm[1]
        .split(/→|->/)
        .map(idTokens)
        .filter((seg) => seg.length);
      if (segments.length) model.flows[epic.num] = segments;
      return;
    }

    const rm = line.match(ROW_RE);
    if (!rm) return;
    if (excluded) {
      // Never a candidate — but count it, so a roadmap whose every row has been
      // archived at phase close is not mistaken for a file that is not a roadmap.
      model.excludedRows += 1;
      return;
    }
    const indent = rm[1].length;
    const rest = rm[3];
    const ticked = rm[2].toLowerCase() === "x";

    const idm = undecorate(rest).match(new RegExp(`^(${ID_RE_SRC})\\b`));
    if (!idm) {
      // Annotation / sub-checklist / prose checkbox — not a work item. Skip it,
      // but only note it (as a warning) when it sits in phase scope and is
      // outstanding; a ticked annotation is pure noise.
      if (!ticked && (phaseIdx !== null || !sawPhaseHeading())) {
        model.warnings.push(
          `line ${ln}: checkbox row has no item id, skipped: "${undecorate(rest).slice(0, 60)}"`,
        );
      }
      return;
    }
    const id = idm[1];

    const deps = [];
    const dm = rest.match(/deps:\s*([^·|]+?)(?=·|\bgate:|\bflag:|$)/i);
    if (dm) {
      for (const seg of dm[1].split(",")) {
        const s = seg.trim();
        // "no deps" markers. `\b` cannot follow a dash (both sides non-word), so
        // the previous `…|-)\b` never matched `deps: —` and it fell through to the
        // "has no item id — ignored" warning: harmless but noisy, and noise in this
        // channel is what hid the dropped `deps: T22`. `(?![\w-])` matches the bare
        // marker while still rejecting "-foo".
        if (!s || /^(?:none|n\/a|[—–-])(?![\w-])/i.test(s)) continue;
        const shipped = /shipped/i.test(s);
        const ids = idTokens(s);
        if (!ids.length) {
          if (!shipped)
            model.warnings.push(
              `line ${ln}: dep segment "${s.slice(0, 40)}" on ${id} has no item id — ignored`,
            );
          continue;
        }
        for (const d of ids) deps.push({ id: d, shipped });
      }
    }

    let blockedUntil = [];
    if (/⛔/.test(rest)) {
      const bm = rest.match(/⛔[^·|]*/);
      blockedUntil = idTokens(bm ? bm[0] : "");
      if (!blockedUntil.length) {
        model.warnings.push(
          `line ${ln}: ⛔ annotation on ${id} names no item ids — treated as blocked`,
        );
        blockedUntil = ["<unparsed>"];
      }
    }

    const cm = rest.match(COMMAND_RE);
    const row = {
      id,
      line: ln,
      phase: phaseIdx,
      indent,
      epic: epic ? epic.num : null,
      ticked,
      skip: SKIP_RE.test(rest),
      manual: /\bmanual\b/i.test(rest),
      gated: /🚧/.test(rest),
      command: cm ? `/${cm[1]}` : null,
      // Path may be inline after the command, or in a [story](…)/[task](…) link.
      commandArg: (cm && cm[2]) || workItemPath(rest),
      touches: parseTouches(rest),
      // Whether a `touches:` field was written at all — true even for `+own`/`-`
      // (author explicitly confirmed no shared resource), false when the field is
      // absent (author forgot). `parseTouches` erases this distinction (both yield
      // `[]`), so the batch planner needs the raw presence flag to warn on the
      // un-annotated case without penalising a deliberate `+own`.
      touchesAnnotated: TOUCHES_RE.test(rest),
      deps,
      blockedUntil,
      raw: rest.trim(),
    };
    model.rows.push(row);
    // A `T`-row is a cross-cutting standalone task that lives in its *consumer*
    // epic's section for readability — it is not a story of that epic, so epic
    // completion must not wait on it (otherwise a task row would strand its host
    // epic). It stays in `byId`/`idInstances`, so deps on it still resolve.
    if (epic && !isStandaloneId(id))
      model.epicSections[epic.num].rowIds.push(id);
    if (sawPhaseHeading() && phaseIdx === null && !ticked) {
      model.warnings.push(
        `line ${ln}: outstanding row ${id} appears before the first PHASE heading — ignored`,
      );
    }
  });

  if (!sawPhaseHeading()) {
    model.phases.push({
      index: 0,
      name: "(implicit — no PHASE headings)",
      line: 0,
    });
    for (const r of model.rows) r.phase = 0;
  }

  index(model);
  lintModel(model);
  return model;
}

function index(model) {
  const byId = new Map(); // id -> first row
  const idInstances = new Map(); // id -> [rows]
  for (const r of model.rows) {
    if (!byId.has(r.id)) byId.set(r.id, r);
    if (!idInstances.has(r.id)) idInstances.set(r.id, []);
    idInstances.get(r.id).push(r);
  }
  model.byId = byId;
  model.idInstances = idInstances;
}

function lintModel(model) {
  // A roadmap that parses to nothing is the one genuinely fatal case — it means
  // this is almost certainly not a roadmap, or the path is wrong.
  //
  // But "no candidate rows" is NOT that. When every phase has been archived at
  // close, the only rows left are Deferred / Housekeeping / Change Log ones, which
  // are excluded by design — so a complete, correctly-maintained roadmap parses to
  // zero candidates. Erroring there turns the roadmap's own housekeeping rule into
  // a HALT: `/develop-next` reports "is this a roadmap?" instead of "nothing left
  // to do". `excludedRows` is what tells the two apart.
  if (model.rows.length === 0 && model.excludedRows === 0) {
    model.errors.push("no parseable checkbox rows found — is this a roadmap?");
    return;
  }
  if (model.rows.length === 0) return; // archived/deferred-only: valid and complete
  for (const [id, rows] of model.idInstances) {
    if (rows.length < 2) continue;
    const outstanding = rows.filter((r) => !r.ticked && !r.skip);
    const msg = `id ${id} appears ${rows.length}× (lines ${rows.map((r) => r.line).join(", ")})`;
    // Two live, buildable rows sharing an id is a real ambiguity → error.
    // A recap/summary restating a done id is just noise → warning.
    if (outstanding.length > 1)
      model.errors.push(`duplicate outstanding ${msg}`);
    else model.warnings.push(`duplicate ${msg} — recap/summary assumed`);
  }
  for (const r of model.rows) {
    for (const d of r.deps) {
      if (!d.shipped && !model.byId.has(d.id) && !model.epicSections[d.id]) {
        model.warnings.push(
          `line ${r.line}: ${r.id} dep ${d.id} not in the current backlog — assumed shipped/archived`,
        );
        continue;
      }
      // `idDone` treats an all-SKIP id as done, so this dep resolves as satisfied
      // while its target is explicitly deferred. That is intended (a SKIP block must
      // not stall the loop), but it means `r` can be built with `d` unbuilt and
      // nothing else says so — surface it rather than letting it pass mute.
      const targets = model.idInstances.get(d.id);
      if (
        !d.shipped &&
        targets &&
        targets.length &&
        targets.every((t) => t.skip)
      ) {
        model.warnings.push(
          `line ${r.line}: ${r.id} dep ${d.id} is ⏭️ SKIP — dep treated as satisfied; ${r.id} may build before ${d.id} exists`,
        );
      }
    }
    for (const b of r.blockedUntil) {
      if (b !== "<unparsed>" && !model.byId.has(b)) {
        model.warnings.push(
          `line ${r.line}: ${r.id} is ⛔ blocked on ${b}, which is not a current row — kept blocked`,
        );
      }
    }
  }
}

/** An id counts as done if any instance is ticked, or exists only as a skip row. */
function idDone(model, id) {
  const rows = model.idInstances.get(id);
  if (!rows) return null; // unknown
  if (rows.some((r) => r.ticked)) return true;
  if (rows.every((r) => r.skip)) return true;
  return false; // present as an outstanding row → not done
}

function epicActionable(model, epicNum) {
  const section = model.epicSections[epicNum];
  if (!section) return null;
  return section.rowIds
    .map((id) => model.byId.get(id))
    .some((r) => r && !r.ticked && !r.skip);
}

function depSatisfied(model, dep) {
  if (dep.shipped) return true;
  const done = idDone(model, dep.id);
  if (done !== null) return done;
  const epicOutstanding = epicActionable(model, dep.id); // "deps: Epic 8"
  if (epicOutstanding !== null) return !epicOutstanding;
  return true; // archived out of the backlog → shipped
}

/** Ids from earlier flow segments not yet done, blocking `row`. */
function flowBlockers(model, row) {
  if (!row.epic || !model.flows[row.epic]) return [];
  const segments = model.flows[row.epic];
  const segIdx = segments.findIndex((seg) => seg.includes(row.id));
  if (segIdx <= 0) return [];
  const blockers = [];
  for (let s = 0; s < segIdx; s++) {
    for (const fid of segments[s]) {
      if (idDone(model, fid) === false) blockers.push(fid);
    }
  }
  return blockers;
}

/**
 * Run the selection algorithm over a parsed model.
 * @returns {{status: "selected"|"stop"|"halt", ...}}
 */
export function selectNext(model, opts = {}) {
  const lint = { errors: model.errors, warnings: model.warnings };
  if (model.errors.length) {
    return {
      status: "halt",
      haltReason: model.errors[0],
      item: null,
      skipped: [],
      lint,
    };
  }

  const skipped = [];
  const phaseNotes = [];
  const isActionable = (r) => !r.ticked && !r.skip;

  for (const phase of model.phases) {
    const rows = model.rows.filter((r) => r.phase === phase.index);
    if (!rows.some(isActionable)) continue;

    const blockingIds = new Set();

    for (const row of rows) {
      if (!isActionable(row)) continue;

      if (row.manual || row.gated) {
        return {
          status: "stop",
          stopReason: "human-gated",
          item: pickItem(row, phase),
          detail: `${row.id} is ${row.manual ? "`manual`" : "🚧 gated"} — operator action required; never auto-select, never scan past`,
          skipped,
          lint,
        };
      }
      if (row.command && /^\/create-/.test(row.command)) {
        return {
          status: "stop",
          stopReason: "planning-gap",
          item: pickItem(row, phase),
          detail: `${row.id} needs ${row.command} — authoring is interactive and needs human review; run it attended`,
          skipped,
          lint,
        };
      }

      const reasons = [];
      const unsatBlocked = row.blockedUntil.filter(
        (b) => b === "<unparsed>" || idDone(model, b) !== true,
      );
      if (unsatBlocked.length) {
        reasons.push(`⛔ blocked until ${unsatBlocked.join(", ")} accepted`);
        unsatBlocked.forEach((b) => blockingIds.add(b));
      }
      const fb = flowBlockers(model, row);
      if (fb.length) {
        reasons.push(`flow-chain: ${fb.join(", ")} not yet accepted`);
        fb.forEach((b) => blockingIds.add(b));
      }
      const unsatDeps = row.deps.filter((d) => !depSatisfied(model, d));
      if (unsatDeps.length) {
        reasons.push(
          `deps unsatisfied: ${unsatDeps.map((d) => d.id).join(", ")}`,
        );
        unsatDeps.forEach((d) => blockingIds.add(d.id));
      }
      if (reasons.length) {
        skipped.push({
          id: row.id,
          line: row.line,
          reason: reasons.join("; "),
        });
        continue;
      }

      if (!row.command || !/^\/develop-(story|task|bug)$/.test(row.command)) {
        // Eligible but not auto-runnable (e.g. a "run /review-prd" checkpoint).
        // Pause for the operator rather than erroring — the loop is unattended.
        return {
          status: "stop",
          stopReason: "manual-checkpoint",
          item: pickItem(row, phase),
          detail: `${row.id} is the next item but names no /develop-story, /develop-task or /develop-bug command — operator must action or annotate it`,
          skipped,
          lint,
        };
      }
      if (!row.commandArg) {
        return {
          status: "stop",
          stopReason: "manual-checkpoint",
          item: pickItem(row, phase),
          detail: `${row.id} names ${row.command} but no resolvable story/task/bug path (expected a [story](…)/[task](…)/[bug](…) link) — operator must fix the row`,
          skipped,
          lint,
        };
      }

      return {
        status: "selected",
        item: pickItem(row, phase),
        rationale: buildRationale(model, row, phase, skipped, phaseNotes),
        skipped,
        lint,
      };
    }

    // Phase exhausted with actionable-but-blocked rows. Phases are hard
    // boundaries: advance only if every blocker lives in a later phase
    // (a forward dep can't resolve without running the later phase first).
    const nonForward = [...blockingIds].filter((id) => {
      const b = model.byId.get(id);
      return !b || b.phase === null || b.phase <= phase.index;
    });
    if (nonForward.length) {
      return {
        status: "stop",
        stopReason: "phase-blocked",
        item: null,
        detail: `${phase.name}: no eligible rows; blocked within the phase by ${nonForward.join(", ")} — operator decides (phases are hard boundaries)`,
        skipped,
        lint,
      };
    }
    phaseNotes.push(
      `${phase.name}: outstanding rows blocked only by later-phase items (${[...blockingIds].join(", ")}) — advanced past it`,
    );
  }

  // ── The single point at which the registries are consulted ────────────────
  //
  // Every earlier `return {status:"stop"}` — human-gated, planning-gap,
  // manual-checkpoint, phase-blocked — has already returned by now, untouched.
  // That is the whole safety argument: the fallback replaces SILENCE, never a
  // deliberate halt. A human gate must never be scanned past, and if the loop
  // could reach the registries from any other stop it would look like it was
  // working while quietly stepping over an operator's decision — the hardest
  // failure in this file to detect in production. Pinned by one test per stop
  // reason (§15/SC9), each asserting the loader was not merely ignored but
  // never CALLED.
  //
  // The loader is injected and LAZY: no registry is read unless this line runs.
  if (typeof opts.loadRegistries === "function") {
    const frontier = registryFrontier(opts.loadRegistries());
    // `warnings` used to be returned only under `--lint`, so the one caller that
    // most needed them — an unattended `/develop-next` loop reporting
    // `roadmap-complete` — was the one caller that could not see them (bug.8).
    const registryFrontierOut = {
      passedOver: frontier.passedOver,
      warnings: frontier.warnings,
    };
    if (frontier.selected) {
      return {
        status: "selected",
        item: frontier.selected,
        rationale: buildRegistryRationale(frontier, skipped),
        skipped,
        registryFrontier: registryFrontierOut,
        lint,
      };
    }
    // `roadmap-complete` is indistinguishable from "there is genuinely nothing
    // to do" — which is the failure the registry fallback exists to remove. A
    // row that can never be selected because its status is misspelled must say
    // so in the one line a human or a loop log actually reads.
    const offLifecycle = frontier.passedOver.filter((p) => p.offLifecycle);
    return {
      status: "stop",
      stopReason: "roadmap-complete",
      item: null,
      detail:
        `no actionable candidate rows in any phase, and no outstanding registry item ` +
        `(${frontier.candidates} registry row(s) considered)` +
        (offLifecycle.length
          ? ` — WARNING: ${offLifecycle.length} row(s) carry a status outside their lifecycle and can never be selected: ` +
            `${offLifecycle.map((p) => `${p.path} (${p.documentStatus})`).join(", ")}`
          : ""),
      skipped,
      registryFrontier: registryFrontierOut,
      lint,
    };
  }

  return {
    status: "stop",
    stopReason: "roadmap-complete",
    item: null,
    detail: "no actionable candidate rows in any phase",
    skipped,
    lint,
  };
}

function buildRegistryRationale(frontier, skipped) {
  const it = frontier.selected;
  const parts = [
    `no phase held an actionable row; fell through to the ${it.source}`,
    `selected ${it.id} (registry line ${it.line}) — document status ${it.documentStatus}`,
  ];
  if (it.registryStatus !== it.documentStatus) {
    parts.push(
      `registry row says ${it.registryStatus}; the document's frontmatter is authoritative and says ${it.documentStatus}`,
    );
  }
  // Distinguish the two kinds of pass-over. Reporting them as one number reads
  // as "32 rows were rejected" when 34 of them were never looked at, which is
  // the kind of quietly-wrong count this feature exists to stop producing.
  const rejected = frontier.passedOver.filter(
    (r) => r.eligible === false,
  ).length;
  const unevaluated = frontier.passedOver.filter(
    (r) => r.eligible === null,
  ).length;
  if (rejected || unevaluated)
    parts.push(
      `${rejected} registry row(s) rejected on document status, ${unevaluated} not evaluated (see registryFrontier.passedOver; --lint evaluates all)`,
    );
  if (skipped.length)
    parts.push(`${skipped.length} roadmap row(s) skipped (see skipped[])`);
  return parts.join("; ");
}

function pickItem(row, phase) {
  return {
    id: row.id,
    line: row.line,
    phase: phase.name,
    epic: row.epic,
    command: row.command,
    commandArg: row.commandArg,
    raw: row.raw,
    // `source` is emitted on EVERY selection, roadmap ones included. A field
    // present only sometimes is an implicit contract — a consumer would have to
    // infer "absent means roadmap", and that inference is exactly the kind of
    // unwritten rule this selector exists to replace. Uniform shape, one code
    // path, and the run report can always state provenance.
    source: "roadmap",
  };
}

function buildRationale(model, row, phase, skipped, phaseNotes) {
  const parts = [`selected ${row.id} in "${phase.name}" (line ${row.line})`];
  parts.push(
    row.deps.length
      ? `deps satisfied: ${row.deps.map((d) => `${d.id}${d.shipped ? " (shipped)" : ""}`).join(", ")}`
      : "no deps",
  );
  if (skipped.length)
    parts.push(`${skipped.length} earlier row(s) skipped (see skipped[])`);
  if (phaseNotes.length) parts.push(...phaseNotes);
  return parts.join("; ");
}

// ── Registry parsing + the fallback frontier ─────────────────────────────────

/**
 * Read a `status:` value out of a document's YAML frontmatter.
 *
 * Deliberately minimal — this reads ONE scalar out of the leading `---` block
 * and does not attempt to be a YAML parser. Returns null when there is no
 * frontmatter or no `status:` key, which the caller treats as "not a candidate"
 * rather than as an error.
 *
 * @param {string} text
 * @returns {string|null} lowercase-kebab status, or null
 */
export function parseFrontmatterStatus(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^status\s*:/.test(l));
  if (!line) return null;
  let v = line.replace(/^status\s*:/, "").trim();
  v = v.replace(/\s+#.*$/, "").trim(); // strip a trailing comment
  v = v.replace(/^['"]|['"]$/g, "").trim();
  return v ? v.toLowerCase() : null;
}

/** A markdown table separator row (`| --- | :--: |`). */
const TABLE_SEPARATOR_RE = /^\|[\s:|-]*\|?\s*$/;

/**
 * Split one markdown table row into trimmed cells, or null for a non-row line.
 * Separator rows are the caller's business — it needs to see them, because a
 * separator is what promotes the line above it from "maybe a header" to "the
 * header", which is how a header is told apart from a typo'd data row.
 */
function tableCells(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const inner = t.replace(/^\|/, "").replace(/\|\s*$/, "");
  return inner.split("|").map((c) => c.trim());
}

// Header cell name → the field it supplies. A consumer's registry is a
// hand-maintained markdown table, so accept the obvious synonyms rather than
// demanding one spelling.
const COLUMN_ALIASES = {
  "#": "n",
  no: "n",
  num: "n",
  number: "n",
  id: "n",
  title: "title",
  name: "title",
  status: "status",
  severity: "severity",
  priority: "priority",
  deps: "deps",
  dep: "deps",
  "depends on": "deps",
  "depends-on": "deps",
  depends_on: "deps",
  "blocked by": "deps",
};

// Documented positions, used when a registry has no recognisable header.
//   bug:  | # | Title | Status | Severity | Priority | Created | Area |
//   task: | # | Title | Status | Category | Priority | Created | Issue | Deps |
const DEFAULT_COLUMNS = {
  bug: { n: 0, title: 1, status: 2, severity: 3, priority: 4 },
  task: { n: 0, title: 1, status: 2, priority: 4, deps: 7 },
};

// A dependency reference inside a registry `Depends on` cell. Accepts the forms
// a hand-maintained table actually carries: `task.83`, `T83`, `bug.4`, `B4`,
// `#83`, and a bare `83` (read as the same kind as the row declaring it).
// The number is captured WITH any dotted segments so a story-shaped reference is
// consumed whole. Matching a bare `\d+` here would take `story.2.3` as story 2
// plus a stray task 3 — inventing a dependency nobody declared.
const DEP_REF_RE =
  /(?:\b(task|bug|story)\s*[.#-]?\s*|\b([TB]))?(\d+(?:\.\d+)*)\b/gi;

// Cell values that mean "no dependency". A registry is hand-maintained, so the
// em-dash this repo uses is only one of the spellings that show up.
const DEP_EMPTY_RE = /^(?:[—–-]|none|n\/a|na|tbd)$/i;

/**
 * Parse a registry `Depends on` cell into `{kind, n}` references.
 *
 * `kind` defaults to the declaring row's kind, so a bare `83` in the task
 * registry means task 83. Story references are dropped: stories are not
 * registry rows and cannot be resolved here.
 *
 * @param {string} cell raw cell text
 * @param {"bug"|"task"} kind kind of the row declaring the dependency
 * @returns {{kind: "bug"|"task", n: number}[]} deduped, in declaration order
 */
export function parseDepCell(cell, kind) {
  const text = (cell || "").trim();
  if (!text || DEP_EMPTY_RE.test(text)) return [];
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(DEP_REF_RE)) {
    const word = (m[1] || "").toLowerCase();
    const letter = (m[2] || "").toUpperCase();
    // Stories are not registry rows, and neither is anything carrying a dotted
    // number (`story.2.3`, or a bare `2.3`) — there is nothing here to resolve
    // it against, so declaring it a dependency would block on a phantom.
    if (word === "story" || m[3].includes(".")) continue;
    let k = kind;
    if (word === "task" || letter === "T") k = "task";
    else if (word === "bug" || letter === "B") k = "bug";
    const n = Number(m[3]);
    const key = `${k}${n}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: k, n });
  }
  return out;
}

/** Map a header row's cells to field indices; null if it names nothing we know. */
function mapHeader(cells) {
  const cols = {};
  cells.forEach((c, i) => {
    const key = COLUMN_ALIASES[c.trim().toLowerCase()];
    if (key !== undefined && cols[key] === undefined) cols[key] = i;
  });
  return cols.n !== undefined && cols.title !== undefined ? cols : null;
}

/**
 * Parse a bug or task registry's markdown table.
 *
 * Tolerance is the whole point (SC7). A consumer repo may have neither
 * registry; a hand-edited row may be malformed. Neither may suppress the rows
 * around it, and neither may throw — a registry problem must degrade to today's
 * behaviour, never to a HALT.
 *
 * **Columns are read by NAME when the table has a header**, falling back to the
 * documented positions only when it does not. Reading `cells[4]` unconditionally
 * was silently wrong for any consumer who ordered their columns differently: a
 * registry with Priority and Category swapped parsed `priority` as `"infra"`,
 * so the ordering this module documents as deterministic returned the wrong item
 * first. It could never cause a wrong *selection* — the document's frontmatter
 * owns eligibility — which is exactly why it would have gone unnoticed.
 *
 * **A non-numeric id is a malformed row, not a header.** The header is
 * identified positionally (the line above the `| --- |` separator), so a row
 * written `| T65 | … |` — the prefixed form the roadmap uses, an easy thing to
 * carry across by hand — is now reported rather than silently skipped. The
 * previous guard could not tell the two apart, so a typo made a work item
 * invisible: out of the frontier *and* absent from `--lint`, which is the one
 * outcome this design forbids.
 *
 * @param {string} text  registry markdown ("" or null for an absent registry)
 * @param {"bug"|"task"} kind
 * @param {string} registryPath  repo-root-relative path, used to resolve hrefs
 * @returns {{rows: object[], malformed: object[], warnings: string[]}}
 */
export function parseRegistry(text, kind, registryPath) {
  const rows = [];
  const malformed = [];
  const warnings = [];
  if (typeof text !== "string" || !text.trim())
    return { rows, malformed, warnings };

  const dir = path.posix.dirname(
    String(registryPath || "")
      .split(path.sep)
      .join("/"),
  );
  const defaults = DEFAULT_COLUMNS[kind] || DEFAULT_COLUMNS.task;
  const lines = text.split(/\r?\n/);
  let fenced = false;
  let cols = null; // resolved from the header, once seen
  let pendingHeader = null; // the line above a separator is the header

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A pipe table inside a fenced block is an EXAMPLE, not the registry. The
    // task registry's own "Quick commands" block is fenced; a future doc block
    // showing a sample row must not enter the frontier.
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      pendingHeader = null;
      continue;
    }
    if (fenced) continue;

    const t = line.trim();
    if (!t.startsWith("|")) {
      // Prose or a blank line ends the table — and ends its COLUMN MAPPING too.
      // Resetting `pendingHeader` alone left `cols` set for the rest of the
      // document, so every later table was parsed as registry data: a `## Notes`
      // key/value table produced spurious "malformed row" entries, and a second
      // registry section's own header was reported as `id cell "#" is not a
      // number`. That could not select anything wrong — malformed rows never
      // become candidates — but it polluted the `--lint` report the visibility
      // guarantee depends on, which is the same defect as the invisible-row one
      // it was introduced to fix, pointed the other way.
      //
      // Resetting both is self-correcting rather than special-cased: a stray
      // `| Key | Meaning |` header fails `mapHeader` (it names neither an id nor
      // a title column), so `cols` stays null, the row becomes a header
      // candidate, and the stray table is ignored. No allowlist of tables to
      // skip is needed. Found by QA cycle 2; pinned by §17.
      pendingHeader = null;
      cols = null;
      continue;
    }
    if (TABLE_SEPARATOR_RE.test(t)) {
      if (pendingHeader) {
        const mapped = mapHeader(pendingHeader);
        if (mapped) {
          cols = mapped;
          for (const field of kind === "bug"
            ? ["status", "severity", "priority"]
            : ["status", "priority"]) {
            if (cols[field] === undefined && defaults[field] !== undefined) {
              cols[field] = defaults[field];
              warnings.push(
                `${registryPath}: header names no ${field} column — falling back to the documented position ${defaults[field]}`,
              );
            }
          }
        }
      }
      pendingHeader = null;
      continue;
    }

    const cells = tableCells(line);
    if (!cells) continue;
    const idCell = cells[cols ? cols.n : defaults.n] || "";

    if (!/^\d+$/.test(idCell)) {
      // Before a header has been seen, a non-numeric first cell is a header
      // candidate — hold it, and the next line decides. After one has been
      // seen, every table row is data, so this is a malformed row and must be
      // reported rather than skipped.
      if (!cols) {
        pendingHeader = cells;
        continue;
      }
      malformed.push({
        kind,
        n: null,
        line: i + 1,
        raw: t,
        reason: `malformed row — id cell ${JSON.stringify(idCell)} is not a number`,
      });
      continue;
    }

    const c = cols || defaults;
    const n = Number(idCell);
    const titleCell = cells[c.title] || "";
    const status = (cells[c.status] || "").toLowerCase() || null;
    const href =
      [...titleCell.matchAll(MD_LINK_RE)]
        .map((m) => m[1])
        .find(isWorkItemHref) || null;

    const base = { kind, n, line: i + 1, raw: t };

    if (cells.length < 5 || !href || !status) {
      malformed.push({
        ...base,
        reason: !href
          ? "malformed row — no [title](story|task|bug.….md) link"
          : !status
            ? "malformed row — empty status cell"
            : `malformed row — ${cells.length} cells, expected at least 5`,
      });
      continue;
    }

    rows.push({
      ...base,
      title: titleCell.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim(),
      path: path.posix.normalize(path.posix.join(dir, href)),
      registryStatus: status,
      severity:
        kind === "bug" && c.severity !== undefined
          ? cells[c.severity] || null
          : null,
      priority: c.priority !== undefined ? cells[c.priority] || null : null,
      deps: c.deps !== undefined ? parseDepCell(cells[c.deps] || "", kind) : [],
    });
  }
  return { rows, malformed, warnings };
}

/**
 * Which of `row`'s declared dependencies are not yet satisfied.
 *
 * A dependency is satisfied when the DOCUMENT it points at reads `accepted` —
 * the same "frontmatter decides, the row only nominates" rule the frontier
 * already applies to the candidate itself. Three cases are deliberately treated
 * as satisfied-with-a-warning rather than as blockers:
 *
 *   - `cancelled` — the work will not happen, so waiting on it waits forever.
 *     Mirrors the roadmap path's ⏭️ SKIP handling.
 *   - a reference naming no row in either registry.
 *   - a reference whose document is missing or unreadable.
 *
 * That direction is chosen on exactly the ground task 71 settled the
 * eligibility floor on: selecting an item early costs ONE VISIBLE CYCLE, since
 * `develop-*` Step 2 reviews before any code is written and HALTs on findings.
 * An unresolvable blocker costs INDEFINITE SILENCE, and silence is the failure
 * this whole mechanism exists to remove. A wasted cycle beats an invisible row.
 * Every one of the three still emits a warning, so the condition is never mute.
 *
 * **The check is one level deep by design.** It asks only whether each named
 * dependency is accepted, never what that dependency in turn depends on. A
 * transitive walk would need cycle detection over a hand-maintained table that
 * nothing validates; the shallow check needs none, and the deeper ordering falls
 * out anyway — a dependency cannot itself be selected until ITS dependencies are
 * accepted, so the chain drains one accepted item at a time.
 *
 * @param {object} row parsed registry row
 * @param {Map<string, object>} rowIndex `${kind}${n}` → row, across both registries
 * @param {(path: string) => string|null} readStatus document status reader
 * @param {string[]} warnings mutated — one entry per dependency treated as satisfied
 * @returns {string[]} human-readable blockers; empty means dependency-ready
 */
function registryDepBlockers(row, rowIndex, readStatus, warnings) {
  const blockers = [];
  const self = `${row.kind} ${row.n}`;
  for (const dep of row.deps || []) {
    const ref = `${dep.kind}.${dep.n}`;
    const target = rowIndex.get(`${dep.kind}${dep.n}`);
    if (!target) {
      warnings.push(
        `line ${row.line}: ${self} depends on ${ref}, which is not a row in either registry — dep treated as satisfied`,
      );
      continue;
    }
    const status = readStatus(target.path);
    if (status === "accepted") continue;
    if (status === null) {
      warnings.push(
        `line ${row.line}: ${self} depends on ${ref}, whose document is missing or unreadable (${target.path}) — dep treated as satisfied`,
      );
      continue;
    }
    if (status === "cancelled") {
      warnings.push(
        `line ${row.line}: ${self} depends on ${ref}, which is cancelled — dep treated as satisfied`,
      );
      continue;
    }
    blockers.push(`${ref} (${status})`);
  }
  return blockers;
}

/**
 * Deterministic ordering for the fallback set.
 *
 * Bugs before tasks, unconditionally: a registered bug is known-broken
 * behaviour, a filed task is intended work, and broken outranks intended.
 * Within bugs: severity, then priority, then ascending number. Within tasks:
 * priority, then ascending number. The trailing number tie-break is what makes
 * the order total, so the frontier is stable under input reordering.
 */
function compareCandidates(a, b) {
  if (a.kind !== b.kind) return a.kind === "bug" ? -1 : 1;
  if (a.kind === "bug") {
    const s =
      rankOf(SEVERITY_RANK, a.severity) - rankOf(SEVERITY_RANK, b.severity);
    if (s) return s;
  }
  const p =
    rankOf(PRIORITY_RANK, a.priority) - rankOf(PRIORITY_RANK, b.priority);
  if (p) return p;
  return a.n - b.n;
}

const ELIGIBLE_FOR = {
  bug: BUG_ELIGIBLE_STATUSES,
  task: TASK_ELIGIBLE_STATUSES,
};
const LIFECYCLE_FOR = {
  bug: BUG_LIFECYCLE_STATUSES,
  task: TASK_LIFECYCLE_STATUSES,
};
const COMMAND_FOR = { bug: "/develop-bug", task: "/develop-task" };
const SOURCE_FOR = { bug: "bug-registry", task: "task-registry" };

/**
 * Rank the registry rows and decide which (if any) is the next item.
 *
 * **Frontmatter decides; the registry row only nominates.** The two demonstrably
 * drift — three rows of this repo's own task registry read `draft` while their
 * documents read `accepted` — so a row is a candidate only when the DOCUMENT it
 * points at puts it inside its kind's eligible set, whatever the row says. That
 * holds in both directions: a stale-open row with a terminal document is not
 * selected, and a stale-closed row with an open document IS.
 *
 * Every row that is passed over records WHY. An item may be out of the frontier,
 * but it must never be invisible — invisibility is the failure this whole
 * mechanism exists to remove, and an escape hatch that reintroduces it silently
 * would be the same bug wearing different clothes.
 *
 * @param {object} registries {bugRegistry:{path,text}, taskRegistry:{path,text}, readStatus(path)->string|null}
 * @param {object} [opts] {evaluateAll:boolean} — lint evaluates every row; selection stops at the first hit
 * @returns {{selected: object|null, passedOver: object[], candidates: number}}
 */
export function registryFrontier(registries, opts = {}) {
  const evaluateAll = opts.evaluateAll === true;
  const reg = registries || {};
  const readStatus =
    typeof reg.readStatus === "function" ? reg.readStatus : () => null;

  const bugSrc = reg.bugRegistry || {};
  const taskSrc = reg.taskRegistry || {};
  const bugs = parseRegistry(
    bugSrc.text,
    "bug",
    bugSrc.path || DEFAULT_BUG_REGISTRY,
  );
  const tasks = parseRegistry(
    taskSrc.text,
    "task",
    taskSrc.path || DEFAULT_TASK_REGISTRY,
  );

  const passedOver = [...bugs.malformed, ...tasks.malformed].map((m) => ({
    ...m,
    eligible: false,
  }));
  const warnings = [...(bugs.warnings || []), ...(tasks.warnings || [])];

  const ranked = [...bugs.rows, ...tasks.rows].sort(compareCandidates);

  // Resolve `Depends on` references against BOTH registries — a task may depend
  // on a bug and vice versa, and the ranking already interleaves the two.
  const rowIndex = new Map();
  for (const r of ranked) rowIndex.set(`${r.kind}${r.n}`, r);

  let selected = null;
  for (const row of ranked) {
    if (selected && !evaluateAll) {
      passedOver.push({
        ...row,
        eligible: null,
        reason: `not evaluated — ${selected.id} ranked higher`,
      });
      continue;
    }

    const docStatus = readStatus(row.path);
    const entry = { ...row, documentStatus: docStatus, offLifecycle: false };

    if (docStatus === null) {
      passedOver.push({
        ...entry,
        eligible: false,
        reason: `document missing or unreadable: ${row.path}`,
      });
      continue;
    }
    // Checked BEFORE the floor, because it names the nearer and more actionable
    // cause: `open` is not "a status we don't select on", it is not a status.
    //
    // Coverage boundary, stated because "it warns" invites the assumption that
    // it always warns: selection short-circuits at the first eligible row, so a
    // misfiled row ranked BELOW the winner is never evaluated and never warned
    // about on this path. That is deliberate — reading every document on every
    // run is the cost this short-circuit exists to avoid — and it does not weaken
    // the case this branch was written for, because a run that reports
    // `roadmap-complete` selected nothing and therefore evaluated everything.
    // The complete guards are `--lint` (evaluateAll) and, upstream of both,
    // evals/shared/tests/document-status-lifecycle-corpus.test.mjs, which fails
    // the build before a bad status can reach the selector at all.
    // Answering with the floor sends the reader looking for a policy decision
    // when what they have is a typo one edit away from being fixed.
    if (!LIFECYCLE_FOR[row.kind].has(docStatus)) {
      const detail =
        `${row.path}: document status ${docStatus} is not a member of the ${row.kind} lifecycle ` +
        `(${[...LIFECYCLE_FOR[row.kind]].join(", ")}) — the row can never be selected; ` +
        `this is almost certainly a filing error, not a finished item`;
      warnings.push(detail);
      passedOver.push({
        ...entry,
        eligible: false,
        offLifecycle: true,
        reason: detail,
      });
      continue;
    }
    if (!ELIGIBLE_FOR[row.kind].has(docStatus)) {
      passedOver.push({
        ...entry,
        eligible: false,
        reason: `document status ${docStatus} — outside the ${row.kind} eligibility floor (${[...ELIGIBLE_FOR[row.kind]].join(", ")})`,
      });
      continue;
    }
    // Ordering is priority-then-number, which consults nothing about
    // dependencies: raise a dependent row's priority above its dependency's and
    // the frontier would otherwise nominate work whose prerequisite is unbuilt.
    // Checked AFTER the floor so the recorded reason names the nearer cause, and
    // BEFORE the ranked-lower branch so a blocked row is never reported as
    // merely outranked.
    const depBlockers = registryDepBlockers(
      row,
      rowIndex,
      readStatus,
      warnings,
    );
    if (depBlockers.length) {
      passedOver.push({
        ...entry,
        eligible: false,
        reason: `blocked on unaccepted ${depBlockers.length === 1 ? "dependency" : "dependencies"}: ${depBlockers.join(", ")}`,
      });
      continue;
    }
    if (selected) {
      // evaluateAll: eligible, but a higher-ranked candidate already won.
      passedOver.push({
        ...entry,
        eligible: true,
        reason: `eligible, but ${selected.id} ranked higher`,
      });
      continue;
    }
    selected = {
      id: `${row.kind === "bug" ? "B" : "T"}${row.n}`,
      line: row.line,
      phase: `(registry fallback — ${SOURCE_FOR[row.kind]})`,
      epic: null,
      command: COMMAND_FOR[row.kind],
      commandArg: row.path,
      raw: row.raw,
      source: SOURCE_FOR[row.kind],
      registryStatus: row.registryStatus,
      documentStatus: docStatus,
      severity: row.severity,
      priority: row.priority,
    };
  }

  return { selected, passedOver, warnings, candidates: ranked.length };
}

// ── Parallel batch (worktree fan-out) ─────────────────────────────────────────
//
// `selectNext` returns the *single* next item. `selectBatch` instead returns a
// maximal set of ready rows that can be developed concurrently in separate git
// worktrees without hard merge conflicts. Two axes gate a row here:
//   1. Dependency-ready — same test as selection (deps/⛔/flow all satisfied,
//      directly /develop-* runnable). Reuses the selection predicates verbatim.
//   2. Conflict-free — no two batched rows share a `touches:` tag that either
//      side marks hard (`!`). Shared soft (`~`) tags are allowed — that is the
//      "minor conflict, second-merger-rebases" tolerance the roadmap already runs.
// Phase discipline is preserved: the batch is drawn from the first phase that
// has any actionable row (never straddling a hard phase boundary).

/** Ready = actionable and directly auto-runnable with every gate satisfied. */
function isReady(model, r) {
  if (r.ticked || r.skip || r.manual || r.gated) return false;
  if (!r.command || !/^\/develop-(story|task|bug)$/.test(r.command))
    return false;
  if (!r.commandArg) return false;
  if (
    r.blockedUntil.some((b) => b === "<unparsed>" || idDone(model, b) !== true)
  )
    return false;
  if (flowBlockers(model, r).length) return false;
  if (r.deps.some((d) => !depSatisfied(model, d))) return false;
  return true;
}

/** First shared tag marked hard by either row, else null. */
function hardConflict(a, b) {
  for (const ta of a.touches)
    for (const tb of b.touches)
      if (ta.tag === tb.tag && (ta.hard || tb.hard)) return ta.tag;
  return null;
}

function worktreeFor(row) {
  const slug = row.id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const kind =
    row.command === "/develop-task"
      ? "task"
      : row.command === "/develop-bug"
        ? "bug"
        : "story";
  const branch = `${kind}/${slug}`;
  const dir = `../tc-wt-${slug}`;
  return {
    id: row.id,
    dir,
    branch,
    base: "develop",
    run: `${row.command} ${row.commandArg}`,
    shell: `git worktree add ${dir} -b ${branch} develop`,
  };
}

/**
 * Greedily pack a maximal conflict-free batch from the earliest actionable phase.
 * Document order is the tie-breaker, so the batch always leads with the row
 * `selectNext` would have picked. Advisory: emits a plan, runs nothing.
 *
 * Write-disjointness rests on each row's `touches:` annotation. A row with no
 * `touches:` field defaults to `+own` (assumed to share nothing) and so never
 * hard-conflicts — a silent authoring failure mode. When two or more such rows
 * land in the same batch the planner cannot vouch for disjointness, so it warns.
 * With `opts.requireTouches`, it additionally downgrades: at most one un-annotated
 * row is kept, the rest deferred to `excluded` (belt-and-suspenders for teams that
 * want conflicts impossible by construction). Default is warn-only (non-breaking).
 *
 * @param {object} model
 * @param {{requireTouches?: boolean}} [opts]
 * @returns {{status:"batch"|"halt", ...}}
 */
export function selectBatch(model, opts = {}) {
  const requireTouches = opts.requireTouches === true;
  const lint = { errors: model.errors, warnings: model.warnings };
  if (model.errors.length)
    return { status: "halt", haltReason: model.errors[0], batch: [], lint };

  // Unlike selectNext, the planner advances past a phase whose ready frontier is
  // empty (only blocked/gated rows remain), recording it — a human fanning out
  // worktrees wants the next doable batch, not a phase-boundary STOP. The bias to
  // finish earlier phases first is preserved: a phase with ANY ready row wins.
  const skippedPhases = [];
  for (const phase of model.phases) {
    const rows = model.rows.filter((r) => r.phase === phase.index);
    const actionable = rows.filter((r) => !r.ticked && !r.skip);
    if (!actionable.length) continue; // nothing here at all — advance a phase

    const ready = actionable.filter((r) => isReady(model, r));
    if (!ready.length) {
      skippedPhases.push({
        phase: phase.name,
        reason: `${actionable.length} actionable row(s), none ready (all blocked/gated)`,
      });
      continue;
    }
    const batch = [];
    const excluded = [];
    for (const row of ready) {
      let clash = null;
      for (const picked of batch) {
        const tag = hardConflict(row, picked);
        if (tag) {
          clash = { with: picked.id, tag };
          break;
        }
      }
      if (clash) {
        excluded.push({
          id: row.id,
          line: row.line,
          reason: `hard-conflict on '${clash.tag}' with ${clash.with}`,
        });
        continue;
      }
      // requireTouches: keep at most one un-annotated (+own-default) row per batch;
      // defer the rest so an un-verified write footprint can never over-parallelize.
      if (
        requireTouches &&
        !row.touchesAnnotated &&
        batch.some((r) => !r.touchesAnnotated)
      ) {
        excluded.push({
          id: row.id,
          line: row.line,
          reason: "unannotated-touches (requireTouches)",
        });
        continue;
      }
      batch.push(row);
    }

    // Rows batched without a `touches:` field — their write-disjointness is assumed,
    // not verified. Two or more together means the planner can't vouch for the batch.
    const unannotated = batch
      .filter((r) => !r.touchesAnnotated)
      .map((r) => ({ id: r.id, line: r.line }));
    if (unannotated.length >= 2)
      model.warnings.push(
        `${unannotated.length} un-annotated (+own-default) rows co-scheduled: ` +
          `${unannotated.map((r) => r.id).join(", ")} — write-disjointness is assumed, ` +
          `not verified; add \`touches:\` to these rows` +
          (requireTouches ? "" : " (or run with requireTouches to defer them)"),
      );

    // Surface the soft overlaps the operator is accepting (rebase-on-merge points).
    const softOverlaps = [];
    for (let i = 0; i < batch.length; i++)
      for (let j = i + 1; j < batch.length; j++)
        for (const ta of batch[i].touches)
          for (const tb of batch[j].touches)
            if (ta.tag === tb.tag)
              softOverlaps.push({
                tag: ta.tag,
                between: [batch[i].id, batch[j].id],
              });

    return {
      status: "batch",
      phase: phase.name,
      detail: `${batch.length} row(s) can develop in parallel; ${excluded.length} held back by hard conflicts`,
      skippedPhases,
      batch: batch.map((r) => ({
        id: r.id,
        line: r.line,
        epic: r.epic,
        command: r.command,
        commandArg: r.commandArg,
        touches: r.touches,
        raw: r.raw,
      })),
      excluded,
      softOverlaps,
      unannotated,
      worktrees: batch.map(worktreeFor),
      lint,
    };
  }

  return {
    status: "batch",
    phase: null,
    detail:
      "no ready rows in any phase — the registry fallback (bug-registry / task-registry) " +
      "is single-select only, because registry rows carry no touches: annotation; " +
      "run select-next.mjs without --batch, or /develop-next",
    skippedPhases,
    batch: [],
    excluded: [],
    softOverlaps: [],
    unannotated: [],
    worktrees: [],
    lint,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    roadmap: DEFAULT_ROADMAP,
    bugRegistry: DEFAULT_BUG_REGISTRY,
    taskRegistry: DEFAULT_TASK_REGISTRY,
    lint: false,
    batch: false,
    requireTouches: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--roadmap":
        args.roadmap = argv[++i];
        break;
      case "--bug-registry":
        args.bugRegistry = argv[++i];
        break;
      case "--task-registry":
        args.taskRegistry = argv[++i];
        break;
      case "--lint":
        args.lint = true;
        break;
      case "--batch":
        args.batch = true;
        break;
      case "--require-touches":
        args.requireTouches = true;
        break;
      default:
        process.stderr.write(`select-next: unknown argument ${argv[i]}\n`);
        // `process.exitCode` + `return`, never `process.exit()`: stdio is
        // ASYNCHRONOUS on a pipe, and `process.exit()` tears the process down
        // before the buffer drains, truncating output at ~64KB. Returning lets
        // the event loop flush. See bug.3.stdout-truncation-on-exit.
        process.exitCode = 1;
        return null;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // parseArgs returns null when it has already reported a bad argument.
  if (args === null) return;
  let text;
  try {
    text = fs.readFileSync(args.roadmap, "utf-8");
  } catch (e) {
    const missing = e.code === "ENOENT";
    process.stdout.write(
      JSON.stringify(
        {
          status: "halt",
          missing,
          haltReason: missing
            ? `no roadmap at ${args.roadmap} — the project has no completion roadmap yet`
            : `cannot read roadmap: ${e.message}`,
          roadmap: args.roadmap,
        },
        null,
        2,
      ) + "\n",
    );
    process.exitCode = 1;
    return;
  }
  const model = parseRoadmap(text);

  // Absent registry → empty text → zero rows. A consumer repo may have neither,
  // and a missing registry must degrade to today's behaviour, never to a HALT.
  const readOrEmpty = (p) => {
    try {
      return fs.readFileSync(p, "utf-8");
    } catch {
      return "";
    }
  };
  const loadRegistries = () => ({
    bugRegistry: {
      path: args.bugRegistry,
      text: readOrEmpty(args.bugRegistry),
    },
    taskRegistry: {
      path: args.taskRegistry,
      text: readOrEmpty(args.taskRegistry),
    },
    readStatus: (docPath) => {
      const text = readOrEmpty(docPath);
      return text ? parseFrontmatterStatus(text) : null;
    },
  });

  if (args.lint) {
    // Lint evaluates EVERY registry row, not just up to the first eligible one:
    // its job here is that no row can be both ineligible and unlisted.
    const frontier = registryFrontier(loadRegistries(), { evaluateAll: true });
    process.stdout.write(
      JSON.stringify(
        {
          roadmap: args.roadmap,
          errors: model.errors,
          warnings: model.warnings,
          registryFrontier: {
            bugRegistry: args.bugRegistry,
            taskRegistry: args.taskRegistry,
            considered: frontier.candidates,
            warnings: frontier.warnings,
            selected: frontier.selected,
            passedOver: frontier.passedOver,
          },
        },
        null,
        2,
      ) + "\n",
    );
    process.exitCode = model.errors.length ? 1 : 0;
    return;
  }
  const result = args.batch
    ? {
        // `--batch` is deliberately registry-free. Registry rows carry no
        // `touches:` data, so write-disjointness cannot be established for them
        // and they must never enter a parallel batch.
        roadmap: args.roadmap,
        ...selectBatch(model, { requireTouches: args.requireTouches }),
      }
    : { roadmap: args.roadmap, ...selectNext(model, { loadRegistries }) };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.status === "halt" ? 1 : 0;
}

// Resolve BOTH sides through realpath: consumer projects symlink
// `.claude/skills` -> `.agents/skills`, so argv[1] arrives symlinked while
// import.meta.url is already real. Comparing them raw makes this guard false
// and main() never runs: exit 0, no output. That reads as "no item selected"
// rather than as a failure, so the loop silently does nothing. Falls back to
// the plain comparison if realpath throws (deleted/unreadable path).
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
