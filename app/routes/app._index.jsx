import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  
  // 获取店铺详细信息
  let shopInfo = null;
  let currentStaffMember = null;
  
  try {
    const response = await admin.graphql(`
      query {
        shop {
          name
          email
          myshopifyDomain
          currencyCode
          primaryDomain {
            url
            host
          }
          plan {
            displayName
          }
          billingAddress {
            country
            province
            city
          }
        }
      }
    `);
    const data = await response.json();
    shopInfo = data.data?.shop;
  } catch (error) {
    console.error('Error fetching shop info:', error);
  }
  
  // 尝试获取当前登录的员工信息（仅在线访问令牌可用）
  try {
    const staffResponse = await admin.graphql(`
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            createdAt
          }
        }
      }
    `);
    const staffData = await staffResponse.json();
    currentStaffMember = staffData.data?.currentAppInstallation;
  } catch (error) {
    console.error('Error fetching staff info:', error);
  }
  
  return json({ 
    shop: session?.shop || "Unknown Shop",
    sessionInfo: {
      id: session?.id,
      shop: session?.shop,
      state: session?.state,
      isOnline: session?.isOnline,
      scope: session?.scope,
      accessToken: session?.accessToken ? '***' : null,
      // 在线 token 才有的用户信息
      onlineAccessInfo: session?.onlineAccessInfo || null,
    },
    shopInfo,
    currentStaffMember
  });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
  };
};

export default function Index() {
  const { shop, sessionInfo, shopInfo, currentStaffMember } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [appBridgeUser, setAppBridgeUser] = useState(null);
  
  // 通过 App Bridge 获取用户信息（前端方式）
  useEffect(() => {
    async function fetchUserFromAppBridge() {
      try {
        // App Bridge 提供的用户信息
        const userInfo = {
          shopOrigin: shopify.config.shop,
          apiKey: shopify.config.apiKey,
          // 注意：App Bridge 本身不直接提供用户详细信息
          // 但可以通过 sessionToken 解码获取
        };
        
        // 尝试通过 idToken 获取用户信息
        if (shopify.idToken) {
          try {
            const token = await shopify.idToken();
            // 解码 JWT token (简单解析，生产环境应使用库)
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(base64));
            
            setAppBridgeUser({
              ...userInfo,
              tokenPayload: payload,
              userId: payload.sub,
              shopId: payload.dest?.split('/')?.[4],
            });
          } catch (e) {
            console.log('Could not decode token:', e);
            setAppBridgeUser(userInfo);
          }
        } else {
          setAppBridgeUser(userInfo);
        }
      } catch (error) {
        console.error('Error fetching user from App Bridge:', error);
      }
    }
    
    fetchUserFromAppBridge();
  }, [shopify]);
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <Page>
      <TitleBar title="Remix app template">
        <button variant="primary" onClick={generateProduct}>
          Generate a product
        </button>
      </TitleBar>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                   Welcome, {shopInfo?.name || shop}
                  </Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Store: {shopInfo?.myshopifyDomain || shop}
                    {shopInfo?.email && ` • Email: ${shopInfo.email}`}
                    {shopInfo?.plan?.displayName && ` • Plan: ${shopInfo.plan.displayName}`}
                  </Text>
                  <Text variant="bodyMd" as="p">
                    This embedded app template uses{" "}
                    <Link
                      url="https://shopify.dev/docs/apps/tools/app-bridge"
                      target="_blank"
                      removeUnderline
                    >
                      App Bridge
                    </Link>{" "}
                    interface examples like an{" "}
                    <Link url="/app/additional" removeUnderline>
                      additional page in the app nav
                    </Link>
                    , as well as an{" "}
                    <Link
                      url="https://shopify.dev/docs/api/admin-graphql"
                      target="_blank"
                      removeUnderline
                    >
                      Admin GraphQL
                    </Link>{" "}
                    mutation demo, to provide a starting point for app
                    development.
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    账号信息 (调试)
                  </Text>
                  <Box
                    padding="400"
                    background="bg-surface-secondary"
                    borderWidth="025"
                    borderRadius="200"
                    borderColor="border"
                  >
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Session 信息:</Text>
                      <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                        <code>{JSON.stringify(sessionInfo, null, 2)}</code>
                      </pre>
                      
                      {sessionInfo?.onlineAccessInfo && (
                        <>
                          <Text as="p" variant="bodyMd" fontWeight="semibold" tone="success">
                            ✅ 当前访问用户信息 (在线 Token - 服务器端):
                          </Text>
                          <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                            <code>{JSON.stringify(sessionInfo.onlineAccessInfo, null, 2)}</code>
                          </pre>
                        </>
                      )}
                      
                      {appBridgeUser && (
                        <>
                          <Text as="p" variant="bodyMd" fontWeight="semibold" tone="info">
                            🌐 App Bridge 用户信息 (前端获取):
                          </Text>
                          <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                            <code>{JSON.stringify(appBridgeUser, null, 2)}</code>
                          </pre>
                        </>
                      )}
                      
                      {!sessionInfo?.onlineAccessInfo && sessionInfo?.isOnline === false && (
                        <Text as="p" variant="bodyMd" tone="warning">
                          ⚠️ 当前使用离线访问令牌，服务器端无法获取具体访问用户信息
                          <br />
                          💡 已启用在线令牌，请重新安装应用或等待令牌更新
                        </Text>
                      )}
                      
                     
                    </BlockStack>
                  </Box>
                </BlockStack>
                <BlockStack gap="200">
                              
                </BlockStack>
                <InlineStack gap="300">
                  <Button loading={isLoading} onClick={generateProduct}>
                    Generate a product
                  </Button>
                  {fetcher.data?.product && (
                    <Button
                      url={`shopify:admin/products/${productId}`}
                      target="_blank"
                      variant="plain"
                    >
                      View product
                    </Button>
                  )}
                </InlineStack>
                {fetcher.data?.product && (
                  <>
                    <Text as="h3" variant="headingMd">
                      {" "}
                      productCreate mutation
                    </Text>
                    <Box
                      padding="400"
                      background="bg-surface-active"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      overflowX="scroll"
                    >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(fetcher.data.product, null, 2)}
                        </code>
                      </pre>
                    </Box>
                    <Text as="h3" variant="headingMd">
                      {" "}
                      productVariantsBulkUpdate mutation
                    </Text>
                    <Box
                      padding="400"
                      background="bg-surface-active"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      overflowX="scroll"
                    >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(fetcher.data.variant, null, 2)}
                        </code>
                      </pre>
                    </Box>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    App template specs
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Framework
                      </Text>
                      <Link
                        url="https://remix.run"
                        target="_blank"
                        removeUnderline
                      >
                        Remix
                      </Link>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Database
                      </Text>
                      <Link
                        url="https://www.prisma.io/"
                        target="_blank"
                        removeUnderline
                      >
                        Prisma
                      </Link>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Interface
                      </Text>
                      <span>
                        <Link
                          url="https://polaris.shopify.com"
                          target="_blank"
                          removeUnderline
                        >
                          Polaris
                        </Link>
                        {", "}
                        <Link
                          url="https://shopify.dev/docs/apps/tools/app-bridge"
                          target="_blank"
                          removeUnderline
                        >
                          App Bridge
                        </Link>
                      </span>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        API
                      </Text>
                      <Link
                        url="https://shopify.dev/docs/api/admin-graphql"
                        target="_blank"
                        removeUnderline
                      >
                        GraphQL API
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Next steps
                  </Text>
                  <List>
                    <List.Item>
                      Build an{" "}
                      <Link
                        url="https://shopify.dev/docs/apps/getting-started/build-app-example"
                        target="_blank"
                        removeUnderline
                      >
                        {" "}
                        example app
                      </Link>{" "}
                      to get started
                    </List.Item>
                    <List.Item>
                      Explore Shopify’s API with{" "}
                      <Link
                        url="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
                        target="_blank"
                        removeUnderline
                      >
                        GraphiQL
                      </Link>
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
