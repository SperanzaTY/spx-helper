#!/usr/bin/env node
/**
 * verify-cdp.js — SeaTalk Agent CDP 功能验证脚本
 *
 * 通过 CDP (Chrome DevTools Protocol) 验证 SeaTalk 前端注入状态：
 *   1. CDP 端口可达 & 主页面存在
 *   2. 全局函数已注入
 *   3. Sidebar 按钮存在
 *   4. 无重复 UI 元素
 *
 * 用法: node scripts/verify-cdp.js
 * 退出码: 0=全部通过  1=有失败项  2=CDP不可达
 */

'use strict';

const http = require('http');
const path = require('path');

const WS_PATH = path.resolve(__dirname, '..', 'seatalk-agent', 'node_modules', 'ws');
let WebSocket;
try {
  WebSocket = require(WS_PATH);
} catch {
  console.error('❌ 无法加载 ws 模块，请先在 seatalk-agent/ 执行 npm install');
  process.exit(2);
}

const CDP_PORT = parseInt(process.env.CDP_PORT || '19222', 10);
const MAIN_PAGE_HOST = 'web.haiserve.com';
const EXCLUDED_PATHS = ['mediaViewer', 'serviceWorker', 'devtools'];
const TIMEOUT_MS = 10000;

let globalTimer = setTimeout(() => {
  console.error('❌ CDP 验证超时（10 秒）');
  process.exit(2);
}, TIMEOUT_MS);

function listPages() {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(new Error('CDP /json 响应解析失败'));
          }
        });
      })
      .on('error', (e) => reject(new Error(`CDP 端口 ${CDP_PORT} 不可达: ${e.message}`)));
  });
}

function findMainPage(pages) {
  return pages.find((p) => {
    if (!p.url || !p.url.includes(MAIN_PAGE_HOST)) return false;
    if (p.type !== 'page' && p.type !== 'webview') return false;
    if (!p.webSocketDebuggerUrl) return false;
    const urlPath = p.url.replace(/^https?:\/\/[^/]+/, '');
    return !EXCLUDED_PATHS.some((ex) => urlPath.includes(ex));
  });
}

function cdpEvaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { maxPayload: 10 * 1024 * 1024 });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Runtime.evaluate 超时'));
    }, 5000);

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
      if (msg.id === 1) {
        clearTimeout(timer);
        ws.close();
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else if (msg.result && msg.result.exceptionDetails) {
          reject(new Error(msg.result.exceptionDetails.text || 'evaluate exception'));
        } else {
          resolve(msg.result && msg.result.result && msg.result.result.value);
        }
      }
    });

    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket 连接失败: ${e.message}`));
    });
  });
}

async function run() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  SeaTalk Agent — CDP 功能验证                           ║');
  console.log(`║  CDP 端口: ${CDP_PORT}                                          ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // 1. 获取页面列表
  let pages;
  try {
    pages = await listPages();
  } catch (e) {
    console.error(`❌ ${e.message}`);
    console.error('   请确保 SeaTalk 已启动并开启了 CDP（端口 ' + CDP_PORT + '）');
    process.exit(2);
  }

  // 2. 找主页面
  const main = findMainPage(pages);
  if (!main) {
    console.error('❌ 未找到 SeaTalk 主页面 (' + MAIN_PAGE_HOST + ')');
    console.error('   可用页面: ' + pages.map((p) => p.url).join(', '));
    process.exit(2);
  }
  console.log('✅ CDP 已连接，主页面: ' + main.url.substring(0, 60) + '...');

  const wsUrl = main.webSocketDebuggerUrl;
  let hasFailures = false;

  // 3. 全局函数存在性
  const GLOBALS_EXPR = `JSON.stringify({
    cursorUI: !!window.__cursorUI,
    agentReceive: !!window.__agentReceive,
    agentSend: !!window.__agentSend,
    agentToggle: typeof window.__agentToggle === 'function',
    seatalkWatch: !!window.__seatalkWatch,
    seatalkSend: typeof window.__seatalkSend === 'function',
    sidebarCleanup: typeof window.__cursorSidebarCleanup === 'function'
  })`;

  try {
    const globalsRaw = await cdpEvaluate(wsUrl, GLOBALS_EXPR);
    const globals = JSON.parse(globalsRaw);
    const missing = Object.entries(globals)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length === 0) {
      console.log('✅ 全局函数已注入 (' + Object.keys(globals).length + ' 项全部存在)');
    } else {
      console.error('❌ 以下全局函数缺失: ' + missing.join(', '));
      hasFailures = true;
    }
  } catch (e) {
    console.error('❌ 全局函数检查失败: ' + e.message);
    hasFailures = true;
  }

  // 4. Sidebar 按钮存在
  const BUTTONS_EXPR = `JSON.stringify({
    cursorBtn: !!document.getElementById('cursor-sidebar-btn'),
    remoteBtn: !!document.getElementById('cursor-watch-sidebar-btn')
  })`;

  try {
    const btnsRaw = await cdpEvaluate(wsUrl, BUTTONS_EXPR);
    const btns = JSON.parse(btnsRaw);
    const missingBtns = Object.entries(btns)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missingBtns.length === 0) {
      console.log('✅ Sidebar 按钮存在 (cursor + remote)');
    } else {
      console.error('❌ 以下 Sidebar 按钮缺失: ' + missingBtns.join(', '));
      hasFailures = true;
    }
  } catch (e) {
    console.error('❌ Sidebar 按钮检查失败: ' + e.message);
    hasFailures = true;
  }

  // 5. 无重复 UI 元素
  const COUNTS_EXPR = `JSON.stringify({
    panelCount: document.querySelectorAll('#cursor-panel').length,
    cursorBtnCount: document.querySelectorAll('#cursor-sidebar-btn').length,
    remoteBtnCount: document.querySelectorAll('#cursor-watch-sidebar-btn').length,
    popoverCount: document.querySelectorAll('#cursor-remote-popover').length
  })`;

  try {
    const countsRaw = await cdpEvaluate(wsUrl, COUNTS_EXPR);
    const counts = JSON.parse(countsRaw);
    const duplicates = Object.entries(counts)
      .filter(([, v]) => v > 1)
      .map(([k, v]) => `${k}=${v}`);
    if (duplicates.length === 0) {
      console.log(
        '✅ 无重复 UI 元素 (' +
          Object.entries(counts)
            .map(([k, v]) => `${k}:${v}`)
            .join(', ') +
          ')'
      );
    } else {
      console.error('❌ 检测到重复 UI 元素（re-inject 去重失败）: ' + duplicates.join(', '));
      hasFailures = true;
    }
  } catch (e) {
    console.error('❌ UI 元素计数检查失败: ' + e.message);
    hasFailures = true;
  }

  // 结果
  console.log('');
  if (hasFailures) {
    console.error('══════════════════════════════════════════════════════════');
    console.error('  🛑 CDP 功能验证未通过！请修复上述问题后重试。');
    console.error('══════════════════════════════════════════════════════════');
    console.log('');
    process.exit(1);
  } else {
    console.log('══════════════════════════════════════════════════════════');
    console.log('  ✅ CDP 功能验证全部通过');
    console.log('══════════════════════════════════════════════════════════');
    console.log('');
    process.exit(0);
  }
}

run()
  .catch((e) => {
    console.error('❌ 验证脚本异常: ' + e.message);
    process.exit(2);
  })
  .finally(() => {
    clearTimeout(globalTimer);
  });
