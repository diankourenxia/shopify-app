import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import crypto from "crypto";

/**
 * 小样单发货 API
 * 使用海外仓（谷仓）API 进行小样发货
 */

// 海外仓API服务地址
const WAREHOUSE_API_BASE_URL = process.env.WAREHOUSE_API_BASE_URL || "https://open.goodcang.com";
const WAREHOUSE_API_TOKEN = process.env.WAREHOUSE_API_TOKEN || "";
const WAREHOUSE_API_KEY = process.env.WAREHOUSE_API_KEY || "";

// 默认配置
const DEFAULT_CONFIG = {
  shipping_method: "FEDEX-SMALLPARCEL",
  warehouse_code: "USEA",
  wp_code: "USEA-001",
  platform: "SHOPIFY",
  property_label: "SFP",
  customer_package_requirement: 1,
  customer_package_code: "MY-CARTON-L",
  customer_package_type: "PUBLIC",
  validity_type: 3,
};

/**
 * 生成谷仓API签名
 * 签名规则: MD5(token + timestamp + key)
 */
function generateSignature(timestamp) {
  const signStr = WAREHOUSE_API_TOKEN + timestamp + WAREHOUSE_API_KEY;
  return crypto.createHash('md5').update(signStr).digest('hex');
}

/**
 * 创建小样发货订单
 */
async function createSampleOrder(orderData) {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = generateSignature(timestamp);
    
    const apiUrl = `${WAREHOUSE_API_BASE_URL}/api/wms/order/create`;
    
    console.log('调用小样发货接口:', apiUrl);
    console.log('=== 请求报文 ===');
    console.log(JSON.stringify(orderData, null, 2));
    console.log('=== 请求报文结束 ===');
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": WAREHOUSE_API_TOKEN,
        "timestamp": timestamp,
        "sign": sign,
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorText = await response.text();
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
 */
function convertShopifyOrderToSampleOrder(shopifyOrder, options = {}) {
  const { skuMapping = {}, customSku = null } = options;
  
  const shippingAddress = shopifyOrder.shippingAddress || {};
  const now = new Date();
  const paymentTime = now.toISOString().replace('T', ' ').substring(0, 19);
  
  // 构建商品列表
  const items = shopifyOrder.lineItems.edges.map(({ node: item }, index) => {
    // 优先使用 SKU 映射（支持多种key格式），其次使用商品 SKU，最后使用自定义 SKU
    const itemSku = item.variant?.sku || '';
    const itemId = item.id;
    let productSku = skuMapping[itemSku] || skuMapping[itemId] || itemSku || customSku || "SAMPLE-DEFAULT";
    
    return {
      product_sku: productSku,
      quantity: item.quantity,
      hs_code: "",
      item_id: item.id.replace('gid://shopify/LineItem/', ''),
      label_replacement_qty: "",
      product_declared_value: item.variant?.price || "",
      transaction_id: item.id.replace('gid://shopify/LineItem/', ''),
    };
  });

  // 分离姓名为 first name 和 last name
  const fullName = shippingAddress.name || "";
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(' ') || "";

  // 计算预计到达日期（7天后）
  const estimatedDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const estimatedArrivalDate = estimatedDate.toISOString().split('T')[0];

  return {
    // 物流配置
    shipping_method: options.shippingMethod || DEFAULT_CONFIG.shipping_method,
    warehouse_code: options.warehouseCode || DEFAULT_CONFIG.warehouse_code,
    wp_code: options.wpCode || DEFAULT_CONFIG.wp_code,
    verify: 1,
    distributor_type: 0,
    
    // 订单信息
    payment_time: paymentTime,
    platform: DEFAULT_CONFIG.platform,
    platform_order_code: shopifyOrder.name,
    property_label: DEFAULT_CONFIG.property_label,
    reference_no: shopifyOrder.name.replace('#', ''),
    
    // 收件人信息
    country_code: shippingAddress.countryCode || "US",
    province: shippingAddress.provinceCode || shippingAddress.province || "",
    city: shippingAddress.city || "",
    address1: shippingAddress.address1 || "",
    address2: shippingAddress.address2 || "",
    name: firstName,
    last_name: lastName,
    phone: shippingAddress.phone || "",
    cell_phone: shippingAddress.phone || "-1",
    area_code: "",
    doorplate: "",
    company: shippingAddress.company || "",
    email: shopifyOrder.email || shopifyOrder.customer?.email || "",
    zipcode: shippingAddress.zip || "",
    
    // 商品列表
    items: items,
    
    // 其他配置
    age_detection: "0",
    insurance_value: "0",
    is_insurance: 0,
    is_optional_board: "null",
    is_signature: 0,
    LiftGate: 0,
    vas: {
      logistics_recommendation_option: 1
    },
    estimated_arrival_date: estimatedArrivalDate,
    estimated_arrival_time: "1",
    is_euro_label: "",
    
    // VAT 信息（默认空）
    vat_change_info: {
      customs_clearance_file_id_list: [],
      ioss_number: "",
      pid_number: "",
      recipient_eori: "",
      recipient_eori_country: shippingAddress.countryCode || "US",
      recipient_vat: "",
      recipient_vat_country: "GB",
      sent_number: "",
      shipper_company_name: "",
      shipper_eori: "",
      shipper_vat: "",
      shipper_vat_city: "",
      shipper_vat_company_name: "",
      shipper_vat_country: "US",
      shipper_vat_street_address1: "",
      shipper_vat_street_address2: "",
      shipper_vat_zip_code: ""
    },
    
    // 发件人信息
    sender_info: {
      name: "",
      phone: ""
    },
    
    // 包装配置
    shopping_file_id: "",
    customer_package_requirement: DEFAULT_CONFIG.customer_package_requirement,
    customer_package_code: options.packageCode || DEFAULT_CONFIG.customer_package_code,
    customer_package_type: DEFAULT_CONFIG.customer_package_type,
    
    // 组合发货（不使用）
    is_combination: 0,
    combination_list: [],
    
    // 其他
    ooh_code: "",
    order_desc: options.orderDesc || "",
    product_quanlity: items.reduce((sum, item) => sum + item.quantity, 0),
    validity_type: DEFAULT_CONFIG.validity_type,
    is_shipping_method_not_allow_update: 0
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

      const response = await fetch(`${WAREHOUSE_API_BASE_URL}/api/order/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${WAREHOUSE_API_KEY}`,
        },
        body: JSON.stringify({ order_no: orderNo }),
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
