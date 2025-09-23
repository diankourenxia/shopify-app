import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    // 动态导入服务器端模块
    const { saveOrdersToCache, isCacheValid } = await import("../services/cache.server");
    
    // 检查缓存是否有效
    const cacheValid = await isCacheValid();
    
    if (cacheValid) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: '缓存仍然有效，无需更新',
        cacheValid: true
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // 缓存无效，尝试更新
    const { admin } = await authenticate.admin(request);
    
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
      message: '缓存自动更新成功',
      ordersCount: orders.length,
      cacheValid: false
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('自动更新缓存失败:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '自动更新缓存失败: ' + error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
