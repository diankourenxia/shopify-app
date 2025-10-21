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
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  
  // 从缓存获取数据
  const cacheData = await getOrdersFromCache();
  
  // 获取所有订单的自定义状态
  const orderStatuses = await prisma.orderStatus.findMany();
  const statusMap = {};
  orderStatuses.forEach(status => {
    const orderId = status.orderId;
    statusMap[orderId] = status.status;
  });
  
  if (cacheData) {
    return {
      orders: cacheData.orders,
      pageInfo: cacheData.pageInfo,
      statusMap,
      fromCache: true,
      publicAccess: true
    };
  }

  // 如果没有缓存数据，返回空数据
  return {
    orders: [],
    pageInfo: null,
    statusMap,
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
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    
    // 尝试从缓存获取最新数据
    const cacheData = await getOrdersFromCache();
    
    // 获取所有订单的自定义状态
    const orderStatuses = await prisma.orderStatus.findMany();
    const statusMap = {};
    orderStatuses.forEach(status => {
      statusMap[status.orderId] = status.status;
    });
    
    if (cacheData) {
      return {
        orders: cacheData.orders,
        pageInfo: cacheData.pageInfo,
        statusMap,
        fromCache: true
      };
    }
  }

  return null;
};

export default function AppOrdersPublic() {
  const { orders: initialOrders, pageInfo: initialPageInfo, statusMap: initialStatusMap, noCache } = useLoaderData();
  const fetcher = useFetcher();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [statusMap, setStatusMap] = useState(initialStatusMap || {});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  // 处理刷新结果
  useEffect(() => {
    if (fetcher.data?.orders) {
      setOrders(fetcher.data.orders);
      setPageInfo(fetcher.data.pageInfo);
      if (fetcher.data.statusMap) {
        setStatusMap(fetcher.data.statusMap);
      }
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
    const badgeMap = {
      'FULFILLED': { status: 'success', children: '已发货' },
      'UNFULFILLED': { status: 'warning', children: '未发货' },
      'PARTIALLY_FULFILLED': { status: 'attention', children: '部分发货' },
      'PAID': { status: 'success', children: '已支付' },
      'PENDING': { status: 'warning', children: '待支付' },
      'PARTIALLY_PAID': { status: 'attention', children: '部分支付' },
      'REFUNDED': { status: 'info', children: '已退款' },
      'VOIDED': { status: 'critical', children: '已取消' },
    };
    
    return badgeMap[status] || { status: 'info', children: status };
  };

  const getCustomStatusBadge = (status) => {
    const badgeMap = {
      '待生产': { status: 'info', children: '待生产' },
      '生产中': { status: 'warning', children: '生产中' },
      '待发货': { status: 'success', children: '待发货' },
      '已发货': { status: 'success', children: '已发货' },
    };
    
    return badgeMap[status] || { status: 'default', children: status || '未设置' };
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

  const renderLineItems = (lineItems) => {
    if (!lineItems?.edges || lineItems.edges.length === 0) {
      return <Text variant="bodyMd" tone="subdued">无商品信息</Text>;
    }

    return (
      <div style={{ maxWidth: '400px' }}>
        {lineItems.edges.map(({ node: item }, index) => (
          <div key={item.id} style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f6f6f7', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#202223' }}>
              {item.title}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#454f5e', marginBottom: '4px' }}>
              数量: {item.quantity} × {formatCurrency(item.variant?.price || '0', 'USD')}
            </div>
            {item.variant?.title && item.variant.title !== 'Default Title' && (
              <div style={{ fontSize: '0.875rem', color: '#6d7175', marginBottom: '4px' }}>
                变体: {item.variant.title}
              </div>
            )}
            {item.customAttributes && item.customAttributes.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                {item.customAttributes.map((attr, attrIndex) => (
                  <div key={attrIndex} style={{ 
                    fontSize: '0.75rem', 
                    color: '#6d7175', 
                    marginBottom: '2px',
                    padding: '2px 4px',
                    backgroundColor: '#ffffff',
                    borderRadius: '2px',
                    border: '1px solid #e1e3e5'
                  }}>
                    <strong>{attr.key}:</strong> {attr.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const rows = orders.map((order) => {
    const orderId = order.id.replace('gid://shopify/Order/', '');
    const currentStatus = statusMap[orderId] || '';
    
    return [
      order.name,
      order.customer?.displayName || '无客户信息',
      formatCurrency(
        order.totalPriceSet.shopMoney.amount,
        order.totalPriceSet.shopMoney.currencyCode
      ),
      renderLineItems(order.lineItems),
      <Badge key={`custom-status-${order.id}`} {...getCustomStatusBadge(currentStatus)} />,
      <Badge {...getStatusBadge(order.displayFulfillmentStatus)} />,
      <Badge {...getStatusBadge(order.displayFinancialStatus)} />,
      formatDate(order.createdAt),
      <ButtonGroup key={`actions-${order.id}`}>
        <Button
          size="slim"
          url={`/app/orders/public/${orderId}`}
        >
          查看详情
        </Button>
      </ButtonGroup>,
    ];
  });

  const headings = [
    '订单号',
    '客户',
    '总金额',
    '商品信息2',
    '订单状态',
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
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
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
