from .datastudio_api_client import DataStudioAPIClient
from typing import Dict, Any, List, Tuple, Optional
import logging
import json
import requests
import os
import time
from .config import get_full_url, PATH_MAPPING, ROOT_TYPE_NAME_TO_ID, ROOT_TYPE_ID_TO_NAME

logger = logging.getLogger(__name__)

# DataStudio rootType 枚举映射
# 1 - Workflows (工作流)
# 2 - Scheduled Tasks (定时任务)
# 3 - Manual Tasks (手动任务)
# 4 - Data Exploration (数据探索)
# 5 - Resources (资源)
# 6 - Template (模板)

# DataStudio assetType 到文件扩展名的映射
ASSET_TYPE_EXTENSION_MAP = {
    # 目录的assetType
    1: '',           # Directory/Folder
    2: '',           # Directory/Workflow
    
    20: '.jar',      # Task - Spark JAR
    21: '.sql',      # Task - Spark SQL
    22: '.py',       # Task - PySpark
    23: '.sql',      # Task - Presto SQL
    24: '.sh',       # Task - Shell
    25: '.sql',      # Task - Virtual
    29: '.sh',       # Task - SSH Task
    34: '.sql',      # Task - ClickHouse Task
    36: '.ipynb',    # Task - Notebook
    30: '',          # Resources - Jar
    31: '',          # Resources - Python
    40: '.jar',      # Template - Spark JAR
    41: '.sql',      # Template - Spark SQL
    42: '.py',       # Template - PySpark
    43: '.sql',      # Template - Presto SQL
    49: '.sh',       # Template - SSH
}
DEFAULT_EXTENSION = '.sql'

class DataStudioUtil:
    def __init__(self, client: DataStudioAPIClient):
        self.client = client

    def parse_local_path_mapping(self, local_path: str) -> Tuple[str, str, str]:
        """
        解析本地路径，找到对应的PATH_MAPPING配置
        
        Args:
            local_path: 本地文件或目录路径
            
        Returns:
            (project_code, root_type_name, base_path) 元组
            
        Raises:
            ValueError: 路径不在PATH_MAPPING配置中
        """
        # 转换为绝对路径
        local_path = os.path.abspath(local_path)
        
        # 如果是文件路径，取其父目录
        if os.path.isfile(local_path):
            local_path = os.path.dirname(local_path)
        
        # 查找对应的project_code、root_type和base_path
        for project_code, root_types in PATH_MAPPING.items():
            for root_type_name, base_path in root_types.items():
                if local_path.startswith(base_path):
                    return project_code, root_type_name, base_path
        
        raise ValueError(
            f"本地路径 '{local_path}' 不在PATH_MAPPING配置的管理目录中\n"
            f"配置的目录: {PATH_MAPPING}"
        )

    def parse_datastudio_path_to_local(self, path: str, project_code: str) -> str:
        """
        解析DataStudio路径，获取对应的本地路径
        
        Args:
            path: DataStudio路径，例如：//Templates/seamoney_credit_mart/behavior/
            project_code: 项目代码
            
        Returns:
            对应的本地路径
            
        Raises:
            ValueError: 路径格式不正确或项目配置不存在
        """
        # 验证路径格式
        if not path.startswith('//'):
            raise ValueError(f"DataStudio路径必须以'//'开头: {path}")
        
        # 移除开头的'//'并分割路径
        path_parts = path[2:].strip('/').split('/')
        if not path_parts or not path_parts[0]:
            raise ValueError(f"DataStudio路径格式不正确: {path}")
        
        # 提取root_type_name
        root_type_name = path_parts[0]
        
        # 验证project_code是否在PATH_MAPPING中
        if project_code not in PATH_MAPPING:
            raise ValueError(f"项目代码 '{project_code}' 不在PATH_MAPPING配置中")
        
        # 验证root_type_name是否在项目配置中
        if root_type_name not in PATH_MAPPING[project_code]:
            available_types = list(PATH_MAPPING[project_code].keys())
            raise ValueError(
                f"项目 '{project_code}' 中不存在rootType '{root_type_name}'\n"
                f"可用的rootType: {available_types}"
            )
        
        # 获取本地基础路径
        base_path = PATH_MAPPING[project_code][root_type_name]
        
        # 如果有子路径，拼接到基础路径
        if len(path_parts) > 1:
            sub_path = '/'.join(path_parts[1:])
            return os.path.join(base_path, sub_path)
        else:
            return base_path

    def get_asset_trees(self, project_code: str, root_types: int = 1) -> Dict[str, Any]:
        """
        获取资产树数据
        
        Args:
            project_code: 项目代码， 如 "credit_fund"
            root_types: 根目录类型 (1-Workflows, 2-Scheduled Tasks, 3-Manual Tasks, 
                       4-Data Exploration, 5-Resources, 6-Template)，默认为 1
            
        Returns:
            API响应的JSON数据
            
        Raises:
            requests.RequestException: 请求异常
        """
        # 更新项目相关的请求头
        self.client._update_session_headers(project_code)
        
        # 使用client的base_url和endpoints（支持多环境）
        url = self.client.base_url + self.client.endpoints['asset_trees']
        params = {
            'projectCode': project_code,
            'rootTypes': root_types
        }
        
        try:
            logger.info(f"正在获取项目 {project_code} 的资产树数据...")
            response = self.client._make_request('GET', url, params=params)
            
            data = response.json()
            logger.info("资产树数据获取成功")
            return data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}")
            logger.error(f"响应内容: {response.text}")
            raise
        except Exception as e:
            logger.error(f"获取资产树数据失败: {e}")
            raise

    def sync_asset_tree_to_local(self, local_dir: str) -> str:
        """
        将DataStudio asset tree同步到本地目录
        
        Args:
            local_dir: 本地文件目录路径（可以是子目录或文件路径）
            
        Returns:
            保存的JSON文件路径
            
        Raises:
            ValueError: 本地目录不在PATH_MAPPING配置中
            requests.RequestException: API请求异常
        """
        # 解析本地路径，获取映射信息
        project_code, root_type_name, base_path = self.parse_local_path_mapping(local_dir)
        
        # 获取rootType数字
        root_type = ROOT_TYPE_NAME_TO_ID.get(root_type_name)
        if root_type is None:
            raise ValueError(f"未知的rootType名称: {root_type_name}")
        
        logger.info(f"检测到项目: {project_code}, rootType: {root_type_name} ({root_type})")
        logger.info(f"将同步到根目录: {base_path}")
        
        # 获取asset tree数据
        logger.info(f"正在从DataStudio获取asset tree...")
        tree_data = self.get_asset_trees(project_code, root_type)
        
        # 保存到PATH_MAPPING配置的根目录
        output_file = os.path.join(base_path, "datastudio_file_tree.json")
        self._ensure_dir_exists(base_path)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(tree_data.get('data', {}), f, indent=4, ensure_ascii=False)
        
        logger.info(f"Asset tree已同步到: {output_file}")
        return output_file

    def get_leaf_assets_by_path(self, path: str, project_code: str) -> List[Dict[str, Any]]:
        """
        根据路径获取该路径下所有最底层资产的信息
        
        Args:
            path: 路径，必须以正确的前缀开头：
                 - //Workflows/... (rootType=1)
                 - //Scheduled Tasks/... (rootType=2) 
                 - //Manual Tasks/... (rootType=3)
                 - //Resources/... (rootType=5)
                 - //Templates/... (rootType=6)
            project_code: 项目代码，默认为 "credit_fund"
            
        Returns:
            最底层资产信息列表，每个元素包含 {'id': asset_id, 'name': asset_name, 'type': asset_type, 'path': full_path}
            
        Raises:
            requests.RequestException: 请求异常
            ValueError: 路径格式错误或未找到目标路径
        """
        # 根据路径前缀确定rootType和实际搜索路径
        root_type, search_path = self._determine_root_type_and_path(path)
        
        try:
            logger.info(f"正在查找路径 '{path}' 下的最底层资产...")
            
            # 使用正确的rootType获取资产树数据
            asset_tree_data = self.get_asset_trees(project_code, root_type)
            
            if not isinstance(asset_tree_data, dict) or 'data' not in asset_tree_data:
                raise ValueError("无效的资产树数据格式")
            
            # 查找目标路径下的所有最底层资产
            leaf_assets = self._find_leaf_assets_in_path(asset_tree_data['data'], search_path)
            
            if not leaf_assets:
                raise ValueError(f"路径 '{path}' 不存在或该路径下没有资产")
            
            logger.info(f"在路径 '{path}' 下找到 {len(leaf_assets)} 个最底层资产")
            return leaf_assets
            
        except Exception as e:
            logger.error(f"获取路径 '{path}' 下的最底层资产失败: {e}")
            raise
    
    def _determine_root_type_and_path(self, path: str) -> Tuple[int, str]:
        """
        根据路径前缀确定rootType和实际搜索路径
        
        Args:
            path: 完整的路径
            
        Returns:
            (root_type, search_path) 元组
            
        Raises:
            ValueError: 路径格式不正确
        """
        if path.startswith("//Workflows/"):
            return 1, path[12:]  # 移除 "//Workflows/"
        elif path.startswith("//Scheduled Tasks/"):
            return 2, path[18:]  # 移除 "//Scheduled Tasks/"
        elif path.startswith("//Manual Tasks/"):
            return 3, path[15:]  # 移除 "//Manual Tasks/"
        elif path.startswith("//Resources/"):
            return 5, path[12:]  # 移除 "//Resources/"
        elif path.startswith("//Templates/"):
            return 6, path[12:]  # 移除 "//Templates/"
        else:
            raise ValueError(
                f"路径格式不正确: '{path}'\n"
                "支持的路径格式:\n"
                "  - //Workflows/... (工作流路径)\n"
                "  - //Scheduled Tasks/... (定时任务路径)\n"
                "  - //Manual Tasks/... (手动任务路径)\n"
                "  - //Resources/... (资源路径)\n"
                "  - //Templates/... (模板路径)"
            )
    
    def _find_leaf_assets_in_path(self, asset_data: List[Dict], target_path: str) -> List[Dict[str, Any]]:
        """
        在资产树中查找指定路径下的所有最底层资产
        
        Args:
            asset_data: 资产树数据
            target_path: 目标路径（已移除前缀）
            
        Returns:
            最底层资产信息列表
        """
        # 移除路径开头和结尾的斜杠，然后分割路径
        target_path = target_path.strip('/')
        if not target_path:
            # 如果路径为空，返回根级别的所有最底层资产
            return self._get_all_leaf_assets(asset_data)
        
        path_parts = target_path.split('/')
        
        def search_assets(assets, current_path_parts, current_full_path=""):
            """递归搜索资产"""
            if not current_path_parts:
                # 已经到达目标路径，返回当前级别的所有最底层资产
                return self._get_all_leaf_assets(assets)
            
            target_name = current_path_parts[0]
            remaining_parts = current_path_parts[1:]
            
            for asset in assets:
                if not isinstance(asset, dict):
                    continue
                
                # 处理不同的数据结构
                asset_name = asset.get('assetName') or asset.get('name', '')
                asset_type = asset.get('assetType') or asset.get('type', '')
                asset_id = asset.get('assetId') or asset.get('id')
                
                # 如果资产名称为空，直接搜索其子资产
                if not asset_name:
                    children = asset.get('assets') or asset.get('children', [])
                    if isinstance(children, list):
                        result = search_assets(children, current_path_parts, current_full_path)
                        if result:
                            return result
                    continue
                
                # 构建当前完整路径
                if current_full_path:
                    full_path = f"{current_full_path}/{asset_name}"
                else:
                    full_path = asset_name
                
                if asset_name == target_name:
                    # 找到匹配的资产
                    children = asset.get('assets') or asset.get('children', [])
                    
                    if not remaining_parts:
                        # 这就是目标路径，返回其下的所有最底层资产
                        if isinstance(children, list) and len(children) > 0:
                            return self._get_all_leaf_assets(children)
                        else:
                            # 这个资产本身就是最底层资产
                            return [{
                                'id': asset_id,
                                'name': asset_name,
                                'type': asset_type,
                                'path': full_path
                            }]
                    else:
                        # 继续向下搜索
                        if isinstance(children, list):
                            result = search_assets(children, remaining_parts, full_path)
                            if result:
                                return result
            
            return []
        
        return search_assets(asset_data, path_parts)
    
    def _get_all_leaf_assets(self, assets: List[Dict]) -> List[Dict[str, Any]]:
        """
        获取给定资产列表中的所有最底层资产
        
        Args:
            assets: 资产列表
            
        Returns:
            最底层资产信息列表
        """
        leaf_assets = []
        
        def collect_leaf_assets(asset_list, current_path=""):
            for asset in asset_list:
                if not isinstance(asset, dict):
                    continue
                
                asset_name = asset.get('assetName') or asset.get('name', '')
                asset_type = asset.get('assetType') or asset.get('type', '')
                asset_id = asset.get('assetId') or asset.get('id')
                
                # 构建完整路径
                if current_path:
                    full_path = f"{current_path}/{asset_name}"
                else:
                    full_path = asset_name
                
                children = asset.get('assets') or asset.get('children', [])
                
                if isinstance(children, list) and len(children) > 0:
                    # 有子资产，继续递归
                    collect_leaf_assets(children, full_path)
                else:
                    # 没有子资产，这是最底层资产
                    leaf_assets.append({
                        'id': asset_id,
                        'name': asset_name,
                        'type': asset_type,
                        'path': full_path
                    })
        
        collect_leaf_assets(assets)
        return leaf_assets
 
    def get_file_detail(self, asset_id: int, project_code: str, 
                       tab_order_update: bool = False) -> Dict[str, Any]:
        """
        获取文件详情
        
        Args:
            asset_id: 资产ID
            project_code: 项目代码，必填
            tab_order_update: 是否更新标签顺序，默认为 False
            
        Returns:
            API响应的JSON数据
            
        Raises:
            requests.RequestException: 请求异常
        """
        # 更新项目相关的请求头
        self.client._update_session_headers(project_code)
        
        # 构建请求URL和参数
        # 使用client的base_url和endpoints（支持多环境）
        url = self.client.base_url + self.client.endpoints['file_detail']
        params = {
            "projectCode": project_code,
            "assetId": asset_id,
            "tabOrderUpdate": tab_order_update
        }
        
        logger.info(f"获取文件详情: asset_id={asset_id}, project_code={project_code}")
        
        try:
            response = self.client._make_request("GET", url, params=params)
            result = response.json()
            logger.info(f"成功获取文件详情: asset_id={asset_id}")
            return result
        except requests.RequestException as e:
            logger.error(f"获取文件详情失败: asset_id={asset_id}, error={e}")
            raise

    def save_file(self, payload: Dict[str, Any], project_code: str) -> Dict[str, Any]:
        """
        保存文件到DataStudio
        
        Args:
            payload: 完整的保存请求体，包含 assetId, content 等字段
            project_code: 项目代码，必填
            
        Returns:
            API响应的JSON数据
            
        Raises:
            requests.RequestException: 请求异常
        """
        # 更新项目相关的请求头
        self.client._update_session_headers(project_code)
        
        # 使用client的base_url和endpoints（支持多环境）
        url = self.client.base_url + self.client.endpoints['file_save']
        asset_id = payload.get('assetId')
        
        logger.info(f"保存文件: asset_id={asset_id}, project_code={project_code}")
        
        try:
            response = self.client._make_request("POST", url, json=payload)
            result = response.json()
            
            if result.get('success'):
                logger.info(f"文件保存成功: asset_id={asset_id}")
            else:
                logger.warning(f"文件保存失败: {result.get('message')}")
            
            return result
        except requests.RequestException as e:
            logger.error(f"保存文件失败: asset_id={asset_id}, error={e}")
            raise

    def save_resource(self, asset_id: int, content: str, project_code: str) -> Dict[str, Any]:
        """
        保存Resource类型文件到DataStudio
        
        Resource类型（assetRoot=5，如Python Resource, Jar Resource）使用专门的API端点
        
        Args:
            asset_id: 资产ID
            content: 文件内容
            project_code: 项目代码，必填
            
        Returns:
            API响应的JSON数据
            
        Raises:
            requests.RequestException: 请求异常
        """
        # 更新项目相关的请求头
        self.client._update_session_headers(project_code)
        
        # 使用client的base_url和endpoints（支持多环境）
        url = self.client.base_url + self.client.endpoints['resource_save']
        
        # Resource保存的payload只需要assetId和content
        payload = {
            "assetId": asset_id,
            "content": content
        }
        
        logger.info(f"保存Resource文件: asset_id={asset_id}, project_code={project_code}, content_length={len(content) if content is not None else 0}")
        
        try:
            response = self.client._make_request("POST", url, json=payload)
            result = response.json()
            
            if result.get('success'):
                logger.info(f"Resource文件保存成功: asset_id={asset_id}")
            else:
                logger.warning(f"Resource文件保存失败: {result.get('message')}")
            
            return result
        except requests.RequestException as e:
            logger.error(f"保存Resource文件失败: asset_id={asset_id}, error={e}")
            raise

    def unlock_file(self, asset_id: int, project_code: str) -> Dict[str, Any]:
        """
        解锁DataStudio文件
        
        Args:
            asset_id: 资产ID
            project_code: 项目代码，必填
            
        Returns:
            API响应的JSON数据
            
        Raises:
            requests.RequestException: 请求异常
        """
        # 更新项目相关的请求头
        self.client._update_session_headers(project_code)
        
        # 使用client的base_url和endpoints（支持多环境）
        url = self.client.base_url + self.client.endpoints['file_unlock']
        params = {"assetId": asset_id}
        
        logger.info(f"解锁文件: asset_id={asset_id}, project_code={project_code}")
        
        try:
            response = self.client._make_request("POST", url, params=params, json={})
            result = response.json()
            
            if result.get('success'):
                logger.info(f"文件解锁成功: asset_id={asset_id}")
            else:
                logger.warning(f"文件解锁失败: {result.get('message')}")
            
            return result
        except requests.RequestException as e:
            logger.error(f"解锁文件失败: asset_id={asset_id}, error={e}")
            raise

    def create_asset(self, asset_type: int, asset_name: str, parent_id: int, 
                    project_code: str) -> Dict[str, Any]:
        """
        创建DataStudio资产
        
        Args:
            asset_type: 资产类型 (如 41=Template Spark SQL)
            asset_name: 资产名称
            parent_id: 父目录ID
            project_code: 项目代码，必填
            
        Returns:
            API响应的JSON数据，data字段为新创建资产的ID
            
        Raises:
            requests.RequestException: 请求异常
        """
        # 更新项目相关的请求头
        self.client._update_session_headers(project_code)
        
        # 使用client的base_url和endpoints（支持多环境）
        url = self.client.base_url + self.client.endpoints['asset_create']
        payload = {
            "assetType": asset_type,
            "assetName": asset_name,
            "parentId": parent_id
        }
        
        logger.info(f"创建资产: name={asset_name}, type={asset_type}, parent={parent_id}")
        
        try:
            response = self.client._make_request("POST", url, json=payload)
            result = response.json()
            
            if result.get('success'):
                new_asset_id = result.get('data')
                logger.info(f"资产创建成功: name={asset_name}, new_id={new_asset_id}")
            else:
                logger.warning(f"资产创建失败: {result.get('message')}")
            
            return result
        except requests.RequestException as e:
            logger.error(f"创建资产失败: name={asset_name}, error={e}")
            raise

    def create_file(self, local_file_path: str, asset_type: int, project_code: str) -> Dict[str, Any]:
        """
        创建新文件到DataStudio
        
        Args:
            local_file_path: 本地文件路径
            asset_type: 资产类型
            project_code: 项目代码
            
        Returns:
            包含新资产信息的字典
            
        Raises:
            ValueError: 路径或类型不合法，或文件已存在
            FileNotFoundError: 文件不存在
        """
        # 1. 检查文件是否存在
        if not os.path.isfile(local_file_path):
            raise FileNotFoundError(f"文件不存在: {local_file_path}")
        
        local_file_path = os.path.abspath(local_file_path)
        logger.info(f"开始创建文件: {local_file_path}")
        
        # 2. 解析本地路径映射
        parsed_project_code, root_type_name, base_path = self.parse_local_path_mapping(local_file_path)
        logger.info(f"解析到项目: {parsed_project_code}, rootType: {root_type_name}")
        
        # 3. 检查assetType是否合法
        from .config import ASSET_TYPE_ID_TO_NAME
        if asset_type not in ASSET_TYPE_ID_TO_NAME:
            raise ValueError(f"不合法的assetType: {asset_type}")
        
        asset_type_name = ASSET_TYPE_ID_TO_NAME[asset_type]
        logger.info(f"Asset类型: {asset_type_name} ({asset_type})")
        
        # 4. 同步datastudio_file_tree
        logger.info("步骤1: 同步asset tree...")
        tree_file = self.sync_asset_tree_to_local(local_file_path)
        
        # 5. 读取tree文件，找到parent_id和parent下的所有文件
        logger.info("步骤2: 查找父目录信息...")
        with open(tree_file, 'r', encoding='utf-8') as f:
            tree_data = json.load(f)
        
        # 获取文件名和父目录路径
        file_name = os.path.basename(local_file_path)
        asset_name = os.path.splitext(file_name)[0]
        parent_dir = os.path.dirname(local_file_path)
        
        # 计算相对路径
        relative_path = os.path.relpath(parent_dir, base_path)
        
        # 在tree中查找parent_id和parent下的所有资产
        parent_info = self._find_parent_info_in_tree(tree_data, relative_path)
        if not parent_info:
            raise ValueError(f"无法在tree中找到父目录: {relative_path}")
        
        parent_id = parent_info['parent_id']
        parent_assets = parent_info['assets']
        logger.info(f"找到父目录ID: {parent_id}, 相对路径: {relative_path}")
        
        # 6. 检查是否已存在同名资产
        for asset in parent_assets:
            if asset.get('assetName') == asset_name:
                raise ValueError(
                    f"资产已存在: {asset_name} (ID: {asset.get('assetId')})\n"
                    f"请使用 update_file 方法更新已存在的文件"
                )
        
        # 7. 创建asset
        logger.info("步骤3: 创建asset...")
        create_result = self.create_asset(asset_type, asset_name, parent_id, project_code)
        
        if not create_result.get('success'):
            raise RuntimeError(f"创建asset失败: {create_result.get('message')}")
        
        new_asset_id = create_result.get('data')
        logger.info(f"Asset创建成功, ID: {new_asset_id}")
        
        # 8. 再次同步tree
        logger.info("步骤4: 更新asset tree...")
        tree_file = self.sync_asset_tree_to_local(local_file_path)
        
        # 9. 获取新asset的详细配置
        logger.info("步骤5: 获取asset详细配置...")
        asset_detail = self.get_file_detail(new_asset_id, project_code)
        
        # 保存配置到本地conf目录
        conf_dir = os.path.join(parent_dir, 'conf')
        self._ensure_dir_exists(conf_dir)
        conf_file = os.path.join(conf_dir, f"{asset_name}.json")
        
        with open(conf_file, 'w', encoding='utf-8') as f:
            json.dump(asset_detail.get('data', {}), f, indent=4, ensure_ascii=False)
        logger.info(f"配置已保存: {conf_file}")
        
        # 10. 读取本地文件内容
        logger.info("步骤6: 读取本地文件内容...")
        with open(local_file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        # 11. 组装save payload
        logger.info("步骤7: 组装save payload...")
        conf_data = asset_detail.get('data', {})
        
        # 从conf中读取字段
        input_marker = conf_data.get('inputMarker', [])
        output_marker = conf_data.get('outputMarker', [])
        
        # parameters.user -> parameter
        parameters = conf_data.get('parameters', {})
        parameter = parameters.get('user', [])
        
        # sparkSQLConfig -> sparkSQLConfigReqVO
        spark_sql_config = conf_data.get('sparkSQLConfig')
        
        save_payload = {
            "assetId": new_asset_id,
            "assetType": asset_type,
            "content": file_content,
            "inputMarker": input_marker,
            "outputMarker": output_marker,
            "parameter": parameter,
            "sparkSQLConfigReqVO": spark_sql_config
        }
        
        # 12. 保存到DataStudio
        logger.info("步骤8: 保存文件到DataStudio...")
        save_result = self.save_file(save_payload, project_code)
        
        if not save_result.get('success'):
            raise RuntimeError(f"保存文件失败: {save_result.get('message')}")
        
        logger.info("文件创建完成!")
        
        return {
            'asset_id': new_asset_id,
            'asset_name': asset_name,
            'asset_type': asset_type,
            'project_code': project_code,
            'conf_file': conf_file
        }
    
    def update_file(self, local_file_path: str, project_code: str) -> Dict[str, Any]:
        """
        更新已存在的文件到DataStudio
        
        Args:
            local_file_path: 本地文件路径
            project_code: 项目代码
            
        Returns:
            包含资产信息的字典
            
        Raises:
            ValueError: 路径不合法或文件不存在于DataStudio
            FileNotFoundError: 文件或配置文件不存在
        """
        # 1. 检查文件是否存在
        if not os.path.isfile(local_file_path):
            raise FileNotFoundError(f"文件不存在: {local_file_path}")
        
        local_file_path = os.path.abspath(local_file_path)
        logger.info(f"开始更新文件: {local_file_path}")
        
        # 2. 解析本地路径映射
        parsed_project_code, root_type_name, base_path = self.parse_local_path_mapping(local_file_path)
        logger.info(f"解析到项目: {parsed_project_code}, rootType: {root_type_name}")
        
        # 3. 同步datastudio_file_tree
        logger.info("步骤1: 同步asset tree...")
        tree_file = self.sync_asset_tree_to_local(local_file_path)
        
        # 4. 读取tree文件，找到parent_id和parent下的所有文件
        logger.info("步骤2: 查找父目录信息...")
        with open(tree_file, 'r', encoding='utf-8') as f:
            tree_data = json.load(f)
        
        # 获取文件名和父目录路径
        file_name = os.path.basename(local_file_path)
        parent_dir = os.path.dirname(local_file_path)
        
        # 计算相对路径
        relative_path = os.path.relpath(parent_dir, base_path)
        
        # 在tree中查找parent_id和parent下的所有资产
        parent_info = self._find_parent_info_in_tree(tree_data, relative_path)
        if not parent_info:
            raise ValueError(f"无法在tree中找到父目录: {relative_path}")
        
        parent_id = parent_info['parent_id']
        parent_assets = parent_info['assets']
        logger.info(f"找到父目录ID: {parent_id}, 相对路径: {relative_path}")
        
        # 5. 检查是否已存在同名资产
        # 注意：对于Resource类型(assetType 30,31等)，assetName包含扩展名
        # 对于其他类型(Task, Template等)，assetName不包含扩展名
        # 先尝试用完整文件名匹配，如果没找到再用去掉扩展名的名称匹配
        existing_asset = None
        asset_name_with_ext = file_name
        asset_name_without_ext = os.path.splitext(file_name)[0]
        
        for asset in parent_assets:
            asset_name_in_tree = asset.get('assetName')
            if asset_name_in_tree == asset_name_with_ext or asset_name_in_tree == asset_name_without_ext:
                existing_asset = asset
                break
        
        if not existing_asset:
            raise ValueError(
                f"资产不存在: {file_name}\n"
                f"请使用 create_file 方法创建新文件"
            )
        
        asset_id = existing_asset.get('assetId')
        asset_name_in_tree = existing_asset.get('assetName')
        logger.info(f"找到已存在的资产: {asset_name_in_tree} (ID: {asset_id})")
        
        # 6. 读取本地文件内容
        with open(local_file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        # 7. 将本地文件的content写入本地conf文件
        # conf文件名使用去掉扩展名的asset名称
        conf_dir = os.path.join(parent_dir, 'conf')
        conf_file = os.path.join(conf_dir, f"{asset_name_without_ext}.json")
        
        if not os.path.exists(conf_file):
            raise FileNotFoundError(
                f"配置文件不存在: {conf_file}\n"
                f"请先使用 copy_assets_to_local 同步资产配置"
            )
        
        logger.info(f"更新本地配置文件content: {conf_file}")
        with open(conf_file, 'r', encoding='utf-8') as f:
            conf_data = json.load(f)
        
        # 检查是否为非template任务且被template绑定
        asset_root = conf_data.get('assetRoot')
        template_id = conf_data.get('templateId')
        template_name = conf_data.get('templateName')
        
        # 如果不是Template资产(assetRoot != 6)，但被template绑定(templateId不为空)
        if asset_root != 6 and template_id:
            raise ValueError(
                f"无法更新资产: {asset_name_in_tree}\n"
                f"原因: 该资产是非Template任务，但已被Template绑定\n"
                f"- 资产类型: {ROOT_TYPE_ID_TO_NAME.get(asset_root, asset_root)}\n"
                f"- 绑定的Template ID: {template_id}\n"
                f"- 绑定的Template名称: {template_name}\n"
                f"请先在DataStudio中解除Template绑定，或直接修改Template资产"
            )
        
        logger.info(f"资产检查通过: assetRoot={asset_root}, templateId={template_id}")
        
        # 检查版本号是否一致
        logger.info("步骤2.5: 检查版本号...")
        remote_detail = self.get_file_detail(asset_id, project_code)
        remote_version = remote_detail.get('data', {}).get('currentVersion')
        local_version = conf_data.get('currentVersion')
        
        if remote_version != local_version:
            raise ValueError(
                f"无法更新资产: {asset_name_in_tree}\n"
                f"原因: 本地配置版本与DataStudio不一致\n"
                f"- 本地版本: {local_version}\n"
                f"- 远程版本: {remote_version}\n"
                f"请先使用 copy_assets_to_local 同步最新配置"
            )
        
        logger.info(f"版本检查通过: currentVersion={local_version}")
        
        # 更新content字段
        conf_data['content'] = file_content
        
        # 写回本地conf文件
        with open(conf_file, 'w', encoding='utf-8') as f:
            json.dump(conf_data, f, indent=4, ensure_ascii=False)
        logger.info(f"本地配置文件已更新")
        
        # 8-9. 保存到DataStudio
        # Resource类型(assetRoot=5)使用专门的resource/save API
        # 其他类型使用file/save API
        logger.info("步骤3: 更新文件到DataStudio...")
        
        if asset_root == 5:
            # Resource类型：使用resource/save API，只需要assetId和content
            logger.info(f"检测到Resource类型文件，使用resource/save API")
            save_result = self.save_resource(asset_id, file_content, project_code)
        else:
            # 其他类型：使用file/save API，需要完整的payload
            save_payload = conf_data.copy()
            
            # 将parameters替换为parameter，值取parameters.user
            if 'parameters' in save_payload:
                parameters = save_payload.pop('parameters')
                save_payload['parameter'] = parameters.get('user', [])
            else:
                save_payload['parameter'] = []
            
            # 将sparkSQLConfig替换为sparkSQLConfigReqVO
            if 'sparkSQLConfig' in save_payload:
                spark_sql_config = save_payload.pop('sparkSQLConfig')
                save_payload['sparkSQLConfigReqVO'] = spark_sql_config
            
            save_result = self.save_file(save_payload, project_code)
        
        if not save_result.get('success'):
            raise RuntimeError(f"更新文件失败: {save_result.get('message')}")
        
        logger.info("文件更新完成!")
        
        # 10. 重新同步配置文件（添加延迟以确保 DataStudio 保存完成）
        logger.info("步骤4: 同步最新配置到本地...")
        import time
        time.sleep(2)  # 等待2秒确保 DataStudio 保存完成
        
        updated_detail = self.get_file_detail(asset_id, project_code)
        
        if 'data' in updated_detail:
            # 验证内容是否真的更新了
            updated_content = updated_detail['data'].get('content', '')
            if len(updated_content or '') != len(file_content or ''):
                logger.warning(f"内容长度不匹配: 本地={len(file_content or '')}, 远程={len(updated_content or '')}")
                logger.warning("可能需要手动检查 DataStudio 上的文件是否真的更新成功")
            
            with open(conf_file, 'w', encoding='utf-8') as f:
                json.dump(updated_detail['data'], f, indent=4, ensure_ascii=False)
            logger.info(f"配置文件已更新: {conf_file}")
            
            new_version = updated_detail['data'].get('currentVersion')
            logger.info(f"新版本号: {new_version}")
        
        return {
            'asset_id': asset_id,
            'asset_name': asset_name_in_tree,
            'asset_type': conf_data.get('assetType'),
            'project_code': project_code,
            'conf_file': conf_file,
            'old_version': local_version,
            'new_version': updated_detail.get('data', {}).get('currentVersion')
        }
    
    def _find_parent_id_in_tree(self, tree_data: List[Dict], relative_path: str) -> Optional[int]:
        """
        在tree数据中查找指定路径的parent_id
        
        Args:
            tree_data: tree JSON数据
            relative_path: 相对路径（如 'test' 或 'funding_mart_v2/dml'）
            
        Returns:
            parent_id，如果未找到返回None
        """
        if not tree_data or len(tree_data) == 0:
            return None
        
        # 如果相对路径是'.'，表示根目录
        if relative_path == '.':
            root_data = tree_data[0]
            return root_data.get('rootId')
        
        # 分割路径
        path_parts = relative_path.split(os.sep)
        
        def search_in_assets(assets: List[Dict], parts: List[str]) -> Optional[int]:
            if not parts:
                return None
            
            target_name = parts[0]
            remaining_parts = parts[1:]
            
            for asset in assets:
                if asset.get('assetName') == target_name:
                    # 如果没有剩余路径，返回此asset的ID
                    if not remaining_parts:
                        return asset.get('assetId')
                    
                    # 否则继续在子资产中查找
                    children = asset.get('assets', [])
                    return search_in_assets(children, remaining_parts)
            
            return None
        
        root_data = tree_data[0]
        root_assets = root_data.get('assets', [])
        
        return search_in_assets(root_assets, path_parts)
    
    def _find_parent_info_in_tree(self, tree_data: List[Dict], relative_path: str) -> Optional[Dict[str, Any]]:
        """
        在tree数据中查找指定路径的parent信息（包括parent_id和子资产列表）
        
        Args:
            tree_data: tree JSON数据
            relative_path: 相对路径（如 'test' 或 'funding_mart_v2/dml'）
            
        Returns:
            {'parent_id': int, 'assets': List[Dict]}，如果未找到返回None
        """
        if not tree_data or len(tree_data) == 0:
            return None
        
        # 如果相对路径是'.'，表示根目录
        if relative_path == '.':
            root_data = tree_data[0]
            return {
                'parent_id': root_data.get('rootId'),
                'assets': root_data.get('assets', [])
            }
        
        # 分割路径
        path_parts = relative_path.split(os.sep)
        
        def search_in_assets(assets: List[Dict], parts: List[str]) -> Optional[Dict[str, Any]]:
            if not parts:
                return None
            
            target_name = parts[0]
            remaining_parts = parts[1:]
            
            for asset in assets:
                if asset.get('assetName') == target_name:
                    # 如果没有剩余路径，返回此asset的ID和子资产
                    if not remaining_parts:
                        return {
                            'parent_id': asset.get('assetId'),
                            'assets': asset.get('assets', [])
                        }
                    
                    # 否则继续在子资产中查找
                    children = asset.get('assets', [])
                    return search_in_assets(children, remaining_parts)
            
            return None
        
        root_data = tree_data[0]
        root_assets = root_data.get('assets', [])
        
        return search_in_assets(root_assets, path_parts)

    
    @staticmethod
    def _ensure_dir_exists(directory: str) -> None:
        """确保目录存在，不存在则创建"""
        if not os.path.exists(directory):
            os.makedirs(directory)
            logger.info(f"创建目录: {directory}")
    
    @staticmethod
    def _get_file_extension(asset_type: int) -> str:
        """
        根据资产类型获取文件扩展名
        
        Args:
            asset_type: 资产类型（整数）
            
        Returns:
            文件扩展名（如 '.sql', '.sh', '.py', '.jar', '.ipynb' 或空字符串）
        """
        try:
            # asset_type可能是整数或字符串，统一转换为整数
            if isinstance(asset_type, str):
                type_code = int(asset_type)
            else:
                type_code = asset_type
            
            return ASSET_TYPE_EXTENSION_MAP.get(type_code, DEFAULT_EXTENSION)
        except (ValueError, TypeError):
            logger.warning(f"无法解析asset_type: {asset_type}，使用默认扩展名")
            return DEFAULT_EXTENSION

    def copy_asset_to_file(self, asset_id: int, output_path: str, project_code: str, save_config: bool = True) -> None:
        """
        将资产内容复制到文件
        
        Args:
            asset_id: 资产ID
            output_path: 输出文件路径
            project_code: 项目代码
            save_config: 是否保存配置信息到conf目录
        """
        try:
            # 获取文件详情，包含SQL代码等
            file_detail = self.get_file_detail(asset_id, project_code)
            
            # 从文件详情中提取SQL代码
            if 'data' in file_detail and 'content' in file_detail['data']:
                content = file_detail['data']['content']
                detail_data = file_detail['data']
                
                # 确保父目录存在
                parent_dir = os.path.dirname(output_path)
                self._ensure_dir_exists(parent_dir)
                
                # 写入文件内容
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(content or '')  # 如果content为None，写入空字符串
                logger.info(f"创建文件成功: {output_path}")
                
                if content is None:
                    logger.warning(f"文件内容为空: asset_id={asset_id}")
                
                # 保存配置信息到conf目录
                if save_config:
                    conf_dir = os.path.join(parent_dir, 'conf')
                    self._ensure_dir_exists(conf_dir)
                    
                    # 获取文件名（去掉扩展名）
                    file_name = os.path.splitext(os.path.basename(output_path))[0]
                    conf_file = os.path.join(conf_dir, f"{file_name}.json")
                    
                    # 保存配置（覆盖模式）
                    with open(conf_file, 'w', encoding='utf-8') as f:
                        json.dump(detail_data, f, indent=4, ensure_ascii=False)
                    logger.info(f"配置已保存: {conf_file}")
                else:
                    logger.info("跳过配置保存 (save_config=False)")
            else:
                logger.warning(f"无法获取资产 {asset_id} 的内容")
        except Exception as e:
            logger.error(f"复制资产 {asset_id} 到文件 {output_path} 时出错: {e}")

    def process_assets(self, assets: List[Dict[str, Any]], base_dir: str, project_code: str) -> None:
        """
        处理资产列表，复制内容到对应文件
        
        Args:
            assets: 资产列表
            base_dir: 基础输出目录
            project_code: 项目代码
        """
        for asset in assets:
            asset_id = asset.get('id')
            asset_name = asset.get('name', '')
            asset_path = asset.get('path', '')
            asset_type = asset.get('type', '')
            
            if not asset_id or not asset_name:
                logger.warning(f"跳过无效资产: {asset}")
                continue
            
            # 构建输出路径
            relative_path = asset_path.replace('/', os.sep)
            output_path = os.path.join(base_dir, relative_path)
            
            # 判断是否为目录（asset_type = 1）
            if asset_type == 1:
                # 目录类型
                self._ensure_dir_exists(output_path)
                logger.info(f"创建目录: {output_path}")
            else:
                # 文件类型，根据asset_type获取对应扩展名
                extension = self._get_file_extension(asset_type)
                if extension:  # 如果有扩展名
                    output_path += extension
                self.copy_asset_to_file(asset_id, output_path, project_code)
            
            time.sleep(0.5)

    def sync_file_to_local(self, datastudio_path: str, project_code: str) -> Dict[str, Any]:
        """
        同步单个文件从DataStudio到本地
        
        Args:
            datastudio_path: DataStudio完整文件路径，如 //Templates/test/test_spark1.sql
            project_code: 项目代码
            
        Returns:
            包含同步信息的字典
            
        Raises:
            ValueError: 路径格式错误或文件不存在
            FileNotFoundError: 本地路径映射未配置
        """
        logger.info(f"开始同步单个文件: {datastudio_path}")
        
        # 1. 解析DataStudio路径
        root_type, relative_path = self._determine_root_type_and_path(datastudio_path)
        
        # 去除文件扩展名得到asset名称
        relative_path = relative_path.rstrip('/')
        path_parts = relative_path.split('/')
        asset_name_with_ext = path_parts[-1]
        
        # 分离文件名和扩展名
        if '.' in asset_name_with_ext:
            asset_name = asset_name_with_ext.rsplit('.', 1)[0]
            file_extension = '.' + asset_name_with_ext.rsplit('.', 1)[1]
        else:
            asset_name = asset_name_with_ext
            file_extension = ''
        
        parent_path = '/'.join(path_parts[:-1]) if len(path_parts) > 1 else ''
        
        logger.info(f"解析结果: rootType={root_type}, parent_path={parent_path}, asset_name={asset_name}")
        
        # 2. 获取asset tree
        tree_data = self.get_asset_trees(project_code, root_type)
        
        if not tree_data.get('data'):
            raise ValueError(f"无法获取项目 {project_code} 的资产树")
        
        data_list = tree_data['data']
        if not isinstance(data_list, list) or len(data_list) == 0:
            raise ValueError(f"资产树数据格式错误")
        
        # 3. 在tree中查找文件
        if parent_path:
            parent_info = self._find_parent_info_in_tree(data_list, parent_path)
            if not parent_info:
                raise ValueError(f"无法找到父目录: {parent_path}")
            parent_assets = parent_info['assets']
        else:
            # 根目录
            parent_assets = data_list[0].get('assets', [])
        
        # 查找目标文件
        # Resources 文件（root_type=5）使用带扩展名的名称，其他类型使用不带扩展名的名称
        search_name = asset_name_with_ext if root_type == 5 else asset_name
        
        target_asset = None
        for asset in parent_assets:
            if asset.get('assetName') == search_name:
                target_asset = asset
                break
        
        if not target_asset:
            raise ValueError(f"文件不存在: {search_name} (路径: {datastudio_path})")
        
        asset_id = target_asset.get('assetId')
        asset_type = target_asset.get('assetType')
        logger.info(f"找到文件: asset_id={asset_id}, asset_type={asset_type}")
        
        # 4. 确定本地路径
        from .config import PATH_MAPPING, ROOT_TYPE_ID_TO_NAME
        
        root_type_name = ROOT_TYPE_ID_TO_NAME.get(root_type)
        if not root_type_name or project_code not in PATH_MAPPING:
            raise ValueError(f"项目 {project_code} 的路径映射未配置")
        
        base_path = PATH_MAPPING[project_code].get(root_type_name)
        if not base_path:
            raise ValueError(f"项目 {project_code} 的 {root_type_name} 路径未配置")
        
        # 如果没有扩展名，根据asset_type自动添加
        if not file_extension:
            file_extension = self._get_file_extension(asset_type)
        
        if parent_path:
            output_path = os.path.join(base_path, parent_path, asset_name + file_extension)
        else:
            output_path = os.path.join(base_path, asset_name + file_extension)
        
        logger.info(f"本地路径: {output_path}")
        
        # 5. 同步文件
        self.copy_asset_to_file(asset_id, output_path, project_code, save_config=True)
        
        return {
            'asset_id': asset_id,
            'asset_name': asset_name,
            'asset_type': asset_type,
            'datastudio_path': datastudio_path,
            'local_path': output_path,
            'project_code': project_code
        }
    
    def copy_assets_to_local(self, path: str, project_code: str) -> None:
        """
        将DataStudio资产复制到本地文件系统
        
        Args:
            path: 源路径，例如：//Workflows/your_path/、//Templates/your_path/等
            project_code: 项目代码，必填
        """
        try:
            logger.info(f"正在获取源路径 {path} 下的所有资产...")
            
            # 根据path和project_code解析出对应的本地目录
            output_base_dir = self.parse_datastudio_path_to_local(path, project_code)
            logger.info(f"解析得到本地目录: {output_base_dir}")
            
            # 获取源路径下的所有资产
            assets = self.get_leaf_assets_by_path(path, project_code=project_code)
            logger.info(f"找到 {len(assets)} 个资产")
            
            # 确保目标基础目录存在
            self._ensure_dir_exists(output_base_dir)
            
            # 处理资产
            self.process_assets(assets, output_base_dir, project_code)
            
            logger.info("资产复制完成!")
            
            # 同步更新asset tree到本地
            try:
                logger.info("正在更新asset tree...")
                tree_file = self.sync_asset_tree_to_local(output_base_dir)
                logger.info(f"Asset tree已更新: {tree_file}")
            except Exception as e:
                logger.warning(f"更新asset tree失败: {e}")
            
        except Exception as e:
            logger.error(f"执行过程中出错: {e}")
            raise 