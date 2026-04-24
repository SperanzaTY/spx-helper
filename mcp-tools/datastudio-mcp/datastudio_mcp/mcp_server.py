#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json

from fastmcp import FastMCP
from .datastudio_client.datastudio_api_client import DataStudioAPIClient
from .datastudio_client.datastudio_util import DataStudioUtil

# 创建 MCP 服务器
mcp = FastMCP("DataStudio MCP Server")

DEFAULT_SEARCH_ROOTS = [
    "//Workflows/",
    "//Scheduled Tasks/",
    "//Manual Tasks/",
    "//Templates/",
]


def _json_result(payload) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _extract_detail_data(detail):
    if isinstance(detail, dict) and isinstance(detail.get("data"), dict):
        return detail["data"]
    return detail if isinstance(detail, dict) else {}


def _line_window(content: str, start_line: int = 1, limit: int = 500):
    lines = (content or "").splitlines()
    total = len(lines)
    start_line = max(1, int(start_line or 1))
    limit = max(1, min(int(limit or 500), 5000))
    end_line = min(total, start_line + limit - 1)
    selected = lines[start_line - 1:end_line] if total else []
    return {
        "content": "\n".join(selected),
        "lineStart": start_line if total else 0,
        "lineEnd": end_line if total else 0,
        "totalLines": total,
        "truncated": end_line < total,
    }

def _determine_environment(project_code: str) -> str:
    """
    根据project_code自动判断环境
    
    Args:
        project_code: 项目代码
        
    Returns:
        环境名称 ('shopee' or 'ldn')
    """
    # LDN项目使用ldn环境，其他使用shopee环境
    return 'ldn' if project_code == 'ldn' else 'shopee'

def get_util_for_project(project_code: str):
    """
    根据项目代码获取对应环境的工具实例
    
    Args:
        project_code: 项目代码
        
    Returns:
        DataStudioUtil实例
    """
    environment = _determine_environment(project_code)
    client = DataStudioAPIClient(environment=environment)
    return DataStudioUtil(client)

def get_client_for_project(project_code: str):
    """
    根据项目代码获取对应环境的客户端实例
    
    Args:
        project_code: 项目代码
        
    Returns:
        DataStudioAPIClient实例
    """
    environment = _determine_environment(project_code)
    return DataStudioAPIClient(environment=environment)

@mcp.tool()
def copy_assets_to_local(path: str, project_code: str) -> str:
    """
    从 DataStudio 复制资产到本地文件系统
    
    将指定路径下的所有资产（SQL 文件、脚本等）下载到根据PATH_MAPPING映射的本地目录。
    资产会保持原有的目录结构，文件会根据资产类型自动添加扩展名。
    
    参数:
        path: DataStudio 源路径，必须以正确的前缀开头
              支持的格式：
              - //Workflows/xxx/          (工作流)
              - //Scheduled Tasks/xxx/    (定时任务)
              - //Manual Tasks/xxx/       (手动任务)
              - //Resources/xxx/          (资源)
              - //Templates/xxx/          (模板)
              示例: "//Templates/seamoney_credit_mart/behavior/"

        project_code: DataStudio 项目代码，必填，可选值: "credit_mart", "credit_fund" 等
    
    返回:
        成功时返回成功消息，失败时返回错误信息
        
    注意:
        - 需要确保 DataStudio Cookie 已配置且有效
        - 目标目录如果不存在会自动创建
        - 会覆盖同名文件
        - 仅支持有文本内容的资产, 例如pyspark任务复制下来会没有内容
    """
    try:
        # 根据project_code自动选择环境
        util = get_util_for_project(project_code)
        util.copy_assets_to_local(path, project_code)
        return f"成功复制..."
    except Exception as e:
        return f"错误: {str(e)}"

@mcp.tool()
def sync_file_to_local(datastudio_path: str, project_code: str) -> str:
    """
    同步单个文件从 DataStudio 到本地
    
    将指定的 DataStudio 文件同步到本地文件系统，包括文件内容和配置。
    会自动根据 PATH_MAPPING 确定本地保存路径。
    
    参数:
        datastudio_path: DataStudio 文件的完整路径
                        格式: //Templates/test/test_spark1.sql
                        必须包含完整的前缀（//Workflows/、//Templates/ 等）
                        
        project_code: DataStudio 项目代码，必填
                     可选值: "credit_mart", "credit_fund" 等
    
    返回:
        成功时返回同步信息（JSON 格式），失败时返回错误信息
        
    注意:
        - 需要确保 DataStudio Cookie 已配置且有效
        - 会自动创建本地目录结构
        - 会保存配置文件到 conf/ 子目录
        - 本地路径由 PATH_MAPPING 配置决定
    """
    try:
        # 根据project_code自动选择环境
        util = get_util_for_project(project_code)
        result = util.sync_file_to_local(datastudio_path, project_code)
        return json.dumps({
            "success": True,
            "message": "文件同步成功",
            "data": result
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False, indent=2)

@mcp.tool()
def list_assets_by_path(path: str, project_code: str) -> str:
    """
    列出指定路径下的所有资产
    
    返回路径下所有叶子节点资产的详细信息，包括资产 ID、名称、类型、完整路径等。
    
    参数:
        path: DataStudio 路径，格式同 copy_assets_to_local
              示例: "//Templates/seamoney_credit_mart/"
              
        project_code: 项目代码，必填
    
    返回:
        JSON 字符串，包含资产列表
        格式: {"path": "...", "total_count": 10, "assets": [...]}
    """
    try:
        # 根据project_code自动选择环境
        util = get_util_for_project(project_code)
        assets = util.get_leaf_assets_by_path(path=path, project_code=project_code)
        
        result = {
            "path": path,
            "project_code": project_code,
            "total_count": len(assets),
            "assets": assets
        }
        
        import json
        return json.dumps(result, ensure_ascii=False, indent=2)
        
    except Exception as e:
        import json
        return json.dumps({"error": str(e)}, ensure_ascii=False)

@mcp.tool()
def refresh_cookies_from_browser(browser: str = "chrome", environment: str = "shopee") -> str:
    """
    从浏览器刷新 Cookie
    
    当 Cookie 过期或失效时，可以从浏览器中重新导入 Cookie。
    可以在浏览器中重新打开要下载的Asset所属的Project, 以重新刷新Cooike。
    
    参数:
        browser: 浏览器类型，默认 "chrome"
                可选值: "chrome", "edge", "firefox" 等
        environment: 环境名称，默认 "shopee"
                    可选值: "shopee", "ldn"
                    根据要刷新哪个环境的Cookie来选择
    
    返回:
        刷新结果信息（成功或失败消息）
    """
    try:
        client = DataStudioAPIClient(environment=environment)
        success = client.cookie_manager.import_from_browser(browser, environment=environment)
        
        if success:
            return f"成功从 {browser} 浏览器刷新 {environment} 环境的 Cookie"
        else:
            return f"从 {browser} 浏览器刷新 {environment} 环境的 Cookie 失败"
        
    except Exception as e:
        return f"刷新 Cookie 失败: {str(e)}"


@mcp.tool()
def read_datastudio_asset(
    asset_id: int,
    project_code: str,
    start_line: int = 1,
    limit: int = 500,
    include_metadata: bool = True,
) -> str:
    """
    按 assetId 读取 DataStudio 文件内容。

    用途:
        - 让 agent 查看现有 SQL / Shell / Python 任务内容
        - 替代依赖浏览器当前打开文件的前端 read_asset_content

    参数:
        asset_id: DataStudio assetId
        project_code: DataStudio 项目代码，例如 spx_datamart
        start_line: 起始行，默认 1
        limit: 最多返回行数，默认 500，最大 5000
        include_metadata: 是否返回 asset 元信息，默认 True
    """
    try:
        util = get_util_for_project(project_code)
        detail = util.get_file_detail(asset_id, project_code)
        data = _extract_detail_data(detail)
        content = data.get("content") or ""
        window = _line_window(content, start_line=start_line, limit=limit)
        result = {
            "success": True,
            "project_code": project_code,
            "assetId": asset_id,
            **window,
        }
        if include_metadata:
            result["metadata"] = {
                "assetName": data.get("assetName") or data.get("name"),
                "assetType": data.get("assetType"),
                "assetRoot": data.get("assetRoot"),
                "idcRegion": data.get("idcRegion"),
                "currentVersion": data.get("currentVersion"),
                "lockHolder": data.get("lockHolder") or data.get("lockHolderAccount"),
                "updatedBy": data.get("updatedBy") or data.get("updateBy"),
                "updatedTime": data.get("updatedTime") or data.get("updateTime"),
            }
        return _json_result(result)
    except Exception as e:
        return _json_result({"success": False, "error": str(e)})


@mcp.tool()
def search_datastudio_assets(
    keyword: str,
    project_code: str,
    path: str = "",
    max_results: int = 20,
    search_content: bool = False,
    max_assets_to_scan: int = 200,
) -> str:
    """
    搜索 DataStudio 资产。

    默认按资产名和路径搜索；如需搜索 SQL 内容，可设置 search_content=true，
    但会逐个读取文件详情，建议配合 path 限定目录。

    参数:
        keyword: 搜索关键词，例如 fleet_order
        project_code: DataStudio 项目代码，例如 spx_datamart
        path: 可选路径，例如 //Templates/spx_datamart/；为空时搜索常用根目录
        max_results: 最多返回结果数，默认 20，最大 100
        search_content: 是否搜索文件内容，默认 False
        max_assets_to_scan: search_content=true 时最多读取多少个资产，默认 200
    """
    keyword = (keyword or "").strip()
    if not keyword:
        return _json_result({"success": False, "error": "keyword 不能为空"})

    try:
        util = get_util_for_project(project_code)
        roots = [path] if path else DEFAULT_SEARCH_ROOTS
        assets = []
        errors = []
        for root in roots:
            try:
                assets.extend(util.get_leaf_assets_by_path(root, project_code))
            except Exception as exc:
                errors.append({"path": root, "error": str(exc)})

        keyword_lower = keyword.lower()
        max_results = max(1, min(int(max_results), 100))
        max_assets_to_scan = max(1, min(int(max_assets_to_scan), 2000))
        hits = []
        scanned_content = 0

        for asset in assets:
            if len(hits) >= max_results:
                break
            name = str(asset.get("name") or "")
            asset_path = str(asset.get("path") or "")
            haystack = f"{name}\n{asset_path}".lower()
            match_type = None
            snippet = ""

            if keyword_lower in haystack:
                match_type = "name_or_path"
            elif search_content and scanned_content < max_assets_to_scan:
                scanned_content += 1
                try:
                    detail = util.get_file_detail(int(asset.get("id")), project_code)
                    data = _extract_detail_data(detail)
                    content = str(data.get("content") or "")
                    idx = content.lower().find(keyword_lower)
                    if idx >= 0:
                        match_type = "content"
                        start = max(0, idx - 160)
                        end = min(len(content), idx + len(keyword) + 240)
                        snippet = content[start:end].replace("\n", "\\n")
                except Exception:
                    pass

            if match_type:
                hits.append({
                    "assetId": asset.get("id"),
                    "assetName": name,
                    "assetType": asset.get("type"),
                    "path": asset_path,
                    "matchType": match_type,
                    "snippet": snippet,
                })

        return _json_result({
            "success": True,
            "project_code": project_code,
            "keyword": keyword,
            "path": path or "(common roots)",
            "totalAssetsLoaded": len(assets),
            "scannedContent": scanned_content,
            "returned": len(hits),
            "hits": hits,
            "errors": errors,
        })
    except Exception as e:
        return _json_result({"success": False, "error": str(e)})


@mcp.tool()
def create_file(local_file_path: str, asset_type: int, project_code: str) -> str:
    """
    创建新文件到 DataStudio
    
    将本地文件上传到 DataStudio 并创建为新资产。如果文件已存在会报错。
    
    参数:
        local_file_path: 本地文件的绝对路径
                        示例: "/Users/jialiang.nie/CurosrProject/credit_fund/Templates/test/test.sql"
                        
        asset_type: 资产类型（必填）
                   常用类型:
                   - 21: Spark SQL
                   - 22: PySpark
                   - 23: Presto SQL
                   - 24: Shell
                   - 41: Template Spark SQL
                   - 42: Template PySpark
                   - 43: Template Presto SQL
                   - 49: Template SSH
                        
        project_code: DataStudio 项目代码，必填
                     可选值: "credit_fund", "credit_mart", "credit_promotion" 等
    
    返回:
        成功时返回成功消息（包含asset_id等信息），失败时返回错误信息
        
    注意:
        - 需要确保 DataStudio Cookie 已配置且有效
        - 文件必须在 PATH_MAPPING 配置的目录中
        - 如果文件已存在于 DataStudio，会报错并提示使用 update_file
        - 会自动创建本地 conf 目录并保存配置文件
    """
    try:
        # 根据project_code自动选择环境
        util = get_util_for_project(project_code)
        result = util.create_file(local_file_path, asset_type, project_code)
        return json.dumps({
            "success": True,
            "message": "文件创建成功",
            "data": result
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False, indent=2)

@mcp.tool()
def unlock_file(asset_id: int, project_code: str) -> str:
    """
    解锁 DataStudio 文件
    
    当文件被锁定时（如其他用户正在编辑），使用此工具解锁文件。
    
    参数:
        asset_id: 资产 ID（整数）
                 可从本地 conf 配置文件的 assetId 字段获取
                 
        project_code: DataStudio 项目代码，必填
                     可选值: "credit_fund", "credit_mart", "credit_promotion" 等
    
    返回:
        成功时返回成功消息，失败时返回错误信息
        
    注意:
        - 需要确保 DataStudio Cookie 已配置且有效
        - 只能解锁有权限的文件
        - 解锁后可能会丢失其他用户未保存的修改
    """
    try:
        # 根据project_code自动选择环境
        util = get_util_for_project(project_code)
        result = util.unlock_file(asset_id, project_code)
        return json.dumps({
            "success": True,
            "message": "文件解锁成功",
            "data": result
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False, indent=2)

@mcp.tool()
def update_file(local_file_path: str, project_code: str) -> str:
    """
    更新已存在的文件到 DataStudio
    
    将本地文件内容上传到 DataStudio 更新已存在的资产。如果文件不存在会报错。
    
    参数:
        local_file_path: 本地文件的绝对路径
                        示例: "/Users/jialiang.nie/CurosrProject/credit_fund/Templates/test/test.sql"
                        
        project_code: DataStudio 项目代码，必填
                     可选值: "credit_fund", "credit_mart", "credit_promotion" 等
    
    返回:
        成功时返回成功消息（包含asset_id等信息），失败时返回错误信息
        
    注意:
        - 需要确保 DataStudio Cookie 已配置且有效
        - 文件必须在 PATH_MAPPING 配置的目录中
        - 如果文件不存在于 DataStudio，会报错并提示使用 create_file
        - 需要本地存在对应的 conf 配置文件（通过 copy_assets_to_local 获取）
        - 会自动更新本地 conf 文件的 content 字段
    """
    try:
        # 根据project_code自动选择环境
        util = get_util_for_project(project_code)
        result = util.update_file(local_file_path, project_code)
        return json.dumps({
            "success": True,
            "message": "文件更新成功",
            "data": result
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False, indent=2)

def main():
    """主函数入口点"""
    mcp.run()

if __name__ == "__main__":
    main()
