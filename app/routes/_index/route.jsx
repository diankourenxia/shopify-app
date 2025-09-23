import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // 尝试获取缓存的订单数据
  let ordersData = null;
  try {
    const { getOrdersFromCache } = await import("../../services/cache.server");
    const cacheData = await getOrdersFromCache();
    if (cacheData) {
      ordersData = {
        orders: cacheData.orders.slice(0, 10), // 只显示前10个订单
        fromCache: true
      };
    }
  } catch (error) {
    console.log("无法获取缓存数据:", error.message);
  }

  return { 
    showForm: Boolean(login),
    ordersData 
  };
};

export default function App() {
  const { showForm, ordersData } = useLoaderData();

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
        <h1 className={styles.heading}>Shopify 订单管理系统</h1>
        <p className={styles.text}>
          一个强大的订单管理工具，帮助您轻松查看和管理Shopify店铺订单。
        </p>
        
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              登录管理后台
            </button>
          </Form>
        )}

        {/* 订单数据展示 */}
        {ordersData && ordersData.orders.length > 0 ? (
          <div className={styles.ordersSection}>
            <div className={styles.sectionHeader}>
              <h2>最新订单 (缓存数据)</h2>
              <div className={styles.headerActions}>
                <span className={styles.badge}>公开访问</span>
                <a href="/orders/public" className={styles.linkButton}>
                  查看完整订单列表
                </a>
              </div>
            </div>
            
            <div className={styles.tableContainer}>
              <table className={styles.ordersTable}>
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>客户</th>
                    <th>总金额</th>
                    <th>发货状态</th>
                    <th>支付状态</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersData.orders.map((order, index) => {
                    const fulfillmentStatus = getStatusBadge(order.displayFulfillmentStatus);
                    const financialStatus = getStatusBadge(order.displayFinancialStatus);
                    
                    return (
                      <tr key={order.id}>
                        <td>{order.name}</td>
                        <td>{order.customer?.displayName || '无客户信息'}</td>
                        <td>{formatCurrency(
                          order.totalPriceSet.shopMoney.amount,
                          order.totalPriceSet.shopMoney.currencyCode
                        )}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <p className={styles.tableNote}>
              显示最新 {ordersData.orders.length} 个订单，点击上方按钮查看完整列表
            </p>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h3>暂无订单数据</h3>
            <p>当前没有缓存的订单数据，请先登录管理后台更新缓存</p>
            {showForm && (
              <p className={styles.emptyNote}>
                登录后可以在管理后台查看和更新订单数据
              </p>
            )}
          </div>
        )}

        {/* 功能特性 */}
        <div className={styles.featuresSection}>
          <h2>功能特性</h2>
          <ul className={styles.list}>
            <li>
              <strong>实时订单管理</strong>. 查看订单详情、状态和客户信息
            </li>
            <li>
              <strong>缓存加速</strong>. 智能缓存系统，快速访问订单数据
            </li>
            <li>
              <strong>公开访问</strong>. 无需登录即可查看订单信息
            </li>
            <li>
              <strong>移动友好</strong>. 响应式设计，支持各种设备访问
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
