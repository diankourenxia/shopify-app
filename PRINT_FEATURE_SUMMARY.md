# 订单打印功能实现 - 完成摘要

## 项目分析

已分析 `catch/kx-print-master` 项目，这是一个基于 Spring Boot 的顺丰快递API集成项目，提供了运单创建和打印功能。

## 实现的功能

### 1. 核心文件

#### API路由
- **`app/routes/api.sf-express.jsx`** - 顺丰快递API接口
  - 创建运单接口
  - 打印运单接口
  - Token管理
  - 数据转换（Shopify订单 → 顺丰运单）

#### 加密工具
- **`app/utils/sf-encryptor.js`** - AES加密/解密工具
  - 完整实现了顺丰API要求的AES-256-CBC加密
  - PKCS7填充/解除填充
  - SHA1签名生成和验证
  - 基于 `kx-print-master` 的 `BizMsgCrypt.java` 实现

#### UI组件更新
- **`app/routes/app.orders.$id.jsx`** - 订单详情页
  - 添加"创建运单并打印"按钮
  - 打印结果展示Modal
  - 运单号显示

- **`app/routes/app.orders.jsx`** - 订单列表页
  - 添加"批量打印运单"按钮（UI已完成，功能提示开发中）
  - 集成顺丰打印fetcher

#### 配置文件
- **`.env.sf-express.example`** - 环境变量配置模板
- **`SF_EXPRESS_PRINT_GUIDE.md`** - 完整的功能说明文档

## 功能特点

### ✅ 已实现
1. **单个订单打印** - 在订单详情页创建并打印运单
2. **完整加密实现** - 符合顺丰API规范的AES加密/解密
3. **Token自动管理** - 自动获取和缓存access token
4. **数据自动转换** - Shopify订单自动转换为顺丰运单格式
5. **错误处理** - 完善的错误提示和处理机制
6. **打印结果展示** - Modal显示运单号和打印详情

### 🚧 待完善
1. **批量打印功能** - UI已就位，后端逻辑待实现
2. **运单号保存** - 建议保存到数据库便于查询
3. **物流跟踪** - 可基于运单号实现物流跟踪
4. **运单取消** - 支持取消已创建的运单

## 使用流程

### 1. 配置环境变量

```bash
# 复制配置模板
cp .env.sf-express.example .env.sf-express

# 编辑配置文件，填入顺丰提供的参数
SF_APP_KEY=你的应用Key
SF_APP_SECRET=你的应用Secret
SF_ENCODING_AES_KEY=你的AES密钥（43位Base64字符串）
SF_CUSTOMER_CODE=你的客户编码

# 发件人信息
SF_SENDER_CONTACT=发件人姓名
SF_SENDER_PHONE=17611571900
...
```

### 2. 在订单详情页使用

1. 访问任意订单详情页：`/app/orders/{订单ID}`
2. 点击"创建运单并打印"按钮
3. 系统自动：
   - 提取订单信息（收件地址、商品等）
   - 调用顺丰API创建运单
   - 获取运单号
   - 发送打印命令
4. 成功后显示运单号，可以在顺丰系统查询

### 3. 批量打印（开发中）

在订单列表页：
1. 勾选多个订单
2. 点击"批量打印运单"
3. 当前会提示功能开发中

## 技术实现细节

### 加密算法

实现了完整的顺丰API加密规范：

```javascript
// 加密流程
1. 生成16字节随机字符串
2. 构造数据包：随机串 + 消息长度(4字节) + 消息 + appKey
3. PKCS7填充至32字节对齐
4. AES-256-CBC加密（密钥和IV均使用encodingAesKey）
5. Base64编码
6. SHA1签名（token + timestamp + nonce + encrypt排序后）

// 解密流程
1. Base64解码
2. AES-256-CBC解密
3. 移除PKCS7填充
4. 提取消息内容
5. 验证appKey
```

### API调用

```javascript
// 创建运单
POST ${SF_API_URL}/std/service
Headers:
  - appKey: 应用Key
  - token: 访问令牌
  - timestamp: 时间戳
  - nonce: 随机数
  - signature: SHA1签名
  - msgType: IUOP_CREATE_ORDER
Body: AES加密后的运单数据

// 打印运单
POST ${SF_API_URL}/std/service
Headers: 同上
msgType: IUOP_PRINT_ORDER
Body: AES加密后的打印请求
```

### 数据转换映射

| Shopify | 顺丰 | 处理逻辑 |
|---------|------|---------|
| order.name | customerOrderNo | 直接使用 |
| shippingAddress | receiverInfo | 完整映射收件信息 |
| lineItems | parcelInfoList | 商品列表转换 |
| totalPrice | declaredValue | 申报价值 |
| 数量 × 0.5KG | parcelTotalWeight | 默认重量计算 |

## 项目结构

```
order-prodcut/
├── app/
│   ├── routes/
│   │   ├── api.sf-express.jsx          # 顺丰API路由
│   │   ├── app.orders.$id.jsx           # 订单详情（已更新）
│   │   └── app.orders.jsx               # 订单列表（已更新）
│   └── utils/
│       └── sf-encryptor.js              # 加密工具类
├── catch/
│   └── kx-print-master/                 # 参考项目
│       ├── src/main/java/...
│       └── pom.xml
├── .env.sf-express.example              # 配置模板
└── SF_EXPRESS_PRINT_GUIDE.md            # 使用指南
```

## 测试建议

1. **测试连接**
   ```bash
   # 使用测试接口验证配置
   curl -X POST http://localhost/api/sf-express \
     -d "action=testConnection"
   ```

2. **测试创建运单**
   - 先在订单详情页测试单个订单
   - 检查返回的运单号
   - 在顺丰系统确认运单存在

3. **验证打印**
   - 确保打印机已连接
   - 检查顺丰后台是否有打印记录

## 注意事项

⚠️ **重要提示**:

1. **生产环境配置**: 务必使用顺丰生产环境的配置，沙箱环境配置不同
2. **密钥安全**: 切勿将密钥提交到代码仓库
3. **发件人信息**: 必须配置真实的发件人信息，否则运单创建失败
4. **客户编码**: 需要从顺丰获取正式的客户编码
5. **加密密钥**: encodingAesKey必须是43位Base64字符串

## 后续优化建议

1. **数据库集成**
   - 创建 `ShippingLabel` 表保存运单信息
   - 记录运单号、创建时间、状态等

2. **批量打印实现**
   - 实现队列处理机制
   - 添加进度显示
   - 支持失败重试

3. **物流跟踪**
   - 集成顺丰物流查询API
   - 在订单页面显示物流状态

4. **多快递支持**
   - 抽象快递接口
   - 支持其他快递公司（中通、圆通等）

## 参考资料

- 顺丰开放平台: https://open.sf-express.com
- kx-print-master项目: `catch/kx-print-master/`
- 功能使用指南: `SF_EXPRESS_PRINT_GUIDE.md`

## 更新日志

### 2025-11-25
- ✅ 分析 kx-print-master 项目
- ✅ 实现顺丰API接口 (`api.sf-express.jsx`)
- ✅ 实现AES加密工具 (`sf-encryptor.js`)
- ✅ 更新订单详情页UI
- ✅ 更新订单列表页UI
- ✅ 创建配置文件和文档
- ✅ 完整的错误处理和提示
