"use strict";
/**
 * observe-work SessionStart hook — behavioural tests.
 *
 * The hook's whole job is to report an ACCURATE open-observation count. Three
 * QA cycles produced three counting defects while it implemented the queue rule
 * itself; cycle 3 replaced that with a call to `observation-log.js queue`. The
 * property worth guarding is therefore not "the hook contains no grep" — a
 * source-text assertion, which this repo rejects — but **the hook's numbers
 * agree with the engine's, on every input that has ever broken them**.
 *
 * So each case below builds a real log, runs the hook, runs the engine, and
 * compares. The twelve inputs are the ones cycles 1-5 raised, kept as fixtures
 * rather than as prose so they re-run.
 *
 * Fixtures live under os.homedir(), NOT os.tmpdir(). The engine deliberately
 * refuses an ephemeral anchor, so a /tmp fixture makes the hook fall silent —
 * which looks exactly like a broken hook. That cost real time during cycle 4's
 * review before the fixtures were moved.
 *
 * Run: node --test 'skills/observe-work/tests/*.test.js'
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const SKILL_DIR = path.join(__dirname, "..");
const HOOK = path.join(
  SKILL_DIR,
  "references",
  "observe-work-session-start.sh",
);
const ENGINE = path.join(SKILL_DIR, "references", "observation-log.js");

/** Both ship inside the skill; without them there is nothing to test. */
const shipped = fs.existsSync(HOOK) && fs.existsSync(ENGINE);

/** A durable scratch workspace. See the header note on /tmp. */
function makeWorkspace(files, lastReview = "never") {
  const root = fs.mkdtempSync(path.join(os.homedir(), ".observe-work-test-"));
  const logDir = path.join(root, "skill-observations", "observation-log");
  fs.mkdirSync(logDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(logDir, name), body);
  }
  fs.writeFileSync(
    path.join(root, "skill-observations", "last-review-date.txt"),
    lastReview,
  );
  return root;
}

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });

/** Run the hook. Returns its stdout, or "" when it exits silently. */
function runHook(workspace, env = {}) {
  return execFileSync("sh", [HOOK], {
    env: { ...process.env, OBS_WORKSPACE: workspace, ...env },
    encoding: "utf8",
  }).trim();
}

/** The engine's own answer — the authority the hook must agree with. */
function engineCounts(workspace) {
  let out;
  try {
    out = execFileSync(
      "node",
      [ENGINE, "queue", "--workspace", workspace, "--json"],
      {
        encoding: "utf8",
      },
    );
  } catch (err) {
    // The engine REFUSED to answer. Not an error to work around: `queue` exits
    // non-zero with `scan-broken` when files are present and none parsed — the
    // contract's "an empty result is a claim about the instrument" guard. One
    // frontmatter-less file in an otherwise-empty log trips it. The hook must
    // then be silent rather than report a partial count.
    if (
      err.stdout &&
      /"reason":\s*"(scan-broken|id-broken|ephemeral-workspace)"/.test(
        err.stdout,
      )
    ) {
      return null;
    }
    throw err;
  }
  const parsed = JSON.parse(out);
  return { total: parsed.total, open: (parsed.open || []).length };
}

/** Pull the two numbers back out of the hook's rendered sentence. */
function hookCounts(stdout) {
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  const m = ctx.match(/(\d+) open observation\(s\) of (\d+) in the log/);
  assert.ok(m, `hook output did not carry a count: ${ctx}`);
  return { open: Number(m[1]), total: Number(m[2]) };
}

const fm = (id, status, extra = "") =>
  `---\nid: ${id}\n${status === null ? "" : `status: ${status}\n`}${extra}---\nbody\n`;

/**
 * Every input that has broken this hook, one per QA cycle that found it.
 * `expectOpen` is not hardcoded — the engine is asked, and the hook must match.
 */
const CORPUS = {
  // cycle 1 — exact-match grep missed both of these
  "0001-trailing-space.md": "---\nid: 1\nstatus: open \n---\nbody\n",
  "0002-exact.md": fm(2, "open"),
  "0003-statusless.md": fm(3, null),
  // baseline: must NOT count
  "0004-actioned.md": fm(4, "actioned", "resolved: 2026-09-01\n"),
  "0005-parked.md": fm(5, "parked", "parked_until: some condition\n"),
  // cycle 2 — an unscoped grep counted this resolved entry as open
  "0006-body-quotes-status.md":
    "---\nid: 6\nstatus: actioned\nresolved: 2026-09-01\n---\n\n## Issue\nstatus: open\n",
  // cycle 3 — these two diverged in OPPOSITE directions and cancelled
  "0007-empty-value.md": "---\nid: 7\nstatus:\n---\nbody\n",
  "0008-quoted-value.md": '---\nid: 8\nstatus: "open"\n---\nbody\n',
  "0009-no-frontmatter.md": "# a stray note\nnot an observation at all\n",
  // cycle 4 — transcription edges
  "0010-dots.and-hyphens.md": fm(10, "open"),
};

test("hook agrees with the engine on every input that has broken it", (t) => {
  if (!shipped) return t.skip("hook or engine not shipped in this install");
  const ws = makeWorkspace(CORPUS);
  try {
    const engine = engineCounts(ws);
    const hook = hookCounts(runHook(ws));
    assert.deepEqual(
      hook,
      engine,
      "the engine is the authority on the queue rule; the hook only transcribes it",
    );
    // Non-vacuity: a corpus the engine reads as empty would make the above
    // trivially true, and this fixture is specifically built not to be.
    assert.ok(engine.total > 0, "corpus must not be empty");
    assert.ok(engine.open > 0, "corpus must contain open observations");
  } finally {
    rm(ws);
  }
});

test("each historically-broken input is classified as the engine classifies it", (t) => {
  if (!shipped) return t.skip("hook or engine not shipped in this install");
  // One file at a time, so a failure names the input rather than a total.
  for (const [name, body] of Object.entries(CORPUS)) {
    const ws = makeWorkspace({ [name]: body });
    try {
      const engine = engineCounts(ws);
      const out = runHook(ws);
      // Engine declined to answer (its scan guard tripped) => hook must be silent.
      if (engine === null) {
        assert.equal(
          out,
          "",
          `${name}: engine refused to answer, so the hook must be silent`,
        );
        continue;
      }
      // The engine excludes non-observations entirely; total 0 => hook silent.
      if (engine.total === 0) {
        assert.equal(
          out,
          "",
          `${name}: engine ignores it, so the hook must be silent`,
        );
        continue;
      }
      assert.deepEqual(
        hookCounts(out),
        engine,
        `${name}: hook disagrees with the engine`,
      );
    } finally {
      rm(ws);
    }
  }
});

test("the review nag fires on `never` and on a stale date, and not on a fresh one", (t) => {
  if (!shipped) return t.skip("hook or engine not shipped in this install");
  const iso = (daysAgo) =>
    new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10);
  const cases = [
    ["never", "never", true],
    ["stale", iso(30), true],
    ["fresh", iso(2), false],
  ];
  for (const [label, date, shouldNag] of cases) {
    const ws = makeWorkspace({ "0001.md": fm(1, "open") }, date);
    try {
      const ctx = JSON.parse(runHook(ws)).hookSpecificOutput.additionalContext;
      assert.equal(
        /Skill review/.test(ctx),
        shouldNag,
        `${label}: nag presence wrong — ${ctx}`,
      );
    } finally {
      rm(ws);
    }
  }
});

test("a fresh review with nothing open is entirely silent", (t) => {
  if (!shipped) return t.skip("hook or engine not shipped in this install");
  // The branch that must produce NO output at all. A nag that never fires and a
  // nag that is correctly silent look identical unless this is asserted.
  const twoDaysAgo = new Date(Date.now() - 2 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const ws = makeWorkspace(
    { "0001.md": fm(1, "actioned", "resolved: 2026-01-01\n") },
    twoDaysAgo,
  );
  try {
    assert.equal(runHook(ws), "");
  } finally {
    rm(ws);
  }
});

test("the hook is silent rather than wrong when it cannot reach the engine", (t) => {
  if (!shipped) return t.skip("hook or engine not shipped in this install");
  // The whole justification for this file is an accurate number, so every
  // degradation path must emit NOTHING rather than a hand-rolled guess. Each
  // case below was a live concern during the QA loop.
  const ws = makeWorkspace({ "0001.md": fm(1, "open") });
  const stub = (js) => {
    const p = path.join(ws, `stub-${Math.random().toString(36).slice(2)}.js`);
    fs.writeFileSync(p, js);
    return p;
  };
  try {
    const cases = {
      "engine file absent": { OBS_ENGINE: path.join(ws, "nope.js") },
      "unparseable payload": {
        OBS_ENGINE: stub('process.stdout.write("not json at all\\n");'),
      },
      "valid JSON without the expected keys": {
        OBS_ENGINE: stub(
          'process.stdout.write(JSON.stringify({reason:"ok"}));',
        ),
      },
      "non-zero exit carrying a plausible payload": {
        OBS_ENGINE: stub(
          'process.stdout.write(JSON.stringify({total:99,open:["a.md"]}));process.exit(1);',
        ),
      },
    };
    for (const [label, env] of Object.entries(cases)) {
      assert.equal(
        runHook(ws, env),
        "",
        `${label}: must be silent, emitted output`,
      );
    }
  } finally {
    rm(ws);
  }
});

test("the hook emits well-formed SessionStart JSON", (t) => {
  if (!shipped) return t.skip("hook or engine not shipped in this install");
  const ws = makeWorkspace({ "0001.md": fm(1, "open") });
  try {
    const parsed = JSON.parse(runHook(ws));
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(typeof parsed.hookSpecificOutput.additionalContext, "string");
  } finally {
    rm(ws);
  }
});

// ── OBS_STALE_DAYS ───────────────────────────────────────────────────────────
//
// docs/reference/configuration.md documents this as an ENVIRONMENT VARIABLE with
// a default of 14 — not as a `skills-config.yaml` key, and not as 7. Both halves
// have been wrong in a draft of that doc, so both are asserted by DRIVING the
// hook rather than by reading the default out of it.

/** The date `n` days before today, ISO. */
const daysAgo = (n) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/**
 * Does the hook's output nag about a stale review?
 *
 * Anchored to the review-state clause the hook actually emits — `last run
 * <date> — stale (over N days)` or `never run` — rather than matching the word
 * "stale" anywhere in the context. A bare substring test would report a false
 * positive the day the hook mentions staleness for some other reason, and a
 * staleness assertion that cannot tell the two apart is the thing it exists to
 * prevent.
 */
function saysStale(stdout) {
  if (!stdout) return false;
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  return /last run \d{4}-\d{2}-\d{2} — stale \(over \d+ days\)|never run/.test(
    ctx,
  );
}

test("OBS_STALE_DAYS: the applied default is 14, not 7", (t) => {
  if (!shipped) return t.skip("hook or engine not shipped in this install");

  // A review 10 days old straddles the two candidate defaults: fresh under 14,
  // stale under 7. One fixture therefore distinguishes them.
  const ws = makeWorkspace({ "0001.md": fm(1, "open") }, daysAgo(10));
  try {
    assert.equal(
      saysStale(runHook(ws)),
      false,
      "a 10-day-old review was reported stale, so the applied default is " +
        "below 14 — the documented default is wrong, or the hook is",
    );
  } finally {
    rm(ws);
  }

  // And the same fixture must flip when the threshold is lowered, or the test
  // above would pass for a hook that never reports staleness at all.
  const ws2 = makeWorkspace({ "0001.md": fm(1, "open") }, daysAgo(10));
  try {
    assert.equal(
      saysStale(runHook(ws2, { OBS_STALE_DAYS: "7" })),
      true,
      "OBS_STALE_DAYS=7 did not make a 10-day-old review stale — the " +
        "variable is not being read, so its documentation is inert",
    );
  } finally {
    rm(ws2);
  }
});

test("OBS_STALE_DAYS: a review inside the window is not nagged about", (t) => {
  if (!shipped) return t.skip("hook or engine not shipped in this install");
  const ws = makeWorkspace({ "0001.md": fm(1, "open") }, daysAgo(1));
  try {
    assert.equal(
      saysStale(runHook(ws)),
      false,
      "yesterday's review reported stale — silence is a correct outcome and " +
        "a hook that always nags trains the reader to ignore it",
    );
  } finally {
    rm(ws);
  }
});
