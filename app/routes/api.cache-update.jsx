import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  try {
    // 动态导入服务器端模块
    const { saveOrdersToCache, clearOrdersCache } = await import("../services/cache.server");
    
    // 清除旧缓存
    await clearOrdersCache();
    
    // 获取最新的订单数据
    const response = await admin.graphql(
      `#graphql
        query getOrders($first: Int!) {
          orders(first: $first, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                updatedAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                displayFulfillmentStatus
                displayFinancialStatus
                customer {
                  id
                  displayName
                }
                lineItems(first: 5) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      customAttributes {
                        key
                        value
                      }
                      variant {
                        id
                        title
                        price
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }`,
      {
        variables: {
          first: 20,
        },
      }
    );

    const responseJson = await response.json();
    const orders = responseJson.data.orders.edges.map(edge => edge.node);
    const pageInfo = responseJson.data.orders.pageInfo;

    // 保存到缓存
    await saveOrdersToCache(orders, pageInfo);

    return new Response(JSON.stringify({ 
      success: true, 
      message: '缓存更新成功',
      ordersCount: orders.length 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('更新缓存失败:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '更新缓存失败: ' + error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
