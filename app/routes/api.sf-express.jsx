import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * 顺丰快递API集成
 * 使用现有的顺丰API服务
 */

// 顺丰API服务地址
const SF_API_BASE_URL = process.env.SF_API_BASE_URL || "http://8.219.107.56";

// 发件人信息配置
const SENDER_CONFIG = {
  contact: process.env.SF_SENDER_CONTACT || "发件人",
  phoneNo: process.env.SF_SENDER_PHONE || "13800138000",
  phoneAreaCode: "86",
  country: "CN",
  regionFirst: process.env.SF_SENDER_REGION_FIRST || "广东省",
  regionSecond: process.env.SF_SENDER_REGION_SECOND || "深圳市",
  regionThird: process.env.SF_SENDER_REGION_THIRD || "宝安区",
  address: process.env.SF_SENDER_ADDRESS || "详细地址",
  postCode: process.env.SF_SENDER_POSTCODE || "518000",
};

/**
 * 创建顺丰运单
 */
async function createSfOrder(orderData) {
  try {
    console.log('调用创建运单接口:', `${SF_API_BASE_URL}/sf/create_order`);
    
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
    console.log('创建运单响应:', data);
    
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
 * 从Shopify订单创建运单数据
 */
function convertShopifyOrderToSfOrder(shopifyOrder) {
  // 计算总重量
  const totalWeight = calculateTotalWeight(shopifyOrder.lineItems);
  
  // 构建收件人信息
  const receiverInfo = {
    contact: shopifyOrder.shippingAddress?.name || shopifyOrder.customer?.displayName || "收件人",
    phoneNo: shopifyOrder.shippingAddress?.phone || "",
    phoneAreaCode: getPhoneAreaCode(shopifyOrder.shippingAddress?.countryCode),
    country: shopifyOrder.shippingAddress?.countryCode || "US",
    regionFirst: shopifyOrder.shippingAddress?.province || "",
    regionSecond: shopifyOrder.shippingAddress?.city || "",
    regionThird: "",
    address: `${shopifyOrder.shippingAddress?.address1 || ""} ${shopifyOrder.shippingAddress?.address2 || ""}`.trim(),
    postCode: shopifyOrder.shippingAddress?.zip || "",
    cargoType: 1,
  };

  // 构建包裹信息列表
  const parcelInfoList = shopifyOrder.lineItems.edges.map(({ node: item }) => ({
    name: item.title,
    quantity: item.quantity,
    amount: parseFloat(item.variant?.price || 0),
    currency: shopifyOrder.totalPriceSet.shopMoney.currencyCode,
    unit: "个",
  }));

  return {
    customerOrderNo: shopifyOrder.name,
    interProductCode: "INT0014", // 国际快递
    pickupType: "0", // 上门收件
    parcelQuantity: shopifyOrder.lineItems.edges.length,
    parcelTotalWeight: totalWeight,
    parcelWeightUnit: "KG",
    parcelTotalLength: "30",
    parcelTotalWidth: "20",
    parcelTotalHeight: "10",
    parcelVolumeUnit: "CM",
    declaredValue: Math.round(parseFloat(shopifyOrder.totalPriceSet.shopMoney.amount)),
    declaredCurrency: shopifyOrder.totalPriceSet.shopMoney.currencyCode,
    
    // 发件人信息
    senderInfo: {
      ...SENDER_CONFIG,
      cargoType: 1,
    },
    
    // 收件人信息
    receiverInfo: receiverInfo,
    
    // 包裹信息
    parcelInfoList: parcelInfoList,
    
    // 支付信息
    paymentInfo: {
      payMethod: "1", // 寄方付
    },
    
    orderOperateType: "1", // 新增
  };
}

/**
 * 计算总重量
 */
function calculateTotalWeight(lineItems) {
  // 默认每个商品0.5KG
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
    // 添加更多国家代码
  };
  return areaCodeMap[country] || "1";
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    if (action === "createAndPrint") {
      // 创建运单并打印
      const orderId = formData.get("orderId");
      
      // 获取订单详情
      const response = await admin.graphql(
        `#graphql
          query getOrder($id: ID!) {
            order(id: $id) {
              id
              name
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                displayName
              }
              shippingAddress {
                name
                address1
                address2
                city
                province
                country
                countryCode
                zip
                phone
              }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    title
                    quantity
                    variant {
                      price
                    }
                  }
                }
              }
            }
          }`,
        {
          variables: {
            id: orderId,
          },
        }
      );

      const responseJson = await response.json();
      const order = responseJson.data.order;

      if (!order) {
        return json({ error: "订单不存在" }, { status: 404 });
      }

      // 转换订单数据
      const sfOrderData = convertShopifyOrderToSfOrder(order);

      // 1. 创建顺丰运单
      const createResult = await createSfOrder(sfOrderData);
      
      // 检查创建结果
      if (!createResult || createResult.apiResponseCode !== "A1000") {
        return json({ 
          error: "创建运单失败", 
          details: createResult?.apiErrorMsg || "未知错误",
          data: createResult
        }, { status: 400 });
      }

      // 提取运单号
      const waybillNo = createResult.apiResultData?.msgData?.waybillNoInfoList?.[0]?.waybillNo;
      
      if (!waybillNo) {
        return json({ 
          error: "未获取到运单号", 
          data: createResult 
        }, { status: 400 });
      }

      // 2. 获取打印URL
      const printData = {
        printWaybillNoDtoList: [
          {
            sfWaybillNo: waybillNo,
          },
        ],
      };
      
      const printResult = await printSfOrder(printData);

      // 提取打印URL
      let printUrl = null;
      if (printResult?.apiResultData?.msgData?.files) {
        printUrl = printResult.apiResultData.msgData.files[0]?.url;
      }

      return json({
        success: true,
        waybillNo: waybillNo,
        printUrl: printUrl,
        createResult: createResult,
        printResult: printResult,
        message: `运单创建成功！运单号：${waybillNo}`,
      });
    }

    if (action === "testConnection") {
      // 测试连接
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
  return json({ message: "顺丰快递API服务" });
};
