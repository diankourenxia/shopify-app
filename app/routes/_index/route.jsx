import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";
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
  EmptyState,
  Box,
  ButtonGroup,
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // 尝试获取缓存的订单数据
  let ordersData = null;
  try {
    const { getOrdersFromCache } = await import("../../services/cache.server");
    const cacheData = await getOrdersFromCache();
    if (cacheData) {
      ordersData = {
        orders: cacheData.orders.slice(0, 10), // 只显示前10个订单
        fromCache: true
      };
    }
  } catch (error) {
    console.log("无法获取缓存数据:", error.message);
  }

  return { 
    showForm: Boolean(login),
    ordersData 
  };
};

export default function App() {
  const { showForm, ordersData } = useLoaderData();

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

  const ordersRows = ordersData?.orders?.map((order) => [
    order.name,
    order.customer?.displayName || '无客户信息',
    formatCurrency(
      order.totalPriceSet.shopMoney.amount,
      order.totalPriceSet.shopMoney.currencyCode
    ),
    <Badge {...getStatusBadge(order.displayFulfillmentStatus)} />,
    <Badge {...getStatusBadge(order.displayFinancialStatus)} />,
    formatDate(order.createdAt),
  ]) || [];

  const headings = [
    '订单号',
    '客户',
    '总金额',
    '发货状态',
    '支付状态',
    '创建时间',
  ];

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* 应用介绍和登录 */}
              <div className={styles.content}>
                <h1 className={styles.heading}>Shopify 订单管理系统</h1>
                <p className={styles.text}>
                  一个强大的订单管理工具，帮助您轻松查看和管理Shopify店铺订单。
                </p>
                {showForm && (
                  <Form className={styles.form} method="post" action="/auth/login">
                    <label className={styles.label}>
                      <span>Shop domain</span>
                      <input className={styles.input} type="text" name="shop" />
                      <span>e.g: my-shop-domain.myshopify.com</span>
                    </label>
                    <button className={styles.button} type="submit">
                      登录管理后台
                    </button>
                  </Form>
                )}
              </div>

              {/* 订单数据展示 */}
              {ordersData && ordersData.orders.length > 0 ? (
                <Card sectioned>
                  <BlockStack gap="300">
                    <InlineStack gap="300" align="space-between">
                      <Text variant="headingMd">最新订单 (缓存数据)</Text>
                      <InlineStack gap="200">
                        <Badge status="info">公开访问</Badge>
                        <Button url="/orders/public" size="slim">
                          查看完整订单列表
                        </Button>
                      </InlineStack>
                    </InlineStack>
                    
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                      headings={headings}
                      rows={ordersRows}
                      hoverable
                    />
                    
                    <Box padding="200">
                      <Text variant="bodyMd" tone="subdued">
                        显示最新 {ordersData.orders.length} 个订单，点击上方按钮查看完整列表
                      </Text>
                    </Box>
                  </BlockStack>
                </Card>
              ) : (
                <Card sectioned>
                  <EmptyState
                    heading="暂无订单数据"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>当前没有缓存的订单数据，请先登录管理后台更新缓存</p>
                    {showForm && (
                      <Box padding="400">
                        <Text variant="bodyMd" tone="subdued">
                          登录后可以在管理后台查看和更新订单数据
                        </Text>
                      </Box>
                    )}
                  </EmptyState>
                </Card>
              )}

              {/* 功能特性 */}
              <Card sectioned>
                <BlockStack gap="300">
                  <Text variant="headingMd">功能特性</Text>
                  <ul className={styles.list}>
                    <li>
                      <strong>实时订单管理</strong>. 查看订单详情、状态和客户信息
                    </li>
                    <li>
                      <strong>缓存加速</strong>. 智能缓存系统，快速访问订单数据
                    </li>
                    <li>
                      <strong>公开访问</strong>. 无需登录即可查看订单信息
                    </li>
                    <li>
                      <strong>移动友好</strong>. 响应式设计，支持各种设备访问
                    </li>
                  </ul>
                </BlockStack>
              </Card>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
