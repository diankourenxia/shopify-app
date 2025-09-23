# 插件生成订单额外信息字段指南

## 插件和第三方应用生成的订单数据

### 🏷️ 自定义属性 (customAttributes)

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `key` | String | 属性键名 | `"custom_field_1"` |
| `value` | String | 属性值 | `"特殊要求"` |

**使用场景**：
- 订单备注信息
- 特殊要求
- 自定义字段数据
- 第三方应用数据

### 📊 元字段 (metafields)

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `id` | ID | 元字段ID | `"gid://shopify/Metafield/123"` |
| `namespace` | String | 命名空间 | `"custom"`, `"app_name"` |
| `key` | String | 字段键名 | `"order_source"` |
| `value` | String | 字段值 | `"mobile_app"` |
| `type` | String | 字段类型 | `"single_line_text_field"` |
| `description` | String | 字段描述 | `"订单来源"` |
| `createdAt` | DateTime | 创建时间 | `"2024-01-01T00:00:00Z"` |
| `updatedAt` | DateTime | 更新时间 | `"2024-01-01T00:00:00Z"` |

**常见命名空间**：
- `custom` - 自定义字段
- `app_name` - 应用名称
- `global` - 全局字段
- `shopify` - Shopify 系统字段

### 🏪 订单属性 (attributes)

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `key` | String | 属性键名 | `"checkout_token"` |
| `value` | String | 属性值 | `"abc123def456"` |

**常见属性**：
- `checkout_token` - 结账令牌
- `browser_ip` - 浏览器IP
- `landing_site_ref` - 着陆页引用
- `order_number` - 订单编号

### 📱 应用信息 (app)

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `id` | ID | 应用ID | `"gid://shopify/App/123"` |
| `title` | String | 应用名称 | `"订单管理插件"` |
| `developerName` | String | 开发者名称 | `"插件公司"` |
| `developerUrl` | String | 开发者网站 | `"https://example.com"` |
| `installationId` | ID | 安装ID | `"gid://shopify/AppInstallation/123"` |

### 🌐 订单来源信息

#### 来源标识 (sourceIdentifier)
| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `sourceIdentifier` | String | 来源标识符 | `"mobile_app_v1.2"` |

#### 来源名称 (sourceName)
| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `sourceName` | String | 来源名称 | `"移动应用"` |

#### 来源URL (sourceUrl)
| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `sourceUrl` | String | 来源URL | `"https://app.example.com"` |

### 🎯 着陆页信息 (landingSite)

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `id` | ID | 着陆页ID | `"gid://shopify/Page/123"` |
| `handle` | String | 页面句柄 | `"landing-page"` |
| `title` | String | 页面标题 | `"产品着陆页"` |

### 🔗 推荐网站 (referringSite)

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `referringSite` | String | 推荐网站 | `"https://google.com"` |

### 📈 营销事件 (marketingEvent)

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `id` | ID | 营销事件ID | `"gid://shopify/MarketingEvent/123"` |
| `description` | String | 事件描述 | `"黑色星期五促销"` |
| `marketingChannel` | String | 营销渠道 | `"email"`, `"social"`, `"search"` |
| `paid` | Boolean | 是否付费 | `true`, `false` |
| `startedAt` | DateTime | 开始时间 | `"2024-01-01T00:00:00Z"` |
| `budget` | Money | 预算 | `{"amount": "1000.00", "currencyCode": "USD"}` |
| `currencyCode` | CurrencyCode | 货币代码 | `"USD"` |

### 🎯 营销归因 (marketingAttribution)

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `campaign` | String | 活动名称 | `"summer_sale_2024"` |
| `source` | String | 流量来源 | `"google"`, `"facebook"` |
| `medium` | String | 媒介 | `"cpc"`, `"email"`, `"social"` |
| `term` | String | 关键词 | `"shoes"`, `"discount"` |
| `content` | String | 内容标识 | `"banner_ad_1"` |

## 使用示例

### 获取插件数据

```javascript
// 获取订单的插件数据
const order = responseJson.data.order;

// 自定义属性
order.customAttributes.forEach(attr => {
  console.log(`${attr.key}: ${attr.value}`);
});

// 元字段
order.metafields.edges.forEach(edge => {
  const metafield = edge.node;
  console.log(`${metafield.namespace}.${metafield.key}: ${metafield.value}`);
  console.log(`类型: ${metafield.type}`);
  console.log(`描述: ${metafield.description}`);
});

// 订单属性
order.attributes.forEach(attr => {
  console.log(`${attr.key}: ${attr.value}`);
});

// 应用信息
if (order.app) {
  console.log(`应用: ${order.app.title}`);
  console.log(`开发者: ${order.app.developerName}`);
  console.log(`安装ID: ${order.app.installationId}`);
}
```

### 获取营销数据

```javascript
// 订单来源
console.log(`来源: ${order.sourceName}`);
console.log(`来源标识: ${order.sourceIdentifier}`);
console.log(`来源URL: ${order.sourceUrl}`);

// 着陆页信息
if (order.landingSite) {
  console.log(`着陆页: ${order.landingSite.title}`);
  console.log(`页面句柄: ${order.landingSite.handle}`);
}

// 推荐网站
console.log(`推荐网站: ${order.referringSite}`);

// 营销事件
if (order.marketingEvent) {
  console.log(`营销活动: ${order.marketingEvent.description}`);
  console.log(`营销渠道: ${order.marketingEvent.marketingChannel}`);
  console.log(`是否付费: ${order.marketingEvent.paid}`);
  console.log(`预算: ${order.marketingEvent.budget?.amount} ${order.marketingEvent.currencyCode}`);
}

// 营销归因
if (order.marketingAttribution) {
  console.log(`活动: ${order.marketingAttribution.campaign}`);
  console.log(`来源: ${order.marketingAttribution.source}`);
  console.log(`媒介: ${order.marketingAttribution.medium}`);
  console.log(`关键词: ${order.marketingAttribution.term}`);
  console.log(`内容: ${order.marketingAttribution.content}`);
}
```

### 过滤特定插件数据

```javascript
// 过滤特定命名空间的元字段
const customMetafields = order.metafields.edges
  .map(edge => edge.node)
  .filter(metafield => metafield.namespace === 'custom');

// 过滤特定应用的元字段
const appMetafields = order.metafields.edges
  .map(edge => edge.node)
  .filter(metafield => metafield.namespace.startsWith('app_'));

// 查找特定键的元字段
const orderSourceMetafield = order.metafields.edges
  .map(edge => edge.node)
  .find(metafield => metafield.key === 'order_source');
```

## 常见插件字段

### 订单管理插件
- `order_source` - 订单来源
- `order_priority` - 订单优先级
- `special_instructions` - 特殊说明
- `delivery_date` - 配送日期

### 营销插件
- `utm_campaign` - UTM 活动
- `utm_source` - UTM 来源
- `utm_medium` - UTM 媒介
- `utm_term` - UTM 关键词
- `utm_content` - UTM 内容

### 客户服务插件
- `customer_notes` - 客户备注
- `support_ticket_id` - 支持工单ID
- `escalation_level` - 升级级别

### 库存管理插件
- `warehouse_location` - 仓库位置
- `inventory_reserved` - 库存预留
- `pick_list_id` - 拣货单ID

## 注意事项

1. **权限要求**: 某些字段需要特定的 Shopify 权限
2. **数据可用性**: 不是所有订单都有这些字段
3. **字段类型**: 元字段的值类型可能不同
4. **命名空间**: 不同插件使用不同的命名空间
5. **数据格式**: 某些字段可能是 JSON 字符串

## 权限要求

确保你的 Shopify 应用具有以下权限：
- `read_orders` - 读取订单
- `read_metafields` - 读取元字段
- `read_marketing_events` - 读取营销事件
- `read_apps` - 读取应用信息
