# 网络连接问题排查指南

## 当前问题
```
FetchError: request to https://order-product-store.myshopify.com/app_dev/unstable/graphql.json failed, reason: Client network socket disconnected before secure TLS connection was established
```

## 可能的原因和解决方案

### 1. 网络连接问题
- **检查网络连接**: 确保你的网络连接稳定
- **防火墙设置**: 检查是否有防火墙阻止了连接
- **代理设置**: 如果你使用代理，确保配置正确

### 2. Shopify服务问题
- **服务状态**: 检查 [Shopify状态页面](https://status.shopify.com/)
- **API限制**: 检查是否达到了API调用限制

### 3. 应用配置问题
- **权限问题**: 确保应用有正确的权限
- **URL配置**: 确保URL配置正确

## 解决步骤

### 步骤1: 检查网络连接
```bash
# 测试网络连接
ping order-product-store.myshopify.com
curl -I https://order-product-store.myshopify.com
```

### 步骤2: 重置应用配置
```bash
# 重置应用配置
shopify app dev --reset
```

### 步骤3: 使用不同的隧道服务
```bash
# 使用ngrok隧道
shopify app dev --tunnel-url=ngrok

# 或者使用Cloudflare隧道
shopify app dev --tunnel-url=cloudflare
```

### 步骤4: 检查Shopify Partner Dashboard
1. 登录 [Shopify Partner Dashboard](https://partners.shopify.com/)
2. 检查应用状态
3. 确认权限设置
4. 检查开发商店状态

### 步骤5: 重新安装应用
如果问题持续存在：
1. 在Shopify Partner Dashboard中删除应用
2. 重新创建应用
3. 重新安装到开发商店

## 临时解决方案

如果网络问题持续存在，你可以：

1. **使用本地开发模式**:
   ```bash
   npm run dev
   # 然后手动访问 http://localhost:3000
   ```

2. **检查环境变量**:
   确保所有必要的环境变量都已设置

3. **使用不同的网络**:
   尝试使用不同的网络连接（如手机热点）

## 联系支持

如果问题仍然存在，可以：
- 查看 [Shopify CLI文档](https://shopify.dev/docs/apps/tools/cli)
- 在 [Shopify开发者论坛](https://community.shopify.com/c/shopify-apis-and-sdks/bd-p/shopify-apis-and-technology-partners) 寻求帮助
