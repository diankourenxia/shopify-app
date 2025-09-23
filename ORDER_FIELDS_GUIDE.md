# 订单字段扩展指南

## 新增的订单字段

### 📋 基础订单信息

| 字段 | 类型 | 描述 |
|------|------|------|
| `processedAt` | DateTime | 订单处理时间 |
| `cancelledAt` | DateTime | 订单取消时间 |
| `closedAt` | DateTime | 订单关闭时间 |
| `note` | String | 订单备注 |
| `tags` | [String] | 订单标签 |
| `test` | Boolean | 是否为测试订单 |
| `confirmed` | Boolean | 订单是否已确认 |

### 💰 价格信息

| 字段 | 类型 | 描述 |
|------|------|------|
| `subtotalPriceSet` | MoneyBag | 小计价格 |
| `totalTaxSet` | MoneyBag | 税费总额 |
| `totalShippingPriceSet` | MoneyBag | 运费总额 |

### 👤 客户信息

| 字段 | 类型 | 描述 |
|------|------|------|
| `customer.firstName` | String | 客户名字 |
| `customer.lastName` | String | 客户姓氏 |
| `customer.email` | String | 客户邮箱 |
| `customer.phone` | String | 客户电话 |
| `customer.defaultAddress` | Address | 客户默认地址 |

### 📍 地址信息

#### 配送地址 (shippingAddress)
| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | ID | 地址ID |
| `firstName` | String | 收件人名字 |
| `lastName` | String | 收件人姓氏 |
| `company` | String | 公司名称 |
| `address1` | String | 地址行1 |
| `address2` | String | 地址行2 |
| `city` | String | 城市 |
| `province` | String | 省份/州 |
| `country` | String | 国家 |
| `zip` | String | 邮政编码 |
| `phone` | String | 电话 |

#### 账单地址 (billingAddress)
同配送地址字段结构

### 🛍️ 商品信息 (lineItems)

| 字段 | 类型 | 描述 |
|------|------|------|
| `originalUnitPriceSet` | MoneyBag | 原始单价 |
| `discountedUnitPriceSet` | MoneyBag | 折扣后单价 |

#### 商品变体 (variant)
| 字段 | 类型 | 描述 |
|------|------|------|
| `sku` | String | SKU编码 |
| `barcode` | String | 条形码 |
| `price` | Money | 价格 |
| `compareAtPrice` | Money | 对比价格 |
| `weight` | Float | 重量 |
| `weightUnit` | WeightUnit | 重量单位 |
| `image` | Image | 商品图片 |
| `product` | Product | 关联产品信息 |

#### 产品信息 (product)
| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | ID | 产品ID |
| `title` | String | 产品标题 |
| `handle` | String | 产品句柄 |
| `vendor` | String | 供应商 |
| `productType` | String | 产品类型 |
| `tags` | [String] | 产品标签 |

### 📦 履约信息 (fulfillments)

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | ID | 履约ID |
| `status` | FulfillmentStatus | 履约状态 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |
| `trackingInfo` | TrackingInfo | 物流跟踪信息 |
| `fulfillmentLineItems` | [FulfillmentLineItem] | 履约商品项 |

#### 物流跟踪 (trackingInfo)
| 字段 | 类型 | 描述 |
|------|------|------|
| `number` | String | 跟踪号 |
| `url` | String | 跟踪链接 |
| `company` | String | 物流公司 |

### 💸 退款信息 (refunds)

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | ID | 退款ID |
| `createdAt` | DateTime | 退款时间 |
| `note` | String | 退款备注 |
| `totalRefundedSet` | MoneyBag | 退款总额 |
| `refundLineItems` | [RefundLineItem] | 退款商品项 |

#### 退款商品项 (refundLineItem)
| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | ID | 退款商品项ID |
| `quantity` | Int | 退款数量 |
| `restockType` | RestockType | 重新入库类型 |
| `lineItem` | LineItem | 关联商品项 |

### 💳 交易信息 (transactions)

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | ID | 交易ID |
| `kind` | TransactionKind | 交易类型 |
| `status` | TransactionStatus | 交易状态 |
| `amount` | Money | 交易金额 |
| `currency` | CurrencyCode | 货币代码 |
| `gateway` | String | 支付网关 |
| `createdAt` | DateTime | 创建时间 |
| `processedAt` | DateTime | 处理时间 |
| `parentTransaction` | Transaction | 父交易 |

### 🎫 折扣信息 (discountApplications)

#### 折扣码应用 (DiscountCodeApplication)
| 字段 | 类型 | 描述 |
|------|------|------|
| `code` | String | 折扣码 |
| `value` | PricingValue | 折扣值 |

#### 自动折扣应用 (AutomaticDiscountApplication)
| 字段 | 类型 | 描述 |
|------|------|------|
| `title` | String | 折扣标题 |
| `value` | PricingValue | 折扣值 |

#### 折扣值 (PricingValue)
| 字段 | 类型 | 描述 |
|------|------|------|
| `MoneyV2.amount` | Decimal | 金额 |
| `MoneyV2.currencyCode` | CurrencyCode | 货币代码 |
| `PricingPercentageValue.percentage` | Float | 百分比 |

## 使用示例

### 在订单列表中使用新字段

```javascript
// 订单列表页面
const orders = responseJson.data.orders.edges.map(edge => edge.node);

orders.forEach(order => {
  console.log('订单号:', order.name);
  console.log('客户邮箱:', order.customer?.email);
  console.log('订单状态:', order.fulfillmentStatus);
  console.log('是否测试订单:', order.test);
  console.log('订单标签:', order.tags);
  
  // 价格信息
  console.log('小计:', order.subtotalPriceSet?.shopMoney?.amount);
  console.log('税费:', order.totalTaxSet?.shopMoney?.amount);
  console.log('运费:', order.totalShippingPriceSet?.shopMoney?.amount);
  
  // 商品信息
  order.lineItems.edges.forEach(edge => {
    const item = edge.node;
    console.log('商品:', item.title);
    console.log('SKU:', item.variant?.sku);
    console.log('供应商:', item.variant?.product?.vendor);
  });
});
```

### 在订单详情中使用新字段

```javascript
// 订单详情页面
const order = responseJson.data.order;

// 显示完整客户信息
console.log('客户姓名:', `${order.customer?.firstName} ${order.customer?.lastName}`);
console.log('客户邮箱:', order.customer?.email);
console.log('客户电话:', order.customer?.phone);

// 显示地址信息
console.log('配送地址:', order.shippingAddress);
console.log('账单地址:', order.billingAddress);

// 显示履约信息
order.fulfillments.forEach(fulfillment => {
  console.log('履约状态:', fulfillment.status);
  console.log('跟踪号:', fulfillment.trackingInfo?.number);
  console.log('物流公司:', fulfillment.trackingInfo?.company);
});

// 显示退款信息
order.refunds.forEach(refund => {
  console.log('退款金额:', refund.totalRefundedSet?.shopMoney?.amount);
  console.log('退款时间:', refund.createdAt);
});

// 显示交易信息
order.transactions.forEach(transaction => {
  console.log('交易类型:', transaction.kind);
  console.log('交易状态:', transaction.status);
  console.log('支付网关:', transaction.gateway);
});

// 显示折扣信息
order.discountApplications.edges.forEach(edge => {
  const discount = edge.node;
  if (discount.__typename === 'DiscountCodeApplication') {
    console.log('折扣码:', discount.code);
  } else if (discount.__typename === 'AutomaticDiscountApplication') {
    console.log('自动折扣:', discount.title);
  }
});
```

## 注意事项

1. **字段可用性**: 某些字段可能为空，使用前请检查
2. **权限要求**: 某些字段需要特定的 Shopify 权限
3. **性能考虑**: 查询更多字段会增加响应时间
4. **分页限制**: lineItems 默认限制为 50 个，可根据需要调整

## 权限要求

确保你的 Shopify 应用具有以下权限：
- `read_orders` - 读取订单
- `read_customers` - 读取客户信息
- `read_products` - 读取产品信息
- `read_fulfillments` - 读取履约信息
- `read_transactions` - 读取交易信息
