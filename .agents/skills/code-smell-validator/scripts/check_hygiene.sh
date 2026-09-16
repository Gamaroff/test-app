#!/bin/bash

# Perform automated code hygiene checks.
# Usage: ./check_hygiene.sh [directory]

TARGET_DIR=${1:-"."}

echo "Performing Code Hygiene Audit on $TARGET_DIR..."

# 1. Search for TODOs and FIXMEs
echo ""
echo "--- TODOs & FIXMEs ---"
grep -rnE "TODO|FIXME" "$TARGET_DIR" --exclude-dir={node_modules,.git,dist,build} | head -n 20
if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo "(Showing first 20 matches)"
else
  echo "✅ No TODOs or FIXMEs found."
fi

# 2. Search for large blocks of commented-out code (heuristic: 3+ lines starting with //)
echo ""
echo "--- Potential 'Zombie Code' (Commented-out blocks) ---"
grep -rnE "^\s*//.*\n\s*//.*\n\s*//" "$TARGET_DIR" --exclude-dir={node_modules,.git,dist,build} | head -n 10
if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo "(Showing potential matches - manual review required)"
else
  echo "✅ No large commented-out blocks detected."
fi

# 3. Check for Unused Imports (for JS/TS projects)
if [ -f "package.json" ]; then
  echo ""
  echo "--- Unused Imports/Vars (via ESLint) ---"
  if npx eslint --version &>/dev/null; then
    npx eslint "$TARGET_DIR" --ext .ts,.tsx,.js \
      --no-eslintrc \
      --rule 'no-unused-vars: warn' \
      --rule '@typescript-eslint/no-unused-vars: warn' \
      --format unix | grep "unused" | head -n 10
  else
    echo "⚠️ ESLint not found. Skipping automated unused import check."
  fi
fi

echo ""
echo "Hygiene Audit Complete."
echo "Guidance: Review the results and add 'Cleanup Hygiene' tasks to the Refactoring Plan for high-priority areas."
