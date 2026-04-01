#!/bin/bash
# install.sh — 一键配置 SeaTalk + Cursor Agent 自动启动
# 用法: bash install.sh [uninstall]
set -e

CDP_PORT=19222
AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRAPPER_DIR="$HOME/.seatalk-agent"
WRAPPER_SCRIPT="$WRAPPER_DIR/launch-seatalk.sh"
CDP_DAEMON_SCRIPT="$WRAPPER_DIR/seatalk-cdp-daemon.sh"
LOG_DIR="$HOME/.seatalk-agent/logs"

# LaunchAgent 名称
PLIST_NAME_AGENT="com.seatalk.cursor-agent"
PLIST_NAME_CDP="com.seatalk.cdp-daemon"
PLIST_PATH_AGENT="$HOME/Library/LaunchAgents/${PLIST_NAME_AGENT}.plist"
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
  echo "❌ Node.js not found. Please install Node.js first."
  exit 1
fi

NODE_DIR="$(dirname "$NODE_BIN")"

uninstall() {
  echo "🗑  Uninstalling..."
  launchctl unload "$PLIST_PATH_AGENT" 2>/dev/null || true
  launchctl unload "$PLIST_PATH_CDP" 2>/dev/null || true
  rm -f "$PLIST_PATH_AGENT" "$PLIST_PATH_CDP"

  # Clean shell aliases
  for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$rc" ]; then
      sed -i '' '/# SeaTalk + Cursor Agent/d' "$rc" 2>/dev/null || true
      sed -i '' '/alias seatalk=/d' "$rc" 2>/dev/null || true
    fi
  done

  rm -rf "$WRAPPER_DIR"
  echo "✅ Uninstalled. SeaTalk will launch normally without agent."
  exit 0
}

[ "$1" = "uninstall" ] && uninstall

echo "🔧 Installing SeaTalk + Cursor Agent..."
echo "   Agent dir: $AGENT_DIR"
echo "   Node: $NODE_BIN"
echo ""

# 1. Create directories
mkdir -p "$WRAPPER_DIR" "$LOG_DIR"

# 2. Copy CDP daemon script
cp "$AGENT_DIR/seatalk-cdp-daemon.sh" "$CDP_DAEMON_SCRIPT"
chmod +x "$CDP_DAEMON_SCRIPT"

# 3. Create SeaTalk launch wrapper script (for manual `seatalk` command)
cat > "$WRAPPER_SCRIPT" << 'WRAPPER_EOF'
#!/bin/bash
CDP_PORT=__CDP_PORT__
AGENT_DIR="__AGENT_DIR__"
LOG_DIR="__LOG_DIR__"
NODE_DIR="__NODE_DIR__"
export PATH="$NODE_DIR:$PATH"

# Launch SeaTalk with CDP if not already running with it
if ! curl -s -o /dev/null -w "" http://localhost:$CDP_PORT/json 2>/dev/null; then
  pkill -x SeaTalk 2>/dev/null || true
  sleep 1
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

# Start agent
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

sed -i '' "s|__CDP_PORT__|${CDP_PORT}|g" "$WRAPPER_SCRIPT"
sed -i '' "s|__AGENT_DIR__|${AGENT_DIR}|g" "$WRAPPER_SCRIPT"
sed -i '' "s|__LOG_DIR__|${LOG_DIR}|g" "$WRAPPER_SCRIPT"
sed -i '' "s|__NODE_DIR__|${NODE_DIR}|g" "$WRAPPER_SCRIPT"
chmod +x "$WRAPPER_SCRIPT"

# 4. Create CDP daemon LaunchAgent — 开机自启，持续运行
#    当用户以任意方式打开 SeaTalk（双击/Dock/Spotlight），
#    守护进程自动检测并重启为 CDP 模式
cat > "$PLIST_PATH_CDP" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME_CDP}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${CDP_DAEMON_SCRIPT}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/cdp-daemon-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/cdp-daemon-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CDP_PORT</key>
        <string>${CDP_PORT}</string>
        <key>SEATALK_CDP_LOG</key>
        <string>${LOG_DIR}/cdp-daemon.log</string>
    </dict>
</dict>
</plist>
PLIST_EOF

# 5. Create Agent LaunchAgent — WatchPaths 触发，SeaTalk 更新时重启 agent
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

# 6. Load Launch Agents
launchctl unload "$PLIST_PATH_CDP" 2>/dev/null || true
launchctl unload "$PLIST_PATH_AGENT" 2>/dev/null || true
launchctl load "$PLIST_PATH_CDP"
launchctl load "$PLIST_PATH_AGENT"

# 7. Add alias to shell config
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
echo "   1. CDP 守护进程: $CDP_DAEMON_SCRIPT"
echo "      → 开机自启，持续监听 SeaTalk 进程"
echo "      → 无论怎么打开 SeaTalk（双击/Dock/Spotlight），都会自动启用 CDP"
echo "   2. Agent 启动器: $WRAPPER_SCRIPT"
echo "   3. Shell alias: seatalk"
echo ""
echo "📖 Usage:"
echo "   • Type 'seatalk' in terminal → launches SeaTalk + Agent"
echo "   • Or just open SeaTalk normally → CDP daemon auto-enables CDP"
echo "     (then run 'npm start' in seatalk-agent to start the Agent)"
echo "   • Daemon logs: $LOG_DIR/cdp-daemon.log"
echo "   • Agent logs:  $LOG_DIR/agent.log"
echo ""
echo "🗑  To uninstall: bash $AGENT_DIR/install.sh uninstall"
