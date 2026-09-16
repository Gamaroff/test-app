"use strict";
/**
 * tracker-reconcile.test.js — the reconcile loop and its load-bearing refusal
 * (task.57).
 *
 * Hermetic: the verify pass reads through a stub that THROWS on any mutating
 * argv, and --apply executes through a recording stub. No network, no
 * credentials, no tracker.
 *
 * Mutation-prove (each named change must go red):
 *   - allow --apply under `manual`                       → §1 refusal test red
 *   - let --apply mutate during a refused run            → §1 throwing-exec red
 *   - delete satisfied items from the artifacts          → §2 count test red
 *   - write a Change Log row on observation or deferral  → §4 red
 *   - make a second reconcile re-stamp timestamps        → §5 byte-identity red
 *   - auto-apply a divergent record                      → §3 red
 *   - assume consent for an irreversible record, no tty  → §3 red
 *
 * Run: node --test skills/tracker-reconcile/tests/tracker-reconcile.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const tr = require("../scripts/tracker-reconcile.js");
const hv = require("../references/handover-verify.js");

const FIXED_NOW = () => "2026-08-20T09:00:00Z";

// ---------------------------------------------------------------------------
// Fixture repo: a work-item dir with a main doc and a committed handover set.
// ---------------------------------------------------------------------------

function record(over = {}) {
  return {
    v: 1,
    id: over.id || "aaaa0001",
    order: over.order || 1,
    dependsOn: [],
    ts: "2026-08-18T10:00:00Z",
    run: "feature/task.99.fixture",
    step: "7",
    skill: "finalise",
    system: "github",
    access: "manual",
    kind: "github.board.field-set",
    consequence: "state-drift",
    produces: null,
    intent: over.intent || "Move the card to Done",
    target: { issue: "235", url: "https://github.com/acme/repo/issues/235" },
    desired: { status: "Done" },
    observed: null,
    satisfied: false,
    manual: { deepLink: "", ui: "", fields: [] },
    command: {
      argv: ["gh", "issue", "comment", "235", "--body-file", "-"],
      stdin: "body\n",
    },
    verify: null,
    retry_of: null,
    ...over,
  };
}

const DOC = `---
id: task.99
title: fixture
type: task
status: accepted
created: 2026-08-18
updated: 2026-08-18
---

# Task 99 fixture

## Change Log

| Date | Version | Description | Author |
| ---- | ------- | ----------- | ------ |
| 2026-08-18 | 1.0 | Initial draft | create-task |
`;

function makeRepo(records) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-"));
  const dir = path.join(root, "docs", "tasks", "task.99.fixture");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "task.99.fixture.md"), DOC, "utf8");
  const sidecar = path.join(dir, "task.99.handover.1.fixture.json");
  fs.writeFileSync(
    sidecar,
    `${JSON.stringify(
      {
        v: 1,
        generator: "handover-render.js",
        context: {
          run: "feature/task.99.fixture",
          access: "manual",
          workItem: "task.99",
        },
        records,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { root, dir, sidecar, doc: path.join(dir, "task.99.fixture.md") };
}

function boardRead(value) {
  return {
    status: 0,
    stdout: JSON.stringify({
      data: {
        repository: {
          issue: {
            projectItems: { nodes: [{ fieldValueByName: { name: value } }] },
          },
        },
      },
    }),
  };
}

/** Verify-pass stub: read-only reads answered; mutations throw. */
function verifyStub(boardValue) {
  return (argv) => {
    if (!hv.isReadOnlyArgv(argv)) {
      throw new Error(`MUTATION during verify: ${JSON.stringify(argv)}`);
    }
    if (argv.join(" ").includes("graphql")) return boardRead(boardValue);
    return { status: 1, error: "no canned response" };
  };
}

/** Apply-exec stub that records calls; `throwing: true` makes any call fatal. */
function applyStub({ throwing = false } = {}) {
  const calls = [];
  return {
    calls,
    execImpl(argv, stdin) {
      if (throwing) {
        throw new Error(`MUTATION ATTEMPTED: ${JSON.stringify(argv)}`);
      }
      calls.push({ argv, stdin });
      return { status: 0, stdout: "" };
    },
  };
}

function runReconcile(
  repo,
  {
    flags = [],
    env = {},
    boardValue = "To Do",
    apply = null,
    isTTY = false,
    now = FIXED_NOW,
  } = {},
) {
  return tr.run({
    argv: ["node", "tracker-reconcile.js", repo.dir, ...flags],
    env,
    cwd: repo.root,
    verifyExecImpl: verifyStub(boardValue),
    execImpl: apply ? apply.execImpl : applyStub({ throwing: true }).execImpl,
    isTTY,
    now,
  });
}

// ── §1 The refusal — the load-bearing behaviour ─────────────────────────────

for (const mode of ["read-only", "approve", "command", "manual"]) {
  test(`§1 --apply under \`${mode}\` is refused, names the blocker, executes nothing`, async () => {
    const repo = makeRepo([record()]);
    const apply = applyStub({ throwing: true }); // any execution = test failure
    const result = await runReconcile(repo, {
      flags: ["--apply", "--json"],
      env: { ACCESS_TRACKER: mode },
      apply,
    });
    assert.equal(result.exitCode, 0, "refusal exits 0 with a reason");
    assert.equal(result.reason, "apply-refused");
    assert.equal(result.access, mode);
    assert.match(result.refusal, /access\.tracker: full/);
    assert.match(
      result.refusal,
      /skills-config\.yaml access\.tracker|ACCESS_TRACKER/,
      "the refusal must name the blocking system, not fail vaguely",
    );
    // The check pass still ran and re-rendered.
    assert.equal(result.items.length, 1);
    assert.ok(fs.existsSync(repo.sidecar.replace(/\.json$/, ".md")));
  });
}

test("§1 the refused run still performs the check pass (ticks satisfied items)", async () => {
  const repo = makeRepo([record()]);
  const result = await runReconcile(repo, {
    flags: ["--apply"],
    env: { ACCESS_TRACKER: "manual" },
    boardValue: "Done", // already satisfied on the board
  });
  assert.equal(result.reason, "apply-refused");
  assert.equal(result.items[0].counts.satisfied, 1);
  const md = fs.readFileSync(repo.sidecar.replace(/\.json$/, ".md"), "utf8");
  assert.match(md, /- \[x\] ~~/);
});

// ── §2 Check-only: tick, never delete; status frontmatter ───────────────────

test("§2 an already-done action is ticked, not deleted — item count equals record count", async () => {
  const repo = makeRepo([
    record({ id: "aaaa0001" }),
    record({ id: "aaaa0002", order: 2, intent: "Move the other card" }),
  ]);
  const result = await runReconcile(repo, { boardValue: "Done" });
  assert.equal(result.reason, "checked");
  const sidecar = JSON.parse(fs.readFileSync(repo.sidecar, "utf8"));
  assert.equal(sidecar.records.length, 2, "records are never deleted");
  assert.equal(sidecar.counts.satisfied, 2);
  assert.equal(sidecar.status, "complete");
  const md = fs.readFileSync(repo.sidecar.replace(/\.json$/, ".md"), "utf8");
  assert.match(
    md,
    /^status: complete$/m,
    "checklist frontmatter carries status:",
  );
  const ticks = md.match(/- \[x\]/g) || [];
  assert.equal(ticks.length, 2, "both boxes ticked in place");
});

test("§2 status is `outstanding` with nothing satisfied and `partial` with a mix", async () => {
  const one = makeRepo([record()]);
  const r1 = await runReconcile(one, { boardValue: "To Do" });
  assert.equal(r1.items[0].status, "outstanding");
  assert.match(
    fs.readFileSync(one.sidecar.replace(/\.json$/, ".md"), "utf8"),
    /^status: outstanding$/m,
  );

  const two = makeRepo([
    record({ id: "aaaa0001" }),
    record({
      id: "aaaa0002",
      order: 2,
      kind: "jira.worklog.add",
      system: "jira",
      consequence: "communication",
      intent: "Log work",
    }),
  ]);
  const r2 = await runReconcile(two, { boardValue: "Done" });
  assert.equal(r2.items[0].status, "partial");
});

// ── §3 Apply under full ──────────────────────────────────────────────────────

test("§3 --apply under `full` executes the outstanding actions", async () => {
  const repo = makeRepo([record()]);
  const apply = applyStub();
  const result = await runReconcile(repo, {
    flags: ["--apply"],
    env: {}, // nothing set → full
    boardValue: "To Do",
    apply,
  });
  assert.equal(result.reason, "applied");
  assert.equal(apply.calls.length, 1, "the pending action ran");
  assert.deepEqual(result.items[0].executed, ["aaaa0001"]);
  // The executed record is now ticked in the re-rendered checklist.
  const md = fs.readFileSync(repo.sidecar.replace(/\.json$/, ".md"), "utf8");
  assert.match(md, /- \[x\] ~~/);
});

test("§3 --apply does not run a divergent record — skipped with a warning", async () => {
  const repo = makeRepo([
    record({
      verification: {
        state: "pending",
        at: "2026-08-18T11:00:00Z",
        observed: "To Do",
        baseline: "To Do",
        detail: "still To Do; wanted Done",
      },
    }),
  ]);
  const apply = applyStub();
  const result = await runReconcile(repo, {
    flags: ["--apply"],
    env: {},
    boardValue: "Blocked", // moved somewhere neither desired nor baseline
    apply,
  });
  assert.equal(result.reason, "applied");
  assert.equal(apply.calls.length, 0, "a divergent action must NOT auto-apply");
  assert.equal(result.items[0].counts.divergent, 1);
  assert.match(result.items[0].skipped[0].why, /divergent/);
});

test("§3 an irreversible record without a tty is skipped — consent is never assumed", async () => {
  const repo = makeRepo([
    record({
      kind: "github.pr.merge",
      consequence: "irreversible",
      intent: "Merge the PR",
      target: { pr: "12", issue: "12", url: "" },
      desired: { state: "MERGED" },
      command: { argv: ["gh", "pr", "merge", "12", "--squash"], stdin: null },
    }),
  ]);
  const apply = applyStub();
  const result = await runReconcile(repo, {
    flags: ["--apply"],
    env: {},
    boardValue: "irrelevant",
    apply,
    isTTY: false,
  });
  assert.equal(apply.calls.length, 0, "no tty → never assume consent");
  assert.match(result.items[0].skipped[0].why, /no tty|never assumed/);
});

// ── §4 Change Log: rows record events, not attempts ─────────────────────────

test("§4 a check-only run writes NO Change Log row — observation is a non-event", async () => {
  const repo = makeRepo([record()]);
  await runReconcile(repo, { boardValue: "Done" }); // observes satisfied
  const doc = fs.readFileSync(repo.doc, "utf8");
  assert.doesNotMatch(
    doc,
    /tracker-reconcile/,
    "observation must not write history",
  );
});

test("§4 a refused --apply writes NO Change Log row — deferral is a non-event", async () => {
  const repo = makeRepo([record()]);
  await runReconcile(repo, {
    flags: ["--apply"],
    env: { ACCESS_TRACKER: "manual" },
    boardValue: "To Do",
  });
  const doc = fs.readFileSync(repo.doc, "utf8");
  assert.doesNotMatch(doc, /tracker-reconcile/);
});

test("§4 an executed action earns exactly one row, naming what ran", async () => {
  const repo = makeRepo([record()]);
  const apply = applyStub();
  await runReconcile(repo, {
    flags: ["--apply"],
    env: {},
    boardValue: "To Do",
    apply,
  });
  const doc = fs.readFileSync(repo.doc, "utf8");
  assert.match(
    doc,
    /Reconcile executed 1 tracker action\(s\): github\.board\.field-set/,
  );
  assert.match(doc, /\| tracker-reconcile \|/);
  assert.match(
    doc,
    /^updated: 2026-08-20$/m,
    "frontmatter updated bumps with the row",
  );
  const rows = doc.match(/tracker-reconcile/g) || [];
  assert.equal(rows.length, 1, "one run, one row");
});

// ── §5 Idempotence ───────────────────────────────────────────────────────────

test("§5 reconciling twice with an unchanged board is byte-identical", async () => {
  const repo = makeRepo([
    record({ id: "aaaa0001" }),
    record({
      id: "aaaa0002",
      order: 2,
      kind: "jira.worklog.add",
      system: "jira",
      consequence: "communication",
      intent: "Log work",
    }),
  ]);
  await runReconcile(repo, {
    boardValue: "Done",
    now: () => "2026-08-20T09:00:00Z",
  });
  const md1 = fs.readFileSync(repo.sidecar.replace(/\.json$/, ".md"), "utf8");
  const json1 = fs.readFileSync(repo.sidecar, "utf8");

  // A later clock — nothing on the board changed.
  await runReconcile(repo, {
    boardValue: "Done",
    now: () => "2026-08-27T15:45:00Z",
  });
  const md2 = fs.readFileSync(repo.sidecar.replace(/\.json$/, ".md"), "utf8");
  const json2 = fs.readFileSync(repo.sidecar, "utf8");

  assert.equal(
    md2,
    md1,
    "checklist must be byte-identical on a no-change reconcile",
  );
  assert.equal(
    json2,
    json1,
    "sidecar must be byte-identical on a no-change reconcile",
  );
});

// ── §6 Targets ───────────────────────────────────────────────────────────────

test("§6 a directory target resolves the newest sidecar; --all walks docs/", async () => {
  const repo = makeRepo([record()]);
  const second = path.join(repo.dir, "task.99.handover.2.fixture.json");
  fs.copyFileSync(repo.sidecar, second);
  assert.equal(tr.newestSidecarIn(repo.dir), second);

  const all = tr.walkForSidecars(path.join(repo.root, "docs"));
  assert.deepEqual(all.sort(), [repo.sidecar, second].sort());
});

test("§6 a non-sidecar target and a sidecar-less directory are refused cleanly", async () => {
  const repo = makeRepo([record()]);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "empty-"));
  const r1 = await tr.run({
    argv: ["node", "tracker-reconcile.js", bare],
    env: {},
    cwd: repo.root,
  });
  assert.equal(r1.exitCode, 2);
  assert.equal(r1.reason, "bad-target");
  const r2 = await tr.run({
    argv: ["node", "tracker-reconcile.js", repo.doc],
    env: {},
    cwd: repo.root,
  });
  assert.equal(r2.exitCode, 2);
});

// ── §7 Regressions from QA cycle 1 (CR-3) ───────────────────────────────────

test("§7 CR-3: irreversible on a tty with NO confirm mechanism is skipped — never assumed", () => {
  // applyRecords directly: a tty alone is not consent. Without a callback the
  // action must not run, tty or no tty.
  const recs = [
    record({
      kind: "github.pr.merge",
      consequence: "irreversible",
      intent: "Merge the PR",
      target: { pr: "12", issue: "12", url: "" },
      command: { argv: ["gh", "pr", "merge", "12", "--squash"], stdin: null },
    }),
  ];
  const apply = applyStub();
  const { executed, skipped } = tr.applyRecords(recs, {
    execImpl: apply.execImpl,
    isTTY: true,
    confirm: null,
  });
  assert.equal(
    executed.length,
    0,
    "tty without a confirm mechanism must not execute",
  );
  assert.equal(apply.calls.length, 0);
  assert.match(skipped[0].why, /no confirmation mechanism|never assumed/);
});

test("§7 CR-3: on a tty, declined stays skipped and consented executes", () => {
  const mk = () => [
    record({
      kind: "github.pr.merge",
      consequence: "irreversible",
      intent: "Merge the PR",
      target: { pr: "12", issue: "12", url: "" },
      command: { argv: ["gh", "pr", "merge", "12", "--squash"], stdin: null },
    }),
  ];
  const declinedApply = applyStub();
  const declined = tr.applyRecords(mk(), {
    execImpl: declinedApply.execImpl,
    isTTY: true,
    confirm: () => false,
  });
  assert.equal(declined.executed.length, 0);
  assert.match(declined.skipped[0].why, /declined/);

  const consentedApply = applyStub();
  const consented = tr.applyRecords(mk(), {
    execImpl: consentedApply.execImpl,
    isTTY: true,
    confirm: () => true,
  });
  assert.equal(consented.executed.length, 1, "explicit consent executes");
  assert.equal(consentedApply.calls.length, 1);
});

test("§7 CR-3: run() threads an injected confirm through to the apply pass", async () => {
  const repo = makeRepo([
    record({
      kind: "github.pr.merge",
      consequence: "irreversible",
      intent: "Merge the PR",
      target: { pr: "12", issue: "12", url: "" },
      desired: { state: "MERGED" },
      command: { argv: ["gh", "pr", "merge", "12", "--squash"], stdin: null },
    }),
  ]);
  const apply = applyStub();
  const asked = [];
  const result = await tr.run({
    argv: ["node", "tracker-reconcile.js", repo.dir, "--apply"],
    env: {},
    cwd: repo.root,
    verifyExecImpl: (argv) => {
      if (!hv.isReadOnlyArgv(argv)) throw new Error("MUTATION during verify");
      if (argv.join(" ").includes("pr view"))
        return { status: 0, stdout: JSON.stringify({ state: "OPEN" }) };
      return { status: 1, error: "no canned response" };
    },
    execImpl: apply.execImpl,
    isTTY: true,
    confirm: (rec) => {
      asked.push(rec.id);
      return true;
    },
  });
  assert.equal(result.reason, "applied");
  assert.equal(asked.length, 1, "the injected confirm must be consulted");
  assert.equal(apply.calls.length, 1);
});

// ── §8 Regressions from QA cycle 2 (CR2-3) ──────────────────────────────────

test("§8 CR2-3: the confirmation prompt travels as DATA — never interpolated into bash -c", () => {
  const hostile = record({
    id: "beefbeef",
    consequence: "irreversible",
    intent: "Merge `touch /tmp/pwned` and $(rm -rf /) now",
  });
  const cmd = tr.ttyConfirmCommand(hostile);
  const script = cmd.argv.join(" ");
  assert.ok(
    !script.includes("pwned"),
    "record text must not appear in the script argv",
  );
  assert.ok(
    !script.includes("rm -rf"),
    "record text must not appear in the script argv",
  );
  assert.match(
    script,
    /\$RECONCILE_PROMPT/,
    "the script must reference the prompt as an env variable",
  );
  assert.match(
    cmd.env.RECONCILE_PROMPT,
    /pwned/,
    "the prompt content travels in env, as data",
  );
});
