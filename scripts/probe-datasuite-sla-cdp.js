#!/usr/bin/env node
/**
 * 探测本机 Chrome 远程调试端口，列出含 datasuite 的 page 目标，便于对照 SLA 详情页的 Network（过滤 slaInstance）。
 *
 * 用法:
 *   CHROME_CDP=http://127.0.0.1:9222 node scripts/probe-datasuite-sla-cdp.js
 *
 * 前置: Chrome 以 --remote-debugging-port=9222 启动（见 mcp-tools/chrome-auth/scripts/start_chrome_remote_debug.sh）
 */

const base = (process.env.CHROME_CDP || "http://127.0.0.1:9222").replace(/\/$/, "");

async function main() {
  const verUrl = `${base}/json/version`;
  const listUrl = `${base}/json`;
  try {
    const ver = await fetch(verUrl);
    const text = await ver.text();
    console.log("[CDP version]", verUrl, ver.ok ? text.slice(0, 200) : text);
  } catch (e) {
    console.error("[X] 无法连接", verUrl, String(e.message || e));
    console.error("请确认 Chrome 已开启远程调试端口。");
    process.exit(1);
  }
  try {
    const r = await fetch(listUrl);
    const pages = await r.json();
    const hits = (Array.isArray(pages) ? pages : []).filter(
      (p) =>
        typeof p.url === "string" &&
        (p.url.includes("datasuite") || p.url.includes("scheduler/sla"))
    );
    console.log("\n含 DataSuite / SLA 的调试目标（打开对应页后在 DevTools → Network 过滤 slaInstance）:");
    if (!hits.length) {
      console.log("  (当前无匹配 tab，请先浏览器打开 SLA 详情页)");
    } else {
      for (const p of hits) {
        console.log(`  - ${p.title || ""}\n    ${p.url}\n    ${p.webSocketDebuggerUrl || ""}`);
      }
    }
  } catch (e) {
    console.error("[X] 读取 targets 失败", String(e.message || e));
    process.exit(1);
  }
}

main();
