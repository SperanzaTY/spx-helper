import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  loadMcpServerConfigs,
  mergeMcpServerConfigs,
  parseCodexMcpConfigText,
  type LoadedMcpServerConfig,
} from './acp.js';

export { mergeMcpServerConfigs, parseCodexMcpConfigText };

export type McpServerStatus = 'Loaded' | 'Smoke OK' | 'Needs Attention' | 'Disabled' | 'Unknown';
export type McpSmokeStatus = 'not_configured' | 'running' | 'passed' | 'failed' | 'skipped';

export interface McpToolStatus {
  name: string;
  description: string;
  inputSchema?: unknown;
  visible: boolean;
}

export interface McpServerStatusEntry {
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'sse' | 'http';
  source: string;
  sourcePath: string;
  status: McpServerStatus;
  commandSummary: string;
  toolCount: number;
  tools: McpToolStatus[];
  smokeStatus: McpSmokeStatus;
  lastChecked: number;
  error?: string;
  startupStatus?: string;
  startupMessage?: string;
}

export interface McpStatusSnapshot {
  generatedAt: number;
  configPath: string;
  servers: McpServerStatusEntry[];
  errors: string[];
}

export interface McpStartupSignal {
  name: string;
  status: string;
  message?: string;
  updatedAt: number;
}

export interface McpSmokeResult {
  serverName: string;
  status: McpSmokeStatus;
  message: string;
  durationMs: number;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

interface SmokeDefinition {
  toolName: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

const SECRET_KEY_RE = /(TOKEN|PASSWORD|SECRET|KEY|COOKIE|AUTH)/i;

const SAFE_SMOKE_TESTS: Record<string, SmokeDefinition> = {
  'presto-query': {
    toolName: 'query_presto',
    args: {
      sql: 'SELECT 1 AS ok',
      max_rows: 5,
      max_wait_seconds: 30,
      request_timeout_seconds: 20,
      idc: 'sg',
    },
    timeoutMs: 45_000,
  },
  'datastudio-mcp': {
    toolName: 'search_datastudio_assets',
    args: {
      keyword: 'fleet_order',
      project_code: 'spx_datamart',
      path: '//Manual Tasks/',
      max_results: 1,
      search_content: false,
      max_assets_to_scan: 50,
    },
    timeoutMs: 20_000,
  },
};

export function redactEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env || {})) {
    out[key] = SECRET_KEY_RE.test(key) ? '<redacted>' : value;
  }
  return out;
}

function commandSummary(entry: LoadedMcpServerConfig): string {
  if (entry.transport === 'stdio') {
    const args = entry.args.length ? ` ${entry.args.join(' ')}` : '';
    const cwd = entry.cwd ? ` (cwd: ${entry.cwd})` : '';
    return `${entry.command || '(missing command)'}${args}${cwd}`;
  }
  return entry.url || '(missing url)';
}

function shortError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err || 'unknown error');
  return text.replace(/\s+/g, ' ').slice(0, 500);
}

function resolveServerCwd(entry: LoadedMcpServerConfig): string {
  if (!entry.cwd) return process.cwd();
  if (path.isAbsolute(entry.cwd)) return entry.cwd;
  return process.cwd();
}

class StdioMcpProbeClient {
  private seq = 0;
  private buffer = '';
  private pending = new Map<number, PendingRequest>();

  constructor(private readonly proc: ChildProcessWithoutNullStreams) {
    proc.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');
      let idx = this.buffer.indexOf('\n');
      while (idx >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (line) this.handleLine(line);
        idx = this.buffer.indexOf('\n');
      }
    });
  }

  private handleLine(line: string) {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof msg.id !== 'number') return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else pending.resolve(msg.result);
  }

  request(method: string, params: unknown, timeoutMs: number): Promise<any> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method: string, params?: unknown) {
    const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (params !== undefined) payload.params = params;
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

async function withStdioClient<T>(
  entry: LoadedMcpServerConfig,
  clientName: string,
  timeoutMs: number,
  fn: (client: StdioMcpProbeClient, race: <R>(promise: Promise<R>) => Promise<R>) => Promise<T>,
): Promise<T> {
  if (!entry.command) throw new Error('missing command');
  const proc = spawn(entry.command, entry.args, {
    cwd: resolveServerCwd(entry),
    env: { ...process.env, ...entry.env, HOME: os.homedir() },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  let stderr = '';
  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf-8');
  });

  const client = new StdioMcpProbeClient(proc);
  const earlyExit = new Promise<never>((_, reject) => {
    proc.once('exit', (code) => {
      reject(new Error(`process exited early (${code}): ${stderr.trim().slice(0, 300)}`));
    });
  });
  const race = <R>(promise: Promise<R>) => Promise.race([promise, earlyExit]);

  try {
    await race(client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: clientName, version: '1.0.0' },
    }, timeoutMs));
    client.notify('notifications/initialized');
    return await fn(client, race);
  } finally {
    try { proc.kill('SIGTERM'); } catch {}
    setTimeout(() => {
      try {
        if (!proc.killed) proc.kill('SIGKILL');
      } catch {}
    }, 1000).unref();
  }
}

async function probeStdioTools(entry: LoadedMcpServerConfig, timeoutMs: number): Promise<McpToolStatus[]> {
  return withStdioClient(entry, 'seatalk-agent-mcp-status', timeoutMs, async (client, race) => {
    const result = await race(client.request('tools/list', {}, timeoutMs));
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.map((tool: any) => ({
      name: String(tool?.name || ''),
      description: String(tool?.description || ''),
      inputSchema: tool?.inputSchema,
      visible: true,
    })).filter((tool: McpToolStatus) => !!tool.name);
  });
}

async function callStdioTool(
  entry: LoadedMcpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<any> {
  return withStdioClient(entry, 'seatalk-agent-mcp-smoke', timeoutMs, async (client, race) => {
    return race(client.request('tools/call', {
      name: toolName,
      arguments: args,
    }, timeoutMs));
  });
}

export async function collectMcpStatus(opts: {
  log?: (msg: string) => void;
  startupSignals?: Map<string, McpStartupSignal>;
  timeoutMs?: number;
} = {}): Promise<McpStatusSnapshot> {
  const timeoutMs = opts.timeoutMs || 8000;
  const loaded = loadMcpServerConfigs(opts.log, { source: 'all' });

  const servers = await Promise.all(loaded.servers.map(async (entry): Promise<McpServerStatusEntry> => {
    const startup = opts.startupSignals?.get(entry.name);
    const base = {
      name: entry.name,
      enabled: entry.enabled,
      transport: entry.transport,
      source: entry.source,
      sourcePath: entry.sourcePath,
      commandSummary: commandSummary(entry),
      smokeStatus: 'not_configured' as McpSmokeStatus,
      lastChecked: Date.now(),
      startupStatus: startup?.status,
      startupMessage: startup?.message,
    };

    if (!entry.enabled) {
      return { ...base, status: 'Disabled', toolCount: 0, tools: [] };
    }

    try {
      let tools: McpToolStatus[] = [];
      if (entry.transport === 'stdio') {
        tools = await probeStdioTools(entry, timeoutMs);
      } else {
        throw new Error(`${entry.transport} probing is not implemented in v1`);
      }
      return {
        ...base,
        status: tools.length ? 'Loaded' : 'Unknown',
        toolCount: tools.length,
        tools,
      };
    } catch (error) {
      return {
        ...base,
        status: 'Needs Attention',
        toolCount: 0,
        tools: [],
        error: shortError(error),
      };
    }
  }));

  return {
    generatedAt: Date.now(),
    configPath: loaded.configPath,
    servers,
    errors: loaded.errors,
  };
}

export function collectMcpConfigSnapshot(opts: {
  log?: (msg: string) => void;
  startupSignals?: Map<string, McpStartupSignal>;
} = {}): McpStatusSnapshot {
  const loaded = loadMcpServerConfigs(opts.log, { source: 'all' });
  return {
    generatedAt: Date.now(),
    configPath: loaded.configPath,
    errors: loaded.errors,
    servers: loaded.servers.map((entry) => {
      const startup = opts.startupSignals?.get(entry.name);
      const isReady = startup?.status === 'ready';
      return {
        name: entry.name,
        enabled: entry.enabled,
        transport: entry.transport,
        source: entry.source,
        sourcePath: entry.sourcePath,
        commandSummary: commandSummary(entry),
        status: !entry.enabled ? 'Disabled' : isReady ? 'Loaded' : 'Unknown',
        toolCount: 0,
        tools: [],
        smokeStatus: 'not_configured',
        lastChecked: Date.now(),
        startupStatus: startup?.status,
        startupMessage: startup?.message,
      };
    }),
  };
}

export async function runSafeMcpSmokeTests(opts: {
  serverName?: string;
  log?: (msg: string) => void;
} = {}): Promise<McpSmokeResult[]> {
  const loaded = loadMcpServerConfigs(opts.log, { source: 'all' });
  const results: McpSmokeResult[] = [];

  for (const entry of loaded.servers) {
    if (opts.serverName && entry.name !== opts.serverName) continue;
    if (!entry.enabled) {
      results.push({ serverName: entry.name, status: 'skipped', message: 'server disabled', durationMs: 0 });
      continue;
    }

    const smoke = SAFE_SMOKE_TESTS[entry.name];
    if (!smoke) {
      results.push({ serverName: entry.name, status: 'not_configured', message: 'no safe smoke test configured', durationMs: 0 });
      continue;
    }
    if (entry.transport !== 'stdio') {
      results.push({ serverName: entry.name, status: 'skipped', message: `${entry.transport} smoke is not implemented in v1`, durationMs: 0 });
      continue;
    }

    const started = Date.now();
    try {
      await callStdioTool(entry, smoke.toolName, smoke.args, smoke.timeoutMs || 15_000);
      results.push({
        serverName: entry.name,
        status: 'passed',
        message: `${smoke.toolName} passed`,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      results.push({
        serverName: entry.name,
        status: 'failed',
        message: shortError(error),
        durationMs: Date.now() - started,
      });
    }
  }

  return results;
}
