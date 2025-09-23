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
    const cacheData = {
      orders,
      pageInfo,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5分钟过期
    };
    await fs.writeFile(ORDERS_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log('订单数据已缓存');
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
