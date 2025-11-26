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
  TextField,
  Select,
  Badge,
  Pagination,
  EmptyState,
  Spinner,
  Box,
  ButtonGroup,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { requirePermission } from "../utils/permissions.server";

// 模拟订单数据
const mockOrders = [
  {
    id: "gid://shopify/Order/1",
    name: "#1001",
    createdAt: "2024-01-15T10:30:00Z",
    totalPriceSet: {
      shopMoney: {
        amount: "299.99",
        currencyCode: "USD"
      }
    },
    displayFulfillmentStatus: "FULFILLED",
    displayFinancialStatus: "PAID",
    customer: {
      id: "gid://shopify/Customer/1",
      displayName: "张三"
    }
  },
  {
    id: "gid://shopify/Order/2",
    name: "#1002",
    createdAt: "2024-01-14T14:20:00Z",
    totalPriceSet: {
      shopMoney: {
        amount: "159.50",
        currencyCode: "USD"
      }
    },
    displayFulfillmentStatus: "UNFULFILLED",
    displayFinancialStatus: "PENDING",
    customer: {
      id: "gid://shopify/Customer/2",
      displayName: "李四"
    }
  },
  {
    id: "gid://shopify/Order/3",
    name: "#1003",
    createdAt: "2024-01-13T09:15:00Z",
    totalPriceSet: {
      shopMoney: {
        amount: "89.99",
        currencyCode: "USD"
      }
    },
    displayFulfillmentStatus: "PARTIALLY_FULFILLED",
    displayFinancialStatus: "PAID",
    customer: {
      id: "gid://shopify/Customer/3",
      displayName: "王五"
    }
  }
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 检查权限
  await requirePermission(session, 'admin', prisma);
  
  return {
    orders: mockOrders,
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null
    },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 检查权限
  await requirePermission(session, 'admin', prisma);
  
  const formData = await request.formData();
  const action = formData.get("action");
  const searchQuery = formData.get("searchQuery");

  if (action === "search") {
    // 模拟搜索
    const filteredOrders = mockOrders.filter(order => 
      order.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      orders: filteredOrders,
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null
      },
      searchQuery,
    };
  }

  return null;
};

export default function OrdersDemo() {
  const { orders: initialOrders, pageInfo: initialPageInfo } = useLoaderData();
  const fetcher = useFetcher();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  // 处理搜索结果
  useEffect(() => {
    if (fetcher.data?.orders) {
      setOrders(fetcher.data.orders);
      setPageInfo(fetcher.data.pageInfo);
      setIsLoading(false);
    }
  }, [fetcher.data]);

  const handleSearch = () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("action", "search");
    formData.append("searchQuery", searchQuery);
    formData.append("statusFilter", statusFilter);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setOrders(initialOrders);
    setPageInfo(initialPageInfo);
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
        url={`/app/orders/${order.id.replace('gid://shopify/Order/', '')}`}
      >
        查看详情
      </Button>
      <Button
        size="slim"
        url={`shopify:admin/orders/${order.id.replace('gid://shopify/Order/', '')}`}
        target="_blank"
        variant="secondary"
      >
        在Shopify中查看
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
      <TitleBar title="订单管理 (演示版)" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* 权限提示 */}
              <Box padding="400" background="bg-surface-warning" borderRadius="200">
                <Text variant="bodyMd" tone="warning">
                  <strong>注意:</strong> 这是演示版本，使用模拟数据。要访问真实订单数据，需要在Shopify Partner Dashboard中申请订单访问权限。
                </Text>
              </Box>

              {/* 搜索和筛选 */}
              <InlineStack gap="300" align="space-between">
                <InlineStack gap="300">
                  <TextField
                    label="搜索订单"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="输入订单号或客户名称"
                    autoComplete="off"
                  />
                  <Select
                    label="状态筛选"
                    options={[
                      { label: '全部状态', value: 'all' },
                      { label: '已发货', value: 'FULFILLED' },
                      { label: '未发货', value: 'UNFULFILLED' },
                      { label: '已支付', value: 'PAID' },
                      { label: '待支付', value: 'PENDING' },
                    ]}
                    value={statusFilter}
                    onChange={setStatusFilter}
                  />
                  <Button onClick={handleSearch} loading={isLoading}>
                    搜索
                  </Button>
                  <Button onClick={handleClearSearch} variant="plain">
                    清除
                  </Button>
                </InlineStack>
              </InlineStack>

              {/* 订单列表 */}
              {isLoading ? (
                <Box padding="800">
                  <InlineStack align="center">
                    <Spinner size="large" />
                    <Text variant="bodyMd">正在加载订单...</Text>
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
                  heading="没有找到订单"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>尝试调整搜索条件或筛选器</p>
                </EmptyState>
              )}

              {/* 分页 */}
              {pageInfo && (pageInfo.hasNextPage || pageInfo.hasPreviousPage) && (
                <Box padding="400">
                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pageInfo.hasPreviousPage}
                      onPrevious={() => {
                        // 实现上一页逻辑
                      }}
                      hasNext={pageInfo.hasNextPage}
                      onNext={() => {
                        // 实现下一页逻辑
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
