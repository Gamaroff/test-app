#!/usr/bin/env python3


"""
Quick validation script for skills - minimal version
"""

import sys
import os
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import skill_frontmatter

# ANSI colour helpers — disabled when not a TTY (e.g. CI pipe)
_USE_COLOR = sys.stdout.isatty()

def _c(code, text):
    return f"\033[{code}m{text}\033[0m" if _USE_COLOR else text

def green(t):   return _c("32", t)
def red(t):     return _c("31", t)
def yellow(t):  return _c("33", t)
def bold(t):    return _c("1",  t)
def dim(t):     return _c("2",  t)

def find_repo_root(skill_path):
    """Walk up from skill_path to find the repo root (contains shared/resources/)."""
    path = Path(skill_path).resolve()
    while path != path.parent:
        if (path / 'shared' / 'resources').exists():
            return path
        path = path.parent
    return None


def collect_shared_refs(content):
    """Return list of filenames referenced via shared/resources/<filename>.

    Filters out empty matches (e.g. when the regex captures only a trailing
    sentence punctuation like 'shared/resources/.' which strips to '').
    """
    # `(?<![\w-]/)` — never match inside an absolute URL such as
    # `https://…/blob/develop/shared/resources/x.md`, which the bundler now
    # writes into bundled copies for targets a skill does not ship. Without the
    # guard the packager's walk over references/ rediscovered every such URL as
    # a reference and vendored the file it deliberately did not bundle.
    refs = [
        f.rstrip('.,;:')
        for f in re.findall(r'(?<![\w-]/)shared/resources/([^\s`\'")\]*]+)', content)
    ]
    return [r for r in refs if r]


def validate_skill(skill_path):
    """Basic validation of a skill"""
    skill_path = Path(skill_path)
    
    # Check SKILL.md exists
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        return False, "SKILL.md not found"
    
    # Read and validate frontmatter
    content = skill_md.read_text()
    if not content.startswith('---'):
        return False, "No YAML frontmatter found"

    frontmatter = skill_frontmatter.split_frontmatter(content)
    if frontmatter is None:
        return False, "Invalid frontmatter format"

    if 'managed-by:' in frontmatter:
        print(yellow("  ⚠  Warning: 'managed-by' field found in SKILL.md — injected by packager, do not author manually"))

    # An unquoted description containing ': ' is invalid YAML. Caught here rather
    # than left to the parser below purely for the more actionable message.
    raw_desc = re.search(r'^description:[ \t]*(.*)$', frontmatter, re.MULTILINE)
    if raw_desc:
        raw_value = raw_desc.group(1).strip()
        if (raw_value
                and raw_value not in skill_frontmatter.BLOCK_SCALARS
                and not raw_value.startswith(('"', "'"))
                and ': ' in raw_value):
            return False, (
                "Description is unquoted but contains ': ' — GitHub's YAML parser "
                "will reject this. Wrap in single quotes: description: '...'"
            )

    # Parse for real. Regex extraction used to silently truncate a single-quoted
    # description at its first unescaped apostrophe and report success, shipping
    # a skill whose description no YAML parser could read.
    fm, parse_error = skill_frontmatter.parse(content)
    if parse_error:
        return False, parse_error

    # Check required fields
    if 'name' not in fm:
        return False, "Missing 'name' in frontmatter"
    if 'description' not in fm:
        return False, "Missing 'description' in frontmatter"

    # Validate name
    name = str(fm['name']).strip()
    # Check naming convention (hyphen-case: lowercase with hyphens)
    if not re.match(r'^[a-z0-9-]+$', name):
        return False, f"Name '{name}' should be hyphen-case (lowercase letters, digits, and hyphens only)"
    if name.startswith('-') or name.endswith('-') or '--' in name:
        return False, f"Name '{name}' cannot start/end with hyphen or contain consecutive hyphens"

    # Validate description
    warnings = []
    description = ' '.join(str(fm['description']).split())
    if not description:
        return False, "Description is empty"
    # Check for angle brackets
    if '<' in description or '>' in description:
        return False, "Description cannot contain angle brackets (< or >)"
    # Warn if description is too short or too long (target: ~100 words)
    word_count = len(description.split())
    if word_count < 10:
        warnings.append(f"Description is very short ({word_count} words); aim for ~100 words for reliable auto-activation")
    elif word_count > 150:
        warnings.append(f"Description is long ({word_count} words); descriptions over 150 words consume unnecessary context — aim for ~100")

    # Check shared/resources/ references exist at repo level
    repo_root = find_repo_root(skill_path)
    all_md = list(skill_path.rglob('*.md'))
    for md_file in all_md:
        if not md_file.is_file():
            continue
        for filename in collect_shared_refs(md_file.read_text()):
            if repo_root is None:
                return False, f"shared/resources/{filename} referenced but repo root not found"
            src = repo_root / 'shared' / 'resources' / filename
            if not src.exists():
                return False, f"shared/resources/{filename} referenced but file does not exist"

    for w in warnings:
        print(yellow(f"  ⚠  {w}"))

    return True, None

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)

    if not skill_frontmatter.HAVE_YAML:
        print(yellow("  ⚠  PyYAML not installed — frontmatter is NOT strictly validated. "
                     "Install it (pip install pyyaml) for the full check."), file=sys.stderr)

    skill_name = Path(sys.argv[1]).name
    valid, message = validate_skill(sys.argv[1])
    if valid:
        print(green("  ✓ ") + bold(skill_name))
    else:
        print(red("  ✗ ") + bold(skill_name) + dim(" — ") + red(message))
    sys.exit(0 if valid else 1)