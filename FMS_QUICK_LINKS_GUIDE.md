# FMS 快速链接使用指南

## 功能位置
📍 **扩展弹窗** → **🔗 快速链接** 标签页 → **FMS 快速入口** 区域

## 功能说明
快速访问不同环境和市场的 FMS (Fleet Management System) 管理后台。

## 使用方法

### 1. 选择环境
点击顶部的环境标签页，选择目标环境：
- **LIVE** - 生产环境
- **UAT** - 用户验收测试环境
- **TEST** - 测试环境
- **TEST-STABLE** - 测试稳定环境（仅 TH 市场）
- **STAGING** - 预发布环境

### 2. 选择市场
在环境标签下方会显示该环境支持的市场按钮，点击即可跳转：

| 市场 | 代码 | 支持环境 |
|------|------|----------|
| Indonesia | ID | LIVE, UAT, TEST, STAGING |
| Malaysia | MY | LIVE, UAT, TEST, STAGING |
| Thailand | TH | LIVE, UAT, TEST, TEST-STABLE, STAGING |
| Philippines | PH | LIVE, UAT, TEST, STAGING |
| Vietnam | VN | LIVE, UAT, TEST, STAGING |
| Singapore | SG | LIVE, UAT, TEST, STAGING |
| Taiwan | TW | LIVE, UAT, TEST, STAGING |
| XX (Global?) | XX | LIVE |
| Brazil | BR | LIVE, UAT, TEST, STAGING |
| Mexico | MX | LIVE, UAT, TEST |

## 链接格式

### 标准格式
```
https://spx.{env}.shopee.{domain}/
```

示例：
- LIVE: `https://spx.shopee.co.id/`
- UAT: `https://spx.uat.shopee.co.id/`
- TEST: `https://spx.test.shopee.co.id/`

### 特殊格式
- XX 市场（Global）: `https://spx.shopee.systems/#/index`
- BR 市场: `https://spx.shopee.com.br/#/index`

## 特点
✅ 按环境分组，一目了然  
✅ 点击即可在新标签页打开  
✅ 自动记忆上次选择的环境  
✅ 支持所有主要市场和环境组合

## 更新日志
- **v2.12.0** - FMS 快速入口功能已完整实现
