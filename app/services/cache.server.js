import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'cache');
const ORDERS_CACHE_FILE = path.join(CACHE_DIR, 'orders.json');

// 确保缓存目录存在
async function ensureCacheDir() {
  try {
    await fs.access(CACHE_DIR);
  } catch {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  }
}

// 保存订单数据到缓存
export async function saveOrdersToCache(orders, pageInfo) {
  try {
    await ensureCacheDir();
    
    // 使用 mergeOrdersToCache 来避免覆盖完整的缓存
    const mergeResult = await mergeOrdersToCache(orders);
    console.log('订单数据已缓存，使用增量更新');
    console.log(`新增 ${mergeResult.addedCount} 个订单，总计 ${mergeResult.totalCount} 个`);
  } catch (error) {
    console.error('保存缓存失败:', error);
  }
}

// 从缓存获取订单数据
export async function getOrdersFromCache() {
  try {
    await ensureCacheDir();
    const data = await fs.readFile(ORDERS_CACHE_FILE, 'utf-8');
    const cacheData = JSON.parse(data);
    
    // 检查是否过期
    if (new Date() > new Date(cacheData.expiresAt)) {
      console.log('缓存已过期');
      return null;
    }
    
    console.log('从缓存获取订单数据');
    return {
      orders: cacheData.orders,
      pageInfo: cacheData.pageInfo,
      fromCache: true
    };
  } catch (error) {
    console.log('缓存文件不存在或读取失败:', error.message);
    return null;
  }
}

// 清除缓存
export async function clearOrdersCache() {
  try {
    await fs.unlink(ORDERS_CACHE_FILE);
    console.log('缓存已清除');
  } catch (error) {
    console.log('清除缓存失败:', error.message);
  }
}

// 检查缓存是否存在且有效
export async function isCacheValid() {
  try {
    await ensureCacheDir();
    const data = await fs.readFile(ORDERS_CACHE_FILE, 'utf-8');
    const cacheData = JSON.parse(data);
    return new Date() < new Date(cacheData.expiresAt);
  } catch {
    return false;
  }
}

// 合并新订单到现有缓存（增量更新）
export async function mergeOrdersToCache(newOrders) {
  try {
    await ensureCacheDir();
    
    let existingOrders = [];
    
    // 尝试读取现有缓存
    try {
      const data = await fs.readFile(ORDERS_CACHE_FILE, 'utf-8');
      const cacheData = JSON.parse(data);
      existingOrders = cacheData.orders || [];
    } catch {
      // 如果没有缓存，existingOrders 保持为空数组
    }
    
    // 创建订单ID的Set用于去重
    const existingIds = new Set(existingOrders.map(order => order.id));
    
    // 只添加新订单（不存在于现有缓存中的）
    const uniqueNewOrders = newOrders.filter(order => !existingIds.has(order.id));
    
    // 合并订单：新订单在前，旧订单在后
    const mergedOrders = [...uniqueNewOrders, ...existingOrders];
    
    // 保存合并后的订单
    const cacheData = {
      orders: mergedOrders,
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    };
    
    await fs.writeFile(ORDERS_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`订单数据已合并：新增 ${uniqueNewOrders.length} 个订单，总计 ${mergedOrders.length} 个订单`);
    
    return {
      addedCount: uniqueNewOrders.length,
      totalCount: mergedOrders.length
    };
  } catch (error) {
    console.error('合并缓存失败:', error);
    throw error;
  }
}
