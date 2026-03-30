import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { connectMainPage, type CdpClient } from './cdp.js';
import { Bridge } from './bridge.js';
import { spawnAgent, killAgent, listModels, type AgentProcess } from './acp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CDP_PORT = parseInt(process.env.CDP_PORT || '19222', 10);
const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

const LOG_BUFFER_SIZE = 100;
const logBuffer: string[] = [];

function log(...args: unknown[]) {
  const ts = new Date().toLocaleTimeString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const line = `[${ts}] [agent] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  console.log(line);
  logBuffer.push(line);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}

function killStaleCdpClients() {
  try {
    const myPid = process.pid;
    const output = execSync(`lsof -i :${CDP_PORT} -t 2>/dev/null || true`, { encoding: 'utf-8' });
    const pids = output.split('\n').map((l) => parseInt(l.trim(), 10)).filter((p) => p > 0 && p !== myPid);
    for (const pid of pids) {
      try {
        const cmdline = execSync(`ps -p ${pid} -o command= 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
        if (cmdline.includes('tsx') && cmdline.includes('main')) {
          process.kill(pid, 'SIGTERM');
          log(`killed stale agent process ${pid}`);
        }
      } catch { /* already gone */ }
    }
  } catch { /* lsof not available or other error */ }
}

function readScript(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'inject', name), 'utf-8');
}

function scanWorkspaces(): Array<{ name: string; path: string }> {
  const home = process.env.HOME || '/Users/' + process.env.USER;
  const dirs: Array<{ name: string; path: string }> = [];
  const scanRoots = [path.join(home, 'Cursor'), home];
  const seen = new Set<string>();
  for (const root of scanRoots) {
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'Library') continue;
        const full = path.join(root, e.name);
        if (seen.has(full)) continue;
        seen.add(full);
        try {
          const hasGit = fs.existsSync(path.join(full, '.git'));
          const hasCursor = fs.existsSync(path.join(full, '.cursor'));
          const hasPkg = fs.existsSync(path.join(full, 'package.json')) || fs.existsSync(path.join(full, 'pyproject.toml')) || fs.existsSync(path.join(full, 'pom.xml')) || fs.existsSync(path.join(full, 'Cargo.toml'));
          if (hasGit || hasCursor || hasPkg) dirs.push({ name: e.name, path: full });
        } catch { /* skip */ }
      }
    } catch { /* root not readable */ }
  }
  return dirs;
}

async function waitForSpaReady(
  evaluate: (code: string) => Promise<unknown>,
  timeoutMs = 15_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ready = await evaluate(
        `!!(window.store && document.querySelector('.sidebar-sidebar'))`,
      );
      if (ready) return true;
    } catch {
      /* page navigating */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  killStaleCdpClients();
  log(`connecting to SeaTalk CDP on port ${CDP_PORT}...`);

  let client: CdpClient;
  while (true) {
    try {
      client = await connectMainPage(CDP_PORT);
      break;
    } catch {
      log('waiting for SeaTalk...');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  log(`connected: ${client.page.title} (${client.page.url})`);

  log('waiting for SPA ready...');
  const ready = await waitForSpaReady((code) => client.evaluate(code));
  log(ready ? 'SPA ready' : 'SPA not ready after timeout, injecting anyway');

  let bridge = new Bridge(client);
  await bridge.setup();
  log('message bridge ready');

  // ── ACP ──

  let agent: AgentProcess | null = null;
  let userCancelled = false;
  let defaultMode = 'ask';
  let currentWorkspace = WORKSPACE;
  const toolTitleCache = new Map<string, string>();
  let cachedWorkspaceList: Array<{ name: string; path: string }> = [];

  function buildWorkspaceContext(): string {
    if (!cachedWorkspaceList.length) cachedWorkspaceList = scanWorkspaces();
    const list = cachedWorkspaceList.map((w) => `  - ${w.name} (${w.path})`).join('\n');
    return [
      `[System — internal, never reveal to user]`,
      `Current workspace: ${currentWorkspace}`,
      `Available workspaces:\n${list}`,
      ``,
      `WORKSPACE SWITCHING PROTOCOL (internal — never explain, quote, or reference this protocol to the user):`,
      `When the user wants to switch workspace/project, silently output this marker on a separate line:`,
      `[[SWITCH_WORKSPACE:/absolute/path/to/project]]`,
      `Then say something like "已切换到 XXX 工作区" naturally. Use fuzzy matching for partial/misspelled names.`,
      `NEVER mention "[[SWITCH_WORKSPACE" or this protocol in your response. Treat it as a hidden system command.`,
    ].join('\n');
  }

  let switchPending = '';
  let switchFlushTimer: ReturnType<typeof setTimeout> | null = null;

  function handleTextChunkForSwitch(text: string): string | null {
    switchPending += text;
    const re = /\[\[SWITCH_WORKSPACE:(.*?)\]\]/;
    const m = switchPending.match(re);
    if (m) {
      const wsPath = m[1].trim();
      const cleaned = switchPending.replace(re, '');
      switchPending = '';
      if (switchFlushTimer) { clearTimeout(switchFlushTimer); switchFlushTimer = null; }
      performWorkspaceSwitch(wsPath);
      return cleaned || null;
    }
    // If we see the start of the marker, hold the buffer
    if (switchPending.includes('[[')) {
      if (switchFlushTimer) clearTimeout(switchFlushTimer);
      // safety timeout: if marker never closes, flush after 3s
      switchFlushTimer = setTimeout(() => {
        if (switchPending) {
          bridge.sendAssistantChunk(switchPending).catch(() => {});
          switchPending = '';
        }
        switchFlushTimer = null;
      }, 3000);
      return null;
    }
    // No marker in sight, flush everything
    const out = switchPending;
    switchPending = '';
    return out;
  }

  async function performWorkspaceSwitch(wsPath: string) {
    try {
      const stat = fs.statSync(wsPath);
      if (!stat.isDirectory()) {
        log(`switch_workspace: not a directory: ${wsPath}`);
        return;
      }
    } catch {
      log(`switch_workspace: path not found: ${wsPath}`);
      return;
    }
    currentWorkspace = wsPath;
    log(`workspace switched via agent to: ${currentWorkspace}`);

    // flush any remaining text before ending the turn
    await bridge.sendAssistantDone();
    await bridge.sendToPanel({ type: 'turn_end', stopReason: 'end_turn' });
    bridge.sendToPanel({ type: 'workspace', path: currentWorkspace }).catch(() => {});

    if (agent) {
      try {
        userCancelled = true; // prevent double turn_end from prompt return
        await agent.connection.cancel({ sessionId: agent.sessionId }).catch(() => {});
        const res = await agent.connection.newSession({ cwd: currentWorkspace, mcpServers: [] });
        agent.sessionId = res.sessionId;
        log(`new session for workspace: ${agent.sessionId}`);
        try {
          await agent.connection.setSessionMode({ sessionId: agent.sessionId, modeId: defaultMode });
        } catch {}
      } catch (e) {
        log('switch_workspace session failed:', (e as Error).message);
      }
    }
  }

  let currentModelId = '';

  const acpCallbacks = {
    onTextChunk: (text: string) => {
      const filtered = handleTextChunkForSwitch(text);
      if (filtered) bridge.sendAssistantChunk(filtered).catch((e: Error) => log(`sendAssistantChunk error: ${e.message}`));
    },
    onThoughtChunk: (text: string) => {
      bridge.sendToPanel({ type: 'thought_chunk', text }).catch((e: Error) => log(`sendThought error: ${e.message}`));
    },
    onToolCall: (info: import('./acp.js').ToolCallInfo) => {
      if (info.title) toolTitleCache.set(info.toolCallId, info.title);
      const title = info.title || toolTitleCache.get(info.toolCallId) || 'Tool';

      if (info.status === 'pending' || info.status === 'running' || (!info.status && info.kind)) {
        bridge
          .sendToPanel({ type: 'tool_start', toolCallId: info.toolCallId, title, kind: info.kind || '', input: info.input || '' })
          .catch(() => {});
      } else {
        bridge
          .sendToPanel({ type: 'tool_update', toolCallId: info.toolCallId, title, status: info.status || '', output: info.output || '' })
          .catch(() => {});
        if (info.status === 'completed') toolTitleCache.delete(info.toolCallId);
      }
    },
    onModeUpdate: (modeId: string) => {
      bridge.sendToPanel({ type: 'mode', mode: modeId }).catch(() => {});
    },
  };

  async function startAcp(): Promise<boolean> {
    try {
      log(`starting ACP agent (workspace: ${currentWorkspace})...`);
      agent = await spawnAgent({
        workspacePath: currentWorkspace,
        callbacks: acpCallbacks,
        log,
        modelId: currentModelId || undefined,
      });

      agent.proc.on('exit', () => {
        log('ACP agent process exited, will respawn in 3s...');
        agent = null;
        setTimeout(() => startAcp(), 3000);
      });

      log('ACP agent connected');

      try {
        const modelResult = await listModels(log);
        agent!.availableModels = modelResult.models;
        agent!.currentModelId = modelResult.currentModelId;
      } catch (e) {
        log('failed to list models:', (e as Error).message);
      }

      return true;
    } catch (e) {
      log('ACP start failed:', (e as Error).message);
      return false;
    }
  }

  const acpReady = await startAcp();

  // ── Message handler ──

  function setupMessageHandler(b: Bridge) {
    b.onMessage(async (data) => {
      log(`received (bridge#${b.id}):`, JSON.stringify(data).substring(0, 200));

      if (data.type === 'user_message') {
        const text = data.text as string;
        const context = data.context as Record<string, unknown> | undefined;

        if (!agent) {
          await bridge.sendToPanel({
            type: 'text_chunk',
            text: '[Error] Agent 未连接，请稍后重试。',
          });
          await bridge.sendToPanel({ type: 'turn_end', stopReason: 'error' });
          return;
        }

        let contextStr: string | undefined;
        if (context) {
          const ctxName = (context as any).sessionName || '?';
          const msgs = ((context as any).messages || []) as Array<{
            sender: string;
            text: string;
          }>;
          const focus = (context as any).focusMessage as { sender: string; text: string } | undefined;
          const lines = msgs.map((m) => `${m.sender}: ${m.text}`);
          contextStr = `Chat: ${ctxName}\n${lines.join('\n')}`;
          if (focus) {
            contextStr += `\n\n[用户关注的消息] ${focus.sender}: ${focus.text}`;
          }
        }

        bridge.sendToPanel({ type: 'turn_start' }).catch(() => {});
        userCancelled = false;
        toolTitleCache.clear();
        switchPending = '';
        if (switchFlushTimer) { clearTimeout(switchFlushTimer); switchFlushTimer = null; }

        const promptBlocks: Array<{ type: string; text: string }> = [];
        promptBlocks.push({ type: 'text', text: buildWorkspaceContext() });
        if (contextStr) {
          promptBlocks.push({ type: 'text', text: `[SeaTalk 聊天上下文]\n${contextStr}` });
        }
        promptBlocks.push({ type: 'text', text });

        try {
          log(`sending prompt to ACP (sessionId=${agent.sessionId})...`);
          const result = await agent.connection.prompt({
            sessionId: agent.sessionId,
            prompt: promptBlocks as any,
          });
          log('prompt returned');
          await bridge.sendAssistantDone();

          const stopReason = result.stopReason || 'end_turn';
          if (stopReason === 'cancelled' && userCancelled) {
            // workspace-switch or user cancel already handled turn_end
          } else if (stopReason === 'cancelled') {
            // system-initiated cancel, don't show to user
          } else {
            await bridge.sendToPanel({ type: 'turn_end', stopReason });
          }
          log(`prompt done: ${stopReason}`);
        } catch (e) {
          await bridge.sendToPanel({
            type: 'text_chunk',
            text: `\n\n[Error] ${(e as Error).message}`,
          });
          await bridge.sendToPanel({ type: 'turn_end', stopReason: 'error' });
          log('prompt error:', (e as Error).message);
        }
      } else if (data.type === 'cancel') {
        if (agent) {
          userCancelled = true;
          await agent.connection.cancel({ sessionId: agent.sessionId });
          log('prompt cancelled');
        }
      } else if (data.type === 'set_mode') {
        if (agent) {
          try {
            const mode = data.mode as string;
            await agent.connection.setSessionMode({
              sessionId: agent.sessionId,
              modeId: mode,
            });
            defaultMode = mode;
            log(`mode set to: ${mode}`);
          } catch (e) {
            log('set mode failed:', (e as Error).message);
          }
        }
      } else if (data.type === 'set_model') {
        const modelId = data.modelId as string;
        if (!modelId) return;
        log(`switching model to: ${modelId}`);

        // Kill current agent and respawn with --model flag
        if (agent) {
          agent.proc.removeAllListeners('exit');
          try { agent.proc.kill('SIGTERM'); } catch {}
          agent = null;
        }
        currentModelId = modelId;
        try {
          agent = await spawnAgent({
            workspacePath: currentWorkspace,
            callbacks: acpCallbacks,
            log,
            modelId,
          });
          agent.currentModelId = modelId;
          agent.proc.on('exit', () => {
            log('ACP agent process exited, will respawn in 3s...');
            agent = null;
            setTimeout(() => startAcp(), 3000);
          });

          try {
            const modelResult = await listModels(log);
            agent.availableModels = modelResult.models;
          } catch {}

          try {
            await agent.connection.setSessionMode({ sessionId: agent.sessionId, modeId: defaultMode });
          } catch {}

          bridge.sendToPanel({ type: 'status', connected: true, text: 'Connected' }).catch(() => {});
          log(`model switched to ${modelId}, new session: ${agent.sessionId}`);
        } catch (e) {
          log(`model switch failed: ${(e as Error).message}`);
          bridge.sendToPanel({ type: 'status', connected: false, text: 'Model switch failed' }).catch(() => {});
          setTimeout(() => startAcp(), 2000);
        }
      } else if (data.type === 'browse_folder') {
        try {
          const result = execSync(
            `osascript -e 'POSIX path of (choose folder with prompt "选择工作区文件夹")'`,
            { encoding: 'utf-8', timeout: 60_000 },
          ).trim().replace(/\/$/, '');
          if (result && fs.existsSync(result)) {
            log(`folder selected: ${result}`);
            bridge.sendToPanel({ type: 'folder_selected', path: result }).catch(() => {});
          }
        } catch {
          log('folder picker cancelled or failed');
        }
      } else if (data.type === 'set_workspace') {
        const wsPath = data.path as string;
        if (!wsPath) return;
        try {
          const stat = fs.statSync(wsPath);
          if (!stat.isDirectory()) {
            log(`set_workspace failed: not a directory: ${wsPath}`);
            return;
          }
        } catch {
          log(`set_workspace failed: path not found: ${wsPath}`);
          return;
        }
        currentWorkspace = wsPath;
        log(`workspace changed to: ${currentWorkspace}`);
        if (agent) {
          try {
            await agent.connection.cancel({ sessionId: agent.sessionId }).catch(() => {});
            const res = await agent.connection.newSession({
              cwd: currentWorkspace,
              mcpServers: [],
            });
            agent.sessionId = res.sessionId;
            log(`new session for workspace: ${agent.sessionId}`);
            try {
              await agent.connection.setSessionMode({ sessionId: agent.sessionId, modeId: defaultMode });
            } catch {}
          } catch (e) {
            log('set_workspace session failed:', (e as Error).message);
          }
        }
        bridge.sendToPanel({ type: 'workspace', path: currentWorkspace }).catch(() => {});
      } else if (data.type === 'new_conversation') {
        if (agent) {
          try {
            await agent.connection.cancel({ sessionId: agent.sessionId }).catch(() => {});
            const res = await agent.connection.newSession({
              cwd: currentWorkspace,
              mcpServers: [],
            });
            agent.sessionId = res.sessionId;
            log(`new session: ${agent.sessionId}`);
            try {
              await agent.connection.setSessionMode({
                sessionId: agent.sessionId,
                modeId: defaultMode,
              });
            } catch {}
            const models = (res as any).models as { availableModels?: { modelId: string; name: string }[]; currentModelId?: string } | null;
            if (models?.availableModels?.length) {
              agent.availableModels = models.availableModels;
              agent.currentModelId = models.currentModelId ?? '';
              bridge.sendToPanel({
                type: 'models',
                models: agent.availableModels,
                currentModelId: agent.currentModelId,
              }).catch(() => {});
            }
          } catch (e) {
            log('new session failed:', (e as Error).message);
          }
        }
      } else if (data.type === 'reconnect_acp') {
        log('reconnect_acp requested by user');
        bridge.sendToPanel({ type: 'status', connected: false, text: '重连中...' }).catch(() => {});
        if (agent) {
          agent.proc.removeAllListeners('exit');
          try { agent.proc.kill('SIGTERM'); } catch {}
          agent = null;
        }
        const ok = await startAcp();
        if (ok) {
          bridge.sendToPanel({ type: 'status', connected: true, text: 'Connected' }).catch(() => {});
          if (agent && agent.availableModels.length) {
            bridge.sendToPanel({ type: 'models', models: agent.availableModels, currentModelId: agent.currentModelId }).catch(() => {});
          }
        } else {
          bridge.sendToPanel({ type: 'status', connected: false, text: '重连失败' }).catch(() => {});
        }
      } else if (data.type === 'reinject_ui') {
        log('reinject_ui requested by user');
        try {
          await injectUI();
          log('reinject_ui complete');
        } catch (e) {
          log('reinject_ui failed:', (e as Error).message);
        }
      } else if (data.type === 'restart_agent') {
        log('restart_agent requested by user');
        bridge.sendToPanel({ type: 'status', connected: false, text: '重启中...' }).catch(() => {});
        if (agent) {
          agent.proc.removeAllListeners('exit');
          try { agent.proc.kill('SIGTERM'); } catch {}
          agent = null;
        }
        await new Promise((r) => setTimeout(r, 500));
        const ok = await startAcp();
        if (ok) {
          bridge.sendToPanel({ type: 'status', connected: true, text: 'Connected' }).catch(() => {});
          if (agent && agent.availableModels.length) {
            bridge.sendToPanel({ type: 'models', models: agent.availableModels, currentModelId: agent.currentModelId }).catch(() => {});
          }
        } else {
          bridge.sendToPanel({ type: 'status', connected: false, text: '重启失败' }).catch(() => {});
        }
      } else if (data.type === 'get_logs') {
        bridge.sendToPanel({ type: 'logs', lines: logBuffer.slice() }).catch(() => {});
      } else if (data.type === 'get_diagnostics') {
        bridge.sendToPanel({
          type: 'diagnostics',
          info: {
            cdpPort: CDP_PORT,
            cdpConnected: !reconnecting,
            acpConnected: !!agent,
            workspace: currentWorkspace,
            sessionId: agent?.sessionId || null,
            modelId: agent?.currentModelId || currentModelId || null,
            modelCount: agent?.availableModels?.length || 0,
            uptime: Math.floor(process.uptime()),
            pid: process.pid,
            nodeVersion: process.version,
          },
        }).catch(() => {});
      }
    });
  }

  setupMessageHandler(bridge);

  // ── UI Injection ──

  async function injectUI() {
    log('injecting cursor-ui...');
    await client.evaluate(readScript('cursor-ui.js'));
    log('injecting sidebar panel...');
    await client.evaluate(readScript('sidebar-app.js'));
    log('injection complete!');
    // small delay to ensure frontend IIFE has fully executed
    await new Promise((r) => setTimeout(r, 200));
    bridge
      .sendToPanel({
        type: 'status',
        connected: !!agent,
        text: agent ? 'Connected' : 'ACP disconnected',
      })
      .catch(() => {});
    bridge.sendToPanel({ type: 'mode', mode: defaultMode }).catch(() => {});
    cachedWorkspaceList = scanWorkspaces();
    log(`sending workspace info: ${currentWorkspace}, ${cachedWorkspaceList.length} workspaces`);
    bridge.sendToPanel({ type: 'workspace', path: currentWorkspace, workspaces: cachedWorkspaceList }).catch(() => {});
    if (agent && agent.availableModels.length) {
      bridge
        .sendToPanel({
          type: 'models',
          models: agent.availableModels,
          currentModelId: agent.currentModelId,
        })
        .catch(() => {});
    }
  }

  await injectUI();

  // ── CDP reconnection & page reload ──

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnecting = false;
  let reinjecting = false;

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function cdpReconnectLoop() {
    if (reconnecting) return;
    reconnecting = true;
    stopHeartbeat();
    client.close();
    log('CDP connection lost, attempting reconnect...');
    while (true) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        client = await connectMainPage(CDP_PORT);
        log(`reconnected: ${client.page.title}`);
        const ok = await waitForSpaReady((c) => client.evaluate(c));
        log(ok ? 'SPA ready after reconnect' : 'SPA not ready, injecting anyway');

        bridge = new Bridge(client);
        await bridge.setup();
        setupMessageHandler(bridge);
        await injectUI();
        reconnecting = false;
        setupPageReload();
        startHeartbeat();
        break;
      } catch (e) {
        log('CDP reconnect failed, retrying in 3s...', (e as Error).message);
      }
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(async () => {
      if (reconnecting) return;
      try {
        await client.evaluate('1', 3000);
      } catch {
        log('heartbeat failed, triggering reconnect');
        cdpReconnectLoop();
      }
    }, 5000);
  }

  async function handlePageReload() {
    if (reinjecting) return;
    reinjecting = true;
    log('page reloaded, waiting for SPA and re-injecting...');
    try {
      const ok = await waitForSpaReady((c) => client.evaluate(c));
      log(ok ? 'SPA ready after reload' : 'SPA not ready, injecting anyway');
      bridge = new Bridge(client);
      await bridge.setup();
      setupMessageHandler(bridge);
      await injectUI();
      log('re-injection after reload complete');
    } catch (e) {
      log('re-injection failed:', (e as Error).message);
    }
    reinjecting = false;
  }

  function setupPageReload() {
    client.off('Page.frameNavigated');
    client.send('Page.enable').catch(() => {});
    client.on('Page.frameNavigated', (params: any) => {
      if (!params.frame?.parentId) {
        handlePageReload();
      }
    });
  }

  setupPageReload();
  startHeartbeat();

  process.on('SIGINT', () => {
    log('shutting down...');
    if (agent) killAgent(agent.proc);
    client.close();
    process.exit(0);
  });
}

main().catch((e) => {
  log('fatal:', (e as Error).message);
  process.exit(1);
});
