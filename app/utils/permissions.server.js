import { redirect } from "@remix-run/node";

/**
 * 检查用户是否有权限访问页面
 * @param {string} shop - Shop名称
 * @param {string} requiredPermission - 需要的权限级别 ('admin' | 'orders-only')
 * @returns {boolean} - 是否有权限
 */
export function checkPermission(shop, requiredPermission = 'admin') {
  const shopLower = (shop || '').toLowerCase();
  
  // 包含 abc 的账号为受限用户（只能访问订单）
  const isRestrictedUser = shopLower.includes('abc');
  
  if (requiredPermission === 'admin' && isRestrictedUser) {
    return false;
  }
  
  return true;
}

/**
 * 如果用户没有权限，重定向到订单页面
 * @param {string} shop - Shop名称
 * @param {string} requiredPermission - 需要的权限级别
 */
export function requirePermission(shop, requiredPermission = 'admin') {
  if (!checkPermission(shop, requiredPermission)) {
    throw redirect('/app/orders');
  }
}

/**
 * 判断是否为受限用户
 * @param {string} shop - Shop名称
 * @returns {boolean}
 */
export function isRestrictedUser(shop) {
  return (shop || '').toLowerCase().includes('abc');
}
