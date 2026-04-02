/**
 * ACP client — wraps @agentclientprotocol/sdk.
 *
 * Mirrors the pattern used by wechat-acp:
 *   spawn agent → ndJsonStream → ClientSideConnection → prompt/cancel/newSession
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as acp from '@agentclientprotocol/sdk';

const AGENT_BIN = path.join(os.homedir(), '.local', 'bin', 'agent');

export function checkAgentCli(): { ok: boolean; path: string; error?: string } {
  if (fs.existsSync(AGENT_BIN)) {
    return { ok: true, path: AGENT_BIN };
  }

  const fallbacks = ['/usr/local/bin/agent', '/opt/homebrew/bin/agent'];
  for (const p of fallbacks) {
    if (fs.existsSync(p)) return { ok: true, path: p };
  }

  return {
    ok: false,
    path: AGENT_BIN,
    error: [
      `Cursor CLI (agent) 未找到: ${AGENT_BIN}`,
      '',
      '安装方法:',
      '  1. 打开 Cursor IDE',
      '  2. Cmd+Shift+P → 搜索 "Install \'cursor\' command"',
      '  3. 执行后会在 ~/.local/bin/ 下创建 agent 命令',
      '',
      '或手动安装:',
      '  curl -fsSL https://cursor.sh/install-agent | bash',
    ].join('\n'),
  };
}

// ── Callback types exposed to main.ts ──

export type OnTurnStart = () => void;
export type OnTextChunk = (text: string) => void;
export type OnThoughtChunk = (text: string) => void;
export interface ToolCallInfo {
  toolCallId: string;
  title: string;
  kind?: string;
  status?: string;
  input?: string;
  output?: string;
  content?: unknown[];
}
export type OnToolCall = (info: ToolCallInfo) => void;
export type OnModeUpdate = (modeId: string) => void;
export interface UsageInfo {
  contextSize: number;
  contextUsed: number;
  costAmount?: number;
  costCurrency?: string;
}
export type OnUsageUpdate = (info: UsageInfo) => void;

export interface AcpCallbacks {
  onTurnStart?: OnTurnStart;
  onTextChunk?: OnTextChunk;
  onThoughtChunk?: OnThoughtChunk;
  onToolCall?: OnToolCall;
  onModeUpdate?: OnModeUpdate;
  onUsageUpdate?: OnUsageUpdate;
}

// ── SeaTalkAcpClient — implements acp.Client ──

class SeaTalkAcpClient implements acp.Client {
  private cb: AcpCallbacks;

  constructor(cb: AcpCallbacks) {
    this.cb = cb;
  }

  updateCallbacks(cb: AcpCallbacks) {
    this.cb = { ...this.cb, ...cb };
  }

  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const allowOpt = params.options.find(
      (o) => o.kind === 'allow_once' || o.kind === 'allow_always',
    );
    const optionId = allowOpt?.optionId ?? params.options[0]?.optionId ?? 'allow';
    const tc = params.toolCall as Record<string, unknown> | undefined;
    const tcId = (tc?.toolCallId as string) ?? '';
    const tcTitle = (tc?.title as string) ?? 'unknown';
    console.log(`[acp] auto-allowed: ${tcTitle} → ${optionId}`);

    // Extract input from tc.content (ACP puts the command/input in content array)
    if (tcId) {
      let inputStr = '';
      const contentArr = tc?.content as Array<{ content?: { text?: string } }> | undefined;
      if (contentArr && contentArr.length > 0) {
        const texts: string[] = [];
        for (const c of contentArr) {
          let t = c?.content?.text;
          if (t) {
            // Strip "Not in allowlist: " prefix from tool content
            t = t.replace(/^Not in allowlist:\s*/i, '');
            texts.push(t);
          }
        }
        inputStr = texts.join('\n');
      }
      if (inputStr) {
        this.cb.onToolCall?.({
          toolCallId: tcId,
          title: tcTitle,
          kind: '',
          status: 'running',
          input: inputStr,
        });
      }
    }
    return { outcome: { outcome: 'selected', optionId } };
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update as Record<string, unknown>;
    const kind = update.sessionUpdate as string;
    switch (kind) {
      case 'agent_message_chunk': {
        const content = update.content as { type: string; text?: string } | undefined;
        if (content?.type === 'text' && content.text) {
          this.cb.onTextChunk?.(content.text);
        }
        break;
      }
      case 'agent_thought_chunk': {
        const content = update.content as { type: string; text?: string } | undefined;
        if (content?.type === 'text' && content.text) {
          this.cb.onThoughtChunk?.(content.text);
        }
        break;
      }
      case 'tool_call': {
        let inputStr = '';
        const ri = update.rawInput ?? update.input;
        if (ri && typeof ri === 'object' && Object.keys(ri as object).length > 0) {
          inputStr = JSON.stringify(ri, null, 2);
        } else if (typeof ri === 'string' && ri) {
          inputStr = ri;
        }
        this.cb.onToolCall?.({
          toolCallId: (update.toolCallId as string) ?? '',
          title: (update.title as string) ?? 'Tool call',
          kind: (update.kind as string) ?? '',
          status: (update.status as string) ?? 'running',
          input: inputStr,
        });
        break;
      }
      case 'tool_call_update': {
        let outputStr = '';
        const ro = update.rawOutput ?? update.output;
        if (ro && typeof ro === 'object') {
          outputStr = JSON.stringify(ro, null, 2);
        } else if (typeof ro === 'string' && ro) {
          outputStr = ro;
        }
        this.cb.onToolCall?.({
          toolCallId: (update.toolCallId as string) ?? '',
          title: (update.title as string) ?? '',
          status: (update.status as string) ?? '',
          output: outputStr,
          content: update.content as unknown[] | undefined,
        });
        break;
      }
      case 'current_mode_update': {
        const modeId = (update as any).currentModeId || (update as any).currentMode || (update as any).id || '';
        if (modeId) this.cb.onModeUpdate?.(modeId);
        break;
      }
      case 'usage_update': {
        const size = (update as any).size as number ?? 0;
        const used = (update as any).used as number ?? 0;
        const cost = (update as any).cost as { amount?: number; currency?: string } | undefined;
        this.cb.onUsageUpdate?.({
          contextSize: size,
          contextUsed: used,
          costAmount: cost?.amount,
          costCurrency: cost?.currency,
        });
        break;
      }
    }
  }

  async readTextFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
    const content = await fs.promises.readFile(params.path, 'utf-8');
    return { content };
  }

  async writeTextFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
    await fs.promises.writeFile(params.path, params.content, 'utf-8');
    return {};
  }

  async extMethod(_method: string, _params: Record<string, unknown>) {
    return {};
  }

  async extNotification(_method: string, _params: Record<string, unknown>) {}
}

// ── MCP config loader — reads ~/.cursor/mcp.json ──

interface CursorMcpEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  url?: string;
}

export function loadMcpServers(log?: (msg: string) => void): acp.McpServer[] {
  const configPath = path.join(os.homedir(), '.cursor', 'mcp.json');
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch {
    log?.('no ~/.cursor/mcp.json found, skipping MCP');
    return [];
  }

  let config: { mcpServers?: Record<string, CursorMcpEntry> };
  try {
    config = JSON.parse(raw);
  } catch (e) {
    log?.(`failed to parse mcp.json: ${(e as Error).message}`);
    return [];
  }

  const entries = config.mcpServers || {};
  const servers: acp.McpServer[] = [];

  for (const [name, entry] of Object.entries(entries)) {
    if (entry.enabled === false) continue;

    if (entry.command) {
      const envArr: acp.EnvVariable[] = [];
      if (entry.env) {
        for (const [k, v] of Object.entries(entry.env)) {
          envArr.push({ name: k, value: v });
        }
      }
      servers.push({
        type: 'stdio',
        name,
        command: entry.command,
        args: entry.args || [],
        env: envArr,
      } as acp.McpServer);
    } else if (entry.url) {
      servers.push({
        type: 'sse',
        name,
        url: entry.url,
      } as acp.McpServer);
    }
  }

  log?.(`loaded ${servers.length} MCP servers from mcp.json`);
  return servers;
}

// ── AgentProcess — manages subprocess + SDK connection ──

export interface ModelInfo {
  modelId: string;
  name: string;
  description?: string;
}

export interface AgentProcess {
  connection: acp.ClientSideConnection;
  sessionId: string;
  proc: ChildProcess;
  client: SeaTalkAcpClient;
  availableModels: ModelInfo[];
  currentModelId: string;
  resumed: boolean;
  supportsImage: boolean;
}

export async function spawnAgent(opts: {
  workspacePath: string;
  callbacks: AcpCallbacks;
  log: (msg: string) => void;
  modelId?: string;
  previousSessionId?: string;
}): Promise<AgentProcess> {
  const { workspacePath, callbacks, log, modelId } = opts;

  const cliCheck = checkAgentCli();
  if (!cliCheck.ok) {
    throw new Error(cliCheck.error!);
  }
  const agentBin = cliCheck.path;

  const useShell = process.platform === 'win32';
  const args = ['--approve-mcps', 'acp'];
  if (modelId) args.push('--model', modelId);
  log(`spawning agent: ${agentBin} ${args.join(' ')} (cwd: ${workspacePath})`);

  const proc = spawn(agentBin, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HOME: os.homedir() },
    shell: useShell,
  });

  let stderrBuf = '';
  proc.stderr?.on('data', (d: Buffer) => {
    const text = d.toString();
    stderrBuf += text;
    for (const l of text.split('\n').filter(Boolean)) {
      console.log(`[acp:stderr] ${l}`);
    }
  });

  const earlyExit = new Promise<never>((_, reject) => {
    proc.on('exit', (code) => {
      reject(new Error(`agent exited early (code=${code}): ${stderrBuf.trim().slice(0, 200)}`));
    });
  });

  if (!proc.stdin || !proc.stdout) {
    proc.kill();
    throw new Error('failed to get agent stdio');
  }

  const client = new SeaTalkAcpClient(callbacks);

  const input = Writable.toWeb(proc.stdin);
  const output = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;
  const stream = acp.ndJsonStream(input, output);
  const connection = new acp.ClientSideConnection(() => client, stream);

  const race = <T>(p: Promise<T>) => Promise.race([p, earlyExit]);

  log('initializing ACP connection...');
  const initResult = await race(connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientInfo: { name: 'seatalk-agent', title: 'SeaTalk Agent', version: '0.2.0' },
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
    },
  }));
  const agentCaps = (initResult as any)?.agentCapabilities || {};
  const supportsImage = !!(agentCaps.promptCapabilities?.image);
  log(`agent capabilities — image: ${supportsImage}`);

  log('authenticating...');
  await race(connection.authenticate({ methodId: 'cursor_login' }));

  const mcpServers = loadMcpServers(log);
  let sessionId = '';
  let resumed = false;

  const prevSessionId = opts.previousSessionId;
  if (prevSessionId) {
    try {
      log(`attempting to load session: ${prevSessionId}...`);
      await race(connection.loadSession({
        sessionId: prevSessionId,
        cwd: workspacePath,
        mcpServers,
      }));
      sessionId = prevSessionId;
      resumed = true;
      log(`session loaded: ${sessionId}`);
    } catch (e) {
      log(`loadSession failed (${(e as Error).message}), trying resumeSession...`);
      try {
        await race(connection.unstable_resumeSession({
          sessionId: prevSessionId,
          cwd: workspacePath,
          mcpServers,
        }));
        sessionId = prevSessionId;
        resumed = true;
        log(`session resumed: ${sessionId}`);
      } catch (e2) {
        log(`resumeSession also failed (${(e2 as Error).message}), creating new session...`);
      }
    }
  }

  if (!resumed) {
    log('creating session...');
    const sessionResult = await race(connection.newSession({
      cwd: workspacePath,
      mcpServers,
    }));
    sessionId = sessionResult.sessionId;
    log(`session created: ${sessionId}`);
  }

  try {
    await race(connection.setSessionMode({ sessionId, modeId: 'ask' }));
  } catch {
    log('set_mode not supported, skipping');
  }

  return { connection, sessionId, proc, client, availableModels: [], currentModelId: '', resumed, supportsImage };
}

export async function listModels(log: (msg: string) => void): Promise<{ models: ModelInfo[]; currentModelId: string }> {
  const cliCheck = checkAgentCli();
  if (!cliCheck.ok) {
    log(`agent CLI not found, skipping model listing`);
    return { models: [], currentModelId: '' };
  }
  return new Promise((resolve) => {
    const p = spawn(cliCheck.path, ['models'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: os.homedir() },
    });

    let out = '';
    p.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    p.stderr?.on('data', () => {});

    p.on('close', () => {
      const models: ModelInfo[] = [];
      let currentModelId = '';
      const lines = out.split('\n');
      for (const line of lines) {
        const m = line.match(/^(\S+)\s+-\s+(.+?)(?:\s+\(([^)]+)\))?$/);
        if (m) {
          models.push({ modelId: m[1], name: m[2].trim() });
          const flags = m[3] || '';
          if (flags.includes('current')) currentModelId = m[1];
          if (flags.includes('default') && !currentModelId) currentModelId = m[1];
        }
      }
      log(`listed ${models.length} models (current: ${currentModelId})`);
      resolve({ models, currentModelId });
    });

    setTimeout(() => { try { p.kill(); } catch {} }, 10_000);
  });
}

export function killAgent(proc: ChildProcess) {
  if (!proc.killed) {
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 5_000).unref();
  }
}
