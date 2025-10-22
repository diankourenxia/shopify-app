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

    // 保存所有订单到缓存
    const finalPageInfo = {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    };
    
    await saveOrdersToCache(allOrders, finalPageInfo);

    return new Response(JSON.stringify({ 
      success: true, 
      message: '缓存自动更新成功',
      ordersCount: allOrders.length,
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
