#!/usr/bin/env bash
# Enable/disable the Maestro MCP server for Claude Code ON DEMAND.
#
# A configured MCP connects at every session start, but Maestro-driven work is
# occasional — so it's deliberately NOT kept in the always-loaded config. Turn it
# on only for the sessions where you'll author/run flows through the agent, then
# off again. MCP tools load at session start, so restart Claude Code after either.
#
#   apps/mobile/.maestro/mcp.sh enable    # register maestro (local scope) → restart
#   apps/mobile/.maestro/mcp.sh disable   # unregister → restart
#
# Portable: resolves the global maestro binary under $HOME and pins JAVA_HOME
# (the two reasons a bare `maestro mcp` registration fails to connect).
set -euo pipefail

MAESTRO_BIN="$HOME/.maestro/bin/maestro"
JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home 2>/dev/null || true)}"

case "${1:-}" in
  enable)
    [ -x "$MAESTRO_BIN" ] || {
      echo "maestro not found at $MAESTRO_BIN — install it first (see docs/flows/README.md)" >&2
      exit 1
    }
    claude mcp add maestro \
      ${JAVA_HOME:+--env "JAVA_HOME=$JAVA_HOME"} \
      -- "$MAESTRO_BIN" mcp
    echo "✓ Maestro MCP enabled (local scope). Restart Claude Code to load its tools."
    ;;
  disable)
    claude mcp remove maestro
    echo "✓ Maestro MCP disabled. Restart Claude Code to drop its tools."
    ;;
  *)
    echo "usage: ${0##*/} enable|disable" >&2
    exit 1
    ;;
esac
