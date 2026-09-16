#!/bin/bash

# Search for existing coverage reports and identify high-risk areas.
# Usage: ./check_coverage.sh

echo "Searching for test coverage reports..."

REPORTS=(
  "coverage/lcov-report/index.html"
  "coverage/index.html"
  "target/site/jacoco/index.html"
  "htmlcov/index.html"
  "coverage.xml"
)

FOUND=false
for report in "${REPORTS[@]}"; do
  if [ -f "$report" ]; then
    echo "✅ Found coverage report: $report"
    FOUND=true
  fi
done

if [ "$FOUND" = false ]; then
  echo "⚠️ No common coverage reports found. Recommended: Run your project's test suite with coverage enabled."
  echo "   (e.g., 'npm test -- --coverage', 'pytest --cov', or 'mvn test')"
else
  echo ""
  echo "Guidance: Focus refactoring on files that show both high complexity/smells AND low coverage."
  echo "         Always add missing tests BEFORE refactoring these areas."
fi
