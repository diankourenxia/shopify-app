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

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
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
  await authenticate.admin(request);
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
    } else if (fetcher.data?.success && fetcher.data?.message) {
      alert(fetcher.data.message);
      window.location.reload();
    } else if (fetcher.data?.success) {
      window.location.reload();
    } else if (fetcher.data?.error) {
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
