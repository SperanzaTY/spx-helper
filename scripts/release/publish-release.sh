#!/bin/bash

# SPX Helper v2.6.8 发布脚本（简化版）
# 使用环境变量 GITHUB_TOKEN

set -e

VERSION="2.6.8"
REPO="SperanzaTY/spx-helper"
RELEASE_FILE="SPX_Helper_v${VERSION}.zip"
RELEASE_NOTES="release_notes_v${VERSION}.md"

echo "🚀 SPX Helper v${VERSION} 发布脚本"
echo "===================================="
echo ""

# 检查环境变量
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ 错误: 请设置 GITHUB_TOKEN 环境变量"
    echo ""
    echo "使用方法:"
    echo "  export GITHUB_TOKEN='your_token_here'"
    echo "  ./publish-release.sh"
    echo ""
    echo "或者一行命令:"
    echo "  GITHUB_TOKEN='your_token_here' ./publish-release.sh"
    exit 1
fi

# 检查文件是否存在
if [ ! -f "${RELEASE_FILE}" ]; then
    echo "❌ 错误: ${RELEASE_FILE} 不存在"
    exit 1
fi

if [ ! -f "${RELEASE_NOTES}" ]; then
    echo "❌ 错误: ${RELEASE_NOTES} 不存在"
    exit 1
fi

echo "✅ 所有文件检查通过"
echo ""

# 步骤 1: 推送代码
echo "📤 [1/4] 推送代码到 GitHub..."
if git push https://${GITHUB_TOKEN}@github.com/${REPO}.git main 2>&1; then
    echo "✅ 代码推送成功"
else
    echo "⚠️  代码推送失败或已是最新"
fi
echo ""

# 步骤 2: 推送标签
echo "📤 [2/4] 推送标签 v${VERSION}..."
if git push https://${GITHUB_TOKEN}@github.com/${REPO}.git v${VERSION} 2>&1; then
    echo "✅ 标签推送成功"
else
    echo "⚠️  标签推送失败或已存在"
fi
echo ""

# 步骤 3: 创建 Release
echo "📦 [3/4] 创建 GitHub Release..."

# 读取发布说明并转换为 JSON 格式
RELEASE_BODY=$(cat "${RELEASE_NOTES}" | jq -Rs .)

# 创建 Release JSON
RELEASE_JSON=$(cat <<EOF
{
  "tag_name": "v${VERSION}",
  "name": "SPX Helper v${VERSION}",
  "body": ${RELEASE_BODY},
  "draft": false,
  "prerelease": false
}
EOF
)

# 调用 GitHub API 创建 Release
RELEASE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/${REPO}/releases \
  -d "${RELEASE_JSON}")

# 分离响应体和状态码
HTTP_BODY=$(echo "$RELEASE_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RELEASE_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" -eq 201 ]; then
    echo "✅ Release 创建成功"
    RELEASE_ID=$(echo "$HTTP_BODY" | grep -o '"id": [0-9]*' | head -1 | awk '{print $2}')
    echo "   Release ID: ${RELEASE_ID}"
elif [ "$HTTP_CODE" -eq 422 ]; then
    echo "⚠️  Release 已存在，尝试获取现有 Release..."
    EXISTING_RELEASE=$(curl -s \
      -H "Authorization: token ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github.v3+json" \
      https://api.github.com/repos/${REPO}/releases/tags/v${VERSION})
    RELEASE_ID=$(echo "$EXISTING_RELEASE" | grep -o '"id": [0-9]*' | head -1 | awk '{print $2}')
    echo "   使用现有 Release ID: ${RELEASE_ID}"
else
    echo "❌ 创建 Release 失败 (HTTP ${HTTP_CODE})"
    echo "$HTTP_BODY"
    exit 1
fi
echo ""

# 步骤 4: 上传发布包
echo "📤 [4/4] 上传发布包 ${RELEASE_FILE}..."
UPLOAD_URL="https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${RELEASE_FILE}"

UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Content-Type: application/zip" \
  --data-binary @"${RELEASE_FILE}" \
  "${UPLOAD_URL}")

UPLOAD_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n 1)

if [ "$UPLOAD_CODE" -eq 201 ]; then
    echo "✅ 发布包上传成功"
else
    echo "⚠️  发布包上传失败 (HTTP ${UPLOAD_CODE})"
    echo "   可能已经上传过了"
fi

echo ""
echo "🎉 发布流程完成！"
echo ""
echo "🔗 查看 Release: https://github.com/${REPO}/releases/tag/v${VERSION}"
echo "📦 下载地址: https://github.com/${REPO}/releases/download/v${VERSION}/${RELEASE_FILE}"
echo ""
