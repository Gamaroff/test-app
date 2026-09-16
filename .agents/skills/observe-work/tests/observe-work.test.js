"use strict";
/**
 * observe-work contract tests.
 *
 * Prose-driven skill — assert the structural invariants of SKILL.md and the
 * references, never that a particular sentence exists. Grepping the source
 * proves the string is there; it does not prove the behaviour works. Each
 * assertion below is about a property a future edit could plausibly break.
 *
 * The two invariants this file exists for:
 *
 *   1. **Progressive disclosure is real.** The body is an always-loaded,
 *      per-invocation tax; the references are not. Upstream states a 500-line
 *      rule in a 710-line body. A pointer without a load trigger reads as
 *      optional and gets skipped, which turns the pointer list into a
 *      bibliography and quietly moves the whole cost back into the body.
 *
 *   2. **Every log operation goes through the engine.** The moment a snippet
 *      here hand-rolls an id, an archival sweep or a frontmatter parse, the
 *      guards in observation-log.js are bypassed and the defects they exist to
 *      prevent (octal id parsing, archiving a just-resolved entry, a grep-based
 *      queue that drops statusless files) come back one snippet at a time.
 *
 * Run: node --test 'skills/observe-work/tests/*.test.js'
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const SKILL_DIR = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(SKILL_DIR, rel), "utf8");

/**
 * Read a file OUTSIDE the skill directory — the repo root, a sibling skill,
 * shared/resources. Returns null on ENOENT instead of throwing.
 *
 * `tests/` ships inside the packaged skill (package_skill.py walks the whole
 * skill dir), so a consumer can run this suite with observe-work installed and
 * the rest of the repo absent. There these assertions have nothing to compare
 * against and skip. In THIS repo the targets are always present, so they always
 * run — which is the point, and is asserted separately below so that a
 * degradation which skipped everywhere could not leave a green suite behind.
 */
const readOutside = (...segs) => {
  try {
    return fs.readFileSync(path.join(SKILL_DIR, "..", "..", ...segs), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
};

const SKILL = read("SKILL.md");

/** The body — everything after the closing `---` of the frontmatter block. */
const BODY = (() => {
  const m = SKILL.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  assert.ok(m, "SKILL.md must open with a YAML frontmatter block");
  return m[1];
})();

/** The frontmatter block, without its fences. */
const FRONTMATTER = SKILL.match(/^---\n([\s\S]*?)\n---\n/)[1];

/** The five authored references. Bundled copies are asserted separately. */
const AUTHORED_REFS = [
  "signals.md",
  "review-cycle.md",
  "applying-updates.md",
  "environments.md",
  "starter-principles.md",
];

// ── Frontmatter ──────────────────────────────────────────────────────────────

test("frontmatter: name matches the directory", () => {
  assert.match(FRONTMATTER, /^name: observe-work$/m);
  assert.equal(path.basename(SKILL_DIR), "observe-work");
});

test("frontmatter: description contains no angle brackets", () => {
  // quick_validate.py rejects these outright — a hard failure, not a warning.
  const desc = FRONTMATTER.match(
    /^description: ([\s\S]*?)(?=\n[a-z_-]+:|\n*$)/m,
  );
  assert.ok(desc, "description must be present");
  assert.doesNotMatch(desc[1], /[<>]/);
});

test("frontmatter: description stays under the 150-word context budget", () => {
  const desc = FRONTMATTER.match(
    /^description: ([\s\S]*?)(?=\n[a-z_-]+:|\n*$)/m,
  )[1];
  const words = desc.trim().split(/\s+/).length;
  assert.ok(
    words <= 150,
    `description is ${words} words; quick_validate.py warns over 150 and it is ` +
      `always in context`,
  );
});

test("frontmatter: invokes is inline flow form and names real skills", () => {
  // Block form (`invokes:` then a `- name` list) is rejected loudly by
  // scripts/generate-skill-dependencies.mjs. Asserting the flow form here is
  // what keeps `npm run generate-skill-deps` from failing on this skill.
  const line = FRONTMATTER.match(/^invokes:[ \t]*(.*)$/m);
  assert.ok(line, "invokes: must be present");
  assert.match(
    line[1],
    /^\[[^\]]*\]$/,
    "invokes: must be inline flow form — `invokes: [a, b]`, never a block list",
  );

  const names = line[1]
    .slice(1, -1)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(names.length > 0, "invokes: must name at least one skill");

  for (const name of names) {
    const sibling = readOutside("skills", name, "SKILL.md");
    if (sibling === null) continue; // packaged install without the sibling
    assert.ok(
      sibling.length > 0,
      `invokes: names ${name}, whose SKILL.md is empty`,
    );
  }
});

// ── Progressive disclosure ───────────────────────────────────────────────────

test("body stays under the 500-line ceiling", () => {
  const lines = BODY.split("\n").length;
  assert.ok(
    lines <= 500,
    `SKILL.md body is ${lines} lines. The body is an always-loaded per-invocation ` +
      `cost; content that does not change behaviour on EVERY invocation belongs ` +
      `in a reference.`,
  );
});

test("every references/ path named in the body resolves to a shipped file", () => {
  const refs = new Set(
    [...BODY.matchAll(/(?:^|[\s`(\[])references\/([A-Za-z0-9._-]+)/g)].map(
      (m) => m[1],
    ),
  );
  assert.ok(refs.size > 0, "the body must point at its references");
  for (const ref of refs) {
    assert.ok(
      fs.existsSync(path.join(SKILL_DIR, "references", ref)),
      `SKILL.md names references/${ref}, which is not shipped`,
    );
  }
});

/**
 * The pointer table's rows, parsed into {target, trigger}.
 *
 * Parsed rather than substring-matched, deliberately. "Is this reference
 * pointed at?" is a claim about a RELATIONSHIP — this file, in the pointer
 * table, with a trigger — and `BODY.includes("references/x.md")` is satisfied
 * by the name appearing anywhere at all, including in another row's prose or in
 * an unrelated paragraph. That would let a reference lose its pointer entirely
 * while the assertion stayed green, which is the precise failure this suite is
 * supposed to make impossible.
 */
const POINTER_ROWS = (() => {
  const section = BODY.split(/^## Load these when their trigger fires$/m)[1];
  assert.ok(section, "the body must carry a triggered pointer table");
  return section
    .split("\n")
    .filter((l) => /^\|\s*\[/.test(l)) // rows whose first cell is a link
    .map((row) => {
      const cells = row.split("|").map((c) => c.trim());
      const link = cells[1].match(/\]\(([^)]+)\)/);
      return { row, target: link ? link[1] : null, trigger: cells[2] || "" };
    });
})();

test("every authored reference has its own row in the pointer table", () => {
  // The converse of the assertion above: a reference nothing points at is
  // dead weight that ships on every install and loads for nobody.
  // A Set keyed on each row's own parsed link destination. Exact membership,
  // not substring containment: the question is whether THIS reference has its
  // own row, and a name appearing inside another row's prose must not answer it.
  const targets = new Set(POINTER_ROWS.map((r) => r.target));
  for (const ref of AUTHORED_REFS) {
    assert.ok(
      targets.has(`references/${ref}`),
      `references/${ref} is shipped but has no row in the pointer table. ` +
        `Rows point at: ${[...targets].join(", ")}`,
    );
  }
});

test("every pointer-table entry states a load trigger, not a description", () => {
  // A pointer without a trigger reads as optional and gets skipped; an
  // unconditioned list of filenames is a bibliography, not progressive
  // disclosure.
  assert.ok(
    POINTER_ROWS.length >= AUTHORED_REFS.length,
    "every authored reference needs a row",
  );

  for (const { row, trigger } of POINTER_ROWS) {
    assert.match(
      trigger,
      /^(you|the|`\/observe-work|Session Start)/i,
      `pointer row has no load trigger in its second cell: ${row}`,
    );
    assert.ok(
      trigger.length > 15,
      `pointer trigger is too short to be a condition: ${trigger}`,
    );
  }
});

test("each authored reference declares its own load trigger", () => {
  for (const ref of AUTHORED_REFS) {
    const body = read(path.join("references", ref));
    assert.match(
      body,
      /^> \*\*Load when\*\* /m,
      `references/${ref} must open with a "> **Load when** …" line matching its ` +
        `pointer in SKILL.md`,
    );
  }
});

test("references over 300 lines carry a table of contents", () => {
  for (const ref of AUTHORED_REFS) {
    const body = read(path.join("references", ref));
    if (body.split("\n").length <= 300) continue;
    assert.match(
      body,
      /^## Contents$/m,
      `references/${ref} is over 300 lines and needs a table of contents`,
    );
  }
});

// ── Attribution (a licence obligation, not a courtesy) ───────────────────────

test("the attribution block is complete", () => {
  // CC BY 4.0 requires attribution wherever the work travels, and requires
  // that modifications be indicated. All four elements must be present.
  assert.match(BODY, /Eoghan Henn/, "must name the author");
  assert.match(BODY, /CC BY 4\.0/, "must name the licence");
  assert.match(
    BODY,
    /github\.com\/rebelytics\/one-skill-to-rule-them-all/,
    "must link the canonical repo",
  );
  assert.match(
    BODY,
    /\*\*Changes were made\*\*/,
    "CC BY 4.0 requires modifications to be indicated",
  );
});

// ── The engine boundary ──────────────────────────────────────────────────────

test("no snippet hand-rolls a log operation", () => {
  // Each of these bypasses a guard the engine owns:
  //   .id-floor      → the id rule's third input; hand-reading it skips the sweep
  //   find over logs → the archival gate and the statusless-is-open rule
  //   awk/sed on ^status → the queue rule (a grep drops statusless files)
  const forbidden = [
    [/\.id-floor/, "reads archive/.id-floor directly — use `next-id`/`write`"],
    [
      /find\s+[^\n]*observation-log[^\n]*-name/,
      "enumerates the log with find — use `scan` or `queue`",
    ],
    [/(awk|sed)\s+[^\n]*\^status/, "parses frontmatter by hand — use `scan`"],
    [
      /grep\s+[^\n]*['"]status:\s*open/,
      "derives the queue from a status grep — `status` is optional and its " +
        "absence means open, so the grep drops exactly the files that belong " +
        "in the queue. Use `queue`.",
    ],
  ];
  for (const [re, why] of forbidden) {
    assert.doesNotMatch(BODY, re, `SKILL.md ${why}`);
  }
});

test("every engine subcommand named in the body exists in the engine", () => {
  const engine = readOutside("shared", "resources", "observation-log.js");
  if (engine === null) return; // packaged install without the repo

  const named = new Set(
    [...BODY.matchAll(/observation-log\.js\s+([a-z-]+)/g)].map((m) => m[1]),
  );
  assert.ok(named.size > 0, "the body must invoke the engine");

  const declared = engine.match(
    /const SUBCOMMANDS = new Set\(\[([\s\S]*?)\]\)/,
  );
  assert.ok(declared, "engine must declare SUBCOMMANDS");
  const known = new Set(
    [...declared[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]),
  );

  for (const sub of named) {
    assert.ok(
      known.has(sub),
      `SKILL.md invokes \`observation-log.js ${sub}\`, which the engine does not ` +
        `implement. Known: ${[...known].sort().join(", ")}`,
    );
  }
});

test("every reason the body branches on is in the engine's vocabulary", () => {
  const engine = readOutside("shared", "resources", "observation-log.js");
  if (engine === null) return;

  // Collect from every line that mentions `reason`, not just the object-literal
  // form. The engine emits `fork-detected` by assignment (`reason = "…"`) and
  // `already` from a ternary (`reason: x ? "ok" : "already"`), so a regex keyed
  // on `reason: "…"` alone under-collects the vocabulary — and an
  // under-collected "known" set makes this assertion fail on reasons that are
  // real, which is the failure mode that looks most like a finding.
  const known = new Set();
  for (const line of engine.split("\n")) {
    if (!/\breason\b/.test(line)) continue;
    for (const m of line.matchAll(/"([a-z0-9-]+)"/g)) known.add(m[1]);
  }
  // Reasons the body names in its reason tables, as backticked literals.
  const branched = [
    "ok",
    "ephemeral-workspace",
    "fork-detected",
    "empty",
    "scan-broken",
  ];
  for (const reason of branched) {
    assert.ok(
      BODY.includes(`\`${reason}\``),
      `the body should document the \`${reason}\` branch`,
    );
    assert.ok(
      known.has(reason),
      `the body branches on reason \`${reason}\`, which the engine never emits`,
    );
  }
});

test("the missing-workspace branch keys on `healthy`, not on `reason`", () => {
  // TASK-94-001. `doctor` on an uninitialised workspace returns reason "ok",
  // healthy false, exitCode 0, and a checks[] entry `workspace-exists` with
  // ok:false. A protocol that branches on `reason` alone matches the "Nothing"
  // row and never runs `init`; the next step's `scan` then answers `empty` for
  // a directory that does not exist. Two silent failures compounding into a
  // reassuring one, in the skill's first action of every session.
  const step1 = BODY.split(/\*\*1\. Storage\.\*\*/)[1];
  assert.ok(step1, "Session Start step 1 must exist");
  const scoped = step1.split(/\*\*2\. Scan\.\*\*/)[0];

  assert.match(
    scoped,
    /`healthy`/,
    "step 1 must tell the reader to read `healthy` — a missing workspace is a " +
      "failing CHECK, not a failing call",
  );
  assert.match(
    scoped,
    /workspace-exists/,
    "step 1 must name the `workspace-exists` check that carries the signal",
  );

  // The init row must be keyed on healthy/checks, never on a `reason` value.
  const initRow = scoped
    .split("\n")
    .find((l) => /\binit\b/.test(l) && l.startsWith("|"));
  assert.ok(initRow, "step 1 must carry a row whose action is `init`");
  assert.match(
    initRow,
    /healthy|workspace-exists/,
    `the init row must key on healthy/checks, not on a reason value: ${initRow}`,
  );

  // These two ARE real reason values and must stay keyed on reason.
  for (const r of ["ephemeral-workspace", "fork-detected"]) {
    const row = scoped
      .split("\n")
      .find((l) => l.startsWith("|") && l.includes(r));
    assert.ok(row, `step 1 must still carry a row for the ${r} reason`);
    assert.match(
      row,
      /`reason`/,
      `${r} IS a real reason value and its row must stay keyed on reason: ${row}`,
    );
  }
});

test("`healthy: false` alone never blocks a write", () => {
  // TASK-94-004, introduced by the fix for TASK-94-001. `healthy` is
  // `failed.length === 0` over FOUR checks, one of which is
  // `activation-configured` — false in every project that has not yet added the
  // activation instruction, i.e. every project on first install. A blanket
  // "healthy: false → do not write" therefore refuses to capture in exactly the
  // projects the skill most needs to work in, and it does so BEFORE step 4,
  // which is the step that resolves it.
  const step1 = BODY.split(/\*\*1\. Storage\.\*\*/)[1];
  const scoped = step1.split(/\*\*2\. Scan\.\*\*/)[0];

  // The activation check must be named, and its row must not stop a write.
  const activationRow = scoped
    .split("\n")
    .find((l) => l.startsWith("|") && l.includes("activation-configured"));
  assert.ok(
    activationRow,
    "step 1 must name `activation-configured` explicitly — it is the one check " +
      "that fails on a healthy log, and the one a catch-all gets wrong",
  );
  assert.match(
    activationRow,
    /continue/i,
    `the activation-configured row must continue, not block: ${activationRow}`,
  );

  // No row may make a bare `healthy: false` a stop condition.
  const blanket = scoped
    .split("\n")
    .filter((l) => l.startsWith("|") && /healthy[^|]*false/i.test(l))
    .filter((l) => /do not write|stop|halt/i.test(l));
  assert.deepEqual(
    blanket,
    [],
    "no row may treat a bare `healthy: false` as a stop condition — it folds in " +
      "activation-configured, which is false on every fresh install",
  );
});

test("the body never invokes bare `node`", () => {
  // On a machine where `node` is an nvm shell function, the bare form prints
  // nvm's help to stdout and corrupts every --json payload the caller captures.
  // Negative lookbehind rather than a post-filter: the match starts at the
  // character BEFORE `node`, so a post-filter for "command node" never sees
  // the word "command" and passes everything.
  const bare = [
    ...BODY.matchAll(/(?<!command )(?<![A-Za-z_./-])node\s+\S/g),
  ].map((m) => m[0]);
  assert.deepEqual(
    bare,
    [],
    "use `command node`, never bare `node` — see the Quick reference note",
  );
});

test("the resolver is always sourced guarded", () => {
  const sources = [
    ...BODY.matchAll(/^.*source .*resolve-observation-workspace\.sh.*$/gm),
  ];
  assert.ok(sources.length > 0, "the body must source the resolver");
  for (const [line] of sources) {
    // Inside a markdown table cell the shell `||` is escaped as `\|\|`, so the
    // guard must be recognised in both forms — a check that only knew the bare
    // form would pass a table row that had silently lost its guard.
    assert.match(
      line,
      /(\\\||\|)(\\\||\|)\s*exit 1/,
      "a bare `source` prints the resolver's error and carries on with the " +
        "variables unset, which turns every filter into a match-nothing glob " +
        `and reports a clean, empty backlog: ${line}`,
    );
  }
});

// ── Safety properties ────────────────────────────────────────────────────────

test("the staging-only rule is stated in the body, not only in a reference", () => {
  // Staging-only is what makes an autonomous review acceptable. A rule that
  // lives only in a reference is a rule that is absent whenever the reference
  // was not loaded — and the acting contexts do not all load one.
  assert.match(
    BODY,
    /never edits a live skill file/i,
    "the body must state the live-file rule",
  );
});

test("write is never shown with an --id flag", () => {
  // The engine rejects it: ids are always derived, and a batch that pre-computes
  // a base collapses N independent max-checks into one stale read.
  const writes = [
    ...BODY.matchAll(/observation-log\.js write[\s\S]{0,300}?(?=\n\n|\n```)/g),
  ];
  for (const [snippet] of writes) {
    assert.doesNotMatch(snippet, /--id\b/, "`write` does not accept --id");
  }
});

test("siblings-checked is present on every documented write", () => {
  const writes = [
    ...BODY.matchAll(/observation-log\.js write[\s\S]{0,300}?(?=\n\n|\n```)/g),
  ];
  assert.ok(writes.length > 0, "the body must document the write call");
  for (const [snippet] of writes) {
    assert.match(
      snippet,
      /--siblings-checked/,
      "--siblings-checked is mandatory: the two states of a one-entry skill " +
        "list — siblings evaluated and excluded, versus never considered — are " +
        "otherwise byte-identical",
    );
  }
});

// ── In-repo guard ────────────────────────────────────────────────────────────

test("in this repo, the cross-file assertions actually ran", () => {
  // readOutside() returns null on ENOENT so a packaged install can run this
  // suite. That degradation must not silently apply HERE, where it would delete
  // the engine-boundary guards and leave a green suite behind.
  if (!fs.existsSync(path.join(SKILL_DIR, "..", "..", "package.json"))) return;
  assert.ok(
    readOutside("shared", "resources", "observation-log.js"),
    "running in the agent-skills repo but the engine was not readable — the " +
      "engine-boundary assertions above silently skipped",
  );
  assert.ok(
    readOutside("skills", "create-skill", "SKILL.md"),
    "running in the agent-skills repo but create-skill was not readable — the " +
      "invokes: assertion silently skipped",
  );
});

// ── Family template ──────────────────────────────────────────────────────────
//
// The registry the sibling check reads is created empty by `init`, so a shipped
// seed is the difference between a check that has a family to reason about on
// day one and one that reports "no families" forever. These assertions are
// behavioural on purpose: that the template *parses* proves only that it is a
// table, and a `Shared` value that reads well but matches nothing would pass
// such a test while reporting every member as drifted on first run.

const TEMPLATE_REL = path.join("assets", "skill-families.template.md");
const TEMPLATE_PATH = path.join(SKILL_DIR, TEMPLATE_REL);

test("family template: ships as an asset", () => {
  assert.ok(
    fs.existsSync(TEMPLATE_PATH),
    "assets/skill-families.template.md must ship with the skill — the live " +
      "registry is copied from it on first use",
  );
});

test("family template: SKILL.md points at it, with a trigger", () => {
  // A pointer without a condition reads as optional and gets skipped. The
  // trigger is the state you actually find: `init` always creates the file, so
  // the registry is never missing — it is empty.
  assert.match(
    BODY,
    /assets\/skill-families\.template\.md/,
    "SKILL.md must reference the template by path",
  );
  const pointer = BODY.split("\n")
    .filter((l) => l.includes("skill-families.template.md"))
    .join("\n");
  assert.match(
    pointer + BODY,
    /no family rows|holds no family|empty one is/,
    "the pointer must name the condition that triggers seeding (an EMPTY " +
      "registry, not a missing one) — an unconditioned pointer is a bibliography",
  );
});

test("family template: parses into the engine's actual shape, with real members", () => {
  const engine = readOutside("shared", "resources", "observation-log.js");
  if (engine === null) return; // packaged install — repo siblings absent

  const repoRoot = path.join(SKILL_DIR, "..", "..");
  const ws = fs.mkdtempSync(path.join(os.homedir(), ".obs-families-"));
  try {
    fs.mkdirSync(path.join(ws, "skill-observations"), { recursive: true });
    fs.copyFileSync(
      TEMPLATE_PATH,
      path.join(ws, "skill-observations", "skill-families.md"),
    );
    const out = execFileSync(
      process.execPath,
      [
        path.join(repoRoot, "shared", "resources", "observation-log.js"),
        "families",
        "--workspace",
        ws,
        "--json",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const res = JSON.parse(out);

    assert.equal(
      res.count,
      1,
      "exactly one family row must parse — a second row means the three-column " +
        "guidance table was widened to four and is now being read as a family",
    );
    const fam = res.families[0];
    // The shape parseFamilies() actually returns. Asserting a `coherence` field
    // would assert task 93's plan rather than task 93's implementation.
    assert.deepEqual(
      Object.keys(fam).sort(),
      ["members", "memberSpecific", "name", "shared"].sort(),
    );
    assert.equal(fam.name, "meta-skills");
    assert.ok(fam.members.length >= 2, "a family of one is not a family");
    assert.ok(
      fam.shared.length >= 1,
      "a family with no shared material has nothing to drift",
    );
    assert.ok(
      fam.memberSpecific.length >= 1,
      "without Member-specific values every absence reads as drift and the " +
        "audit generates noise instead of signal",
    );

    for (const member of fam.members) {
      assert.ok(
        fs.existsSync(path.join(repoRoot, "skills", member, "SKILL.md")),
        `seeded family names '${member}', which is not a skill directory — ` +
          "the audit would report it as a permanent member-not-found gap",
      );
    }
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("family template: `families --audit` against this repo returns ZERO gaps", () => {
  const engine = readOutside("shared", "resources", "observation-log.js");
  if (engine === null) return; // packaged install — repo siblings absent

  const repoRoot = path.join(SKILL_DIR, "..", "..");
  const ws = fs.mkdtempSync(path.join(os.homedir(), ".obs-families-audit-"));
  try {
    fs.mkdirSync(path.join(ws, "skill-observations"), { recursive: true });
    fs.copyFileSync(
      TEMPLATE_PATH,
      path.join(ws, "skill-observations", "skill-families.md"),
    );
    const out = execFileSync(
      process.execPath,
      [
        path.join(repoRoot, "shared", "resources", "observation-log.js"),
        "families",
        "--audit",
        "--workspace",
        ws,
        "--json",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const res = JSON.parse(out);

    // This is the assertion that matters. It proves the seeded `Shared` value is
    // really present, verbatim, in every member it names — the property a parse
    // test cannot reach. A seeded family that fails its own audit on first run
    // teaches the adopter to ignore the check.
    assert.deepEqual(
      res.gaps,
      [],
      "the seeded family must audit clean against this repo; gaps: " +
        JSON.stringify(res.gaps),
    );

    // Non-vacuity: a `Shared` value that the suppression column swallows would
    // also produce zero gaps while checking nothing. Assert the check can fail.
    const fam = res.families[0];
    for (const rule of fam.shared) {
      assert.ok(
        !fam.memberSpecific.some(
          (ms) => rule.includes(ms) || ms.includes(rule),
        ),
        `shared rule "${rule.slice(0, 40)}…" is suppressed by a Member-specific ` +
          "value, so the audit skips it and zero gaps proves nothing",
      );
    }
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

// ── Resolver contract ────────────────────────────────────────────────────────
//
// docs/reference/configuration.md § "Observation workspace" documents a
// precedence order and a hard refusal. Both are asserted by DRIVING the resolver,
// never by grepping it: a test that finds the word "precedence" in the script
// proves the word is there. Two claims in an earlier draft of that section were
// wrong in exactly the way a source-text test cannot see.
//
// Fixtures live under os.homedir(), not os.tmpdir() — the resolver refuses a
// /tmp anchor, which is itself asserted below. The SAME rule binds the family
// fixtures above, for the same reason: `observation-log.js` refuses an ephemeral
// `--workspace` too, returning `reason: "ephemeral-workspace"` and exit 1.
// That is easy to miss on macOS, where `os.tmpdir()` is `/var/folders/…` and
// passes; on Linux it is literally `/tmp` and fails. A first version of the
// family tests used `os.tmpdir()`, passed locally, and went red only in CI.

const RESOLVER = path.join(
  SKILL_DIR,
  "references",
  "resolve-observation-workspace.sh",
);

/**
 * Source the resolver in `cwd`. Returns `{ refused, workspace }`.
 *
 * The two fields are deliberately separate. A first draft of this helper
 * returned `null` for both "the resolver refused" and "the resolver exported an
 * empty value", and the ephemeral-refusal test below then passed against a
 * mutant that had been changed to warn-and-continue — because the refusal block
 * unsets its candidate before falling through, so a warn-and-continue resolver
 * exports the empty string and the two states are byte-identical. One signal
 * reporting two states is the defect the assertion exists to catch, so the
 * helper must not reproduce it.
 *
 * Uses bash: the resolver is bash, not POSIX sh.
 */
function resolveIn(cwd, env = {}) {
  const r = spawnSync(
    "bash",
    [
      "-c",
      `. "${RESOLVER}"; printf 'RC=%s\\nWS=%s\\n' "$?" "\${OBS_WORKSPACE:-}"`,
    ],
    {
      cwd,
      env: { ...process.env, OBS_WORKSPACE: "", ...env },
      encoding: "utf8",
    },
  );
  const rc = /RC=(\d+)/.exec(r.stdout || "");
  const ws = /WS=(.*)/.exec(r.stdout || "");
  return {
    // `ran` is what stops a refusal assertion passing on a dead harness. Without
    // it, `refused: true` covers both "the resolver returned non-zero" and "bash
    // never produced output" — the same two-states-one-signal shape this helper
    // already fixed for the VALUE, left standing on the STATUS. The sibling
    // tests would fail first in practice, but that mitigation lives in other
    // test bodies; the test that depends on the guarantee should carry it.
    ran: rc !== null,
    refused: rc ? rc[1] !== "0" : true,
    workspace: ws ? ws[1].trim() : "",
  };
}

/**
 * A durable scratch project. See the header note on /tmp.
 *
 * Deliberately takes no config-body argument: only one of the three tests below
 * wants a `skills-config.yaml`, and it writes one itself so the path it points
 * at can be a directory this function has already created. A parameter every
 * caller passes `null` to is a branch nothing exercises.
 */
function makeProject() {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".observe-work-resolver-"),
  );
  fs.mkdirSync(path.join(root, "proj"), { recursive: true });
  return root;
}

test("resolver: skills-config.yaml beats $OBS_WORKSPACE", (t) => {
  if (!fs.existsSync(RESOLVER))
    return t.skip("resolver not shipped in this install");
  const root = makeProject();
  try {
    const fromConfig = path.join(root, "from-config");
    const fromEnv = path.join(root, "from-env");
    fs.mkdirSync(fromConfig);
    fs.mkdirSync(fromEnv);
    fs.writeFileSync(
      path.join(root, "proj", "skills-config.yaml"),
      `observations:\n  workspace: ${fromConfig}\n`,
    );
    const r = resolveIn(path.join(root, "proj"), { OBS_WORKSPACE: fromEnv });
    assert.equal(r.refused, false, "resolver refused a durable config path");
    assert.equal(
      r.workspace,
      fromConfig,
      "config must win over env — the documented order is config → env → default",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolver: $OBS_WORKSPACE is used when the config key is absent", (t) => {
  if (!fs.existsSync(RESOLVER))
    return t.skip("resolver not shipped in this install");
  const root = makeProject();
  try {
    const fromEnv = path.join(root, "from-env");
    fs.mkdirSync(fromEnv);
    const r = resolveIn(path.join(root, "proj"), { OBS_WORKSPACE: fromEnv });
    assert.equal(r.refused, false, "resolver refused a durable env path");
    assert.equal(
      r.workspace,
      fromEnv,
      "with no config key the env var is the second tier — if this returns the " +
        "default instead, the env tier is dead and its documentation is inert",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolver: an ephemeral anchor is REFUSED, not silently defaulted", (t) => {
  if (!fs.existsSync(RESOLVER))
    return t.skip("resolver not shipped in this install");
  const root = makeProject();
  try {
    // The distinction that matters: refusing returns non-zero (=> null here).
    // Falling back to the default would return a path, and the caller would
    // never learn its chosen anchor was rejected.
    const r = resolveIn(path.join(root, "proj"), {
      OBS_WORKSPACE: "/tmp/observe-work-should-be-refused",
    });
    // Assert the RETURN STATUS, not the exported value. A warn-and-continue
    // resolver exports the empty string here, which is indistinguishable from a
    // refusal if you only look at the value — and that is the whole difference
    // between refusing and defaulting.
    assert.ok(
      r.ran,
      "the RC probe produced no output — bash did not run, so `refused` below " +
        "would report a dead harness as a successful refusal",
    );
    assert.equal(
      r.refused,
      true,
      "a /tmp anchor did not make the resolver return non-zero — a log written " +
        "there is torn down with the checkout, and because the documented " +
        "`source … || exit 1` guard keys on the return status, a warning that " +
        "returns 0 is silently ignored by every caller",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolver: every documented `observations.*` key has a reader", (t) => {
  // The weaker property a precedence test assumes and does not check. Two keys
  // in an earlier draft of the config doc — `observations.enabled` and
  // `observations.review_interval_days` — were documented with no reader
  // anywhere in the tree, which ships a knob that silently does nothing.
  const doc = readOutside("docs", "reference", "configuration.md");
  const resolver = readOutside(
    "shared",
    "resources",
    "resolve-observation-workspace.sh",
  );
  if (doc === null || resolver === null) return t.skip("repo siblings absent");

  assert.ok(
    doc.includes("## Observation workspace"),
    "configuration.md must carry an `## Observation workspace` section",
  );

  // A key is DOCUMENTED where it is offered to the reader as settable: as a
  // field of the `observations:` block in the Full schema listing, or as a row
  // of the Key reference table. Prose that names a key in order to say it does
  // NOT exist is the opposite of documenting it, so scanning the whole file
  // would count the disclaimer as the thing it disclaims.
  const documented = new Set();

  const schemaBlock = doc.match(/^observations:\n((?:[ \t]+.*\n|\n)*)/m);
  if (schemaBlock) {
    for (const m of schemaBlock[1].matchAll(/^\s{2}([a-z_]+):/gm)) {
      documented.add(m[1]);
    }
  }
  for (const m of doc.matchAll(/^\|\s*`observations\.([a-z_]+)`/gm)) {
    documented.add(m[1]);
  }

  // Non-vacuity: an empty set would pass the loop below while checking nothing.
  assert.ok(
    documented.size > 0,
    "no `observations.*` key found in the schema block or the key-reference " +
      "table — the scan is broken, not the documentation clean",
  );
  assert.ok(
    documented.has("workspace"),
    "`observations.workspace` is the one key that exists; a scan that misses " +
      "it is reading the wrong part of the document",
  );

  for (const key of documented) {
    assert.match(
      resolver,
      new RegExp(`read_nested_config_key\\s+observations\\s+${key}\\b`),
      `configuration.md offers \`observations.${key}\` as settable, but the ` +
        "resolver never reads it — a documented key with no reader is a knob " +
        "that silently does nothing",
    );
  }
});

test("resolver: the CONTRACT's stated precedence matches the resolver's implemented order", (t) => {
  // The third copy. The precedence rule is stated in three places — the
  // resolver's own header, observation-log-contract.md, and
  // configuration.md — and the tests above bind only the last of those to
  // behaviour. This binds the contract too, so a copy cannot drift while the
  // other two stay honest.
  //
  // It asserts ORDER, not wording: the three tiers must appear in the contract
  // in the same sequence the resolver consults them. Anchored on the tokens the
  // resolver actually branches on (`observations.workspace`, `OBS_WORKSPACE`),
  // so a rewrite of the surrounding prose does not fail this, but reordering the
  // list does.
  const contract = readOutside(
    "shared",
    "resources",
    "observation-log-contract.md",
  );
  const resolver = readOutside(
    "shared",
    "resources",
    "resolve-observation-workspace.sh",
  );
  if (contract === null || resolver === null)
    return t.skip("repo siblings absent");

  const section = contract.split(/^Resolver order:$/m)[1];
  assert.ok(
    section,
    "observation-log-contract.md must state a `Resolver order:` list — the " +
      "assertion below cannot bind a rule the contract does not state",
  );
  const list = section
    .split(/\n\s*\n/)
    .slice(0, 2)
    .join("\n");

  const iConfig = list.indexOf("observations.workspace");
  const iEnv = list.indexOf("OBS_WORKSPACE");
  const iDefault = list.search(/project-identity/);
  assert.ok(
    iConfig !== -1 && iEnv !== -1 && iDefault !== -1,
    `contract's resolver-order list is missing a tier — config:${iConfig} ` +
      `env:${iEnv} default:${iDefault}. A list that names fewer than three ` +
      "tiers makes the ordering assertion below vacuous",
  );
  assert.ok(
    iConfig < iEnv && iEnv < iDefault,
    "the contract lists the tiers in a different order from the one the " +
      "resolver implements (config → $OBS_WORKSPACE → project-identity), " +
      "which the behavioural tests above prove. Two documents stating " +
      "different precedence is worse than one stating none",
  );

  // Non-vacuity: the resolver must actually consult them in that order, so the
  // assertion above is checked against something real rather than against a
  // second copy of the same prose.
  const rConfig = resolver.indexOf(
    "read_nested_config_key observations workspace",
  );
  const rEnv = resolver.indexOf("${OBS_WORKSPACE:-}");
  assert.ok(
    rConfig !== -1 && rEnv !== -1 && rConfig < rEnv,
    "the resolver no longer reads the config tier before the env tier — the " +
      "contract assertion above is now measuring against the wrong baseline",
  );
});
