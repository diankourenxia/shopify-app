import { json } from "@remix-run/node";

/**
 * 顺丰快递API集成 - Public版本（无需Shopify认证）
 * 使用缓存数据替代Shopify GraphQL查询
 */

// 顺丰API服务地址
const SF_API_BASE_URL = process.env.SF_API_BASE_URL || "http://8.219.107.56";

// 发件人信息配置
const SENDER_CONFIG = {
  contact: process.env.SF_SENDER_CONTACT || "江淼",
  phoneNo: process.env.SF_SENDER_PHONE || "17611571900",
  phoneAreaCode: "86",
  country: "CN",
  regionFirst: process.env.SF_SENDER_REGION_FIRST || "浙江省",
  regionSecond: process.env.SF_SENDER_REGION_SECOND || "嘉兴市",
  regionThird: process.env.SF_SENDER_REGION_THIRD || "海宁市",
  address: process.env.SF_SENDER_ADDRESS || "永福村凌家角43号后门",
  postCode: process.env.SF_SENDER_POSTCODE || "314000",
};

/**
 * 创建顺丰运单
 */
async function createSfOrder(orderData) {
  try {
    console.log('调用创建运单接口:', `${SF_API_BASE_URL}/sf/create_order`);
    console.log('=== 请求报文 ===');
    console.log(JSON.stringify(orderData, null, 2));
    console.log('=== 请求报文结束 ===');
    
    const response = await fetch(`${SF_API_BASE_URL}/sf/create_order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      throw new Error(`创建运单请求失败: ${response.status}`);
    }

    const data = await response.json();
    console.log('=== 响应报文 ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('=== 响应报文结束 ===');
    
    return data;
  } catch (error) {
    console.error("创建顺丰运单失败:", error);
    throw error;
  }
}

/**
 * 获取打印运单URL
 */
async function printSfOrder(printData) {
  try {
    console.log('调用打印运单接口:', `${SF_API_BASE_URL}/sf/print_order`);
    
    const response = await fetch(`${SF_API_BASE_URL}/sf/print_order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(printData),
    });

    if (!response.ok) {
      throw new Error(`打印运单请求失败: ${response.status}`);
    }

    const data = await response.json();
    console.log('打印运单响应:', data);
    
    return data;
  } catch (error) {
    console.error("获取打印URL失败:", error);
    throw error;
  }
}

/**
 * 从缓存订单创建运单数据
 */
function convertCacheOrderToSfOrder(order, parcelQuantity = 1, customOrderName = null) {
  // 计算总重量
  const totalWeight = calculateTotalWeight(order.lineItems);
  
  // 构建收件人信息
  const receiverInfo = {
    contact: order.shippingAddress?.name || order.customer?.displayName || "收件人",
    phoneNo: order.shippingAddress?.phone || "",
    phoneAreaCode: getPhoneAreaCode(order.shippingAddress?.countryCode),
    country: order.shippingAddress?.countryCode || "US",
    regionFirst: order.shippingAddress?.province || "",
    regionSecond: order.shippingAddress?.city || "",
    regionThird: "",
    address: `${order.shippingAddress?.address1 || ""} ${order.shippingAddress?.address2 || ""}`.trim(),
    postCode: order.shippingAddress?.zip || "",
    cargoType: 1,
  };

  // 产品名称映射表
  const PRODUCT_NAME_MAP = {
    "Collins Single Decorative Custom Curtain Rods": "铁窗帘杆",
    "Collins Double Decorative Custom Curtain Rods": "铁窗帘杆",
    "Noah Custom Curtain Rod with Wall Brackets": "铁窗帘杆",
    "Arden Adjustable Ripple Fold Curtain Track": "塑料窗帘轨道",
    "Riven Adjustable Curtain Track": "塑料窗帘轨道",
    "Kaelen Custom Motorized Curtain Track": "塑料窗帘轨道",
  };

  // 构建包裹信息列表，过滤金额为0并映射名称
  const parcelInfoList = order.lineItems.edges
    .map(({ node: item }) => {
      const price = parseFloat(item.discountedUnitPriceSet?.shopMoney?.amount || item.variant?.price || 0);
      if (price === 0) return null;
      const mappedName = PRODUCT_NAME_MAP[item.title] || '聚酯纤维窗帘';
      return {
        name: mappedName,
        quantity: item.quantity,
        amount: Math.max(10, Math.round(price)),
        currency: 'CNY',
        unit: "套",
      };
    })
    .filter(Boolean);

  // 计算总金额
  const totalAmount = parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);

  return {
    customerCode: "ICRM-CN01FVYW09",
    customerOrderNo: customOrderName || order.name,
    interProductCode: "INT0014",
    pickupType: "0",
    parcelQuantity: parcelQuantity,
    parcelTotalWeight: totalWeight * parcelQuantity,
    parcelWeightUnit: "KG",
    parcelTotalLength: "30",
    parcelTotalWidth: "20",
    parcelTotalHeight: "10",
    parcelVolumeUnit: "CM",
    declaredValue: Math.round(totalAmount / 5),
    declaredCurrency: 'CNY',
    senderInfo: {
      ...SENDER_CONFIG,
      cargoType: 1,
    },
    receiverInfo: receiverInfo,
    parcelInfoList: parcelInfoList,
    paymentInfo: {
      payMethod: "1",
      taxPayMethod: "1",
    },
    orderOperateType: "1",
  };
}

/**
 * 计算总重量
 */
function calculateTotalWeight(lineItems) {
  const itemCount = lineItems.edges.reduce((sum, { node: item }) => sum + item.quantity, 0);
  return Math.max(0.5, itemCount * 0.5);
}

/**
 * 获取电话区号
 */
function getPhoneAreaCode(country) {
  const areaCodeMap = {
    CN: "86",
    US: "1",
    GB: "44",
  };
  return areaCodeMap[country] || "1";
}

export const action = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    if (action === "createAndPrint") {
      const orderId = formData.get("orderId");
      const parcelQuantity = parseInt(formData.get("parcelQuantity") || "1");
      
      if (parcelQuantity < 1 || parcelQuantity > 99) {
        return json({ error: "包裹数量必须在 1-99 之间" }, { status: 400 });
      }
      
      // 从缓存获取订单数据
      const { getOrdersFromCache } = await import("../services/cache.server");
      const cacheData = await getOrdersFromCache();
      
      if (!cacheData || !cacheData.orders) {
        return json({ error: "缓存数据不存在，请联系管理员更新缓存" }, { status: 404 });
      }
      
      // 查找订单
      const order = cacheData.orders.find(o => o.id === orderId);
      
      if (!order) {
        return json({ error: "订单不存在" }, { status: 404 });
      }

      // 检查是否已有运单，确定打印次数
      const prisma = (await import("../db.server")).default;
      const existingStatus = await prisma.orderStatus.findFirst({
        where: { orderId: orderId, lineItemId: null }
      });
      
      const printCount = existingStatus?.sfPrintCount || 0;
      const orderName = `${order.name}-${printCount + 1}`;
      
      console.log(`[Public] 订单 ${order.name} 打印次数: ${printCount}, 使用订单号: ${orderName}`);
      
      // 获取前端传递的选中包裹id
      const selectedLineItemIds = [];
      for (const entry of formData.entries()) {
        if (entry[0] === "lineItemIds[]") selectedLineItemIds.push(entry[1]);
      }

      // 复制订单数据并过滤商品
      const filteredOrder = { ...order };
      if (selectedLineItemIds.length > 0) {
        filteredOrder.lineItems = {
          edges: order.lineItems.edges.filter(({ node }) => selectedLineItemIds.includes(node.id))
        };
      }

      // 转换订单数据
      const sfOrderData = convertCacheOrderToSfOrder(filteredOrder, parcelQuantity, orderName);

      // 1. 创建顺丰运单
      const createResult = await createSfOrder(sfOrderData);
      
      console.log('创建运单完整响应:', JSON.stringify(createResult, null, 2));
      
      const isSuccess = createResult?.apiResponseCode === "A1000" || 
                       createResult?.success === "true" || 
                       createResult?.ok === true;
      
      if (!createResult || !isSuccess) {
        const errorMsg = createResult?.msg || 
                        createResult?.apiErrorMsg || 
                        createResult?.data?.msg || 
                        "未知错误";
        
        return json({ 
          error: "创建运单失败", 
          details: errorMsg,
          fullResponse: createResult
        }, { status: 400 });
      }

      const waybillNo = createResult.data?.sfWaybillNo ||
                       createResult.apiResultData?.msgData?.waybillNoInfoList?.[0]?.waybillNo;
      
      if (!waybillNo) {
        return json({ 
          error: "未获取到运单号", 
          fullResponse: createResult 
        }, { status: 400 });
      }

      let printUrl = createResult.data?.labelUrl || createResult.data?.invoiceUrl;

      if (!printUrl) {
        const printData = {
          printWaybillNoDtoList: [
            {
              sfWaybillNo: waybillNo,
            },
          ],
        };
        
        const printResult = await printSfOrder(printData);

        if (printResult?.apiResultData?.msgData?.files) {
          printUrl = printResult.apiResultData.msgData.files[0]?.url;
        }
      }

      // 保存运单信息到数据库
      const newPrintCount = printCount + 1;
      try {
        if (existingStatus) {
          await prisma.orderStatus.update({
            where: { id: existingStatus.id },
            data: {
              sfWaybillNo: waybillNo,
              sfLabelUrl: createResult.data?.labelUrl,
              sfInvoiceUrl: createResult.data?.invoiceUrl,
              sfCreatedAt: new Date(),
              sfPrintCount: newPrintCount,
            }
          });
        } else {
          await prisma.orderStatus.create({
            data: {
              orderId: orderId,
              lineItemId: null,
              status: "已发货",
              sfWaybillNo: waybillNo,
              sfLabelUrl: createResult.data?.labelUrl,
              sfInvoiceUrl: createResult.data?.invoiceUrl,
              sfCreatedAt: new Date(),
              sfPrintCount: newPrintCount,
            }
          });
        }
      } catch (dbError) {
        console.error("保存运单信息到数据库失败:", dbError);
      }

      return json({
        success: true,
        waybillNo: waybillNo,
        printUrl: printUrl,
        labelUrl: createResult.data?.labelUrl,
        invoiceUrl: createResult.data?.invoiceUrl,
        childWaybillNos: createResult.data?.childWaybillNoList,
        message: `运单创建成功！运单号：${waybillNo}`,
      });
    }

    if (action === "testConnection") {
      return json({
        success: true,
        apiUrl: SF_API_BASE_URL,
        message: "顺丰API服务连接正常",
      });
    }

    return json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("顺丰API错误:", error);
    return json(
      {
        error: error.message || "操作失败",
        details: error.toString(),
      },
      { status: 500 }
    );
  }
};

export const loader = async ({ request }) => {
  return json({ message: "顺丰快递API服务 (Public)" });
};
