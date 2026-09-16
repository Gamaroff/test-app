"use strict";
/**
 * L1 unit tests for scaffold-tracker-workflow.
 *
 * Everything here is pure: probing is the only part that needs a network, and it
 * is deliberately separated from the ladder-building, inference and emitting so
 * that the parts most likely to be wrong can be tested without one.
 *
 * The board shapes below are real ones, reduced. The Jira fixture is the RAPP
 * board (id 407) as read on 2026-08-06, and it earns its place by being awkward
 * in three different ways at once: its Blocked column sits at index 1, its QA
 * columns come BEFORE its review columns, and its leftmost column aggregates
 * three statuses. A board that only ever appeared in a design document would
 * have none of those.
 *
 * Run: node --test skills/scaffold-tracker-workflow/tests/
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const s = require("../scripts/scaffold-tracker-workflow.js");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// RAPP board 407, verbatim column order.
const RAPP_COLUMNS = [
  { name: "To Do", statuses: ["Open", "Selected for Development", "Reopened"] },
  { name: "Blocked", statuses: ["Blocked"] },
  { name: "In Progress", statuses: ["In Progress"] },
  { name: "Ready for Testing", statuses: ["Ready for Testing"] },
  { name: "Testing", statuses: ["Testing"] },
  { name: "Waiting for Review", statuses: ["Waiting for Review"] },
  { name: "REVIEW", statuses: ["In Review"] },
  { name: "Ready for Showcase", statuses: ["READY FOR SHOWCASE"] },
  { name: "Waiting for Merge", statuses: ["Waiting for merge"] },
  { name: "Done", statuses: ["Done"] },
];

// A board in the order the pipeline expects, with no merge queue.
const SIMPLE_COLUMNS = [
  { name: "Backlog", statuses: ["Backlog"] },
  { name: "In Progress", statuses: ["In Progress"] },
  { name: "In Review", statuses: ["In Review"] },
  { name: "QA", statuses: ["QA"] },
  { name: "Done", statuses: ["Done"] },
];

function ladderOf(columns) {
  const { ladderColumns } = s.partitionColumns(columns);
  return s.buildLadderFromColumns(ladderColumns);
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

test("normaliseName folds case, punctuation and spacing to one form", () => {
  const forms = [
    "READY FOR SHOWCASE",
    "Ready For Showcase",
    "ready-for-showcase",
    "Ready_For_Showcase",
  ];
  const normalised = new Set(forms.map(s.normaliseName));
  assert.equal(
    normalised.size,
    1,
    `expected one form, got ${[...normalised].join(" / ")}`,
  );
  assert.equal([...normalised][0], "ready for showcase");
});

test("normaliseName keeps a slash-separated issue type readable", () => {
  assert.equal(s.normaliseName("IT / DevOps Task"), "it devops task");
});

// ---------------------------------------------------------------------------
// Side-states
// ---------------------------------------------------------------------------

test("a Blocked column is lifted off the ladder, wherever the board puts it", () => {
  const { ladderColumns, sideStates } = s.partitionColumns(RAPP_COLUMNS);
  assert.deepEqual(
    sideStates.map((x) => x.name),
    ["Blocked"],
  );
  assert.ok(
    !ladderColumns.some((c) => c.name === "Blocked"),
    "Blocked must not remain a ladder column",
  );
});

test("the lifted side-state is still targeted by its moment", () => {
  const { ladderColumns, sideStates } = s.partitionColumns(RAPP_COLUMNS);
  const { moments } = s.inferMoments(s.buildLadderFromColumns(ladderColumns), {
    sideStates,
  });
  assert.equal(moments.blocked, "Blocked");
});

test("laddering Blocked would have ranked it below In Progress — the bug this prevents", () => {
  // Guards the reasoning, not just the behaviour: on this board Blocked is
  // column 1 and In Progress column 2, so a naive ladder ranks a blocked card
  // BELOW one being worked on and leaving Blocked becomes a backward move.
  const naive = s.buildLadderFromColumns(RAPP_COLUMNS);
  const blockedRank = naive.findIndex((r) => r.names.includes("Blocked"));
  const progressRank = naive.findIndex((r) => r.names.includes("In Progress"));
  assert.ok(blockedRank >= 0 && progressRank >= 0);
  assert.ok(
    blockedRank < progressRank,
    "fixture must reproduce the early-Blocked shape",
  );

  const partitioned = ladderOf(RAPP_COLUMNS);
  assert.equal(
    partitioned.findIndex((r) => r.names.includes("Blocked")),
    -1,
    "after partitioning, Blocked has no rank at all",
  );
});

// ---------------------------------------------------------------------------
// Ladder construction
// ---------------------------------------------------------------------------

test("a column holding several statuses becomes one rung with alternatives", () => {
  const ladder = ladderOf(RAPP_COLUMNS);
  assert.deepEqual(ladder[0].names, [
    "Open",
    "Selected for Development",
    "Reopened",
  ]);
});

test("a status appearing on two columns is ranked once, at its first position", () => {
  const dupes = [
    { name: "A", statuses: ["In Progress"] },
    { name: "B", statuses: ["In Progress", "Done"] },
  ];
  const ladder = s.buildLadderFromColumns(dupes);
  const flat = ladder.flatMap((r) => r.names);
  assert.deepEqual(flat, ["In Progress", "Done"]);
  // Two rungs carrying the same name is an error validateWorkflow rejects, so
  // emitting one would produce a file that fails its own consumer's gate.
  assert.equal(flat.filter((n) => n === "In Progress").length, 1);
});

// ---------------------------------------------------------------------------
// Moment inference
// ---------------------------------------------------------------------------

test("a moment lands at the ENTRY of a phase, not its exit", () => {
  const ladder = ladderOf(RAPP_COLUMNS);
  const { moments } = s.inferMoments(ladder);
  // Ready for Testing precedes Testing; Waiting for Review precedes In Review.
  assert.equal(moments["in-qa"], "Ready for Testing");
  assert.equal(moments["in-review"], "Waiting for Review");
});

test("the losing candidate is reported, not silently dropped", () => {
  const ladder = ladderOf(RAPP_COLUMNS);
  const { notes } = s.inferMoments(ladder);
  const qa = notes.find((n) => n.moment === "in-qa");
  assert.deepEqual(qa.alternatives, ["Testing"]);
});

test("a column matching two rules is recorded as ambiguous", () => {
  const ladder = s.buildLadderFromColumns([
    { name: "x", statuses: ["In Progress"] },
    { name: "y", statuses: ["QA Review"] },
    { name: "z", statuses: ["Done"] },
  ]);
  const { ambiguous, moments } = s.inferMoments(ladder);
  const hit = ambiguous.find((a) => a.rung === "QA Review");
  assert.ok(hit, "QA Review matches both in-review and in-qa");
  assert.deepEqual(hit.moments, ["in-review", "in-qa"]);
  // Rule order is the tie-break, and it must be the one reported first.
  assert.equal(moments["in-review"], "QA Review");
});

test("an unmatched column is left alone rather than forced onto a moment", () => {
  const ladder = ladderOf(RAPP_COLUMNS);
  const { moments } = s.inferMoments(ladder);
  assert.ok(
    !Object.values(moments).includes("READY FOR SHOWCASE"),
    "a demo-readiness column is a human judgement; no moment should claim it",
  );
});

// ---------------------------------------------------------------------------
// The `done` hazard
// ---------------------------------------------------------------------------

test("done is suppressed when a merge queue sits below the terminal column", () => {
  const ladder = ladderOf(RAPP_COLUMNS);
  const r = s.inferMoments(ladder);
  assert.equal(r.doneSuppressed, true);
  assert.ok(!("done" in r.moments), "done must not be mapped");
  assert.ok(r.missing.includes("done"));
});

test("done is mapped normally on a board with no merge queue", () => {
  const r = s.inferMoments(ladderOf(SIMPLE_COLUMNS));
  assert.equal(r.doneSuppressed, false);
  assert.equal(r.moments.done, "Done");
});

test("--enable-done overrides the suppression", () => {
  const r = s.inferMoments(ladderOf(RAPP_COLUMNS), { enableDone: true });
  assert.equal(r.doneSuppressed, false);
  assert.equal(r.moments.done, "Done");
});

test("an explicit override beats every inference, including the done rule", () => {
  const r = s.inferMoments(ladderOf(RAPP_COLUMNS), {
    overrides: { done: "Waiting for merge", "in-qa": null },
  });
  assert.equal(r.moments.done, "Waiting for merge");
  assert.ok(!("in-qa" in r.moments), "`~` disables a moment");
});

// ---------------------------------------------------------------------------
// Moment ordering
// ---------------------------------------------------------------------------

test("an out-of-order board is reported, not silently reordered", () => {
  const ladder = ladderOf(RAPP_COLUMNS);
  const { moments } = s.inferMoments(ladder);
  const inversions = s.checkMomentOrder(ladder, moments);
  assert.equal(inversions.length, 1);
  assert.equal(inversions[0].earlier.moment, "in-review");
  assert.equal(inversions[0].later.moment, "in-qa");
  // The ladder itself is untouched — board order is a fact about the board.
  assert.deepEqual(
    ladder.map((r) => r.names[0]),
    [
      "Open",
      "In Progress",
      "Ready for Testing",
      "Testing",
      "Waiting for Review",
      "In Review",
      "READY FOR SHOWCASE",
      "Waiting for merge",
      "Done",
    ],
  );
});

test("a board in pipeline order reports no inversions", () => {
  const ladder = ladderOf(SIMPLE_COLUMNS);
  const { moments } = s.inferMoments(ladder);
  assert.deepEqual(s.checkMomentOrder(ladder, moments), []);
});

test("an off-ladder side-state never counts as an inversion", () => {
  const ladder = ladderOf(RAPP_COLUMNS);
  const { moments } = s.inferMoments(ladder, {
    sideStates: [{ moment: "blocked", name: "Blocked", column: "Blocked" }],
  });
  const inversions = s.checkMomentOrder(ladder, moments);
  assert.ok(
    !inversions.some(
      (i) => i.earlier.moment === "blocked" || i.later.moment === "blocked",
    ),
    "blocked has no rank, so it cannot be out of order",
  );
});

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

const RAPP_TYPES = {
  Epic: ["Open", "Done"],
  Story: [
    "Selected for Development",
    "In Progress",
    "Blocked",
    "In Review",
    "Waiting for Review",
    "Ready for Testing",
    "Testing",
    "READY FOR SHOWCASE",
    "Waiting for merge",
    "Reopened",
    "Done",
  ],
  Feature: [
    "Selected for Development",
    "In Progress",
    "Blocked",
    "In Review",
    "Waiting for Review",
    "Ready for Testing",
    "Testing",
    "READY FOR SHOWCASE",
    "Waiting for merge",
    "Reopened",
    "Done",
  ],
  "IT / DevOps Task": [
    "Selected for Development",
    "In Progress",
    "Blocked",
    "In Review",
    "Waiting for Review",
    "Reopened",
    "Done",
  ],
};

function overlaysFor(types) {
  const ladder = ladderOf(RAPP_COLUMNS);
  const { moments } = s.inferMoments(ladder, {
    sideStates: s.partitionColumns(RAPP_COLUMNS).sideStates,
  });
  return s.buildOverlays(ladder, types, moments);
}

test("a type missing whole rungs gets an overlay", () => {
  const o = overlaysFor(RAPP_TYPES);
  assert.ok(o.Epic, "Epic has only Open and Done");
  assert.deepEqual(
    o.Epic.statuses.flatMap((r) => r.names),
    ["Open", "Done"],
  );
  assert.ok(o.Epic.disable.includes("work-started"));
  assert.ok(o.Epic.disable.includes("in-review"));
});

test("a type differing only in one rung's alternatives gets NO overlay", () => {
  // Feature has every rung the base ladder has; it merely lacks "Open" from the
  // first rung, which changes nothing because names are tried in order.
  const o = overlaysFor(RAPP_TYPES);
  assert.ok(
    !("Feature" in o),
    "an inert overlay is a second copy to keep in step",
  );
});

test("an overlay disables only the moments that type genuinely cannot reach", () => {
  const o = overlaysFor(RAPP_TYPES);
  const it = o["IT / DevOps Task"];
  assert.ok(it, "this type has no testing or merge rung");
  assert.ok(it.disable.includes("in-qa"));
  assert.ok(it.disable.includes("ready-for-merge"));
  assert.ok(
    !it.disable.includes("blocked"),
    "Blocked IS in this workflow — disabling it would be the record's old mistake",
  );
});

// ---------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------

function emitFor(columns, types = {}, opts = {}) {
  const { ladderColumns, sideStates } = s.partitionColumns(columns);
  const ladder = s.buildLadderFromColumns(ladderColumns);
  const inferred = s.inferMoments(ladder, { ...opts, sideStates });
  return s.emitYaml({
    tracker: "jira",
    boardLabel: "test board",
    generatedFrom: "fixture",
    ladder,
    moments: inferred.moments,
    notes: inferred.notes,
    ambiguous: inferred.ambiguous,
    doneSuppressed: inferred.doneSuppressed,
    missing: inferred.missing,
    overlays: s.buildOverlays(ladder, types, inferred.moments),
    dropped: [],
    sideStates,
    inversions: s.checkMomentOrder(ladder, inferred.moments),
  });
}

test("multi-word issue type keys are quoted", () => {
  const yaml = emitFor(RAPP_COLUMNS, RAPP_TYPES);
  assert.match(yaml, /'IT \/ DevOps Task':/);
  // An unquoted key matches nothing and drops the whole overlay silently, which
  // is the failure mode with no error attached.
  assert.doesNotMatch(yaml, /^\s{2}IT \/ DevOps Task:/m);
});

test("a single-word issue type key is left bare", () => {
  const yaml = emitFor(RAPP_COLUMNS, RAPP_TYPES);
  assert.match(yaml, /^ {2}Epic:/m);
});

test("the emitted file uses block sequences only", () => {
  const yaml = emitFor(RAPP_COLUMNS, RAPP_TYPES);
  assert.doesNotMatch(
    yaml,
    /^\s*(statuses|names):\s*\[/m,
    "a flow collection is rejected by the parser, not silently misread",
  );
});

test("suppressing done emits the reasoning, not just the absence", () => {
  const yaml = emitFor(RAPP_COLUMNS);
  assert.doesNotMatch(yaml, /^\s{2}done:/m, "done must not be mapped");
  assert.match(yaml, /merge queue/i);
  assert.match(yaml, /--enable-done/);
});

test("an inversion is emitted at the top of the file, where it will be read", () => {
  const yaml = emitFor(RAPP_COLUMNS);
  const warn = yaml.indexOf("out of order");
  const ladder = yaml.indexOf("statuses:");
  assert.ok(warn > -1, "the inversion must be stated");
  assert.ok(warn < ladder, "and stated before the thing it is about");
});

test("a status that YAML would read as something else is quoted", () => {
  const yaml = emitFor([
    { name: "a", statuses: ["In Progress"] },
    { name: "b", statuses: ["No"] },
    { name: "c", statuses: ["Done"] },
  ]);
  assert.match(yaml, /- 'No'/, "bare No parses as boolean false");
});

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

test("--set accepts a moment from the closed set", () => {
  const o = s.parseArgs(["--set", "in-qa=Testing"]);
  assert.deepEqual(o.overrides, { "in-qa": "Testing" });
});

test("--set ~ records a disable rather than a status named '~'", () => {
  const o = s.parseArgs(["--set", "blocked=~"]);
  assert.equal(o.overrides.blocked, null);
});

test("--set rejects a moment outside the closed set", () => {
  assert.throws(() => s.parseArgs(["--set", "in-staging=Foo"]), /closed set/);
});

test("--set rejects a malformed pair", () => {
  assert.throws(() => s.parseArgs(["--set", "in-qa"]), /moment=Status/);
});

test("an unknown flag is an error, not a silently ignored typo", () => {
  assert.throws(() => s.parseArgs(["--dry-run"]), /unknown argument/);
});
