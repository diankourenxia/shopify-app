# 顺丰快递打印功能说明

## 功能概述

基于 `catch/kx-print-master` 项目的顺丰快递API集成，实现订单运单的创建和打印功能。

## 功能特点

1. **创建运单** - 自动从Shopify订单提取信息，创建顺丰快递运单
2. **打印运单** - 支持直接打印生成的运单
3. **单个订单打印** - 在订单详情页可以创建并打印运单
4. **批量打印** - 订单列表支持批量选择打印（功能开发中）

## 技术实现

### API路由
- `/api/sf-express` - 顺丰快递API接口

### 支持的操作
- `createAndPrint` - 创建运单并打印
- `testConnection` - 测试API连接

## 配置说明

### 1. 环境变量配置

复制 `.env.sf-express.example` 文件，创建 `.env.sf-express` 并配置以下参数:

```bash
# 顺丰API配置
SF_API_URL=https://sfapi.sf-express.com
SF_APP_KEY=你的应用Key
SF_APP_SECRET=你的应用Secret
SF_ENCODING_AES_KEY=你的AES加密密钥
SF_CUSTOMER_CODE=你的客户编码

# 发件人信息
SF_SENDER_CONTACT=发件人姓名
SF_SENDER_PHONE=17611571900
SF_SENDER_REGION_FIRST=广东省
SF_SENDER_REGION_SECOND=深圳市
SF_SENDER_REGION_THIRD=宝安区
SF_SENDER_ADDRESS=详细地址
SF_SENDER_POSTCODE=518000
```

### 2. 将配置加载到主环境文件

在项目根目录的 `.env` 文件中添加顺丰配置，或者使用 dotenv 加载 `.env.sf-express` 文件。

## 使用方法

### 单个订单打印

1. 进入订单详情页 (`/app/orders/:id`)
2. 点击 "创建运单并打印" 按钮
3. 系统自动:
   - 提取订单信息
   - 创建顺丰运单
   - 获取运单号
   - 发送打印命令
4. 打印成功后显示运单号

### 批量打印（开发中）

1. 在订单列表页勾选需要打印的订单
2. 点击 "批量打印运单" 按钮
3. 系统批量处理所有选中的订单

## 数据转换规则

### Shopify订单 → 顺丰运单

| Shopify字段 | 顺丰字段 | 说明 |
|------------|---------|------|
| order.name | customerOrderNo | 订单编号 |
| shippingAddress.name | receiverInfo.contact | 收件人姓名 |
| shippingAddress.phone | receiverInfo.phoneNo | 收件人电话 |
| shippingAddress.address1/2 | receiverInfo.address | 收件地址 |
| shippingAddress.city | receiverInfo.regionSecond | 城市 |
| shippingAddress.province | receiverInfo.regionFirst | 省份 |
| shippingAddress.zip | receiverInfo.postCode | 邮编 |
| lineItems | parcelInfoList | 商品列表 |
| totalPrice | declaredValue | 申报价值 |

### 默认参数

- **产品代码**: INT0014 (国际快递)
- **收件方式**: 0 (上门收件)
- **付款方式**: 1 (寄方付)
- **重量单位**: KG
- **尺寸单位**: CM
- **默认重量**: 每件商品0.5KG

## 注意事项

### ⚠️ 重要提示

1. **加密实现**: 当前版本的加密/解密是简化版本，实际使用时需要实现完整的AES加密算法
   - 参考 `kx-print-master` 项目中的 `BizMsgCrypt` 类
   - 需要在Node.js环境中实现相同的加密逻辑

2. **Token管理**: Access Token会被缓存，自动在过期前30分钟刷新

3. **错误处理**: 
   - API调用失败会显示详细错误信息
   - 建议先使用 `testConnection` 测试连接

4. **运单号保存**: 建议在数据库中记录生成的运单号，方便后续查询

## 开发计划

- [ ] 完善AES加密/解密实现
- [ ] 实现批量打印功能
- [ ] 保存运单号到数据库
- [ ] 支持运单查询和取消
- [ ] 添加物流跟踪功能
- [ ] 支持更多快递公司

## API文档参考

参考顺丰开放平台文档:
- 创建运单: `IUOP_CREATE_ORDER`
- 打印运单: `IUOP_PRINT_ORDER`
- 获取Token: `oauth2/accessToken`

## 原项目说明

本功能基于 `catch/kx-print-master` 项目实现，这是一个Java Spring Boot项目，提供了完整的顺丰快递API集成示例。

主要参考文件:
- `SfController.java` - 控制器实现
- `SfClient.java` - API客户端
- `BizMsgCrypt.java` - 加密/解密工具

## 问题排查

### 1. Token获取失败
- 检查 `SF_APP_KEY` 和 `SF_APP_SECRET` 是否正确
- 确认顺丰API地址是否可访问

### 2. 创建运单失败
- 检查发件人信息是否完整
- 确认客户编码 `SF_CUSTOMER_CODE` 是否正确
- 查看详细错误信息

### 3. 打印失败
- 确认运单已成功创建
- 检查打印机是否在线
- 查看顺丰后台是否有运单记录

## 技术支持

如有问题，请查看:
1. 顺丰开放平台文档
2. `kx-print-master` 项目源码
3. 项目issue页面
