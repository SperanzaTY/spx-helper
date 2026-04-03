#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
配置文件
管理API配置和敏感信息
"""

import os
from typing import Dict, Any

# API基础配置 - 支持多环境
API_ENVIRONMENTS = {
    'shopee': {
    'base_url': 'https://datasuite.shopee.io',
        'domain': 'datasuite.shopee.io',  # Cookie域名
        'project_code_header': None,  # Shopee不需要特殊header
        'default_projects': ['credit_mart', 'credit_fund', 'credit_promotion'],
    'endpoints': {
        'asset_trees': '/datastudio/api/v1/asset/trees',
        'asset_rename': '/datastudio/api/v1/asset/rename',  # 资产重命名端点
        'file_detail': '/datastudio/api/v1/file/detail',  # 文件详情端点
        'file_save': '/datastudio/api/v1/file/save',  # 文件保存端点
        'file_reload_template_config': '/datastudio/api/v1/file/reloadTemplateConfig',  # 模板配置重载端点
        'template_get_all_tasks': '/datastudio/api/v1/template/getAllTasks',  # 获取模板下所有子任务
        'asset_get_info_by_id_list': '/datastudio/api/v1/asset/getAssetInfoByIdList',  # 根据assetId列表批量获取asset基本信息
        'settings_get_by_asset_ids': '/datastudio/api/v1/settings/getByAssetIds',  # 根据templateId和assetIds获取子任务详细配置信息(POST)
        'asset_create': '/datastudio/api/v1/asset/create',  # 创建资产(POST) body: {assetType, assetName, parentId}
        'file_unlock': '/datastudio/api/v1/file/unlock',  # 解锁文件(POST) params: {assetId}
        'resource_save': '/datastudio/api/v1/resource/save',  # Resource类型文件保存(POST) body: {assetId, content}
    },
        'timeout': 30,
    },
    'ldn': {
        'base_url': 'https://datasuite.di.lenteradana.co.id',
        'domain': 'datasuite.di.lenteradana.co.id',  # Cookie域名
        'project_code_header': 'studio-project-code',  # LDN使用特殊header传递project_code
        'default_projects': ['ldn'],
        'endpoints': {
            'asset_trees': '/datastudio/api/v1/asset/trees',  # 资产树
            'asset_rename': '/datastudio/api/v1/asset/rename',  # 资产重命名端点
            'file_detail': '/datastudio/api/v1/file/detail',  # 文件详情端点
            'file_save': '/datastudio/api/v1/file/save',  # 文件保存端点
            'file_reload_template_config': '/datastudio/api/v1/file/reloadTemplateConfig',  # 模板配置重载端点
            'template_get_all_tasks': '/datastudio/api/v1/template/getAllTasks',  # 获取模板下所有子任务
            'asset_get_info_by_id_list': '/datastudio/api/v1/asset/getAssetInfoByIdList',  # 根据assetId列表批量获取asset基本信息
            'settings_get_by_asset_ids': '/datastudio/api/v1/settings/getByAssetIds',  # 根据templateId和assetIds获取子任务详细配置信息(POST)
            'asset_create': '/datastudio/api/v1/asset/create',  # 创建资产(POST) body: {assetType, assetName, parentId}
            'file_unlock': '/datastudio/api/v1/file/unlock',  # 解锁文件(POST) params: {assetId}
            'resource_save': '/datastudio/api/v1/resource/save',  # Resource类型文件保存(POST) body: {assetId, content}
        },
        'timeout': 30,
    }
}

# 默认环境配置（向后兼容）
DEFAULT_ENVIRONMENT = 'shopee'

# 兼容旧代码的API_CONFIG（指向shopee环境）
API_CONFIG = {
    'base_url': API_ENVIRONMENTS['shopee']['base_url'],
    'endpoints': API_ENVIRONMENTS['shopee']['endpoints'],
    'timeout': API_ENVIRONMENTS['shopee']['timeout'],
}

def get_api_config(environment: str = None) -> dict:
    """
    获取指定环境的API配置
    
    Args:
        environment: 环境名称，可选值: 'shopee', 'ldn'。如果为None则使用默认环境
        
    Returns:
        API配置字典
        
    Raises:
        ValueError: 如果指定的环境不存在
        
    Examples:
        >>> config = get_api_config('ldn')
        >>> base_url = config['base_url']
        >>> endpoints = config['endpoints']
    """
    if environment is None:
        environment = DEFAULT_ENVIRONMENT
    
    if environment not in API_ENVIRONMENTS:
        raise ValueError(
            f"未知的环境: {environment}。"
            f"可用环境: {', '.join(API_ENVIRONMENTS.keys())}"
        )
    
    return API_ENVIRONMENTS[environment]

def get_project_code_header(environment: str = None) -> str:
    """
    获取指定环境的project_code header名称
    
    Args:
        environment: 环境名称
        
    Returns:
        header名称，如果该环境不需要特殊header则返回None
    """
    config = get_api_config(environment)
    return config.get('project_code_header')

# DataStudio路径到本地路径的映射配置
# 格式: {project_code: {rootType: local_base_path}}
# 从环境变量获取基础路径
def _get_base_path() -> str:
    """从环境变量获取基础路径，如果未配置则抛出异常"""
    base_path = os.getenv('DATASTUDIO_BASE_PATH')
    if not base_path:
        raise EnvironmentError(
            "环境变量 DATASTUDIO_BASE_PATH 未配置！\n"
            "请在 mcp.json 中配置，例如：\n"
            '{\n'
            '  "mcpServers": {\n'
            '    "datastudio": {\n'
            '      "env": {\n'
            '        "DATASTUDIO_BASE_PATH": "/Users/your_name/CurosrProject",\n'
            '        "DATASTUDIO_PROJECTS": "credit_fund,credit_mart"\n'
            '      }\n'
            '    }\n'
            '  }\n'
            '}'
        )
    return os.path.abspath(base_path)

def _generate_path_mapping() -> Dict[str, Dict[str, str]]:
    """
    动态生成路径映射
    
    从环境变量 DATASTUDIO_PROJECTS 读取项目列表
    支持的 rootType: Workflows, Scheduled Tasks, Manual Tasks, Resources, Templates
    """
    # 从环境变量读取项目列表
    projects_env = os.getenv('DATASTUDIO_PROJECTS')
    if not projects_env:
        raise EnvironmentError(
            "环境变量 DATASTUDIO_PROJECTS 未配置！\n"
            "请在 mcp.json 中配置，例如：\n"
            '{\n'
            '  "mcpServers": {\n'
            '    "datastudio": {\n'
            '      "env": {\n'
            '        "DATASTUDIO_BASE_PATH": "/Users/your_name/CurosrProject",\n'
            '        "DATASTUDIO_PROJECTS": "credit_fund,credit_mart,credit_uc"\n'
            '      }\n'
            '    }\n'
            '  }\n'
            '}'
        )
    
    projects = [p.strip() for p in projects_env.split(',') if p.strip()]
    
    if not projects:
        raise ValueError("DATASTUDIO_PROJECTS 环境变量不能为空")
    
    # DataStudio 支持的 rootType 列表
    root_types = ['Workflows', 'Scheduled Tasks', 'Manual Tasks', 'Resources', 'Templates']
    
    mapping = {}
    for project in projects:
        mapping[project] = {}
        for root_type in root_types:
            # 将 "Scheduled Tasks" 转换为目录名 "ScheduledTasks"
            dir_name = root_type.replace(' ', '')
            mapping[project][root_type] = os.path.join(BASE_PATH, f'{project}/{dir_name}')
    
    return mapping

BASE_PATH = _get_base_path()
PATH_MAPPING = _generate_path_mapping()

# rootType名称到数字的映射
ROOT_TYPE_NAME_TO_ID = {
    'Workflows': 1,
    'Scheduled Tasks': 2,
    'Manual Tasks': 3,
    'Data Exploration': 4,
    'Resources': 5,
    'Templates': 6
}

# rootType数字到名称的映射
ROOT_TYPE_ID_TO_NAME = {v: k for k, v in ROOT_TYPE_NAME_TO_ID.items()}

# 类型名称到assetType的映射
ASSET_TYPE_NAME_TO_ID = {
    # 目录类型
    'Directory': 1,
    'Workflow': 2,
    
    # Task类型
    'Spark JAR': 20,
    'Spark SQL': 21,
    'PySpark': 22,
    'Presto SQL': 23,
    'Shell': 24,
    'Virtual': 25,
    'SSH Task': 29,
    'ClickHouse Task': 34,
    'Notebook': 36,
    
    # Resources类型
    'Jar Resource': 30,
    'Python Resource': 31,
    
    # Template类型
    'Template Spark JAR': 40,
    'Template Spark SQL': 41,
    'Template PySpark': 42,
    'Template Presto SQL': 43,
    'Template SSH': 49,
}
# assetType数字到名称的映射
ASSET_TYPE_ID_TO_NAME = {v: k for k, v in ASSET_TYPE_NAME_TO_ID.items()}

# 请求头配置
DEFAULT_HEADERS = {
    'accept': '*/*',
    'accept-language': 'zh,en-US;q=0.9,en;q=0.8',
    'priority': 'u=1, i',
    'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
}

def get_auth_cookies() -> Dict[str, str]:
    """
    从环境变量获取认证cookies（已废弃，改用 chrome-auth 自动获取）。
    保留此函数仅用于向后兼容。
    """
    return {}

def get_project_headers(project_code: str) -> Dict[str, str]:
    """
    获取项目相关的请求头 - 支持多环境
    
    Args:
        project_code: 项目代码，必填参数
        
    Returns:
        包含项目信息的请求头字典
    """
    
    # 根据project_code判断环境并使用对应的域名
    if project_code == 'ldn':
        base_url = 'https://datasuite.di.lenteradana.co.id'
    else:
        base_url = 'https://datasuite.shopee.io'
    
    headers = DEFAULT_HEADERS.copy()
    headers.update({
        'referer': f"{base_url}/studio?project_code={project_code}",
        'studio-project-code': project_code
    })
    
    return headers

# API端点配置
API_ENDPOINTS = {
    'asset_trees': '/datastudio/api/v1/asset/trees',
    # 可以在这里添加更多API端点
}

def get_full_url(endpoint_name: str) -> str:
    """
    获取完整的API URL
    
    Args:
        endpoint_name: 端点名称 ('asset_trees', 'asset_rename')
        
    Returns:
        完整的URL
    """
    if endpoint_name not in API_CONFIG['endpoints']:
        raise ValueError(f"未知的端点: {endpoint_name}")
    
    return API_CONFIG['base_url'] + API_CONFIG['endpoints'][endpoint_name]

def get_local_path(project_code: str, root_type_name: str, sub_path: str = '') -> str:
    """
    根据项目代码和rootType获取本地路径
    
    Args:
        project_code: 项目代码 (如 'credit_fund', 'credit_mart')
        root_type_name: rootType名称 (如 'Templates', 'Workflows')
        sub_path: 子路径 (可选)
        
    Returns:
        完整的本地路径
        
    Raises:
        ValueError: 项目或rootType不存在
    """
    if project_code not in PATH_MAPPING:
        raise ValueError(f"未配置项目: {project_code}")
    
    if root_type_name not in PATH_MAPPING[project_code]:
        raise ValueError(f"项目 {project_code} 未配置 rootType: {root_type_name}")
    
    base_path = PATH_MAPPING[project_code][root_type_name]
    
    if sub_path:
        return os.path.join(base_path, sub_path.strip('/'))
    return base_path

def get_datastudio_path(local_path: str) -> tuple[str, str, str]:
    """
    根据本地路径反向获取DataStudio路径信息
    
    Args:
        local_path: 本地文件路径
        
    Returns:
        (project_code, root_type_name, relative_path) 元组
        
    Raises:
        ValueError: 路径不在配置的映射中
    """
    local_path = os.path.abspath(local_path)
    
    for project_code, root_types in PATH_MAPPING.items():
        for root_type_name, base_path in root_types.items():
            if local_path.startswith(base_path):
                relative_path = os.path.relpath(local_path, base_path)
                return project_code, root_type_name, relative_path
    
    raise ValueError(f"路径不在配置的映射中: {local_path}") 