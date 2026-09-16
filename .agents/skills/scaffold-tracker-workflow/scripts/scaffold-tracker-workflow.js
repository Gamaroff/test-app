#!/usr/bin/env node
"use strict";
/**
 * scaffold-tracker-workflow.js — read a live board, write the ladder that
 * describes it.
 *
 * `tracker-workflow.yaml` is hand-authored today, which means every consumer
 * re-derives the same three facts by hand: what their board's columns are, what
 * order they sit in, and which pipeline moment belongs at each. All three are
 * already knowable from the tracker. This reads them and emits the file.
 *
 * THE OUTPUT IS A PROPOSAL, NOT AN ANSWER. Column names are written by humans
 * for humans, so mapping them onto a closed set of moments is inference, and
 * inference is wrong sometimes. Every choice is emitted with the evidence that
 * produced it, and `--print` exists so the file can be read before it lands.
 *
 * Nothing here is tracker-specific beyond the two probe functions: the ladder,
 * the inference and the emitter all operate on an ordered list of column names,
 * which is the one thing every board has.
 *
 * Usage:
 *   node scaffold-tracker-workflow.js [options]
 *
 *   --tracker jira|github  override platform detection
 *   --project KEY|NUMBER   Jira project key, or GitHub Project (v2) number
 *   --board ID             Jira board id (defaults to $JIRA_BOARD_ID)
 *   --out PATH             where to write (default: <repo root>/tracker-workflow.yaml)
 *   --print                write nothing; print the YAML to stdout
 *   --force                overwrite an existing file
 *   --json                 machine-readable summary instead of prose
 *   --enable-done          map `done` even when the board has a merge queue
 *   --no-overlays          skip per-issue-type overlays (Jira only)
 *   --set moment=Status    override an inferred moment; `~` disables it. Repeatable.
 *   --help
 *
 * Exit codes:
 *   0  wrote (or printed) a file that validates
 *   1  refused — file exists without --force, or the result had validation errors
 *   2  usage error
 *   3  could not read the board (no credentials, no board, no permission)
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const lib = require("../references/jira-sync.js");
const tw = require("../references/tracker-workflow.js");

// ---------------------------------------------------------------------------
// Moment inference
// ---------------------------------------------------------------------------
//
// Ordered, and the order is the tie-break: a column matching two rules is
// claimed by the earlier one. `in-review` precedes `in-qa` because "Ready for
// Review" is far more common than a review column that mentions QA, and the
// loser is always reported as an ambiguity rather than silently dropped.
//
// These match a NORMALISED name (lowercased, punctuation to spaces, collapsed),
// so "READY FOR SHOWCASE", "Ready For Showcase" and "ready-for-showcase" are one
// string by the time they arrive.
const MOMENT_RULES = [
  {
    moment: "work-started",
    re: /^(in progress|doing|in development|development|started|wip|active|implementing)$/,
    why: "names the column work moves to when it starts",
  },
  {
    moment: "in-review",
    re: /\breview\b/,
    why: "names a review column",
  },
  {
    moment: "in-qa",
    re: /\b(qa|test|testing|tests|verify|verification|uat|validation)\b/,
    why: "names a testing or QA column",
  },
  {
    moment: "ready-for-merge",
    re: /\bmerges?\b|\bmerging\b/,
    why: "names a merge queue",
  },
  {
    moment: "blocked",
    re: /^(blocked|on hold|impediment|impediments|stalled|waiting on external)$/,
    why: "names a blocked side-state",
  },
  {
    moment: "done",
    re: /^(done|closed|complete|completed|resolved|shipped|released|finished)$/,
    why: "names the terminal column",
  },
];

function normaliseName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_/|.,:;()[\]{}\-—–]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Moments whose column is an INTERRUPTION rather than a position, and which
// therefore belong off the ladder entirely.
//
// This is not cosmetic. A board routinely puts its Blocked column early — RAPP's
// sits at index 1, before In Progress — and a rung's index is its rank, so
// laddering it would rank a blocked card BELOW a card being worked on. Two things
// then go wrong at once: the backward-move guard starts refusing legitimate
// moves out of Blocked, and "order is the path" makes Blocked a rung the walker
// will pass THROUGH on its way somewhere else. Neither is recoverable by
// reordering, because the column genuinely is where the board puts it.
//
// The reference names exactly this shape: a target absent from `statuses:` is a
// side-state, entered directly and never walked to. So a side-state column is
// emitted as a moment target and omitted from the ladder.
const SIDE_STATE_MOMENTS = new Set(["blocked"]);

/**
 * Split probed columns into ladder positions and off-ladder side-states.
 *
 * A column is a side-state when its ONLY claim is a side-state moment. A column
 * that also reads as a real position keeps its rung — the ambiguity is reported
 * rather than resolved by dropping it.
 */
function partitionColumns(columns) {
  const ladderColumns = [];
  const sideStates = [];
  for (const col of columns) {
    const claims = new Set();
    for (const name of col.statuses || []) {
      const n = normaliseName(name);
      for (const rule of MOMENT_RULES)
        if (rule.re.test(n)) claims.add(rule.moment);
    }
    const sideOnly =
      claims.size > 0 && [...claims].every((m) => SIDE_STATE_MOMENTS.has(m));
    if (sideOnly) {
      sideStates.push({
        moment: [...claims][0],
        name: (col.statuses || [])[0],
        column: col.name,
      });
    } else {
      ladderColumns.push(col);
    }
  }
  return { ladderColumns, sideStates };
}

// The order the moments are expected to fire in. Used only to CHECK a scaffolded
// ladder, never to reorder one — the board's column order is a fact about the
// board, and silently rewriting it would hide exactly the thing worth seeing.
const MOMENT_SEQUENCE = [
  "work-started",
  "in-review",
  "in-qa",
  "ready-for-merge",
  "done",
];

/**
 * Report moments whose targets sit out of pipeline order on this ladder.
 *
 * Boards are arranged for the people who stare at them, not for a state machine,
 * so a column order that reads oddly is common and usually harmless. It stops
 * being harmless here: rank comes from ladder position, so a review column
 * ranked ABOVE a QA column means signalling `in-qa` after `in-review` is a
 * backward move, and the guard refuses it. The run then looks frozen for a
 * reason nothing in the log explains.
 *
 * Reported, never repaired. The fix is a human deciding whether the board or the
 * expectation is wrong, and both answers are legitimate.
 */
function checkMomentOrder(ladder, moments) {
  const rankOfTarget = (name) =>
    ladder.findIndex((r) =>
      r.names.some((n) => normaliseName(n) === normaliseName(name)),
    );

  const placed = MOMENT_SEQUENCE.filter((m) => m in moments)
    .map((m) => ({
      moment: m,
      target: moments[m],
      rank: rankOfTarget(moments[m]),
    }))
    .filter((x) => x.rank >= 0);

  const inversions = [];
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].rank < placed[i - 1].rank)
      inversions.push({ earlier: placed[i - 1], later: placed[i] });
  }
  return inversions;
}

/**
 * Match every rung against every rule.
 *
 * Returns, per moment, the candidate rungs in ladder order — earliest first,
 * because a moment should land a card at the ENTRY to a phase, not its exit.
 * A board with both "Ready for Testing" and "Testing" wants `in-qa` at the
 * first; picking the last would skip the queue the column exists to form.
 */
function matchRungs(ladder) {
  const byMoment = new Map();
  const ambiguous = [];

  ladder.forEach((rung, rank) => {
    const claimed = [];
    for (const name of rung.names) {
      const n = normaliseName(name);
      for (const rule of MOMENT_RULES) {
        if (!rule.re.test(n)) continue;
        if (claimed.includes(rule.moment)) continue;
        claimed.push(rule.moment);
      }
    }
    if (claimed.length > 1) {
      ambiguous.push({ rung: rung.names[0], rank, moments: claimed.slice() });
    }
    // Order is the tie-break: the first rule that claimed this rung owns it.
    const winner = claimed[0];
    if (!winner) return;
    if (!byMoment.has(winner)) byMoment.set(winner, []);
    byMoment.get(winner).push({ rank, rung });
  });

  return { byMoment, ambiguous };
}

/**
 * Turn rung matches into a `pipeline:` block.
 *
 * `done` carries the one piece of judgement in this file, and it is judgement
 * about a hazard rather than a preference. When a board has BOTH a merge queue
 * and a terminal column, the two are different events: work is accepted at one
 * and merged at the other. A pipeline that closes a card on acceptance closes it
 * while its pull request is still open — and anything tracking that card as a
 * parent (an epic, a milestone) follows it down.
 *
 * So `done` is proposed as disabled whenever a merge queue sits below the
 * terminal column, and a human moves the card the last step. That is derived
 * entirely from the board's own shape — a board with no merge queue gets `done`
 * mapped normally — and `--enable-done` overrides it for anyone who disagrees.
 */
function inferMoments(
  ladder,
  { enableDone = false, overrides = {}, sideStates = [] } = {},
) {
  const { byMoment, ambiguous } = matchRungs(ladder);
  const moments = {};
  const notes = [];

  // Side-states first, so a ladder rung that also matched the moment can still
  // override it below — the ladder is the more specific signal.
  for (const s of sideStates) {
    moments[s.moment] = s.name;
    notes.push({
      moment: s.moment,
      target: s.name,
      rank: null,
      why: `column "${s.column}" is an interruption, not a position — kept off the ladder`,
      alternatives: [],
      offLadder: true,
    });
  }

  for (const rule of MOMENT_RULES) {
    const hits = byMoment.get(rule.moment) || [];
    if (!hits.length) continue;
    const pick = hits[0];
    moments[rule.moment] = pick.rung.names[0];
    notes.push({
      moment: rule.moment,
      target: pick.rung.names[0],
      rank: pick.rank,
      why: rule.why,
      alternatives: hits.slice(1).map((h) => h.rung.names[0]),
    });
  }

  const mergeRank = (byMoment.get("ready-for-merge") || [])[0];
  const doneRank = (byMoment.get("done") || [])[0];
  let doneSuppressed = false;
  if (
    !enableDone &&
    mergeRank &&
    doneRank &&
    mergeRank.rank < doneRank.rank &&
    moments.done
  ) {
    delete moments.done;
    doneSuppressed = true;
  }

  // Explicit overrides win over everything, including the done rule.
  for (const [moment, target] of Object.entries(overrides)) {
    if (target === null) delete moments[moment];
    else moments[moment] = target;
  }

  return {
    moments,
    notes,
    ambiguous,
    doneSuppressed,
    missing: MOMENT_RULES.map((r) => r.moment).filter((m) => !(m in moments)),
  };
}

// ---------------------------------------------------------------------------
// Ladder construction
// ---------------------------------------------------------------------------

/**
 * A board column may aggregate several statuses — Jira's leftmost column
 * routinely holds Open, Selected for Development and Reopened at once. That is
 * exactly a rung with alternatives, so the two shapes map onto each other with
 * nothing lost.
 *
 * Within a column the statuses keep the order the board administrator gave
 * them, because no better signal exists and inventing one would be a guess
 * dressed as a fact. The first name leads, and the emitter says so in a comment
 * so an author can reorder it deliberately.
 */
function buildLadderFromColumns(columns) {
  const ladder = [];
  const seen = new Set();
  for (const col of columns) {
    const names = [];
    for (const name of col.statuses || []) {
      const k = normaliseName(name);
      // A status on two columns would rank twice, and rankOf's answer would
      // depend on rung order — which is not something an author can reason
      // about. validateWorkflow rejects it, so drop the later one here and say
      // so, rather than emitting a file that is known to fail its own gate.
      if (seen.has(k)) continue;
      seen.add(k);
      names.push(name);
    }
    if (names.length) ladder.push({ column: col.name, names });
  }
  return ladder;
}

/**
 * Per-issue-type overlays, Jira only.
 *
 * An overlay REPLACES the ladder rather than merging with it, so a type's block
 * has to carry its whole ladder. Every moment whose target that type cannot
 * reach is disabled explicitly with `~` — the reference recommends this over
 * letting it inherit, because an inherited target that is absent from the
 * type's ladder resolves to an off-ladder side-state and quietly moves cards
 * somewhere nobody chose.
 */
function buildOverlays(ladder, statusesByIssueType, moments) {
  const overlays = {};

  for (const [type, statuses] of Object.entries(statusesByIssueType || {})) {
    const have = new Set((statuses || []).map(normaliseName));
    const rungs = ladder
      .map((r) => ({
        column: r.column,
        names: r.names.filter((n) => have.has(normaliseName(n))),
      }))
      .filter((r) => r.names.length);

    const disabled = [];
    for (const [moment, target] of Object.entries(moments)) {
      if (!have.has(normaliseName(target))) disabled.push(moment);
    }

    // Emit an overlay only for a difference that CHANGES BEHAVIOUR: a whole rung
    // this type cannot reach, or a moment it cannot perform.
    //
    // Not for a rung that merely lost one of its alternative spellings. A rung's
    // names are tried in order until one is reachable, so dropping a name the
    // type never had changes nothing — and an overlay REPLACES the ladder rather
    // than merging with it, making every needless one a second copy to keep in
    // step. On a board where most types differ only in which of three "to do"
    // statuses they carry, that is an overlay per type, all of them inert.
    const losesRung = rungs.length !== ladder.length;
    if (!losesRung && !disabled.length) continue;

    overlays[type] = { statuses: rungs, disable: disabled };
  }
  return overlays;
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

const QUOTE_SAFE = /^[\w.-]+$/;
function yamlKey(k) {
  return QUOTE_SAFE.test(k) ? k : `'${String(k).replace(/'/g, "''")}'`;
}

// A status name is emitted as a plain scalar unless it could be read as
// something else. `~`, `null`, `yes`/`no`/`on`/`off` and anything leading with a
// YAML indicator would change meaning unquoted.
const SCALAR_NEEDS_QUOTE = /^(~|null|true|false|yes|no|on|off)$/i;
function yamlScalar(v) {
  const s = String(v);
  if (
    !s ||
    SCALAR_NEEDS_QUOTE.test(s) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /:\s/.test(s)
  )
    return `'${s.replace(/'/g, "''")}'`;
  return s;
}

function emitYaml(model) {
  const {
    tracker,
    boardLabel,
    generatedFrom,
    ladder,
    moments,
    notes,
    ambiguous,
    doneSuppressed,
    missing,
    overlays,
    dropped,
    sideStates = [],
    inversions = [],
  } = model;

  const L = [];
  const p = (s = "") => L.push(s);

  p(`# tracker-workflow.yaml — scaffolded from ${boardLabel}.`);
  p("#");
  p(
    "# Generated by /scaffold-tracker-workflow. READ IT BEFORE YOU TRUST IT: the",
  );
  p("# ladder below is observed and reliable, but the `pipeline:` mapping is");
  p("# INFERRED from column names and is the part most likely to be wrong.");
  p("#");
  p(`# Source: ${generatedFrom}`);
  p("# Reference: docs/reference/tracker-workflow.md");
  p("#");
  p(
    "# Three properties fall out of the ordering below, and they are the design:",
  );
  p(
    "#   1. Order is rank.        A rung's index is its rank — nothing to hand-author.",
  );
  p(
    "#   2. Omission is disablement. A moment absent from `pipeline:`, or set to `~`,",
  );
  p(
    "#                            does not fire. There is no `enabled: false`.",
  );
  p(
    "#   3. Order is the path.    Forward multi-hop movement walks the rungs between,",
  );
  p(
    "#                            so no transition graph is needed. FORWARD ONLY —",
  );
  p(
    "#                            reopening a card stays a human action, deliberately.",
  );
  p("");

  if (dropped && dropped.length) {
    p(
      "# Statuses seen on more than one column, kept only at their first position:",
    );
    for (const d of dropped) p(`#   ${d.name} (also on "${d.column}")`);
    p("#");
    p("# A status may sit at only one rank — two positions would make the");
    p(
      "# backward-move guard depend on rung order. Check the one kept is right.",
    );
    p("");
  }

  if (inversions.length) {
    p("# ⚠️  READ THIS FIRST — the moments are out of order on this ladder.");
    p("#");
    p(
      "# Your board's columns are arranged in an order that does not match the order",
    );
    p("# the pipeline fires its moments in:");
    for (const inv of inversions)
      p(
        `#   ${inv.earlier.moment} targets "${inv.earlier.target}" (rung ${inv.earlier.rank}) but ` +
          `${inv.later.moment} targets "${inv.later.target}" (rung ${inv.later.rank}) — lower.`,
      );
    p("#");
    p("# Rank comes from ladder position, so as written the later moment is a");
    p(
      "# BACKWARD move and the guard will refuse it. The run will look frozen with",
    );
    p("# nothing in the log to explain it.");
    p("#");
    p(
      "# This is not automatically repairable — the column order is a fact about your",
    );
    p(
      "# board, and either it or the expectation is wrong. Decide which, then either",
    );
    p(
      "# reorder the rungs below to match your real workflow, or drop the moment that",
    );
    p("# does not belong. Boards often carry a column nobody uses any more.");
    p("");
  }

  if (sideStates.length) {
    p("# Off-ladder side-states, deliberately absent from `statuses:` below:");
    for (const s of sideStates)
      p(`#   "${s.name}" (board column "${s.column}") → ${s.moment}`);
    p("#");
    p(
      "# A side-state is an interruption, not a position. Laddering it would give it",
    );
    p(
      "# a rank — and since your board may place it anywhere, that rank could sit",
    );
    p(
      "# below In Progress and make leaving it a backward move. Entered directly,",
    );
    p("# never walked to, never walked through.");
    p("");
  }

  p(
    "# ── The ladder ──────────────────────────────────────────────────────────────",
  );
  p("# Your board's columns, in board order. A rung with several names is ONE");
  p("# position spelled more than one way; the first name leads when a moment");
  p("# targets that rung, so reorder if your board prefers a different one.");
  p("statuses:");
  for (const rung of ladder) {
    if (rung.names.length === 1) {
      p(`  - ${yamlScalar(rung.names[0])}`);
    } else {
      p(`  # column "${rung.column}"`);
      p("  - names:");
      for (const n of rung.names) p(`      - ${yamlScalar(n)}`);
    }
  }
  p("");

  p(
    "# ── The moments ─────────────────────────────────────────────────────────────",
  );
  p(
    "# Which status each pipeline moment moves a card to. The moments are a closed",
  );
  p("# set; this file chooses targets, it cannot invent a moment.");
  p("#");
  p(
    "# Each line below records why it was inferred. Verify them — a column name is",
  );
  p("# written for humans and read here by a regular expression.");
  if (ambiguous.length) {
    p("#");
    p("# AMBIGUOUS — these columns matched more than one moment:");
    for (const a of ambiguous)
      p(
        `#   "${a.rung}" matched ${a.moments.join(", ")} — resolved to ${a.moments[0]}`,
      );
  }
  p("pipeline:");
  for (const rule of MOMENT_RULES) {
    const m = rule.moment;
    const note = notes.find((n) => n.moment === m);
    if (!(m in moments)) continue;
    if (note && note.alternatives.length)
      p(
        `  # also matched: ${note.alternatives.join(", ")} — took the earliest rung`,
      );
    p(`  ${m}: ${yamlScalar(moments[m])}`);
  }
  if (doneSuppressed) {
    p("");
    p(
      "  # `done` is deliberately NOT mapped, because this board has a merge queue.",
    );
    p(
      "  # Accepting work and merging it are different events. A pipeline that closes",
    );
    p(
      "  # a card on acceptance closes it while its pull request is still open, and",
    );
    p(
      "  # anything tracking that card as a parent follows it down. The card stops at",
    );
    p("  # the merge queue and a human closes it once the PR actually lands.");
    p("  #");
    p(
      "  # Re-run with --enable-done if your board genuinely wants the last hop",
    );
    p("  # automated, or uncomment and name the column yourself.");
    p("  # done: <terminal column>");
  }
  const stillMissing = missing.filter((m) => !(doneSuppressed && m === "done"));
  if (stillMissing.length) {
    p("");
    p(`  # No column matched: ${stillMissing.join(", ")}.`);
    p(
      "  # Omission is disablement, so these do not fire. If your board does have a",
    );
    p(
      "  # column for one, add it here — the name just did not match any pattern.",
    );
  }
  p("");

  if (overlays && Object.keys(overlays).length) {
    p(
      "# ── Per-issue-type overlays ─────────────────────────────────────────────────",
    );
    p(
      "# One board gives different issue types different workflows. An overlay",
    );
    p(
      "# REPLACES the ladder rather than merging with it, so each block carries its",
    );
    p(
      "# type's whole ladder. Moments that type cannot reach are disabled with `~`.",
    );
    p("#");
    p(
      "# Keys are QUOTED. The parser's bare-key pattern excludes spaces and slashes,",
    );
    p("# and an unquoted multi-word key drops the whole overlay SILENTLY.");
    p("byIssueType:");
    for (const [type, spec] of Object.entries(overlays)) {
      p(`  ${yamlKey(type)}:`);
      p("    statuses:");
      for (const rung of spec.statuses) {
        if (rung.names.length === 1) {
          p(`      - ${yamlScalar(rung.names[0])}`);
        } else {
          p("      - names:");
          for (const n of rung.names) p(`          - ${yamlScalar(n)}`);
        }
      }
      if (spec.disable.length) {
        p("    pipeline:");
        for (const m of spec.disable) p(`      ${m}: ~`);
      }
      p("");
    }
  }

  if (tracker === "github") {
    p(
      "# Note: GitHub execution is not wired yet — the file validates and the ladder",
    );
    p(
      "# is correct, but no card moves until that lands. Authoring it now is safe.",
    );
    p("");
  }

  return (
    L.join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

async function probeJira({ http, baseUrl, email, token, project, boardId }) {
  const headers = {
    Authorization: lib.authHeader(email, token),
    Accept: "application/json",
  };

  const typesResp = await http(
    `${baseUrl}/rest/api/3/project/${project}/statuses`,
    { headers },
  );
  if (!typesResp.ok)
    throw new Error(
      `could not read project statuses for ${project} (HTTP ${typesResp.status}) — check JIRA_PROJECT_KEY and the token's scopes`,
    );
  const types = await typesResp.json();

  const statusesByIssueType = {};
  const idToName = new Map();
  for (const t of types) {
    statusesByIssueType[t.name] = (t.statuses || []).map((s) => s.name);
    for (const s of t.statuses || []) idToName.set(String(s.id), s.name);
  }

  let columns = null;
  let source = "";
  if (boardId) {
    try {
      const cfg = await http(
        `${baseUrl}/rest/agile/1.0/board/${boardId}/configuration`,
        { headers },
      );
      if (cfg.ok) {
        const data = await cfg.json();
        const cols = (data.columnConfig && data.columnConfig.columns) || [];
        columns = cols.map((c) => ({
          name: c.name,
          statuses: (c.statuses || [])
            .map((s) => idToName.get(String(s.id)))
            .filter(Boolean),
        }));
        source = `board ${boardId} column configuration`;
      }
    } catch (_) {}
  }

  if (!columns || !columns.length) {
    // No board, or no permission to read its configuration. Fall back to the
    // widest issue type's own status order — which is workflow order, NOT board
    // order, and the two are not the same thing. Say so loudly: a ladder in the
    // wrong order ranks cards wrongly, and rank is what stops a resumed run
    // walking a card backwards.
    const widest = Object.entries(statusesByIssueType).sort(
      (a, b) => b[1].length - a[1].length,
    )[0];
    if (!widest)
      throw new Error(`project ${project} reported no statuses at all`);
    columns = widest[1].map((n) => ({ name: n, statuses: [n] }));
    source = `workflow order of issue type "${widest[0]}" — NO board column order available`;
  }

  return { columns, statusesByIssueType, source, boardId };
}

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function probeGithub({ projectNumber }) {
  let owner, repo;
  try {
    owner = gh([
      "repo",
      "view",
      "--json",
      "owner",
      "-q",
      ".owner.login",
    ]).trim();
    repo = gh(["repo", "view", "--json", "name", "-q", ".name"]).trim();
  } catch (_) {
    throw new Error(
      "could not resolve the repository via `gh repo view` — is gh installed and authenticated?",
    );
  }

  const query = `
    {
      repository(owner: "${owner}", name: "${repo}") {
        projectsV2(first: 20) {
          nodes {
            number
            title
            fields(first: 50) {
              nodes {
                ... on ProjectV2SingleSelectField { name options { name } }
              }
            }
          }
        }
      }
    }`;

  let raw;
  try {
    raw = gh(["api", "graphql", "-f", `query=${query}`]);
  } catch (_) {
    throw new Error(
      "`gh api graphql` failed — the token needs the `read:project` scope (`gh auth refresh -s read:project`)",
    );
  }

  const data = JSON.parse(raw);
  const nodes =
    (data.data &&
      data.data.repository &&
      data.data.repository.projectsV2 &&
      data.data.repository.projectsV2.nodes) ||
    [];
  if (!nodes.length)
    throw new Error(`no Project (v2) boards are linked to ${owner}/${repo}`);

  const project = projectNumber
    ? nodes.find((n) => String(n.number) === String(projectNumber))
    : nodes[0];
  if (!project)
    throw new Error(
      `project #${projectNumber} not found — available: ${nodes.map((n) => `#${n.number} ${n.title}`).join(", ")}`,
    );

  const statusField = (project.fields.nodes || []).find(
    (f) => f && f.name && normaliseName(f.name) === "status",
  );
  if (!statusField)
    throw new Error(
      `project "${project.title}" has no single-select "Status" field — a board without one has no columns to read`,
    );

  // Project v2 option order IS board column order, so this needs no sorting.
  const columns = (statusField.options || []).map((o) => ({
    name: o.name,
    statuses: [o.name],
  }));

  return {
    columns,
    statusesByIssueType: {},
    source: `GitHub Project #${project.number} "${project.title}" — Status field options`,
    label: `${owner}/${repo} project #${project.number}`,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    tracker: "",
    project: "",
    board: "",
    out: "",
    print: false,
    force: false,
    json: false,
    enableDone: false,
    overlays: true,
    overrides: {},
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--tracker":
        opts.tracker = argv[++i] || "";
        break;
      case "--project":
        opts.project = argv[++i] || "";
        break;
      case "--board":
        opts.board = argv[++i] || "";
        break;
      case "--out":
        opts.out = argv[++i] || "";
        break;
      case "--print":
        opts.print = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--enable-done":
        opts.enableDone = true;
        break;
      case "--no-overlays":
        opts.overlays = false;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--set": {
        const kv = argv[++i] || "";
        const eq = kv.indexOf("=");
        if (eq < 1) throw new Error(`--set expects moment=Status, got "${kv}"`);
        const moment = kv.slice(0, eq).trim();
        const value = kv.slice(eq + 1).trim();
        if (!tw.MOMENTS.includes(moment))
          throw new Error(
            `--set: "${moment}" is not a moment. Moments are a closed set: ${tw.MOMENTS.join(", ")}`,
          );
        opts.overrides[moment] = value === "~" || value === "" ? null : value;
        break;
      }
      default:
        throw new Error(`unknown argument "${a}"`);
    }
  }
  return opts;
}

function detectTracker(repoRoot) {
  // Mirrors shared/resources/resolve-platform.sh: explicit config, then env.
  try {
    const cfg = fs.readFileSync(
      path.join(repoRoot, "skills-config.yaml"),
      "utf-8",
    );
    const m = cfg.match(/^tracker:\s*(\S+)\s*$/m);
    if (m && m[1] !== "auto") return m[1];
  } catch (_) {}
  return process.env.JIRA_URL ? "jira" : "github";
}

const HELP = `scaffold-tracker-workflow — read a live board, write the ladder that describes it

  node scaffold-tracker-workflow.js [options]

  --tracker jira|github  override platform detection
  --project KEY|NUMBER   Jira project key, or GitHub Project (v2) number
  --board ID             Jira board id (defaults to $JIRA_BOARD_ID)
  --out PATH             where to write (default: <repo root>/tracker-workflow.yaml)
  --print                write nothing; print the YAML to stdout
  --force                overwrite an existing file
  --json                 machine-readable summary
  --enable-done          map \`done\` even when the board has a merge queue
  --no-overlays          skip per-issue-type overlays (Jira only)
  --set moment=Status    override an inferred moment; \`~\` disables it. Repeatable.
  -h, --help             this text
`;

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`✖ ${e.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }

  lib.loadDotEnv();
  const repoRoot = lib.getRepoRoot() || process.cwd();
  const tracker = opts.tracker || detectTracker(repoRoot);

  let probe;
  try {
    if (tracker === "jira") {
      const auth = lib.getAuth();
      if (!auth.ok) {
        process.stderr.write(
          `✖ Jira credentials missing: ${auth.missing.join(", ")}\n` +
            `  Set them in .env at the repo root. Nothing was written.\n`,
        );
        return 3;
      }
      probe = await probeJira({
        http: lib.makeHttp({ cwd: repoRoot }),
        baseUrl: auth.baseUrl,
        email: auth.email,
        token: auth.token,
        project: opts.project || auth.project,
        boardId: opts.board || auth.boardId,
      });
      probe.label = `Jira project ${opts.project || auth.project}${
        probe.boardId ? ` (board ${probe.boardId})` : ""
      }`;
    } else if (tracker === "github") {
      probe = await probeGithub({ projectNumber: opts.project });
    } else {
      process.stderr.write(
        `✖ unknown tracker "${tracker}" — expected jira or github\n`,
      );
      return 2;
    }
  } catch (e) {
    process.stderr.write(
      `✖ could not read the board: ${e.message}\n  Nothing was written.\n`,
    );
    return 3;
  }

  // ---- build -------------------------------------------------------------
  const seenOnce = new Set();
  const dropped = [];
  for (const col of probe.columns) {
    for (const s of col.statuses || []) {
      const k = normaliseName(s);
      if (seenOnce.has(k)) dropped.push({ name: s, column: col.name });
      else seenOnce.add(k);
    }
  }

  const { ladderColumns, sideStates } = partitionColumns(probe.columns);
  const ladder = buildLadderFromColumns(ladderColumns);
  if (!ladder.length) {
    process.stderr.write(
      "✖ the board reported no columns with statuses — nothing to scaffold\n",
    );
    return 3;
  }

  const inferred = inferMoments(ladder, {
    enableDone: opts.enableDone,
    overrides: opts.overrides,
    sideStates,
  });
  const inversions = checkMomentOrder(ladder, inferred.moments);

  const overlays =
    opts.overlays && tracker === "jira"
      ? buildOverlays(ladder, probe.statusesByIssueType, inferred.moments)
      : {};

  const yaml = emitYaml({
    tracker,
    boardLabel: probe.label,
    generatedFrom: probe.source,
    ladder,
    moments: inferred.moments,
    notes: inferred.notes,
    ambiguous: inferred.ambiguous,
    doneSuppressed: inferred.doneSuppressed,
    missing: inferred.missing,
    overlays,
    dropped,
    sideStates,
    inversions,
  });

  // ---- validate ----------------------------------------------------------
  //
  // Validate what we are about to write, through the same engine the pipelines
  // read it with. A scaffolder that emits a file its own consumer rejects is
  // worse than no scaffolder: the failure surfaces later, somewhere else.
  const findings = validateEmitted(yaml, repoRoot);
  const errors = findings.filter((f) => f.level === "error");

  // ---- emit --------------------------------------------------------------
  const outPath = opts.out
    ? path.resolve(repoRoot, opts.out)
    : path.join(repoRoot, tw.DEFAULT_WORKFLOW_PATH || "tracker-workflow.yaml");

  const summary = {
    tracker,
    board: probe.label,
    source: probe.source,
    rungs: ladder.length,
    moments: inferred.moments,
    unmapped: inferred.missing,
    ambiguous: inferred.ambiguous,
    doneSuppressed: inferred.doneSuppressed,
    sideStates,
    inversions,
    overlays: Object.keys(overlays),
    droppedDuplicates: dropped,
    findings,
    out: opts.print ? null : outPath,
  };

  if (errors.length) {
    if (opts.json)
      process.stdout.write(
        JSON.stringify({ ok: false, ...summary }, null, 2) + "\n",
      );
    else {
      process.stderr.write("✖ the scaffolded file does not validate:\n");
      for (const e of errors) process.stderr.write(`    ${e.message}\n`);
      process.stderr.write(
        "  Nothing was written. This is a bug — please report the board shape.\n",
      );
    }
    return 1;
  }

  if (opts.print) {
    if (opts.json)
      process.stdout.write(
        JSON.stringify({ ok: true, ...summary, yaml }, null, 2) + "\n",
      );
    else process.stdout.write(yaml);
    return 0;
  }

  if (fs.existsSync(outPath) && !opts.force) {
    const msg =
      `✖ ${path.relative(repoRoot, outPath)} already exists.\n` +
      `  Re-run with --print to see what would change, or --force to overwrite.\n`;
    if (opts.json)
      process.stdout.write(
        JSON.stringify({ ok: false, reason: "exists", ...summary }, null, 2) +
          "\n",
      );
    else process.stderr.write(msg);
    return 1;
  }

  fs.writeFileSync(outPath, yaml);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ ok: true, ...summary }, null, 2) + "\n",
    );
    return 0;
  }

  const rel = path.relative(repoRoot, outPath);
  const out = [];
  out.push(`✅ Wrote ${rel} — ${ladder.length} rungs from ${probe.source}`);
  for (const rule of MOMENT_RULES) {
    const m = rule.moment;
    if (m in inferred.moments)
      out.push(`   ${m.padEnd(16)} → ${inferred.moments[m]}`);
  }
  if (inferred.doneSuppressed)
    out.push(
      `   ${"done".padEnd(16)} → not mapped (merge queue present — a human closes the card)`,
    );
  for (const m of inferred.missing)
    if (!(inferred.doneSuppressed && m === "done"))
      out.push(`   ${m.padEnd(16)} → no matching column`);
  for (const s of sideStates)
    out.push(`   ${s.moment.padEnd(16)} → ${s.name} (off-ladder side-state)`);
  if (inferred.ambiguous.length) {
    out.push("");
    out.push("⚠️  Ambiguous columns — verify these:");
    for (const a of inferred.ambiguous)
      out.push(
        `   "${a.rung}" matched ${a.moments.join(", ")} → took ${a.moments[0]}`,
      );
  }
  if (inversions.length) {
    out.push("");
    out.push(
      "⚠️  Moments are OUT OF ORDER on this ladder — the file explains why:",
    );
    for (const inv of inversions)
      out.push(
        `   ${inv.later.moment} ("${inv.later.target}", rung ${inv.later.rank}) sits below ` +
          `${inv.earlier.moment} ("${inv.earlier.target}", rung ${inv.earlier.rank})`,
      );
    out.push(
      "   As written the later move is backward and the guard refuses it.",
    );
  }
  if (Object.keys(overlays).length)
    out.push(`\n   overlays: ${Object.keys(overlays).join(", ")}`);
  for (const f of findings.filter((x) => x.level !== "error"))
    out.push(`   ${f.level}: ${f.message}`);
  out.push("");
  out.push(
    "   Read the file before committing — the ladder is observed, the mapping is inferred.",
  );
  process.stdout.write(out.join("\n") + "\n");
  return 0;
}

/**
 * Parse and validate the emitted text through the real engine.
 *
 * `loadWorkflow` reads from disk and caches, so a temp file is the honest way to
 * exercise the identical path a consumer will take rather than an approximation.
 */
function validateEmitted(yaml, repoRoot) {
  const os = require("os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stw-validate-"));
  const file = path.join(dir, "tracker-workflow.yaml");
  try {
    fs.writeFileSync(file, yaml);
    tw.clearWorkflowCache();
    const wf = tw.loadWorkflow({ repoRoot: dir });
    return tw.validateWorkflow(wf) || [];
  } catch (e) {
    return [
      {
        level: "error",
        message: `could not parse the emitted file: ${e.message}`,
      },
    ];
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
    tw.clearWorkflowCache();
  }
}

module.exports = {
  MOMENT_RULES,
  SIDE_STATE_MOMENTS,
  MOMENT_SEQUENCE,
  normaliseName,
  matchRungs,
  partitionColumns,
  checkMomentOrder,
  inferMoments,
  buildLadderFromColumns,
  buildOverlays,
  emitYaml,
  parseArgs,
  detectTracker,
  probeJira,
  probeGithub,
  main,
};

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write(`✖ ${(e && e.stack) || e}\n`);
      process.exit(1);
    });
}
