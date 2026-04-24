import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import type { AcpCallbacks, AgentApprovalDecision, AgentConnection, AgentProcess, AgentPromptUsage, AgentRuntimeConfig, ModelInfo } from './acp.js';

type JsonRpcId = number;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

interface PendingTurn {
  resolve: (value: { stopReason: string; usage?: AgentPromptUsage | null }) => void;
  reject: (error: Error) => void;
}

interface PendingApproval {
  id: JsonRpcId;
  method: 'item/commandExecution/requestApproval' | 'item/fileChange/requestApproval' | 'item/permissions/requestApproval';
}

interface TurnPlanStep {
  step: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface ThreadUsage {
  total?: {
    totalTokens?: number;
    modelContextWindow?: number | null;
  };
  last?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedInputTokens?: number;
    reasoningOutputTokens?: number;
  };
  modelContextWindow?: number | null;
}

interface CodexRuntimeState {
  callbacks: AcpCallbacks;
  log: (msg: string) => void;
  proc: ChildProcess;
  requestSeq: number;
  pendingRequests: Map<JsonRpcId, PendingRequest>;
  pendingTurns: Map<string, PendingTurn>;
  pendingApprovals: Map<string, PendingApproval>;
  completedTurns: Map<string, { stopReason: string; usage?: AgentPromptUsage | null }>;
  usageByTurn: Map<string, ThreadUsage>;
  itemCache: Map<string, { title: string; kind: string }>;
  stdoutBuffer: string;
  stderrBuffer: string;
  currentThreadId: string;
  currentTurnId: string;
  currentModelId: string;
  currentMode: 'ask' | 'agent' | 'plan';
  runtimeConfig: AgentRuntimeConfig;
}

export function checkCodexCli(): { ok: boolean; path: string; error?: string } {
  const probe = spawnSync('codex', ['--version'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: os.homedir() },
  });

  if (probe.status === 0) {
    return { ok: true, path: 'codex' };
  }

  return {
    ok: false,
    path: 'codex',
    error: [
      'Codex CLI 未找到，无法启用 app-server 模式。',
      '',
      '安装方式:',
      '  npm install -g @openai/codex',
      '',
      '或确认 `codex --version` 在当前终端可用。',
    ].join('\n'),
  };
}

function jsonRpcError(message: string): { code: number; message: string } {
  return { code: -32000, message };
}

function toPromptUsage(usage?: ThreadUsage): AgentPromptUsage | null {
  if (!usage?.last) return null;
  return {
    inputTokens: usage.last.inputTokens || 0,
    outputTokens: usage.last.outputTokens || 0,
    totalTokens: usage.last.totalTokens || 0,
    cachedReadTokens: usage.last.cachedInputTokens || 0,
    thoughtTokens: usage.last.reasoningOutputTokens || 0,
  };
}

function turnStopReason(status: string): string {
  switch (status) {
    case 'interrupted':
      return 'cancelled';
    case 'failed':
      return 'error';
    case 'completed':
    default:
      return 'end_turn';
  }
}

function itemTitle(item: any): { title: string; kind: string } | null {
  if (!item || typeof item !== 'object') return null;
  switch (item.type) {
    case 'commandExecution':
      return { title: item.command || 'Command', kind: 'command' };
    case 'mcpToolCall':
      return {
        title: item.server && item.tool ? `${item.server}: ${item.tool}` : item.tool || 'MCP Tool',
        kind: 'mcp',
      };
    case 'fileChange':
      return { title: 'Apply Patch', kind: 'file' };
    case 'dynamicToolCall':
      return { title: item.tool || 'Tool', kind: 'tool' };
    default:
      return null;
  }
}

function normalizedPlanStatus(status: string | undefined): 'pending' | 'in_progress' | 'completed' {
  if (status === 'inProgress') return 'in_progress';
  if (status === 'completed') return 'completed';
  return 'pending';
}

function modeEffort(mode: 'ask' | 'agent' | 'plan'): 'low' | 'medium' | 'high' {
  if (mode === 'plan') return 'high';
  if (mode === 'agent') return 'medium';
  return 'low';
}

function currentApprovalPolicy(runtimeConfig: AgentRuntimeConfig): 'untrusted' | 'on-request' | 'never' | undefined {
  return runtimeConfig.approvalPolicy || undefined;
}

function currentThreadSandbox(runtimeConfig: AgentRuntimeConfig): 'read-only' | 'workspace-write' | 'danger-full-access' | undefined {
  return runtimeConfig.sandbox || undefined;
}

function currentThreadConfig(runtimeConfig: AgentRuntimeConfig): Record<string, unknown> | undefined {
  if (!runtimeConfig.webSearch) return undefined;
  return { web_search: runtimeConfig.webSearch };
}

function approvalDecision(_method: PendingApproval['method'], decision: AgentApprovalDecision): string {
  if (decision === 'acceptForSession') return 'acceptForSession';
  if (decision === 'decline') return 'decline';
  if (decision === 'cancel') return 'cancel';
  return 'accept';
}

function sendJson(state: CodexRuntimeState, payload: Record<string, unknown>) {
  state.proc.stdin?.write(`${JSON.stringify(payload)}\n`);
}

function sendRequest(state: CodexRuntimeState, method: string, params: unknown): Promise<any> {
  const id = ++state.requestSeq;
  return new Promise((resolve, reject) => {
    state.pendingRequests.set(id, { resolve, reject });
    sendJson(state, { jsonrpc: '2.0', id, method, params });
  });
}

function sendNotification(state: CodexRuntimeState, method: string, params?: unknown) {
  const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
  if (params !== undefined) payload.params = params;
  sendJson(state, payload);
}

function sendResponse(state: CodexRuntimeState, id: JsonRpcId, result?: unknown, error?: { code: number; message: string }) {
  const payload: Record<string, unknown> = { jsonrpc: '2.0', id };
  if (error) payload.error = error;
  else payload.result = result ?? {};
  sendJson(state, payload);
}

function handleTurnCompleted(state: CodexRuntimeState, params: any) {
  const turn = params?.turn;
  const turnId = turn?.id as string | undefined;
  if (!turnId) return;

  const result = {
    stopReason: turnStopReason(turn.status),
    usage: toPromptUsage(state.usageByTurn.get(turnId)),
  };

  state.currentTurnId = '';
  const waiter = state.pendingTurns.get(turnId);
  if (waiter) {
    state.pendingTurns.delete(turnId);
    waiter.resolve(result);
    return;
  }

  state.completedTurns.set(turnId, result);
}

function handleServerRequest(state: CodexRuntimeState, msg: any) {
  const method = msg?.method as string;
  const id = msg?.id as JsonRpcId;
  if (typeof id !== 'number' || !method) return;

  switch (method) {
    case 'item/commandExecution/requestApproval': {
      const params = msg?.params || {};
      const requestId = `${id}`;
      const itemId = (params?.itemId as string | undefined) || '';
      const meta = (itemId && state.itemCache.get(itemId)) || { title: 'Command', kind: 'command' };
      const command = typeof params?.command === 'string' ? params.command : '';
      const preview = command || (Array.isArray(params?.commandActions) ? JSON.stringify(params.commandActions, null, 2) : '');
      state.pendingApprovals.set(requestId, {
        id,
        method: 'item/commandExecution/requestApproval',
      });
      state.callbacks.onApprovalRequest?.({
        requestId,
        kind: 'command',
        title: meta.title || 'Command',
        command,
        cwd: typeof params?.cwd === 'string' ? params.cwd : '',
        reason: typeof params?.reason === 'string' ? params.reason : '',
        preview,
      });
      return;
    }
    case 'item/fileChange/requestApproval': {
      const params = msg?.params || {};
      const requestId = `${id}`;
      const itemId = (params?.itemId as string | undefined) || '';
      const meta = (itemId && state.itemCache.get(itemId)) || { title: 'Apply Patch', kind: 'file' };
      state.pendingApprovals.set(requestId, {
        id,
        method: 'item/fileChange/requestApproval',
      });
      state.callbacks.onApprovalRequest?.({
        requestId,
        kind: 'file',
        title: meta.title || 'Apply Patch',
        reason: typeof params?.reason === 'string' ? params.reason : '',
        preview: typeof params?.grantRoot === 'string' ? params.grantRoot : '',
      });
      return;
    }
    case 'item/permissions/requestApproval': {
      const params = msg?.params || {};
      const requestId = `${id}`;
      const itemId = (params?.itemId as string | undefined) || '';
      const meta = (itemId && state.itemCache.get(itemId)) || { title: 'Additional permissions', kind: 'permissions' };
      const fileSystem = params?.permissions?.fileSystem || {};
      const network = params?.permissions?.network || {};
      const previewParts: string[] = [];
      if (Array.isArray(fileSystem?.read) && fileSystem.read.length) previewParts.push(`read: ${fileSystem.read.join(', ')}`);
      if (Array.isArray(fileSystem?.write) && fileSystem.write.length) previewParts.push(`write: ${fileSystem.write.join(', ')}`);
      if (network?.enabled) previewParts.push('network: enabled');
      state.pendingApprovals.set(requestId, {
        id,
        method: 'item/permissions/requestApproval',
      });
      state.callbacks.onApprovalRequest?.({
        requestId,
        kind: 'permissions',
        title: meta.title || 'Additional permissions',
        reason: typeof params?.reason === 'string' ? params.reason : '',
        preview: previewParts.join('\n'),
      });
      return;
    }
    default:
      sendResponse(state, id, undefined, jsonRpcError(`unsupported server request: ${method}`));
  }
}

function handleNotification(state: CodexRuntimeState, msg: any) {
  const method = msg?.method as string;
  const params = msg?.params;

  switch (method) {
    case 'turn/started':
      state.currentTurnId = params?.turn?.id || state.currentTurnId;
      return;
    case 'turn/completed':
      handleTurnCompleted(state, params);
      return;
    case 'thread/tokenUsage/updated': {
      const turnId = params?.turnId as string | undefined;
      if (!turnId) return;
      const usage = params?.tokenUsage as ThreadUsage | undefined;
      if (usage) {
        state.usageByTurn.set(turnId, usage);
        state.callbacks.onUsageUpdate?.({
          contextSize: usage.modelContextWindow || usage.total?.modelContextWindow || 0,
          contextUsed: usage.total?.totalTokens || 0,
        });
      }
      return;
    }
    case 'item/agentMessage/delta':
      if (typeof params?.delta === 'string') state.callbacks.onTextChunk?.(params.delta);
      return;
    case 'item/reasoning/textDelta':
    case 'item/reasoning/summaryTextDelta':
      if (typeof params?.delta === 'string') state.callbacks.onThoughtChunk?.(params.delta);
      return;
    case 'turn/plan/updated': {
      const plan = Array.isArray(params?.plan) ? params.plan : [];
      const steps: TurnPlanStep[] = plan
        .filter((item: any) => item && typeof item.step === 'string')
        .map((item: any) => ({
          step: item.step,
          status: normalizedPlanStatus(item.status),
        }));
      state.callbacks.onPlanUpdate?.({
        explanation: typeof params?.explanation === 'string' ? params.explanation : undefined,
        steps,
      });
      return;
    }
    case 'item/plan/delta':
      if (typeof params?.delta === 'string') {
        state.callbacks.onPlanUpdate?.({ explanation: params.delta, steps: [] });
      }
      return;
    case 'item/started':
    case 'item/completed': {
      const item = params?.item;
      const meta = itemTitle(item);
      if (!meta) return;
      state.itemCache.set(item.id, meta);

      if (method === 'item/started') {
        state.callbacks.onToolCall?.({
          toolCallId: item.id,
          title: meta.title,
          kind: meta.kind,
          status: 'running',
          input: item.command || (item.arguments ? JSON.stringify(item.arguments, null, 2) : ''),
        });
      } else {
        let output = '';
        if (item.type === 'commandExecution') output = item.aggregatedOutput || '';
        if (item.type === 'mcpToolCall') {
          const result = item.result;
          if (result?.structuredContent) output = JSON.stringify(result.structuredContent, null, 2);
          else if (result?.content) output = JSON.stringify(result.content, null, 2);
          else if (item.error) output = JSON.stringify(item.error, null, 2);
        }
        if (item.type === 'fileChange') output = JSON.stringify(item.changes || [], null, 2);
        if (item.type === 'dynamicToolCall') output = JSON.stringify(item.contentItems || [], null, 2);
        state.callbacks.onToolCall?.({
          toolCallId: item.id,
          title: meta.title,
          kind: meta.kind,
          status: 'completed',
          output,
        });
      }
      return;
    }
    case 'item/commandExecution/outputDelta':
    case 'item/fileChange/outputDelta': {
      const itemId = params?.itemId as string | undefined;
      if (!itemId || typeof params?.delta !== 'string') return;
      const meta = state.itemCache.get(itemId) || { title: 'Tool', kind: 'tool' };
      state.callbacks.onToolCall?.({
        toolCallId: itemId,
        title: meta.title,
        kind: meta.kind,
        status: 'running',
        output: params.delta,
      });
      return;
    }
    case 'item/mcpToolCall/progress': {
      const itemId = params?.itemId as string | undefined;
      const message = params?.message as string | undefined;
      if (!itemId || !message) return;
      const meta = state.itemCache.get(itemId) || { title: 'MCP Tool', kind: 'mcp' };
      state.callbacks.onToolCall?.({
        toolCallId: itemId,
        title: meta.title,
        kind: meta.kind,
        status: 'running',
        output: message,
      });
      return;
    }
    case 'mcpServer/startupStatus/updated': {
      const name = String(params?.name || 'unknown');
      const status = String(params?.status || 'unknown');
      const message = typeof params?.message === 'string'
        ? params.message
        : typeof params?.error === 'string'
          ? params.error
          : undefined;
      state.log(`[codex-mcp] ${name} => ${status}${message ? ` (${message})` : ''}`);
      state.callbacks.onMcpStartupStatus?.({ name, status, message });
      return;
    }
    case 'error':
      state.log(`app-server error: ${params?.message || 'unknown error'}`);
      return;
    default:
      return;
  }
}

function handleMessage(state: CodexRuntimeState, line: string) {
  let msg: any;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    state.log(`failed to parse app-server JSON: ${(e as Error).message}`);
    return;
  }

  if (msg && typeof msg.id === 'number' && Object.prototype.hasOwnProperty.call(msg, 'result')) {
    const pending = state.pendingRequests.get(msg.id);
    if (!pending) return;
    state.pendingRequests.delete(msg.id);
    pending.resolve(msg.result);
    return;
  }

  if (msg && typeof msg.id === 'number' && msg.error) {
    const pending = state.pendingRequests.get(msg.id);
    if (!pending) return;
    state.pendingRequests.delete(msg.id);
    pending.reject(new Error(msg.error.message || 'unknown JSON-RPC error'));
    return;
  }

  if (msg && typeof msg.id === 'number' && typeof msg.method === 'string') {
    handleServerRequest(state, msg);
    return;
  }

  if (msg && typeof msg.method === 'string') {
    handleNotification(state, msg);
  }
}

class CodexConnectionAdapter implements AgentConnection {
  constructor(private readonly state: CodexRuntimeState) {}

  async prompt(params: { sessionId: string; prompt: Array<{ type: string; text?: string; path?: string; url?: string }> }) {
    const promptParts = params.prompt.slice();
    if (this.state.currentMode === 'plan') {
      promptParts.unshift({
        type: 'text',
        text: '[Collaboration mode: plan]\nFocus on investigation and planning first. Keep the plan current, make the next steps explicit, and avoid rushing into edits before the approach is clear.',
      });
    }

    const input = promptParts.map((part) => {
      if (part.type === 'text') {
        return {
          type: 'text',
          text: part.text || '',
          text_elements: [],
        };
      }
      if (part.type === 'localImage' && part.path) {
        return { type: 'localImage', path: part.path };
      }
      if (part.type === 'image' && part.url) {
        return { type: 'image', url: part.url };
      }
      return {
        type: 'text',
        text: part.text || '',
        text_elements: [],
      };
    });

    const res = await sendRequest(this.state, 'turn/start', {
      threadId: params.sessionId,
      input,
      model: this.state.currentModelId || undefined,
      effort: modeEffort(this.state.currentMode),
    });

    const turnId = res?.turn?.id as string | undefined;
    if (!turnId) {
      throw new Error('turn/start did not return a turn id');
    }

    this.state.currentTurnId = turnId;

    const completed = this.state.completedTurns.get(turnId);
    if (completed) {
      this.state.completedTurns.delete(turnId);
      return completed;
    }

    return new Promise<{ stopReason: string; usage?: AgentPromptUsage | null }>((resolve, reject) => {
      this.state.pendingTurns.set(turnId, { resolve, reject });
    });
  }

  async cancel(_params: { sessionId: string }) {
    if (!this.state.currentThreadId || !this.state.currentTurnId) return;
    await sendRequest(this.state, 'turn/interrupt', {
      threadId: this.state.currentThreadId,
      turnId: this.state.currentTurnId,
    });
  }

  async newSession(params: { cwd: string }) {
    const res = await sendRequest(this.state, 'thread/start', {
      cwd: params.cwd,
      approvalPolicy: currentApprovalPolicy(this.state.runtimeConfig),
      config: currentThreadConfig(this.state.runtimeConfig),
      model: this.state.currentModelId || undefined,
      sandbox: currentThreadSandbox(this.state.runtimeConfig),
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    });

    const threadId = res?.thread?.id as string | undefined;
    if (!threadId) throw new Error('thread/start did not return a thread id');

    this.state.currentThreadId = threadId;
    this.state.currentTurnId = '';
    this.state.currentModelId = (res?.model as string) || this.state.currentModelId;
    this.state.callbacks.onModeUpdate?.(this.state.currentMode);

    return {
      sessionId: threadId,
      models: {
        currentModelId: this.state.currentModelId,
      },
    };
  }

  async setSessionMode(params: { sessionId: string; modeId: string }) {
    if (params.sessionId !== this.state.currentThreadId) return;
    this.state.currentMode = params.modeId === 'plan'
      ? 'plan'
      : params.modeId === 'agent'
        ? 'agent'
        : 'ask';
    this.state.callbacks.onModeUpdate?.(this.state.currentMode);
  }

  async unstable_setSessionModel(params: { sessionId: string; modelId: string }) {
    if (params.sessionId !== this.state.currentThreadId) return;
    this.state.currentModelId = params.modelId;
  }

  async resolveApproval(params: { requestId: string; decision: AgentApprovalDecision }) {
    const pending = this.state.pendingApprovals.get(params.requestId);
    if (!pending) return;
    this.state.pendingApprovals.delete(params.requestId);
    sendResponse(this.state, pending.id, {
      decision: approvalDecision(pending.method, params.decision),
    });
  }
}

async function initializeCodexState(state: CodexRuntimeState) {
  await sendRequest(state, 'initialize', {
    clientInfo: {
      name: 'seatalk-agent',
      version: '0.2.0',
    },
    capabilities: {
      experimentalApi: true,
    },
  });
  sendNotification(state, 'initialized');
}

export async function listCodexModels(log: (msg: string) => void): Promise<{ models: ModelInfo[]; currentModelId: string }> {
  const cliCheck = checkCodexCli();
  if (!cliCheck.ok) {
    log('codex CLI not found, skipping model listing');
    return { models: [], currentModelId: '' };
  }

  const proc = spawn(cliCheck.path, ['app-server'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HOME: os.homedir() },
  });

  const state: CodexRuntimeState = {
    callbacks: {},
    log,
    proc,
    requestSeq: 0,
    pendingRequests: new Map(),
    pendingTurns: new Map(),
    pendingApprovals: new Map(),
    completedTurns: new Map(),
    usageByTurn: new Map(),
    itemCache: new Map(),
    stdoutBuffer: '',
    stderrBuffer: '',
    currentThreadId: '',
    currentTurnId: '',
    currentModelId: '',
    currentMode: 'ask',
    runtimeConfig: {},
  };

  proc.stdout?.on('data', (chunk: Buffer) => {
    state.stdoutBuffer += chunk.toString('utf-8');
    let idx = state.stdoutBuffer.indexOf('\n');
    while (idx >= 0) {
      const line = state.stdoutBuffer.slice(0, idx).trim();
      state.stdoutBuffer = state.stdoutBuffer.slice(idx + 1);
      if (line) handleMessage(state, line);
      idx = state.stdoutBuffer.indexOf('\n');
    }
  });
  proc.stderr?.on('data', (chunk: Buffer) => {
    state.stderrBuffer += chunk.toString('utf-8');
  });

  try {
    await initializeCodexState(state);
    const collected: ModelInfo[] = [];
    let cursor: string | null = null;
    let currentModelId = '';

    do {
      const res = await sendRequest(state, 'model/list', {
        cursor,
        includeHidden: false,
      });
      const data = Array.isArray(res?.data) ? res.data : [];
      for (const model of data) {
        collected.push({
          modelId: model.id,
          name: model.displayName || model.model || model.id,
          description: model.description || '',
        });
        if (model.isDefault && !currentModelId) currentModelId = model.id;
      }
      cursor = (res?.nextCursor as string | null) || null;
    } while (cursor);

    return { models: collected, currentModelId };
  } finally {
    if (!proc.killed) proc.kill('SIGTERM');
  }
}

export async function spawnCodexAgent(opts: {
  workspacePath: string;
  callbacks: AcpCallbacks;
  log: (msg: string) => void;
  modelId?: string;
  previousSessionId?: string;
  sessionMode?: 'ask' | 'agent' | 'plan';
  runtimeConfig?: AgentRuntimeConfig;
}): Promise<AgentProcess> {
  const cliCheck = checkCodexCli();
  if (!cliCheck.ok) throw new Error(cliCheck.error!);

  const proc = spawn(cliCheck.path, ['app-server'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HOME: os.homedir() },
  });

  const state: CodexRuntimeState = {
    callbacks: opts.callbacks,
    log: (msg: string) => opts.log(`[codex] ${msg}`),
    proc,
    requestSeq: 0,
    pendingRequests: new Map(),
    pendingTurns: new Map(),
    pendingApprovals: new Map(),
    completedTurns: new Map(),
    usageByTurn: new Map(),
    itemCache: new Map(),
    stdoutBuffer: '',
    stderrBuffer: '',
    currentThreadId: '',
    currentTurnId: '',
    currentModelId: opts.modelId || '',
    currentMode: opts.sessionMode || 'ask',
    runtimeConfig: opts.runtimeConfig || {},
  };

  proc.stdout?.on('data', (chunk: Buffer) => {
    state.stdoutBuffer += chunk.toString('utf-8');
    let idx = state.stdoutBuffer.indexOf('\n');
    while (idx >= 0) {
      const line = state.stdoutBuffer.slice(0, idx).trim();
      state.stdoutBuffer = state.stdoutBuffer.slice(idx + 1);
      if (line) handleMessage(state, line);
      idx = state.stdoutBuffer.indexOf('\n');
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8');
    state.stderrBuffer += text;
    for (const line of text.split('\n').filter(Boolean)) {
      opts.log(`[codex:stderr] ${line}`);
    }
  });

  const earlyExit = new Promise<never>((_, reject) => {
    proc.on('exit', (code) => {
      reject(new Error(`codex app-server exited early (code=${code}): ${state.stderrBuffer.trim().slice(0, 200)}`));
    });
  });
  const race = <T>(p: Promise<T>) => Promise.race([p, earlyExit]);

  await race(initializeCodexState(state));

  let resumed = false;
  let sessionId = '';
  if (opts.previousSessionId) {
    try {
      const res = await race(sendRequest(state, 'thread/resume', {
        threadId: opts.previousSessionId,
        cwd: opts.workspacePath,
        model: opts.modelId || undefined,
        approvalPolicy: currentApprovalPolicy(state.runtimeConfig),
        config: currentThreadConfig(state.runtimeConfig),
        sandbox: currentThreadSandbox(state.runtimeConfig),
        persistExtendedHistory: true,
      }));
      sessionId = res?.thread?.id as string;
      state.currentThreadId = sessionId;
      state.currentModelId = (res?.model as string) || state.currentModelId;
      resumed = !!sessionId;
    } catch (e) {
      opts.log(`[codex] thread/resume failed: ${(e as Error).message}`);
    }
  }

  if (!resumed) {
    const res = await race(sendRequest(state, 'thread/start', {
      cwd: opts.workspacePath,
      approvalPolicy: currentApprovalPolicy(state.runtimeConfig),
      config: currentThreadConfig(state.runtimeConfig),
      model: opts.modelId || undefined,
      sandbox: currentThreadSandbox(state.runtimeConfig),
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    }));
    sessionId = res?.thread?.id as string;
    if (!sessionId) throw new Error('thread/start did not return a thread id');
    state.currentThreadId = sessionId;
    state.currentModelId = (res?.model as string) || state.currentModelId;
  }

  const models = await race(listCodexModels((msg) => opts.log(`[codex-models] ${msg}`)).catch(() => ({ models: [], currentModelId: state.currentModelId })));

  return {
    backend: 'codex-app-server',
    connection: new CodexConnectionAdapter(state),
    sessionId,
    proc,
    client: null,
    availableModels: models.models,
    currentModelId: state.currentModelId || models.currentModelId,
    resumed,
    supportsImage: true,
  };
}
