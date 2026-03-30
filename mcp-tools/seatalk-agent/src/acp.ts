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

export interface AcpCallbacks {
  onTurnStart?: OnTurnStart;
  onTextChunk?: OnTextChunk;
  onThoughtChunk?: OnThoughtChunk;
  onToolCall?: OnToolCall;
  onModeUpdate?: OnModeUpdate;
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
    console.log(`[acp] auto-allowed: ${params.toolCall?.title ?? 'unknown'} → ${optionId}`);
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
        this.cb.onToolCall?.({
          toolCallId: (update.toolCallId as string) ?? '',
          title: (update.title as string) ?? 'Tool call',
          kind: (update.kind as string) ?? '',
          status: (update.status as string) ?? 'running',
          input: (update.input as string) ?? '',
        });
        break;
      }
      case 'tool_call_update': {
        this.cb.onToolCall?.({
          toolCallId: (update.toolCallId as string) ?? '',
          title: (update.title as string) ?? '',
          status: (update.status as string) ?? '',
          output: (update.output as string) ?? '',
          content: update.content as unknown[] | undefined,
        });
        break;
      }
      case 'current_mode_update': {
        const modeId = (update as any).currentModeId || (update as any).currentMode || (update as any).id || '';
        if (modeId) this.cb.onModeUpdate?.(modeId);
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
}

export async function spawnAgent(opts: {
  workspacePath: string;
  callbacks: AcpCallbacks;
  log: (msg: string) => void;
  modelId?: string;
}): Promise<AgentProcess> {
  const { workspacePath, callbacks, log, modelId } = opts;

  const useShell = process.platform === 'win32';
  const args = ['--approve-mcps', 'acp'];
  if (modelId) args.push('--model', modelId);
  log(`spawning agent: ${AGENT_BIN} ${args.join(' ')} (cwd: ${workspacePath})`);

  const proc = spawn(AGENT_BIN, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HOME: os.homedir() },
    shell: useShell,
  });

  proc.stderr?.on('data', (d: Buffer) => {
    for (const l of d.toString().split('\n').filter(Boolean)) {
      console.log(`[acp:stderr] ${l}`);
    }
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

  log('initializing ACP connection...');
  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientInfo: { name: 'seatalk-agent', title: 'SeaTalk Agent', version: '0.2.0' },
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
    },
  });

  log('authenticating...');
  await connection.authenticate({ methodId: 'cursor_login' });

  log('creating session...');
  const sessionResult = await connection.newSession({
    cwd: workspacePath,
    mcpServers: [],
  });
  const sessionId = sessionResult.sessionId;
  log(`session created: ${sessionId}`);

  try {
    await connection.setSessionMode({ sessionId, modeId: 'ask' });
  } catch {
    log('set_mode not supported, skipping');
  }

  return { connection, sessionId, proc, client, availableModels: [], currentModelId: '' };
}

export async function listModels(log: (msg: string) => void): Promise<{ models: ModelInfo[]; currentModelId: string }> {
  return new Promise((resolve) => {
    const p = spawn(AGENT_BIN, ['models'], {
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
        const m = line.match(/^(\S+)\s+-\s+(.+?)(?:\s+\((current|default)\))?$/);
        if (m) {
          models.push({ modelId: m[1], name: m[2].trim() });
          if (m[3] === 'current') currentModelId = m[1];
          if (m[3] === 'default' && !currentModelId) currentModelId = m[1];
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
