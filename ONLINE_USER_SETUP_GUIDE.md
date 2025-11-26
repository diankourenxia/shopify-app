# 如何获取在线用户信息 - 完整指南

## 已实现的功能 ✅

### 1. 启用在线访问令牌
已在 `app/shopify.server.js` 中添加 `useOnlineTokens: true` 配置。

### 2. 双重获取方式

#### 方式一：服务器端获取（Session）
通过 `session.onlineAccessInfo` 获取用户信息：
- ✅ 用户 ID
- ✅ 名字和姓氏
- ✅ 邮箱
- ✅ 是否为店铺所有者

#### 方式二：前端获取（App Bridge）
通过解析 App Bridge 的 ID Token 获取：
- ✅ 用户 ID (sub)
- ✅ Shop ID
- ✅ Token payload 信息

## 使在线令牌生效的步骤

### 方法 1：重新安装应用（推荐）

1. **在 Shopify Admin 中卸载应用**
   - 进入 Settings → Apps and sales channels
   - 找到你的应用
   - 点击 Uninstall

2. **清除数据库中的旧 Session**
   ```bash
   # 连接到服务器
   cd /var/www/shopify-app
   
   # 清除旧的 session
   npx prisma studio
   # 或直接通过 Prisma 删除
   ```

3. **重新部署应用**
   ```bash
   git pull
   npm run build
   pm2 restart shopify-app
   ```

4. **重新安装应用**
   - 访问应用安装链接
   - 重新授权

### 方法 2：等待自然更新

在线令牌会在以下情况下自动生成：
- 用户重新登录
- Token 过期后重新认证
- 用户在不同浏览器/设备访问

⚠️ 注意：已存在的离线令牌不会自动转换为在线令牌。

### 方法 3：手动触发重新认证

在代码中添加强制重新认证：

```javascript
// 在 loader 中
export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    
    // 如果是离线令牌，可以重定向到认证
    if (!session?.isOnline) {
      // 触发重新认证
      throw redirect('/auth?shop=' + session?.shop);
    }
    
    return json({ session });
  } catch (error) {
    // 处理错误
  }
};
```

## 查看用户信息

部署后访问首页 (`/app`)，查看"账号信息 (调试)"区域：

### 1️⃣ Session 信息
显示基本的会话信息，包括：
```json
{
  "id": "offline_xxx.myshopify.com",
  "shop": "xxx.myshopify.com",
  "isOnline": true/false,
  "scope": "read_products,write_orders...",
  "onlineAccessInfo": { ... }
}
```

### 2️⃣ 当前访问用户信息（服务器端）
如果 `isOnline: true`，会显示：
```json
{
  "associated_user": {
    "id": 123456789,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "account_owner": true,
    "locale": "en",
    "collaborator": false
  },
  "expires_in": 86400
}
```

### 3️⃣ App Bridge 用户信息（前端）
从 ID Token 解析出的信息：
```json
{
  "shopOrigin": "xxx.myshopify.com",
  "apiKey": "your-api-key",
  "userId": "gid://shopify/User/123456789",
  "shopId": "123456789",
  "tokenPayload": {
    "iss": "...",
    "dest": "...",
    "aud": "...",
    "sub": "...",
    "exp": ...,
    "nbf": ...,
    "iat": ...,
    "jti": "...",
    "sid": "..."
  }
}
```

## 在代码中使用用户信息

### 在服务器端（Loader/Action）

```javascript
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // 检查是否有用户信息
  if (session?.onlineAccessInfo?.associated_user) {
    const user = session.onlineAccessInfo.associated_user;
    
    console.log('当前用户:', user.first_name, user.last_name);
    console.log('邮箱:', user.email);
    console.log('是否所有者:', user.account_owner);
    console.log('用户ID:', user.id);
    
    // 根据用户信息进行权限控制
    if (!user.account_owner) {
      throw new Error('只有店铺所有者可以访问');
    }
  }
  
  return json({ user: session?.onlineAccessInfo?.associated_user });
};
```

### 在前端组件中

```jsx
export default function MyComponent() {
  const { sessionInfo } = useLoaderData();
  const user = sessionInfo?.onlineAccessInfo?.associated_user;
  
  return (
    <Page>
      <Text as="h2" variant="headingMd">
        Welcome, {user ? `${user.first_name} ${user.last_name}` : 'Guest'}
      </Text>
      
      {user?.account_owner && (
        <Badge tone="success">店铺所有者</Badge>
      )}
      
      {user?.email && (
        <Text variant="bodyMd" tone="subdued">
          {user.email}
        </Text>
      )}
    </Page>
  );
}
```

### 使用 App Bridge（前端）

```jsx
import { useState, useEffect } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';

export default function MyComponent() {
  const shopify = useAppBridge();
  const [userId, setUserId] = useState(null);
  
  useEffect(() => {
    async function getUserId() {
      try {
        const token = await shopify.idToken();
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserId(payload.sub); // 用户 ID
      } catch (error) {
        console.error('Error getting user ID:', error);
      }
    }
    
    getUserId();
  }, [shopify]);
  
  return (
    <div>User ID: {userId}</div>
  );
}
```

## 常见问题

### Q1: 为什么我看不到用户信息？
**A:** 可能的原因：
1. ❌ 应用仍在使用旧的离线令牌
2. ❌ 需要重新安装应用
3. ❌ 配置更改后未重启服务器

**解决方案：**
- 重新安装应用（最可靠）
- 或等待用户重新登录
- 检查 `sessionInfo.isOnline` 是否为 `true`

### Q2: isOnline 为 false，怎么办？
**A:** 这表示当前 session 是离线令牌：
1. 在 Shopify Admin 中卸载应用
2. 部署最新代码（包含 `useOnlineTokens: true`）
3. 重新安装应用

### Q3: 可以同时使用在线和离线令牌吗？
**A:** 可以！实际上推荐这样做：
- 在线令牌：用于需要用户上下文的操作
- 离线令牌：用于后台任务、Webhook、定时任务

配置方法：
```javascript
const shopify = shopifyApp({
  useOnlineTokens: true,  // 启用在线令牌
  // 离线令牌会自动保留用于后台任务
});
```

### Q4: 在线令牌什么时候过期？
**A:** 在线令牌的有效期为 **24 小时**。过期后：
- App Bridge 会自动刷新令牌
- 用户需要重新认证
- 不需要手动处理

### Q5: 如何区分不同用户？
**A:** 使用以下任一方式：
- 服务器端：`session.onlineAccessInfo.associated_user.id`
- 前端：从 ID Token 的 `sub` 字段
- 两者返回的是同一个用户 ID

### Q6: App Bridge 的 ID Token 包含哪些信息？
**A:** ID Token 是 JWT 格式，包含：
- `sub`：用户 ID (gid://shopify/User/xxx)
- `dest`：目标店铺 URL
- `aud`：API Key
- `iss`：签发者
- `exp`：过期时间
- `iat`：签发时间

## 安全注意事项

### ✅ 应该做的：
- 在服务器端验证用户权限
- 使用 HTTPS
- 不要在前端存储敏感信息
- 记录用户操作日志

### ❌ 不应该做的：
- 不要在前端显示完整的 access token
- 不要在数据库中明文存储 token
- 不要依赖前端验证权限
- 不要在 URL 参数中传递用户信息

## 测试步骤

1. **部署代码**
   ```bash
   cd /var/www/shopify-app
   git pull
   npm run build
   pm2 restart shopify-app
   ```

2. **重新安装应用**
   - 在 Shopify Admin 卸载应用
   - 访问应用安装 URL
   - 重新授权

3. **访问首页**
   - 打开 `/app` 路由
   - 查看"账号信息 (调试)"区域

4. **验证信息**
   - ✅ `isOnline` 应该为 `true`
   - ✅ 应该看到"当前访问用户信息"
   - ✅ 应该看到"App Bridge 用户信息"
   - ✅ 用户信息包含名字、邮箱等

## 进阶：根据用户信息控制权限

```javascript
// app/utils/user-permissions.server.js
export function checkUserPermission(session, requiredPermission) {
  const user = session?.onlineAccessInfo?.associated_user;
  
  if (!user) {
    return false; // 无用户信息
  }
  
  switch (requiredPermission) {
    case 'owner':
      return user.account_owner === true;
    
    case 'staff':
      return !user.collaborator;
    
    case 'any':
      return true;
    
    default:
      return false;
  }
}

// 在路由中使用
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  if (!checkUserPermission(session, 'owner')) {
    throw json({ error: '需要店铺所有者权限' }, { status: 403 });
  }
  
  // ...
};
```

## 相关文档

- [Shopify App Auth](https://shopify.dev/docs/apps/auth)
- [Session Tokens](https://shopify.dev/docs/apps/auth/session-tokens)
- [App Bridge idToken](https://shopify.dev/docs/api/app-bridge-library/reference/utilities/idtoken)
