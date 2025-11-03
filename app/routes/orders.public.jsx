import { useState, useEffect, useMemo } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { redirect } from "@remix-run/node";
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
  
  // 获取所有订单的自定义状态
  const orderStatuses = await prisma.orderStatus.findMany();
  const statusMap = {};
  orderStatuses.forEach(status => {
    const key = status.lineItemId ? `${status.orderId}:${status.lineItemId}` : status.orderId;
    statusMap[key] = status.status;
  });
  
  if (cacheData) {
    return {
      orders: cacheData.orders,
      pageInfo: cacheData.pageInfo,
      statusMap,
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
    fromCache: false,
    publicAccess: true,
    noCache: true,
    userSession
  };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "refresh") {
    // 动态导入服务器端模块
    const { getOrdersFromCache } = await import("../services/cache.server");
    const prisma = (await import("../db.server")).default;
    
    // 尝试从缓存获取最新数据
    const cacheData = await getOrdersFromCache();
    
    // 获取所有订单的自定义状态
    const orderStatuses = await prisma.orderStatus.findMany();
    const statusMap = {};
    orderStatuses.forEach(status => {
      const key = status.lineItemId ? `${status.orderId}:${status.lineItemId}` : status.orderId;
      statusMap[key] = status.status;
    });
    
    if (cacheData) {
      return {
        orders: cacheData.orders,
        pageInfo: cacheData.pageInfo,
        statusMap,
        fromCache: true,
        cacheTimestamp: cacheData.timestamp || new Date().toISOString()
      };
    }
  }

  if (action === "updateStatus") {
    const prisma = (await import("../db.server")).default;
    
    const orderKey = formData.get("orderId");
    const status = formData.get("status");

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
      const existing = await prisma.orderStatus.findFirst({ where: { orderId, lineItemId } });
      let orderStatus;
      if (existing) {
        orderStatus = await prisma.orderStatus.update({ where: { id: existing.id }, data: { status } });
      } else {
        orderStatus = await prisma.orderStatus.create({ data: { orderId, lineItemId, status } });
      }

      return { success: true, orderStatus };
    } catch (error) {
      console.error("更新订单状态失败:", error);
      return { error: "更新失败" };
    }
  }

  return null;
};

export default function PublicOrders() {
  const { orders: initialOrders, pageInfo: initialPageInfo, noCache, userSession, statusMap: initialStatusMap, cacheTimestamp: initialCacheTimestamp } = useLoaderData();
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [statusMap, setStatusMap] = useState(initialStatusMap || {});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState(initialCacheTimestamp);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  
  // 分页设置
  const itemsPerPage = 100;
  
  // 解析customAttributes中的尺寸信息的辅助函数
  const parseDimensions = (customAttributes, quantity) => {
    if (!customAttributes || !Array.isArray(customAttributes)) return null;
    const dimensions = {};
    
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
      
      if (key.includes('Width') || key.includes('Length') || key.includes('Height')) {
        const inchMatch = value.match(/(\d+(?:\.\d+)?)/);
        if (inchMatch) {
          const inches = parseFloat(inchMatch[1]);
          const centimeters = Math.round(inches * 2.54 * 100) / 100;
          
          if (key.includes('Width')) {
            dimensions.width = centimeters;
          } else if (key.includes('Length') || key.includes('Height')) {
            dimensions.length = centimeters;
          }
        }
      }
    });
    
    if (dimensions.width || dimensions.length || dimensions.header || dimensions.tieback || dimensions.room || dimensions.liningType || dimensions.bodyMemory) {
      return dimensions;
    }
    
    return null;
  };
  
  // 检查订单是否有尺寸信息
  const orderHasDimensions = (order) => {
    if (!order.lineItems?.edges) return false;
    
    for (const { node: item } of order.lineItems.edges) {
      const dimensions = item.customAttributes 
        ? parseDimensions(item.customAttributes, item.quantity)
        : null;
      
      if (dimensions) {
        return true;
      }
    }
    
    return false;
  };
  
  // 使用 useMemo 过滤有尺寸信息的订单
  const ordersWithDimensions = useMemo(() => {
    return orders.filter(order => orderHasDimensions(order));
  }, [orders]);
  
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

  const handleStatusChange = (orderId, newStatus) => {
    const formData = new FormData();
    formData.append("action", "updateStatus");
    formData.append("orderId", orderId);
    formData.append("status", newStatus);
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
      '待发货': { className: 'status-success', text: '待发货' },
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
  const renderDimensions = (dimensions, quantity) => {
    if (!dimensions) return null;
    
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
      <div style={{ lineHeight: '1.4', maxWidth:'400px' }}>
        {parts.map((part, index) => (
          <div style={{ whiteSpace: 'normal' }} key={index}>{part}</div>
        ))}
      </div>
    );
  };

  // 解析并渲染尺寸信息的完整函数（供表格使用）
  const parseAndRenderDimensions = (customAttributes, quantity) => {
    const dimensions = parseDimensions(customAttributes, quantity);
    return renderDimensions(dimensions, quantity);
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
                      const currentStatus = statusMap[orderId] || '';
                      const fulfillmentStatus = getStatusBadge(order.displayFulfillmentStatus);
                      const financialStatus = getStatusBadge(order.displayFinancialStatus);
                      const customStatus = getCustomStatusBadge(currentStatus);
                      
                      // 如果Shopify发货状态是已发货，则默认状态为已发货
                      const defaultStatus = order.displayFulfillmentStatus === 'FULFILLED' ? '已发货' : '';
                      
                      // 获取所有商品的尺寸信息和状态选择器
                      const allItemsDimensions = order.lineItems?.edges?.map(({ node: item }, index) => {
                        const dimensions = item.customAttributes 
                          ? parseAndRenderDimensions(item.customAttributes, item.quantity)
                          : null;
                        
                        if (!dimensions) return null;
                        
                        // 状态优先使用数据库中存储的，如果为空则使用默认值
                        const itemStatus = statusMap[`${orderId}:${item.id}`] || defaultStatus;
                        
                        return (
                          <div key={item.id} style={{ 
                            marginBottom: index < order.lineItems.edges.length - 1 ? '12px' : '0',
                            paddingBottom: index < order.lineItems.edges.length - 1 ? '12px' : '0',
                            borderBottom: index < order.lineItems.edges.length - 1 ? '1px solid #e1e3e5' : 'none'
                          }}>
                            <div style={{ fontWeight: '500', marginBottom: '4px', fontSize: '0.875rem' }}>
                              {item.variant?.title?item.variant?.title:item.title}
                            </div>
                            <div style={{ whiteSpace: 'pre-line' }}>
                              {dimensions}
                            </div>
                            <div style={{ marginTop: '8px', maxWidth: '220px' }}>
                              <select 
                                value={itemStatus}
                                onChange={(e) => handleStatusChange(`${orderId}:${item.id}`, e.target.value)}
                                className={styles.statusSelect}
                                style={{ width: '100%', padding: '4px' }}
                              >
                                <option value="">未设置</option>
                                <option value="待生产">待生产</option>
                                <option value="生产中">生产中</option>
                                <option value="待发货">待发货</option>
                                <option value="已发货">已发货</option>
                              </select>
                            </div>
                          </div>
                        );
                      }).filter(Boolean);
                      
                      return (
                        <tr key={order.id}>
                          <td>
                            <input 
                              type="checkbox"
                              checked={selectedOrders.has(order.id)}
                              onChange={(e) => handleOrderSelect(order.id, e.target.checked)}
                            />
                          </td>
                          <td>{order.name}</td>
                          <td>
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
