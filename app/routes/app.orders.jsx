import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
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

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  
  // 动态导入服务器端模块
  const { saveOrdersToCache } = await import("../services/cache.server");
  
  // 直接从Shopify获取实时数据，不使用缓存显示
  const { admin } = await authenticate.admin(request);
  
  // 获取订单列表
  const response = await admin.graphql(
    `#graphql
      query getOrders($first: Int!, $after: String, $before: String) {
        orders(first: $first, after: $after, before: $before, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              updatedAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              displayFulfillmentStatus
              displayFinancialStatus
              customer {
                id
                displayName
              }
              lineItems(first: 5) {
                edges {
                  node {
                    id
                    title
                    quantity
                    customAttributes {
                      key
                      value
                    }
                    variant {
                      id
                      title
                      price
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }`,
    {
      variables: {
        first: 20,
        after: after || undefined,
        before: before || undefined,
      },
    }
  );
  
  const responseJson = await response.json();
  const orders = responseJson.data.orders.edges.map(edge => edge.node);
  const pageInfo = responseJson.data.orders.pageInfo;

  // 在后台保存数据到缓存（不影响显示）
  if (!after && !before) {
    // 异步保存到缓存，不等待完成
    saveOrdersToCache(orders, pageInfo).catch(error => {
      console.error('缓存保存失败:', error);
    });
  }

  return {
    orders,
    pageInfo,
    fromCache: false,
    currentAfter: after,
    currentBefore: before,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const searchQuery = formData.get("searchQuery");

  if (action === "search") {
    const after = formData.get("after");
    const before = formData.get("before");
    
    // 搜索订单
    const response = await admin.graphql(
      `#graphql
        query searchOrders($query: String!, $first: Int!, $after: String, $before: String) {
          orders(first: $first, query: $query, after: $after, before: $before, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                updatedAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                displayFulfillmentStatus
                displayFinancialStatus
                customer {
                  id
                  displayName
                }
                lineItems(first: 5) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      customAttributes {
                        key
                        value
                      }
                      variant {
                        id
                        title
                        price
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }`,
      {
        variables: {
          query: searchQuery,
          first: 20,
          after: after || undefined,
          before: before || undefined,
        },
      }
    );

    const responseJson = await response.json();
    const orders = responseJson.data.orders.edges.map(edge => edge.node);
    const pageInfo = responseJson.data.orders.pageInfo;

    return {
      orders,
      pageInfo,
      searchQuery,
      currentAfter: after,
      currentBefore: before,
    };
  }

  return null;
};

export default function Orders() {
  const { 
    orders: initialOrders, 
    pageInfo: initialPageInfo, 
    fromCache: initialFromCache,
    currentAfter,
    currentBefore 
  } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPageAfter, setCurrentPageAfter] = useState(currentAfter);
  const [currentPageBefore, setCurrentPageBefore] = useState(currentBefore);

  // 处理搜索结果和页面数据更新
  useEffect(() => {
    if (fetcher.data?.orders) {
      setOrders(fetcher.data.orders);
      setPageInfo(fetcher.data.pageInfo);
      setIsLoading(false);
    }
  }, [fetcher.data]);

  // 当loader数据更新时重置loading状态
  useEffect(() => {
    setOrders(initialOrders);
    setPageInfo(initialPageInfo);
    setCurrentPageAfter(currentAfter);
    setCurrentPageBefore(currentBefore);
    setIsLoading(false);
  }, [initialOrders, initialPageInfo, currentAfter, currentBefore]);

  const handleSearch = (pageAfter = null, pageBefore = null) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("action", "search");
    formData.append("searchQuery", searchQuery);
    formData.append("statusFilter", statusFilter);
    if (pageAfter) formData.append("after", pageAfter);
    if (pageBefore) formData.append("before", pageBefore);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setOrders(initialOrders);
    setPageInfo(initialPageInfo);
    setCurrentPageAfter(null);
    setCurrentPageBefore(null);
  };

  const handleNextPage = () => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      if (searchQuery) {
        // 如果有搜索条件，使用 fetcher 提交搜索请求
        handleSearch(pageInfo.endCursor, null);
      } else {
        // 没有搜索条件，使用 URL 导航
        const searchParams = new URLSearchParams();
        searchParams.set("after", pageInfo.endCursor);
        navigate(`/app/orders?${searchParams.toString()}`);
      }
    }
  };

  const handlePreviousPage = () => {
    if (pageInfo.hasPreviousPage && pageInfo.startCursor) {
      if (searchQuery) {
        // 如果有搜索条件，使用 fetcher 提交搜索请求
        handleSearch(null, pageInfo.startCursor);
      } else {
        // 没有搜索条件，使用 URL 导航
        const searchParams = new URLSearchParams();
        searchParams.set("before", pageInfo.startCursor);
        navigate(`/app/orders?${searchParams.toString()}`);
      }
    }
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

  const rows = orders.map((order) => [
    order.name,
    order.customer?.displayName || '无客户信息',
    formatCurrency(
      order.totalPriceSet.shopMoney.amount,
      order.totalPriceSet.shopMoney.currencyCode
    ),
    renderLineItems(order.lineItems),
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
    '商品信息',
    '发货状态',
    '支付状态',
    '创建时间',
    '操作',
  ];

  return (
    <Page>
      <TitleBar title="订单管理" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* 搜索和筛选 */}
              <InlineStack gap="300" align="space-between">
                <InlineStack gap="300">
                  <TextField
                    label="搜索订单"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="输入订单号、客户名称或邮箱"
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
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
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
                      onPrevious={handlePreviousPage}
                      hasNext={pageInfo.hasNextPage}
                      onNext={handleNextPage}
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
