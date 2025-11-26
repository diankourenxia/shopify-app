import { redirect } from "@remix-run/node";

/**
 * 检查用户邮箱是否在白名单中
 * @param {string} email - 用户邮箱
 * @param {Object} prisma - Prisma 客户端
 * @returns {Promise<boolean>}
 */
export async function isEmailWhitelisted(email, prisma) {
  if (!email) return false;
  
  const whitelistUser = await prisma.whitelistUser.findFirst({
    where: {
      email: email.toLowerCase(),
      isActive: true,
    },
  });
  
  return !!whitelistUser;
}

/**
 * 检查用户是否有权限访问页面
 * @param {Object} session - Shopify session 对象
 * @param {string} requiredPermission - 需要的权限级别 ('admin' | 'orders-only')
 * @param {Object} prisma - Prisma 客户端（可选，用于检查白名单）
 * @returns {Promise<boolean>} - 是否有权限
 */
export async function checkPermission(session, requiredPermission = 'admin', prisma = null) {
  // 优先使用在线令牌中的用户邮箱
  const userEmail = session?.onlineAccessInfo?.associated_user?.email;
  
  if (userEmail) {
    // 硬编码的超级管理员
    const isSuperAdmin = userEmail.toLowerCase() === 'yaohuiruyi@gmail.com';
    
    // 检查白名单（如果提供了 prisma 客户端）
    let isWhitelisted = false;
    if (prisma) {
      isWhitelisted = await isEmailWhitelisted(userEmail, prisma);
    }
    
    const isAdmin = isSuperAdmin || isWhitelisted;
    
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
 * @param {Object} prisma - Prisma 客户端（可选）
 */
export async function requirePermission(session, requiredPermission = 'admin', prisma = null) {
  const hasPermission = await checkPermission(session, requiredPermission, prisma);
  if (!hasPermission) {
    throw redirect('/app/orders');
  }
}

/**
 * 判断是否为受限用户
 * @param {Object} session - Shopify session 对象
 * @param {Object} prisma - Prisma 客户端（可选）
 * @returns {Promise<boolean>}
 */
export async function isRestrictedUser(session, prisma = null) {
  // 优先使用在线令牌中的用户邮箱
  const userEmail = session?.onlineAccessInfo?.associated_user?.email;
  
  if (userEmail) {
    // 硬编码的超级管理员
    const isSuperAdmin = userEmail.toLowerCase() === 'yaohuiruyi@gmail.com';
    
    // 检查白名单
    let isWhitelisted = false;
    if (prisma) {
      isWhitelisted = await isEmailWhitelisted(userEmail, prisma);
    }
    
    // 只有超级管理员或白名单用户有管理员权限
    return !(isSuperAdmin || isWhitelisted);
  }
  
  // 回退到使用 shop 名称
  const shop = session?.shop || '';
  return shop.toLowerCase().includes('abc');
}

/**
 * 获取当前用户信息用于显示
 * @param {Object} session - Shopify session 对象
 * @param {Object} prisma - Prisma 客户端（可选）
 * @returns {Promise<Object>}
 */
export async function getUserInfo(session, prisma = null) {
  const user = session?.onlineAccessInfo?.associated_user;
  const email = user?.email || session?.shop || 'Unknown';
  
  const isSuperAdmin = email.toLowerCase() === 'yaohuiruyi@gmail.com';
  let isWhitelisted = false;
  
  if (prisma && user?.email) {
    isWhitelisted = await isEmailWhitelisted(user.email, prisma);
  }
  
  return {
    email,
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    isOwner: user?.account_owner || false,
    isAdmin: isSuperAdmin || isWhitelisted,
    isSuperAdmin,
  };
}

/**
 * 检查用户是否为超级管理员（只有超级管理员可以管理白名单）
 * @param {Object} session - Shopify session 对象
 * @returns {boolean}
 */
export function isSuperAdmin(session) {
  const userEmail = session?.onlineAccessInfo?.associated_user?.email;
  return userEmail?.toLowerCase() === 'yaohuiruyi@gmail.com';
}
