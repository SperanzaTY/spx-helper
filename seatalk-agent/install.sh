#!/bin/bash
# install.sh — SeaTalk + Cursor Agent setup (Inspector mode)
# Usage: bash install.sh [uninstall]
set -e

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRAPPER_DIR="$HOME/.seatalk-agent"
WRAPPER_SCRIPT="$WRAPPER_DIR/launch-seatalk.sh"
LOG_DIR="$HOME/.seatalk-agent/logs"

PLIST_NAME_AGENT="com.seatalk.cursor-agent"
PLIST_PATH_AGENT="$HOME/Library/LaunchAgents/${PLIST_NAME_AGENT}.plist"

# Legacy daemon plist (cleanup only)
PLIST_NAME_CDP="com.seatalk.cdp-daemon"
PLIST_PATH_CDP="$HOME/Library/LaunchAgents/${PLIST_NAME_CDP}.plist"

NODE_BIN="$(which node 2>/dev/null || echo "")"
NPX_BIN="$(which npx 2>/dev/null || echo "")"

if [ -z "$NODE_BIN" ]; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  NODE_BIN="$(which node 2>/dev/null || echo "")"
  NPX_BIN="$(which npx 2>/dev/null || echo "")"
fi

if [ -z "$NODE_BIN" ]; then
  echo "[FAIL] Node.js not found. Please install Node.js first."
  exit 1
fi

NODE_DIR="$(dirname "$NODE_BIN")"

uninstall() {
  echo "Uninstalling..."
  launchctl unload "$PLIST_PATH_AGENT" 2>/dev/null || true
  launchctl unload "$PLIST_PATH_CDP" 2>/dev/null || true
  rm -f "$PLIST_PATH_AGENT" "$PLIST_PATH_CDP"

  for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$rc" ]; then
      sed -i '' '/# SeaTalk + Cursor Agent/d' "$rc" 2>/dev/null || true
      sed -i '' '/alias seatalk=/d' "$rc" 2>/dev/null || true
    fi
  done

  rm -rf "$WRAPPER_DIR"
  echo "[OK] Uninstalled. SeaTalk will launch normally without agent."
  exit 0
}

[ "$1" = "uninstall" ] && uninstall

echo "Installing SeaTalk + Cursor Agent (Inspector mode)..."
echo "   Agent dir: $AGENT_DIR"
echo "   Node: $NODE_BIN"
echo ""

# 1. Create directories
mkdir -p "$WRAPPER_DIR" "$LOG_DIR"

# 2. Remove legacy CDP daemon if present
launchctl unload "$PLIST_PATH_CDP" 2>/dev/null || true
rm -f "$PLIST_PATH_CDP"
rm -f "$WRAPPER_DIR/seatalk-cdp-daemon.sh"

# 3. Create launch wrapper script (for manual `seatalk` command)
cat > "$WRAPPER_SCRIPT" << 'WRAPPER_EOF'
#!/bin/bash
AGENT_DIR="__AGENT_DIR__"
LOG_DIR="__LOG_DIR__"
NODE_DIR="__NODE_DIR__"
export PATH="$NODE_DIR:$PATH"
export SEATALK_LAUNCHER=1

cleanup() {
  echo "[$(date)] shutting down, killing child processes..." >> "$LOG_DIR/agent.log"
  pkill -P $$ 2>/dev/null
  sleep 0.3
  pkill -9 -P $$ 2>/dev/null
}
trap cleanup EXIT INT TERM

# Kill any existing agent process
for pid in $(pgrep -f "tsx.*seatalk-agent.*main\.ts" 2>/dev/null || true); do
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
done
pgrep -f "npm exec tsx.*seatalk-agent.*main\.ts" | xargs kill 2>/dev/null || true
pkill -f "agent.*--approve-mcps.*acp" 2>/dev/null || true
sleep 1

# Start agent (handles SeaTalk launch internally via SIGUSR1 Inspector)
cd "$AGENT_DIR"
while true; do
  echo "[$(date)] starting agent..." >> "$LOG_DIR/agent.log"
  npx tsx src/main.ts >> "$LOG_DIR/agent.log" 2>&1
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 42 ]; then
    echo "[$(date)] update applied, restarting..." >> "$LOG_DIR/agent.log"
    sleep 1
    continue
  fi
  echo "[$(date)] agent exited with code $EXIT_CODE" >> "$LOG_DIR/agent.log"
  break
done
WRAPPER_EOF

sed -i '' "s|__AGENT_DIR__|${AGENT_DIR}|g" "$WRAPPER_SCRIPT"
sed -i '' "s|__LOG_DIR__|${LOG_DIR}|g" "$WRAPPER_SCRIPT"
sed -i '' "s|__NODE_DIR__|${NODE_DIR}|g" "$WRAPPER_SCRIPT"
chmod +x "$WRAPPER_SCRIPT"

# 4. Create Agent LaunchAgent — KeepAlive + RunAtLoad
cat > "$PLIST_PATH_AGENT" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME_AGENT}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${WRAPPER_SCRIPT}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/launchd-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${NODE_DIR}:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>
</dict>
</plist>
PLIST_EOF

# 5. Load Launch Agent
launchctl unload "$PLIST_PATH_AGENT" 2>/dev/null || true
launchctl load "$PLIST_PATH_AGENT"

# 6. Add alias to shell config
ALIAS_LINE="alias seatalk='bash $WRAPPER_SCRIPT'"
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [ -f "$rc" ]; then
    if ! grep -q "alias seatalk=" "$rc" 2>/dev/null; then
      echo "" >> "$rc"
      echo "# SeaTalk + Cursor Agent" >> "$rc"
      echo "$ALIAS_LINE" >> "$rc"
    fi
  fi
done

echo ""
echo "[OK] Installation complete!"
echo ""
echo "What was configured:"
echo "   1. Agent launcher: $WRAPPER_SCRIPT"
echo "      -> Starts on login, auto-restarts on crash (KeepAlive)"
echo "      -> Connects to SeaTalk via SIGUSR1 + Inspector (no CDP port needed)"
echo "   2. Shell alias: seatalk"
echo ""
echo "Usage:"
echo "   - Type 'seatalk' in terminal -> launches Agent"
echo "   - Agent will auto-detect/launch SeaTalk and connect via Inspector"
echo "   - Agent logs: $LOG_DIR/agent.log"
echo ""
echo "To uninstall: bash $AGENT_DIR/install.sh uninstall"
