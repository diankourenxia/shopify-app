import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import styles from "./_index/styles.module.css";

export const loader = async ({ request }) => {
  // 动态导入服务器端模块
  const { getOrdersFromCache } = await import("../services/cache.server");
  
  // 直接从缓存获取数据，不需要认证
  const cacheData = await getOrdersFromCache();
  
  if (cacheData) {
    return {
      orders: cacheData.orders,
      pageInfo: cacheData.pageInfo,
      fromCache: true,
      publicAccess: true
    };
  }

  // 如果没有缓存数据，返回空数据
  return {
    orders: [],
    pageInfo: null,
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
    
    // 尝试从缓存获取最新数据
    const cacheData = await getOrdersFromCache();
    if (cacheData) {
      return {
        orders: cacheData.orders,
        pageInfo: cacheData.pageInfo,
        fromCache: true
      };
    }
  }

  return null;
};

export default function PublicOrders() {
  const { orders: initialOrders, pageInfo: initialPageInfo, noCache } = useLoaderData();
  const fetcher = useFetcher();
  
  const [orders, setOrders] = useState(initialOrders);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  // 处理刷新结果
  useEffect(() => {
    if (fetcher.data?.orders) {
      setOrders(fetcher.data.orders);
      setPageInfo(fetcher.data.pageInfo);
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

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        {/* 页面标题和状态 */}
        <div className={styles.ordersSection}>
          <div className={styles.sectionHeader}>
            <h1 className={styles.heading}>订单管理 - 公开访问</h1>
            <div className={styles.headerActions}>
              <span className={styles.badge}>公开访问模式</span>
              {noCache && (
                <span className={`${styles.badge} ${styles.statusWarning}`}>暂无缓存数据</span>
              )}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className={styles.actionsSection}>
            <button 
              className={styles.refreshButton} 
              onClick={handleRefresh} 
              disabled={isLoading}
            >
              {isLoading ? '正在刷新...' : '刷新数据'}
            </button>
            <p className={styles.note}>
              注意：这是公开访问页面，只能查看缓存数据。如需更新数据，请联系管理员。
            </p>
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
                      <th>发货状态</th>
                      <th>支付状态</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const fulfillmentStatus = getStatusBadge(order.displayFulfillmentStatus);
                      const financialStatus = getStatusBadge(order.displayFinancialStatus);
                      
                      return (
                        <tr key={order.id}>
                          <td>{order.name}</td>
                          <td>{order.customer?.displayName || '无客户信息'}</td>
                         
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
                          <td>
                            <a 
                              href={`/orders/public/${order.id.replace('gid://shopify/Order/', '')}`}
                              className={styles.linkButton}
                            >
                              查看详情
                            </a>
                          </td>
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
