# 订单管理系统

这是一个基于Shopify App的订单管理系统，使用Remix框架和Polaris UI组件构建。

## 功能特性

### 订单列表页面 (`/app/orders`)
- 📋 显示所有订单的基本信息
- 🔍 支持按订单号、客户名称或邮箱搜索
- 🏷️ 支持按发货状态和支付状态筛选
- 📊 显示订单号、客户、总金额、状态和创建时间
- 🔗 快速跳转到订单详情页面
- 🔗 在Shopify后台中查看订单

### 订单详情页面 (`/app/orders/:id`)
- 📄 完整的订单信息展示
- 👤 客户详细信息
- 📦 订单商品列表
- 💰 价格明细（商品小计、运费、税费、总计）
- 🚚 发货信息和物流跟踪
- 💳 交易记录
- 🔗 快速操作按钮

## 技术栈

- **框架**: Remix
- **UI组件**: Shopify Polaris
- **数据库**: Prisma + SQLite
- **API**: Shopify GraphQL Admin API
- **认证**: Shopify App Bridge

## 页面结构

```
app/routes/
├── app.jsx                    # 主应用布局和导航
├── app._index.jsx            # 首页
├── app.orders.jsx            # 订单列表页面
└── app.orders.$id.jsx        # 订单详情页面
```

## 主要功能

### 1. 订单查询
- 使用Shopify GraphQL API获取订单数据
- 支持分页加载
- 实时搜索和筛选

### 2. 订单详情
- 完整的订单信息展示
- 客户信息管理
- 商品列表和价格明细
- 发货和支付状态跟踪

### 3. 状态管理
- 发货状态：已发货、未发货、部分发货
- 支付状态：已支付、待支付、部分支付、已退款、已取消
- 使用Polaris Badge组件显示状态

### 4. 响应式设计
- 使用Polaris Layout组件
- 适配不同屏幕尺寸
- 现代化的UI设计

## 使用方法

1. 启动开发服务器：
   ```bash
   npm run dev
   ```

2. 在Shopify App中访问订单管理页面

3. 使用搜索和筛选功能查找订单

4. 点击"查看详情"查看完整订单信息

## 注意事项

- 需要有效的Shopify App配置
- 需要适当的API权限（read_orders, read_customers等）
- 使用最新的Shopify GraphQL API字段（如defaultEmailAddress替代email）

## 扩展功能

可以考虑添加的功能：
- 订单导出功能
- 批量操作
- 订单状态更新
- 客户管理
- 报表和统计
