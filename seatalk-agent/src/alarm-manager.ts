import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Types ──

export interface PatternRule {
  regex: string;
  op: 'or' | 'and';
}

export interface SessionSettings {
  patterns: PatternRule[];
  requireMention: boolean;
  cancelOnHumanReply: boolean;
  workspace: string;
  modelId: string;
  timeoutMinutes: number;
  prompt: string;
}

export interface AlarmConfig {
  enabled: boolean;
  monitoredSessions: string[];
  promptTemplate: string;
  sessionSettings: Record<string, Partial<SessionSettings>>;
}

export interface PendingAlarm {
  mid: string;
  session: string;
  sessionName: string;
  text: string;
  senderId: string;
  detectedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface AlarmRecord {
  mid: string;
  session: string;
  sessionName: string;
  text: string;
  detectedAt: number;
  resolvedAt: number;
  outcome: 'investigated' | 'cancelled_human' | 'cancelled_manual';
  replyPreview?: string;
}

export interface WatchMessage {
  mid: string;
  session: string;
  sessionName: string;
  sender: string;
  senderId: string;
  text: string;
  ts: number;
  tag?: string;
  isMention?: boolean;
  isSelfCommand?: boolean;
  rootMid?: string;
}

export interface AlarmCallbacks {
  onInvestigate: (alarm: PendingAlarm) => Promise<string>;
  onStatusChange: (status: AlarmStatus) => void;
  log: (...args: unknown[]) => void;
}

export interface AlarmStatus {
  enabled: boolean;
  monitoredSessions: string[];
  promptTemplate: string;
  sessionSettings: Record<string, Partial<SessionSettings>>;
  pendingCount: number;
  pending: Array<{ mid: string; session: string; sessionName: string; text: string; remainingSec: number }>;
  recentRecords: AlarmRecord[];
}

// ── Config persistence ──

const CONFIG_PATH = path.join(os.homedir(), '.cursor', 'seatalk-alarm-config.json');
const MAX_RECORDS = 50;
const MAX_CONCURRENT = 3;

const DEFAULT_SESSION: SessionSettings = {
  patterns: [],
  requireMention: false,
  cancelOnHumanReply: true,
  workspace: '',
  modelId: '',
  timeoutMinutes: 5,
  prompt: '',
};

const DEFAULT_PROMPT =
  `你是 SPX 告警排查助手。以下是来自群 "{{groupName}}" 的告警消息，{{timeout}} 分钟内无人响应。\n\n` +
  `[告警内容]:\n{{alarmText}}\n\n` +
  `请执行以下步骤:\n` +
  `1. 分析告警类型（Flink checkpoint 失败、任务异常、数据延迟等）\n` +
  `2. 使用可用的 MCP 工具查询相关状态（如 Flink 任务详情、Scheduler 任务状态等）\n` +
  `3. 给出初步排查结论和建议的处理方式\n\n` +
  `输出格式要求:\n` +
  `- 简洁明了，适合在群聊中阅读\n` +
  `- 包含关键数据和时间点\n` +
  `- 如果需要人工介入，明确指出\n` +
  `- 用中文回复`;

const DEFAULT_CONFIG: AlarmConfig = {
  enabled: false,
  monitoredSessions: [],
  promptTemplate: DEFAULT_PROMPT,
  sessionSettings: {},
};

function migratePatterns(raw: unknown, fallbackOp: 'or' | 'and' = 'or'): PatternRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p: unknown) => {
    if (typeof p === 'string') return { regex: p, op: fallbackOp };
    if (p && typeof p === 'object' && 'regex' in p) return p as PatternRule;
    return null;
  }).filter(Boolean) as PatternRule[];
}

function migrateConfig(raw: Record<string, unknown>): AlarmConfig {
  const config: AlarmConfig = {
    enabled: !!raw.enabled,
    monitoredSessions: (raw.monitoredSessions as string[]) || [],
    promptTemplate: (raw.promptTemplate as string) || DEFAULT_PROMPT,
    sessionSettings: {},
  };

  const oldSS = (raw.sessionSettings || {}) as Record<string, Record<string, unknown>>;
  const oldPatterns = (raw.patterns || []) as unknown[];
  const oldMatchMode = (raw.matchMode as string) || 'any';
  const oldTimeout = typeof raw.timeoutMinutes === 'number' ? raw.timeoutMinutes : 5;
  const oldCancel = raw.cancelOnHumanReply !== false;
  const oldMention = !!raw.requireMention;
  const oldModelId = (raw.modelId as string) || '';

  for (const session of config.monitoredSessions) {
    const prev = oldSS[session] || {};
    const defaultOp: 'or' | 'and' = ((prev.matchMode || oldMatchMode) === 'all') ? 'and' : 'or';
    config.sessionSettings[session] = {
      patterns: migratePatterns(prev.patterns || oldPatterns, defaultOp),
      requireMention: typeof prev.requireMention === 'boolean' ? prev.requireMention : oldMention,
      cancelOnHumanReply: typeof prev.cancelOnHumanReply === 'boolean' ? prev.cancelOnHumanReply : oldCancel,
      workspace: (prev.workspace as string) || '',
      modelId: (prev.modelId as string) || oldModelId,
      timeoutMinutes: typeof prev.timeoutMinutes === 'number' ? prev.timeoutMinutes : oldTimeout,
      prompt: (prev.prompt as string) || '',
    };
  }

  return config;
}

function loadConfig(): AlarmConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (!raw.sessionSettings) return migrateConfig(raw);
      const ss = raw.sessionSettings as Record<string, Record<string, unknown>>;
      const needsMigration = Object.values(ss).some((s) => {
        const pats = s.patterns;
        if (!Array.isArray(pats) || pats.length === 0) return false;
        return typeof pats[0] === 'string';
      });
      if (needsMigration || raw.matchMode) return migrateConfig(raw);
      return { ...DEFAULT_CONFIG, ...raw };
    }
  } catch { /* corrupt config */ }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: AlarmConfig) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch { /* ignore write errors */ }
}

// ── AlarmManager ──

export class AlarmManager {
  private config: AlarmConfig;
  private pending = new Map<string, PendingAlarm>();
  private records: AlarmRecord[] = [];
  private compiledPatterns = new Map<string, Array<{ re: RegExp; op: 'or' | 'and' }>>();
  private activeInvestigations = 0;
  private investigationQueue: PendingAlarm[] = [];
  private callbacks: AlarmCallbacks;
  private botSentMids = new Set<string>();

  constructor(callbacks: AlarmCallbacks) {
    this.callbacks = callbacks;
    this.config = loadConfig();
    this.compileAllPatterns();
    callbacks.log('[alarm] loaded config:', JSON.stringify(this.config));
  }

  private getSessionConfig(session: string): SessionSettings {
    const ss = this.config.sessionSettings[session] || {};
    return { ...DEFAULT_SESSION, ...ss };
  }

  private compileAllPatterns() {
    this.compiledPatterns.clear();
    for (const session of this.config.monitoredSessions) {
      this.compileSessionPatterns(session);
    }
  }

  private compileSessionPatterns(session: string) {
    const sc = this.getSessionConfig(session);
    const compiled: Array<{ re: RegExp; op: 'or' | 'and' }> = [];
    for (const p of sc.patterns) {
      try {
        compiled.push({ re: new RegExp(p.regex, 'i'), op: p.op || 'or' });
      } catch {
        this.callbacks.log(`[alarm] invalid pattern ignored for ${session}: ${p.regex}`);
      }
    }
    this.compiledPatterns.set(session, compiled);
  }

  private isAlarm(text: string, session: string): boolean {
    const rules = this.compiledPatterns.get(session);
    if (!rules || rules.length === 0) return false;
    const andRules = rules.filter((r) => r.op === 'and');
    const orRules = rules.filter((r) => r.op === 'or');
    const andPass = andRules.length === 0 || andRules.every((r) => r.re.test(text));
    const orPass = orRules.length === 0 || orRules.some((r) => r.re.test(text));
    return andPass && orPass;
  }

  private isMonitoredSession(session: string): boolean {
    return this.config.monitoredSessions.includes(session);
  }

  markBotSent(mid: string) {
    this.botSentMids.add(mid);
    setTimeout(() => this.botSentMids.delete(mid), 120_000);
  }

  onNewMessages(messages: WatchMessage[]) {
    if (!this.config.enabled) return;

    for (const msg of messages) {
      if (msg.isSelfCommand) continue;
      if (this.botSentMids.has(msg.mid)) continue;

      if (!this.isMonitoredSession(msg.session)) continue;

      const sc = this.getSessionConfig(msg.session);

      if (sc.cancelOnHumanReply) this.checkHumanReply(msg);

      if (sc.requireMention && !msg.isMention) continue;
      if (this.isAlarm(msg.text, msg.session)) {
        if (this.pending.has(msg.mid)) continue;
        this.startTimer(msg, sc.timeoutMinutes);
      }
    }
  }

  private checkHumanReply(msg: WatchMessage) {
    for (const [mid, alarm] of this.pending) {
      if (alarm.session === msg.session && msg.senderId !== alarm.senderId) {
        this.callbacks.log(`[alarm] human replied in ${alarm.sessionName}, cancelling alarm ${mid}`);
        this.cancelAlarm(mid, 'cancelled_human');
      }
    }
  }

  private startTimer(msg: WatchMessage, timeoutMinutes: number) {
    const timeoutMs = timeoutMinutes * 60 * 1000;

    const alarm: PendingAlarm = {
      mid: msg.mid,
      session: msg.session,
      sessionName: msg.sessionName,
      text: msg.text,
      senderId: msg.senderId,
      detectedAt: Date.now(),
      timer: setTimeout(() => this.onTimeout(msg.mid), timeoutMs),
    };

    this.pending.set(msg.mid, alarm);
    this.callbacks.log(`[alarm] detected in ${msg.sessionName}: "${msg.text.substring(0, 80)}..." (timeout ${timeoutMinutes}m)`);
    this.callbacks.onStatusChange(this.getStatus());
  }

  private onTimeout(mid: string) {
    const alarm = this.pending.get(mid);
    if (!alarm) return;

    this.pending.delete(mid);
    this.callbacks.log(`[alarm] timeout reached for ${alarm.sessionName}, triggering investigation`);

    if (this.activeInvestigations >= MAX_CONCURRENT) {
      this.callbacks.log(`[alarm] investigation queued (${this.activeInvestigations}/${MAX_CONCURRENT} active)`);
      this.investigationQueue.push(alarm);
      this.callbacks.onStatusChange(this.getStatus());
      return;
    }

    this.runInvestigation(alarm);
  }

  private async runInvestigation(alarm: PendingAlarm) {
    this.activeInvestigations++;
    this.callbacks.onStatusChange(this.getStatus());

    try {
      const replyPreview = await this.callbacks.onInvestigate(alarm);
      this.addRecord(alarm, 'investigated', replyPreview);
    } catch (e) {
      this.callbacks.log(`[alarm] investigation failed: ${(e as Error).message}`);
      this.addRecord(alarm, 'investigated', `Error: ${(e as Error).message}`);
    } finally {
      this.activeInvestigations--;
      this.drainQueue();
      this.callbacks.onStatusChange(this.getStatus());
    }
  }

  private drainQueue() {
    while (this.investigationQueue.length > 0 && this.activeInvestigations < MAX_CONCURRENT) {
      const next = this.investigationQueue.shift()!;
      this.runInvestigation(next);
    }
  }

  cancelAlarm(mid: string, outcome: AlarmRecord['outcome'] = 'cancelled_manual') {
    const alarm = this.pending.get(mid);
    if (!alarm) return;

    clearTimeout(alarm.timer);
    this.pending.delete(mid);
    this.addRecord(alarm, outcome);
    this.callbacks.onStatusChange(this.getStatus());
  }

  private addRecord(alarm: PendingAlarm, outcome: AlarmRecord['outcome'], replyPreview?: string) {
    this.records.push({
      mid: alarm.mid,
      session: alarm.session,
      sessionName: alarm.sessionName,
      text: alarm.text.substring(0, 200),
      detectedAt: alarm.detectedAt,
      resolvedAt: Date.now(),
      outcome,
      replyPreview: replyPreview?.substring(0, 200),
    });
    if (this.records.length > MAX_RECORDS) {
      this.records.splice(0, this.records.length - MAX_RECORDS);
    }
  }

  updateConfig(partial: Partial<AlarmConfig>) {
    this.config = { ...this.config, ...partial };
    if (partial.sessionSettings) this.compileAllPatterns();
    saveConfig(this.config);
    this.callbacks.log('[alarm] config updated:', JSON.stringify(this.config));
    this.callbacks.onStatusChange(this.getStatus());
  }

  toggle(enabled?: boolean) {
    this.config.enabled = enabled ?? !this.config.enabled;
    saveConfig(this.config);
    this.callbacks.log(`[alarm] ${this.config.enabled ? 'enabled' : 'disabled'}`);

    if (!this.config.enabled) {
      for (const [mid] of this.pending) {
        this.cancelAlarm(mid, 'cancelled_manual');
      }
    }

    this.callbacks.onStatusChange(this.getStatus());
  }

  getStatus(): AlarmStatus {
    const now = Date.now();
    return {
      enabled: this.config.enabled,
      monitoredSessions: this.config.monitoredSessions,
      promptTemplate: this.config.promptTemplate,
      sessionSettings: this.config.sessionSettings,
      pendingCount: this.pending.size,
      pending: Array.from(this.pending.values()).map((a) => {
        const sc = this.getSessionConfig(a.session);
        return {
          mid: a.mid,
          session: a.session,
          sessionName: a.sessionName,
          text: a.text.substring(0, 100),
          remainingSec: Math.max(0, Math.round((a.detectedAt + sc.timeoutMinutes * 60_000 - now) / 1000)),
        };
      }),
      recentRecords: this.records.slice(-10).reverse(),
    };
  }

  buildPrompt(alarm: PendingAlarm): string {
    const sc = this.getSessionConfig(alarm.session);
    const template = this.config.promptTemplate || DEFAULT_PROMPT;
    let prompt = template
      .replace(/\{\{groupName\}\}/g, alarm.sessionName)
      .replace(/\{\{timeout\}\}/g, String(sc.timeoutMinutes))
      .replace(/\{\{alarmText\}\}/g, alarm.text);

    if (sc.prompt) {
      prompt += `\n\n[群特定上下文]:\n${sc.prompt}`;
    }
    return prompt;
  }

  getSessionWorkspace(session: string): string | undefined {
    return this.getSessionConfig(session).workspace || undefined;
  }

  getSessionModelId(session: string): string {
    return this.getSessionConfig(session).modelId;
  }

  getConfig(): AlarmConfig {
    return { ...this.config };
  }

  destroy() {
    for (const [, alarm] of this.pending) {
      clearTimeout(alarm.timer);
    }
    this.pending.clear();
    this.investigationQueue.length = 0;
  }
}
