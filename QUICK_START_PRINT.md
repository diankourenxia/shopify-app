# 🚀 快速开始 - 顺丰打印功能

## 📋 前提条件

1. ✅ 已完成 Shopify App 基本设置
2. ✅ 顺丰API服务已部署（http://8.219.107.56）

## 🔧 配置步骤

### 1. 配置发件人信息

编辑 `.env` 文件，添加以下配置：

```env
# 顺丰API服务地址（可选，默认为 http://8.219.107.56）
SF_API_BASE_URL=http://8.219.107.56

# 发件人信息（必填）
SF_SENDER_CONTACT=张三
SF_SENDER_PHONE=13800138000
SF_SENDER_REGION_FIRST=广东省
SF_SENDER_REGION_SECOND=深圳市
SF_SENDER_REGION_THIRD=宝安区
SF_SENDER_ADDRESS=科技园路123号
SF_SENDER_POSTCODE=518000
```

### 2. 启动应用

```bash
npm run dev
```

## 📦 使用功能

### 单个订单打印

1. **访问订单详情页**
   ```
   http://localhost:3000/app/orders/{订单ID}
   ```

2. **点击"创建运单并打印"按钮**
   
   系统会自动：
   - 从订单提取收件信息
   - 调用 `http://8.219.107.56/sf/create_order` 创建运单
   - 调用 `http://8.219.107.56/sf/print_order` 获取打印URL
   - 在新窗口打开打印页面

3. **查看结果**
   
   成功后会：
   - 弹出Modal显示运单号
   - 自动在新窗口打开打印页面
   - 可以重新打开打印页面或复制运单号

## 🎯 功能说明

### ✅ 已实现的功能

- [x] 单个订单创建运单
- [x] 自动获取打印URL
- [x] 新窗口打开打印页面
- [x] 运单号展示和复制
- [x] 错误处理和提示

### API接口

| 接口 | 地址 | 说明 |
|------|------|------|
| 创建运单 | `http://8.219.107.56/sf/create_order` | 创建顺丰运单，返回运单号 |
| 获取打印URL | `http://8.219.107.56/sf/print_order` | 获取运单打印页面URL |

## 📁 相关文件

| 文件路径 | 说明 |
|---------|------|
| `app/routes/api.sf-express.jsx` | 顺丰API接口（简化版） |
| `app/routes/app.orders.$id.jsx` | 订单详情页（含打印按钮） |
| `app/routes/app.orders.jsx` | 订单列表页 |

## 🔍 故障排查

### 问题1: 创建运单失败

**症状**: 提示"创建运单失败"

**解决方案**:
- 检查发件人信息是否完整
- 确认订单收件地址是否完整
- 查看错误详情中的具体原因
- 确认API服务 `http://8.219.107.56` 是否可访问

### 问题2: 没有打印URL

**症状**: 运单创建成功但没有打印URL

**解决方案**:
- 检查 `print_order` 接口返回的数据格式
- 使用运单号在顺丰系统手动查询
- 查看控制台的详细日志

### 问题3: API服务无法访问

**症状**: 提示"请求失败"

**解决方案**:
- 确认 API 服务是否在线
- 检查网络连接
- 验证 `SF_API_BASE_URL` 配置是否正确

## 💡 使用流程

```
用户点击按钮
    ↓
提取Shopify订单信息
    ↓
调用 /sf/create_order 创建运单
    ↓
获取运单号
    ↓
调用 /sf/print_order 获取打印URL
    ↓
新窗口打开打印页面
    ↓
显示结果Modal
```

## 📊 数据格式

### 创建运单请求示例

```json
{
  "customerOrderNo": "#1001",
  "interProductCode": "INT0014",
  "senderInfo": {
    "contact": "张三",
    "phoneNo": "13800138000",
    "address": "科技园路123号"
  },
  "receiverInfo": {
    "contact": "李四",
    "phoneNo": "13900139000",
    "address": "Broadway 123"
  }
}
```

### 打印请求示例

```json
{
  "printWaybillNoDtoList": [
    {
      "sfWaybillNo": "SF1234567890"
    }
  ]
}
```

## 🆘 获取帮助

如遇到问题：
1. 查看浏览器控制台错误信息
2. 检查发件人配置是否正确
3. 确认API服务是否正常运行
4. 查看服务端日志

---

**开发完成时间**: 2025-11-25  
**版本**: 2.0.0（简化版）  
**状态**: 可用

