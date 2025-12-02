import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { json } from "@remix-run/node";
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
    
    // 认证检查
    const { admin, session } = await authenticate.admin(request);
    
    if (!admin) {
      throw new Error('认证失败：无法获取 admin 实例');
    }
  
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
              fulfillments {
                id
                createdAt
                deliveredAt
                estimatedDeliveryAt
                inTransitAt
                status
                trackingInfo {
                  company
                  number
                  url
                }
              }
              lineItems(first: 20) {
                edges {
                  node {
                    id
                    title
                    quantity
                    image {
                      url
                      altText
                    }
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

  // 获取所有订单的自定义状态和备注
  let statusMap = {};
  let noteMap = {};
  let heatSettingFeeMap = {}; // 高温定型费用映射
  let waybillMap = {}; // 运单信息映射
  let allTags = [];
  let orderTagsMap = {};
  
  try {
    // 获取订单状态
    const orderStatuses = await prisma.orderStatus.findMany();
    orderStatuses.forEach(status => {
      // 支持按 lineItem 级别的状态：key = "orderId:lineItemId"，若无 lineItemId 则 fallback 到 orderId
      const key = status.lineItemId ? `${status.orderId}:${status.lineItemId}` : status.orderId;
      statusMap[key] = status.status;
      noteMap[key] = status.note || '';
      
      // 保存高温定型费用
      if (status.heatSettingFee !== null && status.heatSettingFee !== undefined) {
        heatSettingFeeMap[status.orderId] = status.heatSettingFee;
      }
      
      // 保存运单信息
      if (status.sfWaybillNo) {
        waybillMap[status.orderId] = {
          waybillNo: status.sfWaybillNo,
          labelUrl: status.sfLabelUrl,
          invoiceUrl: status.sfInvoiceUrl,
          createdAt: status.sfCreatedAt,
        };
      }
    });
  } catch (dbError) {
    console.error('数据库查询错误（orderStatus）:', dbError);
    // 不中断流程，使用空数据继续
  }
  
  try {
    // 确保预设标签存在
    const presetTags = [
      { name: '小样', color: '#3b82f6', description: '小样订单（价格$1.99）' },
      { name: '罗马帘', color: '#8b5cf6', description: '包含罗马帘产品' },
      { name: '布帘', color: '#10b981', description: '包含布帘产品' },
      { name: '硬件', color: '#f59e0b', description: '包含硬件产品' },
    ];
    
    for (const presetTag of presetTags) {
      try {
        const existing = await prisma.tag.findUnique({
          where: { name: presetTag.name }
        });
        
        if (!existing) {
          await prisma.tag.create({
            data: presetTag
          });
        }
      } catch (tagError) {
        console.error(`创建标签失败（${presetTag.name}）:`, tagError);
        // 继续处理其他标签
      }
    }
    
    // 获取所有标签
    allTags = await prisma.tag.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (tagError) {
    console.error('标签操作错误:', tagError);
    allTags = [];
  }
  
  try {
    // 创建标签名称到ID的映射
    const tagNameToId = {};
    allTags.forEach(tag => {
      tagNameToId[tag.name] = tag.id;
    });
    
    // 获取订单标签关联
    const orderTags = await prisma.orderTag.findMany({
      include: { tag: true }
    });
    
    // 构建订单ID到标签的映射
    orderTags.forEach(ot => {
      if (!orderTagsMap[ot.orderId]) {
        orderTagsMap[ot.orderId] = [];
      }
      orderTagsMap[ot.orderId].push(ot.tag);
    });
    
    // 自动为订单打标签
    for (const order of orders) {
      try {
        const orderId = order.id.replace('gid://shopify/Order/', '');
        const existingTags = orderTagsMap[orderId] || [];
        const existingTagNames = existingTags.map(t => t.name);
        
        // 检测订单类型并添加标签
        const tagsToAdd = [];
        
        // 检测小样订单
        const isSampleOrder = order.lineItems?.edges?.every(({ node: item }) => {
          const price = parseFloat(item.variant?.price || '0');
          return price === 1.99;
        });
        
        if (isSampleOrder && !existingTagNames.includes('小样')) {
          tagsToAdd.push('小样');
        }
        
        // 检测产品类型
        let hasRomanShade = false;
        let hasCurtain = false;
        let hasHardware = false;
        
        order.lineItems?.edges?.forEach(({ node: item }) => {
          const title = item.title?.toLowerCase() || '';
          
          // 检测罗马帘
          if (title.includes('roman')) {
            hasRomanShade = true;
          }
          
          // 检测当前商品是否为硬件（使用单词边界匹配）
          const hardwarePattern = /\b(rod|bracket|finial|ring|clip|hook)\b/i;
          const isCurrentItemHardware = hardwarePattern.test(item.title || '');
          
          if (isCurrentItemHardware) {
            hasHardware = true;
          }
          
          // 如果当前商品不是罗马帘也不是硬件，且有头部类型，则认为是布帘
          if (!title.includes('roman') && !isCurrentItemHardware) {
            const hasHeader = item.customAttributes?.some(attr => 
              attr.key.includes('Header') || attr.key.includes('Pleat')
            );
            if (hasHeader) {
              hasCurtain = true;
            }
          }
        });
        
        if (hasRomanShade && !existingTagNames.includes('罗马帘')) {
          tagsToAdd.push('罗马帘');
        }
        
        if (hasCurtain && !existingTagNames.includes('布帘')) {
          tagsToAdd.push('布帘');
        }
        
        if (hasHardware && !existingTagNames.includes('硬件')) {
          tagsToAdd.push('硬件');
        }
        
        // 添加新标签
        for (const tagName of tagsToAdd) {
          const tagId = tagNameToId[tagName];
          if (tagId) {
            try {
              const newOrderTag = await prisma.orderTag.create({
                data: {
                  orderId,
                  tagId
                },
                include: { tag: true }
              });
              
              if (!orderTagsMap[orderId]) {
                orderTagsMap[orderId] = [];
              }
              orderTagsMap[orderId].push(newOrderTag.tag);
            } catch (tagCreateError) {
              // 忽略重复标签错误
              if (!tagCreateError.message?.includes('Unique constraint')) {
                console.error(`添加标签失败（订单${orderId}，标签${tagName}）:`, tagCreateError);
              }
            }
          }
        }
      } catch (autoTagError) {
        console.error('自动标签处理错误:', autoTagError);
        // 继续处理下一个订单
      }
    }
  } catch (orderTagError) {
    console.error('订单标签查询错误:', orderTagError);
    // 使用空映射继续
  }

  // 在后台保存数据到缓存（不影响显示）
  if (!after && !before) {
    // 异步保存到缓存，不等待完成
    saveOrdersToCache(orders, pageInfo).catch(error => {
      console.error('缓存保存失败:', error);
    });
  }

    return json({
      orders,
      pageInfo,
      statusMap,
      noteMap,
      heatSettingFeeMap,
      waybillMap,
      allTags,
      orderTagsMap,
      fromCache: false,
      currentAfter: after,
      currentBefore: before,
    });
  } catch (error) {
    console.error('Loader error:', error);
    console.error('Error stack:', error.stack);
    
    // 返回友好的错误信息
    return json({
      error: '加载订单数据失败',
      message: error.message,
      orders: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      statusMap: {},
      noteMap: {},
      heatSettingFeeMap: {},
      waybillMap: {},
      allTags: [],
      orderTagsMap: {},
      fromCache: false
    }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const searchQuery = formData.get("searchQuery");

  // 处理标签操作
  if (action === "addTag" || action === "removeTag") {
    const prisma = (await import("../db.server")).default;
    const orderId = formData.get("orderId");
    const tagId = formData.get("tagId");
    
    if (!orderId || !tagId) {
      return json({ error: "参数错误" }, { status: 400 });
    }
    
    try {
      if (action === "addTag") {
        // 添加标签到订单
        const orderTag = await prisma.orderTag.create({
          data: { orderId, tagId },
          include: { tag: true }
        });
        return json({ success: true, orderTag });
      } else {
        // 从订单移除标签
        await prisma.orderTag.deleteMany({
          where: { orderId, tagId }
        });
        return json({ success: true });
      }
    } catch (error) {
      if (error.code === 'P2002') {
        return json({ error: "该标签已添加到此订单" }, { status: 400 });
      }
      return json({ error: "操作失败" }, { status: 500 });
    }
  }

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
                fulfillments {
                  id
                  createdAt
                  deliveredAt
                  estimatedDeliveryAt
                  inTransitAt
                  status
                  trackingInfo {
                    company
                    number
                    url
                  }
                }
                lineItems(first: 20) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      image {
                        url
                        altText
                      }
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

    const orderKey = formData.get("orderId");
    const status = formData.get("status");
    const note = formData.get("note") || null;

    if (!orderKey || !status) {
      return { error: "缺少必要参数" };
    }

    // orderKey 可能为 "<orderId>:<lineItemId>" 或仅为订单 id
    let orderId = orderKey;
    let lineItemId = null;
    if (orderKey.includes(':')) {
      const parts = orderKey.split(':');
      orderId = parts[0];
      // 允许 lineItemId 包含 ':' 的情况，取剩余部分
      lineItemId = parts.slice(1).join(':');
    }

    try {
      // 先尝试查找已有记录（orderId + lineItemId）
      const existing = await prisma.orderStatus.findFirst({
        where: { orderId, lineItemId }
      });

      let orderStatus;
      if (existing) {
        orderStatus = await prisma.orderStatus.update({
          where: { id: existing.id },
          data: { status, note }
        });
      } else {
        orderStatus = await prisma.orderStatus.create({
          data: { orderId, lineItemId, status, note }
        });
      }

      return json({ success: true, orderStatus });
    } catch (error) {
      console.error("更新订单状态失败:", error);
      console.error("错误详情:", error.message);
      console.error("错误代码:", error.code);
      console.error("参数:", { orderId, lineItemId, status, note });
      
      // 返回更详细的错误信息
      return json({ 
        error: "更新失败", 
        details: error.message,
        needsMigration: error.message?.includes('no such column') || error.message?.includes('note')
      }, { status: 500 });
    }
  }

  // 处理高温定型费用更新
  if (action === "updateHeatSettingFee") {
    const prisma = (await import("../db.server")).default;
    const orderId = formData.get("orderId");
    const feeValue = formData.get("fee");

    if (!orderId) {
      return json({ error: "缺少订单ID" }, { status: 400 });
    }

    const fee = feeValue === "" || feeValue === null ? null : parseFloat(feeValue);
    
    if (fee !== null && (isNaN(fee) || fee < 0)) {
      return json({ error: "无效的费用金额" }, { status: 400 });
    }

    try {
      const existing = await prisma.orderStatus.findFirst({
        where: { orderId, lineItemId: null }
      });

      if (existing) {
        await prisma.orderStatus.update({
          where: { id: existing.id },
          data: { heatSettingFee: fee }
        });
      } else {
        await prisma.orderStatus.create({
          data: { 
            orderId, 
            lineItemId: null, 
            status: "未发货",
            heatSettingFee: fee 
          }
        });
      }

      return json({ success: true, fee });
    } catch (error) {
      console.error("更新高温定型费用失败:", error);
      return json({ error: "更新失败", details: error.message }, { status: 500 });
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
                fulfillments {
                  id
                  createdAt
                  deliveredAt
                  estimatedDeliveryAt
                  inTransitAt
                  status
                  trackingInfo {
                    company
                    number
                    url
                  }
                }
                lineItems(first: 20) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      image {
                        url
                        altText
                      }
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

    // 获取订单状态和备注
    let statusMap = {};
    let noteMap = {};
    try {
      const prisma = (await import("../db.server")).default;
      const orderStatuses = await prisma.orderStatus.findMany();
      orderStatuses.forEach(status => {
        const key = status.lineItemId ? `${status.orderId}:${status.lineItemId}` : status.orderId;
        statusMap[key] = status.status;
        noteMap[key] = status.note || '';
      });
    } catch (dbError) {
      console.error('Database error when fetching order statuses in search:', dbError);
      // 如果数据库查询失败，继续执行但使用空的 statusMap
    }

    return json({
      orders,
      pageInfo,
      statusMap,
      noteMap,
      searchQuery,
      currentAfter: after,
      currentBefore: before,
    });
  }

  return json({ error: "未知操作" }, { status: 400 });
};

export default function Orders() {
  const { 
    orders: initialOrders, 
    pageInfo: initialPageInfo, 
    statusMap: initialStatusMap,
    noteMap: initialNoteMap,
    heatSettingFeeMap: initialHeatSettingFeeMap,
    waybillMap: initialWaybillMap,
    allTags: initialTags,
    orderTagsMap: initialOrderTagsMap,
    fromCache: initialFromCache,
    currentAfter,
    currentBefore 
  } = useLoaderData();
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  const cacheFetcher = useFetcher();
  const commentFetcher = useFetcher();
  const tagFetcher = useFetcher();
  const sfFetcher = useFetcher(); // 顺丰快递打印
  const heatSettingFeeFetcher = useFetcher(); // 高温定型费用更新
  const [printingOrderId, setPrintingOrderId] = useState(null); // 正在打印的订单ID
  const [printModalOpen, setPrintModalOpen] = useState(false); // 打印弹窗
  const [printOrderId, setPrintOrderId] = useState(null); // 要打印的订单ID
  const [parcelQuantity, setParcelQuantity] = useState("1"); // 包裹数量
  const [selectedLineItems, setSelectedLineItems] = useState([]); // 选中的商品ID
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [statusMap, setStatusMap] = useState(initialStatusMap || {});
  const [noteMap, setNoteMap] = useState(initialNoteMap || {});
  const [heatSettingFeeMap, setHeatSettingFeeMap] = useState(initialHeatSettingFeeMap || {});
  const [waybillMap, setWaybillMap] = useState(initialWaybillMap || {});
  const [allTags, setAllTags] = useState(initialTags || []);
  const [orderTagsMap, setOrderTagsMap] = useState(initialOrderTagsMap || {});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [financialFilter, setFinancialFilter] = useState("all");
  const [customStatusFilter, setCustomStatusFilter] = useState("all"); // 自定义订单状态筛选
  const [startDate, setStartDate] = useState(""); // 开始日期
  const [endDate, setEndDate] = useState(""); // 结束日期
  const [isLoading, setIsLoading] = useState(false);
  const [currentPageAfter, setCurrentPageAfter] = useState(currentAfter);
  const [currentPageBefore, setCurrentPageBefore] = useState(currentBefore);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsOrderId, setCommentsOrderId] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [showBatchExportModal, setShowBatchExportModal] = useState(false);
  const [batchExportStartDate, setBatchExportStartDate] = useState("");
  const [batchExportEndDate, setBatchExportEndDate] = useState("");
  const [batchExportStatus, setBatchExportStatus] = useState("all");
  const [batchExporting, setBatchExporting] = useState(false);

  // 处理搜索结果和页面数据更新
  useEffect(() => {
    if (fetcher.data?.orders) {
      setOrders(fetcher.data.orders);
      setPageInfo(fetcher.data.pageInfo);
      if (fetcher.data.statusMap) {
        setStatusMap(fetcher.data.statusMap);
      }
      if (fetcher.data.noteMap) {
        setNoteMap(fetcher.data.noteMap);
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
      // 使用 lineItemId（若有）构造 key，兼容只按订单记录的旧数据
      const key = orderStatus.lineItemId ? `${orderStatus.orderId}:${orderStatus.lineItemId}` : orderStatus.orderId;
      setStatusMap(prev => ({
        ...prev,
        [key]: orderStatus.status
      }));
      setNoteMap(prev => ({
        ...prev,
        [key]: orderStatus.note || ''
      }));
    } else if (statusFetcher.data?.error) {
      // 显示错误信息
      const errorMsg = statusFetcher.data.needsMigration 
        ? '数据库需要迁移：请运行 node scripts/migrate-add-note-node.js'
        : `更新失败: ${statusFetcher.data.details || statusFetcher.data.error}`;
      
      shopify.toast.show(errorMsg, { duration: 5000, isError: true });
      console.error('状态更新失败:', statusFetcher.data);
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

  // 处理顺丰打印结果
  useEffect(() => {
    if (sfFetcher.data) {
      const orderId = printingOrderId;
      setPrintingOrderId(null); // 清除打印状态
      
      if (sfFetcher.data.success) {
        const waybillInfo = sfFetcher.data.childWaybillNos && sfFetcher.data.childWaybillNos.length > 0
          ? `主运单：${sfFetcher.data.waybillNo}，子运单数量：${sfFetcher.data.childWaybillNos.length}`
          : `运单号：${sfFetcher.data.waybillNo}`;
        
        shopify.toast.show(`运单创建成功！${waybillInfo}`, { 
          duration: 5000 
        });
        
        // 更新运单信息到状态
        if (orderId) {
          setWaybillMap(prev => ({
            ...prev,
            [orderId]: {
              waybillNo: sfFetcher.data.waybillNo,
              labelUrl: sfFetcher.data.labelUrl,
              invoiceUrl: sfFetcher.data.invoiceUrl,
              createdAt: new Date(),
            }
          }));
        }
        
        // 自动打开面单打印页面
        if (sfFetcher.data.labelUrl) {
          window.open(sfFetcher.data.labelUrl, '_blank');
        }
        
        // 可选：同时打开发票打印页面（如果需要）
        // if (sfFetcher.data.invoiceUrl) {
        //   setTimeout(() => window.open(sfFetcher.data.invoiceUrl, '_blank'), 500);
        // }
      } else if (sfFetcher.data.error) {
        shopify.toast.show(`打印失败：${sfFetcher.data.error}`, { 
          duration: 5000, 
          isError: true 
        });
      }
    }
  }, [sfFetcher.data]);

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

  // 处理高温定型费用更新结果
  useEffect(() => {
    if (heatSettingFeeFetcher.data?.success) {
      const { fee } = heatSettingFeeFetcher.data;
      // 从提交的formData中获取orderId
      const orderId = heatSettingFeeFetcher.formData?.get("orderId");
      if (orderId) {
        setHeatSettingFeeMap(prev => ({
          ...prev,
          [orderId]: fee
        }));
      }
    } else if (heatSettingFeeFetcher.data?.error) {
      shopify.toast.show(heatSettingFeeFetcher.data.error, { duration: 3000, isError: true });
    }
  }, [heatSettingFeeFetcher.data]);

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
    setTagFilter("all");
    setFinancialFilter("all");
    setCustomStatusFilter("all");
    setStartDate("");
    setEndDate("");
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
      // 只选择当前可见（经过标签筛选）的订单
      const visibleOrderIds = orders
        .filter(order => {
          if (!tagFilter || tagFilter === 'all') return true;
          const orderId = order.id.replace('gid://shopify/Order/', '');
          const tags = orderTagsMap[orderId] || [];
          return tags.some(t => t.id === tagFilter);
        })
        .map(order => order.id);
      setSelectedOrders(new Set(visibleOrderIds));
    } else {
      setSelectedOrders(new Set());
    }
  };

  // 批量导出Excel（根据条件导出所有订单）
  const handleBatchExport = async () => {
    setBatchExporting(true);
    
    try {
      // 从缓存获取所有订单数据
      const cacheResponse = await fetch('/api/cache-update');
      const cacheData = await cacheResponse.json();
      
      if (!cacheData.success || !cacheData.orders || cacheData.orders.length === 0) {
        alert('暂无订单数据。系统会自动在后台加载订单数据，请稍后再试。\n\n提示：如果长时间没有数据，请刷新页面。');
        setBatchExporting(false);
        return;
      }
      
      let allOrders = [...cacheData.orders];
      console.log(`从缓存获取了 ${allOrders.length} 个订单`);
      
      // 应用日期筛选
      if (batchExportStartDate) {
        const start = new Date(batchExportStartDate);
        start.setHours(0, 0, 0, 0);
        allOrders = allOrders.filter(order => {
          const orderDate = new Date(order.createdAt);
          return orderDate >= start;
        });
      }
      
      if (batchExportEndDate) {
        const end = new Date(batchExportEndDate);
        end.setHours(23, 59, 59, 999);
        allOrders = allOrders.filter(order => {
          const orderDate = new Date(order.createdAt);
          return orderDate <= end;
        });
      }
      
      // 应用自定义订单状态筛选
      if (batchExportStatus !== "all") {
        allOrders = allOrders.filter(order => {
          const orderId = order.id.replace('gid://shopify/Order/', '');
          const orderStatus = statusMap[orderId];
          return orderStatus === batchExportStatus;
        });
      }
      
      if (allOrders.length === 0) {
        alert('没有找到符合筛选条件的订单。\n\n请检查：\n1. 日期范围是否正确\n2. 订单状态筛选是否过于严格');
        setBatchExporting(false);
        return;
      }
      
      console.log(`准备导出 ${allOrders.length} 个符合条件的订单`);
      
      // 使用相同的导出逻辑
      await exportOrdersToExcel(allOrders);
      
      // 关闭对话框
      setShowBatchExportModal(false);
      setBatchExportStartDate("");
      setBatchExportEndDate("");
      setBatchExportStatus("all");
    } catch (error) {
      console.error('批量导出失败:', error);
      alert('导出失败: ' + error.message + '\n\n请刷新页面后重试。');
    } finally {
      setBatchExporting(false);
    }
  };

  // 导出备货单
  const handleExportStockList = async () => {
    if (selectedOrders.size === 0) {
      alert('请先选择要导出的订单');
      return;
    }

    const selectedOrdersData = orders.filter(order => selectedOrders.has(order.id));
    
    if (selectedOrdersData.length === 0) {
      alert('没有找到选中的订单数据');
      return;
    }

    // 按订单号分组汇总
    const stockData = [];

    selectedOrdersData.forEach(order => {
      const orderNumber = order.name;
      const orderData = {
        orderNumber,
        curtainPanels: 0,        // 窗帘片数
        tiebacks: 0,             // 绑带数
        buttons: 0,              // 扣子
        eyeMask: '',             // 礼品-眼罩
        giftBand: '',            // 礼品-束带
        rings: '',               // 环（夹子）
        romanShadeCount: 0,      // 罗马帘数量
        romanRodCount: 0,        // 罗马杆数量
        trackCount: 0,           // 轨道数量
        otherAccessories: [],    // 其他配件
        lineItemNotes: [],       // lineItem备注集合
      };

      // 遍历订单商品
      order.lineItems?.edges?.forEach(({ node: item }) => {
        const title = item.title || '';
        const titleLower = title.toLowerCase();
        const quantity = item.quantity || 1;
        const customAttributes = item.customAttributes || [];
        
        // 收集 lineItem 中的备注信息
        customAttributes.forEach(attr => {
          const key = attr.key?.toLowerCase() || '';
          const value = attr.value || '';
          // 检查是否是备注字段
          if ((key.includes('note') || key.includes('remark') || key.includes('备注') || key.includes('comment')) && value.trim()) {
            orderData.lineItemNotes.push(`${title}: ${value}`);
          }
        });
        
        // 检查是否是礼品-眼罩 (Free Ice Silk Eye Mask)
        if (titleLower.includes('free ice silk eye mask') || titleLower.includes('eye mask')) {
          orderData.eyeMask = '需要';
          return; // 跳过礼品，不计入其他统计
        }
        
        // 检查是否是礼品-束带 (Free Magnetic Tiebacks)
        if (titleLower.includes('free magnetic tieback')) {
          orderData.giftBand = '需要';
          return; // 跳过礼品，不计入其他统计
        }
        
        // 检查是否是罗马帘（包含 roman 但不包含 rod）
        const isRomanShade = titleLower.includes('roman') && !titleLower.includes('rod');
        // 检查是否是轨道（包含 track 但不是 track runner 配件）
        const isTrack = (titleLower.includes('track') || titleLower.includes('轨道')) && 
                        !titleLower.includes('runner');
        // 检查是否是罗马杆
        const isRomanRod = titleLower.includes('roman rod') || titleLower.includes('罗马杆');
        // 检查是否是布帘（curtain 或 drape）
        const isCurtain = (titleLower.includes('curtain') || titleLower.includes('drape')) && 
                          !isRomanShade && !isTrack && !isRomanRod &&
                          !titleLower.includes('runner'); // 排除 curtain track runner
        
        if (isRomanShade) {
          orderData.romanShadeCount += quantity;
        } else if (isTrack) {
          orderData.trackCount += quantity;
        } else if (isRomanRod) {
          orderData.romanRodCount += quantity;
        } else if (isCurtain) {
          // 只有布帘才统计窗帘片数
          // 检查 customAttributes 中的头部类型和绑带
          let headerType = '';
          let hasTieback = false;
          
          customAttributes.forEach(attr => {
            const key = attr.key?.toLowerCase() || '';
            const value = attr.value?.toLowerCase() || '';
            
            if (key.includes('header')) {
              headerType = attr.value || '';
            }
            if (key.includes('tieback') && value !== 'no need' && value !== 'no' && value !== '') {
              hasTieback = true;
            }
          });
          
          // 窗帘片数
          orderData.curtainPanels += quantity;
          
          // 绑带和扣子
          if (hasTieback) {
            orderData.tiebacks += quantity;
            orderData.buttons += quantity;
          }
          
          // 环（夹子）- Flat Panel 需要
          if (headerType.toLowerCase().includes('flat panel')) {
            orderData.rings = '需要';
          }
        } else {
          // 其他配件
          orderData.otherAccessories.push(`${title} x${quantity}`);
        }
      });

      stockData.push(orderData);
    });

    // 生成Excel数据
    const excelData = stockData.map(order => ({
      '订单编号': order.orderNumber,
      '窗帘片数': order.curtainPanels || '',
      '绑带数': order.tiebacks || '',
      '扣子': order.buttons || '',
      '礼品-眼罩': order.eyeMask || '',
      '礼品-束带': order.giftBand || '',
      '环（夹子）': order.rings || '',
      '罗马帘数量': order.romanShadeCount || '',
      '罗马杆数量': order.romanRodCount || '',
      '轨道数量': order.trackCount || '',
      '其他配件': order.otherAccessories.join(', ') || '',
      '备注': order.lineItemNotes.join('; ') || '',
    }));

    // 创建工作簿
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '备货单');

    // 设置列宽
    ws['!cols'] = [
      { wch: 15 },  // 订单编号
      { wch: 10 },  // 窗帘片数
      { wch: 10 },  // 绑带数
      { wch: 10 },  // 扣子
      { wch: 12 },  // 礼品-眼罩
      { wch: 12 },  // 礼品-束带
      { wch: 12 },  // 环（夹子）
      { wch: 12 },  // 罗马帘数量
      { wch: 12 },  // 罗马杆数量
      { wch: 10 },  // 轨道数量
      { wch: 30 },  // 其他配件
      { wch: 50 },  // 备注
    ];

    // 下载文件
    const fileName = `备货单_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // 导出订单到Excel的通用函数
  const exportOrdersToExcel = async (ordersToExport) => {
    // 查询所有订单的评论
    const commentsMap = {};
    await Promise.all(ordersToExport.map(async (order) => {
      try {
        const response = await fetch(`/api/comments?orderId=${order.id}`);
        const data = await response.json();
        if (data.comments && data.comments.length > 0) {
          commentsMap[order.id] = data.comments.map(c => c.message).join('\n');
        }
      } catch (error) {
        console.error(`Error fetching comments for order ${order.id}:`, error);
      }
    }));

    // 获取布料价格数据
    const fabricPricesMap = {};
    const liningPricesMap = {};
    
    try {
      const fabricsResponse = await fetch('/api/fabric-prices');
      if (fabricsResponse.ok) {
        const { fabrics } = await fabricsResponse.json();
        fabrics.forEach(fabric => {
          fabric.colors.forEach(color => {
            const colorPrice = color.prices[0];
            const fabricPrice = fabric.prices[0];
            const effectivePrice = colorPrice || fabricPrice;
            fabricPricesMap[color.fullCode] = effectivePrice;
          });
        });
      }
      
      const liningsResponse = await fetch('/api/lining-prices');
      if (liningsResponse.ok) {
        const { linings } = await liningsResponse.json();
        linings.forEach(lining => {
          liningPricesMap[lining.type] = lining.price;
        });
      }
    } catch (error) {
      console.error('获取价格失败:', error);
    }
    
    // 准备Excel数据
    const excelData = [];
    
    ordersToExport.forEach(order => {
      const orderId = order.id.replace('gid://shopify/Order/', '');
      const orderDate = new Date(order.createdAt);
      const deliveryDate = new Date(orderDate.getTime() + 9 * 24 * 60 * 60 * 1000);
      const deliveryTime = deliveryDate.toLocaleDateString('zh-CN', { month: 'numeric', day: '2-digit' });
      const orderNumber = order.name;
      
      let validItemIndex = 0;
      
      order.lineItems?.edges?.forEach(({ node: item }, index) => {
        const dimensions = item.customAttributes 
          ? parseDimensions(item.customAttributes, item.quantity, item.title)
          : null;

        let fabricHeight = '';
        let widthFromDimensions = '';
        let headerType = '';
        let panels = '';
        let multiplier = '';
        let windows = '';
        let isShaped = '';
        let lining = '';
        let tiebacks = '';
        let processing = '';

        const liningTypeAttr = item.customAttributes?.find(
          attr => attr.key === '_Lining Type'
        );
        if (liningTypeAttr?.value) {
          const liningValue = liningTypeAttr.value.toLowerCase();
          if (liningValue === 'unlined' || liningValue.includes('lining type')) {
            lining = '';
          } else {
            lining = liningTypeAttr.value.split('(')[0].trim();
          }
        }

        if (dimensions) {
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
            } else if (part.includes('绑带:')) {
              tiebacks = part.replace('绑带:', '');
            }
          });
        }

        const quantity = item.quantity || 1;
        panels = quantity.toString();
        windows = '1';
        processing = 'freshine';
        
        if (headerType.includes('韩褶-L型-2折') || headerType.includes('韩褶-7型-2折')) {
          multiplier = '2';
        } else if (headerType.includes('韩褶-L型-3折') || headerType.includes('韩褶-7型-3折')) {
          multiplier = '2.5';
        } else if (headerType.includes('穿杆带遮轨')) {
          multiplier = '2';
        } else if (headerType.includes('打孔')) {
          multiplier = '2';
        } else if (headerType.includes('背带式')) {
          multiplier = '2.5';
        } else if (headerType.includes('吊环挂钩')) {
          multiplier = '2';
        } else if (headerType.includes('蛇形帘')) {
          multiplier = '2.5';
        } else if (headerType.includes('韩褶+背带')) {
          multiplier = '2';
        } else if (headerType.includes('酒杯褶')) {
          multiplier = '2.5';
        } else if (headerType.includes('工字褶')) {
          multiplier = '2.5';
        } else {
          multiplier = '2.5';
        }

        const height = parseFloat(fabricHeight) || 0;
        const materialPerPiece = parseFloat(widthFromDimensions) || 0;
        const panelsCount = quantity;
        const windowsCount = 1;
        const multiplierNum = parseFloat(multiplier) || 2.5;
        
        const wallWidth = materialPerPiece > 0 && multiplierNum > 0 
          ? ((materialPerPiece / multiplierNum * panelsCount).toFixed(2))
          : '';

        let purchaseMeters = 0;
        
        if (height < 260) {
          purchaseMeters = (materialPerPiece + 40) * panelsCount * windowsCount / 100;
        } else if (height > 260) {
          if (materialPerPiece < 260) {
            purchaseMeters = (height + 40) * panelsCount * windowsCount / 100;
          } else if (materialPerPiece >= 260 && materialPerPiece < 400) {
            purchaseMeters = (height + 40) * (panelsCount + 1) * windowsCount / 100;
          } else if (materialPerPiece >= 400 && materialPerPiece < 560) {
            purchaseMeters = (height + 40) * (panelsCount + panelsCount) * windowsCount / 100;
          } else if (materialPerPiece >= 560 && materialPerPiece < 700) {
            purchaseMeters = (height + 40) * (panelsCount + panelsCount + 1) * windowsCount / 100;
          } else if (materialPerPiece >= 700 && materialPerPiece < 840) {
            purchaseMeters = (height + 40) * (panelsCount + panelsCount + panelsCount) * windowsCount / 100;
          }
        }

        const purchaseMetersStr = purchaseMeters.toFixed(2);

        if (!headerType) {
          return;
        }

        const itemTitle = item.variant.title || '';
        const fabricCodeMatch = itemTitle.match(/(\d+)-(\d+)/);
        let fabricCost = '';
        let fabricUnitPrice = '';

        if (fabricCodeMatch && purchaseMeters > 0) {
          const normalizedColorCode = parseInt(fabricCodeMatch[2], 10).toString();
          const fullCode = `${fabricCodeMatch[1]}-${normalizedColorCode}`;
          let priceInfo = fabricPricesMap[fullCode];
          
          if (!priceInfo && normalizedColorCode.length < 2) {
            const paddedCode = normalizedColorCode.padStart(2, '0');
            const paddedFullCode = `${fabricCodeMatch[1]}-${paddedCode}`;
            priceInfo = fabricPricesMap[paddedFullCode];
          }
          
          if (priceInfo) {
            fabricUnitPrice = priceInfo.fabricPrice.toFixed(2);
            const cost = purchaseMeters * priceInfo.fabricPrice;
            fabricCost = cost.toFixed(2);
          }
        }

        let liningUnitPrice = '';
        let liningCost = '';
        if (lining && liningPricesMap[lining]) {
          liningUnitPrice = liningPricesMap[lining].toFixed(2);
          const cost = purchaseMeters * liningPricesMap[lining];
          liningCost = cost.toFixed(2);
        }

        const fabricModel = fabricCodeMatch ? `${fabricCodeMatch[1]}-${parseInt(fabricCodeMatch[2], 10).toString()}` : (item.variant?.title || 'Default Title');

        const rowData = {
          '交货时间': validItemIndex === 0 ? deliveryTime : '',
          '订单编号': validItemIndex === 0 ? orderNumber : '',
          '备注': validItemIndex === 0 ? (order.note || '') : '',
          '评论': validItemIndex === 0 ? (commentsMap[order.id] || '') : '',
          '高温定型费用': validItemIndex === 0 ? (heatSettingFeeMap[order.id]?.toString() || '') : '',
          '布料型号': fabricModel,
          '布料采购米数': purchaseMetersStr,
          '布料单价': fabricUnitPrice || '-',
          '布料成本': fabricCost || '-',
          '衬布单价': liningUnitPrice || '-',
          '衬布成本': liningCost || '-',
          '加工方式': headerType || '',
          '布料高度': fabricHeight ? Math.round(parseFloat(fabricHeight)).toString() : '',
          '墙宽': wallWidth ? Math.round(parseFloat(wallWidth)).toString() : '',
          '每片用料': widthFromDimensions ? Math.round(parseFloat(widthFromDimensions)).toString() : '',
          '分片': panels,
          '倍数': multiplier,
          '窗户数量': windows,
          '是否定型': isShaped,
          '衬布': lining,
          '绑带': tiebacks,
          '加工': processing
        };

        excelData.push(rowData);
        validItemIndex++;
      });
    });

    // 创建工作簿
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '订单列表');

    // 下载文件
    let fileName = '批量导出订单';
    if (batchExportStartDate || batchExportEndDate) {
      const dateRange = `${batchExportStartDate || '起始'}至${batchExportEndDate || '现在'}`;
      fileName += `_${dateRange}`;
    }
    if (batchExportStatus !== 'all') {
      const statusLabels = {
        'pending': '待处理',
        'in_production': '生产中',
        'shipped': '已发货',
        'completed': '已完成'
      };
      fileName += `_${statusLabels[batchExportStatus] || batchExportStatus}`;
    }
    fileName += `_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // 导出Excel（选中的订单）
  const handleExportExcel = async () => {
    if (selectedOrders.size === 0) {
      alert('请先选择要导出的订单');
      return;
    }

    let selectedOrdersData = orders.filter(order => selectedOrders.has(order.id));
    
    // 应用日期筛选
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      selectedOrdersData = selectedOrdersData.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= start;
      });
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      selectedOrdersData = selectedOrdersData.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate <= end;
      });
    }
    
    // 应用自定义订单状态筛选
    if (customStatusFilter !== "all") {
      selectedOrdersData = selectedOrdersData.filter(order => {
        const orderId = order.id.replace('gid://shopify/Order/', '');
        const orderStatus = statusMap[orderId];
        return orderStatus === customStatusFilter;
      });
    }
    
    if (selectedOrdersData.length === 0) {
      alert('根据筛选条件没有找到符合的订单');
      return;
    }
    
    // 使用通用导出函数，但使用旧的文件名格式
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

    // 获取布料价格数据
    const fabricPricesMap = {};
    // 获取衬布价格数据
    const liningPricesMap = {};
    
    try {
      const fabricsResponse = await fetch('/api/fabric-prices');
      if (fabricsResponse.ok) {
        const { fabrics } = await fabricsResponse.json();
        fabrics.forEach(fabric => {
          fabric.colors.forEach(color => {
            const colorPrice = color.prices[0];
            const fabricPrice = fabric.prices[0];
            const effectivePrice = colorPrice || fabricPrice;
            fabricPricesMap[color.fullCode] = effectivePrice;
          });
        });
      }
      
      // 获取衬布价格
      const liningsResponse = await fetch('/api/lining-prices');
      if (liningsResponse.ok) {
        const { linings } = await liningsResponse.json();
        linings.forEach(lining => {
          liningPricesMap[lining.type] = lining.price;
        });
      }
    } catch (error) {
      console.error('获取价格失败:', error);
    }
    
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
          ? parseDimensions(item.customAttributes, item.quantity, item.title)
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

        // 从 customAttributes 提取衬布类型
        const liningTypeAttr = item.customAttributes?.find(
          attr => attr.key === '_Lining Type'
        );
        if (liningTypeAttr?.value) {
          const liningValue = liningTypeAttr.value.toLowerCase();
          // 如果是 unlined 或包含 lining type,则为无衬布,否则提取衬布类型名称
          if (liningValue === 'unlined' || liningValue.includes('lining type')) {
            lining = '';
          } else {
            // 提取括号前的部分作为衬布类型,去除价格信息
            lining = liningTypeAttr.value.split('(')[0].trim();
          }
        }

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

        // 从商品标题中提取布料编号（格式如 "Celina# 8823-02 Light Beige" 或 "Khaki 8823-5"）
        const itemTitle = item.variant.title || '';
        console.log(2222,item,item.title)
        // 匹配 "数字-数字" 格式，可能前面有文字
        const fabricCodeMatch = itemTitle.match(/(\d+)-(\d+)/);
        let fabricCost = '';
        let fabricUnitPrice = '';
        console.log(fabricCodeMatch, purchaseMeters)

        if (fabricCodeMatch && purchaseMeters > 0) {
          // 将颜色编号转为整数再转字符串，去掉前导零（05 -> 5）
          const normalizedColorCode = parseInt(fabricCodeMatch[2], 10).toString();
          const fullCode = `${fabricCodeMatch[1]}-${normalizedColorCode}`;
          console.log(11111, fabricPricesMap,fullCode)
          // 先尝试匹配标准化格式（8823-5）
          let priceInfo = fabricPricesMap[fullCode];
          
          // 如果没找到，尝试带前导零的格式（8823-05）
          if (!priceInfo && normalizedColorCode.length < 2) {
            const paddedCode = normalizedColorCode.padStart(2, '0');
            const paddedFullCode = `${fabricCodeMatch[1]}-${paddedCode}`;
            priceInfo = fabricPricesMap[paddedFullCode];
          }
          
          if (priceInfo) {
            // 布料单价（仅布料）
            fabricUnitPrice = priceInfo.fabricPrice.toFixed(2);
            
            // 布料成本 = 布料采购米数 * 布料单价
            const cost = purchaseMeters * priceInfo.fabricPrice;
            fabricCost = cost.toFixed(2);
          }
        }

        // 计算衬布成本
        let liningUnitPrice = '';
        let liningCost = '';
        if (lining && liningPricesMap[lining]) {
          liningUnitPrice = liningPricesMap[lining].toFixed(2);
          const cost = purchaseMeters * liningPricesMap[lining];
          liningCost = cost.toFixed(2);
        }

        // 处理布料型号：从商品标题提取（使用标准化的颜色编号）
        const fabricModel = fabricCodeMatch ? `${fabricCodeMatch[1]}-${parseInt(fabricCodeMatch[2], 10).toString()}` : (item.variant?.title || 'Default Title');

        // 如果是当前订单的第一个有效商品，显示订单信息；否则留空
        const rowData = {
          '交货时间': validItemIndex === 0 ? deliveryTime : '',
          '订单编号': validItemIndex === 0 ? orderNumber : '',
          '备注': validItemIndex === 0 ? (order.note || '') : '',
          '评论': validItemIndex === 0 ? (commentsMap[order.id] || '') : '',
          '高温定型费用': validItemIndex === 0 ? (heatSettingFeeMap[order.id]?.toString() || '') : '',
          '布料型号': fabricModel,
          '布料采购米数': purchaseMetersStr,
          '布料单价': fabricUnitPrice || '-',
          '布料成本': fabricCost || '-',
          '衬布单价': liningUnitPrice || '-',
          '衬布成本': liningCost || '-',
          '加工方式': headerType || '',
          '布料高度': fabricHeight ? Math.round(parseFloat(fabricHeight)).toString() : '',
          '墙宽': wallWidth ? Math.round(parseFloat(wallWidth)).toString() : '',
          '每片用料': widthFromDimensions ? Math.round(parseFloat(widthFromDimensions)).toString() : '',
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

    // 下载文件 - 文件名包含筛选条件
    let fileName = '订单列表';
    if (startDate || endDate) {
      const dateRange = `${startDate || '起始'}至${endDate || '现在'}`;
      fileName += `_${dateRange}`;
    }
    if (customStatusFilter !== 'all') {
      const statusLabels = {
        'pending': '待处理',
        'in_production': '生产中',
        'shipped': '已发货',
        'completed': '已完成'
      };
      fileName += `_${statusLabels[customStatusFilter] || customStatusFilter}`;
    }
    fileName += `_${new Date().toISOString().split('T')[0]}.xlsx`;
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


  // 处理标签操作结果
  useEffect(() => {
    if (tagFetcher.data?.success) {
      if (tagFetcher.data.orderTag) {
        // 添加标签成功
        const { orderId, tag } = tagFetcher.data.orderTag;
        setOrderTagsMap(prev => ({
          ...prev,
          [orderId]: [...(prev[orderId] || []), tag]
        }));
      }
      // 移除标签会在前端直接处理
    } else if (tagFetcher.data?.error) {
      alert(tagFetcher.data.error);
    }
  }, [tagFetcher.data]);

  const handleAddTag = (orderId, tagId) => {
    const formData = new FormData();
    formData.append("action", "addTag");
    formData.append("orderId", orderId);
    formData.append("tagId", tagId);
    tagFetcher.submit(formData, { method: "POST" });
  };

  const handleRemoveTag = (orderId, tagId) => {
    const formData = new FormData();
    formData.append("action", "removeTag");
    formData.append("orderId", orderId);
    formData.append("tagId", tagId);
    tagFetcher.submit(formData, { method: "POST" });
    
    // 立即更新本地状态
    setOrderTagsMap(prev => ({
      ...prev,
      [orderId]: (prev[orderId] || []).filter(t => t.id !== tagId)
    }));
  };

  const handleStatusChange = (orderId, newStatus) => {
    const currentNote = noteMap[orderId] || '';
    const formData = new FormData();
    formData.append("action", "updateStatus");
    formData.append("orderId", orderId);
    formData.append("status", newStatus);
    formData.append("note", currentNote);
    statusFetcher.submit(formData, { method: "POST" });
  };

  const handleNoteChange = (orderId, newNote) => {
    // 立即更新本地状态
    setNoteMap(prev => ({
      ...prev,
      [orderId]: newNote
    }));
  };

  const handleNoteBlur = (orderId) => {
    // 当失去焦点时保存到服务器
    const currentStatus = statusMap[orderId] || '';
    const currentNote = noteMap[orderId] || '';
    
    if (!currentStatus) {
      return; // 如果没有设置状态，不保存备注
    }
    
    const formData = new FormData();
    formData.append("action", "updateStatus");
    formData.append("orderId", orderId);
    formData.append("status", currentStatus);
    formData.append("note", currentNote);
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

  // 打开打印弹窗
  const handleOpenPrintModal = (orderId) => {
    setPrintOrderId(orderId);
    setPrintModalOpen(true);
    setParcelQuantity("1"); // 重置为默认值
    
    // 获取该订单的商品，过滤金额>0的商品并默认全选
    const order = orders.find(o => o.id === orderId);
    if (order?.lineItems?.edges) {
      const printableItems = order.lineItems.edges
        .filter(({ node }) => {
          const price = parseFloat(node.discountedUnitPriceSet?.shopMoney?.amount || node.variant?.price || 0);
          return price > 0;
        })
        .map(({ node }) => node.id);
      setSelectedLineItems(printableItems);
    } else {
      setSelectedLineItems([]);
    }
  };

  // 创建并打印运单
  const handlePrintOrder = () => {
    if (!printOrderId) return;
    
    const quantity = parseInt(parcelQuantity) || 1;
    if (quantity < 1 || quantity > 99) {
      shopify.toast.show("包裹数量必须在 1-99 之间", { isError: true });
      return;
    }
    
    if (selectedLineItems.length === 0) {
      shopify.toast.show("请至少选择一个商品", { isError: true });
      return;
    }
    
    setPrintingOrderId(printOrderId);
    setPrintModalOpen(false);
    
    const formData = new FormData();
    formData.append("action", "createAndPrint");
    formData.append("orderId", printOrderId);
    formData.append("parcelQuantity", quantity.toString());
    selectedLineItems.forEach(id => formData.append("lineItemIds[]", id));
    sfFetcher.submit(formData, { 
      method: "POST", 
      action: "/api/sf-express" 
    });
  };

  // 更新高温定型费用
  const handleUpdateHeatSettingFee = (orderId, value) => {
    const formData = new FormData();
    formData.append("action", "updateHeatSettingFee");
    formData.append("orderId", orderId);
    formData.append("fee", value);
    heatSettingFeeFetcher.submit(formData, { 
      method: "POST" 
    });
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
      '暂停生产': { status: 'critical', children: '暂停生产' },
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

  // 检测是否为小样订单（所有商品价格都是$1.99）
  const isSampleOrder = (lineItems) => {
    if (!lineItems?.edges || lineItems.edges.length === 0) {
      return false;
    }
    
    return lineItems.edges.every(({ node: item }) => {
      const price = parseFloat(item.variant?.price || '0');
      return price === 1.99;
    });
  };

  // 解析customAttributes中的尺寸信息并转换为厘米
  const parseDimensions = (customAttributes, quantity, title) => {
    if (!customAttributes || !Array.isArray(customAttributes)) {
      return null;
    }

    const dimensions = {};
    let isRomanShade = false; // 标记是否为罗马帘
    
    // 检查标题中是否包含Roman
    if (title && title.toLowerCase().includes('roman')) {
      isRomanShade = true;
    }
    
    // 头部名称映射表
    const headerMapping = {
      'Pinch Pleat - Double': '韩褶-L型-2折',
      'Pinch Pleat - Triple': '韩褶-L型-3折',
      'Euro Pleat - Double': '韩褶-7型-2折',
      'Euro Pleat - Triple': '韩褶-7型-3折',
      'Rod Pocket': '穿杆带遮轨',
      'Grommet Top': '打孔',
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
    
    // 临时存储 fraction 值和其他属性
    let widthFraction = 0;
    let heightFraction = 0;
    let tapeType = null; // 存储 Tape 类型
    let headerType = null; // 存储 Header 类型
    
    // 第一次遍历：收集 Tape 和 Header 信息
    customAttributes.forEach(attr => {
      const key = attr.key;
      const value = attr.value;
      
      if(key.includes('Tape')) {
        tapeType = value;
      }
      if(key.includes('Header')) {
        headerType = value.split('(')[0].trim();
      }
    });
    
    // 第二次遍历：处理所有属性
    customAttributes.forEach(attr => {
      const key = attr.key;
      const value = attr.value;
      
      // 检测罗马帘相关字段（仅当标题包含Roman时才处理）
      if(key.includes('Mount Type')) {
        dimensions.mountType = value.includes('Outside') ? '外装' : '内装';
      }
      if(key.includes('Lift Styles')) {
        const liftValue = value.split('(')[0].trim();
        dimensions.liftStyle = liftValue;
      }
      if(key.includes('Cord Position')) {
        dimensions.cordPosition = value === 'Right' ? '右侧' : value === 'Left' ? '左侧' : value;
      }
      
      // 窗帘相关字段
      if(key.includes('Header')) {
        const headerValue = value.split('(')[0].trim();
        // 特殊处理 Ripple Fold：根据 Tape 类型区分
        if (headerValue === 'Ripple Fold') {
          if (tapeType && tapeType.includes('Hook')) {
            dimensions.header = '蛇形帘（挂钩）';
          } else if (tapeType && tapeType.includes('Buckle')) {
            dimensions.header = '蛇形帘（铆钉）';
          } else {
            // 如果没有 Tape 信息，保持原样或使用默认值
            dimensions.header = '蛇形帘（铆钉）';
          }
        } else {
          dimensions.header = headerMapping[headerValue] || headerValue;
        }
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
      if(key.includes('Room')) {
        dimensions.room = value;
      }

      // 查找 Width Fraction 和 Height Fraction
      if (key.includes('Width Fraction')) {
        const fractionMatch = value.match(/(\d+)\/(\d+)/);
        if (fractionMatch) {
          widthFraction = parseFloat(fractionMatch[1]) / parseFloat(fractionMatch[2]);
        }
      }
      if (key.includes('Height Fraction')) {
        const fractionMatch = value.match(/(\d+)\/(\d+)/);
        if (fractionMatch) {
          heightFraction = parseFloat(fractionMatch[1]) / parseFloat(fractionMatch[2]);
        }
      }

      // 查找包含尺寸信息的属性
      if (key.includes('Width') || key.includes('Length') || key.includes('Height')) {
        // 提取数字部分 (英寸)
        const inchMatch = value.match(/(\d+(?:\.\d+)?)/);
        if (inchMatch) {
          const inches = parseFloat(inchMatch[1]);
          const centimeters = Math.round(inches * 2.54 * 100) / 100; // 转换为厘米，保留2位小数
          
          if (key.includes('Width') && !key.includes('Fraction')) {
            dimensions.width = centimeters;
          } else if ((key.includes('Length') || key.includes('Height')) && !key.includes('Fraction')) {
            dimensions.length = centimeters;
          }
        }
      }
    });
    
    // 将 fraction 转换为厘米并添加到主尺寸
    if (widthFraction > 0 && dimensions.width) {
      const fractionInCm = Math.round(widthFraction * 2.54 * 100) / 100;
      dimensions.width = Math.round((dimensions.width + fractionInCm) * 100) / 100;
    }
    if (heightFraction > 0 && dimensions.length) {
      const fractionInCm = Math.round(heightFraction * 2.54 * 100) / 100;
      dimensions.length = Math.round((dimensions.length + fractionInCm) * 100) / 100;
    }
    
    // 如果有尺寸信息，返回格式化的React元素
    if (dimensions.width || dimensions.length || dimensions.header || dimensions.tieback || dimensions.room || dimensions.liningType || dimensions.bodyMemory || isRomanShade) {
      const parts = [];
      parts.push(`数量: ${quantity}`);
      
      // 罗马帘特有信息
      if(isRomanShade) {
        parts.push(`类型: 罗马帘`);
        if(dimensions.mountType) parts.push(`安装方式: ${dimensions.mountType}`);
        if(dimensions.liftStyle) parts.push(`升降方式: ${dimensions.liftStyle}`);
        if(dimensions.cordPosition) parts.push(`绳位: ${dimensions.cordPosition}`);
      }
      
      // 窗帘头部信息
      if(dimensions.header) {
        let headerText = dimensions.header;
        if (dimensions.grommetColor) {
          headerText += `（${dimensions.grommetColor}）`;
        }
        parts.push(`头部: ${headerText}`);
      }
      
      // 尺寸信息
      if (dimensions.width) parts.push(`宽: ${dimensions.width}cm`);
      if (dimensions.length) parts.push(`高: ${dimensions.length}cm`);
      
      // 其他信息
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

  // 根据标签和支付状态筛选（前端过滤）
  const displayedOrders = orders.filter(order => {
    // 标签筛选
    if (tagFilter && tagFilter !== 'all') {
      const orderId = order.id.replace('gid://shopify/Order/', '');
      const tags = orderTagsMap[orderId] || [];
      if (!tags.some(t => t.id === tagFilter)) return false;
    }
    
    // 支付状态筛选
    if (financialFilter && financialFilter !== 'all') {
      if (order.displayFinancialStatus !== financialFilter) return false;
    }
    
    return true;
  });

  const rows = displayedOrders.map((order) => {
    const orderId = order.id.replace('gid://shopify/Order/', '');
    
    // 如果Shopify发货状态是已发货，则默认状态为已发货
    const defaultStatus = order.displayFulfillmentStatus === 'FULFILLED' ? '已发货' : '';
    
    // 获取所有商品的尺寸信息
    const allItemsDimensions = order.lineItems?.edges?.map(({ node: item }, index) => {
      const dimensions = item.customAttributes 
        ? parseDimensions(item.customAttributes, item.quantity, item.title)
        : null;
      
      if (!dimensions) return null;
      
      // 状态优先使用数据库中存储的，如果为空则使用默认值
      const itemKey = `${orderId}:${item.id}`;
      const currentStatus = statusMap[itemKey] || defaultStatus;
      const currentNote = noteMap[itemKey] || '';
      
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
          <div style={{ marginTop: '8px', maxWidth: '220px' }}>
            <Select
              label=""
              options={[
                { label: '未设置', value: '' },
                { label: '待生产', value: '待生产' },
                { label: '生产中', value: '生产中' },
                { label: '暂停生产', value: '暂停生产' },
                { label: '待发货', value: '待发货' },
                { label: '已发货', value: '已发货' },
              ]}
              value={currentStatus}
              onChange={(value) => handleStatusChange(itemKey, value)}
            />
          </div>
          <div style={{ marginTop: '8px', maxWidth: '220px' }}>
            <TextField
              label=""
              value={currentNote}
              onChange={(value) => handleNoteChange(itemKey, value)}
              onBlur={() => handleNoteBlur(itemKey)}
              placeholder="添加备注..."
              autoComplete="off"
              multiline={3}
            />
          </div>
        </div>
      );
    }).filter(Boolean);

    const orderTags = orderTagsMap[orderId] || [];

  return [
      <Checkbox
        key={`checkbox-${order.id}`}
        checked={selectedOrders.has(order.id)}
        onChange={(checked) => handleOrderSelect(order.id, checked)}
        label=""
      />,
      <div key={`order-name-${order.id}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{order.name}</span>
        {isSampleOrder(order.lineItems) && (
          <Badge tone="info">小样订单</Badge>
        )}
      </div>,
      <div key={`tags-${order.id}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '150px' }}>
        {orderTags.map(tag => (
          <div key={tag.id} style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: tag.color + '20',
            border: `1px solid ${tag.color}`,
            fontSize: '0.75rem'
          }}>
            <span style={{ color: tag.color, fontWeight: '500' }}>{tag.name}</span>
            <button
              onClick={() => handleRemoveTag(orderId, tag.id)}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: tag.color, 
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1
              }}
              title="移除标签"
            >
              ×
            </button>
          </div>
        ))}
        {allTags.length > 0 && (
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleAddTag(orderId, e.target.value);
                e.target.value = '';
              }
            }}
            style={{ 
              fontSize: '0.75rem',
              padding: '2px 4px',
              borderRadius: '3px',
              border: '1px solid #ccc',
              cursor: 'pointer'
            }}
          >
            <option value="">+ 添加</option>
            {allTags.filter(t => !orderTags.find(ot => ot.id === t.id)).map(tag => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        )}
      </div>,
      renderLineItems(order.lineItems),
      allItemsDimensions && allItemsDimensions.length > 0 
        ? <div>{allItemsDimensions}</div>
        : '无尺寸信息',
      <div key={`custom-status-${order.id}`} style={{ minWidth: '120px' }}>—</div>,
      <Badge {...getStatusBadge(order.displayFulfillmentStatus)} />,
      <div key={`fulfillment-time-${order.id}`} style={{ minWidth: '150px' }}>
        {order.fulfillments && order.fulfillments.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {order.fulfillments.map((fulfillment, idx) => (
              <div key={fulfillment.id || idx} style={{ fontSize: '0.875rem' }}>
                <div>{formatDate(fulfillment.createdAt)}</div>
                {fulfillment.trackingInfo && fulfillment.trackingInfo.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#6d7175' }}>
                    {fulfillment.trackingInfo[0].company}: {fulfillment.trackingInfo[0].number}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span>-</span>
        )}
      </div>,
      <Badge {...getStatusBadge(order.displayFinancialStatus)} />,
      <div style={{ maxWidth: '200px', wordWrap: 'break-word' }}>
        {order.note || '-'}
      </div>,
      formatDate(order.createdAt),
      // 高温定型费用列
      <div style={{ minWidth: '120px' }}>
        <TextField
          value={heatSettingFeeMap[order.id]?.toString() || ""}
          onChange={(value) => {
            // 实时更新本地状态
            setHeatSettingFeeMap(prev => ({
              ...prev,
              [order.id]: value === "" ? null : parseFloat(value) || 0
            }));
          }}
          onBlur={(e) => {
            // 失焦时保存到数据库
            const value = e.target.value;
            handleUpdateHeatSettingFee(order.id, value);
          }}
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          autoComplete="off"
        />
      </div>,
      // 运单信息列
      waybillMap[order.id] ? (
        <div style={{ minWidth: '150px' }}>
          <div style={{ marginBottom: '4px' }}>
            <Text variant="bodyMd" as="span" fontWeight="bold">
              {waybillMap[order.id].waybillNo}
            </Text>
          </div>
          <ButtonGroup variant="segmented">
            {waybillMap[order.id].labelUrl && (
              <Button
                size="micro"
                onClick={() => window.open(waybillMap[order.id].labelUrl, '_blank')}
              >
                面单
              </Button>
            )}
            {waybillMap[order.id].invoiceUrl && (
              <Button
                size="micro"
                onClick={() => window.open(waybillMap[order.id].invoiceUrl, '_blank')}
              >
                发票
              </Button>
            )}
          </ButtonGroup>
        </div>
      ) : (
        <span>-</span>
      ),
      <ButtonGroup key={`actions-${order.id}`}>
        <Button
          size="slim"
          onClick={() => handleOpenPrintModal(order.id)}
          loading={printingOrderId === order.id}
          variant="primary"
        >
          {waybillMap[order.id] ? '重新打印' : '打印运单'}
        </Button>
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
      checked={selectedOrders.size === displayedOrders.length && displayedOrders.length > 0}
      onChange={handleSelectAll}
      label=""
    />,
    '订单号',
    '标签',
    '商品信息',
    '尺寸(cm)',
    '订单状态',
    '发货状态',
    '发货时间',
    '支付状态',
    '备注',
    '创建时间',
    '高温定型费用',
    '运单信息',
    '操作',
  ];

  return (
    <Page>
      <style dangerouslySetInnerHTML={{__html: `
        .Polaris-Page {
          max-width: 100% !important;
        }
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
                <InlineStack gap="300" wrap={true}>
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
                    label="发货状态"
                    options={[
                      { label: '全部发货状态', value: 'all' },
                      { label: '已发货', value: 'FULFILLED' },
                      { label: '未发货', value: 'UNFULFILLED' },
                    ]}
                    value={statusFilter}
                    onChange={setStatusFilter}
                  />
                  <Select
                    label="标签筛选"
                    options={[{ label: '所有标签', value: 'all' }, ...allTags.map(t => ({ label: t.name, value: t.id }))]}
                    value={tagFilter}
                    onChange={setTagFilter}
                  />
                  <Select
                    label="支付状态"
                    options={[
                      { label: '全部支付状态', value: 'all' },
                      { label: '已支付', value: 'PAID' },
                      { label: '待支付', value: 'PENDING' },
                      { label: '部分支付', value: 'PARTIALLY_PAID' },
                      { label: '已退款', value: 'REFUNDED' },
                      { label: '已取消', value: 'VOIDED' },
                    ]}
                    value={financialFilter}
                    onChange={setFinancialFilter}
                  />
                  <Select
                    label="订单状态"
                    options={[
                      { label: '全部订单状态', value: 'all' },
                      { label: '待处理', value: 'pending' },
                      { label: '生产中', value: 'in_production' },
                      { label: '已发货', value: 'shipped' },
                      { label: '已完成', value: 'completed' },
                    ]}
                    value={customStatusFilter}
                    onChange={setCustomStatusFilter}
                  />
                  <TextField
                    label="开始日期"
                    type="date"
                    value={startDate}
                    onChange={setStartDate}
                    autoComplete="off"
                  />
                  <TextField
                    label="结束日期"
                    type="date"
                    value={endDate}
                    onChange={setEndDate}
                    autoComplete="off"
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
                    导出选中订单
                  </Button>
                  <Button 
                    onClick={() => setShowBatchExportModal(true)}
                    tone="success"
                  >
                    批量导出订单
                  </Button>
                  <Button 
                    onClick={handleExportStockList}
                    disabled={selectedOrders.size === 0}
                    tone="critical"
                  >
                    导出备货单
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
              ) : displayedOrders.length > 0 ? (
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

      {/* 打印运单 Modal */}
      <Modal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="打印顺丰运单"
        primaryAction={{
          content: '确认打印',
          onAction: handlePrintOrder,
          loading: printingOrderId !== null,
        }}
        secondaryActions={[
          {
            content: '取消',
            onAction: () => setPrintModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text variant="bodyMd">
              请输入需要打印的包裹数量：
            </Text>
            <TextField
              label="包裹数量"
              type="number"
              value={parcelQuantity}
              onChange={setParcelQuantity}
              min={1}
              max={99}
              autoComplete="off"
              helpText="输入 1-99 之间的数字，默认为 1"
            />
            
            {/* 商品选择区 */}
            {printOrderId && (() => {
              const order = orders.find(o => o.id === printOrderId);
              const printableItems = order?.lineItems?.edges?.filter(({ node }) => {
                const price = parseFloat(node.discountedUnitPriceSet?.shopMoney?.amount || node.variant?.price || 0);
                return price > 0;
              }) || [];
              
              return printableItems.length > 0 ? (
                <BlockStack gap="300">
                  <Text variant="headingSm">选择要打印的商品：</Text>
                  <BlockStack gap="200">
                    {printableItems.map(({ node: item }) => (
                      <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedLineItems.includes(item.id)}
                          onChange={e => {
                            setSelectedLineItems(ids =>
                              e.target.checked
                                ? [...ids, item.id]
                                : ids.filter(id => id !== item.id)
                            );
                          }}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                        <span>{item.title}（数量: {item.quantity}）</span>
                      </label>
                    ))}
                  </BlockStack>
                </BlockStack>
              ) : null;
            })()}
          </BlockStack>
        </Modal.Section>
      </Modal>

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

      {/* 批量导出对话框 */}
      <Modal
        open={showBatchExportModal}
        onClose={() => {
          setShowBatchExportModal(false);
          setBatchExportStartDate("");
          setBatchExportEndDate("");
          setBatchExportStatus("all");
        }}
        title="批量导出订单"
        primaryAction={{
          content: '导出',
          onAction: handleBatchExport,
          loading: batchExporting,
        }}
        secondaryActions={[
          {
            content: '取消',
            onAction: () => {
              setShowBatchExportModal(false);
              setBatchExportStartDate("");
              setBatchExportEndDate("");
              setBatchExportStatus("all");
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text variant="bodyMd">
              选择时间范围和订单状态，导出所有符合条件的订单
            </Text>
            <TextField
              label="开始日期"
              type="date"
              value={batchExportStartDate}
              onChange={setBatchExportStartDate}
              autoComplete="off"
              helpText="留空表示不限制开始时间"
            />
            <TextField
              label="结束日期"
              type="date"
              value={batchExportEndDate}
              onChange={setBatchExportEndDate}
              autoComplete="off"
              helpText="留空表示不限制结束时间"
            />
            <Select
              label="订单状态"
              options={[
                { label: '全部订单状态', value: 'all' },
                { label: '待处理', value: 'pending' },
                { label: '生产中', value: 'in_production' },
                { label: '已发货', value: 'shipped' },
                { label: '已完成', value: 'completed' },
              ]}
              value={batchExportStatus}
              onChange={setBatchExportStatus}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
