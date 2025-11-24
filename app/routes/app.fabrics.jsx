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
  DataTable,
  TextField,
  Modal,
  Text,
  Badge,
  EmptyState,
  Tabs,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 获取所有布料及其最新价格
  const fabrics = await prisma.fabric.findMany({
    include: {
      colors: {
        include: {
          prices: {
            orderBy: { effectiveDate: 'desc' },
            take: 1
          }
        }
      },
      prices: {
        orderBy: { effectiveDate: 'desc' },
        take: 1
      }
    },
    orderBy: { code: 'asc' }
  });

  return json({ fabrics });
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const prisma = (await import("../db.server")).default;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "createFabric") {
    const code = formData.get("code");
    const name = formData.get("name");
    const fabricPrice = parseFloat(formData.get("fabricPrice"));
    const liningPrice = parseFloat(formData.get("liningPrice"));

    try {
      const fabric = await prisma.fabric.create({
        data: {
          code,
          name,
          prices: {
            create: {
              fabricPrice,
              liningPrice,
            }
          }
        }
      });

      return json({ success: true, fabric });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "addColor") {
    const fabricId = formData.get("fabricId");
    const colorCode = formData.get("colorCode");
    const colorName = formData.get("colorName");
    const fabricCode = formData.get("fabricCode");
    const fullCode = `${fabricCode}-${colorCode}`;

    try {
      const color = await prisma.fabricColor.create({
        data: {
          fabricId,
          colorCode,
          colorName,
          fullCode,
        }
      });

      return json({ success: true, color });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "updateFabricPrice") {
    const fabricId = formData.get("fabricId");
    const fabricPrice = parseFloat(formData.get("fabricPrice"));
    const liningPrice = parseFloat(formData.get("liningPrice"));

    try {
      const price = await prisma.fabricPrice.create({
        data: {
          fabricId,
          fabricPrice,
          liningPrice,
        }
      });

      return json({ success: true, price });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "updateColorPrice") {
    const colorId = formData.get("colorId");
    const fabricPrice = parseFloat(formData.get("fabricPrice"));
    const liningPrice = parseFloat(formData.get("liningPrice"));

    try {
      const price = await prisma.fabricColorPrice.create({
        data: {
          colorId,
          fabricPrice,
          liningPrice,
        }
      });

      return json({ success: true, price });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "getPriceHistory") {
    const type = formData.get("type");
    const id = formData.get("id");

    try {
      if (type === "fabric") {
        const prices = await prisma.fabricPrice.findMany({
          where: { fabricId: id },
          orderBy: { effectiveDate: 'desc' }
        });
        return json({ success: true, prices });
      } else {
        const prices = await prisma.fabricColorPrice.findMany({
          where: { colorId: id },
          orderBy: { effectiveDate: 'desc' }
        });
        return json({ success: true, prices });
      }
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "deleteFabric") {
    const fabricId = formData.get("fabricId");

    try {
      // 删除布料（会级联删除关联的颜色和价格）
      await prisma.fabric.delete({
        where: { id: fabricId }
      });

      return json({ success: true, message: "布料已删除" });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "deleteColor") {
    const colorId = formData.get("colorId");

    try {
      // 删除颜色（会级联删除关联的价格）
      await prisma.fabricColor.delete({
        where: { id: colorId }
      });

      return json({ success: true, message: "颜色已删除" });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  if (action === "deleteAllFabrics") {
    try {
      // 删除所有布料数据（会级联删除所有相关数据）
      await prisma.fabric.deleteMany({});

      return json({ success: true, message: "所有布料数据已清空" });
    } catch (error) {
      return json({ error: error.message }, { status: 400 });
    }
  }

  return json({ error: "未知操作" }, { status: 400 });
};

export default function Fabrics() {
  const { fabrics: initialFabrics } = useLoaderData();
  const fetcher = useFetcher();
  const syncFetcher = useFetcher();
  
  const [fabrics, setFabrics] = useState(initialFabrics);
  const [showNewFabricModal, setShowNewFabricModal] = useState(false);
  const [showAddColorModal, setShowAddColorModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedFabric, setSelectedFabric] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);

  // 新建布料表单
  const [newFabric, setNewFabric] = useState({
    code: '',
    name: '',
    fabricPrice: '',
    liningPrice: ''
  });

  // 新增颜色表单
  const [newColor, setNewColor] = useState({
    colorCode: '',
    colorName: ''
  });

  // 价格编辑表单
  const [priceForm, setPriceForm] = useState({
    fabricPrice: '',
    liningPrice: ''
  });

  useEffect(() => {
    if (fetcher.data?.prices) {
      // 获取价格历史数据
      setPriceHistory(fetcher.data.prices);
    } else if (fetcher.data?.success && fetcher.data?.message) {
      // 删除操作或其他需要刷新的操作
      alert(fetcher.data.message);
      window.location.reload();
    } else if (fetcher.data?.success) {
      // 其他成功操作，重新加载数据
      window.location.reload();
    } else if (fetcher.data?.error) {
      alert(fetcher.data.error);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (syncFetcher.data?.success) {
      alert(syncFetcher.data.message);
      window.location.reload();
    } else if (syncFetcher.data?.error) {
      alert(`同步失败: ${syncFetcher.data.error}`);
    }
  }, [syncFetcher.data]);

  const handleSyncFabrics = () => {
    if (confirm('确定要从订单中同步布料信息吗？')) {
      syncFetcher.submit({}, { method: "POST", action: "/api/sync-fabrics" });
    }
  };

  const handleDeleteAllFabrics = () => {
    if (confirm('⚠️ 警告：此操作将删除所有布料、颜色和价格数据，且无法恢复！\n\n确定要继续吗？')) {
      if (confirm('请再次确认：真的要删除所有数据吗？')) {
        const formData = new FormData();
        formData.append("action", "deleteAllFabrics");
        fetcher.submit(formData, { method: "POST" });
      }
    }
  };

  const handleDeleteFabric = (fabricId) => {
    if (confirm('确定要删除这个布料吗？删除后相关的颜色和价格记录也会被删除。')) {
      const formData = new FormData();
      formData.append("action", "deleteFabric");
      formData.append("fabricId", fabricId);
      fetcher.submit(formData, { method: "POST" });
    }
  };

  const handleDeleteColor = (colorId) => {
    if (confirm('确定要删除这个颜色吗？删除后相关的价格记录也会被删除。')) {
      const formData = new FormData();
      formData.append("action", "deleteColor");
      formData.append("colorId", colorId);
      fetcher.submit(formData, { method: "POST" });
    }
  };

  const handleCreateFabric = () => {
    const formData = new FormData();
    formData.append("action", "createFabric");
    formData.append("code", newFabric.code);
    formData.append("name", newFabric.name);
    formData.append("fabricPrice", newFabric.fabricPrice);
    formData.append("liningPrice", newFabric.liningPrice);
    fetcher.submit(formData, { method: "POST" });
    setShowNewFabricModal(false);
  };

  const handleAddColor = () => {
    const formData = new FormData();
    formData.append("action", "addColor");
    formData.append("fabricId", selectedFabric.id);
    formData.append("fabricCode", selectedFabric.code);
    formData.append("colorCode", newColor.colorCode);
    formData.append("colorName", newColor.colorName);
    fetcher.submit(formData, { method: "POST" });
    setShowAddColorModal(false);
  };

  const handleUpdatePrice = () => {
    const formData = new FormData();
    if (selectedColor) {
      formData.append("action", "updateColorPrice");
      formData.append("colorId", selectedColor.id);
    } else {
      formData.append("action", "updateFabricPrice");
      formData.append("fabricId", selectedFabric.id);
    }
    formData.append("fabricPrice", priceForm.fabricPrice);
    formData.append("liningPrice", priceForm.liningPrice);
    fetcher.submit(formData, { method: "POST" });
    setShowPriceModal(false);
  };

  const handleViewHistory = (type, id) => {
    // 先清空旧数据并显示模态框
    setPriceHistory([]);
    setShowHistoryModal(true);
    
    // 然后获取新数据
    const formData = new FormData();
    formData.append("action", "getPriceHistory");
    formData.append("type", type);
    formData.append("id", id);
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

  const fabricRows = fabrics.map(fabric => {
    const latestPrice = fabric.prices[0];
    return [
      fabric.code,
      fabric.name || '-',
      latestPrice ? `¥${latestPrice.fabricPrice.toFixed(2)}` : '-',
      latestPrice ? `¥${latestPrice.liningPrice.toFixed(2)}` : '-',
      fabric.colors.length,
      latestPrice ? formatDate(latestPrice.effectiveDate) : '-',
      <InlineStack gap="200" key={`actions-${fabric.id}`}>
        <Button
          size="slim"
          onClick={() => {
            setSelectedFabric(fabric);
            setSelectedColor(null);
            setShowAddColorModal(true);
            setNewColor({ colorCode: '', colorName: '' });
          }}
        >
          添加颜色
        </Button>
        <Button
          size="slim"
          onClick={() => {
            setSelectedFabric(fabric);
            setSelectedColor(null);
            setShowPriceModal(true);
            setPriceForm({
              fabricPrice: latestPrice?.fabricPrice || '',
              liningPrice: latestPrice?.liningPrice || ''
            });
          }}
        >
          编辑价格
        </Button>
        <Button
          size="slim"
          variant="plain"
          onClick={() => handleViewHistory('fabric', fabric.id)}
        >
          价格历史
        </Button>
        <Button
          size="slim"
          tone="critical"
          onClick={() => handleDeleteFabric(fabric.id)}
        >
          删除
        </Button>
      </InlineStack>
    ];
  });

  const tabs = [
    {
      id: 'fabrics',
      content: '布料材质',
      panelID: 'fabrics-panel',
    },
    {
      id: 'colors',
      content: '颜色管理',
      panelID: 'colors-panel',
    },
  ];

  return (
    <Page>
      <TitleBar title="布料管理" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                {selectedTab === 0 && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">布料材质列表</Text>
                      <InlineStack gap="200">
                        <Button
                          onClick={handleSyncFabrics}
                          loading={syncFetcher.state === 'submitting'}
                        >
                          从订单同步
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => {
                            setShowNewFabricModal(true);
                            setNewFabric({ code: '', name: '', fabricPrice: '', liningPrice: '' });
                          }}
                        >
                          新建布料
                        </Button>
                        <Button
                          variant="primary"
                          tone="critical"
                          onClick={handleDeleteAllFabrics}
                        >
                          清空所有数据
                        </Button>
                      </InlineStack>
                    </InlineStack>

                    {fabrics.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text', 'text']}
                        headings={['布料编号', '布料名称', '布料价格', '内衬价格', '颜色数量', '更新时间', '操作']}
                        rows={fabricRows}
                      />
                    ) : (
                      <EmptyState
                        heading="暂无布料数据"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>点击"新建布料"开始添加布料信息</p>
                      </EmptyState>
                    )}
                  </BlockStack>
                )}

                {selectedTab === 1 && (
                  <BlockStack gap="400">
                    <Text variant="headingMd">颜色列表</Text>
                    {fabrics.flatMap(fabric => 
                      fabric.colors.map(color => {
                        const colorPrice = color.prices[0];
                        const fabricPrice = fabric.prices[0];
                        const effectivePrice = colorPrice || fabricPrice;
                        
                        return (
                          <Card key={color.id}>
                            <BlockStack gap="300">
                              <InlineStack align="space-between">
                                <BlockStack gap="200">
                                  <Text variant="headingSm">{color.fullCode}</Text>
                                  <Text variant="bodyMd" tone="subdued">
                                    {color.colorName || '未命名'}
                                  </Text>
                                  {colorPrice && <Badge tone="success">独立价格</Badge>}
                                </BlockStack>
                                <BlockStack gap="200">
                                  <Text>布料: ¥{effectivePrice?.fabricPrice.toFixed(2) || '-'}</Text>
                                  <Text>内衬: ¥{effectivePrice?.liningPrice.toFixed(2) || '-'}</Text>
                                </BlockStack>
                                <InlineStack gap="200">
                                  <Button
                                    size="slim"
                                    onClick={() => {
                                      setSelectedFabric(fabric);
                                      setSelectedColor(color);
                                      setShowPriceModal(true);
                                      setPriceForm({
                                        fabricPrice: effectivePrice?.fabricPrice || '',
                                        liningPrice: effectivePrice?.liningPrice || ''
                                      });
                                    }}
                                  >
                                    设置价格
                                  </Button>
                                  <Button
                                    size="slim"
                                    variant="plain"
                                    onClick={() => handleViewHistory('color', color.id)}
                                  >
                                    历史记录
                                  </Button>
                                  <Button
                                    size="slim"
                                    tone="critical"
                                    onClick={() => handleDeleteColor(color.id)}
                                  >
                                    删除
                                  </Button>
                                </InlineStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        );
                      })
                    ).length > 0 ? (
                      fabrics.flatMap(fabric => 
                        fabric.colors.map(color => {
                          const colorPrice = color.prices[0];
                          const fabricPrice = fabric.prices[0];
                          const effectivePrice = colorPrice || fabricPrice;
                          
                          return (
                            <Card key={color.id}>
                              <BlockStack gap="300">
                                <InlineStack align="space-between">
                                  <BlockStack gap="200">
                                    <Text variant="headingSm">{color.fullCode}</Text>
                                    <Text variant="bodyMd" tone="subdued">
                                      {color.colorName || '未命名'}
                                    </Text>
                                    {colorPrice && <Badge tone="success">独立价格</Badge>}
                                  </BlockStack>
                                  <BlockStack gap="200">
                                    <Text>布料: ¥{effectivePrice?.fabricPrice.toFixed(2) || '-'}</Text>
                                    <Text>内衬: ¥{effectivePrice?.liningPrice.toFixed(2) || '-'}</Text>
                                  </BlockStack>
                                  <InlineStack gap="200">
                                    <Button
                                      size="slim"
                                      onClick={() => {
                                        setSelectedFabric(fabric);
                                        setSelectedColor(color);
                                        setShowPriceModal(true);
                                        setPriceForm({
                                          fabricPrice: effectivePrice?.fabricPrice || '',
                                          liningPrice: effectivePrice?.liningPrice || ''
                                        });
                                      }}
                                    >
                                      设置价格
                                    </Button>
                                    <Button
                                      size="slim"
                                      variant="plain"
                                      onClick={() => handleViewHistory('color', color.id)}
                                    >
                                      历史记录
                                    </Button>
                                  </InlineStack>
                                </InlineStack>
                              </BlockStack>
                            </Card>
                          );
                        })
                      )
                    ) : (
                      <EmptyState
                        heading="暂无颜色数据"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>请先添加布料，然后为布料添加颜色</p>
                      </EmptyState>
                    )}
                  </BlockStack>
                )}
              </Tabs>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* 新建布料模态框 */}
      <Modal
        open={showNewFabricModal}
        onClose={() => setShowNewFabricModal(false)}
        title="新建布料"
        primaryAction={{
          content: '创建',
          onAction: handleCreateFabric,
          disabled: !newFabric.code || !newFabric.fabricPrice || !newFabric.liningPrice
        }}
        secondaryActions={[{
          content: '取消',
          onAction: () => setShowNewFabricModal(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="布料编号"
              value={newFabric.code}
              onChange={(value) => setNewFabric({ ...newFabric, code: value })}
              placeholder="例如: 8823"
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="布料名称"
              value={newFabric.name}
              onChange={(value) => setNewFabric({ ...newFabric, name: value })}
              placeholder="可选"
              autoComplete="off"
            />
            <TextField
              label="布料价格（¥/米）"
              type="number"
              value={newFabric.fabricPrice}
              onChange={(value) => setNewFabric({ ...newFabric, fabricPrice: value })}
              placeholder="0.00"
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="内衬价格（¥/米）"
              type="number"
              value={newFabric.liningPrice}
              onChange={(value) => setNewFabric({ ...newFabric, liningPrice: value })}
              placeholder="0.00"
              autoComplete="off"
              requiredIndicator
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* 添加颜色模态框 */}
      <Modal
        open={showAddColorModal}
        onClose={() => setShowAddColorModal(false)}
        title={`为 ${selectedFabric?.code} 添加颜色`}
        primaryAction={{
          content: '添加',
          onAction: handleAddColor,
          disabled: !newColor.colorCode
        }}
        secondaryActions={[{
          content: '取消',
          onAction: () => setShowAddColorModal(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="颜色编号"
              value={newColor.colorCode}
              onChange={(value) => setNewColor({ ...newColor, colorCode: value })}
              placeholder="例如: 1"
              autoComplete="off"
              helpText={`完整编号将为: ${selectedFabric?.code}-${newColor.colorCode || '?'}`}
              requiredIndicator
            />
            <TextField
              label="颜色名称"
              value={newColor.colorName}
              onChange={(value) => setNewColor({ ...newColor, colorName: value })}
              placeholder="可选"
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* 编辑价格模态框 */}
      <Modal
        open={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        title={selectedColor ? `编辑 ${selectedColor.fullCode} 价格` : `编辑 ${selectedFabric?.code} 价格`}
        primaryAction={{
          content: '保存',
          onAction: handleUpdatePrice,
          disabled: !priceForm.fabricPrice || !priceForm.liningPrice
        }}
        secondaryActions={[{
          content: '取消',
          onAction: () => setShowPriceModal(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedColor && (
              <Text variant="bodyMd" tone="subdued">
                设置此颜色的独立价格，将覆盖布料基础价格
              </Text>
            )}
            <TextField
              label="布料价格（¥/米）"
              type="number"
              value={priceForm.fabricPrice}
              onChange={(value) => setPriceForm({ ...priceForm, fabricPrice: value })}
              placeholder="0.00"
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="内衬价格（¥/米）"
              type="number"
              value={priceForm.liningPrice}
              onChange={(value) => setPriceForm({ ...priceForm, liningPrice: value })}
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
                    <InlineStack gap="400">
                      <Text>布料价格: ¥{price.fabricPrice.toFixed(2)}</Text>
                      <Text>内衬价格: ¥{price.liningPrice.toFixed(2)}</Text>
                    </InlineStack>
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
