import { useState, useEffect, useMemo } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/node";
import styles from "./_index/styles.module.css";
import * as XLSX from 'xlsx';

export const loader = async ({ request }) => {
  try {
    const { getOrdersFromCache } = await import("../services/cache.server");
    const prisma = (await import("../db.server")).default;

    const cacheData = await getOrdersFromCache();

    if (!cacheData || !cacheData.orders) {
      return json({
        orders: [],
        pageInfo: null,
        allTags: [],
        orderTagsMap: {},
        statusMap: {},
        noteMap: {},
        fromCache: false,
        noCache: true
      });
    }

    const orderStatuses = await prisma.orderStatus.findMany();
    const statusMap = {};
    const noteMap = {};
    orderStatuses.forEach(status => {
      const key = status.lineItemId ? `${status.orderId}:${status.lineItemId}` : status.orderId;
      statusMap[key] = status.status;
      noteMap[key] = status.note || '';
    });

    const allTags = await prisma.tag.findMany({
      orderBy: { name: 'asc' }
    });

    const orderTags = await prisma.orderTag.findMany({
      include: { tag: true }
    });

    const orderTagsMap = {};
    orderTags.forEach(ot => {
      if (!orderTagsMap[ot.orderId]) {
        orderTagsMap[ot.orderId] = [];
      }
      orderTagsMap[ot.orderId].push(ot.tag);
    });

    return json({
      orders: cacheData.orders,
      pageInfo: cacheData.pageInfo,
      statusMap,
      noteMap,
      allTags,
      orderTagsMap,
      fromCache: true,
      cacheTimestamp: cacheData.timestamp || new Date().toISOString()
    });
  } catch (error) {
    console.error("Public-test loader error:", error);
    return json({
      orders: [],
      pageInfo: null,
      allTags: [],
      orderTagsMap: {},
      statusMap: {},
      noteMap: {},
      fromCache: false,
      error: error.message
    });
  }
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "updateStatus") {
    const prisma = (await import("../db.server")).default;

    const orderKey = formData.get("orderId");
    const status = formData.get("status");
    const note = formData.get("note") || null;

    if (!orderKey || !status) {
      return { error: "缺少必要参数" };
    }

    let orderId = orderKey;
    let lineItemId = null;
    if (orderKey.includes(':')) {
      const parts = orderKey.split(':');
      orderId = parts[0];
      lineItemId = parts.slice(1).join(':');
    }

    try {
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
      return json({ 
        error: "更新失败", 
        details: error.message,
        needsMigration: error.message?.includes('no such column') || error.message?.includes('note')
      }, { status: 500 });
    }
  }

  if (action === "refresh") {
    const { getOrdersFromCache } = await import("../services/cache.server");
    const prisma = (await import("../db.server")).default;
    
    const cacheData = await getOrdersFromCache();
    
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

  return json({ error: "未知操作" }, { status: 400 });
};

export default function PublicTestOrders() {
  const { orders: initialOrders, noCache, statusMap: initialStatusMap, noteMap: initialNoteMap, allTags: initialTags, orderTagsMap: initialOrderTagsMap, cacheTimestamp: initialCacheTimestamp } = useLoaderData();
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  
  const [orders, setOrders] = useState(initialOrders);
  const [statusMap, setStatusMap] = useState(initialStatusMap || {});
  const [noteMap, setNoteMap] = useState(initialNoteMap || {});
  const [allTags, setAllTags] = useState(initialTags || []);
  const [orderTagsMap, setOrderTagsMap] = useState(initialOrderTagsMap || {});
  const [tagFilter, setTagFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customStatusFilter, setCustomStatusFilter] = useState([]);
  const [fulfillmentFilter, setFulfillmentFilter] = useState("UNFULFILLED");
  const [financialFilter, setFinancialFilter] = useState("PAID");
  const [sortOrder, setSortOrder] = useState("desc");
  const [isLoading, setIsLoading] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState(initialCacheTimestamp);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  
  const itemsPerPage = 100;

  const orderHasDimensions = (order) => {
    if (!order.lineItems?.edges || order.lineItems.edges.length === 0) {
      return false;
    }
    return order.lineItems.edges.some(({ node: item }) => {
      if (!item.customAttributes) return false;
      return item.customAttributes.some(attr => 
        attr.key.includes('Width') || attr.key.includes('Length') || attr.key.includes('Height')
      );
    });
  };
  
  const ordersWithDimensions = useMemo(() => {
    // public-test 页面显示所有订单，不仅仅是有尺寸的订单
    let filteredOrders = [...orders];
    
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filteredOrders = filteredOrders.filter(order => {
        const orderNumber = order.name.replace('#', '').toLowerCase();
        return orderNumber.includes(query.replace('#', ''));
      });
    }
    
    if (fulfillmentFilter !== "all") {
      filteredOrders = filteredOrders.filter(order => 
        order.displayFulfillmentStatus === fulfillmentFilter
      );
    }

    if (financialFilter !== "all") {
      filteredOrders = filteredOrders.filter(order => 
        order.displayFinancialStatus === financialFilter
      );
    }

    if (tagFilter && tagFilter !== 'all') {
      filteredOrders = filteredOrders.filter(order => {
        const orderId = order.id.replace('gid://shopify/Order/', '');
        const tags = orderTagsMap[orderId] || [];
        return tags.some(t => t.id === tagFilter);
      });
    }
    
    if (customStatusFilter && customStatusFilter.length > 0) {
      filteredOrders = filteredOrders.filter(order => {
        const orderId = order.id.replace('gid://shopify/Order/', '');
        return order.lineItems?.edges?.some(({ node: item }) => {
          const itemKey = `${orderId}:${item.id}`;
          const itemStatus = statusMap[itemKey] || '';
          return customStatusFilter.includes(itemStatus);
        });
      });
    }
    
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

  useEffect(() => {
    if (fetcher.data?.orders) {
      setOrders(fetcher.data.orders);
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
    }
  }, [statusFetcher.data]);

  const handleRefresh = () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("action", "refresh");
    fetcher.submit(formData, { method: "POST" });
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
    });
  };

  const isSampleOrder = (lineItems) => {
    if (!lineItems?.edges || lineItems.edges.length === 0) {
      return false;
    }
    return lineItems.edges.every(({ node: item }) => {
      const basePrice = parseFloat(item.variant?.price || '0');
      let addonsPrice = 0;
      
      if (item.customAttributes && Array.isArray(item.customAttributes)) {
        const addonsAttr = item.customAttributes.find(attr => attr.key === '__bss_po_addons');
        if (addonsAttr && addonsAttr.value) {
          addonsPrice = parseFloat(addonsAttr.value) || 0;
        }
      }
      
      const totalPrice = basePrice + addonsPrice;
      return totalPrice === 1.99 || basePrice === 1.99;
    });
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'FULFILLED': '已发货',
      'UNFULFILLED': '未发货',
      'PARTIALLY_FULFILLED': '部分发货',
      'PAID': '已支付',
      'PENDING': '待支付',
      'PARTIALLY_PAID': '部分支付',
      'REFUNDED': '已退款',
      'VOIDED': '已取消',
    };
    return statusMap[status] || status;
  };

  const getCustomStatusBadge = (status) => {
    return status || '未设置';
  };

  const parseDimensions = (customAttributes, quantity, title) => {
    if (!customAttributes || !Array.isArray(customAttributes)) return null;
    const dimensions = {};
    let isRomanShade = false;
    
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
    
    let widthFraction = 0;
    let heightFraction = 0;
    
    customAttributes.forEach(attr => {
      const key = attr.key;
      const value = attr.value;
      
      // 提取价格信息的辅助函数
      const extractPrice = (str) => {
        const match = str.match(/\(\+?\s*\$?([\d.]+)\)/);
        return match ? match[1] : null;
      };
      
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
      if(key.includes('Header')) {
        const headerValue = value.split('(')[0].trim();
        dimensions.header = headerMapping[headerValue] || headerValue;
        const price = extractPrice(value);
        if (price) dimensions.headerPrice = price;
      }
      if(key.includes('GROMMET COLOR')) {
        dimensions.grommetColor = grommetColorMapping[value] || value;
      }
      if(key.includes('Lining Type')) {
        const liningValue = value.split('(')[0].trim();
        dimensions.liningType = liningTypeMapping[liningValue] || liningValue;
        const price = extractPrice(value);
        if (price) dimensions.liningPrice = price;
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
            const price = extractPrice(value);
            if (price) dimensions.widthPrice = price;
          } else if ((key.includes('Length') || key.includes('Height')) && !key.includes('Fraction')) {
            dimensions.length = centimeters;
            const price = extractPrice(value);
            if (price) dimensions.lengthPrice = price;
          }
        }
      }
    });
    
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

  const renderDimensions = (dimensions, quantity, isRomanShade) => {
    if (!dimensions) return null;
    
    const parts = [];
    parts.push(`数量: ${quantity}`);
    
    if (isRomanShade) {
      parts.push(`类型: 罗马帘`);
      if (dimensions.mountType) parts.push(`安装方式: ${dimensions.mountType}`);
      if (dimensions.width) {
        let widthText = `宽: ${dimensions.width}cm`;
        if (dimensions.widthPrice) widthText += ` (+$${dimensions.widthPrice})`;
        parts.push(widthText);
      }
      if (dimensions.length) {
        let lengthText = `高: ${dimensions.length}cm`;
        if (dimensions.lengthPrice) lengthText += ` (+$${dimensions.lengthPrice})`;
        parts.push(lengthText);
      }
      if (dimensions.liftStyle) parts.push(`升降方式: ${dimensions.liftStyle}`);
      if (dimensions.cordPosition) parts.push(`绳位: ${dimensions.cordPosition}`);
    } else {
      if(dimensions.header) {
        let headerText = `头部: ${dimensions.header}`;
        if (dimensions.grommetColor) {
          headerText = `头部: ${dimensions.header}（${dimensions.grommetColor}）`;
        }
        if (dimensions.headerPrice) headerText += ` (+$${dimensions.headerPrice})`;
        parts.push(headerText);
      }
      if (dimensions.width) {
        let widthText = `宽: ${dimensions.width}cm`;
        if (dimensions.widthPrice) widthText += ` (+$${dimensions.widthPrice})`;
        parts.push(widthText);
      }
      if (dimensions.length) {
        let lengthText = `高: ${dimensions.length}cm`;
        if (dimensions.lengthPrice) lengthText += ` (+$${dimensions.lengthPrice})`;
        parts.push(lengthText);
      }
      if(dimensions.liningType) {
        let liningText = `里料: ${dimensions.liningType}`;
        if (dimensions.liningPrice) liningText += ` (+$${dimensions.liningPrice})`;
        parts.push(liningText);
      }
      if(dimensions.bodyMemory) parts.push(`高温定型: ${dimensions.bodyMemory}`);
      if(dimensions.tieback) parts.push(`绑带: ${dimensions.tieback}`);
      if(dimensions.room) parts.push(`房间: ${dimensions.room}`);
    }
    
    return parts.join('\n');
  };

  const parseAndRenderDimensions = (customAttributes, quantity, title) => {
    const result = parseDimensions(customAttributes, quantity, title);
    if (!result) return null;
    return renderDimensions(result.dimensions, quantity, result.isRomanShade);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo(0, 0);
    }
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

  if (noCache) {
    return (
      <div className={styles.container}>
        <div className={styles.noCacheMessage}>
          <h2>暂无缓存数据</h2>
          <p>请联系管理员刷新订单缓存</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>订单管理（测试）</h1>
        <div className={styles.headerActions}>
          <button onClick={handleRefresh} disabled={isLoading} className={styles.refreshButton}>
            {isLoading ? '刷新中...' : '刷新数据'}
          </button>
        </div>
      </div>

      {cacheTimestamp && (
        <div className={styles.cacheInfo}>
          <span>缓存更新时间: {new Date(cacheTimestamp).toLocaleString('zh-CN')}</span>
        </div>
      )}

      <div className={styles.filtersSection} style={{ 
        marginBottom: '20px', 
        padding: '16px', 
        backgroundColor: '#f6f6f7', 
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
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
              {['待生产', '生产中', '暂停生产', '待发货', '已发货'].map(status => (
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
        </div>
      )}

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
              <th>订单金额</th>
              <th>标签</th>
              <th>商品信息</th>
              <th>尺寸(cm)</th>
              <th>订单状态</th>
              <th>发货状态</th>
              <th>支付状态</th>
              <th>备注</th>
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
              
              // 如果Shopify发货状态是已发货，则默认状态为已发货
              const defaultStatus = order.displayFulfillmentStatus === 'FULFILLED' ? '已发货' : '';
              const currencyCode = order.totalPriceSet?.shopMoney?.currencyCode || 'USD';
              
              // 获取所有商品的尺寸信息和状态选择器
              const allItemsDimensions = order.lineItems?.edges?.map(({ node: item }, index) => {
                const dimensions = item.customAttributes 
                  ? parseAndRenderDimensions(item.customAttributes, item.quantity, item.title)
                  : null;
                
                // 不再过滤没有尺寸的商品，显示所有商品（包括小样订单）
                
                // 状态优先使用数据库中存储的，如果为空则使用默认值
                const itemKey = `${orderId}:${item.id}`;
                const itemStatus = statusMap[itemKey] || defaultStatus;
                const itemNote = noteMap[itemKey] || '';
                
                // 计算单个商品的总价
                // 基础价格 + 额外选项价格（从 customAttributes 中的 __bss_po_addons）
                const basePrice = parseFloat(item.variant?.price || '0');
                let addonsPrice = 0;
                
                // 查找 __bss_po_addons 字段
                if (item.customAttributes && Array.isArray(item.customAttributes)) {
                  const addonsAttr = item.customAttributes.find(attr => attr.key === '__bss_po_addons');
                  if (addonsAttr && addonsAttr.value) {
                    addonsPrice = parseFloat(addonsAttr.value) || 0;
                  }
                }
                
                const itemPrice = basePrice + addonsPrice;
                const itemQuantity = item.quantity || 1;
                const itemTotal = itemPrice * itemQuantity;
                
                // 判断是否为小样商品（价格为 $1.99）
                const isSampleItem = itemPrice === 1.99 || basePrice === 1.99;
                
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
                        {item.variant?.title ? item.variant?.title : item.title}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#637381', marginBottom: '4px' }}>
                        {addonsPrice > 0 ? (
                          <>
                            单价: {formatCurrency(basePrice.toString(), currencyCode)} + {formatCurrency(addonsPrice.toString(), currencyCode)} (选项) = {formatCurrency(itemPrice.toString(), currencyCode)}
                            <br />
                            小计: {formatCurrency(itemPrice.toString(), currencyCode)} × {itemQuantity} = <span style={{ fontWeight: '600', color: '#2c5f2d' }}>{formatCurrency(itemTotal.toString(), currencyCode)}</span>
                          </>
                        ) : (
                          <>
                            单价: {formatCurrency(itemPrice.toString(), currencyCode)} × {itemQuantity} = <span style={{ fontWeight: '600', color: '#2c5f2d' }}>{formatCurrency(itemTotal.toString(), currencyCode)}</span>
                          </>
                        )}
                      </div>
                      {dimensions ? (
                        <div style={{ whiteSpace: 'pre-line', marginTop: '4px', fontSize: '0.875rem', color: '#637381' }}>
                          {dimensions}
                        </div>
                      ) : (
                        <div style={{ marginTop: '4px', fontSize: '0.875rem', color: '#919eab', fontStyle: 'italic' }}>
                          无尺寸信息
                        </div>
                      )}
                      {/* 小样商品不显示状态和备注 */}
                      {!isSampleItem && (
                        <>
                          <div style={{ marginTop: '8px', maxWidth: '220px' }}>
                            <select 
                              value={itemStatus}
                              onChange={(e) => handleStatusChange(itemKey, e.target.value)}
                              className={styles.statusSelect}
                              style={{ width: '100%', padding: '4px' }}
                            >
                              <option value="">未设置</option>
                              <option value="待生产">待生产</option>
                              <option value="生产中">生产中</option>
                              <option value="暂停生产">暂停生产</option>
                              <option value="待发货">待发货</option>
                              <option value="已发货">已发货</option>
                            </select>
                          </div>
                          <div style={{ marginTop: '8px', maxWidth: '220px' }}>
                            <textarea
                              value={itemNote}
                              onChange={(e) => handleNoteChange(itemKey, e.target.value)}
                              onBlur={() => handleNoteBlur(itemKey)}
                              placeholder="添加备注..."
                              style={{ 
                                width: '100%', 
                                padding: '4px', 
                                border: '1px solid #ccc', 
                                borderRadius: '4px',
                                minHeight: '60px',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                fontSize: 'inherit'
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              }); // 移除 filter(Boolean)，显示所有商品包括小样订单
              
              return (
                <tr key={order.id}>
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
                  <td style={{ fontWeight: '600', color: '#2c5f2d', fontSize: '1rem' }}>
                    {formatCurrency(
                      order.totalPriceSet?.shopMoney?.amount || '0',
                      currencyCode
                    )}
                  </td>
                  <td style={{ maxWidth: '180px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {orderTags.map(tag => (
                        <span 
                          key={tag.id} 
                          style={{ 
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor: tag.color + '20',
                            border: `1px solid ${tag.color}`,
                            color: tag.color,
                            fontSize: '12px',
                            fontWeight: '500'
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
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
                    {allItemsDimensions.length > 0 ? (
                      <div>
                        {allItemsDimensions}
                      </div>
                    ) : (
                      <span style={{ color: '#637381', fontSize: '0.875rem' }}>无尺寸信息</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <select 
                        value={currentStatus}
                        onChange={(e) => handleStatusChange(orderId, e.target.value)}
                        className={styles.statusSelect}
                      >
                        <option value="">未设置</option>
                        <option value="待生产">待生产</option>
                        <option value="生产中">生产中</option>
                        <option value="暂停生产">暂停生产</option>
                        <option value="待发货">待发货</option>
                        <option value="已发货">已发货</option>
                      </select>
                      {customStatus && (
                        <span className={`${styles.statusBadge} ${styles['status-' + customStatus.toLowerCase().replace(' ', '-')]}`}>
                          {customStatus}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles['status-' + order.displayFulfillmentStatus.toLowerCase()]}`}>
                      {order.displayFulfillmentStatus === 'FULFILLED' ? '已发货' :
                       order.displayFulfillmentStatus === 'UNFULFILLED' ? '未发货' :
                       order.displayFulfillmentStatus === 'PARTIALLY_FULFILLED' ? '部分发货' : 
                       order.displayFulfillmentStatus}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles['status-' + order.displayFinancialStatus.toLowerCase()]}`}>
                      {order.displayFinancialStatus === 'PAID' ? '已支付' :
                       order.displayFinancialStatus === 'PENDING' ? '待支付' :
                       order.displayFinancialStatus === 'PARTIALLY_PAID' ? '部分支付' :
                       order.displayFinancialStatus === 'REFUNDED' ? '已退款' :
                       order.displayFinancialStatus === 'VOIDED' ? '已取消' :
                       order.displayFinancialStatus}
                    </span>
                  </td>
                  <td style={{ maxWidth: '220px' }}>
                    <textarea
                      value={noteMap[orderId] || ''}
                      onChange={(e) => handleNoteChange(orderId, e.target.value)}
                      onBlur={() => handleNoteBlur(orderId)}
                      placeholder="添加订单备注..."
                      style={{ 
                        width: '100%', 
                        padding: '4px', 
                        border: '1px solid #ccc', 
                        borderRadius: '4px',
                        minHeight: '60px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        fontSize: 'inherit'
                      }}
                    />
                  </td>
                  <td>{formatDate(order.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ordersWithDimensions.length > 0 && (
        <div className={styles.paginationBottom}>
          <div className={styles.paginationControls}>
            <button 
              onClick={handlePreviousPage} 
              disabled={currentPage === 1}
              className={styles.paginationButton}
            >
              上一页
            </button>
            <span className={styles.pageNumber}>第 {currentPage} 页 / 共 {totalPages} 页</span>
            <button 
              onClick={handleNextPage} 
              disabled={currentPage === totalPages}
              className={styles.paginationButton}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
