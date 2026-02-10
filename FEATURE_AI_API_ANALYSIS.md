# 🤖 新功能：AI智能API分析

## 📋 功能概述

**版本**: v2.15.0
**类型**: 创新功能 - AI助手与API溯源联动

### 功能亮点

将 **AI助手** 与 **API数据溯源** 功能深度整合，实现智能化的API分析能力。

当用户通过文本选取查找到API数据来源后，可以一键调用内置的AI助手，自动分析API的：
- 接口功能和用途
- 数据结构和字段含义
- 匹配字段的业务含义
- 异常情况和注意事项

---

## 🎯 使用场景

### 场景 1: 理解陌生接口
**痛点**: 在SPX页面看到一个订单号，想知道这个数据来自哪个接口，以及接口的详细信息

**解决方案**:
1. 选择订单号文字
2. 点击"🔍 查找来源"
3. 找到匹配的API后，点击"🤖 让AI分析"
4. AI自动分析接口功能、字段含义、业务逻辑

### 场景 2: 调试数据异常
**痛点**: 页面显示的数据不符合预期，需要快速定位问题

**解决方案**:
1. 选择异常数据
2. 查找API来源
3. 让AI分析响应数据
4. AI指出可能的异常原因和调试建议

### 场景 3: 学习业务逻辑
**痛点**: 新人不熟悉业务，看到接口数据不理解字段含义

**解决方案**:
1. 查找感兴趣数据的API来源
2. 让AI分析
3. AI根据上下文推测字段的业务含义

---

## 🔧 技术实现

### 架构设计

```
用户选择文字
    ↓
API数据溯源 (content.js)
    ↓
显示匹配的API列表
    ↓
用户点击"🤖 让AI分析"
    ↓
构建详细的分析提示词
    ↓
保存到 chrome.storage
    ↓
发送消息到 background.js
    ↓
打开扩展 Popup
    ↓
自动切换到 AI助手 Tab
    ↓
自动填充提示词
    ↓
（可选）自动发送给AI
```

### 核心代码

#### 1. Content Script - 添加"让AI分析"按钮

**文件**: `content.js`

```javascript
// 在数据来源面板中添加按钮
<button class="spx-ask-ai" data-id="${source.apiRecord.id}" 
  style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
         color: white; border: none; border-radius: 6px; 
         padding: 6px 12px; cursor: pointer; font-size: 12px;">
  🤖 让AI分析
</button>

// 绑定事件监听器
panel.querySelectorAll('.spx-ask-ai').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const id = e.target.dataset.id;
    const source = sources.find(s => s.apiRecord.id === id);
    if (source) {
      this.askAIAboutAPI(source);
    }
  });
});
```

#### 2. 构建AI分析提示词

```javascript
buildAPIAnalysisPrompt(source) {
  const record = source.apiRecord;
  
  // 截取响应数据（避免太长）
  let responsePreview = JSON.stringify(record.responseData, null, 2);
  if (responsePreview.length > 2000) {
    responsePreview = responsePreview.substring(0, 2000) + '\n... (数据已截断)';
  }
  
  // 构建详细的分析提示
  const prompt = `请帮我分析这个API接口：

📍 **API信息**
- URL: \`${record.url}\`
- 方法: ${record.method}
- 状态码: ${record.status}
- 响应时间: ${record.duration}ms
- 请求时间: ${record.requestTime}

${record.requestPayload ? `📤 **请求参数**
\`\`\`json
${JSON.stringify(record.requestPayload, null, 2)}
\`\`\`` : ''}

📥 **响应数据**（匹配的字段：${source.matches.join(', ')}）
\`\`\`json
${responsePreview}
\`\`\`

🔍 **匹配路径**
${source.matchPaths.length > 0 ? source.matchPaths.map(p => `- ${p}`).join('\n') : '（无）'}

请帮我分析：
1. 这个接口的主要功能和用途
2. 响应数据的结构和关键字段含义
3. 匹配到的字段 ${source.matches.map(m => `"${m}"`).join(', ')} 的业务含义
4. 是否有异常或需要注意的地方`;

  return prompt;
}
```

#### 3. Background Script - 打开Popup并切换Tab

**文件**: `background.js`

```javascript
if (request.action === 'OPEN_AI_ASSISTANT') {
  console.log('🤖 收到打开AI助手请求');
  
  // 打开扩展popup
  chrome.action.openPopup().then(() => {
    console.log('✅ Popup 已打开');
    
    // 等待 popup 加载完成后发送消息
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: 'SWITCH_TO_AI_TAB',
        prompt: request.prompt
      }).catch(err => {
        console.error('❌ 发送切换消息失败:', err);
      });
    }, 500);
  }).catch(err => {
    console.error('❌ 打开 popup 失败:', err);
    // 备用方案：打开窗口
    chrome.storage.local.get(['windowPosition'], function(result) {
      openHelperWindow(result.windowPosition);
    });
  });
  
  sendResponse({ success: true });
}
```

#### 4. Popup Script - 接收消息并自动填充

**文件**: `popup.js`

```javascript
// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SWITCH_TO_AI_TAB') {
    console.log('🤖 收到切换到AI助手的请求');
    
    // 切换到AI助手tab
    switchTab('code-helper');
    
    // 填充提示词
    if (request.prompt) {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.value = request.prompt;
        // 自动调整输入框高度
        chatInput.style.height = 'auto';
        chatInput.style.height = chatInput.scrollHeight + 'px';
        
        // 自动聚焦
        chatInput.focus();
        
        // 可选：自动发送消息
        setTimeout(() => {
          const sendBtn = document.getElementById('sendMessage');
          if (sendBtn && confirm('是否立即发送给AI助手？')) {
            sendBtn.click();
          }
        }, 300);
      }
    }
    
    sendResponse({ success: true });
  }
  
  return true;
});
```

---

## 🧪 测试指南

### 测试步骤

1. **打开测试页面**
   - 访问 SPX 页面（例如 FMS 订单列表）

2. **选择文字查找API**
   - 选择页面上的订单号或其他数据
   - 点击"🔍 查找来源"浮动按钮
   - 应该显示匹配的API列表

3. **点击"🤖 让AI分析"**
   - 在API列表中点击"🤖 让AI分析"按钮
   - 应该看到toast提示"🤖 正在打开AI助手..."

4. **验证Popup打开**
   - 扩展Popup应该自动打开
   - 自动切换到"💬 AI 助手" Tab

5. **验证提示词填充**
   - AI助手的输入框应该自动填充了详细的API分析提示
   - 提示词应该包含：
     - API URL、方法、状态码
     - 请求参数（如果有）
     - 响应数据（截断到2000字符）
     - 匹配的字段和路径
     - 分析要求（4个方面）

6. **发送给AI**
   - 会弹出确认对话框："是否立即发送给AI助手？"
   - 点击"确定"后自动发送
   - AI应该返回详细的分析结果

### 预期结果

**成功场景**:
```
✅ 按钮渲染正确（渐变紫色背景）
✅ 点击后显示toast提示
✅ Popup自动打开
✅ 自动切换到AI助手Tab
✅ 输入框自动填充提示词
✅ 提示词格式正确，包含所有必要信息
✅ 确认后自动发送给AI
✅ AI返回详细分析
```

**异常场景处理**:
```
⚠️ 如果 chrome.action.openPopup() 失败
   → 尝试打开窗口模式
⚠️ 如果消息发送失败
   → 控制台记录错误，不影响用户操作
⚠️ 如果AI助手未初始化
   → 提示词仍然被填充，等待用户手动发送
```

---

## 📊 提示词示例

### 实际生成的提示词格式

```markdown
请帮我分析这个API接口：

📍 **API信息**
- URL: `https://spx.shopee.co.id/api_mart/order/get_order_detail`
- 方法: POST
- 状态码: 200
- 响应时间: 156ms
- 请求时间: 2025-02-10T08:30:15.234Z

📤 **请求参数**
```json
{
  "order_sn": "220210AB12CD34",
  "include_items": true
}
```

📥 **响应数据**（匹配的字段：220210AB12CD34）
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "order_sn": "220210AB12CD34",
    "status": "completed",
    "tracking_number": "SPXID123456789",
    "recipient_name": "John Doe",
    "items": [...]
  }
}
```

🔍 **匹配路径**
- data.order_sn

请帮我分析：
1. 这个接口的主要功能和用途
2. 响应数据的结构和关键字段含义
3. 匹配到的字段 "220210AB12CD34" 的业务含义
4. 是否有异常或需要注意的地方
```

### AI返回的分析示例

```markdown
这是一个**订单详情查询接口**。

📊 **主要功能**
- 根据订单号（order_sn）查询订单的完整信息
- 支持包含子订单商品明细（include_items参数）
- 用于订单管理、客服查询、数据分析等场景

🔑 **关键字段说明**
- `order_sn`: 订单唯一标识，格式为日期+随机码
- `status`: 订单状态，"completed"表示已完成
- `tracking_number`: SPX物流单号，用于追踪包裹
- `recipient_name`: 收件人姓名

💡 **匹配字段分析**
"220210AB12CD34" 是订单号（order_sn），从格式可以看出：
- "220210" 可能表示订单创建日期 2022年2月10日
- "AB12CD34" 是随机生成的唯一标识码

✅ **状态正常**
- 接口响应成功（code: 0）
- 响应时间156ms，性能良好
- 数据结构完整，没有明显异常
```

---

## 🎁 用户价值

### 提升效率
- **省去手动整理**: 不需要手动复制API信息、请求参数、响应数据
- **一键分析**: 点击按钮即可获得专业的API分析
- **快速理解**: AI快速解释接口功能和字段含义

### 降低学习成本
- **新人友好**: 不熟悉业务的新人可以通过AI快速理解接口
- **知识沉淀**: AI的分析可以作为接口文档的补充

### 增强调试能力
- **异常诊断**: AI能识别响应数据中的异常模式
- **问题定位**: 快速定位数据不符合预期的原因

---

## 🔄 未来扩展

### 可能的增强方向

1. **批量分析**
   - 选择多个API，一次性分析对比

2. **生成文档**
   - 根据AI分析结果自动生成API文档
   - 导出为Markdown或Swagger格式

3. **生成测试用例**
   - AI根据接口参数自动生成测试用例
   - 生成Mock数据

4. **SQL查询生成**
   - 根据API响应数据结构生成对应的SQL查询
   - 适用于数据分析场景

5. **性能分析**
   - AI分析响应时间、数据量
   - 给出性能优化建议

---

## ✅ 验收标准

- [x] "🤖 让AI分析"按钮渲染正确
- [x] 点击按钮后打开Popup
- [x] 自动切换到AI助手Tab
- [x] 自动填充详细的分析提示词
- [x] 提示词包含所有必要信息
- [x] 提供"是否立即发送"确认对话框
- [x] AI返回有价值的分析结果
- [x] 异常情况有合理的降级处理

---

## 📝 更新日志

**v2.15.0** (2025-02-10)
- 🎉 新增 AI智能API分析功能
- 🔗 实现 API溯源 与 AI助手 的深度联动
- 🤖 自动构建详细的API分析提示词
- ⚡ 一键调用AI助手进行智能分析

---

**功能开发**: Cursor AI + tianyi.liang  
**测试版本**: v2.15.0  
**发布日期**: 2025-02-10
