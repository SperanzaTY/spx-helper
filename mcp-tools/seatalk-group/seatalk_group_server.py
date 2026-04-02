#!/usr/bin/env python3
"""
SeaTalk Group MCP Server - 批量拉群与群管理工具

通过 InfraBot API 实现 SeaTalk 群成员批量邀请。

前置条件:
  1. 目标群中已添加 infra-seatalk-bot@shopee.com 并设为管理员
  2. 在群中 @InfraBot 获取 Group ID（数字格式，如 4348248）
  3. 从 https://space.shopee.io/utility/seatalkbot/api-playground 获取 API Token

配置方式（在 mcp.json 中）:
{
  "seatalk-group": {
    "command": "python3",
    "args": ["/path/to/seatalk_group_server.py"],
    "env": {
      "INFRABOT_TOKEN": "infrabot.xxxxx"
    }
  }
}
"""

import json
import os
import sys
import time
from typing import Optional

import requests
from mcp.server.fastmcp import FastMCP

BASE_URL = "https://space.shopee.io/api/utility/seatalk"
BATCH_SIZE = 50
BATCH_DELAY_SEC = 1

INFRABOT_TOKEN = os.environ.get("INFRABOT_TOKEN", "")
if not INFRABOT_TOKEN:
    print("警告: 未设置 INFRABOT_TOKEN 环境变量，调用工具时需传入 token 参数", file=sys.stderr)

mcp = FastMCP("seatalk-group")


def _get_headers(token: Optional[str] = None) -> dict:
    t = token or INFRABOT_TOKEN
    if not t:
        raise ValueError(
            "未提供 InfraBot API Token。\n"
            "获取方式: https://space.shopee.io/utility/seatalkbot/api-playground → Get API Token\n"
            "配置方式: 环境变量 INFRABOT_TOKEN 或调用时传入 token 参数"
        )
    return {
        "Authorization": f"Bearer {t}",
        "Content-Type": "application/json",
    }


def _parse_emails(raw: str) -> list[str]:
    """从各种格式的文本中提取去重的邮箱列表。

    支持: 每行一个、逗号分隔、分号分隔、空格分隔、混合格式。
    自动跳过 # 开头的注释行。
    """
    emails: list[str] = []
    for line in raw.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        for part in line.replace(",", " ").replace(";", " ").replace("\t", " ").split():
            part = part.strip().strip('"').strip("'")
            if "@" in part:
                emails.append(part.lower())

    seen: set[str] = set()
    unique: list[str] = []
    for e in emails:
        if e not in seen:
            seen.add(e)
            unique.append(e)
    return unique


@mcp.tool()
def invite_to_group(
    group_id: int,
    emails: str,
    token: Optional[str] = None,
) -> str:
    """批量邀请用户加入 SeaTalk 群。

    通过 InfraBot API 将指定邮箱的用户批量拉入目标群。

    前置条件:
      1. 目标群中已添加 infra-seatalk-bot@shopee.com 并设为管理员
      2. 在群中 @InfraBot 获取 Group ID（纯数字，如 4348248）

    Args:
        group_id: SeaTalk 群 ID（纯数字，在群中 @InfraBot 可获取）
        emails: 邮箱列表，支持多种格式：
                - 逗号分隔: "a@shopee.com, b@shopee.com"
                - 每行一个: "a@shopee.com\\nb@shopee.com"
                - 空格分隔: "a@shopee.com b@shopee.com"
        token: InfraBot API Token（可选，优先使用环境变量 INFRABOT_TOKEN）

    Returns:
        邀请结果报告（成功/失败数量及详情）
    """
    try:
        headers = _get_headers(token)
    except ValueError as e:
        return str(e)

    email_list = _parse_emails(emails)
    if not email_list:
        return "错误: 未找到有效的邮箱地址。请提供 @shopee.com 格式的邮箱。"

    total = len(email_list)
    success_count = 0
    fail_count = 0
    failed_emails: list[str] = []
    results: list[str] = []

    results.append(f"Group ID: {group_id}")
    results.append(f"待邀请人数: {total}")
    results.append("")

    for i in range(0, total, BATCH_SIZE):
        batch = email_list[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

        results.append(f"[Batch {batch_num}/{total_batches}] 邀请 {len(batch)} 人:")
        for e in batch:
            results.append(f"  - {e}")

        payload = {
            "group_id": group_id,
            "user_emails": batch,
        }

        try:
            resp = requests.post(
                f"{BASE_URL}/group/invite",
                headers=headers,
                json=payload,
                timeout=30,
            )

            if resp.status_code in (200, 201):
                data = resp.json()
                if data.get("is_success"):
                    results.append(f"  -> 成功")
                    success_count += len(batch)
                else:
                    results.append(f"  -> API 返回失败: {json.dumps(data, ensure_ascii=False)}")
                    fail_count += len(batch)
                    failed_emails.extend(batch)
            else:
                results.append(f"  -> HTTP {resp.status_code}: {resp.text[:300]}")
                fail_count += len(batch)
                failed_emails.extend(batch)
        except requests.exceptions.RequestException as e:
            results.append(f"  -> 请求异常: {e}")
            fail_count += len(batch)
            failed_emails.extend(batch)

        if i + BATCH_SIZE < total:
            time.sleep(BATCH_DELAY_SEC)

    results.append("")
    results.append(f"完成! 总计: {total}, 成功: {success_count}, 失败: {fail_count}")
    if failed_emails:
        results.append(f"失败的邮箱: {', '.join(failed_emails)}")

    return "\n".join(results)


@mcp.tool()
def check_group_setup(group_id: int, token: Optional[str] = None) -> str:
    """检查群是否已正确配置 InfraBot（验证 API 连通性）。

    用于在批量拉人前验证:
      - InfraBot Token 是否有效
      - Group ID 是否正确
      - InfraBot 是否为群管理员

    Args:
        group_id: SeaTalk 群 ID
        token: InfraBot API Token（可选）

    Returns:
        检查结果
    """
    try:
        headers = _get_headers(token)
    except ValueError as e:
        return str(e)

    results: list[str] = [f"检查群 {group_id} 配置..."]

    try:
        resp = requests.post(
            f"{BASE_URL}/group/invite",
            headers=headers,
            json={"group_id": group_id, "user_emails": []},
            timeout=15,
        )
        results.append(f"API 响应: HTTP {resp.status_code}")
        results.append(f"响应内容: {resp.text[:500]}")

        if resp.status_code == 401:
            results.append("诊断: Token 无效或已过期，请重新获取")
            results.append("  -> https://space.shopee.io/utility/seatalkbot/api-playground")
        elif resp.status_code == 403:
            results.append("诊断: 无权限，请确认 InfraBot 是群管理员")
        elif resp.status_code in (200, 201):
            results.append("诊断: API 连通正常，Token 有效，可以开始批量邀请")
        else:
            results.append(f"诊断: 非预期响应，请检查 Group ID 是否正确")

    except requests.exceptions.RequestException as e:
        results.append(f"请求失败: {e}")
        results.append("诊断: 网络问题，请检查 VPN 连接")

    return "\n".join(results)


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
