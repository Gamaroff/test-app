#!/bin/bash

# Analyze Git churn to find frequently modified files.
# Usage: ./analyze_churn.sh [limit]

LIMIT=${1:-10}

if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "Error: Not a git repository."
  exit 1
fi

echo "Top $LIMIT high-churn files (most modified):"
git log --format=format: --name-only | grep -v '^$' | sort | uniq -c | sort -rg | head -n "$LIMIT"
