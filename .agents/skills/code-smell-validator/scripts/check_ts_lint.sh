#!/bin/bash

# Run ESLint with complexity and hook rules to find stack-specific smells.
# Usage: ./check_ts_lint.sh [directory]

TARGET_DIR=${1:-"."}

if ! command -v npx &> /dev/null; then
  echo "Error: npx not found. Please install Node.js."
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo "Error: package.json not found. Are you in a Node.js project?"
  exit 1
fi

echo "Running ESLint on $TARGET_DIR to find React/TS complexity..."

# We use npx to run eslint even if it's only in node_modules
# We specifically look for complexity and hook rules
# Note: We use --no-eslintrc if we want a strict generic check, 
# but usually we want to respect project rules and just add our flags.

npx eslint "$TARGET_DIR" \
  --ext .ts,.tsx \
  --rule 'complexity: ["warn", 10]' \
  --rule 'react-hooks/rules-of-hooks: error' \
  --rule 'react-hooks/exhaustive-deps: warn' \
  --rule 'max-lines-per-function: ["warn", 50]' \
  --rule '@typescript-eslint/no-explicit-any: warn' \
  --format stylish

if [ $? -eq 0 ]; then
  echo "✅ ESLint check completed. No major smells detected by automated rules."
else
  echo ""
  echo "Guidance: Prioritize refactoring files with multiple complexity or hook warnings."
fi
