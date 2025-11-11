import { useState, useEffect, useMemo } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { redirect, json } from "@remix-run/node";
import styles from "./_index/styles.module.css";
import * as XLSX from 'xlsx';

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const sessionParam = url.searchParams.get("session");
  
  // 检查是否有会话信息
  let userSession = null;
  if (sessionParam) {
    try {
      userSession = JSON.parse(decodeURIComponent(sessionParam));
    } catch (error) {
      console.log("Invalid session data");
    }
  }

  // 如果没有会话，重定向到登录页面
  if (!userSession) {
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname)}`);
  }

  // 动态导入服务器端模块
  const { getOrdersFromCache } = await import("../services/cache.server");
  const prisma = (await import("../db.server")).default;
  
  // 从缓存获取数据
  const cacheData = await getOrdersFromCache();
  
  // 调试信息
  console.log('🔍 Public页面读取缓存:', {
    有缓存: !!cacheData,
    订单数量: cacheData?.orders?.length || 0,
    时间戳: cacheData?.timestamp
  });
  
  // 获取所有订单的自定义状态和备注
  const orderStatuses = await prisma.orderStatus.findMany();
  const statusMap = {};
  const noteMap = {};
  orderStatuses.forEach(status => {
    const key = status.lineItemId ? `${status.orderId}:${status.lineItemId}` : status.orderId;
    statusMap[key] = status.status;
    noteMap[key] = status.note || '';
  });
  
  // 确保预设标签存在
  const presetTags = [
    { name: '小样', color: '#3b82f6', description: '小样订单（价格$1.99）' },
    { name: '罗马帘', color: '#8b5cf6', description: '包含罗马帘产品' },
    { name: '布帘', color: '#10b981', description: '包含布帘产品' },
    { name: '硬件', color: '#f59e0b', description: '包含硬件产品' },
  ];
  
  for (const presetTag of presetTags) {
    const existing = await prisma.tag.findUnique({
      where: { name: presetTag.name }
    });
    
    if (!existing) {
      await prisma.tag.create({
        data: presetTag
      });
    }
  }
  
  // 获取所有标签
  const allTags = await prisma.tag.findMany({
    orderBy: { name: 'asc' }
  });
  
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
  const orderTagsMap = {};
  orderTags.forEach(ot => {
    if (!orderTagsMap[ot.orderId]) {
      orderTagsMap[ot.orderId] = [];
    }
    orderTagsMap[ot.orderId].push(ot.tag);
  });
  
  // 如果有缓存数据，自动为订单打标签
  if (cacheData && cacheData.orders) {
    for (const order of cacheData.orders) {
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
          } catch (error) {
            // 如果已存在则忽略（P2002 unique constraint violation）
            if (error.code !== 'P2002') {
              console.error(`Error adding tag ${tagName} to order ${orderId}:`, error);
            }
          }
        }
      }
    }
  }
  
  if (cacheData) {
    return {
      orders: cacheData.orders,
      pageInfo: cacheData.pageInfo,
      statusMap,
      noteMap,
      allTags,
      orderTagsMap,
      fromCache: true,
      publicAccess: true,
      userSession,
      cacheTimestamp: cacheData.timestamp || new Date().toISOString()
    };
  }

  // 如果没有缓存数据，返回空数据
  return {
    orders: [],
    pageInfo: null,
    allTags: [],
    orderTagsMap: {},
    fromCache: false,
    publicAccess: true,
    noCache: true,
    userSession
  };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");

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

  if (action === "refresh") {
    // 动态导入服务器端模块
    const { getOrdersFromCache } = await import("../services/cache.server");
    const prisma = (await import("../db.server")).default;
    
    // 尝试从缓存获取最新数据
    const cacheData = await getOrdersFromCache();
    
    // 获取所有订单的自定义状态和备注
    const orderStatuses = await prisma.orderStatus.findMany();
    const statusMap = {};
    const noteMap = {};
    orderStatuses.forEach(status => {
      const key = status.lineItemId ? `${status.orderId}:${status.lineItemId}` : status.orderId;
      statusMap[key] = status.status;
      noteMap[key] = status.note || '';
    });
    
    if (cacheData) {
      return json({
        orders: cacheData.orders,
        pageInfo: cacheData.pageInfo,
        statusMap,
        noteMap,
        fromCache: true,
        cacheTimestamp: cacheData.timestamp || new Date().toISOString()
      });
    }
  }

  if (action === "updateStatus") {
    const prisma = (await import("../db.server")).default;
    
    const orderKey = formData.get("orderId");
    const status = formData.get("status");
    const note = formData.get("note") || null;

    if (!orderKey || !status) {
      return json({ error: "缺少必要参数" }, { status: 400 });
    }

    let orderId = orderKey;
    let lineItemId = null;
    if (orderKey.includes(':')) {
      const parts = orderKey.split(':');
      orderId = parts[0];
      lineItemId = parts.slice(1).join(':');
    }

    try {
      const existing = await prisma.orderStatus.findFirst({ where: { orderId, lineItemId } });
      let orderStatus;
      if (existing) {
        orderStatus = await prisma.orderStatus.update({ where: { id: existing.id }, data: { status, note } });
      } else {
        orderStatus = await prisma.orderStatus.create({ data: { orderId, lineItemId, status, note } });
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

  return json({ error: "未知操作" }, { status: 400 });
};

export default function PublicOrders() {
  const { orders: initialOrders, pageInfo: initialPageInfo, noCache, userSession, statusMap: initialStatusMap, noteMap: initialNoteMap, allTags: initialTags, orderTagsMap: initialOrderTagsMap, cacheTimestamp: initialCacheTimestamp } = useLoaderData();
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  const tagFetcher = useFetcher();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [statusMap, setStatusMap] = useState(initialStatusMap || {});
  const [noteMap, setNoteMap] = useState(initialNoteMap || {});
  const [allTags, setAllTags] = useState(initialTags || []);
  const [orderTagsMap, setOrderTagsMap] = useState(initialOrderTagsMap || {});
  const [tagFilter, setTagFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customStatusFilter, setCustomStatusFilter] = useState([]); // lineItem自定义状态筛选（多选）
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [financialFilter, setFinancialFilter] = useState("PAID");
  const [sortOrder, setSortOrder] = useState("desc"); // desc: 最新在前, asc: 最早在前
  const [isLoading, setIsLoading] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState(initialCacheTimestamp);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  
  // 分页设置
  const itemsPerPage = 100;
  
  // 解析customAttributes中的尺寸信息的辅助函数
  const parseDimensions = (customAttributes, quantity, title) => {
    if (!customAttributes || !Array.isArray(customAttributes)) return null;
    const dimensions = {};
    let isRomanShade = false; // 标记是否为罗马帘
    
    // 检查标题中是否包含Roman
    if (title && title.toLowerCase().includes('roman')) {
      isRomanShade = true;
    }
    
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
    
    const grommetColorMapping = {
      'Black': '黑色',
      'Silver': '银色',
      'Bronze': '青铜色',
      'Gold': '金色'
    };
    
    const liningTypeMapping = {
      'White_Shading Rate 100%': '漂白春亚纺1#',
      'White_Shading Rate 30%': '18-1',
      'Beige_Shading Rate 50%': 'A60-2',
      'Black_Shading Rate 80%': 'A60-28',
      'Black_Shading Rate 100%': '2019-18'
    };
    
    // 临时存储 fraction 值
    let widthFraction = 0;
    let heightFraction = 0;
    
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
      
      if (key.includes('Width') || key.includes('Length') || key.includes('Height')) {
        const inchMatch = value.match(/(\d+(?:\.\d+)?)/);
        if (inchMatch) {
          const inches = parseFloat(inchMatch[1]);
          const centimeters = Math.round(inches * 2.54 * 100) / 100;
          
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
    
    if (dimensions.width || dimensions.length || dimensions.header || dimensions.tieback || dimensions.room || dimensions.liningType || dimensions.bodyMemory || dimensions.mountType || dimensions.liftStyle || dimensions.cordPosition) {
      return { dimensions, isRomanShade };
    }
    
    return null;
  };
  
  // 检查订单是否有尺寸信息
  const orderHasDimensions = (order) => {
    if (!order.lineItems?.edges) return false;
    
    for (const { node: item } of order.lineItems.edges) {
      const result = item.customAttributes 
        ? parseDimensions(item.customAttributes, item.quantity, item.title)
        : null;
      
      const dimensions = result?.dimensions;
      
      if (dimensions) {
        return true;
      }
    }
    
    return false;
  };
  
  // 使用 useMemo 过滤有尺寸信息的订单，并添加发货状态筛选
  const ordersWithDimensions = useMemo(() => {
    let filteredOrders = orders.filter(order => orderHasDimensions(order));
    
    // 应用订单号搜索
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filteredOrders = filteredOrders.filter(order => {
        // 移除订单号前缀 # 进行匹配
        const orderNumber = order.name.replace('#', '').toLowerCase();
        return orderNumber.includes(query.replace('#', ''));
      });
    }
    
    // 应用发货状态筛选
    if (fulfillmentFilter !== "all") {
      filteredOrders = filteredOrders.filter(order => 
        order.displayFulfillmentStatus === fulfillmentFilter
      );
    }

    // 应用支付状态筛选
    if (financialFilter !== "all") {
      filteredOrders = filteredOrders.filter(order => 
        order.displayFinancialStatus === financialFilter
      );
    }

    // 应用标签筛选（前端）
    if (tagFilter && tagFilter !== 'all') {
      filteredOrders = filteredOrders.filter(order => {
        const orderId = order.id.replace('gid://shopify/Order/', '');
        const tags = orderTagsMap[orderId] || [];
        return tags.some(t => t.id === tagFilter);
      });
    }
    
    // 应用lineItem自定义状态筛选（多选）
    if (customStatusFilter && customStatusFilter.length > 0) {
      filteredOrders = filteredOrders.filter(order => {
        const orderId = order.id.replace('gid://shopify/Order/', '');
        // 如果Shopify发货状态是已发货，则强制状态为已发货
        const isFulfilled = order.displayFulfillmentStatus === 'FULFILLED';
        
        // 检查订单中是否有任何lineItem匹配选中的状态
        return order.lineItems?.edges?.some(({ node: item }) => {
          const itemKey = `${orderId}:${item.id}`;
          // 如果订单已发货，强制状态为"已发货"；否则使用数据库中存储的状态，空值默认为"待生产"
          const itemStatus = isFulfilled ? '已发货' : (statusMap[itemKey] || '待生产');
          return customStatusFilter.includes(itemStatus);
        });
      });
    }
    
    // 按创建时间排序
    filteredOrders.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
    
    return filteredOrders;
  }, [orders, searchQuery, fulfillmentFilter, financialFilter, tagFilter, customStatusFilter, orderTagsMap, statusMap, sortOrder]);
  
  const totalPages = Math.ceil(ordersWithDimensions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentOrders = ordersWithDimensions.slice(startIndex, endIndex);

  // 处理刷新结果
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
      if (fetcher.data.cacheTimestamp) {
        setCacheTimestamp(fetcher.data.cacheTimestamp);
      }
      setIsLoading(false);
    }
  }, [fetcher.data]);

  // 处理状态更新结果
  useEffect(() => {
    if (statusFetcher.data?.success) {
      const { orderStatus } = statusFetcher.data;
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
        ? '数据库需要迁移：请联系管理员运行 node scripts/migrate-add-note-node.js'
        : `更新失败: ${statusFetcher.data.details || statusFetcher.data.error}`;
      
      alert(errorMsg);
      console.error('状态更新失败:', statusFetcher.data);
    }
  }, [statusFetcher.data]);

  const handleRefresh = () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("action", "refresh");
    fetcher.submit(formData, { method: "POST" });
  };

  const handleLogout = () => {
    // 清除会话并重定向到登录页面
    window.location.href = "/login";
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
    setNoteMap(prev => ({
      ...prev,
      [orderId]: newNote
    }));
  };

  const handleNoteBlur = (orderId) => {
    const currentStatus = statusMap[orderId] || '';
    const currentNote = noteMap[orderId] || '';
    
    if (!currentStatus) {
      return;
    }
    
    const formData = new FormData();
    formData.append("action", "updateStatus");
    formData.append("orderId", orderId);
    formData.append("status", currentStatus);
    formData.append("note", currentNote);
    statusFetcher.submit(formData, { method: "POST" });
  };

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

  const handleSelectAll = (checked) => {
    if (checked) {
      const allOrderIds = currentOrders.map(order => order.id);
      setSelectedOrders(new Set(allOrderIds));
    } else {
      setSelectedOrders(new Set());
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleExportExcel = () => {
    if (selectedOrders.size === 0) {
      alert('请先选择要导出的订单');
      return;
    }

    const selectedOrdersData = orders.filter(order => selectedOrders.has(order.id));
    
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
        let widthFromDimensions = '';
        let headerType = '';
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
        windows = '1';
        processing = 'freshine';
        
        // 根据头部类型设置倍数
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

        // 计算采购米数和墙宽
        const height = parseFloat(fabricHeight) || 0;
        const materialPerPiece = parseFloat(widthFromDimensions) || 0;
        const panelsCount = quantity;
        const windowsCount = 1;
        const multiplierNum = parseFloat(multiplier) || 2.5;
        
        // 墙宽公式：每片用料/倍数*分片数
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

        // 过滤掉没有加工方式（头部类型）的商品
        if (!headerType) {
          return;
        }

        // 处理布料型号：去掉字母，只保留数字和符号
        const fabricModel = item.variant?.title || 'Default Title';
        const fabricModelFiltered = fabricModel;

        // 如果是当前订单的第一个有效商品，显示订单信息；否则留空
        const rowData = {
          '交货时间': validItemIndex === 0 ? deliveryTime : '',
          '订单编号': validItemIndex === 0 ? orderNumber : '',
          '备注': validItemIndex === 0 ? (order.note || '') : '',
          '布料型号': fabricModelFiltered,
          '布料采购米数': purchaseMetersStr,
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
        validItemIndex++;
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

  const getStatusBadge = (status) => {
    const statusMap = {
      'FULFILLED': { className: 'status-success', text: '已发货' },
      'UNFULFILLED': { className: 'status-warning', text: '未发货' },
      'PARTIALLY_FULFILLED': { className: 'status-attention', text: '部分发货' },
      'PAID': { className: 'status-success', text: '已支付' },
      'PENDING': { className: 'status-warning', text: '待支付' },
      'PARTIALLY_PAID': { className: 'status-attention', text: '部分支付' },
      'REFUNDED': { className: 'status-info', text: '已退款' },
      'VOIDED': { className: 'status-critical', text: '已取消' },
    };
    
    return statusMap[status] || { className: 'status-info', text: status };
  };

  const getCustomStatusBadge = (status) => {
    const badgeMap = {
      '待生产': { className: 'status-info', text: '待生产' },
      '生产中': { className: 'status-warning', text: '生产中' },
      '暂停生产': { className: 'status-critical', text: '暂停生产' },
      '定型中': { className: 'status-attention', text: '定型中' },
      '待检验': { className: 'status-attention', text: '待检验' },
      '已发货': { className: 'status-success', text: '已发货' },
    };
    
    return badgeMap[status] || { className: 'status-default', text: status || '未设置' };
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

  const formatCacheTime = (timestamp) => {
    if (!timestamp) return '未知';
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 渲染尺寸信息的函数
  const renderDimensions = (dimensions, quantity, isRomanShade) => {
    if (!dimensions) return null;
    
    const parts = [];
    parts.push(`数量: ${quantity}`);
    
    // 罗马帘特定字段
    if (isRomanShade) {
      parts.push(`类型: 罗马帘`);
      if (dimensions.mountType) parts.push(`安装方式: ${dimensions.mountType}`);
      if (dimensions.width) parts.push(`宽: ${dimensions.width}cm`);
      if (dimensions.length) parts.push(`高: ${dimensions.length}cm`);
      if (dimensions.liftStyle) parts.push(`升降方式: ${dimensions.liftStyle}`);
      if (dimensions.cordPosition) parts.push(`绳位: ${dimensions.cordPosition}`);
    } else {
      // 窗帘特定字段
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
    }
    
    if(dimensions.room) parts.push(`房间: ${dimensions.room}`);
    
    return (
      <div style={{ lineHeight: '1.4', maxWidth:'400px' }}>
        {parts.map((part, index) => (
          <div style={{ whiteSpace: 'normal' }} key={index}>{part}</div>
        ))}
      </div>
    );
  };

  // 解析并渲染尺寸信息的完整函数（供表格使用）
  const parseAndRenderDimensions = (customAttributes, quantity, title) => {
    const result = parseDimensions(customAttributes, quantity, title);
    if (!result) return null;
    return renderDimensions(result.dimensions, quantity, result.isRomanShade);
  };

  return (
    <div className={styles.index}>
      <style dangerouslySetInnerHTML={{__html: `
        .${styles.ordersTable} thead th {
          position: sticky !important;
          top: 0 !important;
          z-index: 10 !important;
          background-color: #f6f6f7 !important;
          box-shadow: 0 2px 2px -1px rgba(0, 0, 0, 0.05) !important;
        }
        .${styles.tableContainer} {
          max-height: 1000px !important;
          overflow-y: auto !important;
        }
      `}} />
      <div className={styles.content}>
        {/* 用户信息 */}
        {userSession && (
          <div className={styles.userInfo}>
            <span>欢迎，{userSession.username}</span>
            <span className={styles.userBadge}>{userSession.role === 'admin' ? '管理员' : '查看者'}</span>
            <button onClick={handleLogout} className={styles.logoutButton}>
              登出
            </button>
          </div>
        )}

        {/* 页面标题和状态 */}
        <div className={styles.ordersSection}>
          <div className={styles.sectionHeader}>
            <h1 className={styles.heading}>订单管理 - 公开访问</h1>
            <div className={styles.headerActions}>
              <span className={styles.badge}>已登录访问</span>
              {noCache && (
                <span className={`${styles.badge} ${styles.statusWarning}`}>暂无缓存数据</span>
              )}
            </div>
          </div>

          {/* 操作按钮和缓存信息 */}
          <div className={styles.actionsSection}>
            <div className={styles.cacheInfo}>
              <span className={styles.cacheTimestamp}>
                订单数据更新时间: {formatCacheTime(cacheTimestamp)}
              </span>
            </div>
          </div>

          {/* 筛选控件 */}
          <div className={styles.filtersSection} style={{ 
            marginBottom: '20px', 
            padding: '16px', 
            backgroundColor: '#f6f6f7', 
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {/* 第一行：基础筛选 */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="searchQuery" style={{ fontWeight: '500' }}>订单号：</label>
                <input
                  id="searchQuery"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="输入订单号（如：1001）"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: '1px solid #c4cdd5',
                    fontSize: '14px',
                    minWidth: '180px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="fulfillmentFilter" style={{ fontWeight: '500' }}>发货状态：</label>
                <select 
                  id="fulfillmentFilter"
                  value={fulfillmentFilter}
                  onChange={(e) => {
                    setFulfillmentFilter(e.target.value);
                    setCurrentPage(1); // 重置到第一页
                  }}
                  style={{ 
                    padding: '6px 12px', 
                    borderRadius: '4px', 
                    border: '1px solid #c4cdd5',
                    fontSize: '14px',
                    minWidth: '150px'
                  }}
                >
                  <option value="all">全部</option>
                  <option value="FULFILLED">已发货</option>
                  <option value="UNFULFILLED">未发货</option>
                  <option value="PARTIALLY_FULFILLED">部分发货</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="financialFilter" style={{ fontWeight: '500' }}>支付状态：</label>
                <select 
                  id="financialFilter"
                  value={financialFilter}
                  onChange={(e) => {
                    setFinancialFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ 
                    padding: '6px 12px', 
                    borderRadius: '4px', 
                    border: '1px solid #c4cdd5',
                    fontSize: '14px',
                    minWidth: '150px'
                  }}
                >
                  <option value="all">全部</option>
                  <option value="PAID">已支付</option>
                  <option value="PENDING">待支付</option>
                  <option value="PARTIALLY_PAID">部分支付</option>
                  <option value="REFUNDED">已退款</option>
                  <option value="VOIDED">已取消</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="tagFilter" style={{ fontWeight: '500' }}>标签：</label>
                <select
                  id="tagFilter"
                  value={tagFilter}
                  onChange={(e) => { setTagFilter(e.target.value); setCurrentPage(1); }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: '1px solid #c4cdd5',
                    fontSize: '14px',
                    minWidth: '180px'
                  }}
                >
                  <option value="all">所有标签</option>
                  {allTags.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="sortOrder" style={{ fontWeight: '500' }}>排序：</label>
                <select
                  id="sortOrder"
                  value={sortOrder}
                  onChange={(e) => { setSortOrder(e.target.value); setCurrentPage(1); }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: '1px solid #c4cdd5',
                    fontSize: '14px',
                    minWidth: '150px'
                  }}
                >
                  <option value="desc">最新在前</option>
                  <option value="asc">最早在前</option>
                </select>
              </div>
            </div>
            
            {/* 第二行：订单状态多选和清除按钮 */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontWeight: '500' }}>订单状态：</label>
                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  padding: '6px 12px',
                  backgroundColor: '#fff',
                  border: '1px solid #c4cdd5',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}>
                  {['待生产', '生产中', '暂停生产', '定型中', '待检验', '已发货'].map(status => (
                    <label key={status} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={customStatusFilter.includes(status)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCustomStatusFilter([...customStatusFilter, status]);
                          } else {
                            setCustomStatusFilter(customStatusFilter.filter(s => s !== status));
                          }
                          setCurrentPage(1);
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{status}</span>
                    </label>
                  ))}
                </div>
              </div>
              {(searchQuery || fulfillmentFilter !== "all" || financialFilter !== "all" || tagFilter !== 'all' || customStatusFilter.length > 0) && (
                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setFulfillmentFilter("all");
                    setFinancialFilter("all");
                    setTagFilter('all');
                    setCustomStatusFilter([]);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#fff',
                    border: '1px solid #c4cdd5',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  清除所有筛选
                </button>
              )}
            </div>
          </div>

          {/* 分页和导出控件 */}
          {ordersWithDimensions.length > 0 && (
            <div className={styles.paginationTop}>
              <div className={styles.paginationInfo}>
                <span>当前页码: 第 {currentPage} 页 / 共 {totalPages} 页</span>
                <span>总计 {ordersWithDimensions.length} 个订单</span>
              </div>
              <div className={styles.paginationControls}>
                <button 
                  onClick={handlePreviousPage} 
                  disabled={currentPage === 1}
                  className={styles.paginationButton}
                >
                  上一页
                </button>
                <span className={styles.pageNumber}>第 {currentPage} 页</span>
                <button 
                  onClick={handleNextPage} 
                  disabled={currentPage === totalPages}
                  className={styles.paginationButton}
                >
                  下一页
                </button>
              </div>
              <div className={styles.exportControls}>
                <span>已选择 {selectedOrders.size} 个订单</span>
                <button 
                  onClick={handleExportExcel} 
                  disabled={selectedOrders.size === 0}
                  className={styles.exportButton}
                >
                  导出Excel
                </button>
              </div>
            </div>
          )}

          {/* 订单列表 */}
          {isLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>正在刷新数据...</p>
            </div>
          ) : ordersWithDimensions.length > 0 ? (
            <>
              <div className={styles.tableContainer}>
                <table className={styles.ordersTable}>
                  <thead>
                    <tr>
                      <th>
                        <input 
                          type="checkbox"
                          checked={selectedOrders.size === currentOrders.length && currentOrders.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                        />
                      </th>
                      <th>订单号</th>
                      <th>标签</th>
                      <th>商品信息</th>
                      <th>尺寸(cm)</th>
                      <th>订单状态</th>
                      <th>发货状态</th>
                      <th>支付状态</th>
                      <th>备注</th>
                      <th>评论</th>
                      <th>创建时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentOrders.map((order) => {
                      const orderId = order.id.replace('gid://shopify/Order/', '');
                      const orderTags = orderTagsMap[orderId] || [];
                      const currentStatus = statusMap[orderId] || '';
                      const fulfillmentStatus = getStatusBadge(order.displayFulfillmentStatus);
                      const financialStatus = getStatusBadge(order.displayFinancialStatus);
                      const customStatus = getCustomStatusBadge(currentStatus);
                      
                      // 如果Shopify发货状态是已发货，则强制状态为已发货
                      const isFulfilled = order.displayFulfillmentStatus === 'FULFILLED';
                      const defaultStatus = isFulfilled ? '已发货' : '待生产';
                      
                      // 获取所有商品的尺寸信息和状态选择器
                      const allItemsDimensions = order.lineItems?.edges?.map(({ node: item }, index) => {
                        const dimensions = item.customAttributes 
                          ? parseAndRenderDimensions(item.customAttributes, item.quantity, item.title)
                          : null;
                        
                        if (!dimensions) return null;
                        
                        // 如果Shopify发货状态是已发货，强制为已发货；否则使用数据库中存储的状态或默认值（待生产）
                        const itemKey = `${orderId}:${item.id}`;
                        const itemStatus = isFulfilled ? '已发货' : (statusMap[itemKey] || defaultStatus);
                        const itemNote = noteMap[itemKey] || '';
                        
                        return (
                          <div key={item.id} style={{ 
                            marginBottom: index < order.lineItems.edges.length - 1 ? '12px' : '0',
                            paddingBottom: index < order.lineItems.edges.length - 1 ? '12px' : '0',
                            borderBottom: index < order.lineItems.edges.length - 1 ? '1px solid #e1e3e5' : 'none',
                            display: 'flex',
                            gap: '12px'
                          }}>
                            {/* 商品图片 */}
                            {item.image?.url && (
                              <div style={{ flexShrink: 0 }}>
                                <img 
                                  src={item.image.url} 
                                  alt={item.image.altText || item.title}
                                  style={{ 
                                    width: '80px', 
                                    height: '80px', 
                                    objectFit: 'cover',
                                    borderRadius: '4px',
                                    border: '1px solid #e1e3e5'
                                  }}
                                />
                              </div>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '500', marginBottom: '4px', fontSize: '0.875rem' }}>
                                {item.variant?.title?item.variant?.title:item.title}
                              </div>
                              <div style={{ whiteSpace: 'pre-line' }}>
                                {dimensions}
                              </div>
                              <div style={{ marginTop: '8px', maxWidth: '220px' }}>
                                <select 
                                  value={itemStatus}
                                  onChange={(e) => handleStatusChange(itemKey, e.target.value)}
                                  className={styles.statusSelect}
                                  style={{ width: '100%', padding: '4px' }}
                                  disabled={isFulfilled}
                                >
                                  <option value="待生产">待生产</option>
                                  <option value="生产中">生产中</option>
                                  <option value="暂停生产">暂停生产</option>
                                  <option value="定型中">定型中</option>
                                  <option value="待检验">待检验</option>
                                  <option value="已发货">已发货</option>
                                </select>
                              </div>
                              <div style={{ marginTop: '8px', maxWidth: '220px' }}>
                                <textarea
                                  value={itemNote}
                                  onChange={(e) => handleNoteChange(itemKey, e.target.value)}
                                  onBlur={() => handleNoteBlur(itemKey)}
                                  placeholder="添加备注..."
                                  disabled={isFulfilled}
                                  style={{ 
                                    width: '100%', 
                                    padding: '4px', 
                                    border: '1px solid #ccc', 
                                    borderRadius: '4px',
                                    minHeight: '60px',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    fontSize: 'inherit',
                                    backgroundColor: isFulfilled ? '#f6f6f7' : 'white',
                                    cursor: isFulfilled ? 'not-allowed' : 'text'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      }).filter(Boolean);
                      
                      // 计算订单创建时间距今的天数
                      const orderCreatedDate = new Date(order.createdAt);
                      const currentDate = new Date();
                      const daysDiff = Math.floor((currentDate - orderCreatedDate) / (1000 * 60 * 60 * 24));
                      
                      // 检查订单是否含有布帘或罗马帘标签
                      const hasCurtainTag = orderTags.some(tag => 
                        tag.name === '布帘' || tag.name === '罗马帘'
                      );
                      
                      // 检查订单是否未发货
                      const isUnfulfilled = order.displayFulfillmentStatus === 'UNFULFILLED';
                      
                      // 根据条件设置行背景色
                      let rowBackgroundColor = 'transparent';
                      if (hasCurtainTag && isUnfulfilled) {
                        if (daysDiff > 6) {
                          rowBackgroundColor = '#ffebee'; // 红色背景
                        } else if (daysDiff >= 5) {
                          rowBackgroundColor = '#fff3e0'; // 橙色背景
                        } else if (daysDiff <= 4) {
                          rowBackgroundColor = '#e8f5e9'; // 绿色背景
                        }
                      }
                      
                      return (
                        <tr key={order.id} style={{ backgroundColor: rowBackgroundColor }}>
                          <td>
                            <input 
                              type="checkbox"
                              checked={selectedOrders.has(order.id)}
                              onChange={(e) => handleOrderSelect(order.id, e.target.checked)}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{order.name}</span>
                              {isSampleOrder(order.lineItems) && (
                                <span className={`${styles.statusBadge} ${styles['status-info']}`}>
                                  小样订单
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ maxWidth: '180px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
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
                                      lineHeight: 1,
                                      fontSize: '1rem'
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
                                    cursor: 'pointer',
                                    backgroundColor: '#fff'
                                  }}
                                >
                                  <option value="">+ 添加标签</option>
                                  {allTags.filter(t => !orderTags.find(ot => ot.id === t.id)).map(tag => (
                                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>
                          <td style={{ maxWidth: '200px' }}>
                            {order.lineItems?.edges?.length > 0 ? (
                              <div className={styles.lineItems}>
                                {order.lineItems.edges.slice(0, 2).map(({ node: item }, index) => (
                                  <div key={item.id} className={styles.lineItem}>
                                    <div className={styles.itemTitle}>{item.title}</div>
                                    {item.variant?.title && item.variant.title !== 'Default Title' && (
                                      <div className={styles.variantTitle}>
                                        变体: {item.variant.title}
                                      </div>
                                    )}
                                    {index === 0 && order.lineItems.edges.length > 1 && (
                                      <div className={styles.moreItems}>
                                        +{order.lineItems.edges.length - 1} 更多商品
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className={styles.noItems}>无商品信息</span>
                            )}
                          </td>
                          <td>
                            {allItemsDimensions && allItemsDimensions.length > 0 ? (
                              <div className={styles.dimensions}>
                                {allItemsDimensions}
                              </div>
                            ) : (
                              <span className={styles.noDimensions}>无尺寸信息</span>
                            )}
                          </td>
                          <td>
                            <div style={{ minWidth: '120px' }}>—</div>
                          </td>
                          <td>
                            <span className={`${styles.statusBadge} ${styles[fulfillmentStatus.className]}`}>
                              {fulfillmentStatus.text}
                            </span>
                          </td>
                          <td>
                            <span className={`${styles.statusBadge} ${styles[financialStatus.className]}`}>
                              {financialStatus.text}
                            </span>
                          </td>
                          <td style={{ maxWidth: '200px', wordWrap: 'break-word' }}>
                            {order.note || '-'}
                          </td>
                          <td style={{ maxWidth: '300px', wordWrap: 'break-word' }}>
                            {order.events?.edges && order.events.edges.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {order.events.edges.map(({ node: event }) => {
                                  if (!event.id || !event.message) return null;
                                  return (
                                    <div key={event.id} style={{
                                      padding: '8px',
                                      backgroundColor: '#f6f6f7',
                                      borderRadius: '4px',
                                      fontSize: '0.875rem'
                                    }}>
                                      <div style={{ marginBottom: '4px', fontSize: '0.75rem', color: '#6d7175' }}>
                                        {formatDate(event.createdAt)}
                                      </div>
                                      <div>{event.message}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : '-'}
                          </td>
                          <td>{formatDate(order.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <h3>没有找到订单数据</h3>
              <p>
                {noCache 
                  ? "暂无缓存数据，请联系管理员更新缓存后再次访问"
                  : "没有找到符合条件的订单"
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
