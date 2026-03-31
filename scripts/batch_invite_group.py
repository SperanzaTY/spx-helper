#!/usr/bin/env python3
"""
SeaTalk 批量拉人入群脚本

通过 InfraBot API 将一批用户（邮箱列表）批量邀请进入指定的 SeaTalk 群。

前置条件:
  1. 创建 SeaTalk 群（你是群主或管理员）
  2. 将 infra-seatalk-bot@shopee.com 加入群并设为管理员
  3. 获取 Group ID（在群中 @InfraBot 获取，是纯数字如 4348248）
  4. 获取 API Token:
     - 访问 https://space.shopee.io/utility/seatalkbot/api-playground
     - 点击右上角 "Get API Token"

用法:
  # 从文件读取邮箱列表（每行一个邮箱，也支持逗号/分号/制表符分隔）
  python3 batch_invite_group.py --group-id 4348248 --file emails.txt

  # 直接传入邮箱
  python3 batch_invite_group.py --group-id 4348248 --emails a@shopee.com b@shopee.com

  # 指定 token（也可通过环境变量 INFRABOT_TOKEN 传入）
  python3 batch_invite_group.py --group-id 4348248 --file emails.txt --token YOUR_TOKEN

  # 预览模式（只显示将要邀请的人，不实际执行）
  python3 batch_invite_group.py --group-id 4348248 --file emails.txt --dry-run

  # 检查群配置是否正确（验证 token、group_id、InfraBot 权限）
  python3 batch_invite_group.py --group-id 4348248 --check

参考文档:
  - https://confluence.shopee.io/pages/viewpage.action?pageId=2315419510
  - https://confluence.shopee.io/pages/viewpage.action?pageId=2475474546
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("[ERROR] 需要安装 requests: pip3 install requests")
    sys.exit(1)

BASE_URL = "https://space.shopee.io/api/utility/seatalk"
BATCH_SIZE = 50
BATCH_DELAY_SEC = 2


def get_token(args_token: str | None) -> str:
    token = args_token or os.environ.get("INFRABOT_TOKEN", "")
    if not token:
        print("[ERROR] 未提供 API Token。")
        print("  获取方式: 访问 https://space.shopee.io/utility/seatalkbot/api-playground -> Get API Token")
        print("  传入方式: --token YOUR_TOKEN 或 export INFRABOT_TOKEN=YOUR_TOKEN")
        sys.exit(1)
    return token


def load_emails(file_path: str | None, cli_emails: list[str] | None) -> list[str]:
    emails: list[str] = []

    if file_path:
        p = Path(file_path)
        if not p.exists():
            print(f"[ERROR] 文件不存在: {file_path}")
            sys.exit(1)

        content = p.read_text(encoding="utf-8")

        for line in content.strip().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            for part in line.replace(",", " ").replace(";", " ").replace("\t", " ").split():
                part = part.strip().strip('"').strip("'")
                if "@" in part:
                    emails.append(part)

    if cli_emails:
        emails.extend(cli_emails)

    seen: set[str] = set()
    unique: list[str] = []
    for e in emails:
        e_lower = e.lower().strip()
        if e_lower and e_lower not in seen:
            seen.add(e_lower)
            unique.append(e_lower)

    return unique


def check_setup(token: str, group_id: str) -> None:
    """验证 token 和 group_id 是否可用。"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    print(f"检查群 {group_id} 配置...\n")

    try:
        resp = requests.post(
            f"{BASE_URL}/group/invite",
            headers=headers,
            json={"group_id": int(group_id), "user_emails": []},
            timeout=15,
        )
        print(f"  API 响应: HTTP {resp.status_code}")
        print(f"  响应内容: {resp.text[:500]}")

        if resp.status_code == 401:
            print("\n  [X] Token 无效或已过期，请重新获取:")
            print("      https://space.shopee.io/utility/seatalkbot/api-playground")
        elif resp.status_code == 403:
            print("\n  [X] 无权限。请确认 InfraBot 已加入群并设为管理员。")
        elif resp.status_code in (200, 201):
            print("\n  [OK] 配置正确，可以开始批量邀请。")
        else:
            print(f"\n  [?] 非预期响应，请确认 Group ID 是否正确（应为纯数字，在群中 @InfraBot 获取）。")
    except requests.exceptions.RequestException as e:
        print(f"  [X] 网络错误: {e}")
        print("      请检查 VPN 连接。")


def invite_users(token: str, group_id: str, emails: list[str], dry_run: bool = False) -> None:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    total = len(emails)
    success_count = 0
    fail_count = 0
    failed_emails: list[str] = []

    for i in range(0, total, BATCH_SIZE):
        batch = emails[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

        print(f"\n[Batch {batch_num}/{total_batches}] 邀请 {len(batch)} 人...")
        for e in batch:
            print(f"  - {e}")

        if dry_run:
            print("  [DRY-RUN] 跳过实际 API 调用")
            success_count += len(batch)
            continue

        payload = {
            "group_id": int(group_id),
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
                    print(f"  [OK] 邀请成功")
                    success_count += len(batch)
                else:
                    print(f"  [FAIL] API 返回: {json.dumps(data, ensure_ascii=False)}")
                    fail_count += len(batch)
                    failed_emails.extend(batch)
            elif resp.status_code == 401:
                print(f"  [FAIL] Token 无效或已过期，请重新获取")
                fail_count += len(batch)
                failed_emails.extend(batch)
                break
            else:
                print(f"  [FAIL] HTTP {resp.status_code}: {resp.text[:500]}")
                fail_count += len(batch)
                failed_emails.extend(batch)
        except requests.exceptions.RequestException as e:
            print(f"  [FAIL] 请求异常: {e}")
            fail_count += len(batch)
            failed_emails.extend(batch)

        if i + BATCH_SIZE < total:
            print(f"  等待 {BATCH_DELAY_SEC}s...")
            time.sleep(BATCH_DELAY_SEC)

    print("\n" + "=" * 50)
    print(f"完成! 总计: {total}, 成功: {success_count}, 失败: {fail_count}")
    if failed_emails:
        print(f"\n失败的邮箱:")
        for e in failed_emails:
            print(f"  - {e}")


def main():
    parser = argparse.ArgumentParser(
        description="SeaTalk 批量拉人入群（通过 InfraBot API）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--group-id", required=True,
                        help="SeaTalk 群 ID（纯数字，在群中 @InfraBot 获取）")
    parser.add_argument("--file", "-f",
                        help="邮箱列表文件（每行一个，支持逗号/分号/制表符分隔）")
    parser.add_argument("--emails", "-e", nargs="+",
                        help="直接传入邮箱列表")
    parser.add_argument("--token", "-t",
                        help="InfraBot API Token（或通过 INFRABOT_TOKEN 环境变量）")
    parser.add_argument("--dry-run", action="store_true",
                        help="预览模式，不实际调用 API")
    parser.add_argument("--check", action="store_true",
                        help="检查群配置（验证 token 和 group_id 是否可用）")

    args = parser.parse_args()

    token = get_token(args.token)

    if args.check:
        check_setup(token, args.group_id)
        return

    if not args.file and not args.emails:
        parser.error("请提供 --file 或 --emails（或使用 --check 检查配置）")

    emails = load_emails(args.file, args.emails)

    if not emails:
        print("[ERROR] 未找到有效的邮箱地址")
        sys.exit(1)

    print(f"Group ID: {args.group_id}")
    print(f"待邀请人数: {len(emails)}")
    if args.dry_run:
        print("[DRY-RUN 模式]")

    invite_users(token, args.group_id, emails, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
