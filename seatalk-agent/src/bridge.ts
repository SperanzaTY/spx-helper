import type { CdpClient } from './cdp.js';

/**
 * 消息桥: 浏览器侧 <-> Node 侧双向通信
 *
 * 浏览器 → Node: CDP Runtime.addBinding("__agentSend")
 * Node → 浏览器: CDP Runtime.evaluate("__agentReceive(json)")
 */

export type MessageHandler = (data: Record<string, unknown>) => void | Promise<void>;

export class Bridge {
  private handler: MessageHandler | null = null;
  private chunkBuffer = '';
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly CHUNK_FLUSH_MS = 80;
  private processedIds = new Set<string>();
  private static nextId = 0;
  readonly id = ++Bridge.nextId;

  constructor(private client: CdpClient) {}

  async setup() {
    this.client.off('Runtime.bindingCalled');
    await this.client.send('Runtime.enable');
    try {
      await this.client.send('Runtime.addBinding', { name: '__agentSend' });
    } catch { /* binding may already exist after page reload */ }

    this.client.on('Runtime.bindingCalled', async (params) => {
      if (params.name !== '__agentSend') return;

      const callId = `${params.executionContextId ?? ''}-${params.payload}`;
      if (this.processedIds.has(callId)) return;
      this.processedIds.add(callId);
      setTimeout(() => this.processedIds.delete(callId), 2000);

      try {
        const data = JSON.parse(params.payload as string);
        if (this.handler) await this.handler(data);
      } catch (e) {
        console.error('[bridge] handler error:', (e as Error).message);
      }
    });
  }

  onMessage(handler: MessageHandler) {
    this.handler = handler;
  }

  async sendToPanel(data: Record<string, unknown>, timeoutMs?: number) {
    const json = JSON.stringify(data);
    const escaped = JSON.stringify(json);
    try {
      await this.client.evaluate(`window.__agentReceive && window.__agentReceive(${escaped})`, timeoutMs);
    } catch (e) {
      console.error(`[bridge:sendToPanel] FAILED type=${data.type}:`, (e as Error).message);
    }
  }

  async sendAssistantChunk(text: string) {
    this.chunkBuffer += text;
    if (!this.chunkTimer) {
      this.chunkTimer = setTimeout(() => this.flushChunks(), Bridge.CHUNK_FLUSH_MS);
    }
  }

  private async flushChunks() {
    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }
    if (!this.chunkBuffer) return;
    const buf = this.chunkBuffer;
    this.chunkBuffer = '';
    await this.sendToPanel({ type: 'text_chunk', text: buf });
  }

  async sendAssistantDone() {
    await this.flushChunks();
  }
}
