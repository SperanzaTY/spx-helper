#!/bin/bash
# notify-release.sh — 发版后向 SeaTalk 群发送更新通知
#
# 工作方式:
#   1. AI Agent 在提交时生成 .release-notification 文件（自然语言描述）
#   2. scripts/finish-release-push.sh 在 git push gitlab 成功之后调用本脚本
#   3. 本脚本读取文件内容，POST 到 SeaTalk webhook，然后删除文件
#
# 手动使用:
#   echo "测试消息" > .release-notification && bash scripts/notify-release.sh
#
# 环境变量覆盖:
#   SEATALK_RELEASE_WEBHOOK — 自定义 webhook URL（可选）

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NOTIFICATION_FILE="$REPO_ROOT/.release-notification"
WEBHOOK_URL="${SEATALK_RELEASE_WEBHOOK:-https://openapi.seatalk.io/webhook/group/qxDm40JES2myWajP23HAwA}"

if [ ! -f "$NOTIFICATION_FILE" ]; then
  exit 0
fi

if [ ! -s "$NOTIFICATION_FILE" ]; then
  rm -f "$NOTIFICATION_FILE"
  exit 0
fi

# 直接从文件读入并 JSON 转义，避免经 shell 变量传递多行/引号导致截断或异常
PAYLOAD=$(python3 -c "
import json, sys
path = sys.argv[1]
with open(path, encoding='utf-8') as f:
    content = f.read()
if not content.strip():
    sys.exit(0)
print(json.dumps({'tag': 'text', 'text': {'content': content}}, ensure_ascii=False))
" "$NOTIFICATION_FILE") || exit 1

if [ -z "$PAYLOAD" ]; then
  rm -f "$NOTIFICATION_FILE"
  exit 0
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$WEBHOOK_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo "[OK] Release notification sent to SeaTalk group"
  rm -f "$NOTIFICATION_FILE"
else
  echo "[WARNING] Failed to send release notification (HTTP $HTTP_CODE), file kept for retry"
fi
