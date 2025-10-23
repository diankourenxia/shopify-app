import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  
  if (!orderId) {
    return new Response(JSON.stringify({ comments: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 查询订单的评论事件
    const response = await admin.graphql(
      `#graphql
        query getOrderComments($id: ID!) {
          order(id: $id) {
            events(first: 50, types: [COMMENT_EVENT]) {
              edges {
                node {
                  ... on CommentEvent {
                    id
                    message
                    createdAt
                    author {
                      name
                    }
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
    
    if (responseJson.errors) {
      console.error('GraphQL Errors:', responseJson.errors);
      return new Response(JSON.stringify({ 
        comments: [], 
        error: responseJson.errors[0]?.message 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const comments = responseJson.data?.order?.events?.edges?.map(edge => edge.node) || [];
    
    return new Response(JSON.stringify({ comments }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return new Response(JSON.stringify({ 
      comments: [], 
      error: error.message 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

