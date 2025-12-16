import { json } from "@remix-run/node";

/**
 * 获取谷仓仓库列表 API
 */

// 谷仓API服务地址
// 注意：仓库和物流接口使用 oms.goodcang.net，其他接口使用 open.goodcang.com
const OMS_API_BASE_URL = process.env.OMS_API_BASE_URL || "https://oms.goodcang.net";
const OPEN_API_BASE_URL = process.env.WAREHOUSE_API_BASE_URL || "https://open.goodcang.com";

// 谷仓API认证信息
const APP_TOKEN = process.env.WAREHOUSE_API_TOKEN || "23262f3d5961fcfed4bbf37174f069eb";
const APP_KEY = process.env.WAREHOUSE_API_KEY || "b11f2c4a3b46cee5f010109cc7ee6fb1";

/**
 * 获取谷仓API请求头
 */
function getGoodcangHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "app-token": APP_TOKEN,
    "app-key": APP_KEY,
  };
  console.log('谷仓API请求头:', JSON.stringify(headers, null, 2));
  return headers;
}

/**
 * 调用谷仓 API 获取仓库列表
 * 谷仓API文档: 获取仓库信息 /public_open/base_data/get_warehouse
 * 注意：使用 oms.goodcang.net 域名
 */
async function fetchWarehouseList() {
  const apiUrl = `${OMS_API_BASE_URL}/public_open/base_data/get_warehouse`;
  
  console.log('=== 调用获取仓库信息接口 ===');
  console.log('URL:', apiUrl);
  console.log('Method: POST');
  console.log('APP_TOKEN:', APP_TOKEN ? `${APP_TOKEN.substring(0, 8)}...` : '未设置');
  console.log('APP_KEY:', APP_KEY ? `${APP_KEY.substring(0, 8)}...` : '未设置');
  
  const headers = getGoodcangHeaders();
  const body = JSON.stringify({});
  console.log('Body:', body);
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: headers,
    body: body,
  });

  console.log('响应状态:', response.status, response.statusText);
  console.log('响应头:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

  if (!response.ok) {
    const errorText = await response.text();
    console.log('错误响应内容:', errorText);
    throw new Error(`获取仓库信息失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('=== 仓库信息响应成功 ===');
  console.log('仓库数量:', Array.isArray(data.data) ? data.data.length : '未知');
  console.log('响应数据:', JSON.stringify(data, null, 2));
  
  return data;
}

/**
 * 调用谷仓 API 获取物流方式列表
 * 谷仓API文档: 获取物流产品 /public_open/base_data/get_shipping_method
 * 注意：该接口需要 warehouse_code 参数，使用 oms.goodcang.net 域名
 */
async function fetchShippingMethods(warehouseCode) {
  const apiUrl = `${OMS_API_BASE_URL}/public_open/base_data/get_shipping_method`;
  
  console.log('=== 调用获取物流产品接口 ===');
  console.log('URL:', apiUrl);
  console.log('传入的 warehouseCode:', warehouseCode || '未提供');
  console.log('APP_TOKEN:', APP_TOKEN ? `${APP_TOKEN.substring(0, 8)}...` : '未设置');
  console.log('APP_KEY:', APP_KEY ? `${APP_KEY.substring(0, 8)}...` : '未设置');
  
  // 构建请求体 - 确保 warehouse_code 参数正确传递
  const requestBody = {
    warehouse_code: warehouseCode || "USEA"  // 默认使用新泽西仓库
  };
  
  const headers = getGoodcangHeaders();
  const body = JSON.stringify(requestBody);
  console.log('请求Body:', body);
  
  // 使用 POST 方法
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: headers,
    body: body,
  });

  console.log('响应状态:', response.status, response.statusText);
  console.log('响应头:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

  if (!response.ok) {
    const errorText = await response.text();
    console.log('错误响应内容:', errorText);
    throw new Error(`获取物流产品列表失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('=== 物流产品响应 ===');
  console.log('返回物流数量:', Array.isArray(data.data) ? data.data.length : '未知');
  // 打印前5条数据看看结构
  if (Array.isArray(data.data) && data.data.length > 0) {
    console.log('物流数据示例:', JSON.stringify(data.data.slice(0, 5), null, 2));
  }
  
  return data;
}
  console.log('物流产品列表响应:', JSON.stringify(data, null, 2));
  
  return data;
}

/**
 * 调用谷仓 OMS API 进行运费试算
 * @param {object} params - 试算参数
 * 谷仓API文档: 运费试算 /public_open/inventory/multi_dimension_delivery_fee
 */
async function calculateShippingFee(params) {
  const apiUrl = `${OMS_API_BASE_URL}/public_open/inventory/multi_dimension_delivery_fee`;
  
  console.log('调用运费试算接口:', apiUrl);
  console.log('试算参数:', JSON.stringify(params, null, 2));
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: getGoodcangHeaders(),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`运费试算失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('运费试算响应:', JSON.stringify(data, null, 2));
  
  return data;
}

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "warehouse";
    const warehouseCode = url.searchParams.get("warehouse_code");
    
    // 新泽西仓库代码 - 只使用这个仓库
    const NEW_JERSEY_WAREHOUSE_CODE = "USEA";
    
    // 允许的物流方式列表
    const ALLOWED_SHIPPING_METHODS = ["GC_PARCEL", "USPS-LWPARCEL", "FEDEX_ECON"];
    
    if (type === "shipping") {
      // 获取物流方式列表 - 强制使用新泽西仓库
      const targetWarehouseCode = warehouseCode || NEW_JERSEY_WAREHOUSE_CODE;
      const result = await fetchShippingMethods(targetWarehouseCode);
      
      if (result.code === 0 || result.code === '0' || result.success) {
        const shippingList = result.data || result.list || [];
        
        // 过滤只保留指定的物流方式
        const filteredList = shippingList.filter(item => {
          const code = item.shipping_code || item.code || item.shipping_method || '';
          return ALLOWED_SHIPPING_METHODS.includes(code);
        });
        
        // 去重：按 code 去重，避免重复显示
        const uniqueList = [];
        const seenCodes = new Set();
        for (const item of filteredList) {
          const code = item.shipping_code || item.code || item.shipping_method;
          if (!seenCodes.has(code)) {
            seenCodes.add(code);
            uniqueList.push(item);
          }
        }
        
        console.log('过滤后的物流方式:', filteredList.length, '种, 去重后:', uniqueList.length, '种');
        
        return json({
          success: true,
          data: uniqueList.map(item => ({
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
    
    // 默认获取仓库列表 - 只返回新泽西仓库
    const result = await fetchWarehouseList();
    
    if (result.code === 0 || result.code === '0' || result.success) {
      const warehouseList = result.data || result.list || [];
      
      // 过滤只保留新泽西仓库 (USEA)
      const filteredList = warehouseList.filter(item => {
        const code = item.warehouse_code || item.code || '';
        const name = item.warehouse_name || item.name || '';
        // 匹配 USEA 代码或包含"新泽西"的名称
        return code === NEW_JERSEY_WAREHOUSE_CODE || 
               code.toUpperCase() === 'USEA' ||
               name.includes('新泽西');
      });
      
      console.log('过滤后的仓库列表:', filteredList.length, '个仓库');
      
      return json({
        success: true,
        data: filteredList.map(item => ({
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

/**
 * POST 请求处理 - 物流费用试算
 */
export const action = async ({ request }) => {
  try {
    const formData = await request.formData();
    const actionType = formData.get("action");
    
    if (actionType === "calculateFee") {
      // 物流费用试算
      const warehouseCode = formData.get("warehouse_code");
      const shippingMethod = formData.get("shipping_method");
      const countryCode = formData.get("country_code") || "US";
      const province = formData.get("province") || "";
      const city = formData.get("city") || "";
      const zipcode = formData.get("zipcode") || "";
      const weight = parseFloat(formData.get("weight")) || 0.5; // 默认0.5kg
      const length = parseFloat(formData.get("length")) || 10;
      const width = parseFloat(formData.get("width")) || 10;
      const height = parseFloat(formData.get("height")) || 10;
      
      if (!warehouseCode || !shippingMethod) {
        return json({
          success: false,
          error: "请选择仓库和物流方式"
        }, { status: 400 });
      }
      
      const params = {
        warehouse_code: warehouseCode,
        shipping_method: shippingMethod,
        country_code: countryCode,
        province: province,
        city: city,
        zipcode: zipcode,
        weight: weight,
        length: length,
        width: width,
        height: height,
      };
      
      const result = await calculateShippingFee(params);
      
      if (result.code === 0 || result.code === '0' || result.success) {
        return json({
          success: true,
          data: {
            totalFee: result.data?.total_fee || result.data?.freight || result.data?.total || 0,
            currency: result.data?.currency || "USD",
            weight: result.data?.weight || weight,
            volumeWeight: result.data?.volume_weight || result.data?.volumeWeight,
            chargeWeight: result.data?.charge_weight || result.data?.chargeWeight,
            feeDetails: result.data?.fee_details || result.data?.details || [],
            shippingMethod: shippingMethod,
            warehouseCode: warehouseCode,
            rawData: result.data, // 原始数据，方便调试
          }
        });
      } else {
        return json({
          success: false,
          error: result.msg || result.message || "费用试算失败",
          rawData: result, // 返回原始数据方便调试
        });
      }
    }
    
    return json({
      success: false,
      error: "未知操作"
    }, { status: 400 });
  } catch (error) {
    console.error("API操作失败:", error);
    return json({
      success: false,
      error: error.message || "操作失败"
    }, { status: 500 });
  }
};