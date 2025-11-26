# 权限控制功能说明

## 功能概述
基于 Shopify 账号名称（shop）实现简单的权限控制，限制特定账号只能访问订单管理功能。

## 权限规则

### 受限账号
- **识别规则**: 账号名称（shop）中包含 "abc"（不区分大小写）
- **权限范围**: 只能访问以下页面
  - Home 页面
  - 订单管理页面
- **限制访问**: 无法访问以下页面
  - 布料管理
  - 衬布管理
  - 标签管理
  - 订单管理(演示)
  - Additional page

### 管理员账号
- **识别规则**: 账号名称中不包含 "abc"
- **权限范围**: 可以访问所有页面

## 实现机制

### 1. 导航菜单控制
- 受限账号登录时，导航菜单自动隐藏受限页面的链接
- 只显示 Home 和订单管理两个选项

### 2. URL 访问拦截
- 即使受限账号知道其他页面的 URL，直接访问也会被拦截
- 自动重定向到订单管理页面

### 3. API 操作拦截
- 受限账号无法通过 API 调用执行受限页面的操作
- 所有 loader 和 action 都会验证权限

## 技术实现

### 权限检查工具 (`app/utils/permissions.server.js`)

```javascript
// 检查用户是否有权限
checkPermission(shop, requiredPermission)

// 强制要求权限（无权限时重定向）
requirePermission(shop, requiredPermission)

// 判断是否为受限用户
isRestrictedUser(shop)
```

### 使用方式

**在路由 loader 中检查权限：**
```javascript
import { requirePermission } from "../utils/permissions.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // 检查权限，受限用户会被重定向到订单页面
  requirePermission(session?.shop, 'admin');
  
  // ... 其他代码
};
```

**在路由 action 中检查权限：**
```javascript
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // 检查权限
  requirePermission(session?.shop, 'admin');
  
  // ... 其他代码
};
```

## 修改权限规则

如果需要更改受限账号的识别规则，只需修改 `app/utils/permissions.server.js` 文件：

### 示例1: 更改关键词
```javascript
// 将 "abc" 改为 "test"
const isRestrictedUser = shopLower.includes('test');
```

### 示例2: 使用多个关键词
```javascript
// 账号包含 abc 或 xyz 时受限
const isRestrictedUser = shopLower.includes('abc') || shopLower.includes('xyz');
```

### 示例3: 使用白名单
```javascript
// 只有特定账号可以访问管理功能
const allowedShops = ['admin.myshopify.com', 'master.myshopify.com'];
const isRestrictedUser = !allowedShops.includes(shopLower);
```

### 示例4: 使用精确匹配
```javascript
// 完全匹配账号名称
const restrictedShops = ['abc-test.myshopify.com', 'abc-demo.myshopify.com'];
const isRestrictedUser = restrictedShops.includes(shopLower);
```

## 添加新的受限页面

如果新增页面需要权限控制，按以下步骤操作：

1. 在新页面的 loader 中导入权限检查函数：
```javascript
import { requirePermission } from "../utils/permissions.server";
```

2. 在 loader 中添加权限检查：
```javascript
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  requirePermission(session?.shop, 'admin');
  // ... 其他代码
};
```

3. 如果有 action，也要添加权限检查：
```javascript
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  requirePermission(session?.shop, 'admin');
  // ... 其他代码
};
```

4. 在 `app/routes/app.jsx` 中的导航菜单中添加条件显示：
```jsx
{!isRestrictedUser && (
  <Link to="/app/new-page">新页面</Link>
)}
```

## 扩展权限系统

如果需要更复杂的权限系统（如多个角色、细粒度权限等），可以：

1. 在数据库中添加用户角色表
2. 修改 `permissions.server.js` 从数据库读取权限
3. 定义更多的 `requiredPermission` 级别
4. 在每个页面根据需要检查不同的权限级别

示例权限级别：
- `'public'` - 所有人可访问
- `'orders-only'` - 只能访问订单
- `'manager'` - 可管理订单和库存
- `'admin'` - 完全访问权限

## 安全注意事项

1. **服务器端验证**: 权限检查必须在服务器端进行，不能仅依赖前端隐藏
2. **双重验证**: loader 和 action 都需要检查权限
3. **重定向而非错误**: 使用 `redirect` 而不是抛出错误，提供更好的用户体验
4. **日志记录**: 可以在权限检查时记录访问日志，便于审计

## 测试

### 测试受限账号
1. 使用包含 "abc" 的测试店铺登录
2. 验证导航菜单只显示 Home 和订单管理
3. 尝试直接访问 `/app/fabrics`，应被重定向到 `/app/orders`
4. 验证无法执行受限页面的操作

### 测试管理员账号
1. 使用不包含 "abc" 的店铺登录
2. 验证可以看到所有导航菜单项
3. 验证可以访问所有页面
4. 验证可以执行所有操作

## 部署

```bash
cd /var/www/shopify-app
git pull
npm run build
pm2 restart shopify-app
```

无需数据库迁移，直接部署即可生效。
