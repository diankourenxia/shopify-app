# Shopify App 访问者信息获取指南

## 概述

Shopify App 可以获取的访问者信息取决于使用的**访问令牌类型**。

## 访问令牌类型

### 1. 离线访问令牌 (Offline Access Token)
- **特点**：长期有效，不会过期
- **用途**：后台任务、定时任务、Webhook 处理
- **限制**：⚠️ **无法获取具体访问用户信息**
- **获取信息**：只能获取店铺级别的信息

### 2. 在线访问令牌 (Online Access Token)
- **特点**：短期有效（24小时），与特定用户绑定
- **用途**：用户交互操作、需要知道谁在操作
- **优势**：✅ **可以获取当前访问用户的详细信息**
- **获取信息**：店铺信息 + 当前用户信息

## 可获取的访问者信息

### 使用在线访问令牌时，可获取：

```javascript
session.onlineAccessInfo = {
  // 关联的用户 ID（店铺员工/所有者）
  associated_user: {
    id: 123456789,              // Shopify 用户 ID
    first_name: "John",         // 名字
    last_name: "Doe",           // 姓氏
    email: "john@example.com",  // 邮箱
    email_verified: true,       // 邮箱是否已验证
    account_owner: true,        // 是否为店铺所有者
    locale: "en",               // 语言偏好
    collaborator: false         // 是否为协作者
  },
  
  // Token 过期时间
  expires_in: 86400,  // 秒数（24小时）
  
  // 关联的用户范围
  associated_user_scope: "read_products,write_orders"
}
```

### 店铺信息（两种令牌都可获取）：

```javascript
// 通过 GraphQL 查询
shop {
  name                 // 店铺名称
  email                // 联系邮箱
  myshopifyDomain      // Shopify 域名
  currencyCode         // 货币代码
  primaryDomain {
    url                // 主域名 URL
    host               // 主机名
  }
  plan {
    displayName        // 订阅计划名称
  }
  billingAddress {
    country            // 国家
    province           // 省份/州
    city               // 城市
  }
}
```

## 当前应用配置

查看 `app/shopify.server.js` 的配置：

```javascript
const shopify = shopifyApp({
  // ...其他配置
  useOnlineTokens: true,  // 如果设置为 true，则使用在线令牌
});
```

## 如何启用在线访问令牌

### 方法1：修改 Shopify App 配置

编辑 `app/shopify.server.js`：

```javascript
const shopify = shopifyApp({
  // ...
  useOnlineTokens: true,  // 启用在线令牌
  // ...
});
```

### 方法2：在特定路由使用在线令牌

```javascript
export const loader = async ({ request }) => {
  // 使用在线令牌认证
  const { session } = await authenticate.admin(request);
  
  // 检查是否有用户信息
  if (session?.onlineAccessInfo?.associated_user) {
    const user = session.onlineAccessInfo.associated_user;
    console.log('当前用户:', user.first_name, user.last_name);
    console.log('邮箱:', user.email);
    console.log('是否所有者:', user.account_owner);
  }
  
  return json({ user: session?.onlineAccessInfo?.associated_user });
};
```

## 显示用户信息示例

```jsx
export default function Index() {
  const { sessionInfo } = useLoaderData();
  const user = sessionInfo?.onlineAccessInfo?.associated_user;
  
  return (
    <Page>
      <Text as="h2" variant="headingMd">
        Welcome, {user ? `${user.first_name} ${user.last_name}` : 'Guest'}
      </Text>
      {user && (
        <Text variant="bodyMd" tone="subdued">
          {user.email}
          {user.account_owner && ' • 店铺所有者'}
        </Text>
      )}
    </Page>
  );
}
```

## 注意事项

### 1. 隐私和安全
- ⚠️ 不要在前端显示敏感的用户信息
- ⚠️ 不要记录或存储用户的 access token
- ✅ 只显示必要的用户识别信息

### 2. Token 过期处理
- 在线令牌会在 24 小时后过期
- 需要处理 token 过期的情况
- Shopify App Bridge 会自动处理重新认证

### 3. 权限范围
- 确保 App 的 scope 包含必要的权限
- 某些用户信息需要特定的 scope

### 4. 多用户场景
- 同一个店铺可能有多个员工访问
- 每个员工的在线令牌是独立的
- 需要根据用户信息做权限控制

## 常见问题

### Q: 为什么我看不到用户信息？
A: 可能原因：
1. 使用的是离线访问令牌
2. App 配置未启用在线令牌
3. Session 已过期

### Q: 如何区分不同的访问用户？
A: 使用 `session.onlineAccessInfo.associated_user.id`

### Q: 可以获取用户的头像吗？
A: Shopify API 不直接提供用户头像，但可以：
1. 使用 Gravatar（基于邮箱）
2. 使用用户名的首字母生成头像

### Q: 如何判断当前是否为店铺所有者？
A: 检查 `session.onlineAccessInfo.associated_user.account_owner`

## 测试方法

1. 部署应用后，访问首页
2. 查看"账号信息 (调试)"区域
3. 检查是否显示"当前访问用户信息 (在线 Token)"
4. 如果显示"使用离线访问令牌"警告，需要启用在线令牌

## 相关文档

- [Shopify Session 文档](https://shopify.dev/docs/apps/auth/session-tokens)
- [Online vs Offline Access](https://shopify.dev/docs/apps/auth/access-tokens)
- [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql)
