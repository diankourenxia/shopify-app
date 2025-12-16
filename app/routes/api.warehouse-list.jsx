import { json } from "@remix-run/node";
import crypto from "crypto";

/**
 * 获取谷仓仓库列表 API
 */

// 海外仓API服务地址
const WAREHOUSE_API_BASE_URL = process.env.WAREHOUSE_API_BASE_URL || "https://open.goodcang.com";
const WAREHOUSE_API_TOKEN = process.env.WAREHOUSE_API_TOKEN || "";
const WAREHOUSE_API_KEY = process.env.WAREHOUSE_API_KEY || "";

/**
 * 生成谷仓API签名
 * 签名规则: MD5(token + timestamp + key)
 */
function generateSignature(timestamp) {
  const signStr = WAREHOUSE_API_TOKEN + timestamp + WAREHOUSE_API_KEY;
  return crypto.createHash('md5').update(signStr).digest('hex');
}

/**
 * 调用谷仓 API 获取仓库列表
 */
async function fetchWarehouseList() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = generateSignature(timestamp);
  
  // 谷仓获取仓库列表接口
  const apiUrl = `${WAREHOUSE_API_BASE_URL}/api/wms/warehouse/getList`;
  
  console.log('调用获取仓库列表接口:', apiUrl);
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "token": WAREHOUSE_API_TOKEN,
      "timestamp": timestamp,
      "sign": sign,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`获取仓库列表失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('仓库列表响应:', JSON.stringify(data, null, 2));
  
  return data;
}

/**
 * 调用谷仓 API 获取物流方式列表
 */
async function fetchShippingMethods(warehouseCode) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = generateSignature(timestamp);
  
  // 谷仓获取物流方式列表接口
  const apiUrl = `${WAREHOUSE_API_BASE_URL}/api/wms/shipping/getList`;
  
  console.log('调用获取物流方式列表接口:', apiUrl);
  
  const requestBody = warehouseCode ? { warehouse_code: warehouseCode } : {};
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "token": WAREHOUSE_API_TOKEN,
      "timestamp": timestamp,
      "sign": sign,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`获取物流方式列表失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('物流方式列表响应:', JSON.stringify(data, null, 2));
  
  return data;
}

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "warehouse";
    const warehouseCode = url.searchParams.get("warehouse_code");
    
    if (type === "shipping") {
      // 获取物流方式列表
      const result = await fetchShippingMethods(warehouseCode);
      
      if (result.code === 0 || result.code === '0' || result.success) {
        const shippingList = result.data || result.list || [];
        return json({
          success: true,
          data: shippingList.map(item => ({
            code: item.shipping_code || item.code || item.shipping_method,
            name: item.shipping_name || item.name || item.shipping_method,
            warehouseCode: item.warehouse_code,
          }))
        });
      } else {
        return json({
          success: false,
          error: result.msg || result.message || "获取物流方式失败"
        });
      }
    }
    
    // 默认获取仓库列表
    const result = await fetchWarehouseList();
    
    if (result.code === 0 || result.code === '0' || result.success) {
      const warehouseList = result.data || result.list || [];
      return json({
        success: true,
        data: warehouseList.map(item => ({
          code: item.warehouse_code || item.code,
          name: item.warehouse_name || item.name,
          country: item.country || item.country_code,
          address: item.address,
        }))
      });
    } else {
      return json({
        success: false,
        error: result.msg || result.message || "获取仓库列表失败"
      });
    }
  } catch (error) {
    console.error("获取仓库/物流列表失败:", error);
    return json({
      success: false,
      error: error.message || "获取失败"
    }, { status: 500 });
  }
};
