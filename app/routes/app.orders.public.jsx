import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
  Spinner,
  Box,
  ButtonGroup,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  // 动态导入服务器端模块
  const { getOrdersFromCache } = await import("../services/cache.server");
  
  // 从缓存获取数据
  const cacheData = await getOrdersFromCache();
  
  if (cacheData) {
    return {
      orders: cacheData.orders,
      pageInfo: cacheData.pageInfo,
      fromCache: true,
      publicAccess: true
    };
  }

  // 如果没有缓存数据，返回空数据
  return {
    orders: [],
    pageInfo: null,
    fromCache: false,
    publicAccess: true,
    noCache: true
  };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "refresh") {
    // 动态导入服务器端模块
    const { getOrdersFromCache } = await import("../services/cache.server");
    
    // 尝试从缓存获取最新数据
    const cacheData = await getOrdersFromCache();
    if (cacheData) {
      return {
        orders: cacheData.orders,
        pageInfo: cacheData.pageInfo,
        fromCache: true
      };
    }
  }

  return null;
};

export default function AppOrdersPublic() {
  const { orders: initialOrders, pageInfo: initialPageInfo, noCache } = useLoaderData();
  const fetcher = useFetcher();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  // 处理刷新结果
  useEffect(() => {
    if (fetcher.data?.orders) {
      setOrders(fetcher.data.orders);
      setPageInfo(fetcher.data.pageInfo);
      setIsLoading(false);
    }
  }, [fetcher.data]);

  const handleRefresh = () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("action", "refresh");
    fetcher.submit(formData, { method: "POST" });
  };

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

  const rows = orders.map((order) => [
    order.name,
    order.customer?.displayName || '无客户信息',
    formatCurrency(
      order.totalPriceSet.shopMoney.amount,
      order.totalPriceSet.shopMoney.currencyCode
    ),
    <Badge {...getStatusBadge(order.displayFulfillmentStatus)} />,
    <Badge {...getStatusBadge(order.displayFinancialStatus)} />,
    formatDate(order.createdAt),
    <ButtonGroup key={`actions-${order.id}`}>
      <Button
        size="slim"
        url={`/app/orders/public/${order.id.replace('gid://shopify/Order/', '')}`}
      >
        查看详情
      </Button>
    </ButtonGroup>,
  ]);

  const headings = [
    '订单号',
    '客户',
    '总金额',
    '发货状态',
    '支付状态',
    '创建时间',
    '操作',
  ];

  return (
    <Page>
      <TitleBar title="订单管理 - 公开访问" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* 页面标题和状态 */}
              <InlineStack gap="300" align="space-between">
                <Text variant="headingMd">订单管理 - 公开访问</Text>
                <InlineStack gap="200">
                  <Badge status="info">缓存数据访问</Badge>
                  {noCache && (
                    <Badge status="warning">暂无缓存数据</Badge>
                  )}
                </InlineStack>
              </InlineStack>

              {/* 操作按钮 */}
              <InlineStack gap="300">
                <Button onClick={handleRefresh} loading={isLoading}>
                  刷新缓存数据
                </Button>
                <Text variant="bodyMd" tone="subdued">
                  注意：这里显示的是缓存数据，刷新会重新从缓存获取最新数据
                </Text>
              </InlineStack>

              {/* 订单列表 */}
              {isLoading ? (
                <Box padding="800">
                  <InlineStack align="center">
                    <Spinner size="large" />
                    <Text variant="bodyMd">正在刷新数据...</Text>
                  </InlineStack>
                </Box>
              ) : orders.length > 0 ? (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={headings}
                  rows={rows}
                  hoverable
                />
              ) : (
                <EmptyState
                  heading="没有找到订单数据"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    {noCache 
                      ? "暂无缓存数据，请先更新缓存后再次访问"
                      : "没有找到符合条件的订单"
                    }
                  </p>
                </EmptyState>
              )}

              {/* 分页 */}
              {pageInfo && (pageInfo.hasNextPage || pageInfo.hasPreviousPage) && (
                <Box padding="400">
                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pageInfo.hasPreviousPage}
                      onPrevious={() => {
                        // 公开页面暂不支持分页
                      }}
                      hasNext={pageInfo.hasNextPage}
                      onNext={() => {
                        // 公开页面暂不支持分页
                      }}
                    />
                  </InlineStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
