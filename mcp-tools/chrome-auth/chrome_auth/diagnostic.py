"""统一 Cookie 诊断文案（DataSuite / Flink / Scheduler 共用）。"""

import time
from typing import Dict, Iterable, Optional, Tuple

DEFAULT_CRITICAL_KEYS: Tuple[str, ...] = (
    "CSRF-TOKEN",
    "JSESSIONID",
    "DATA-SUITE-AUTH-userToken-v4",
)

DATA_SUITE_AUTH_KEY = "DATA-SUITE-AUTH-userToken-v4"

MAC_CHROME_ENCRYPT_HINT = (
    "在较新的 macOS Google Chrome 中，DataSuite 登录 Cookie（尤其是 "
    f"{DATA_SUITE_AUTH_KEY}）可能以加密形式存储，磁盘 Cookie 数据库中不会出现明文，"
    "browser_cookie3 无法读出。必须通过同一 Chrome 进程的 CDP 才能拿到。"
)

CDP_9222_HINT = (
    "请完全退出 Chrome 后，用远程调试端口启动（见仓库 "
    "`mcp-tools/chrome-auth/scripts/start_chrome_remote_debug.sh`），"
    "再在 Chrome 中打开 https://datasuite.shopee.io/flink/ 登录；"
    "或设置环境变量 CHROME_CDP_PORT=9222 指向已开启调试的 Chrome。"
)


def cookie_diagnostic(
    cookies: Dict[str, str],
    *,
    critical_keys: Iterable[str] = DEFAULT_CRITICAL_KEYS,
    expires_at: Optional[float] = None,
) -> str:
    """返回简短诊断句，供 MCP 在 401 时展示。

    Args:
        cookies: Current cookie dict.
        critical_keys: Keys that must be present for auth to work.
        expires_at: Earliest cookie expiry (Unix timestamp), from AuthResult.
    """
    total = len(cookies)
    if total == 0:
        return "未读取到任何 Cookie（browser_cookie3 可能无法访问 Chrome Cookie 数据库）"

    missing = [k for k in critical_keys if k not in cookies]

    now = time.time()
    if expires_at is not None and expires_at <= now:
        expired_ago = now - expires_at
        if expired_ago < 60:
            age = f"{int(expired_ago)} 秒前"
        elif expired_ago < 3600:
            age = f"{int(expired_ago / 60)} 分钟前"
        else:
            age = f"{expired_ago / 3600:.1f} 小时前"
        return (
            f"Cookie 已于 {time.strftime('%H:%M:%S', time.localtime(expires_at))} 过期"
            f"（{age}），请在 Chrome 中打开 https://datasuite.shopee.io 刷新登录"
        )

    if expires_at is not None:
        remaining = expires_at - now
        if remaining < 300:
            return (
                f"Cookie 将在 {int(remaining / 60)} 分钟后过期"
                f"（{time.strftime('%H:%M:%S', time.localtime(expires_at))}），"
                "建议尽快在 Chrome 中刷新 DataSuite 页面以续期"
            )

    if not missing:
        return f"Cookie 键齐全（{total} 个），可能是 Cookie 已过期或接口权限变更"

    lines = [
        f"读到 {total} 个 Cookie，但缺少关键认证项: {', '.join(missing)}",
    ]
    if DATA_SUITE_AUTH_KEY in missing:
        lines.append(MAC_CHROME_ENCRYPT_HINT)
        lines.append(CDP_9222_HINT)
    return "\n".join(lines)


def format_auth_troubleshoot(
    domain: str,
    cookies: Dict[str, str],
    *,
    cookie_source: str = "",
    expires_at: Optional[float] = None,
    sso_refresh_attempted: bool = False,
    sso_refresh_succeeded: bool = False,
    sso_refresh_urls_tried: Tuple[str, ...] = (),
    cdp_port: Optional[int] = None,
    critical_keys: Optional[Tuple[str, ...]] = None,
) -> str:
    """401/403 时给终端用户的结构化说明（CDP 可达性、本次静默刷新、关键 Cookie）。"""
    from .cdp_provider import probe_cdp_connectivity, sso_refresh_urls_for_domain

    probe = probe_cdp_connectivity(cdp_port)
    env_p = probe["env_chrome_cdp_port"]
    reach = probe["reachable_ports"]
    order = probe["ports_probe_order"]
    port_browser = probe.get("port_browser") or {}
    auth_skipped = probe.get("auth_skipped_ports") or {}

    blocks: list[str] = []
    blocks.append(
        "[环境] CDP 探测端口顺序: "
        + ",".join(str(p) for p in order)
        + f"；环境变量 CHROME_CDP_PORT={env_p}"
    )
    if reach:
        blocks.append(
            f"[环境] 当前可达 CDP 端口: {reach}（DataSuite 认证只会使用其中的 Chrome / Chromium 端口）"
        )
        if port_browser:
            blocks.append(
                "[环境] CDP 产品: "
                + ", ".join(f"{p}={name}" for p, name in sorted(port_browser.items()))
            )
        if auth_skipped:
            blocks.append(
                "[环境] 已跳过不适合 DataSuite 认证的 CDP 端口: "
                + ", ".join(f"{p}={name}" for p, name in sorted(auth_skipped.items()))
                + "。这些通常是 SeaTalk/Electron 代理，不共享你在 Chrome 里的 DataSuite 登录态。"
            )
    else:
        blocks.append(
            "[环境] 未发现可达 CDP（127.0.0.1 上常见调试端口 /json 无响应）。"
            "请使用仓库 mcp-tools/chrome-auth/scripts/start_chrome_remote_debug.sh 启动 Chrome，"
            "并设置 CHROME_CDP_PORT 与之一致。"
        )

    if cookie_source:
        blocks.append(f"[本次] Cookie 策略来源: {cookie_source}")

    planned = sso_refresh_urls_for_domain(domain)
    if planned:
        blocks.append(f"[配置] 域名静默刷新 URL 候选顺序: {planned}")

    if sso_refresh_attempted:
        status = "成功" if sso_refresh_succeeded else "失败或未停留在已登录页"
        blocks.append(
            f"[本次] 已尝试静默 SSO 导航，顺序: {list(sso_refresh_urls_tried)}；结果: {status}"
        )
        if not sso_refresh_succeeded:
            blocks.append(
                "[提示] 若末次落地 URL 含 login、signin、sso/authorize，请在浏览器中完成一次完整登录；"
                "静默刷新只能延续已有会话，不能代替首次登录或强风控验证。"
            )

    keys = DEFAULT_CRITICAL_KEYS if critical_keys is None else critical_keys
    if keys:
        present = [k for k in keys if k in cookies]
        missing = [k for k in keys if k not in cookies]
        blocks.append(
            f"[Cookie] 关键键已具备: {present or '（无）'}；仍缺: {missing or '（无）'}；"
            f"当前共 {len(cookies)} 个 Cookie"
        )
    else:
        blocks.append(f"[Cookie] 当前共 {len(cookies)} 个 Cookie（未配置域名专用关键键列表）")

    blocks.append("----")
    if keys:
        blocks.append(cookie_diagnostic(cookies, expires_at=expires_at, critical_keys=keys))
    else:
        blocks.append(
            "Cookie 未按固定关键键逐项分析（非 DataSuite 域）。"
            "请在 Chrome 中打开该站点并完成登录后重试。"
        )
    return "\n".join(blocks)
