#!/bin/bash
# install.sh — 一键配置 SeaTalk + Cursor Agent 自动启动
# 用法: bash install.sh [uninstall]
set -e

CDP_PORT=19222
AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.seatalk.cursor-agent"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
WRAPPER_DIR="$HOME/.seatalk-agent"
WRAPPER_SCRIPT="$WRAPPER_DIR/launch-seatalk.sh"
LOG_DIR="$HOME/.seatalk-agent/logs"
NODE_BIN="$(which node 2>/dev/null || echo "")"
NPX_BIN="$(which npx 2>/dev/null || echo "")"

if [ -z "$NODE_BIN" ]; then
  # Try nvm default
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  NODE_BIN="$(which node 2>/dev/null || echo "")"
  NPX_BIN="$(which npx 2>/dev/null || echo "")"
fi

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js not found. Please install Node.js first."
  exit 1
fi

NODE_DIR="$(dirname "$NODE_BIN")"

uninstall() {
  echo "🗑  Uninstalling..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  rm -rf "$WRAPPER_DIR"
  echo "✅ Uninstalled. SeaTalk will launch normally without agent."
  exit 0
}

[ "$1" = "uninstall" ] && uninstall

echo "🔧 Installing SeaTalk + Cursor Agent auto-start..."
echo "   Agent dir: $AGENT_DIR"
echo "   Node: $NODE_BIN"
echo ""

# 1. Create wrapper directory
mkdir -p "$WRAPPER_DIR" "$LOG_DIR"

# 2. Create SeaTalk launch wrapper script
cat > "$WRAPPER_SCRIPT" << 'WRAPPER_EOF'
#!/bin/bash
CDP_PORT=__CDP_PORT__
AGENT_DIR="__AGENT_DIR__"
LOG_DIR="__LOG_DIR__"
NODE_DIR="__NODE_DIR__"
export PATH="$NODE_DIR:$PATH"

# Launch SeaTalk with CDP if not already running with it
if ! curl -s -o /dev/null -w "" http://localhost:$CDP_PORT/json 2>/dev/null; then
  # Kill any SeaTalk without CDP
  pkill -f SeaTalk 2>/dev/null || true
  sleep 1
  # Start SeaTalk with CDP
  open -a SeaTalk --args --remote-debugging-port=$CDP_PORT
fi

# Wait for CDP to become available
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:$CDP_PORT/json 2>/dev/null; then
    break
  fi
  sleep 1
done

# Kill any existing agent process
pkill -f "tsx src/main.ts" 2>/dev/null || true
sleep 1

# Start agent with auto-restart on update (exit code 42 = update applied)
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

# Replace placeholders
sed -i '' "s|__CDP_PORT__|${CDP_PORT}|g" "$WRAPPER_SCRIPT"
sed -i '' "s|__AGENT_DIR__|${AGENT_DIR}|g" "$WRAPPER_SCRIPT"
sed -i '' "s|__LOG_DIR__|${LOG_DIR}|g" "$WRAPPER_SCRIPT"
sed -i '' "s|__NODE_DIR__|${NODE_DIR}|g" "$WRAPPER_SCRIPT"
chmod +x "$WRAPPER_SCRIPT"

# 3. Create macOS Launch Agent plist
cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${WRAPPER_SCRIPT}</string>
    </array>
    <key>WatchPaths</key>
    <array>
        <string>/Applications/SeaTalk.app</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <false/>
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

# 4. Load the Launch Agent
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

# 5. Add alias to shell config for manual launch
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
echo "✅ Installation complete!"
echo ""
echo "📋 What was configured:"
echo "   1. SeaTalk launch wrapper: $WRAPPER_SCRIPT"
echo "   2. macOS Launch Agent: $PLIST_PATH"
echo "   3. Shell alias: seatalk"
echo ""
echo "📖 Usage:"
echo "   • Type 'seatalk' in terminal → launches SeaTalk + agent"
echo "   • Agent logs: $LOG_DIR/agent.log"
echo ""
echo "🗑  To uninstall: bash $AGENT_DIR/install.sh uninstall"
