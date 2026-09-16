#!/bin/bash

# Detect the project's tech stack (languages and frameworks).
# Usage: ./detect_stack.sh

echo "Detecting Tech Stack..."

STACK=""

# 1. Node.js / JS / TS
if [ -f "package.json" ]; then
  STACK="Node.js"
  if grep -q "\"typescript\":" "package.json" || [ -f "tsconfig.json" ]; then
    STACK="$STACK, TypeScript"
  fi
  if grep -q "\"react\":" "package.json"; then
    STACK="$STACK, React"
  fi
  if grep -q "\"expo\":" "package.json"; then
    STACK="$STACK, Expo"
  fi
  if grep -q "\"next\":" "package.json"; then
    STACK="$STACK, Next.js"
  fi
  if grep -q "\"vue\":" "package.json"; then
    STACK="$STACK, Vue.js"
  fi
fi

# 2. Python
if [ -f "requirements.txt" ] || [ -f "Pipfile" ] || [ -f "pyproject.toml" ]; then
  PYTHON_STACK="Python"
  if grep -qi "django" requirements.txt 2>/dev/null || grep -qi "django" pyproject.toml 2>/dev/null; then
    PYTHON_STACK="$PYTHON_STACK, Django"
  fi
  if grep -qi "flask" requirements.txt 2>/dev/null || grep -qi "flask" pyproject.toml 2>/dev/null; then
    PYTHON_STACK="$PYTHON_STACK, Flask"
  fi
  if [ -n "$STACK" ]; then STACK="$STACK | $PYTHON_STACK"; else STACK="$PYTHON_STACK"; fi
fi

# 3. Java
if [ -f "pom.xml" ] || [ -f "build.gradle" ]; then
  JAVA_STACK="Java"
  if grep -qi "spring-boot" pom.xml 2>/dev/null || grep -qi "spring-boot" build.gradle 2>/dev/null; then
    JAVA_STACK="$JAVA_STACK, Spring Boot"
  fi
  if [ -n "$STACK" ]; then STACK="$STACK | $JAVA_STACK"; else STACK="$JAVA_STACK"; fi
fi

# 4. Ruby
if [ -f "Gemfile" ]; then
  RUBY_STACK="Ruby"
  if grep -qi "rails" Gemfile 2>/dev/null; then
    RUBY_STACK="$RUBY_STACK, Rails"
  fi
  if [ -n "$STACK" ]; then STACK="$STACK | $RUBY_STACK"; else STACK="$RUBY_STACK"; fi
fi

# 5. Go
if [ -f "go.mod" ]; then
  GO_STACK="Go"
  if [ -n "$STACK" ]; then STACK="$STACK | $GO_STACK"; else STACK="$GO_STACK"; fi
fi

if [ -z "$STACK" ]; then
  echo "Stack: Undetermined (Generic)"
else
  echo "Stack: $STACK"
fi
