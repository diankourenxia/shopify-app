# 公开访问功能使用指南

## 功能说明

现在你可以创建不需要登录就能访问的订单页面，这些页面会显示缓存的数据。

## 访问地址

### 公开订单列表
```
/orders/public
```

### 公开订单详情
```
/orders/public/{订单ID}
```

## 页面特点

1. **无需登录** - 任何人都可以访问
2. **只读模式** - 只能查看数据，不能修改
3. **缓存数据** - 显示的是缓存中的数据
4. **自动刷新** - 可以手动刷新获取最新缓存数据

## 数据更新机制

### 方式1: 管理员更新
- 登录到 `/app/orders` 页面
- 点击"更新缓存"按钮
- 数据会同步到公开页面

### 方式2: API更新
```bash
# 手动调用更新API
curl -X POST http://your-domain/app/api/cache-update

# 自动检查更新API
curl -X GET http://your-domain/app/api/auto-update
```

### 方式3: 定时任务
```bash
# 设置cron job每5分钟检查一次
*/5 * * * * cd /path/to/project && node scripts/auto-update-cache.js
```

## 部署说明

### 1. 环境变量
确保设置了正确的环境变量：
```bash
SHOPIFY_APP_URL=https://your-domain.com
```

### 2. 权限设置
- 确保服务器有读写 `cache/` 目录的权限
- 公开路由不需要Shopify认证

### 3. 缓存目录
```
cache/
└── orders.json  # 自动生成的缓存文件
```

## 安全考虑

1. **数据敏感性** - 公开页面会显示订单信息，请确保这是你想要的
2. **访问控制** - 如果需要限制访问，可以添加IP白名单或其他验证
3. **数据时效性** - 公开页面显示的是缓存数据，可能有延迟

## 故障排除

### 问题1: 公开页面显示"暂无缓存数据"
**解决方案**: 
1. 先登录到 `/app/orders` 页面
2. 点击"更新缓存"按钮
3. 然后访问 `/orders/public`

### 问题2: 缓存更新失败
**解决方案**:
1. 检查Shopify应用权限
2. 检查网络连接
3. 查看服务器日志

### 问题3: 公开页面无法访问
**解决方案**:
1. 检查路由配置
2. 确保文件已正确部署
3. 检查服务器错误日志

## 自定义配置

### 修改缓存过期时间
在 `app/services/cache.server.js` 中修改：
```javascript
// 默认5分钟过期，可以修改为其他值
expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
```

### 添加访问控制
可以在公开路由中添加验证逻辑：
```javascript
// 在 loader 函数中添加
const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
// 添加IP白名单检查等
```
