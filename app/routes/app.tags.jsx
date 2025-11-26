import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Modal,
  TextField,
  FormLayout,
  Badge,
  ButtonGroup,
  BlockStack,
  InlineStack,
  Text,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { requirePermission } from "../utils/permissions.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 检查权限
  await requirePermission(session, 'admin', prisma);
  
  const tags = await prisma.tag.findMany({
    include: {
      _count: {
        select: { orderTags: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  return json({ tags });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 检查权限
  await requirePermission(session, 'admin', prisma);
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "create") {
    const name = formData.get("name");
    const color = formData.get("color") || "#808080";
    const description = formData.get("description") || null;
    
    if (!name) {
      return json({ error: "标签名称不能为空" }, { status: 400 });
    }
    
    try {
      const tag = await prisma.tag.create({
        data: { name, color, description }
      });
      return json({ success: true, tag });
    } catch (error) {
      if (error.code === 'P2002') {
        return json({ error: "标签名称已存在" }, { status: 400 });
      }
      return json({ error: "创建失败" }, { status: 500 });
    }
  }
  
  if (action === "update") {
    const id = formData.get("id");
    const name = formData.get("name");
    const color = formData.get("color");
    const description = formData.get("description") || null;
    
    if (!id || !name) {
      return json({ error: "参数错误" }, { status: 400 });
    }
    
    try {
      const tag = await prisma.tag.update({
        where: { id },
        data: { name, color, description }
      });
      return json({ success: true, tag });
    } catch (error) {
      if (error.code === 'P2002') {
        return json({ error: "标签名称已存在" }, { status: 400 });
      }
      return json({ error: "更新失败" }, { status: 500 });
    }
  }
  
  if (action === "delete") {
    const id = formData.get("id");
    
    if (!id) {
      return json({ error: "参数错误" }, { status: 400 });
    }
    
    try {
      await prisma.tag.delete({ where: { id } });
      return json({ success: true });
    } catch (error) {
      return json({ error: "删除失败" }, { status: 500 });
    }
  }
  
  return json({ error: "未知操作" }, { status: 400 });
};

export default function Tags() {
  const { tags: initialTags } = useLoaderData();
  const fetcher = useFetcher();
  
  const [tags, setTags] = useState(initialTags);
  const [modalActive, setModalActive] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    color: "#808080",
    description: ""
  });
  
  // 预定义颜色
  const colorOptions = [
    { value: "#808080", label: "灰色" },
    { value: "#3b82f6", label: "蓝色" },
    { value: "#10b981", label: "绿色" },
    { value: "#f59e0b", label: "橙色" },
    { value: "#ef4444", label: "红色" },
    { value: "#8b5cf6", label: "紫色" },
    { value: "#ec4899", label: "粉色" },
    { value: "#06b6d4", label: "青色" },
  ];
  
  useEffect(() => {
    if (fetcher.data?.success) {
      // 刷新标签列表
      if (fetcher.data.tag) {
        if (editingTag) {
          setTags(tags.map(t => t.id === fetcher.data.tag.id ? { ...fetcher.data.tag, _count: t._count } : t));
        } else {
          setTags([{ ...fetcher.data.tag, _count: { orderTags: 0 } }, ...tags]);
        }
      } else {
        // 删除操作
        setTags(tags.filter(t => t.id !== editingTag?.id));
      }
      setModalActive(false);
      setEditingTag(null);
      setFormData({ name: "", color: "#808080", description: "" });
    } else if (fetcher.data?.error) {
      alert(fetcher.data.error);
    }
  }, [fetcher.data]);
  
  const handleOpenModal = (tag = null) => {
    if (tag) {
      setEditingTag(tag);
      setFormData({
        name: tag.name,
        color: tag.color,
        description: tag.description || ""
      });
    } else {
      setEditingTag(null);
      setFormData({ name: "", color: "#808080", description: "" });
    }
    setModalActive(true);
  };
  
  const handleCloseModal = () => {
    setModalActive(false);
    setEditingTag(null);
    setFormData({ name: "", color: "#808080", description: "" });
  };
  
  const handleSubmit = () => {
    const data = new FormData();
    data.append("action", editingTag ? "update" : "create");
    if (editingTag) {
      data.append("id", editingTag.id);
    }
    data.append("name", formData.name);
    data.append("color", formData.color);
    data.append("description", formData.description);
    
    fetcher.submit(data, { method: "POST" });
  };
  
  const handleDelete = (tag) => {
    if (!confirm(`确定要删除标签"${tag.name}"吗？这将从所有订单中移除该标签。`)) {
      return;
    }
    
    const data = new FormData();
    data.append("action", "delete");
    data.append("id", tag.id);
    setEditingTag(tag);
    
    fetcher.submit(data, { method: "POST" });
  };
  
  const rows = tags.map((tag) => [
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ 
        width: '16px', 
        height: '16px', 
        borderRadius: '3px', 
        backgroundColor: tag.color 
      }} />
      <Text variant="bodyMd" fontWeight="semibold">{tag.name}</Text>
    </div>,
    tag.description || '-',
    <Badge tone="info">{tag._count.orderTags} 个订单</Badge>,
    <ButtonGroup>
      <Button size="slim" onClick={() => handleOpenModal(tag)}>
        编辑
      </Button>
      <Button size="slim" tone="critical" onClick={() => handleDelete(tag)}>
        删除
      </Button>
    </ButtonGroup>
  ]);
  
  return (
    <Page>
      <TitleBar title="标签管理" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd">标签列表</Text>
                  <Button variant="primary" onClick={() => handleOpenModal()}>
                    创建标签
                  </Button>
                </InlineStack>
                
                {tags.length === 0 ? (
                  <Banner>
                    <p>还没有创建任何标签。点击"创建标签"按钮开始添加标签。</p>
                  </Banner>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text']}
                    headings={['标签', '描述', '使用次数', '操作']}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
      
      <Modal
        open={modalActive}
        onClose={handleCloseModal}
        title={editingTag ? "编辑标签" : "创建标签"}
        primaryAction={{
          content: editingTag ? "保存" : "创建",
          onAction: handleSubmit,
          loading: fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: "取消",
            onAction: handleCloseModal
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="标签名称"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              placeholder="例如：紧急订单、大客户、重要"
              autoComplete="off"
              requiredIndicator
            />
            
            <div>
              <Text variant="bodyMd" fontWeight="semibold">标签颜色</Text>
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginTop: '8px',
                flexWrap: 'wrap'
              }}>
                {colorOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFormData({ ...formData, color: option.value })}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '6px',
                      backgroundColor: option.value,
                      border: formData.color === option.value ? '3px solid #000' : '2px solid #ddd',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    title={option.label}
                  />
                ))}
              </div>
            </div>
            
            <TextField
              label="描述（可选）"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              placeholder="标签的用途说明"
              multiline={2}
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
