import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  try {
    // 动态导入服务器端模块
    const { mergeOrdersToCache } = await import("../services/cache.server");
    
    // 循环获取所有订单
    let allOrders = [];
    let hasNextPage = true;
    let afterCursor = null;
    
    const orderQuery = `#graphql
      query getOrders($first: Int!, $after: String) {
        orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
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
      }`;
    
    while (hasNextPage) {
      const response = await admin.graphql(orderQuery, {
        variables: {
          first: 50,
          ...(afterCursor && { after: afterCursor }),
        },
      });

      const responseJson = await response.json();
      const orders = responseJson.data.orders.edges.map(edge => edge.node);
      const pageInfo = responseJson.data.orders.pageInfo;
      
      allOrders = allOrders.concat(orders);
      hasNextPage = pageInfo.hasNextPage;
      afterCursor = pageInfo.endCursor;
      
      // 安全措施：最多获取500个订单，避免无限循环
      if (allOrders.length >= 500) {
        break;
      }
    }

    // 合并新订单到现有缓存（增量更新）
    const mergeResult = await mergeOrdersToCache(allOrders);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `缓存更新成功：新增 ${mergeResult.addedCount} 个订单`,
      addedCount: mergeResult.addedCount,
      totalCount: mergeResult.totalCount
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
