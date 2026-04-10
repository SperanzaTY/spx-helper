#!/usr/bin/env node
/**
 * probe-seatalk-cdp.js — 一键探测本机 SeaTalk CDP 是否可用，并可选读取页面标题/正文片段。
 *
 * 用途：评 Alarm Bot、调试注入前，先确认 127.0.0.1:19222 可达；比 verify-cdp.js 更轻量。
 *
 * 环境变量:
 *   SEATALK_CDP_PORT / CDP_PORT — 默认 19222
 *
 * 用法:
 *   node scripts/probe-seatalk-cdp.js
 *   node scripts/probe-seatalk-cdp.js --json
 *   node scripts/probe-seatalk-cdp.js --snippet
 *
 * 退出码: 0=成功  2=CDP 不可达或未找到可调试页面
 */

'use strict';

const http = require('http');
const path = require('path');

const WS_PATH = path.resolve(__dirname, '..', 'seatalk-agent', 'node_modules', 'ws');
let WebSocket;
try {
  WebSocket = require(WS_PATH);
} catch {
  console.error('[probe-seatalk-cdp] 无法加载 ws，请在 seatalk-agent/ 执行 npm install');
  process.exit(2);
}

const CDP_PORT = parseInt(process.env.SEATALK_CDP_PORT || process.env.CDP_PORT || '19222', 10);
const MAIN_PAGE_HOST = 'web.haiserve.com';

function listPages() {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch {
            reject(new Error('CDP /json 解析失败'));
          }
        });
      })
      .on('error', (e) => reject(new Error(`CDP 端口 ${CDP_PORT} 不可达: ${e.message}`)));
  });
}

function pickPage(pages) {
  const main = pages.find(
    (p) =>
      p.url &&
      p.url.includes(MAIN_PAGE_HOST) &&
      (p.type === 'page' || p.type === 'webview') &&
      p.webSocketDebuggerUrl
  );
  if (main) return main;
  return pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || null;
}

function cdpEvaluate(wsUrl, expression, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { maxPayload: 10 * 1024 * 1024 });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Runtime.evaluate 超时'));
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: false },
        })
      );
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) {
        reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else if (msg.result && msg.result.exceptionDetails) {
        reject(new Error(msg.result.exceptionDetails.text || 'evaluate 异常'));
      } else {
        const v = msg.result && msg.result.result && msg.result.result.value;
        resolve(v);
      }
    });

    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket: ${e.message}`));
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const wantJson = argv.includes('--json');
  const wantSnippet = argv.includes('--snippet');

  let pages;
  try {
    pages = await listPages();
  } catch (e) {
    console.error('[probe-seatalk-cdp] FAIL', e.message);
    console.error('        请确认 SeaTalk 已启动且 CDP 端口', CDP_PORT, '可用。');
    process.exit(2);
  }

  if (wantJson) {
    console.log(JSON.stringify(pages, null, 2));
    process.exit(0);
  }

  console.log('[probe-seatalk-cdp] CDP port:', CDP_PORT);
  console.log('[probe-seatalk-cdp] targets:', pages.length);

  const page = pickPage(pages);
  if (!page || !page.webSocketDebuggerUrl) {
    console.error('[probe-seatalk-cdp] FAIL 无可用 page 目标（需含 webSocketDebuggerUrl）');
    process.exit(2);
  }

  console.log('[probe-seatalk-cdp] picked:', page.title || '(no title)');
  console.log('[probe-seatalk-cdp] url:  ', (page.url || '').slice(0, 100));

  const wsUrl = page.webSocketDebuggerUrl;

  try {
    const title = await cdpEvaluate(wsUrl, 'document.title');
    console.log('[probe-seatalk-cdp] document.title:', title);

    if (wantSnippet) {
      const expr = `(function(){
        try {
          var t = document.body && document.body.innerText;
          return t ? t.slice(0, 4000) : '';
        } catch (e) { return String(e); }
      })()`;
      const text = await cdpEvaluate(wsUrl, expr, 15000);
      console.log('[probe-seatalk-cdp] innerText (first 4000 chars):');
      console.log('---');
      console.log(text);
      console.log('---');
    } else {
      const len = await cdpEvaluate(
        wsUrl,
        'document.body && document.body.innerText ? document.body.innerText.length : -1'
      );
      console.log('[probe-seatalk-cdp] innerText length:', len, '(use --snippet 打印片段)');
    }
  } catch (e) {
    console.error('[probe-seatalk-cdp] evaluate FAIL:', e.message);
    process.exit(2);
  }

  console.log('[probe-seatalk-cdp] OK');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
