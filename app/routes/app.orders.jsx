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
  Checkbox,
  Modal,
} from "@shopify/polaris";
import * as XLSX from 'xlsx';
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
              note
              customer {
                id
                displayName
              }
              lineItems(first: 20) {
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
              events(first: 50) {
                edges {
                  node {
                    ... on CommentEvent {
                      id
                      message
                      createdAt
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
  let statusMap = {};
  try {
    const orderStatuses = await prisma.orderStatus.findMany();
    orderStatuses.forEach(status => {
      const orderId = status.orderId;
      statusMap[orderId] = status.status;
    });
  } catch (dbError) {
    console.error('Database error when fetching order statuses:', dbError);
    // 如果数据库查询失败，继续执行但使用空的 statusMap
  }

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

  // 处理缓存刷新
  if (action === "refreshCache") {
    try {
      const { mergeOrdersToCache } = await import("../services/cache.server");
      
      // 循环获取所有订单
      let allOrders = [];
      let hasNextPage = true;
      let afterCursor = null;
      
      const orderQuery = `#graphql
        query getOrders($first: Int!, $after: String) {
          orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
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
                note
                customer {
                  id
                  displayName
                }
                lineItems(first: 20) {
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
                events(first: 50) {
                  edges {
                    node {
                      ... on CommentEvent {
                        id
                        message
                        createdAt
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
        }`;
      
      while (hasNextPage) {
        const response = await admin.graphql(orderQuery, {
          variables: {
            first: 50,
            ...(afterCursor && { after: afterCursor }),
          },
        });

        const responseJson = await response.json();
        const orders = responseJson.data.orders.edges.map(edge => edge.node);
        const pageInfo = responseJson.data.orders.pageInfo;
        
        allOrders = allOrders.concat(orders);
        hasNextPage = pageInfo.hasNextPage;
        afterCursor = pageInfo.endCursor;
        
        if (allOrders.length >= 500) {
          break;
        }
      }

      const mergeResult = await mergeOrdersToCache(allOrders);
      
      console.log('✅ 缓存更新成功:', {
        获取订单数: allOrders.length,
        新增订单: mergeResult.addedCount,
        总计订单: mergeResult.totalCount,
        缓存路径: process.cwd() + '/cache/orders.json'
      });
      
      return { 
        success: true, 
        message: `缓存已更新：新增 ${mergeResult.addedCount} 个订单，总计 ${mergeResult.totalCount} 个`,
        addedCount: mergeResult.addedCount,
        totalCount: mergeResult.totalCount
      };
    } catch (error) {
      console.error('刷新缓存失败:', error);
      return { error: "刷新缓存失败: " + error.message };
    }
  }

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
    const statusFilter = formData.get("statusFilter");
    
    // 构建搜索查询字符串
    let queryString = searchQuery || "";
    if (statusFilter && statusFilter !== "all") {
      // 使用发货状态进行筛选
      if (queryString) {
        queryString += ` fulfillment_status:${statusFilter}`;
      } else {
        queryString = `fulfillment_status:${statusFilter}`;
      }
    }
    
    // 搜索订单
    const graphqlQuery = before 
      ? `#graphql
          query searchOrders($query: String!, $last: Int!, $before: String) {
            orders(last: $last, query: $query, before: $before, sortKey: CREATED_AT, reverse: true) {`
      : `#graphql
          query searchOrders($query: String!, $first: Int!, $after: String) {
            orders(first: $first, query: $query, after: $after, sortKey: CREATED_AT, reverse: true) {`;
    
    const response = await admin.graphql(
      graphqlQuery + `
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
                note
                customer {
                  id
                  displayName
                }
                lineItems(first: 20) {
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
          ? { query: queryString, last: 20, before }
          : { query: queryString, first: 20, ...(after && { after }) },
      }
    );

    const responseJson = await response.json();
    
    if (responseJson.errors) {
      console.error('GraphQL Errors in search:', responseJson.errors);
      throw new Error(`GraphQL Error: ${responseJson.errors[0]?.message}`);
    }
    
    if (!responseJson.data || !responseJson.data.orders) {
      console.error('Missing data in search response:', responseJson);
      throw new Error('Invalid GraphQL response structure');
    }
    
    const orders = responseJson.data.orders.edges.map(edge => edge.node);
    const pageInfo = responseJson.data.orders.pageInfo;

    // 获取订单状态
    let statusMap = {};
    try {
      const prisma = (await import("../db.server")).default;
      const orderStatuses = await prisma.orderStatus.findMany();
      orderStatuses.forEach(status => {
        statusMap[status.orderId] = status.status;
      });
    } catch (dbError) {
      console.error('Database error when fetching order statuses in search:', dbError);
      // 如果数据库查询失败，继续执行但使用空的 statusMap
    }

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
  const cacheFetcher = useFetcher();
  const commentFetcher = useFetcher();
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
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsOrderId, setCommentsOrderId] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState([]);

  // 处理搜索结果和页面数据更新
  useEffect(() => {
    if (fetcher.data?.orders) {
      setOrders(fetcher.data.orders);
      setPageInfo(fetcher.data.pageInfo);
      if (fetcher.data.statusMap) {
        setStatusMap(fetcher.data.statusMap);
      }
      // 更新当前的 after/before 游标
      if (fetcher.data.currentAfter !== undefined) {
        setCurrentPageAfter(fetcher.data.currentAfter);
      }
      if (fetcher.data.currentBefore !== undefined) {
        setCurrentPageBefore(fetcher.data.currentBefore);
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

  // 处理缓存刷新结果
  useEffect(() => {
    if (cacheFetcher.data?.success) {
      shopify.toast.show(cacheFetcher.data.message, { duration: 3000 });
    } else if (cacheFetcher.data?.error) {
      shopify.toast.show(cacheFetcher.data.error, { duration: 3000, isError: true });
    }
  }, [cacheFetcher.data]);

  // 处理评论查询结果
  useEffect(() => {
    if (commentFetcher.data?.comments) {
      setComments(commentFetcher.data.comments);
      setCommentsLoading(false);
    } else if (commentFetcher.data?.error) {
      console.error('Error loading comments:', commentFetcher.data.error);
      setComments([]);
      setCommentsLoading(false);
    }
  }, [commentFetcher.data]);

  // 处理评论查询状态
  useEffect(() => {
    if (commentFetcher.state === 'idle' && commentFetcher.data === undefined) {
      setCommentsLoading(false);
    }
  }, [commentFetcher.state]);

  // 当loader数据更新时重置loading状态（仅在初始加载和URL导航时）
  useEffect(() => {
    // 只有在不是通过 fetcher 更新数据时才执行
    if (!fetcher.data) {
      setOrders(initialOrders);
      setPageInfo(initialPageInfo);
      setStatusMap(initialStatusMap || {});
      setCurrentPageAfter(currentAfter);
      setCurrentPageBefore(currentBefore);
      setIsLoading(false);
      // 如果URL中没有分页参数，重置页码
      if (!currentAfter && !currentBefore) {
        setCurrentPage(1);
      }
    }
  }, [initialOrders, initialPageInfo, initialStatusMap, currentAfter, currentBefore, fetcher.data]);

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
    setSelectedOrders(new Set()); // 清除选中状态
    // 导航回第一页
    navigate('/app/orders');
  };

  // 处理订单勾选
  const handleOrderSelect = (orderId, checked) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(orderId);
      } else {
        newSet.delete(orderId);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const handleSelectAll = (checked) => {
    if (checked) {
      const allOrderIds = orders.map(order => order.id);
      setSelectedOrders(new Set(allOrderIds));
    } else {
      setSelectedOrders(new Set());
    }
  };

  // 导出Excel
  const handleExportExcel = async () => {
    if (selectedOrders.size === 0) {
      alert('请先选择要导出的订单');
      return;
    }

    const selectedOrdersData = orders.filter(order => selectedOrders.has(order.id));
    
    // 查询所有订单的评论
    const commentsMap = {};
    await Promise.all(selectedOrdersData.map(async (order) => {
      try {
        const response = await fetch(`/api/comments?orderId=${order.id}`);
        const data = await response.json();
        if (data.comments && data.comments.length > 0) {
          // 合并所有评论，用换行符分隔
          commentsMap[order.id] = data.comments.map(c => c.message).join('\n');
        }
      } catch (error) {
        console.error(`Error fetching comments for order ${order.id}:`, error);
      }
    }));
    
    // 准备Excel数据 - 每个商品一行
    const excelData = [];
    
    selectedOrdersData.forEach(order => {
      const orderId = order.id.replace('gid://shopify/Order/', '');
      // 交货时间 = 下单时间 + 9天
      const orderDate = new Date(order.createdAt);
      const deliveryDate = new Date(orderDate.getTime() + 9 * 24 * 60 * 60 * 1000);
      const deliveryTime = deliveryDate.toLocaleDateString('zh-CN', { month: 'numeric', day: '2-digit' });
      const orderNumber = order.name;
      
      // 用于跟踪当前订单的有效商品索引
      let validItemIndex = 0;
      
      // 为每个商品创建一行
      order.lineItems?.edges?.forEach(({ node: item }, index) => {
        const dimensions = item.customAttributes 
          ? parseDimensions(item.customAttributes, item.quantity)
          : null;

        // 解析尺寸信息
        let fabricHeight = '';
        let widthFromDimensions = ''; // 从尺寸信息中提取的宽度（每片用料）
        let headerType = ''; // 头部类型
        let panels = '';
        let multiplier = '';
        let windows = '';
        let isShaped = '';
        let lining = '';
        let tiebacks = '';
        let processing = '';

        if (dimensions) {
          // 从尺寸信息中提取数据
          const parts = dimensions.props.children.map(child => child.props.children);
          parts.forEach(part => {
            if (part.includes('高:')) {
              fabricHeight = part.replace('高:', '').replace('cm', '');
            } else if (part.includes('宽:')) {
              widthFromDimensions = part.replace('宽:', '').replace('cm', '');
            } else if (part.includes('头部:')) {
              headerType = part.replace('头部:', '').trim();
            } else if (part.includes('高温定型:')) {
              isShaped = part.replace('高温定型:', '').trim() === '需要' ? '是' : '否';
            } else if (part.includes('里料:')) {
              lining = part.replace('里料:', '');
            } else if (part.includes('绑带:')) {
              tiebacks = part.replace('绑带:', '');
            }
          });
        }

        // 计算其他字段
        const quantity = item.quantity || 1;
        panels = quantity.toString();
        windows = '1'; // 默认窗户数量
        processing = 'freshine'; // 默认加工方式
        
        // 根据头部类型设置倍数
        if (headerType.includes('韩褶-L型-2折') || headerType.includes('韩褶-7型-2折')) {
          multiplier = '2'; // L型/7型 2褶 ——2倍
        } else if (headerType.includes('韩褶-L型-3折') || headerType.includes('韩褶-7型-3折')) {
          multiplier = '2.5'; // L型/7型 3褶 ——2.5倍
        } else if (headerType.includes('穿杆带遮轨')) {
          multiplier = '2'; // 穿杆带遮轨——2倍
        } else if (headerType.includes('打孔')) {
          multiplier = '2'; // 打孔——2倍
        } else if (headerType.includes('背带式')) {
          multiplier = '2.5'; // 背带式——2.5倍
        } else if (headerType.includes('吊环挂钩')) {
          multiplier = '2'; // 吊环挂钩——2倍
        } else if (headerType.includes('蛇形帘')) {
          multiplier = '2.5'; // 蛇形帘——2.5倍
        } else if (headerType.includes('韩褶+背带')) {
          multiplier = '2'; // 韩褶+背带——2倍
        } else if (headerType.includes('酒杯褶')) {
          multiplier = '2.5'; // 酒杯褶——2.5倍
        } else if (headerType.includes('工字褶')) {
          multiplier = '2.5'; // 工字褶——2.5倍
        } else {
          multiplier = '2.5'; // 默认倍数
        }

        // 计算采购米数和墙宽
        const height = parseFloat(fabricHeight) || 0;
        const materialPerPiece = parseFloat(widthFromDimensions) || 0; // 每片用料 = 宽度
        const panelsCount = quantity;
        const windowsCount = 1; // 默认窗户数
        const multiplierNum = parseFloat(multiplier) || 2.5;
        
        // 墙宽公式：每片用料/倍数*分片数
        const wallWidth = materialPerPiece > 0 && multiplierNum > 0 
          ? ((materialPerPiece / multiplierNum * panelsCount).toFixed(2))
          : '';

        let purchaseMeters = 0;
        
        if (height < 260) {
          // 当高度<260时:(每片用料+40)*分片*窗户数/100
          purchaseMeters = (materialPerPiece + 40) * panelsCount * windowsCount / 100;
        } else if (height > 260) {
          if (materialPerPiece < 260) {
            // 当高度>260且每片用料<260时(高度+40)*分片*窗户数/100
            purchaseMeters = (height + 40) * panelsCount * windowsCount / 100;
          } else if (materialPerPiece >= 260 && materialPerPiece < 400) {
            // 当高度>260且260<每片用料<400时(高度+40)*(分片+1)*窗户数/100
            purchaseMeters = (height + 40) * (panelsCount + 1) * windowsCount / 100;
          } else if (materialPerPiece >= 400 && materialPerPiece < 560) {
            // 当高度>260且400<每片用料<560时:(高度+40)*(分片+分片)*窗户数/100
            purchaseMeters = (height + 40) * (panelsCount + panelsCount) * windowsCount / 100;
          } else if (materialPerPiece >= 560 && materialPerPiece < 700) {
            // 当高度>260且560<每片用料<700时(高度+40)*(分片+分片+1)*窗户数/100
            purchaseMeters = (height + 40) * (panelsCount + panelsCount + 1) * windowsCount / 100;
          } else if (materialPerPiece >= 700 && materialPerPiece < 840) {
            // 当高度>260且700<每片用料<840时(高度+40)*(分片+分片+分片)*窗户数/100
            purchaseMeters = (height + 40) * (panelsCount + panelsCount + panelsCount) * windowsCount / 100;
          }
        }

        // 保留2位小数
        const purchaseMetersStr = purchaseMeters.toFixed(2);

        // 过滤掉没有加工方式（头部类型）的商品
        if (!headerType) {
          return; // 跳过没有头部类型的商品
        }

        // 处理布料型号：去掉字母，只保留数字和符号
        const fabricModel = item.variant?.title || 'Default Title';
        const fabricModelFiltered = fabricModel; // 去掉所有字母

        // 如果是当前订单的第一个有效商品，显示订单信息；否则留空
        const rowData = {
          '交货时间': validItemIndex === 0 ? deliveryTime : '',
          '订单编号': validItemIndex === 0 ? orderNumber : '',
          '备注': validItemIndex === 0 ? (order.note || '') : '',
          '评论': validItemIndex === 0 ? (commentsMap[order.id] || '') : '',
          '布料型号': fabricModelFiltered, // 去掉字母后的布料型号
          '布料采购米数': purchaseMetersStr, // 根据规则计算的采购米数
          '加工方式': headerType || '',
          '布料高度': fabricHeight ? Math.round(parseFloat(fabricHeight)).toString() : '', // 四舍五入取整
          '墙宽': wallWidth ? Math.round(parseFloat(wallWidth)).toString() : '', // 四舍五入取整
          '每片用料': widthFromDimensions ? Math.round(parseFloat(widthFromDimensions)).toString() : '', // 四舍五入取整
          '分片': panels,
          '倍数': multiplier,
          '窗户数量': windows,
          '是否定型': isShaped,
          '衬布': lining,
          '绑带': tiebacks,
          '加工': processing
        };

        excelData.push(rowData);
        validItemIndex++; // 增加有效商品计数
      });
    });

    // 创建工作簿
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '订单列表');

    // 下载文件
    const fileName = `订单列表_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
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

  const handleViewComments = (orderId) => {
    setCommentsOrderId(orderId);
    setShowCommentsModal(true);
    setCommentsLoading(true);
    setComments([]);
    
    // 使用 fetcher 加载评论
    commentFetcher.load(`/api/comments?orderId=${orderId}`);
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
        if(!value.includes('No')){
          dimensions.bodyMemory = '需要';
        }
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
        <div style={{ lineHeight: '1.4',maxWidth:'400px' }}>
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
          <div style={{ fontWeight: '500', marginBottom: '4px', fontSize: '0.875rem','width':'400px','whiteSpace':'wrap' }}>
            {item.title}
          </div>
          {dimensions}
        </div>
      );
    }).filter(Boolean);

    return [
      <Checkbox
        key={`checkbox-${order.id}`}
        checked={selectedOrders.has(order.id)}
        onChange={(checked) => handleOrderSelect(order.id, checked)}
        label=""
      />,
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
      <div style={{ maxWidth: '200px', wordWrap: 'break-word' }}>
        {order.note || '-'}
      </div>,
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
          onClick={() => handleViewComments(order.id)}
        >
          查询评论
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
    <Checkbox
      key="select-all"
      checked={selectedOrders.size === orders.length && orders.length > 0}
      onChange={handleSelectAll}
      label=""
    />,
    '订单号',
    '商品信息',
    '尺寸(cm)',
    '订单状态',
    '发货状态',
    '支付状态',
    '备注',
    '创建时间',
    '操作',
  ];

  return (
    <Page>
      <style dangerouslySetInnerHTML={{__html: `
        .Polaris-DataTable--condensed {
          max-height: 1000px !important;
          overflow-y: scroll !important;
        }
        .Polaris-DataTable__ScrollContainer {
          max-height: 1000px !important;
          overflow-y: auto !important;
        }
        .Polaris-DataTable thead {
          position: sticky !important;
          top: 0 !important;
          z-index: 10 !important;
          background-color: #f6f6f7 !important;
        }
      `}} />
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
                  <Button
                    onClick={() => {
                      const formData = new FormData();
                      formData.append("action", "refreshCache");
                      cacheFetcher.submit(formData, { method: "POST" });
                    }}
                    loading={cacheFetcher.state === "submitting"}
                    tone="success"
                  >
                    刷新缓存
                  </Button>
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
                  <Button onClick={() => handleSearch()} loading={isLoading}>
                    搜索
                  </Button>
                  <Button onClick={handleClearSearch} variant="plain">
                    清除
                  </Button>
                </InlineStack>
                <InlineStack gap="300">
                  <Text variant="bodyMd" tone="subdued">
                    已选择 {selectedOrders.size} 个订单
                  </Text>
                  <Button 
                    onClick={handleExportExcel} 
                    disabled={selectedOrders.size === 0}
                    variant="primary"
                  >
                    导出Excel
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
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
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

      {/* 评论查询 Modal */}
      <Modal
        open={showCommentsModal}
        onClose={() => setShowCommentsModal(false)}
        title="订单评论"
        primaryAction={{
          content: '关闭',
          onAction: () => setShowCommentsModal(false),
        }}
      >
        <Modal.Section>
          {commentsLoading ? (
            <Box padding="400">
              <InlineStack align="center">
                <Spinner size="small" />
                <Text variant="bodyMd">正在加载评论...</Text>
              </InlineStack>
            </Box>
          ) : comments.length > 0 ? (
            <BlockStack gap="400">
              {comments.map((comment) => (
                <Card key={comment.id}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" fontWeight="semibold">
                        评论 #{comment.id.split('/').pop()}
                      </Text>
                      <Text variant="bodyMd" tone="subdued">
                        {formatDate(comment.createdAt)}
                      </Text>
                    </InlineStack>
                    <Text variant="bodyMd">{comment.message}</Text>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          ) : (
            <EmptyState
              heading="暂无评论"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>该订单目前没有任何评论</p>
            </EmptyState>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
