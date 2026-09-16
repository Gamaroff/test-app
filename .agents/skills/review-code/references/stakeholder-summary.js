// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/stakeholder-summary.js. Regenerate via `npm run bundle`.
"use strict";
/**
 * stakeholder-summary.js — the plain-language lead every tracker comment opens with.
 *
 * Standard, writing rules and worked examples: stakeholder-summary.md.
 *
 * WHY THIS IS A MODULE AND NOT A CONVENTION. The repository already has evidence
 * that a documented-but-unenforced comment convention drifts: the comment contract
 * says every GitHub site should route through tracker-comment.js, and several still
 * post a bare `gh issue comment`, because prose has no chokepoint. A lead that is
 * merely *asked for* ships missing the first time someone is in a hurry, and nothing
 * notices — a comment with no lead posts exactly as successfully as one with a lead.
 * Rendering it here, keyed by the --stage the engine already validates, is what makes
 * the rule mechanical.
 *
 * PURE BY CONTRACT. No I/O, no `process.exit`, no require of anything that performs
 * either. The caller owns the exit-2 decision and its error message; a module that
 * exits on the caller's behalf cannot be tested without spawning a process.
 */

/**
 * A verdict token is the single most-read fact in a testing comment and the single
 * most opaque. PASS/CONCERNS/FAIL/WAIVED are internal vocabulary — nothing about the
 * word "CONCERNS" tells an outside reader whether it is bad news, and guessing wrong
 * in either direction is worse than the raw token would have been. Map to a sentence;
 * never pass the token through.
 */
const GATE_MEANING = Object.freeze({
  PASS: "The checks found no problems.",
  CONCERNS:
    "The checks found some problems worth knowing about, but none that stop the work.",
  FAIL: "The checks found problems serious enough that the work is not finished.",
  WAIVED:
    "Some checks were deliberately skipped, and the reason is recorded below.",
});

/**
 * Resolve a verdict slot to its sentence. An absent, unknown or malformed verdict
 * falls back to the no-problems reading being ABSENT rather than being asserted:
 * the fallback states that testing happened and points at the body, which is true
 * regardless of the verdict. Defaulting to "no problems found" would turn a missing
 * slot into an unearned reassurance, which is the one direction this must not fail in.
 */
function verdictSentence(verdict) {
  if (typeof verdict !== "string") return "The results are recorded below.";
  const key = verdict.trim().toUpperCase();
  return GATE_MEANING[key] || "The results are recorded below.";
}

/**
 * Every template must return a complete, grammatical paragraph when called with `{}`.
 * That is the path that ships first — this task supplies no slots at any call site —
 * and a template that only reads well when fully populated would go live in its worst
 * form. Slots are therefore folded into the sentence, never appended to it: a lead
 * that degrades to a stub plus a dangling clause is worse than one that degrades to a
 * shorter true sentence.
 */
const LEAD_TEMPLATES = Object.freeze({
  "work-started": (s) =>
    `A developer has started work on this item${s.title ? ` — ${s.title}` : ""}. ` +
    `Nothing has changed yet in the live product; this is the point at which the work ` +
    `begins. The next update here will say what was built.`,

  review: (s) =>
    `Before any code is written, this item's written description is checked to make sure ` +
    `it is clear, complete and possible to build${s.outcome ? ` — the result was ${s.outcome}` : ""}. ` +
    `${
      s.blocking
        ? "Some things need answering before work can start; they are listed below. "
        : "Nothing is blocking the work from starting. "
    }` +
    `The detail below is for the team doing the building.`,

  "review-story": (s) =>
    `Before any code is written, the description of this piece of work was checked to make ` +
    `sure it is clear, complete and possible to build${s.outcome ? ` — the result was ${s.outcome}` : ""}. ` +
    `${
      s.blocking
        ? "Some things need answering before work can start; they are listed below. "
        : "Nothing is blocking the work from starting. "
    }` +
    `The detail below is for the team doing the building.`,

  "review-task": (s) =>
    `Before any code is written, the description of this piece of technical work was checked ` +
    `to make sure it is clear, complete and possible to build${s.outcome ? ` — the result was ${s.outcome}` : ""}. ` +
    `${
      s.blocking
        ? "Some things need answering before work can start; they are listed below. "
        : "Nothing is blocking the work from starting. "
    }` +
    `The detail below is for the team doing the building.`,

  "review-bug": (s) =>
    `This reported problem was checked to see whether it can be fixed as written — whether it ` +
    `is clear enough to act on, and whether it is genuinely still a problem` +
    `${s.outcome ? `, and the result was ${s.outcome}` : ""}. ` +
    `${
      s.blocking
        ? "Some things need answering before a fix can start; they are listed below. "
        : "Nothing is blocking a fix from starting. "
    }` +
    `The detail below is for the team doing the fixing.`,

  "develop-complete": (s) =>
    `The building is finished. Everything this item asked for has been written` +
    `${s.count ? ` (${s.count} separate pieces of work)` : ""}, and it now goes for checking. ` +
    `It is not live yet, and it may still change if the checks find problems.`,

  "in-review": (s) =>
    `The finished work has been submitted for review${s.pr ? ` (${s.pr})` : ""}. ` +
    `Other people now read it and test it before it can be added to the product. ` +
    `Expect either an approval or a list of changes.`,

  "qa-gate": (s) =>
    `The finished work has been through testing, and the results are in. ` +
    `${verdictSentence(s.verdict)} ` +
    `${
      s.blocking_count
        ? `${s.blocking_count} of them must be dealt with before this item can be finished. `
        : ""
    }` +
    `The detail below records what was tested and what was found.`,

  "qa-cycle": (s) =>
    `The work has been through another round of testing${s.cycle ? ` (round ${s.cycle})` : ""}. ` +
    `${verdictSentence(s.verdict)} ` +
    `If anything needs fixing it will be fixed and tested again before this item is finished.`,

  "qa-fix": (s) =>
    `The problems found in testing have been fixed${s.cycle ? ` (round ${s.cycle})` : ""}. ` +
    `The work now goes back for testing again, to confirm the fixes hold and that nothing ` +
    `else broke. This item is not finished until that testing passes.`,

  // Posted by the PreCompact hook, from a shell with no agent behind it — the
  // one comment in the pipeline that a non-technical reader is most likely to
  // see arrive with nothing else around it. Slot-free on purpose: the hook has
  // only what the lock file holds, and a step number is jargon to this reader.
  "pipeline-paused": () =>
    `Work on this item has paused automatically, because the automated assistant was ` +
    `about to run out of working memory. Nothing has been lost: progress so far has been ` +
    `saved, and the work will carry on from that point once it is restarted. ` +
    `No action is needed from anyone reading this.`,

  done: (s) =>
    `This work is finished and has been accepted. Everything it set out to do was checked and ` +
    `confirmed working, and the change is now part of the product${s.pr ? ` (${s.pr})` : ""}. ` +
    `No further action is needed on this item.`,

  // ── Pull-request stages ──────────────────────────────────────────────────
  // These three open comments on a pull REQUEST, not on a tracker issue, and
  // are listed in PR_COMMENT_STAGES below. They are never legal `--stage`
  // values for tracker-comment.js; see the note on that constant for why that
  // separation is enforced rather than merely intended.

  "pr-summary": (s) =>
    `Some of the review notes below could not be attached to the exact lines of code they ` +
    `refer to${s.degraded ? ` (${s.degraded} of them)` : ""}, so they are collected here ` +
    `instead. Nothing was lost — each one names the file and line it is about.`,

  "board-warning": (s) =>
    `This note is about the tracking board only, not about the work itself. ` +
    `${s.what || "The card could not be moved to its new column automatically"}, so someone ` +
    `will need to move it by hand. The change described in this pull request is unaffected.`,

  "dod-gaps": (s) =>
    `This work is not finished yet. Some of the checks it has to pass are still ` +
    `outstanding${s.count ? ` (${s.count} of them)` : ""}, and they are listed below. ` +
    `It will come back here once they have been dealt with.`,
});

/**
 * Cycle-scoped stages carry a round number (`qa-cycle-3`, `qa-fix-2`) so that each
 * round posts its own comment instead of being suppressed by the previous round's
 * marker. The suffix is an identity detail, not a different moment, so it is stripped
 * before catalogue lookup rather than duplicated across numbered entries.
 *
 * Kept deliberately consistent with the same strip in
 * evals/shared/tests/transition-protocol-parity.test.mjs.
 */
/**
 * Slot values arrive from `--slot k=v` as STRINGS, always — the CLI has no type
 * information to give them. Templates then consume them by truthiness, so the
 * string "false" is truthy and `--slot blocking=false` rendered "Some things
 * need answering before work can start": the opposite of what the caller said,
 * in the one paragraph aimed at a reader who cannot check the body underneath
 * it. `blocking_count=0` and `count=0` failed the same way.
 *
 * Coerce at the boundary — but PER SLOT TYPE, not with one list applied to
 * everything. The first version of this fix ran every slot through the falsey-
 * string list, so a text slot legitimately valued "No", "None" or "0" was
 * silently dropped: `--slot title=None` rendered as though no title were given.
 * Swallowing a real value is a worse failure than the one being fixed, because
 * it is silent in the other direction and nothing in the output hints at it.
 *
 * "false"/"no"/"none" are only meaningful as negations for a BOOLEAN slot, and
 * "0" only for a NUMERIC one. A text slot is passed through untouched: the
 * caller's string is the caller's business.
 */
const BOOLEAN_SLOTS = Object.freeze(["blocking"]);
const NUMERIC_SLOTS = Object.freeze([
  "count",
  "blocking_count",
  "cycle",
  "degraded",
]);
/**
 * Text slots are listed too, even though they are the default branch, so that
 * "which slots exist" is answerable from one place. A new template that reads a
 * slot named nowhere here gets TEXT semantics silently — which for a BOOLEAN
 * slot re-opens the exact defect this coercion was written to close, since
 * `--slot newflag=false` is a truthy string. The test
 * `every slot a template reads is classified` scans the template sources and
 * fails on an unclassified name, so the list cannot quietly fall behind.
 */
const TEXT_SLOTS = Object.freeze(["title", "pr", "verdict", "outcome", "what"]);
const BOOLEAN_FALSE_WORDS = Object.freeze([
  "",
  "0",
  "false",
  "no",
  "none",
  "null",
  "undefined",
  "off",
]);

function normaliseSlots(slots) {
  if (!slots || typeof slots !== "object") return {};
  const out = {};
  // OWN properties only. An inherited slot is never something the caller meant
  // to pass, and reading one lets a caller-constructed prototype reach the lead.
  for (const key of Object.keys(slots)) {
    const raw = slots[key];
    if (raw === null || raw === undefined) continue;
    // Scalars only. A programmatic caller passing an object or array otherwise
    // gets it interpolated verbatim — "[object Object]" in the one paragraph
    // written for a non-technical reader — and `[]` is truthy, so an empty
    // array fired a boolean slot's affirmative branch.
    if (!["string", "number", "boolean"].includes(typeof raw)) continue;
    const value = typeof raw === "string" ? raw.trim() : raw;

    if (BOOLEAN_SLOTS.includes(key)) {
      if (value === false) continue;
      if (
        typeof value === "string" &&
        BOOLEAN_FALSE_WORDS.includes(value.toLowerCase())
      ) {
        continue; // absent, not false — the template's own `? :` then reads right
      }
      out[key] = value;
      continue;
    }

    if (NUMERIC_SLOTS.includes(key)) {
      const n = typeof value === "number" ? value : Number(value);
      // A non-numeric string in a numeric slot is a caller error, not a zero.
      // Dropping it renders the shorter true sentence rather than "(NaN pieces)".
      // The COERCED value is what gets stored: validating with Number() and then
      // storing the raw string threw the coercion away, so "0x10" and "1e3"
      // reached the sentence in source form. Counts and round numbers are
      // positive whole numbers; anything else is a caller error, not a fact.
      if (!Number.isInteger(n) || n <= 0) continue;
      out[key] = n;
      continue;
    }

    // Text slot: pass through. "" is still dropped, because an empty string
    // fills a sentence gap with nothing and reads as a typo.
    if (typeof value === "string" && value === "") continue;
    out[key] = value;
  }
  return out;
}

const CYCLE_SUFFIX = /-\d+$/;

/**
 * The numeric suffix is legal ONLY for the cycle-scoped stages, matching
 * tracker-comment.js's isKnownStage. Stripping it from every stage made the two
 * disagree on the same input — hasTemplate("done-3") was true while
 * isKnownStage("done-3") is false — which is unreachable through the CLI today
 * only because the stage gate runs first. Two enumerations of the same rule
 * drifting apart is the class this module's header argues against, so it is
 * closed rather than left resting on call order.
 */
// `pipeline-paused` is scoped the same way, by the step it paused at: a pipeline
// that pauses at Step 3, resumes, and pauses again at Step 6 has paused twice,
// and the second notice must not be suppressed by the first one's marker.
const CYCLE_SCOPED_LEAD_STAGES = Object.freeze([
  "qa-cycle",
  "qa-fix",
  "pipeline-paused",
]);

function stripCycleSuffix(stage) {
  if (!CYCLE_SUFFIX.test(stage)) return stage;
  const base = stage.replace(CYCLE_SUFFIX, "");
  return CYCLE_SCOPED_LEAD_STAGES.includes(base) ? base : stage;
}

const LEAD_STAGES = Object.freeze(Object.keys(LEAD_TEMPLATES));

/**
 * Which catalogue entries lead a comment on a pull REQUEST rather than on a
 * tracker issue. The audience of a lead is a property of the lead, so the
 * partition lives here with the templates rather than in either engine.
 *
 * WHY THIS IS A SECOND LIST AND NOT A LONGER FIRST ONE. tracker-comment.js
 * validates `--stage` against its own COMMENT_STAGES and exits 2 on anything
 * else. Adding these three there would make `tracker-comment.js --stage
 * pr-summary` a legal TRACKER-ISSUE comment — a paragraph about unanchored
 * review findings posted onto a board card, read by exactly the people it was
 * written to spare. The two lists name two audiences; that is a real
 * distinction, not a duplicated enumeration, and the tests below hold them
 * jointly exhaustive over the catalogue and mutually disjoint, so neither can
 * quietly drift from it.
 */
const PR_COMMENT_STAGES = Object.freeze([
  "pr-summary",
  "board-warning",
  "dod-gaps",
]);

/**
 * Render the lead for a stage.
 *
 * Returns `null` — never throws, never exits — for a stage with no template, including
 * an omitted or non-string one. The caller decides what an absent lead means; here it is
 * simply a fact about the catalogue.
 */
function renderLead(stage, slots = {}) {
  if (typeof stage !== "string" || stage === "") return null;
  const key = stripCycleSuffix(stage);
  // hasOwnProperty, not a bare bracket lookup: `LEAD_TEMPLATES["__proto__"]`
  // resolves up the prototype chain and is then CALLED, so renderLead threw for
  // `__proto__`/`valueOf` and returned a non-string for `constructor`/`toString`
  // — contradicting this function's own "returns null, never throws" contract,
  // which tracker-comment.js's exit-2 guard depends on. hasTemplate below always
  // guarded correctly; the two disagreed on the same input.
  if (!Object.prototype.hasOwnProperty.call(LEAD_TEMPLATES, key)) return null;
  const template = LEAD_TEMPLATES[key];
  return template(normaliseSlots(slots));
}

/** Whether the catalogue can render this stage. Same normalisation as renderLead. */
function hasTemplate(stage) {
  if (typeof stage !== "string" || stage === "") return false;
  return Object.prototype.hasOwnProperty.call(
    LEAD_TEMPLATES,
    stripCycleSuffix(stage),
  );
}

module.exports = {
  LEAD_TEMPLATES,
  BOOLEAN_SLOTS,
  NUMERIC_SLOTS,
  TEXT_SLOTS,
  LEAD_STAGES,
  PR_COMMENT_STAGES,
  GATE_MEANING,
  renderLead,
  hasTemplate,
};
