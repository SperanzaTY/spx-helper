import http from 'node:http';
import WebSocket from 'ws';

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

export class CdpClient {
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

const MAIN_PAGE_HOST = 'web.haiserve.com';
const EXCLUDED_PATHS = ['mediaViewer', 'serviceWorker', 'devtools'];

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
    return !EXCLUDED_PATHS.some((ex) => urlPath.includes(ex));
  });
  if (!main) throw new Error(`SeaTalk main page (${MAIN_PAGE_HOST}) not found on port ${cdpPort}`);
  const client = new CdpClient(main.webSocketDebuggerUrl, main);
  await client.connect();
  return client;
}
