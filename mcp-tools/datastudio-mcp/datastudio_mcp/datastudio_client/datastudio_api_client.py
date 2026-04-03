#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DataStudio API客户端
集成自动cookie更新、重试机制和错误处理
"""

import requests
import json
import time
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

# 尝试相对导入，如果失败则使用绝对导入
try:
    from .cookie_manager import CookieManager
    from .config import API_CONFIG, get_project_headers, get_full_url
except ImportError:
    from cookie_manager import CookieManager
    from config import API_CONFIG, get_project_headers, get_full_url

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DataStudioAPIClient:
    """DataStudio API客户端类，仅包含底层API能力"""
    
    def __init__(self, config_dir: str = None, auto_refresh: bool = True, environment: str = None):
        """
        初始化客户端
        
        Args:
            config_dir: 配置文件目录
            auto_refresh: 是否启用自动刷新cookie
            environment: 环境名称 ('shopee' or 'ldn')，如果不指定则使用默认环境
        """
        self.environment = environment or 'shopee'  # 默认使用shopee环境
        
        # 根据环境获取配置
        try:
            from .config import get_api_config
            env_config = get_api_config(self.environment)
            self.base_url = env_config['base_url']
            self.endpoints = env_config['endpoints']
            self.timeout = env_config.get('timeout', 30)
        except:
            # 向后兼容：如果get_api_config不可用，使用默认配置
            self.base_url = API_CONFIG['base_url']
            self.endpoints = API_CONFIG['endpoints']
            self.timeout = API_CONFIG.get('timeout', 30)
        
        self.session = requests.Session()
        self.cookie_manager = CookieManager(config_dir, environment=self.environment)  # 传递environment
        self.auto_refresh = auto_refresh
        self.max_retries = 3
        self.retry_delay = 1  # 秒
        
        self._setup_session()
    
    def _setup_session(self) -> None:
        """设置会话"""
        # 设置超时
        self.session.timeout = self.timeout
        
        # 更新cookies
        self._update_session_cookies()
        
        # 设置默认请求头
        self._update_session_headers()
    
    def _update_session_cookies(self) -> None:
        """更新会话cookies - 从当前环境获取"""
        cookies = self.cookie_manager.get_cookies(environment=self.environment)
        for name, value in cookies.items():
            self.session.cookies.set(name, value)
        logger.info(f"已更新环境 '{self.environment}' 的 {len(cookies)} 个cookies到会话")
    
    def _update_session_headers(self, project_code: str = None) -> None:
        """更新会话请求头"""
        headers = get_project_headers(project_code)
        self.session.headers.update(headers)
        
        # 确保设置CSRF token（从当前环境的cookies中获取）
        cookies = self.cookie_manager.get_cookies(environment=self.environment)
        if 'CSRF-TOKEN' in cookies:
            self.session.headers['x-csrf-token'] = cookies['CSRF-TOKEN']
        
        # 确保设置content-type为JSON（对于POST请求）
        self.session.headers['content-type'] = 'application/json'
    
    def _check_and_refresh_cookies(self) -> bool:
        """检查并刷新cookies - 验证当前环境的cookies"""
        if not self.auto_refresh:
            return True
        
        validation = self.cookie_manager.validate_cookies(environment=self.environment)
        
        if not validation['valid']:
            logger.warning(f"检测到环境 '{self.environment}' 的cookie问题，尝试自动刷新...")
            
            if validation['expired_tokens']:
                logger.warning(f"过期的tokens: {validation['expired_tokens']}")
            
            if validation['missing_tokens']:
                logger.warning(f"缺失的tokens: {validation['missing_tokens']}")
            
            # 尝试从浏览器刷新，使用当前环境
            if self.cookie_manager.import_from_browser('chrome', environment=self.environment):
                self._update_session_cookies()
                logger.info(f"环境 '{self.environment}' 的Cookie刷新成功")
                return True
            else:
                logger.error(f"环境 '{self.environment}' 的Cookie自动刷新失败，请手动更新")
                return False
        
        return True
    
    def _make_request(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        发起HTTP请求，包含重试机制
        
        Args:
            method: HTTP方法
            url: 请求URL
            **kwargs: 其他请求参数
            
        Returns:
            响应对象
            
        Raises:
            requests.RequestException: 请求失败
        """
        last_exception = None
        
        for attempt in range(self.max_retries):
            try:
                # 检查并刷新cookies
                if not self._check_and_refresh_cookies():
                    logger.warning("Cookie验证失败，但继续尝试请求")
                
                # 发起请求
                response = self.session.request(method, url, **kwargs)
                
                # 检查响应状态
                if response.status_code == 401:
                    logger.warning(f"收到401未授权响应，尝试刷新cookie（环境: {self.environment}）")
                    if self.auto_refresh and self.cookie_manager.import_from_browser('chrome', environment=self.environment):
                        self._update_session_cookies()
                        continue  # 重试
                    else:
                        last_exception = requests.exceptions.HTTPError(f"401 Unauthorized: {response.text}")
                        if attempt < self.max_retries - 1:
                            time.sleep(self.retry_delay * (attempt + 1))
                            continue
                        else:
                            raise last_exception
                
                elif response.status_code == 403:
                    logger.warning(f"收到403禁止访问响应，可能需要更新CSRF token（环境: {self.environment}）")
                    if self.auto_refresh and self.cookie_manager.import_from_browser('chrome', environment=self.environment):
                        self._update_session_cookies()
                        continue  # 重试
                    else:
                        last_exception = requests.exceptions.HTTPError(f"403 Forbidden: {response.text}")
                        if attempt < self.max_retries - 1:
                            time.sleep(self.retry_delay * (attempt + 1))
                            continue
                        else:
                            raise last_exception
                
                # 检查是否成功
                response.raise_for_status()
                return response
                
            except requests.exceptions.RequestException as e:
                last_exception = e
                logger.warning(f"请求失败 (尝试 {attempt + 1}/{self.max_retries}): {e}")
                
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (attempt + 1))  # 指数退避
                    continue
            except Exception as e:
                # 处理其他类型的异常
                last_exception = requests.exceptions.RequestException(f"请求过程中发生未知错误: {e}")
                logger.error(f"请求过程中发生未知错误 (尝试 {attempt + 1}/{self.max_retries}): {e}")
                
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (attempt + 1))
                    continue
        
        # 所有重试都失败了，确保抛出有效的异常
        if last_exception is None:
            last_exception = requests.exceptions.RequestException("所有重试都失败了，但没有记录到具体异常")
        
        raise last_exception
    
    def update_cookies_from_browser(self, browser: str = 'chrome') -> bool:
        """
        手动从浏览器更新cookies
        
        Args:
            browser: 浏览器类型
            
        Returns:
            更新是否成功
        """
        success = self.cookie_manager.import_from_browser(browser)
        if success:
            self._update_session_cookies()
        return success
    
    def update_cookies_from_string(self, cookie_string: str) -> bool:
        """
        从cookie字符串更新cookies
        
        Args:
            cookie_string: cookie字符串
            
        Returns:
            更新是否成功
        """
        success = self.cookie_manager.import_from_string(cookie_string)
        if success:
            self._update_session_cookies()
        return success
    
    def get_cookie_status(self) -> Dict[str, Any]:
        """
        获取cookie状态信息
        
        Returns:
            cookie状态字典
        """
        validation = self.cookie_manager.validate_cookies()
        expiry_info = self.cookie_manager.get_expiry_info()
        
        return {
            'validation': validation,
            'expiry_info': expiry_info,
            'total_cookies': len(self.cookie_manager.get_cookies())
        }
    
    
    def enable_auto_refresh(self, enabled: bool = True) -> None:
        """
        启用或禁用自动刷新
        
        Args:
            enabled: 是否启用
        """
        self.auto_refresh = enabled
        logger.info(f"自动刷新已{'启用' if enabled else '禁用'}")
    
    def set_retry_config(self, max_retries: int = 3, retry_delay: int = 1) -> None:
        """
        设置重试配置
        
        Args:
            max_retries: 最大重试次数
            retry_delay: 重试延迟（秒）
        """
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        logger.info(f"重试配置已更新: 最大重试{max_retries}次，延迟{retry_delay}秒")
    
    