"""统一 Cookie 诊断文案（DataSuite / Flink / Scheduler 共用）。"""

from typing import Dict, Iterable, List, Tuple

# DataSuite Web 登录态常见键（磁盘可能因加密读不到 DATA-SUITE-AUTH）
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
) -> str:
    """返回简短诊断句，供 MCP 在 401 时展示。"""
    total = len(cookies)
    if total == 0:
        return "未读取到任何 Cookie（browser_cookie3 可能无法访问 Chrome Cookie 数据库）"

    missing = [k for k in critical_keys if k not in cookies]
    if not missing:
        return f"Cookie 键齐全（{total} 个），可能是 Cookie 已过期或接口权限变更"

    lines = [
        f"读到 {total} 个 Cookie，但缺少关键认证项: {', '.join(missing)}",
    ]
    if DATA_SUITE_AUTH_KEY in missing:
        lines.append(MAC_CHROME_ENCRYPT_HINT)
        lines.append(CDP_9222_HINT)
    return "\n".join(lines)
