#!/usr/bin/env node

/**
 * 自动更新缓存脚本
 * 可以通过cron job定时运行来保持缓存数据的新鲜度
 * 
 * 使用方法:
 * 1. 直接运行: node scripts/auto-update-cache.js
 * 2. 设置cron job: */5 * * * * cd /path/to/project && node scripts/auto-update-cache.js
 */

import { saveOrdersToCache, isCacheValid } from '../app/services/cache.server.js';
import fetch from 'node-fetch';

const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL || 'http://localhost:3000';

async function autoUpdateCache() {
  try {
    console.log('开始检查缓存状态...');
    
    // 检查缓存是否有效
    const cacheValid = await isCacheValid();
    
    if (cacheValid) {
      console.log('缓存仍然有效，无需更新');
      return;
    }

    console.log('缓存已过期，开始更新...');
    
    // 调用API更新缓存
    const response = await fetch(`${SHOPIFY_APP_URL}/app/api/auto-update`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log(`缓存更新成功: ${result.message}`);
      if (result.ordersCount) {
        console.log(`更新了 ${result.ordersCount} 个订单`);
      }
    } else {
      console.error('缓存更新失败:', result.message);
    }
  } catch (error) {
    console.error('自动更新缓存时发生错误:', error.message);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  autoUpdateCache();
}

export { autoUpdateCache };
