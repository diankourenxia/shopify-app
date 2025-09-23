# 订单数据访问权限申请指南

## 🚨 当前问题
你的应用遇到了以下错误：
```
Error: This app is not approved to access the Order object. 
See https://shopify.dev/docs/apps/launch/protected-customer-data for more details.
```

## 📋 解决方案

### 方案1: 申请订单数据访问权限 (推荐)

#### 步骤1: 登录Shopify Partner Dashboard
1. 访问 [Shopify Partner Dashboard](https://partners.shopify.com/)
2. 登录你的账户

#### 步骤2: 找到你的应用
1. 在左侧菜单中点击 "Apps"
2. 找到 "order-prodcut" 应用
3. 点击进入应用详情

#### 步骤3: 申请订单权限
1. 在应用设置中找到 "App permissions" 或 "Scopes"
2. 添加以下权限：
   - `read_orders` - 读取订单数据
3. 提供业务理由说明：
   ```
   业务理由：开发订单管理系统，用于：
   - 查看和管理商店订单
   - 提供订单搜索和筛选功能
   - 显示订单详情和状态
   - 改善商家订单管理体验
   - 仅显示客户姓名，不访问敏感客户信息
   ```

#### 步骤4: 提交申请
1. 填写完整的申请表单
2. 说明你的应用如何使用订单数据
3. 提交申请并等待审核

### 方案2: 使用演示版本 (临时方案)

在等待权限批准期间，你可以使用演示版本：

1. **访问演示页面**: `/app/orders/demo`
2. **功能完整**: 包含所有订单管理功能
3. **模拟数据**: 使用预设的订单数据进行测试
4. **界面预览**: 可以查看完整的用户界面

### 方案3: 使用Shopify CLI重新配置

如果权限配置有问题，可以尝试重新配置：

```bash
# 重置应用配置
shopify app dev --reset

# 重新配置权限
shopify app config link
```

## 📚 相关文档

- [Shopify App权限文档](https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes)
- [受保护客户数据](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [订单API文档](https://shopify.dev/docs/api/admin-graphql/latest/objects/order)

## ⏱️ 审核时间

- **标准审核**: 通常需要 1-3 个工作日
- **紧急审核**: 可以联系Shopify支持团队
- **开发环境**: 某些权限在开发环境中可能立即可用

## 🔧 当前状态

- ✅ 应用已创建
- ✅ 基本权限已配置
- ⏳ 等待订单权限批准
- ✅ 演示版本可用

## 💡 建议

1. **先使用演示版本** 进行界面测试和功能验证
2. **准备详细的业务理由** 用于权限申请
3. **联系Shopify支持** 如果审核时间过长
4. **考虑使用测试商店** 进行开发测试
