import { useLoaderData, useParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineStack,
  Badge,
  Divider,
  DataTable,
  Button,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const orderId = params.id;

  // 获取订单详细信息
  const response = await admin.graphql(
    `#graphql
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          updatedAt
          processedAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
              currencyCode
            }
          }

          displayFulfillmentStatus
          displayFinancialStatus
          note
          tags
          customer {
            id
            displayName
            email
            phone
          }
          shippingAddress {
            address1
            address2
            city
            province
            country
            zip
            phone
          }
          billingAddress {
            address1
            address2
            city
            province
            country
            zip
            phone
          }
          lineItems(first: 50) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              
                variant {
                  id
                  title
                  sku
                  price
                 
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    title
                    handle
                    vendor
                    productType
                  }
                }
                product {
                  id
                  title
                  handle
                  vendor
                  productType
                  description
                  images(first: 3) {
                    edges {
                      node {
                        url
                        altText
                      }
                    }
                  }
                }
                customAttributes {
                  key
                  value
                }
                discountAllocations {
                  allocatedAmountSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
          shippingLines {
            edges {
              node {
                title
               
                code
                carrierIdentifier
                requestedFulfillmentService {
                  id
                  serviceName
                }
              }
            }
          }
          discountApplications(first: 10) {
            edges {
              node {
                ... on DiscountCodeApplication {
                  code
                  value {
                    ... on MoneyV2 {
                      amount
                      currencyCode
                    }
                    ... on PricingPercentageValue {
                      percentage
                    }
                  }
                }
                ... on ScriptDiscountApplication {
                  title
                  value {
                    ... on MoneyV2 {
                      amount
                      currencyCode
                    }
                    ... on PricingPercentageValue {
                      percentage
                    }
                  }
                }
                ... on AutomaticDiscountApplication {
                  title
                  value {
                    ... on MoneyV2 {
                      amount
                      currencyCode
                    }
                    ... on PricingPercentageValue {
                      percentage
                    }
                  }
                }
              }
            }
          }
          taxLines {
            title
            priceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            rate
            ratePercentage
          }
          fulfillments {
            id
            status
            createdAt
            updatedAt
            trackingInfo {
              number
              url
              company
            }
            fulfillmentLineItems(first: 50) {
              edges {
                node {
                  id
                  quantity
                  lineItem {
                    id
                    title
                    variant {
                      id
                      title
                      sku
                    }
                  }
                }
              }
            }
          }
          transactions {
            id
            kind
            status
            amountSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            createdAt
            gateway
            parentTransaction {
              id
              kind
              status
            }
          }
        }
      }`,
    {
      variables: {
        id: `gid://shopify/Order/${orderId}`,
      },
    }
  );

  const responseJson = await response.json();
  const order = responseJson.data.order;
  console.log(1111)
  console.log(order);
  if (!order) {
    throw new Response("Order not found", { status: 404 });
  }

  return { order };
};

export default function OrderDetail() {
  const { order } = useLoaderData();
  const params = useParams();
  const getStatusBadge = (status) => {
    const statusMap = {
      'FULFILLED': { status: 'success', children: '已发货' },
      'UNFULFILLED': { status: 'warning', children: '未发货' },
      'PARTIALLY_FULFILLED': { status: 'attention', children: '部分发货' },
      'PAID': { status: 'success', children: '已支付' },
      'PENDING': { status: 'warning', children: '待支付' },
      'PARTIALLY_PAID': { status: 'attention', children: '部分支付' },
      'REFUNDED': { status: 'info', children: '已退款' },
      'VOIDED': { status: 'critical', children: '已取消' },
    };
    
    return statusMap[status] || { status: 'info', children: status };
  };

  const formatCurrency = (amount, currencyCode) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currencyCode,
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const lineItemRows = order.lineItems.edges.map(({ node: item }) => [
    item.title,
    item.variant?.sku || '-',
    item.product?.vendor || '-',
    item.quantity,
    formatCurrency(
      item.originalUnitPriceSet.shopMoney.amount,
      item.originalUnitPriceSet.shopMoney.currencyCode
    ),
    formatCurrency(
      item.discountedUnitPriceSet.shopMoney.amount,
      item.discountedUnitPriceSet.shopMoney.currencyCode
    ),
    formatCurrency(
      item.originalTotalPriceSet?.shopMoney.amount || 0,
      item.originalTotalPriceSet?.shopMoney.currencyCode || item.originalUnitPriceSet.shopMoney.currencyCode
    ),
    formatCurrency(
      item.discountedTotalPriceSet?.shopMoney.amount || 0,
      item.discountedTotalPriceSet?.shopMoney.currencyCode || item.discountedUnitPriceSet.shopMoney.currencyCode
    ),
    item.discountAllocations?.length > 0 ? 
      formatCurrency(
        item.discountAllocations.reduce((sum, discount) => 
          sum + parseFloat(discount.allocatedAmountSet.shopMoney.amount), 0
        ),
        item.discountAllocations[0].allocatedAmountSet.shopMoney.currencyCode
      ) : '-',
  ]);

  return (
    <Page>
      <TitleBar 
        title={`订单 ${order.name}`}
        breadcrumbs={[
          { content: '订单管理', url: '/app/orders' },
          { content: order.name },
        ]}
      />
      
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* 订单基本信息 */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  订单信息
                </Text>
                <InlineStack gap="400" align="space-between">
                  <BlockStack gap="200">
                    <Text variant="bodyMd">
                      <strong>订单号:</strong> {order.name}
                    </Text>
                    <Text variant="bodyMd">
                      <strong>创建时间:</strong> {formatDate(order.createdAt)}
                    </Text>
                    <Text variant="bodyMd">
                      <strong>处理时间:</strong> {order.processedAt ? formatDate(order.processedAt) : '未处理'}
                    </Text>
                    {order.note && (
                      <Text variant="bodyMd">
                        <strong>备注:</strong> {order.note}
                      </Text>
                    )}
                    {order.tags.length > 0 && (
                      <Text variant="bodyMd">
                        <strong>标签:</strong> {order.tags.join(', ')}
                      </Text>
                    )}
                  </BlockStack>
                  <BlockStack gap="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd">发货状态:</Text>
                      <Badge {...getStatusBadge(order.displayFulfillmentStatus)} />
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text variant="bodyMd">支付状态:</Text>
                      <Badge {...getStatusBadge(order.displayFinancialStatus)} />
                    </InlineStack>
                    <Text variant="bodyLg">
                      <strong>总金额: {formatCurrency(
                        order.totalPriceSet.shopMoney.amount,
                        order.totalPriceSet.shopMoney.currencyCode
                      )}</strong>
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* 客户信息 */}
            {order.customer && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    客户信息
                  </Text>
                  <Text variant="bodyMd">
                    <strong>客户:</strong> {order.customer.displayName}
                  </Text>
                </BlockStack>
              </Card>
            )}

            {/* 收货地址 */}
            {order.shippingAddress && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    收货地址
                  </Text>
                  <Text variant="bodyMd">
                    {order.shippingAddress.address1}
                    {order.shippingAddress.address2 && `, ${order.shippingAddress.address2}`}
                  </Text>
                  <Text variant="bodyMd">
                    {order.shippingAddress.city}, {order.shippingAddress.province}
                  </Text>
                  <Text variant="bodyMd">
                    {order.shippingAddress.country} {order.shippingAddress.zip}
                  </Text>
                  {order.shippingAddress.phone && (
                    <Text variant="bodyMd">
                      <strong>电话:</strong> {order.shippingAddress.phone}
                    </Text>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* 订单商品 */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  订单商品
                </Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'numeric', 'text', 'text', 'text', 'text', 'text']}
                  headings={['商品名称', 'SKU', '供应商', '数量', '原单价', '折扣单价', '原总价', '折扣总价', '商品折扣']}
                  rows={lineItemRows}
                />
              </BlockStack>
            </Card>

            {/* 价格明细 */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  价格明细
                </Text>
                <InlineStack gap="400" align="space-between">
                  <BlockStack gap="200">
                    <Text variant="bodyMd">
                      商品小计: {formatCurrency(
                        order.subtotalPriceSet.shopMoney.amount,
                        order.subtotalPriceSet.shopMoney.currencyCode
                      )}
                    </Text>
                    {order.totalDiscountsSet && parseFloat(order.totalDiscountsSet.shopMoney.amount) > 0 && (
                      <Text variant="bodyMd" tone="success">
                        折扣: -{formatCurrency(
                          order.totalDiscountsSet.shopMoney.amount,
                          order.totalDiscountsSet.shopMoney.currencyCode
                        )}
                      </Text>
                    )}
                    <Text variant="bodyMd">
                      运费: {formatCurrency(
                        order.totalShippingPriceSet.shopMoney.amount,
                        order.totalShippingPriceSet.shopMoney.currencyCode
                      )}
                    </Text>
                    <Text variant="bodyMd">
                      税费: {formatCurrency(
                        order.totalTaxSet.shopMoney.amount,
                        order.totalTaxSet.shopMoney.currencyCode
                      )}
                    </Text>
                  </BlockStack>
                  <Divider />
                  <Text variant="bodyLg">
                    <strong>
                      总计: {formatCurrency(
                        order.totalPriceSet.shopMoney.amount,
                        order.totalPriceSet.shopMoney.currencyCode
                      )}
                    </strong>
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* 折扣详情 */}
            {order.discountApplications && order.discountApplications.edges.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    折扣详情
                  </Text>
                  {order.discountApplications.edges.map(({ node: discount }, index) => (
                    <BlockStack key={index} gap="200">
                      <InlineStack gap="300" align="space-between">
                        <Text variant="bodyMd">
                          <strong>
                            {discount.code || discount.title || '折扣'}
                          </strong>
                        </Text>
                        <Text variant="bodyMd">
                          {discount.value?.amount ? 
                            formatCurrency(discount.value.amount, discount.value.currencyCode) :
                            `${discount.value?.percentage || 0}%`
                          }
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {/* 配送信息 */}
            {order.shippingLines && order.shippingLines.edges.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    配送信息
                  </Text>
                  {order.shippingLines.edges.map(({ node: shipping }, index) => (
                    <BlockStack key={index} gap="200">
                      <InlineStack gap="300" align="space-between">
                        <Text variant="bodyMd">
                          <strong>{shipping.title}</strong>
                          {shipping.code && ` (${shipping.code})`}
                        </Text>
                        <Text variant="bodyMd">
                          {formatCurrency(
                            shipping.priceSet.shopMoney.amount,
                            shipping.priceSet.shopMoney.currencyCode
                          )}
                        </Text>
                      </InlineStack>
                      {shipping.carrierIdentifier && (
                        <Text variant="bodyMd" tone="subdued">
                          承运商: {shipping.carrierIdentifier}
                        </Text>
                      )}
                      {shipping.requestedFulfillmentService && (
                        <Text variant="bodyMd" tone="subdued">
                          配送服务: {shipping.requestedFulfillmentService.serviceName}
                        </Text>
                      )}
                    </BlockStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {/* 税费详情 */}
            {order.taxLines && order.taxLines.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    税费详情
                  </Text>
                  {order.taxLines.map((tax, index) => (
                    <BlockStack key={index} gap="200">
                      <InlineStack gap="300" align="space-between">
                        <Text variant="bodyMd">
                          <strong>{tax.title}</strong>
                          {tax.ratePercentage && ` (${tax.ratePercentage}%)`}
                        </Text>
                        <Text variant="bodyMd">
                          {formatCurrency(
                            tax.priceSet.shopMoney.amount,
                            tax.priceSet.shopMoney.currencyCode
                          )}
                        </Text>
                      </InlineStack>
                      {tax.rate && (
                        <Text variant="bodyMd" tone="subdued">
                          税率: {tax.rate}
                        </Text>
                      )}
                    </BlockStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {/* 发货信息 */}
            {order.fulfillments.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    发货信息
                  </Text>
                  {order.fulfillments.map((fulfillment) => (
                    <BlockStack key={fulfillment.id} gap="200">
                      <Text variant="bodyMd">
                        <strong>发货时间:</strong> {formatDate(fulfillment.createdAt)}
                      </Text>
                      <Text variant="bodyMd">
                        <strong>状态:</strong> {fulfillment.status}
                      </Text>
                      {fulfillment.trackingInfo && (
                        <Text variant="bodyMd">
                          <strong>物流单号:</strong> {fulfillment.trackingInfo.number}
                        </Text>
                      )}
                    </BlockStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {/* 交易记录 */}
            {order.transactions.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    交易记录
                  </Text>
                  {order.transactions.map((transaction) => (
                    <BlockStack key={transaction.id} gap="200">
                      <InlineStack gap="400" align="space-between">
                        <Text variant="bodyMd">
                          <strong>{transaction.kind}:</strong> {transaction.status}
                        </Text>
                        <Text variant="bodyMd">
                          {formatCurrency(
                            transaction.amountSet.shopMoney.amount,
                            transaction.amountSet.shopMoney.currencyCode
                          )}
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd">
                        {formatDate(transaction.createdAt)} - {transaction.gateway}
                      </Text>
                    </BlockStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {/* 操作按钮 */}
            <Card>
              <InlineStack gap="300">
                <Button
                  url={`shopify:admin/orders/${params.id}`}
                  target="_blank"
                >
                  在Shopify中查看
                </Button>
                <Button
                  url={`shopify:admin/orders/${params.id}/edit`}
                  target="_blank"
                  variant="secondary"
                >
                  编辑订单
                </Button>
                <Link url="/app/orders">
                  <Button variant="plain">返回订单列表</Button>
                </Link>
              </InlineStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
