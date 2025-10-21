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
  try {
    const url = new URL(request.url);
    const after = url.searchParams.get("after");
    const before = url.searchParams.get("before");
    
    console.log('Loader called with:', { after, before, url: url.toString() });
    
    // 动态导入服务器端模块
    const { saveOrdersToCache } = await import("../services/cache.server");
    const prisma = (await import("../db.server")).default;
    
    // 直接从Shopify获取实时数据，不使用缓存显示
    const { admin } = await authenticate.admin(request);
  
  // 获取订单列表
  const query = before 
    ? `#graphql
        query getOrders($last: Int!, $before: String) {
          orders(last: $last, before: $before, sortKey: CREATED_AT, reverse: true) {`
    : `#graphql
        query getOrders($first: Int!, $after: String) {
          orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {`;
  
  const response = await admin.graphql(
    query + `
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
      variables: before 
        ? { last: 20, before }
        : { first: 20, ...(after && { after }) },
    }
  );
  
  const responseJson = await response.json();
  
  // 添加调试信息
  console.log('GraphQL Response:', {
    after,
    before,
    hasErrors: responseJson.errors?.length > 0,
    errors: responseJson.errors,
    data: responseJson.data ? 'present' : 'missing'
  });
  
  if (responseJson.errors) {
    console.error('GraphQL Errors:', responseJson.errors);
    throw new Error(`GraphQL Error: ${responseJson.errors[0]?.message}`);
  }
  
  if (!responseJson.data || !responseJson.data.orders) {
    console.error('Missing data in response:', responseJson);
    throw new Error('Invalid GraphQL response structure');
  }
  
  const orders = responseJson.data.orders.edges.map(edge => edge.node);
  const pageInfo = responseJson.data.orders.pageInfo;

  // 获取所有订单的自定义状态
  const orderStatuses = await prisma.orderStatus.findMany();
  const statusMap = {};
  orderStatuses.forEach(status => {
    const orderId = status.orderId;
    statusMap[orderId] = status.status;
  });

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
      statusMap,
      fromCache: false,
      currentAfter: after,
      currentBefore: before,
    };
  } catch (error) {
    console.error('Loader error:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const searchQuery = formData.get("searchQuery");

  // 处理订单状态更新
  if (action === "updateStatus") {
    const prisma = (await import("../db.server")).default;
    
    const orderId = formData.get("orderId");
    const status = formData.get("status");

    if (!orderId || !status) {
      return { error: "缺少必要参数" };
    }

    try {
      const orderStatus = await prisma.orderStatus.upsert({
        where: { orderId },
        update: { status },
        create: { orderId, status },
      });
      return { success: true, orderStatus };
    } catch (error) {
      console.error("更新订单状态失败:", error);
      return { error: "更新失败" };
    }
  }

  if (action === "search") {
    const after = formData.get("after");
    const before = formData.get("before");
    
    // 搜索订单
    const searchQuery = before 
      ? `#graphql
          query searchOrders($query: String!, $last: Int!, $before: String) {
            orders(last: $last, query: $query, before: $before, sortKey: CREATED_AT, reverse: true) {`
      : `#graphql
          query searchOrders($query: String!, $first: Int!, $after: String) {
            orders(first: $first, query: $query, after: $after, sortKey: CREATED_AT, reverse: true) {`;
    
    const response = await admin.graphql(
      searchQuery + `
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
        variables: before 
          ? { query: searchQuery, last: 20, before }
          : { query: searchQuery, first: 20, ...(after && { after }) },
      }
    );

    const responseJson = await response.json();
    const orders = responseJson.data.orders.edges.map(edge => edge.node);
    const pageInfo = responseJson.data.orders.pageInfo;

    // 获取订单状态
    const prisma = (await import("../db.server")).default;
    const orderStatuses = await prisma.orderStatus.findMany();
    const statusMap = {};
    orderStatuses.forEach(status => {
      statusMap[status.orderId] = status.status;
    });

    return {
      orders,
      pageInfo,
      statusMap,
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
    statusMap: initialStatusMap,
    fromCache: initialFromCache,
    currentAfter,
    currentBefore 
  } = useLoaderData();
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [statusMap, setStatusMap] = useState(initialStatusMap || {});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPageAfter, setCurrentPageAfter] = useState(currentAfter);
  const [currentPageBefore, setCurrentPageBefore] = useState(currentBefore);
  const [currentPage, setCurrentPage] = useState(1);

  // 处理搜索结果和页面数据更新
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

  // 处理状态更新结果
  useEffect(() => {
    if (statusFetcher.data?.success) {
      const { orderStatus } = statusFetcher.data;
      setStatusMap(prev => ({
        ...prev,
        [orderStatus.orderId]: orderStatus.status
      }));
    }
  }, [statusFetcher.data]);

  // 当loader数据更新时重置loading状态
  useEffect(() => {
    setOrders(initialOrders);
    setPageInfo(initialPageInfo);
    setStatusMap(initialStatusMap || {});
    setCurrentPageAfter(currentAfter);
    setCurrentPageBefore(currentBefore);
    setIsLoading(false);
  }, [initialOrders, initialPageInfo, initialStatusMap, currentAfter, currentBefore]);

  const handleSearch = (pageAfter = null, pageBefore = null) => {
    setIsLoading(true);
    if (!pageAfter && !pageBefore) {
      setCurrentPage(1); // 新搜索重置页码
    }
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
    setCurrentPage(1); // 清除搜索重置页码
  };

  const handleNextPage = () => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      setCurrentPage(prev => prev + 1);
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
      setCurrentPage(prev => prev > 1 ? prev - 1 : 1);
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


  const handleStatusChange = (orderId, newStatus) => {
    const formData = new FormData();
    formData.append("action", "updateStatus");
    formData.append("orderId", orderId);
    formData.append("status", newStatus);
    statusFetcher.submit(formData, { method: "POST" });
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
      '发货': { status: 'success', children: '发货' },
    };
    
    return badgeMap[status] || { status: 'default', children: status || '未设置' };
  };

  const formatCurrency = (amount, currencyCode) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currencyCode,
    }).format(parseFloat(amount));
  };

  // 解析customAttributes中的尺寸信息并转换为厘米
  const parseDimensions = (customAttributes,quantity) => {
    if (!customAttributes || !Array.isArray(customAttributes)) {
      return null;
    }

    const dimensions = {};
    
    // 头部名称映射表
    const headerMapping = {
      'Pinch Pleat - Double': '韩褶-L型-2折',
      'Pinch Pleat - Triple': '韩褶-L型-3折',
      'Euro Pleat - Double': '韩褶-7型-2折',
      'Euro Pleat - Triple': '韩褶-7型-3折',
      'Rod Pocket': '穿杆带遮轨',
      'Grommet Top': '打孔',
      'Ripple Fold': '蛇形帘（铆钉）',
      'Ripple Fold  吊环挂钩（四合一）': '蛇形帘（挂钩）',
      'Flat Panel': '吊环挂钩（四合一）',
      'Back Tab': '背带式'
    };
    
    // 打孔颜色映射表
    const grommetColorMapping = {
      'Black': '黑色',
      'Silver': '银色',
      'Bronze': '青铜色',
      'Gold': '金色'
    };
    
    // 里料类型映射表
    const liningTypeMapping = {
      'White_Shading Rate 100%': '漂白春亚纺1#',
      'White_Shading Rate 30%': '18-1',
      'Beige_Shading Rate 50%': 'A60-2',
      'Black_Shading Rate 80%': 'A60-28',
      'Black_Shading Rate 100%': '2019-18'
    };
    
    customAttributes.forEach(attr => {
      const key = attr.key;
      const value = attr.value;
      if(key.includes('Header')) {
        const headerValue = value.split('(')[0].trim();
        dimensions.header = headerMapping[headerValue] || headerValue;
      }
      if(key.includes('GROMMET COLOR')) {
        dimensions.grommetColor = grommetColorMapping[value] || value;
      }
      if(key.includes('Lining Type')) {
        const liningValue = value.split('(')[0].trim();
        dimensions.liningType = liningTypeMapping[liningValue] || liningValue;
      }
      if(key.includes('Body Memory Shaped')) {
        dimensions.bodyMemory = '需要';
      }
      if(key.includes('Tieback')) {
        dimensions.tieback = value=='No Need'? '无': '有';
      }
      if(key.includes('Room Name')) {
        dimensions.room = value
      }

      // 查找包含尺寸信息的属性
      if (key.includes('Width') || key.includes('Length') || key.includes('Height')) {
        // 提取数字部分 (英寸)
        const inchMatch = value.match(/(\d+(?:\.\d+)?)/);
        if (inchMatch) {
          const inches = parseFloat(inchMatch[1]);
          const centimeters = Math.round(inches * 2.54 * 100) / 100; // 转换为厘米，保留2位小数
          
          if (key.includes('Width')) {
            dimensions.width = centimeters;
          } else if (key.includes('Length') || key.includes('Height')) {
            dimensions.length = centimeters;
          }
        }
      }
    });
    
    // 如果有尺寸信息，返回格式化的React元素
    if (dimensions.width || dimensions.length || dimensions.header || dimensions.tieback || dimensions.room || dimensions.liningType || dimensions.bodyMemory) {
      const parts = [];
      parts.push(`数量: ${quantity}`);
      if(dimensions.header) {
        let headerText = dimensions.header;
        if (dimensions.grommetColor) {
          headerText += `（${dimensions.grommetColor}）`;
        }
        parts.push(`头部: ${headerText}`);
      }
      if (dimensions.width) parts.push(`宽: ${dimensions.width}cm`);
      if (dimensions.length) parts.push(`高: ${dimensions.length}cm`);
      if(dimensions.liningType) parts.push(`里料: ${dimensions.liningType}`);
      if(dimensions.bodyMemory) parts.push(`高温定型: ${dimensions.bodyMemory}`);
      if(dimensions.tieback) parts.push(`绑带: ${dimensions.tieback}`);
      if(dimensions.room) parts.push(`房间: ${dimensions.room}`);
      
      return (
        <div style={{ lineHeight: '1.4' }}>
          {parts.map((part, index) => (
            <div style={{ whiteSpace: 'normal' }} key={index}>{part}</div>
          ))}
        </div>
      );
    }
    
    return null;
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
            <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#202223',whiteSpace:'wrap' }}>
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
    
    // 获取所有商品的尺寸信息
    const allItemsDimensions = order.lineItems?.edges?.map(({ node: item }, index) => {
      const dimensions = item.customAttributes 
        ? parseDimensions(item.customAttributes, item.quantity)
        : null;
      
      if (!dimensions) return null;
      
      return (
        <div key={item.id} style={{ 
          marginBottom: index < order.lineItems.edges.length - 1 ? '12px' : '0',
          paddingBottom: index < order.lineItems.edges.length - 1 ? '12px' : '0',
          borderBottom: index < order.lineItems.edges.length - 1 ? '1px solid #e1e3e5' : 'none'
        }}>
          <div style={{ fontWeight: '500', marginBottom: '4px', fontSize: '0.875rem' }}>
            {item.title}
          </div>
          {dimensions}
        </div>
      );
    }).filter(Boolean);

    return [
      order.name,
      renderLineItems(order.lineItems),
      allItemsDimensions && allItemsDimensions.length > 0 
        ? <div>{allItemsDimensions}</div>
        : '无尺寸信息',
      <div key={`custom-status-${order.id}`} style={{ minWidth: '120px' }}>
        <Select
          label=""
          options={[
            { label: '未设置', value: '' },
            { label: '待生产', value: '待生产' },
            { label: '生产中', value: '生产中' },
            { label: '待发货', value: '待发货' },
            { label: '已发货', value: '已发货' },
          ]}
          value={currentStatus}
          onChange={(value) => handleStatusChange(orderId, value)}
        />
      </div>,
      <Badge {...getStatusBadge(order.displayFulfillmentStatus)} />,
      <Badge {...getStatusBadge(order.displayFinancialStatus)} />,
      formatDate(order.createdAt),
      <ButtonGroup key={`actions-${order.id}`}>
        <Button
          size="slim"
          url={`/app/orders/${orderId}`}
        >
          查看详情
        </Button>
        <Button
          size="slim"
          url={`shopify:admin/orders/${orderId}`}
          target="_blank"
          variant="secondary"
        >
          在Shopify中查看
        </Button>
      </ButtonGroup>,
    ];
  });

  const headings = [
    '订单号',
    '商品信息',
    '尺寸(cm)',
    '订单状态',
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
              {/* 分页 */}
              {pageInfo && (pageInfo.hasNextPage || pageInfo.hasPreviousPage) && (
                <InlineStack gap="400" align="space-between">
                  <Text variant="bodyMd" tone="subdued">
                    当前页码: 第 {currentPage} 页
                  </Text>
                  <Pagination
                    hasPrevious={pageInfo.hasPreviousPage}
                    onPrevious={handlePreviousPage}
                    hasNext={pageInfo.hasNextPage}
                    onNext={handleNextPage}
                    label={`第 ${currentPage} 页`}
                  />
                </InlineStack>
              )}

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
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
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
              
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
