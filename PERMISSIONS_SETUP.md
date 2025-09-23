# 权限设置说明

## 问题
应用遇到 "Access denied for orders field" 错误，这是因为应用缺少访问订单数据的权限。

## 解决方案

### 1. 权限配置已更新
我已经在 `shopify.app.toml` 中添加了必要的权限：
```toml
scopes = "write_products,read_orders,read_customers"
```

### 2. 需要重新部署应用
由于权限配置发生了变化，你需要重新部署应用：

```bash
# 部署应用
npm run deploy
```

### 3. 或者重新安装应用
如果是在开发环境中，你可能需要：

1. 卸载当前应用
2. 重新安装应用以获取新权限

### 4. 权限说明
添加的权限包括：
- `read_orders` - 读取订单数据
- `read_customers` - 读取客户数据
- `write_products` - 写入产品数据（原有权限）

### 5. 验证权限
重新部署后，应用应该能够：
- 查看订单列表
- 查看订单详情
- 查看客户信息
- 搜索和筛选订单

## 注意事项
- 权限更改需要重新部署应用
- 确保你的Shopify Partner账户有足够的权限
- 如果仍有问题，检查Shopify Partner Dashboard中的权限设置
