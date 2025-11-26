# 账号权限控制 - 快速参考

## 当前规则
- **包含 "abc" 的账号** → 只能访问订单管理
- **其他账号** → 可访问所有功能

## 修改权限关键词

编辑文件：`app/utils/permissions.server.js`

找到这行代码：
```javascript
const isRestrictedUser = shopLower.includes('abc');
```

### 常见修改示例

**改为其他关键词：**
```javascript
const isRestrictedUser = shopLower.includes('test');
```

**使用多个关键词：**
```javascript
const isRestrictedUser = shopLower.includes('abc') || shopLower.includes('xyz');
```

**精确匹配特定账号：**
```javascript
const restrictedShops = ['abc-test.myshopify.com', 'demo.myshopify.com'];
const isRestrictedUser = restrictedShops.includes(shopLower);
```

**使用白名单（只有特定账号可以管理）：**
```javascript
const adminShops = ['admin.myshopify.com', 'master.myshopify.com'];
const isRestrictedUser = !adminShops.includes(shopLower);
```

## 受影响的页面

### 受限账号无法访问：
- ❌ 布料管理 (`/app/fabrics`)
- ❌ 衬布管理 (`/app/linings`)
- ❌ 标签管理 (`/app/tags`)
- ❌ 订单管理(演示) (`/app/orders/demo`)
- ❌ Additional page (`/app/additional`)

### 受限账号可以访问：
- ✅ Home (`/app`)
- ✅ 订单管理 (`/app/orders`)

## 部署
```bash
cd /var/www/shopify-app
git pull
npm run build
pm2 restart shopify-app
```

## 文件清单
- `app/utils/permissions.server.js` - 权限检查逻辑
- `app/routes/app.jsx` - 导航菜单控制
- `app/routes/app.fabrics.jsx` - 布料管理权限
- `app/routes/app.linings.jsx` - 衬布管理权限
- `app/routes/app.tags.jsx` - 标签管理权限
- `app/routes/app.orders.demo.jsx` - 演示页面权限
- `app/routes/app.additional.jsx` - 附加页面权限
