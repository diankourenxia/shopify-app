import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * 小样单发货 API
 * 使用海外仓（谷仓）API 进行小样发货
 */

// 海外仓API服务地址 - 使用 oms.goodcang.net
const OMS_API_BASE_URL = process.env.OMS_API_BASE_URL || "https://oms.goodcang.net";
const APP_TOKEN = process.env.WAREHOUSE_API_TOKEN || "23262f3d5961fcfed4bbf37174f069eb";
const APP_KEY = process.env.WAREHOUSE_API_KEY || "b11f2c4a3b46cee5f010109cc7ee6fb1";

// 默认配置
const DEFAULT_CONFIG = {
  shipping_method: "GC_PARCEL",
  warehouse_code: "USEA",
};

/**
 * 获取谷仓API请求头
 */
function getGoodcangHeaders() {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "app-token": APP_TOKEN,
    "app-key": APP_KEY,
  };
}

/**
 * 创建小样发货订单
 * 使用谷仓 OMS API: /public_open/order/create_order
 */
async function createSampleOrder(orderData) {
  try {
    const apiUrl = `${OMS_API_BASE_URL}/public_open/order/create_order`;
    
    console.log('=== 调用小样发货接口 ===');
    console.log('URL:', apiUrl);
    console.log('APP_TOKEN:', APP_TOKEN ? `${APP_TOKEN.substring(0, 8)}...` : '未设置');
    console.log('APP_KEY:', APP_KEY ? `${APP_KEY.substring(0, 8)}...` : '未设置');
    console.log('=== 请求报文 ===');
    console.log(JSON.stringify(orderData, null, 2));
    console.log('=== 请求报文结束 ===');
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: getGoodcangHeaders(),
      body: JSON.stringify(orderData),
    });

    console.log('响应状态:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('错误响应:', errorText);
      throw new Error(`创建发货订单失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('=== 响应报文 ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('=== 响应报文结束 ===');
    
    return data;
  } catch (error) {
    console.error("创建小样发货订单失败:", error);
    throw error;
  }
}

/**
 * 从 Shopify 订单转换为小样发货订单数据
 * 按照谷仓 API 文档格式构建参数 - 只保留必填项
 */
function convertShopifyOrderToSampleOrder(shopifyOrder, options = {}) {
  const { skuMapping = {}, customSku = null } = options;
  
  const shippingAddress = shopifyOrder.shippingAddress || {};
  
  // 构建商品列表 - 只保留必填字段
  const items = shopifyOrder.lineItems.edges.map(({ node: item }) => {
    const itemSku = item.variant?.sku || '';
    const itemId = item.id;
    let productSku = skuMapping[itemSku] || skuMapping[itemId] || itemSku || customSku || "SAMPLE-DEFAULT";
    
    return {
      product_sku: productSku,  // 必填
      quantity: parseInt(item.quantity, 10) || 1,  // 必填，确保是整数
    };
  });

  // 分离姓名为 first name 和 last name
  const fullName = shippingAddress.name || "";
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || "Customer";
  const lastName = nameParts.slice(1).join(' ') || "";

  return {
    // 必填 - 物流配置
    shipping_method: options.shippingMethod || DEFAULT_CONFIG.shipping_method,
    warehouse_code: options.warehouseCode || DEFAULT_CONFIG.warehouse_code,
    
    // 必填 - 收件人信息
    country_code: shippingAddress.countryCode || "US",
    province: shippingAddress.provinceCode || shippingAddress.province || "",
    city: shippingAddress.city || "",
    address1: shippingAddress.address1 || "",
    name: firstName,
    zipcode: shippingAddress.zip || "",
    
    // 必填 - 商品列表
    items: items,
    
    // 选填 - 有用的字段
    address2: shippingAddress.address2 || "",
    last_name: lastName,
    phone: shippingAddress.phone || "",
    email: shopifyOrder.email || shopifyOrder.customer?.email || "",
    reference_no: shopifyOrder.name ? shopifyOrder.name.replace('#', '') : `ORDER-${Date.now()}`,
    order_desc: options.orderDesc || "",
  };
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    if (action === "createSampleShipping") {
      const orderId = formData.get("orderId");
      const customSku = formData.get("customSku");
      const shippingMethod = formData.get("shippingMethod");
      const warehouseCode = formData.get("warehouseCode");
      const orderDesc = formData.get("orderDesc");
      const skuMappingStr = formData.get("skuMapping");
      
      // 解析SKU映射
      let skuMapping = {};
      try {
        if (skuMappingStr) {
          skuMapping = JSON.parse(skuMappingStr);
        }
      } catch (e) {
        console.warn("解析SKU映射失败:", e);
      }
      
      if (!orderId) {
        return json({ success: false, error: "缺少订单ID" }, { status: 400 });
      }

      // 获取Shopify订单详情
      const response = await admin.graphql(`
        query getOrder($id: ID!) {
          order(id: $id) {
            id
            name
            email
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            shippingAddress {
              name
              address1
              address2
              city
              province
              provinceCode
              country
              countryCode
              zip
              phone
              company
            }
            customer {
              email
              displayName
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  variant {
                    id
                    sku
                    price
                  }
                }
              }
            }
          }
        }
      `, {
        variables: { id: `gid://shopify/Order/${orderId}` }
      });

      const { data } = await response.json();
      
      if (!data?.order) {
        return json({ success: false, error: "订单不存在" }, { status: 404 });
      }

      const shopifyOrder = data.order;

      // 转换订单数据
      const sampleOrderData = convertShopifyOrderToSampleOrder(shopifyOrder, {
        skuMapping,
        customSku,
        shippingMethod,
        warehouseCode,
        orderDesc,
      });

      // 调用海外仓API创建订单
      const result = await createSampleOrder(sampleOrderData);

      // 保存发货信息到数据库
      const prisma = (await import("../db.server")).default;
      const orderIdNum = orderId.toString();
      
      await prisma.orderStatus.upsert({
        where: {
          id: (await prisma.orderStatus.findFirst({
            where: { orderId: orderIdNum, lineItemId: null }
          }))?.id || "new"
        },
        update: {
          sampleShippingNo: result.order_no || result.reference_no || null,
          sampleShippingStatus: "已创建",
          sampleShippingCreatedAt: new Date(),
        },
        create: {
          orderId: orderIdNum,
          status: "待处理",
          sampleShippingNo: result.order_no || result.reference_no || null,
          sampleShippingStatus: "已创建",
          sampleShippingCreatedAt: new Date(),
        }
      });

      return json({
        success: true,
        data: result,
        message: "小样发货订单创建成功"
      });
    }

    // 查询发货状态
    if (action === "queryShippingStatus") {
      const orderNo = formData.get("orderNo");
      
      if (!orderNo) {
        return json({ success: false, error: "缺少订单号" }, { status: 400 });
      }

      // 使用谷仓 OMS API 查询订单
      const response = await fetch(`${OMS_API_BASE_URL}/public_open/order/get_order_list`, {
        method: "POST",
        headers: getGoodcangHeaders(),
        body: JSON.stringify({ reference_no: orderNo }),
      });

      if (!response.ok) {
        throw new Error(`查询失败: ${response.status}`);
      }

      const data = await response.json();
      return json({ success: true, data });
    }

    return json({ success: false, error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("小样发货API错误:", error);
    return json({
      success: false,
      error: error.message || "操作失败"
    }, { status: 500 });
  }
};

export const loader = async ({ request }) => {
  return json({
    message: "小样发货 API",
    endpoints: {
      createSampleShipping: "POST - 创建小样发货订单",
      queryShippingStatus: "POST - 查询发货状态"
    }
  });
};
