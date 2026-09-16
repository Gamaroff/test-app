"use strict";
/**
 * explain-simply asset + frontmatter tests.
 * Run: node --test skills/explain-simply/tests/
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const SKILL_DIR = path.join(__dirname, "..");
const TEMPLATE = fs.readFileSync(
  path.join(SKILL_DIR, "assets", "storyboard-template.html"),
  "utf8",
);
const IDIOMS = fs.readFileSync(
  path.join(SKILL_DIR, "references", "svg-idioms.md"),
  "utf8",
);
const SKILL_MD = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");

// ===========================================================================
// CSP: a published artifact cannot reach any external host
// ===========================================================================
test("template contains no external URL", () => {
  const hits = TEMPLATE.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  assert.deepEqual(hits, [], `external references in template: ${hits}`);
});

test("svg idioms contain no external URL", () => {
  // Catches an xmlns="http://www.w3.org/2000/svg" creeping back in — harmless
  // in isolation, but it trains the pattern that URLs in these files are fine.
  const hits = IDIOMS.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  assert.deepEqual(hits, [], `external references in svg-idioms: ${hits}`);
});

// ===========================================================================
// Theming: all three blocks, or the page borrows the host's theme
// ===========================================================================
test("template defines the full light palette on bare :root", () => {
  assert.match(TEMPLATE, /:root\s*\{[^}]*--es-bg:/);
  for (const token of [
    "--es-bg",
    "--es-panel",
    "--es-ink",
    "--es-fill",
    "--es-accent",
    "--es-accent-2",
    "--es-muted",
  ]) {
    assert.ok(TEMPLATE.includes(`${token}:`), `missing token ${token}`);
  }
});

test("template redefines tokens under the prefers-color-scheme guard", () => {
  assert.match(
    TEMPLATE,
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/,
  );
});

test("template redefines tokens under [data-theme='dark']", () => {
  assert.match(TEMPLATE, /:root\[data-theme="dark"\]\s*\{/);
});

test("template palette stays a marked placeholder", () => {
  // The template must not ship a finished-looking palette: a palette nobody
  // chooses is the generated-page tell that artifact-design warns about.
  assert.match(
    TEMPLATE,
    /PLACEHOLDER/,
    "template palette lost its PLACEHOLDER marker",
  );
  const skillMd = SKILL_MD.toLowerCase();
  assert.ok(
    skillMd.includes("placeholder"),
    "SKILL.md must tell the author to replace the placeholder palette",
  );
});

test("template paints body with a token background", () => {
  assert.match(TEMPLATE, /body\s*\{[^}]*background:\s*var\(--es-bg\)/);
});

// ===========================================================================
// The detail layer
// ===========================================================================
test("template ships a details/summary block on the sample panel", () => {
  assert.match(TEMPLATE, /<details class="es-detail">/);
  assert.match(TEMPLATE, /<summary>[^<]+<\/summary>/);
});

test("template ships the floating toggle, hidden until script runs", () => {
  // hidden by default so a no-JS reader never sees a dead control.
  assert.match(TEMPLATE, /<button class="es-toggle"[^>]*\shidden\s*>/);
});

test("every localStorage access is guarded", () => {
  // Storage throws (not just returns null) in thumbnail capture and when site
  // data is blocked; an unguarded read takes the whole page down.
  const calls = TEMPLATE.match(/localStorage\.\w+\(/g) || [];
  assert.ok(calls.length > 0, "expected the template to use localStorage");
  for (const m of TEMPLATE.matchAll(/localStorage\.\w+\([^)]*\)/g)) {
    const before = TEMPLATE.slice(Math.max(0, m.index - 120), m.index);
    assert.match(
      before,
      /try\s*\{/,
      `unguarded localStorage access near: ${m[0]}`,
    );
  }
});

test("script is inline — no src, no external load", () => {
  const tags = TEMPLATE.match(/<script[^>]*>/g) || [];
  assert.equal(tags.length, 1, "expected exactly one inline script");
  assert.ok(!/\ssrc\s*=/.test(tags[0]), "script must not have a src");
});

test("SKILL.md documents the deep-depth open attribute", () => {
  // The template cannot enforce this; the skill body is where it is specified.
  assert.match(SKILL_MD, /es-detail/);
  assert.match(SKILL_MD, /\bopen\b/);
});

// ===========================================================================
// Publisher contract: the file is wrapped at publish time
// ===========================================================================
test("template omits the wrapper tags the publisher supplies", () => {
  // <head[\s>] rather than "<head" so <header> stays legal.
  for (const tag of ["<!doctype", "<html", "<head", "<body"]) {
    const re = new RegExp(tag + "[\\s>]", "i");
    assert.ok(!re.test(TEMPLATE), `template must not contain ${tag}`);
  }
});

test("template opens with a title tag", () => {
  assert.match(TEMPLATE.trimStart(), /^<title>.*<\/title>/);
});

// ===========================================================================
// SKILL.md
// ===========================================================================
test("SKILL.md frontmatter names the skill", () => {
  assert.match(SKILL_MD, /^---\n/);
  const fm = SKILL_MD.split("---")[1];
  assert.match(fm, /\bname:\s*explain-simply\b/);
  assert.match(fm, /\bdescription:/);
});

test("SKILL.md points at every bundled resource", () => {
  for (const ref of [
    "references/svg-idioms.md",
    "references/writing-rules.md",
    "assets/storyboard-template.html",
  ]) {
    assert.ok(SKILL_MD.includes(ref), `SKILL.md never references ${ref}`);
    assert.ok(
      fs.existsSync(path.join(SKILL_DIR, ref)),
      `referenced file missing: ${ref}`,
    );
  }
});
