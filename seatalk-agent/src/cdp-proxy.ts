/**
 * CDP Proxy — exposes a standard Chrome DevTools Protocol endpoint on port 19222,
 * proxying CDP commands through the InspectorCdpClient to the SeaTalk rendering page.
 *
 * This allows external tools (seatalk-reader MCP, chrome-auth cdp_provider, etc.)
 * to connect as if they were talking to a normal CDP target.
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ICdpClient, CdpPage, InspectorCdpClient } from './cdp.js';

const CDP_PROXY_PORT = parseInt(process.env.CDP_PROXY_PORT || '19222', 10);

export interface CdpProxyOptions {
  port?: number;
  log?: (...args: unknown[]) => void;
}

export class CdpProxy {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private client: ICdpClient | null = null;
  private clients = new Set<WebSocket>();
  private port: number;
  private log: (...args: unknown[]) => void;

  constructor(opts: CdpProxyOptions = {}) {
    this.port = opts.port ?? CDP_PROXY_PORT;
    this.log = opts.log ?? console.log;
  }

  /**
   * Bind the proxy to an InspectorCdpClient. Call this whenever the CDP
   * client reconnects so the proxy always forwards to a live session.
   */
  setClient(client: ICdpClient) {
    this.client = client;
    if ('onCdpEvent' in client && typeof (client as InspectorCdpClient).onCdpEvent === 'function') {
      (client as InspectorCdpClient).onCdpEvent((method, params) => {
        this.broadcastEvent({ method, params });
      });
    }
  }

  private buildPageList(): CdpPage[] {
    if (!this.client?.connected) return [];
    const page = this.client.page;
    return [{
      id: page.id || '1',
      title: page.title || 'SeaTalk',
      url: page.url || 'https://web.haiserve.com/',
      type: 'page',
      webSocketDebuggerUrl: `ws://127.0.0.1:${this.port}/devtools/page/${page.id || '1'}`,
    }];
  }

  private broadcastEvent(event: { method: string; params: unknown }) {
    const msg = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  async start(): Promise<void> {
    if (this.server) return;

    const server = http.createServer((req, res) => {
      const url = req.url ?? '/';

      if (url === '/json' || url === '/json/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.buildPageList()));
        return;
      }

      if (url === '/json/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          Browser: 'SeaTalk/CDP-Proxy',
          'Protocol-Version': '1.3',
          'User-Agent': 'SeaTalk-Agent-CDP-Proxy',
          webSocketDebuggerUrl: `ws://127.0.0.1:${this.port}/devtools/browser`,
        }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    return new Promise<void>((resolve) => {
      server.on('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE') {
          this.log(`[cdp-proxy] port ${this.port} in use, skipping proxy`);
        } else {
          this.log(`[cdp-proxy] server error: ${e.message}`);
        }
        resolve();
      });

      server.listen(this.port, '127.0.0.1', () => {
        this.server = server;
        this.log(`[cdp-proxy] listening on 127.0.0.1:${this.port}`);

        this.wss = new WebSocketServer({ server });
        this.setupWebSocket();
        resolve();
      });
    });
  }

  private setupWebSocket() {
    if (!this.wss) return;

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      this.log(`[cdp-proxy] client connected (total: ${this.clients.size})`);

      ws.on('message', async (raw: Buffer) => {
        if (!this.client?.connected) {
          ws.send(JSON.stringify({ id: 0, error: { message: 'CDP backend not connected' } }));
          return;
        }

        let msg: { id: number; method: string; params?: Record<string, unknown> };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        try {
          const result = await this.client.send(msg.method, msg.params || {});
          ws.send(JSON.stringify({ id: msg.id, result: result ?? {} }));
        } catch (e) {
          ws.send(JSON.stringify({
            id: msg.id,
            error: { message: (e as Error).message },
          }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.log(`[cdp-proxy] client disconnected (total: ${this.clients.size})`);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  stop() {
    for (const ws of this.clients) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this.clients.clear();
    this.wss?.close();
    this.server?.close();
    this.wss = null;
    this.server = null;
  }
}
