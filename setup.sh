#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHELL_RC=""

# Detect shell
if [[ "$SHELL" == *"zsh"* ]]; then
  SHELL_RC="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
  if [[ -f "$HOME/.bashrc" ]]; then
    SHELL_RC="$HOME/.bashrc"
  else
    SHELL_RC="$HOME/.bash_profile"
  fi
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Claude Code Telemetry - Setup                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if npm dependencies are installed
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo "Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install
  echo ""
fi

# Environment variables to add
ENV_BLOCK='
# Claude Code Telemetry
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318'

# Check if already configured
if [[ -n "$SHELL_RC" ]] && grep -q "CLAUDE_CODE_ENABLE_TELEMETRY" "$SHELL_RC" 2>/dev/null; then
  echo "[OK] Environment variables already configured in $SHELL_RC"
else
  if [[ -n "$SHELL_RC" ]]; then
    echo "Adding environment variables to $SHELL_RC..."
    echo "$ENV_BLOCK" >> "$SHELL_RC"
    echo "[OK] Environment variables added to $SHELL_RC"
    echo ""
    echo "  Run this to apply now:  source $SHELL_RC"
  else
    echo "Could not detect shell config file."
    echo "Add these to your shell profile manually:"
    echo "$ENV_BLOCK"
  fi
fi

echo ""
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "Commands:"
echo "  Start tracking:    cd $SCRIPT_DIR && npm start"
echo "  View reports:      cd $SCRIPT_DIR && npm run report today"
echo ""
echo "───────────────────────────────────────────────────────────────"
echo ""

# Ask to start receiver
read -p "Start the telemetry receiver now? [Y/n] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  echo ""
  echo "Starting receiver... (Ctrl+C to stop)"
  echo ""
  cd "$SCRIPT_DIR" && npm start
fi
