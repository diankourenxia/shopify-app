import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { redirect } from "@remix-run/node";
import styles from "./_index/styles.module.css";

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
      const orderId = status.orderId;
      statusMap[orderId] = status.status;
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
      setStatusMap(prev => ({
        ...prev,
        [orderStatus.orderId]: orderStatus.status
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

  // 解析customAttributes中的尺寸信息并转换为厘米
  const parseDimensions = (customAttributes, quantity) => {
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
      'Grommet Top   Black': '打孔（黑色）',
      'Grommet Top   Silver': '打孔（银色）',
      'Grommet Top   Bronze': '打孔（青铜色）',
      'Grommet Top   Gold': '打孔（金色）',
      'Ripple Fold': '蛇形帘（铆钉）',
      'Ripple Fold  吊环挂钩（四合一）': '蛇形帘（挂钩）',
      'Flat Panel': '吊环挂钩（四合一）',
      'Back Tab': '背带式'
    };
    
    customAttributes.forEach(attr => {
      const key = attr.key;
      const value = attr.value;
      
      if(key.includes('Header')) {
        const headerValue = value.split('(')[0].trim();
        dimensions.header = headerMapping[headerValue] || headerValue;
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
    
    // 如果有尺寸信息，返回格式化的字符串
    if (dimensions.width || dimensions.length || dimensions.header || dimensions.tieback || dimensions.room) {
      const parts = [];
      parts.push(`数量: ${quantity}`);
      if(dimensions.header) parts.push(`头部: ${dimensions.header}`);
      if (dimensions.width) parts.push(`宽: ${dimensions.width}cm`);
      if (dimensions.length) parts.push(`高: ${dimensions.length}cm`);     
      if(dimensions.tieback) parts.push(`高温定型: ${dimensions.tieback}`);
      if(dimensions.room) parts.push(`房间: ${dimensions.room}`);
      
      return parts.join('\n');
    }
    
    return null;
  };

  return (
    <div className={styles.index}>
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

          {/* 订单列表 */}
          {isLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>正在刷新数据...</p>
            </div>
          ) : orders.length > 0 ? (
            <>
              <div className={styles.tableContainer}>
                <table className={styles.ordersTable}>
                  <thead>
                    <tr>
                      <th>订单号</th>
                      <th>客户</th>
                      <th>总金额</th>
                      <th>商品信息</th>
                      <th>尺寸(cm)</th>
                      <th>订单状态</th>
                      <th>发货状态</th>
                      <th>支付状态</th>
                      <th>创建时间</th>
                      {/* <th>操作</th> */}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const orderId = order.id.replace('gid://shopify/Order/', '');
                      const currentStatus = statusMap[orderId] || '';
                      const fulfillmentStatus = getStatusBadge(order.displayFulfillmentStatus);
                      const financialStatus = getStatusBadge(order.displayFinancialStatus);
                      const customStatus = getCustomStatusBadge(currentStatus);
                      
                      // 获取第一个商品的尺寸信息
                      const firstItemDimensions = order.lineItems?.edges?.[0]?.node?.customAttributes 
                        ? parseDimensions(order.lineItems.edges[0].node.customAttributes, order.lineItems?.edges?.[0]?.node?.quantity)
                        : null;
                      
                      return (
                        <tr key={order.id}>
                          <td>{order.name}</td>
                          <td>{order.customer?.displayName || '无客户信息'}</td>
                          <td>{formatCurrency(
                            order.totalPriceSet.shopMoney.amount,
                            order.totalPriceSet.shopMoney.currencyCode
                          )}</td>
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
                            {firstItemDimensions ? (
                              <div className={styles.dimensions} style={{ whiteSpace: 'pre-line' }}>
                                {firstItemDimensions}
                              </div>
                            ) : (
                              <span className={styles.noDimensions}>无尺寸信息</span>
                            )}
                          </td>
                          <td>
                            <select 
                              value={currentStatus} 
                              onChange={(e) => handleStatusChange(orderId, e.target.value)}
                              className={styles.statusSelect}
                            >
                              <option value="">未设置</option>
                              <option value="待生产">待生产</option>
                              <option value="生产中">生产中</option>
                              <option value="待发货">待发货</option>
                              <option value="已发货">已发货</option>
                            </select>
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
                          <td>{formatDate(order.createdAt)}</td>
                          {/* <td>
                            <a 
                              href={`/orders/public/${orderId}`}
                              className={styles.linkButton}
                            >
                              查看详情
                            </a>
                          </td> */}
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
