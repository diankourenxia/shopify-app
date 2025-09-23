import { useState, useEffect } from "react";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  DataTable,
  Badge,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request, params }) => {
  const orderId = params.id;
  
  // 动态导入服务器端模块
  const { getOrdersFromCache } = await import("../services/cache.server");
  
  // 从缓存获取数据
  const cacheData = await getOrdersFromCache();
  
  if (cacheData && cacheData.orders) {
    // 查找指定订单
    const order = cacheData.orders.find(o => 
      o.id.replace('gid://shopify/Order/', '') === orderId
    );
    
    if (order) {
      return {
        order,
        publicAccess: true,
        fromCache: true
      };
    }
  }

  return {
    order: null,
    publicAccess: true,
    fromCache: false,
    notFound: true
  };
};

export default function AppOrdersPublicDetail() {
  const { order, notFound } = useLoaderData();

  const getStatusBadge = (status) => {
    const statusMap = {
      'FULFILLED': { status: 'success', children: '已发货' },
      'UNFULFILLED': { status: 'warning', children: '未发货' },
      'PARTIALLY_FULFILLED': { status: 'attention', children: '部分发货' },
      'PAID': { status: 'success', children: '已支付' },
      'PENDING': { status: 'warning', children: '待支付' },
      'PARTIALLY_PAID': { status: 'attention', children: '部分支付' },
      'REFUNDED': { status: 'info', children: '已退款' },
      'VOIDED': { status: 'critical', children: '已取消' },
    };
    
    return statusMap[status] || { status: 'info', children: status };
  };

  const formatCurrency = (amount, currencyCode) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currencyCode,
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (notFound || !order) {
    return (
      <Page>
        <TitleBar title="订单未找到" />
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="800">
                <Text variant="headingMd">订单未找到</Text>
                <Text variant="bodyMd" tone="subdued">
                  该订单不存在或缓存中无此数据
                </Text>
                <Box padding="400">
                  <Button url="/app/orders/public">返回订单列表</Button>
                </Box>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const lineItemsRows = order.lineItems?.edges?.map(({ node: item }) => [
    item.title,
    item.quantity,
    item.variant?.title || '无变体',
    formatCurrency(item.variant?.price || '0', order.totalPriceSet.shopMoney.currencyCode),
    item.customAttributes?.map(attr => `${attr.key}: ${attr.value}`).join(', ') || '无'
  ]) || [];

  return (
    <Page>
      <TitleBar title={`订单详情 - ${order.name}`} />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* 页面标题 */}
              <InlineStack gap="300" align="space-between">
                <Text variant="headingLg">订单详情 - {order.name}</Text>
                <InlineStack gap="200">
                  <Badge status="info">缓存数据访问</Badge>
                  <Badge status="info">公开访问模式</Badge>
                </InlineStack>
              </InlineStack>

              {/* 订单基本信息 */}
              <Card sectioned>
                <BlockStack gap="300">
                  <Text variant="headingMd">订单信息</Text>
                  <InlineStack gap="800">
                    <BlockStack gap="200">
                      <Text variant="bodyMd"><strong>订单号:</strong> {order.name}</Text>
                      <Text variant="bodyMd"><strong>客户:</strong> {order.customer?.displayName || '无客户信息'}</Text>
                      <Text variant="bodyMd"><strong>创建时间:</strong> {formatDate(order.createdAt)}</Text>
                      <Text variant="bodyMd"><strong>更新时间:</strong> {formatDate(order.updatedAt)}</Text>
                    </BlockStack>
                    <BlockStack gap="200">
                      <Text variant="bodyMd"><strong>总金额:</strong> {formatCurrency(
                        order.totalPriceSet.shopMoney.amount,
                        order.totalPriceSet.shopMoney.currencyCode
                      )}</Text>
                      <Text variant="bodyMd"><strong>发货状态:</strong> <Badge {...getStatusBadge(order.displayFulfillmentStatus)} /></Text>
                      <Text variant="bodyMd"><strong>支付状态:</strong> <Badge {...getStatusBadge(order.displayFinancialStatus)} /></Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* 商品列表 */}
              <Card sectioned>
                <BlockStack gap="300">
                  <Text variant="headingMd">商品列表</Text>
                  {lineItemsRows.length > 0 ? (
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                      headings={['商品名称', '数量', '变体', '单价', '自定义属性']}
                      rows={lineItemsRows}
                      hoverable
                    />
                  ) : (
                    <Text variant="bodyMd" tone="subdued">暂无商品信息</Text>
                  )}
                </BlockStack>
              </Card>

              {/* 操作按钮 */}
              <Box padding="400">
                <InlineStack gap="300">
                  <Button url="/app/orders/public">返回订单列表</Button>
                  <Text variant="bodyMd" tone="subdued">
                    注意：这里显示的是缓存数据，只能查看不能修改
                  </Text>
                </InlineStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
