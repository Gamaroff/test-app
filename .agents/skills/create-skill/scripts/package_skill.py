#!/usr/bin/env python3


"""
Skill Packager - Creates a distributable zip file of a skill folder

Usage:
    python utils/package_skill.py <path/to/skill-folder> [output-directory]

Example:
    python utils/package_skill.py skills/public/my-skill
    python utils/package_skill.py skills/public/my-skill ./dist
"""

import re
import sys
import zipfile
from pathlib import Path
from quick_validate import validate_skill, find_repo_root, collect_shared_refs
# The rewrite pass is defined ONCE, in bundle_skill.py. This script used to
# re-declare its three regexes inline and would have needed a fourth copy for
# the link re-relativisation (task.108); importing is what keeps the zip and the
# in-tree bundle from drifting.
from bundle_skill import rewrite_text, rewrite_md_links, expected_bytes

MANAGED_BY = "agent-skills"
SOURCE_URL = "https://github.com/Gamaroff/agent-skills"


def inject_origin_metadata(content, managed_by, source_url):
    """Inject managed-by and source fields into SKILL.md frontmatter."""
    match = re.match(r'^---\n(.*?)(\n---)', content, re.DOTALL)
    if not match:
        return content
    injected = f"\nmanaged-by: {managed_by}\nsource: {source_url}"
    return content[:match.start(2)] + injected + content[match.start(2):]


def package_skill(skill_path, output_dir=None):
    """
    Package a skill folder into a zip file.

    Args:
        skill_path: Path to the skill folder
        output_dir: Optional output directory for the zip file (defaults to current directory)

    Returns:
        Path to the created zip file, or None if error
    """
    skill_path = Path(skill_path).resolve()

    # Validate skill folder exists
    if not skill_path.exists():
        print(f"❌ Error: Skill folder not found: {skill_path}")
        return None

    if not skill_path.is_dir():
        print(f"❌ Error: Path is not a directory: {skill_path}")
        return None

    # Validate SKILL.md exists
    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        print(f"❌ Error: SKILL.md not found in {skill_path}")
        return None

    # Run validation before packaging
    print("🔍 Validating skill...")
    valid, message = validate_skill(skill_path)
    if not valid:
        print(f"❌ Validation failed: {message}")
        print("   Please fix the validation errors before packaging.")
        return None
    print(f"✅ {message}\n")

    # Determine output location
    skill_name = skill_path.name
    if output_dir:
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)
    else:
        output_path = Path.cwd()

    zip_filename = output_path / f"{skill_name}.zip"

    # Locate repo root for shared resource resolution
    repo_root = find_repo_root(skill_path)

    # Collect all shared/resources refs across all skill .md and .js files
    shared_to_bundle = {}  # filename -> source Path
    for src_file in (
        list(skill_path.rglob('*.md'))
        + list(skill_path.rglob('*.js'))
        + list(skill_path.rglob('*.sh'))
    ):
        refs = collect_shared_refs(src_file.read_text())
        for filename in refs:
            if filename in shared_to_bundle:
                continue
            if repo_root:
                src = repo_root / 'shared' / 'resources' / filename
                if src.exists():
                    shared_to_bundle[filename] = src
                else:
                    print(f"⚠️  Warning: shared/resources/{filename} referenced but not found — skipping bundle")
            else:
                print(f"⚠️  Warning: cannot resolve repo root to bundle shared/resources/{filename}")

    # Create the zip file
    try:
        EXCLUDE_DIRS = {'__pycache__', '.git', 'node_modules', '.DS_Store'}
        EXCLUDE_SUFFIXES = {'.pyc', '.pyo', '.map'}
        refs_dir = skill_path / 'references'
        # The names this zip will ship under references/: what the skill's own
        # files reach (non-transitively), plus whatever is already on disk under
        # references/ — bundled copies and skill-native files alike. The link
        # pass decides "bundled sibling → relative, else upstream URL" against
        # this set. It matches the in-tree bundler's `needed ∪ reconcilable`
        # only when the tree was bundled first, which is the packager's real
        # precondition: package from a tree where `npm run bundle` is a no-op.
        bundled_names = set(shared_to_bundle)
        if refs_dir.is_dir():
            bundled_names |= {
                p.relative_to(refs_dir).as_posix()
                for p in refs_dir.rglob('*') if p.is_file()
            }

        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Walk through the skill directory; rewrite shared/resources/ paths in .md and .js files
            for file_path in skill_path.rglob('*'):
                if any(part in EXCLUDE_DIRS for part in file_path.parts):
                    continue
                if not file_path.is_file() or file_path.suffix in EXCLUDE_SUFFIXES:
                    continue
                arcname = file_path.relative_to(skill_path.parent)
                # An in-tree bundled copy is written ONCE, from its shared source,
                # in the loop below — writing it here too produced a duplicate
                # arcname whose second (raw, un-rewritten) copy won on extraction.
                if (
                    file_path.is_relative_to(refs_dir)
                    and file_path.relative_to(refs_dir).as_posix() in shared_to_bundle
                ):
                    continue
                if file_path.suffix == '.md':
                    content = file_path.read_text()
                    if file_path.name == 'SKILL.md':
                        content = inject_origin_metadata(content, MANAGED_BY, SOURCE_URL)
                    if shared_to_bundle:
                        content = rewrite_text(content, '.md')
                    if repo_root:
                        # A skill's own `../../docs/…` link is valid in this repo
                        # and a 404 in the zip, which ships nothing outside the
                        # skill directory. Same rule as the bundled copies: inside
                        # the skill → relative, anything else → upstream URL.
                        rel_dir = file_path.parent.relative_to(repo_root).as_posix()
                        content = rewrite_md_links(
                            content, rel_dir, rel_dir,
                            skill_path.relative_to(repo_root).as_posix(), bundled_names,
                        )
                    zipf.writestr(str(arcname), content)
                elif file_path.suffix in ('.js', '.mjs', '.sh') and shared_to_bundle:
                    zipf.writestr(
                        str(arcname), rewrite_text(file_path.read_text(), file_path.suffix)
                    )
                else:
                    zipf.write(file_path, arcname)
                print(f"  Added: {arcname}")

            # Bundle shared resources under references/ — the same bytes
            # `npm run bundle` writes in-tree: banner + reference rewrite + link
            # re-relativisation. Never the raw source.
            for filename, src_path in shared_to_bundle.items():
                arcname = Path(skill_path.name) / 'references' / filename
                zipf.writestr(
                    str(arcname), expected_bytes(src_path, filename, refs_dir, bundled_names)
                )
                print(f"  Bundled shared: {arcname}")

        print(f"\n✅ Successfully packaged skill to: {zip_filename}")
        return zip_filename

    except Exception as e:
        print(f"❌ Error creating zip file: {e}")
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python utils/package_skill.py <path/to/skill-folder> [output-directory]")
        print("\nExample:")
        print("  python utils/package_skill.py skills/public/my-skill")
        print("  python utils/package_skill.py skills/public/my-skill ./dist")
        sys.exit(1)

    skill_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"📦 Packaging skill: {skill_path}")
    if output_dir:
        print(f"   Output directory: {output_dir}")
    print()

    result = package_skill(skill_path, output_dir)

    if result:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()