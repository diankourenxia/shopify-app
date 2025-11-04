import { useState, useEffect } from "react";
import { useLoaderData } from "@remix-run/react";
import { redirect } from "@remix-run/node";
import styles from "./_index/styles.module.css";

export const loader = async ({ request, params }) => {
  const orderId = params.id;
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
  
  // 从缓存获取数据
  const cacheData = await getOrdersFromCache();
  
  if (cacheData && cacheData.orders) {
    // 查找指定订单
    const order = cacheData.orders.find(o => 
      o.id.replace('gid://shopify/Order/', '') === orderId
    );
    
    if (order) {
      return {
        order,
        publicAccess: true,
        fromCache: true,
        userSession
      };
    }
  }

  return {
    order: null,
    publicAccess: true,
    fromCache: false,
    notFound: true,
    userSession
  };
};

export default function PublicOrderDetail() {
  const { order, notFound, userSession } = useLoaderData();

  const handleLogout = () => {
    // 清除会话并重定向到登录页面
    window.location.href = "/login";
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

  if (notFound || !order) {
    return (
      <div className={styles.index}>
        <div className={styles.content}>
          <div className={styles.emptyState}>
            <h1>订单未找到</h1>
            <p>该订单不存在或缓存中无此数据</p>
            <a href="/orders/public" className={styles.linkButton}>
              返回订单列表
            </a>
          </div>
        </div>
      </div>
    );
  }

  const fulfillmentStatus = getStatusBadge(order.displayFulfillmentStatus);
  const financialStatus = getStatusBadge(order.displayFinancialStatus);

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

        {/* 页面标题 */}
        <div className={styles.ordersSection}>
          <div className={styles.sectionHeader}>
            <h1 className={styles.heading}>订单详情 - {order.name}</h1>
            <div className={styles.headerActions}>
              <span className={styles.badge}>已登录访问</span>
              <span className={styles.badge}>缓存数据</span>
            </div>
          </div>

          {/* 订单基本信息 */}
          <div className={styles.infoSection}>
            <h2>订单信息</h2>
            <div className={styles.infoGrid}>
              <div className={styles.infoColumn}>
                <p>
                  <strong>订单号:</strong> {order.name}
                  {isSampleOrder(order.lineItems) && (
                    <span className={`${styles.statusBadge} ${styles['status-info']}`} style={{ marginLeft: '8px' }}>
                      小样订单
                    </span>
                  )}
                </p>
                <p><strong>客户:</strong> {order.customer?.displayName || '无客户信息'}</p>
                <p><strong>创建时间:</strong> {formatDate(order.createdAt)}</p>
                <p><strong>更新时间:</strong> {formatDate(order.updatedAt)}</p>
              </div>
              <div className={styles.infoColumn}>
                <p><strong>总金额:</strong> {formatCurrency(
                  order.totalPriceSet.shopMoney.amount,
                  order.totalPriceSet.shopMoney.currencyCode
                )}</p>
                <p><strong>发货状态:</strong> 
                  <span className={`${styles.statusBadge} ${styles[fulfillmentStatus.className]}`}>
                    {fulfillmentStatus.text}
                  </span>
                </p>
                <p><strong>支付状态:</strong> 
                  <span className={`${styles.statusBadge} ${styles[financialStatus.className]}`}>
                    {financialStatus.text}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* 商品列表 */}
          {order.lineItems?.edges && order.lineItems.edges.length > 0 && (
            <div className={styles.itemsSection}>
              <h2>商品列表</h2>
              <div className={styles.tableContainer}>
                <table className={styles.ordersTable}>
                  <thead>
                    <tr>
                      <th>商品名称</th>
                      <th>数量</th>
                      <th>变体</th>
                      <th>单价</th>
                      <th>自定义属性</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.edges.map(({ node: item }, index) => (
                      <tr key={index}>
                        <td>{item.title}</td>
                        <td>{item.quantity}</td>
                        <td>{item.variant?.title || '无变体'}</td>
                        <td>{formatCurrency(item.variant?.price || '0', order.totalPriceSet.shopMoney.currencyCode)}</td>
                        <td>{item.customAttributes?.map(attr => `${attr.key}: ${attr.value}`).join(', ') || '无'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className={styles.actionsSection}>
            <a href="/orders/public" className={styles.linkButton}>
              返回订单列表
            </a>
            <p className={styles.note}>
              注意：这是公开访问页面，只能查看缓存数据
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
