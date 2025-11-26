import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Modal,
  Text,
  Badge,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { requirePermission } from "../utils/permissions.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 检查权限，受限用户会被重定向到订单页面
  await requirePermission(session, 'admin', prisma);
  
  // 获取所有衬布及其最新价格
  const linings = await prisma.lining.findMany({
    include: {
      prices: {
        orderBy: { effectiveDate: 'desc' },
        take: 1
      }
    },
    orderBy: { type: 'asc' }
  });

  return json({ linings });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 检查权限
  await requirePermission(session, 'admin', prisma);
  const prisma = (await import("../db.server")).default;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "createLining") {
    const type = formData.get("type");
    const price = parseFloat(formData.get("price"));
    const description = formData.get("description");

    try {
      const lining = await prisma.lining.create({
        data: {
          type,
          price,
          description,
          prices: {
            create: {
              price,
            }
          }
        }
      });

      return json({ success: true, lining });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "updateLiningPrice") {
    const liningId = formData.get("liningId");
    const price = parseFloat(formData.get("price"));

    try {
      // 更新当前价格
      await prisma.lining.update({
        where: { id: liningId },
        data: { price }
      });

      // 创建价格历史记录
      await prisma.liningPrice.create({
        data: {
          liningId,
          price,
        }
      });

      return json({ success: true });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "deleteLining") {
    const liningId = formData.get("liningId");

    try {
      await prisma.lining.delete({
        where: { id: liningId }
      });

      return json({ success: true, message: "衬布已删除" });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "getPriceHistory") {
    const liningId = formData.get("liningId");

    try {
      const prices = await prisma.liningPrice.findMany({
        where: { liningId },
        orderBy: { effectiveDate: 'desc' }
      });
      return json({ success: true, prices });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "scanFromOrders") {
    try {
      const { admin } = await authenticate.admin(request);
      
      // 获取所有订单(不限制标签)
      const ordersResponse = await admin.graphql(
        `#graphql
        query {
          orders(first: 250) {
            edges {
              node {
                id
                lineItems(first: 100) {
                  edges {
                    node {
                      id
                      title
                      customAttributes {
                        key
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }`
      );

      const ordersData = await ordersResponse.json();
      const orders = ordersData.data?.orders?.edges || [];

      // 提取所有衬布类型
      const liningTypesSet = new Set();
      const debugInfo = []; // 调试信息
      
      orders.forEach(orderEdge => {
        const lineItems = orderEdge.node.lineItems.edges;
        
        lineItems.forEach(itemEdge => {
          const item = itemEdge.node;
          
          // 调试: 记录所有 customAttributes
          if (item.customAttributes && item.customAttributes.length > 0) {
            const attrs = item.customAttributes.map(a => a.key).join(', ');
            debugInfo.push(`Item: ${item.title}, Attrs: ${attrs}`);
          }
          
          // 从 customAttributes 中找到 _Lining Type
          const liningTypeAttr = item.customAttributes?.find(
            attr => attr.key === '_Lining Type'
          );
          
          if (liningTypeAttr?.value) {
            debugInfo.push(`Found lining: ${liningTypeAttr.value}`);
            const liningValue = liningTypeAttr.value.toLowerCase();
            // 如果是 unlined 或包含 lining type,则跳过,否则提取衬布类型
            if (liningValue !== 'unlined' && !liningValue.includes('lining type')) {
              // 提取括号前的部分作为衬布类型,去除价格信息
              const liningType = liningTypeAttr.value.split('(')[0].trim();
              if (liningType && liningType !== '') {
                liningTypesSet.add(liningType);
                debugInfo.push(`Added type: ${liningType}`);
              }
            }
          }
        });
      });

      // 获取数据库中已存在的衬布类型
      const existingLinings = await prisma.lining.findMany({
        select: { type: true }
      });
      const existingTypes = new Set(existingLinings.map(l => l.type));

      // 导入新的衬布类型
      const newTypes = Array.from(liningTypesSet).filter(
        type => !existingTypes.has(type)
      );

      const importedLinings = [];
      for (const type of newTypes) {
        const lining = await prisma.lining.create({
          data: {
            type,
            price: 0, // 默认价格为0,需要手动设置
            description: '从订单自动导入',
            prices: {
              create: {
                price: 0,
              }
            }
          }
        });
        importedLinings.push(lining);
      }

      return json({ 
        success: true, 
        imported: importedLinings.length,
        types: importedLinings.map(l => l.type),
        total: liningTypesSet.size,
        existing: existingTypes.size,
        debug: debugInfo.slice(0, 50) // 返回前50条调试信息
      });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  return json({ error: "未知操作" }, { status: 400 });
};

export default function Linings() {
  const { linings: initialLinings } = useLoaderData();
  const fetcher = useFetcher();
  
  const [linings, setLinings] = useState(initialLinings);
  const [showNewLiningModal, setShowNewLiningModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedLining, setSelectedLining] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  // 新建衬布表单
  const [newLining, setNewLining] = useState({
    type: '',
    price: '',
    description: ''
  });

  // 价格编辑表单
  const [priceForm, setPriceForm] = useState({
    price: ''
  });

  useEffect(() => {
    if (fetcher.data?.prices) {
      setPriceHistory(fetcher.data.prices);
      setIsScanning(false);
    } else if (fetcher.data?.success && fetcher.data?.message) {
      alert(fetcher.data.message);
      window.location.reload();
    } else if (fetcher.data?.success && fetcher.data?.imported !== undefined) {
      // 扫描导入完成
      setIsScanning(false);
      
      // 显示调试信息
      if (fetcher.data.debug && fetcher.data.debug.length > 0) {
        console.log('=== 衬布扫描调试信息 ===');
        console.log('找到的订单数:', fetcher.data.debug.filter(d => d.includes('Item:')).length);
        console.log('找到的衬布:', fetcher.data.debug.filter(d => d.includes('Found lining:')));
        console.log('添加的类型:', fetcher.data.debug.filter(d => d.includes('Added type:')));
        console.log('所有调试信息:', fetcher.data.debug);
      }
      
      if (fetcher.data.imported > 0) {
        alert(`成功导入 ${fetcher.data.imported} 个新的衬布类型:\n${fetcher.data.types.join('\n')}\n\n请为它们设置价格。`);
        window.location.reload();
      } else {
        alert(`扫描完成！\n总共发现 ${fetcher.data.total} 个衬布类型\n已存在 ${fetcher.data.existing} 个\n无新类型需要导入\n\n查看控制台了解详细信息`);
      }
    } else if (fetcher.data?.success) {
      setIsScanning(false);
      window.location.reload();
    } else if (fetcher.data?.error) {
      setIsScanning(false);
      alert(fetcher.data.error);
    }
  }, [fetcher.data]);

  const handleCreateLining = () => {
    const formData = new FormData();
    formData.append("action", "createLining");
    formData.append("type", newLining.type);
    formData.append("price", newLining.price);
    formData.append("description", newLining.description);
    fetcher.submit(formData, { method: "POST" });
    setShowNewLiningModal(false);
  };

  const handleUpdatePrice = () => {
    const formData = new FormData();
    formData.append("action", "updateLiningPrice");
    formData.append("liningId", selectedLining.id);
    formData.append("price", priceForm.price);
    fetcher.submit(formData, { method: "POST" });
    setShowPriceModal(false);
  };

  const handleDeleteLining = (liningId) => {
    if (confirm('确定要删除这个衬布类型吗？删除后相关的价格记录也会被删除。')) {
      const formData = new FormData();
      formData.append("action", "deleteLining");
      formData.append("liningId", liningId);
      fetcher.submit(formData, { method: "POST" });
    }
  };

  const handleViewHistory = (liningId) => {
    setPriceHistory([]);
    setShowHistoryModal(true);
    
    const formData = new FormData();
    formData.append("action", "getPriceHistory");
    formData.append("liningId", liningId);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleScanFromOrders = () => {
    if (confirm('从订单中扫描衬布类型？\n\n这将会扫描所有已导入的订单,提取衬布类型并自动创建。\n新导入的衬布类型默认价格为0,需要手动设置。')) {
      setIsScanning(true);
      const formData = new FormData();
      formData.append("action", "scanFromOrders");
      fetcher.submit(formData, { method: "POST" });
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Page>
      <TitleBar title="衬布管理" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd">衬布类型列表</Text>
                <InlineStack gap="300">
                  <Button
                    onClick={handleScanFromOrders}
                    loading={isScanning}
                    disabled={isScanning}
                  >
                    {isScanning ? '扫描中...' : '从订单导入'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setShowNewLiningModal(true);
                      setNewLining({ type: '', price: '', description: '' });
                    }}
                  >
                    新建衬布类型
                  </Button>
                </InlineStack>
              </InlineStack>

              {linings.length > 0 ? (
                <BlockStack gap="300">
                  {linings.map(lining => {
                    const latestPrice = lining.prices[0];
                    
                    return (
                      <Card key={lining.id}>
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="200">
                            <Text variant="headingSm">{lining.type}</Text>
                            {lining.description && (
                              <Text variant="bodyMd" tone="subdued">
                                {lining.description}
                              </Text>
                            )}
                          </BlockStack>
                          <InlineStack gap="400" blockAlign="center">
                            <Text variant="headingMd">¥{lining.price.toFixed(2)}/米</Text>
                            <InlineStack gap="200">
                              <Button
                                size="slim"
                                onClick={() => {
                                  setSelectedLining(lining);
                                  setShowPriceModal(true);
                                  setPriceForm({ price: lining.price });
                                }}
                              >
                                编辑价格
                              </Button>
                              <Button
                                size="slim"
                                variant="plain"
                                onClick={() => handleViewHistory(lining.id)}
                              >
                                价格历史
                              </Button>
                              <Button
                                size="slim"
                                tone="critical"
                                onClick={() => handleDeleteLining(lining.id)}
                              >
                                删除
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        </InlineStack>
                      </Card>
                    );
                  })}
                </BlockStack>
              ) : (
                <EmptyState
                  heading="暂无衬布数据"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>点击"新建衬布类型"开始添加衬布信息</p>
                </EmptyState>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* 新建衬布模态框 */}
      <Modal
        open={showNewLiningModal}
        onClose={() => setShowNewLiningModal(false)}
        title="新建衬布类型"
        primaryAction={{
          content: '创建',
          onAction: handleCreateLining,
          disabled: !newLining.type || !newLining.price
        }}
        secondaryActions={[{
          content: '取消',
          onAction: () => setShowNewLiningModal(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="衬布类型名称"
              value={newLining.type}
              onChange={(value) => setNewLining({ ...newLining, type: value })}
              placeholder="例如: No Lining, Standard, Blackout"
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="价格（¥/米）"
              type="number"
              value={newLining.price}
              onChange={(value) => setNewLining({ ...newLining, price: value })}
              placeholder="0.00"
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="描述"
              value={newLining.description}
              onChange={(value) => setNewLining({ ...newLining, description: value })}
              placeholder="可选"
              autoComplete="off"
              multiline={2}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* 编辑价格模态框 */}
      <Modal
        open={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        title={`编辑 ${selectedLining?.type} 价格`}
        primaryAction={{
          content: '保存',
          onAction: handleUpdatePrice,
          disabled: !priceForm.price
        }}
        secondaryActions={[{
          content: '取消',
          onAction: () => setShowPriceModal(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="价格（¥/米）"
              type="number"
              value={priceForm.price}
              onChange={(value) => setPriceForm({ ...priceForm, price: value })}
              placeholder="0.00"
              autoComplete="off"
              requiredIndicator
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* 价格历史模态框 */}
      <Modal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="价格历史记录"
        secondaryActions={[{
          content: '关闭',
          onAction: () => setShowHistoryModal(false)
        }]}
      >
        <Modal.Section>
          {fetcher.state === 'submitting' || fetcher.state === 'loading' ? (
            <Text>加载中...</Text>
          ) : priceHistory.length > 0 ? (
            <BlockStack gap="300">
              {priceHistory.map((price, index) => (
                <Card key={price.id}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="headingSm">
                        {index === 0 && <Badge tone="success">当前价格</Badge>}
                      </Text>
                      <Text variant="bodyMd" tone="subdued">
                        {formatDate(price.effectiveDate)}
                      </Text>
                    </InlineStack>
                    <Text>价格: ¥{price.price.toFixed(2)}/米</Text>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          ) : (
            <Text>暂无历史记录</Text>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
