import { useLoaderData, useParams, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
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
  Modal,
  Spinner,
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
          displayFulfillmentStatus
          displayFinancialStatus
          note
          tags
          customer {
            id
            displayName
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
                  image {
                    url
                    altText
                  }
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
          fulfillments {
            id
            status
            createdAt
            trackingInfo {
              number
              url
              company
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
  const sfFetcher = useFetcher();
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printResult, setPrintResult] = useState(null);

  // 处理打印结果
  useEffect(() => {
    if (sfFetcher.data) {
      if (sfFetcher.data.success) {
        setPrintResult(sfFetcher.data);
        setShowPrintModal(true);
        shopify.toast.show(`运单创建成功！运单号：${sfFetcher.data.waybillNo}`, { 
          duration: 5000 
        });
        
        // 如果有打印URL，自动在新窗口打开
        if (sfFetcher.data.printUrl) {
          window.open(sfFetcher.data.printUrl, '_blank');
        }
      } else if (sfFetcher.data.error) {
        shopify.toast.show(`操作失败：${sfFetcher.data.error}`, { 
          duration: 5000, 
          isError: true 
        });
      }
    }
  }, [sfFetcher.data]);

  // 创建并打印运单
  const handleCreateAndPrint = () => {
    const formData = new FormData();
    formData.append("action", "createAndPrint");
    formData.append("orderId", order.id);
    sfFetcher.submit(formData, { 
      method: "POST", 
      action: "/api/sf-express" 
    });
  };

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
    // 修复：确保 amount 是数字且有效，避免 NaN，currencyCode 为空时默认 CNY
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currencyCode || 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(Number(amount)) ? Number(amount) : 0);
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

  // 检测是否为小样订单（所有商品价格都是$1.99）
  const isSampleOrder = (lineItems) => {
    if (!lineItems?.edges || lineItems.edges.length === 0) {
      return false;
    }
    
    return lineItems.edges.every(({ node: item }) => {
      const price = parseFloat(
        item.discountedUnitPriceSet?.shopMoney?.amount || 
        item.originalUnitPriceSet?.shopMoney?.amount || 
        '0'
      );
      return price === 1.99;
    });
  };

  // 解析customAttributes中的尺寸信息并转换为厘米
  const parseDimensions = (customAttributes, item) => {
    if (!customAttributes || !Array.isArray(customAttributes)) {
      return null;
    }

    const dimensions = {};
    
    // 头部名称映射表
    const headerMapping = {
      'Pinch Pleat - Double': '韩褶-L型-2折',
      'Pinch Pleat - Triple': '韩褶-L型-3折',
      'Euro Pleat - Double': '韩褶-7型-2折',
      'Euro Pleat - Triple': '韩褶-7型-3折',
      'Rod Pocket': '穿杆带遮轨',
      'Grommet Top': '打孔',
      'Ripple Fold': '蛇形帘（铆钉）',
      'Ripple Fold  吊环挂钩（四合一）': '蛇形帘（挂钩）',
      'Flat Panel': '吊环挂钩（四合一）',
      'Back Tab': '背带式'
    };
    
    // 打孔颜色映射表
    const grommetColorMapping = {
      'Black': '黑色',
      'Silver': '银色',
      'Bronze': '青铜色',
      'Gold': '金色'
    };
    
    // 里料类型映射表
    const liningTypeMapping = {
      'White_Shading Rate 100%': '漂白春亚纺1#',
      'White_Shading Rate 30%': '18-1',
      'Beige_Shading Rate 50%': 'A60-2',
      'Black_Shading Rate 80%': 'A60-28',
      'Black_Shading Rate 100%': '2019-18'
    };
    
    customAttributes.forEach(attr => {
      const key = attr.key;
      const value = attr.value;
      
      if(key.includes('Header')) {
        const headerValue = value.split('(')[0].trim();
        dimensions.header = headerMapping[headerValue] || headerValue;
      }
      if(key.includes('GROMMET COLOR')) {
        dimensions.grommetColor = grommetColorMapping[value] || value;
      }
      if(key.includes('Lining Type')) {
        const liningValue = value.split('(')[0].trim();
        dimensions.liningType = liningTypeMapping[liningValue] || liningValue;
      }
      if(key.includes('Body Memory Shaped')) {
        dimensions.bodyMemory = '需要';
      }
      if(key.includes('Tieback')) {
        dimensions.tieback = value=='No Need'? '无': '有';
      }
      if(key.includes('Room Name')) {
        dimensions.room = value
      }
      
      // 查找包含尺寸信息的属性
      if (key.includes('Width') || key.includes('Length') || key.includes('Height')) {
        // 提取数字部分 (英寸)
        const inchMatch = value.match(/(\d+(?:\.\d+)?)/);
        if (inchMatch) {
          const inches = parseFloat(inchMatch[1]);
          const centimeters = Math.round(inches * 2.54 * 100) / 100; // 转换为厘米，保留2位小数
          
          if (key.includes('Width')) {
            dimensions.width = centimeters;
          } else if (key.includes('Length') || key.includes('Height')) {
            dimensions.length = centimeters;
          }
        }
      }
    });
    
    // 如果有尺寸信息，返回格式化的React元素
    if (dimensions.width || dimensions.length || dimensions.header || dimensions.tieback || dimensions.room || dimensions.liningType || dimensions.bodyMemory) {
      const parts = [];
      parts.push(`数量: ${item.quantity}`);
      if(dimensions.header) {
        let headerText = dimensions.header;
        if (dimensions.grommetColor) {
          headerText += `（${dimensions.grommetColor}）`;
        }
        parts.push(`头部: ${headerText}`);
      }
      if (dimensions.width) parts.push(`宽: ${dimensions.width}cm`);
      if (dimensions.length) parts.push(`高: ${dimensions.length}cm`);
      if(dimensions.liningType) parts.push(`里料: ${dimensions.liningType}`);
      if(dimensions.bodyMemory) parts.push(`高温定型: ${dimensions.bodyMemory}`);
      if(dimensions.tieback) parts.push(`绑带: ${dimensions.tieback}`);
      if(dimensions.room) parts.push(`房间: ${dimensions.room}`);
      
      return (
        <div style={{ lineHeight: '1.4' }}>
          {parts.map((part, index) => (
            <div key={index}>{part}</div>
          ))}
        </div>
      );
    }
    
    return null;
  };

  const lineItemRows = order.lineItems.edges.map(({ node: item }) => {
    const dimensions = parseDimensions(item.customAttributes, item);
    return [
      item.title,
      item.variant?.sku || '-',
      item.quantity,
      dimensions || '无尺寸信息',
      formatCurrency(
        item.originalUnitPriceSet.shopMoney.amount,
        item.originalUnitPriceSet.shopMoney.currencyCode
      ),
      formatCurrency(
        item.discountedUnitPriceSet.shopMoney.amount,
        item.discountedUnitPriceSet.shopMoney.currencyCode
      ),
      formatCurrency(
        parseFloat(item.discountedUnitPriceSet.shopMoney.amount) * item.quantity,
        item.discountedUnitPriceSet.shopMoney.currencyCode
      ),
    ];
  });

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
                      {isSampleOrder(order.lineItems) && (
                        <span style={{ marginLeft: '8px' }}>
                          <Badge tone="info">小样订单</Badge>
                        </span>
                      )}
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
                  columnContentTypes={['text', 'text', 'numeric', 'text', 'text', 'text', 'text']}
                  headings={['商品名称', 'SKU', '数量', '尺寸(cm)', '原价', '售价', '小计']}
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
                  onClick={handleCreateAndPrint}
                  loading={sfFetcher.state === "submitting"}
                  variant="primary"
                >
                  创建运单并打印
                </Button>
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

      {/* 打印结果 Modal */}
      <Modal
        open={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="运单创建成功"
        primaryAction={{
          content: '关闭',
          onAction: () => setShowPrintModal(false),
        }}
        secondaryActions={printResult?.printUrl ? [
          {
            content: '重新打开打印页面',
            onAction: () => window.open(printResult.printUrl, '_blank'),
          }
        ] : []}
      >
        <Modal.Section>
          {printResult && (
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="bodyMd">
                    <strong>运单号：</strong>{printResult.waybillNo}
                  </Text>
                  {printResult.printUrl && (
                    <Text variant="bodyMd">
                      <strong>打印地址：</strong>
                      <a 
                        href={printResult.printUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#2c6ecb', textDecoration: 'underline' }}
                      >
                        {printResult.printUrl}
                      </a>
                    </Text>
                  )}
                </BlockStack>
              </Card>
              
              <Text variant="bodyMd" tone="success">
                ✅ 运单已创建成功！{printResult.printUrl ? '打印页面已在新窗口打开。' : ''}
              </Text>
              
              {!printResult.printUrl && (
                <Text variant="bodyMd" tone="subdued">
                  请在顺丰系统中使用运单号查询并打印。
                </Text>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
