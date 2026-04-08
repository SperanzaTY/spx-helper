import http from 'node:http';
import { execSync } from 'node:child_process';
import WebSocket from 'ws';

// ── Shared types ──

export interface CdpPage {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

interface PendingCall {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type EventHandler = (params: Record<string, unknown>) => void;

export interface ICdpClient {
  readonly connected: boolean;
  readonly page: CdpPage;
  send(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<any>;
  evaluate(code: string, timeoutMs?: number): Promise<unknown>;
  on(event: string, handler: EventHandler): void;
  off(event: string): void;
  close(): void;
}

// ── Direct CDP client (kept for seatalk-reader MCP and other consumers) ──

export class CdpClient implements ICdpClient {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, PendingCall>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private _connected = false;

  constructor(
    readonly wsUrl: string,
    readonly page: CdpPage,
  ) {}

  get connected() {
    return this._connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl, { maxPayload: 50 * 1024 * 1024 });

      this.ws.on('open', () => {
        this._connected = true;
        resolve();
      });

      this.ws.on('message', (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            clearTimeout(p.timer);
            if (msg.error) {
              p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              p.resolve(msg.result);
            }
          }
        }
        if (msg.method) {
          const handlers = this.eventHandlers.get(msg.method);
          if (handlers) for (const h of handlers) h(msg.params || {});
        }
      });

      this.ws.on('close', () => {
        this._connected = false;
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new Error('CDP connection closed'));
        }
        this.pending.clear();
        const handlers = this.eventHandlers.get('close');
        if (handlers) for (const h of handlers) h({});
      });

      this.ws.on('error', (e) => {
        if (!this._connected) reject(e);
      });
    });
  }

  close() {
    this.ws?.close();
    this._connected = false;
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this._connected) return reject(new Error('not connected'));
      const id = ++this.msgId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout (${timeoutMs}ms) for ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(code: string, timeoutMs = 30_000): Promise<unknown> {
    const res = await this.send(
      'Runtime.evaluate',
      { expression: code, returnByValue: true, awaitPromise: true },
      timeoutMs,
    );
    if (res?.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(d.exception?.description || d.text);
    }
    return res?.result?.value;
  }

  on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, new Set());
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string) {
    this.eventHandlers.delete(event);
  }
}

// ── Inspector-based CDP client (SIGUSR1 + debugger.attach proxy) ──

const MAIN_PAGE_HOST = 'web.haiserve.com';
const INSPECTOR_PORT = parseInt(process.env.INSPECTOR_PORT || '9229', 10);

export function findSeaTalkPid(): number {
  const output = execSync('pgrep -x SeaTalk 2>/dev/null || true', { encoding: 'utf-8' }).trim();
  const pids = output.split('\n').map((l) => parseInt(l.trim(), 10)).filter((p) => p > 0);
  if (pids.length === 0) throw new Error('SeaTalk is not running');
  // When BTM restarts SeaTalk, old and new processes may briefly coexist.
  // The newest process (highest PID) is the one that holds the single-instance lock.
  return Math.max(...pids);
}

function httpGetJson(url: string, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HTTP timeout')), timeoutMs);
    http
      .get(url, (res) => {
        let buf = '';
        res.on('data', (c: Buffer) => (buf += c));
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve(JSON.parse(buf)); }
          catch (e) { reject(e); }
        });
      })
      .on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function activateInspector(pid: number, port: number): Promise<string> {
  try {
    const info = await httpGetJson(`http://127.0.0.1:${port}/json`);
    if (Array.isArray(info) && info.length > 0) return info[0].webSocketDebuggerUrl;
  } catch { /* not active yet */ }

  process.kill(pid, 'SIGUSR1');
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const info = await httpGetJson(`http://127.0.0.1:${port}/json`);
      if (Array.isArray(info) && info.length > 0) return info[0].webSocketDebuggerUrl;
    } catch { /* retry */ }
  }
  throw new Error(`Inspector did not activate on port ${port} after SIGUSR1`);
}

/**
 * JS code executed inside SeaTalk's main process via Inspector to:
 * 1. Clean up any previous session (detach debugger, remove event handlers)
 * 2. Find the main BrowserWindow with web.haiserve.com
 * 3. Attach the Chromium debugger to its webContents
 * 4. Forward all CDP events from the page back through __cdpRelay binding
 * Returns JSON with window info: {id, url, title}
 */
const SETUP_SCRIPT = `(() => {
  if (typeof globalThis.__cdpCleanup === 'function') {
    try { globalThis.__cdpCleanup(); } catch {}
  }

  const { BrowserWindow } = process.mainModule.require('electron');
  const wins = BrowserWindow.getAllWindows();
  const main = wins.find(w => {
    const url = w.webContents.getURL();
    return url.includes('web.haiserve.com') &&
      !url.includes('mediaViewer') &&
      !url.includes('serviceWorker') &&
      !url.includes('devtools');
  });
  if (!main) throw new Error('SeaTalk main window (web.haiserve.com) not found');

  if (!main.webContents.debugger.isAttached()) {
    main.webContents.debugger.attach('1.3');
  }

  const handler = (_event, method, params) => {
    if (typeof globalThis.__cdpRelay === 'function') {
      try { globalThis.__cdpRelay(JSON.stringify({ method, params })); } catch {}
    }
  };
  main.webContents.debugger.on('message', handler);

  globalThis.__cdpCleanup = () => {
    try { main.webContents.debugger.removeListener('message', handler); } catch {}
    try { if (main.webContents.debugger.isAttached()) main.webContents.debugger.detach(); } catch {}
    globalThis.__cdpCleanup = undefined;
  };
  globalThis.__cdpMainWin = main;

  const url = main.webContents.getURL();
  return JSON.stringify({
    id: String(main.id),
    url,
    title: main.webContents.getTitle(),
  });
})()`;

export class InspectorCdpClient implements ICdpClient {
  private ws: WebSocket | null = null;
  private inspectorMsgId = 0;
  private inspectorPending = new Map<number, PendingCall>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private _connected = false;
  private _page: CdpPage;
  private _seatalkPid = 0;

  constructor() {
    this._page = { id: '', title: '', url: '', type: 'page', webSocketDebuggerUrl: '' };
  }

  get connected() { return this._connected; }
  get page() { return this._page; }

  async connect(port = INSPECTOR_PORT): Promise<void> {
    this._seatalkPid = findSeaTalkPid();
    const wsUrl = await activateInspector(this._seatalkPid, port);

    this.ws = new WebSocket(wsUrl, { maxPayload: 50 * 1024 * 1024 });
    await new Promise<void>((resolve, reject) => {
      this.ws!.on('open', resolve);
      this.ws!.on('error', (e) => reject(new Error(`Inspector WS error: ${e.message}`)));
    });

    this.ws.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== undefined) {
        const p = this.inspectorPending.get(msg.id);
        if (p) {
          this.inspectorPending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
      }
      if (msg.method === 'Runtime.bindingCalled' && (msg.params as any)?.name === '__cdpRelay') {
        try {
          const event = JSON.parse((msg.params as any).payload);
          const handlers = this.eventHandlers.get(event.method);
          if (handlers) for (const h of handlers) h(event.params || {});
        } catch { /* malformed relay payload */ }
      }
    });

    this.ws.on('close', () => {
      this._connected = false;
      for (const p of this.inspectorPending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('Inspector connection closed'));
      }
      this.inspectorPending.clear();
      const handlers = this.eventHandlers.get('close');
      if (handlers) for (const h of handlers) h({});
    });

    await this.inspectorSend('Runtime.enable');
    await this.inspectorSend('Runtime.addBinding', { name: '__cdpRelay' });

    const infoJson = await this.inspectorEval(SETUP_SCRIPT) as string;
    const info = JSON.parse(infoJson);
    this._page = {
      id: info.id,
      title: info.title,
      url: info.url,
      type: 'page',
      webSocketDebuggerUrl: '',
    };
    this._connected = true;
  }

  close() {
    if (this.ws && this._connected) {
      this.inspectorEval(
        `typeof globalThis.__cdpCleanup === 'function' && globalThis.__cdpCleanup()`,
      ).catch(() => {});
    }
    this.ws?.close();
    this._connected = false;
  }

  async send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<any> {
    if (!this._connected) throw new Error('not connected');
    const methodStr = JSON.stringify(method);
    const paramsStr = JSON.stringify(params);
    const resultJson = await this.inspectorEval(
      `(async () => {
        const r = await globalThis.__cdpMainWin.webContents.debugger.sendCommand(${methodStr}, ${paramsStr});
        return JSON.stringify(r);
      })()`,
      timeoutMs,
    ) as string;
    if (!resultJson) return undefined;
    return JSON.parse(resultJson);
  }

  async evaluate(code: string, timeoutMs = 30_000): Promise<unknown> {
    const res = await this.send(
      'Runtime.evaluate',
      { expression: code, returnByValue: true, awaitPromise: true },
      timeoutMs,
    );
    if (res?.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(d.exception?.description || d.text);
    }
    return res?.result?.value;
  }

  on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, new Set());
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string) {
    this.eventHandlers.delete(event);
  }

  private inspectorSend(method: string, params: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('Inspector WS not open'));
      const id = ++this.inspectorMsgId;
      const timer = setTimeout(() => {
        this.inspectorPending.delete(id);
        reject(new Error(`Inspector timeout (${timeoutMs}ms) for ${method}`));
      }, timeoutMs);
      this.inspectorPending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  private async inspectorEval(expression: string, timeoutMs = 10_000): Promise<unknown> {
    const res = await this.inspectorSend('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, timeoutMs);
    if (res?.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(d.exception?.description || d.text);
    }
    return res?.result?.value;
  }
}

export async function connectViaInspector(port = INSPECTOR_PORT): Promise<InspectorCdpClient> {
  const client = new InspectorCdpClient();
  await client.connect(port);
  return client;
}

// ── Legacy helpers (kept for seatalk-reader MCP) ──

export function listPages(cdpPort: number): Promise<CdpPage[]> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${cdpPort}/json`, (res) => {
        let buf = '';
        res.on('data', (c: Buffer) => (buf += c));
        res.on('end', () => {
          try {
            const all: CdpPage[] = JSON.parse(buf);
            resolve(all.filter((p) => (p.type === 'page' || p.type === 'webview') && p.webSocketDebuggerUrl));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

export async function connectMainPage(cdpPort: number): Promise<CdpClient> {
  const pages = await listPages(cdpPort);
  const main = pages.find((p) => {
    if (!p.url.includes(MAIN_PAGE_HOST)) return false;
    const urlPath = p.url.replace(/^https?:\/\/[^/]+/, '');
    return !['mediaViewer', 'serviceWorker', 'devtools'].some((ex) => urlPath.includes(ex));
  });
  if (!main) throw new Error(`SeaTalk main page (${MAIN_PAGE_HOST}) not found on port ${cdpPort}`);
  const client = new CdpClient(main.webSocketDebuggerUrl, main);
  await client.connect();
  return client;
}
