#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cookie管理器
支持JWT解析、过期检查、浏览器导入和自动更新功能
"""

import json
import jwt
import os
import re
import time
import base64
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from pathlib import Path
from cryptography.fernet import Fernet
import logging

try:
    from chrome_auth import get_cookies as _chrome_auth_get_cookies
    _HAS_CHROME_AUTH = True
except ImportError:
    _HAS_CHROME_AUTH = False

try:
    import browser_cookie3
    _HAS_BROWSER_COOKIE3 = True
except ImportError:
    _HAS_BROWSER_COOKIE3 = False

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CookieManager:
    """Cookie管理器类 - 支持多环境Cookie分离存储"""
    
    def __init__(self, config_dir: str = None, environment: str = None):
        """
        初始化Cookie管理器
        
        Args:
            config_dir: 配置文件目录，默认为当前目录下的.config
            environment: 默认环境名称 ('shopee', 'ldn')，如果不指定则使用'shopee'
        """
        self.config_dir = Path(config_dir or ".config")
        self.config_dir.mkdir(exist_ok=True)
        
        self.cookie_file = self.config_dir / "cookies.json"
        self.encrypted_cookie_file = self.config_dir / "cookies.enc"
        self.key_file = self.config_dir / "key.key"
        
        self.current_environment = environment or 'shopee'  # 当前环境
        self._cookies = {}  # 所有环境的cookies: {env: {cookie_name: value}}
        self._load_cookies()
    
    def _generate_key(self) -> bytes:
        """生成加密密钥"""
        key = Fernet.generate_key()
        with open(self.key_file, 'wb') as f:
            f.write(key)
        return key
    
    def _get_key(self) -> bytes:
        """获取加密密钥"""
        if self.key_file.exists():
            with open(self.key_file, 'rb') as f:
                return f.read()
        return self._generate_key()
    
    def _encrypt_data(self, data: str) -> bytes:
        """加密数据"""
        key = self._get_key()
        f = Fernet(key)
        return f.encrypt(data.encode())
    
    def _decrypt_data(self, encrypted_data: bytes) -> str:
        """解密数据"""
        key = self._get_key()
        f = Fernet(key)
        return f.decrypt(encrypted_data).decode()
    
    def _load_cookies(self) -> None:
        """加载cookies - 支持多环境结构"""
        try:
            # 优先尝试加载加密的cookie文件
            if self.encrypted_cookie_file.exists():
                with open(self.encrypted_cookie_file, 'rb') as f:
                    encrypted_data = f.read()
                decrypted_data = self._decrypt_data(encrypted_data)
                loaded_cookies = json.loads(decrypted_data)
                logger.info("已加载加密的cookie文件")
            elif self.cookie_file.exists():
                with open(self.cookie_file, 'r', encoding='utf-8') as f:
                    loaded_cookies = json.load(f)
                logger.info("已加载cookie文件")
            else:
                logger.info("未找到cookie文件，使用默认配置")
                loaded_cookies = {}
            
            # 兼容旧格式：如果是扁平结构，转换为多环境结构
            if loaded_cookies and not any(isinstance(v, dict) for v in loaded_cookies.values()):
                # 旧格式：{cookie_name: value}
                # 转换为新格式：{env: {cookie_name: value}}
                logger.info("检测到旧格式cookie，转换为多环境格式")
                self._cookies = {'shopee': loaded_cookies}
            else:
                # 新格式：{env: {cookie_name: value}}
                self._cookies = loaded_cookies
                
            # 确保当前环境存在
            if self.current_environment not in self._cookies:
                self._cookies[self.current_environment] = {}
                
        except Exception as e:
            logger.error(f"加载cookie失败: {e}")
            self._cookies = {self.current_environment: {}}
    
    def _save_cookies(self, encrypt: bool = True) -> None:
        """保存cookies"""
        try:
            if encrypt:
                # 保存加密版本
                data = json.dumps(self._cookies, indent=2, ensure_ascii=False)
                encrypted_data = self._encrypt_data(data)
                with open(self.encrypted_cookie_file, 'wb') as f:
                    f.write(encrypted_data)
                logger.info("已保存加密的cookie文件")
            else:
                # 保存明文版本（用于调试）
                with open(self.cookie_file, 'w', encoding='utf-8') as f:
                    json.dump(self._cookies, f, indent=2, ensure_ascii=False)
                logger.info("已保存cookie文件")
        except Exception as e:
            logger.error(f"保存cookie失败: {e}")
    
    def parse_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        解析JWT token
        
        Args:
            token: JWT token字符串
            
        Returns:
            解析后的token内容，如果解析失败返回None
        """
        try:
            # JWT token可能不需要验证签名，因为我们只是读取过期时间
            decoded = jwt.decode(token, options={"verify_signature": False})
            return decoded
        except Exception as e:
            logger.warning(f"JWT解析失败: {e}")
            return None
    
    def check_token_expiry(self, token_name: str, environment: str = None) -> Optional[datetime]:
        """
        检查token过期时间
        
        Args:
            token_name: token名称
            environment: 环境名称，如果不指定则使用当前环境
            
        Returns:
            过期时间，如果无法确定返回None
        """
        env = environment or self.current_environment
        env_cookies = self._cookies.get(env, {})
        
        if token_name not in env_cookies:
            return None
        
        token = env_cookies[token_name]
        
        # 对于JWT token，解析exp字段
        if token_name in ['DATA-SUITE-AUTH-userToken-v4', 'seamoney-data-token-live', '_oauth2_proxy_mesos']:
            decoded = self.parse_jwt_token(token)
            if decoded and 'exp' in decoded:
                return datetime.fromtimestamp(decoded['exp'])
        
        return None
    
    def is_token_expired(self, token_name: str, buffer_minutes: int = 1, environment: str = None) -> bool:
        """
        检查token是否已过期或即将过期
        
        Args:
            token_name: token名称
            buffer_minutes: 提前多少分钟认为token过期
            environment: 环境名称，如果不指定则使用当前环境
            
        Returns:
            True如果已过期或即将过期
        """
        expiry = self.check_token_expiry(token_name, environment)
        if expiry is None:
            return False
        
        buffer_time = datetime.now() + timedelta(minutes=buffer_minutes)
        return expiry <= buffer_time
    
    def get_cookies(self, environment: str = None) -> Dict[str, str]:
        """
        获取指定环境的cookies
        
        Args:
            environment: 环境名称，如果不指定则使用当前环境
            
        Returns:
            该环境的cookies字典
        """
        env = environment or self.current_environment
        return self._cookies.get(env, {}).copy()
    
    def update_cookies(self, new_cookies: Dict[str, str], save: bool = True, environment: str = None) -> None:
        """
        更新指定环境的cookies
        
        Args:
            new_cookies: 新的cookies字典
            save: 是否立即保存到文件
            environment: 环境名称，如果不指定则使用当前环境
        """
        env = environment or self.current_environment
        
        # 确保环境存在
        if env not in self._cookies:
            self._cookies[env] = {}
        
        # 更新该环境的cookies
        self._cookies[env].update(new_cookies)
        
        if save:
            self._save_cookies()
        logger.info(f"已更新环境 '{env}' 的 {len(new_cookies)} 个cookies")
    
    def import_from_browser(self, browser: str = 'chrome', domain: str = None, environment: str = None) -> bool:
        """
        从浏览器导入cookies（优先使用 chrome-auth 共享库）
        
        Args:
            browser: 浏览器类型 ('chrome', 'firefox', 'safari', 'edge')
            domain: 目标域名，如果不指定则使用environment对应的域名
            environment: 环境名称 ('shopee' or 'ldn')，如果指定则从配置中获取域名
            
        Returns:
            导入是否成功
        """
        try:
            if environment and not domain:
                try:
                    from .config import get_api_config
                    config = get_api_config(environment)
                    domain = config.get('domain', 'datasuite.shopee.io')
                except Exception:
                    domain = 'datasuite.shopee.io'
            if not domain:
                domain = 'datasuite.shopee.io'

            new_cookies = {}

            if browser == 'chrome' and _HAS_CHROME_AUTH:
                new_cookies = _chrome_auth_get_cookies(domain=domain, force=True)
                if new_cookies:
                    logger.info(f"通过 chrome-auth 获取了 {len(new_cookies)} 个 {domain} cookies")
            
            if not new_cookies and _HAS_BROWSER_COOKIE3:
                browser_functions = {
                    'chrome': browser_cookie3.chrome,
                    'firefox': browser_cookie3.firefox,
                    'safari': browser_cookie3.safari,
                    'edge': browser_cookie3.edge,
                }
                if browser not in browser_functions:
                    logger.error(f"不支持的浏览器: {browser}")
                    return False
                cj = browser_functions[browser](domain_name=domain)
                for cookie in cj:
                    if cookie.domain == domain or cookie.domain == f'.{domain}':
                        new_cookies[cookie.name] = cookie.value

            if new_cookies:
                target_env = environment or self.current_environment
                self.update_cookies(new_cookies, environment=target_env)
                logger.info(f"导入了 {len(new_cookies)} 个cookies到环境 '{target_env}'")
                return True
            else:
                logger.warning(f"未找到 {domain} 的cookies，请先在浏览器登录")
                return False
                
        except Exception as e:
            logger.error(f"从浏览器导入cookies失败: {e}")
            return False
    
    def validate_cookies(self, environment: str = None) -> Dict[str, Any]:
        """
        验证指定环境的cookies有效性
        
        Args:
            environment: 环境名称，如果不指定则使用当前环境
        
        Returns:
            验证结果字典
        """
        env = environment or self.current_environment
        env_cookies = self._cookies.get(env, {})
        
        result = {
            'valid': True,
            'expired_tokens': [],
            'missing_tokens': [],
            'warnings': []
        }
        
        # 检查必需的token
        required_tokens = [
            'DATA-SUITE-AUTH-userToken-v4',
            'CSRF-TOKEN',
            'CSRF-VERIFY-TOKEN'
        ]
        
        for token in required_tokens:
            if token not in env_cookies:
                result['missing_tokens'].append(token)
                result['valid'] = False
        
        # 检查token过期状态
        jwt_tokens = [
            'DATA-SUITE-AUTH-userToken-v4',
            # 'seamoney-data-token-live',
            # '_oauth2_proxy_mesos'
        ]
        
        for token in jwt_tokens:
            if token in env_cookies and self.is_token_expired(token, environment=env):
                result['expired_tokens'].append(token)
                result['valid'] = False
        
        return result
    
    def get_expiry_info(self, environment: str = None) -> Dict[str, Any]:
        """
        获取指定环境所有token的过期信息
        
        Args:
            environment: 环境名称，如果不指定则使用当前环境
        
        Returns:
            过期信息字典
        """
        env = environment or self.current_environment
        env_cookies = self._cookies.get(env, {})
        info = {}
        
        jwt_tokens = [
            'DATA-SUITE-AUTH-userToken-v4',
            'seamoney-data-token-live',
            '_oauth2_proxy_mesos'
        ]
        
        for token in jwt_tokens:
            if token in env_cookies:
                expiry = self.check_token_expiry(token, environment=env)
                if expiry:
                    info[token] = {
                        'expiry': expiry.isoformat(),
                        'expired': self.is_token_expired(token, environment=env),
                        'time_left': str(expiry - datetime.now()) if expiry > datetime.now() else "已过期"
                    }
        
        return info
    
    def auto_refresh_from_browser(self, browsers: List[str] = None) -> bool:
        """
        自动从浏览器刷新cookies
        
        Args:
            browsers: 要尝试的浏览器列表，默认为['chrome', 'firefox', 'edge']
            
        Returns:
            刷新是否成功
        """
        if browsers is None:
            browsers = ['chrome', 'firefox', 'edge']
        
        for browser in browsers:
            try:
                if self.import_from_browser(browser):
                    logger.info(f"成功从{browser}浏览器刷新cookies")
                    return True
            except Exception as e:
                logger.warning(f"从{browser}浏览器刷新失败: {e}")
                continue
        
        logger.error("所有浏览器刷新尝试都失败了")
        return False 