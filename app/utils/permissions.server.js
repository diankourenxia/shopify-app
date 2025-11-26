import { redirect } from "@remix-run/node";

/**
 * 检查用户是否有权限访问页面
 * @param {Object} session - Shopify session 对象
 * @param {string} requiredPermission - 需要的权限级别 ('admin' | 'orders-only')
 * @returns {boolean} - 是否有权限
 */
export function checkPermission(session, requiredPermission = 'admin') {
  // 优先使用在线令牌中的用户邮箱
  const userEmail = session?.onlineAccessInfo?.associated_user?.email;
  
  if (userEmail) {
    // 使用用户邮箱判断权限
    const isAdmin = userEmail.toLowerCase() === 'yaohuiruyi@gmail.com';
    
    if (requiredPermission === 'admin' && !isAdmin) {
      return false;
    }
    
    return true;
  }
  
  // 如果没有用户邮箱信息（离线令牌），回退到使用 shop 名称
  const shop = session?.shop || '';
  const shopLower = shop.toLowerCase();
  const isRestrictedUser = shopLower.includes('abc');
  
  if (requiredPermission === 'admin' && isRestrictedUser) {
    return false;
  }
  
  return true;
}

/**
 * 如果用户没有权限，重定向到订单页面
 * @param {Object} session - Shopify session 对象
 * @param {string} requiredPermission - 需要的权限级别
 */
export function requirePermission(session, requiredPermission = 'admin') {
  if (!checkPermission(session, requiredPermission)) {
    throw redirect('/app/orders');
  }
}

/**
 * 判断是否为受限用户
 * @param {Object} session - Shopify session 对象
 * @returns {boolean}
 */
export function isRestrictedUser(session) {
  // 优先使用在线令牌中的用户邮箱
  const userEmail = session?.onlineAccessInfo?.associated_user?.email;
  
  if (userEmail) {
    // 只有 yaohuiruyi@gmail.com 有管理员权限
    return userEmail.toLowerCase() !== 'yaohuiruyi@gmail.com';
  }
  
  // 回退到使用 shop 名称
  const shop = session?.shop || '';
  return shop.toLowerCase().includes('abc');
}

/**
 * 获取当前用户信息用于显示
 * @param {Object} session - Shopify session 对象
 * @returns {Object}
 */
export function getUserInfo(session) {
  const user = session?.onlineAccessInfo?.associated_user;
  
  return {
    email: user?.email || session?.shop || 'Unknown',
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    isOwner: user?.account_owner || false,
    isAdmin: user?.email?.toLowerCase() === 'yaohuiruyi@gmail.com',
  };
}
