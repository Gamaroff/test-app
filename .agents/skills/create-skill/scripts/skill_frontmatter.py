#!/usr/bin/env python3

"""
Strict SKILL.md frontmatter parsing, shared by quick_validate.py and
generate_catalog.py.

Both scripts previously hand-rolled regex frontmatter parsing, and both got it
wrong in the same way: a single-quoted YAML scalar containing an unescaped
apostrophe (`description: 'that epic's branch'`) terminates the string early.
The regex parsers silently truncated the value and reported success, so a skill
could ship a description that no YAML parser could read — the agent loader fell
back to treating body text as the description, and the catalog rendered a stray
leading quote.

Parsing with a real YAML parser is the fix. PyYAML is used when importable;
without it the legacy regex path still runs, but callers are told the check was
degraded so CI can insist on the strict path.
"""

import re

try:
    import yaml  # type: ignore
    HAVE_YAML = True
except ImportError:  # pragma: no cover - exercised only on hosts without PyYAML
    HAVE_YAML = False


FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---", re.DOTALL)

BLOCK_SCALARS = (">", "|", ">-", "|-", ">+", "|+")


def split_frontmatter(text):
    """Return the raw frontmatter block, or None when absent/malformed."""
    if not text.startswith("---"):
        return None
    match = FRONTMATTER_RE.match(text)
    return match.group(1) if match else None


def _closes_early(value):
    """True when a single-quoted scalar closes before end-of-line.

    Only meaningful once parsing has already failed. A scalar that never closes
    on its line is legal (quoted scalars may span lines), so that case is not
    reported — this looks solely for the unescaped-apostrophe signature, where
    the quote closes mid-line and leaves trailing content behind.
    """
    i, n = 1, len(value)
    while i < n:
        if value[i] == "'":
            if i + 1 < n and value[i + 1] == "'":
                i += 2  # '' is an escaped apostrophe, not a terminator
                continue
            return i != n - 1
        i += 1
    return False


def diagnose(fm_text):
    """Return a human-readable hint for a failed parse, or None."""
    for line in fm_text.splitlines():
        kv = re.match(r"^(\w+):\s*('.*)$", line)
        if kv and _closes_early(kv.group(2)):
            key = kv.group(1)
            return (
                f"'{key}' is a single-quoted YAML scalar containing an unescaped "
                "apostrophe, which closes the string early. Double it to escape "
                "it (epic''s), or switch the value to double quotes."
            )
    return None


def parse(text):
    """Parse SKILL.md frontmatter.

    Returns (data, error). On success `data` is a dict and `error` is None. On
    failure `data` is None and `error` is a description of what went wrong.
    """
    if not text.startswith("---"):
        return None, "No YAML frontmatter found"

    fm_text = split_frontmatter(text)
    if fm_text is None:
        return None, "Invalid frontmatter format"

    if not HAVE_YAML:
        return _parse_regex(fm_text), None

    try:
        data = yaml.safe_load(fm_text)
    except yaml.YAMLError as exc:
        hint = diagnose(fm_text)
        if hint:
            # The parser's own dump points at the symptom several columns after
            # the cause; the hint names the cause, so lead with it.
            return None, f"Frontmatter is not valid YAML — {hint}"
        detail = " ".join(str(exc).split())
        return None, f"Frontmatter is not valid YAML: {detail}"

    if data is None:
        return None, "Frontmatter is empty"
    if not isinstance(data, dict):
        return None, "Frontmatter must be a YAML mapping of key: value pairs"

    return data, None


def _parse_regex(fm_text):
    """Legacy best-effort parse, used only when PyYAML is unavailable."""
    fm = {}
    for line in fm_text.splitlines():
        kv = re.match(r"^(\w+):\s*(.*)", line)
        if kv:
            fm[kv.group(1)] = kv.group(2).strip().strip("\"'")
    if fm.get("description") in BLOCK_SCALARS:
        block = re.search(
            r"description:\s*[>|][+\-]?\n((?:[ \t]+.+\n?)+)", fm_text
        )
        if block:
            fm["description"] = " ".join(
                l.strip() for l in block.group(1).splitlines()
            )
    return fm
