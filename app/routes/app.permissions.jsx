import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Modal,
  TextField,
  Banner,
  Badge,
  ButtonGroup,
  Text,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { isSuperAdmin } from "../utils/permissions.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // 只有超级管理员可以访问此页面
  if (!isSuperAdmin(session)) {
    throw new Response("Forbidden", { status: 403 });
  }
  
  const prisma = (await import("../db.server")).default;
  
  // 获取所有白名单用户
  const users = await prisma.whitelistUser.findMany({
    orderBy: { createdAt: "desc" },
  });
  
  const userEmail = session?.onlineAccessInfo?.associated_user?.email;
  
  return json({ users, userEmail });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // 只有超级管理员可以操作
  if (!isSuperAdmin(session)) {
    return json({ error: "无权限操作" }, { status: 403 });
  }
  
  const prisma = (await import("../db.server")).default;
  const formData = await request.formData();
  const action = formData.get("action");
  const userEmail = session?.onlineAccessInfo?.associated_user?.email;
  
  try {
    if (action === "create") {
      const email = formData.get("email")?.trim().toLowerCase();
      const name = formData.get("name")?.trim();
      const description = formData.get("description")?.trim();
      
      if (!email) {
        return json({ error: "邮箱地址不能为空" }, { status: 400 });
      }
      
      // 检查邮箱是否已存在
      const existing = await prisma.whitelistUser.findUnique({
        where: { email },
      });
      
      if (existing) {
        return json({ error: "该邮箱已在白名单中" }, { status: 400 });
      }
      
      await prisma.whitelistUser.create({
        data: {
          email,
          name: name || null,
          description: description || null,
          createdBy: userEmail || "system",
        },
      });
      
      return json({ success: true, message: "添加成功" });
    } else if (action === "toggle") {
      const id = formData.get("id");
      const isActive = formData.get("isActive") === "true";
      
      await prisma.whitelistUser.update({
        where: { id },
        data: { isActive: !isActive },
      });
      
      return json({ success: true, message: isActive ? "已禁用" : "已启用" });
    } else if (action === "delete") {
      const id = formData.get("id");
      
      await prisma.whitelistUser.delete({
        where: { id },
      });
      
      return json({ success: true, message: "删除成功" });
    } else if (action === "update") {
      const id = formData.get("id");
      const name = formData.get("name")?.trim();
      const description = formData.get("description")?.trim();
      
      await prisma.whitelistUser.update({
        where: { id },
        data: {
          name: name || null,
          description: description || null,
        },
      });
      
      return json({ success: true, message: "更新成功" });
    }
    
    return json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("权限管理操作错误:", error);
    return json({ error: error.message || "操作失败" }, { status: 500 });
  }
};

export default function PermissionsPage() {
  const { users, userEmail } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    description: "",
  });
  
  const handleAddUser = useCallback(() => {
    const form = new FormData();
    form.append("action", "create");
    form.append("email", formData.email);
    form.append("name", formData.name);
    form.append("description", formData.description);
    
    submit(form, { method: "post" });
    setShowAddModal(false);
    setFormData({ email: "", name: "", description: "" });
  }, [formData, submit]);
  
  const handleToggleActive = useCallback((id, isActive) => {
    const form = new FormData();
    form.append("action", "toggle");
    form.append("id", id);
    form.append("isActive", String(isActive));
    
    submit(form, { method: "post" });
  }, [submit]);
  
  const handleDelete = useCallback((id) => {
    if (confirm("确定要删除此用户吗？")) {
      const form = new FormData();
      form.append("action", "delete");
      form.append("id", id);
      
      submit(form, { method: "post" });
    }
  }, [submit]);
  
  const handleEditUser = useCallback((user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name || "",
      description: user.description || "",
    });
    setShowEditModal(true);
  }, []);
  
  const handleUpdateUser = useCallback(() => {
    const form = new FormData();
    form.append("action", "update");
    form.append("id", editingUser.id);
    form.append("name", formData.name);
    form.append("description", formData.description);
    
    submit(form, { method: "post" });
    setShowEditModal(false);
    setEditingUser(null);
    setFormData({ email: "", name: "", description: "" });
  }, [editingUser, formData, submit]);
  
  const rows = users.map((user) => [
    user.email,
    user.name || "-",
    user.description || "-",
    user.isActive ? <Badge tone="success">启用</Badge> : <Badge>禁用</Badge>,
    new Date(user.createdAt).toLocaleString("zh-CN"),
    <ButtonGroup>
      <Button size="slim" onClick={() => handleEditUser(user)}>编辑</Button>
      <Button 
        size="slim" 
        onClick={() => handleToggleActive(user.id, user.isActive)}
      >
        {user.isActive ? "禁用" : "启用"}
      </Button>
      <Button 
        size="slim" 
        tone="critical" 
        onClick={() => handleDelete(user.id)}
      >
        删除
      </Button>
    </ButtonGroup>,
  ]);
  
  return (
    <Page
      title="权限管理"
      primaryAction={{
        content: "添加白名单用户",
        onAction: () => setShowAddModal(true),
      }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <p>只有在白名单中的邮箱才能访问管理功能。超级管理员 ({userEmail}) 始终拥有所有权限。</p>
          </Banner>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <DataTable
              columnContentTypes={[
                "text",
                "text",
                "text",
                "text",
                "text",
                "text",
              ]}
              headings={[
                "邮箱地址",
                "姓名",
                "备注说明",
                "状态",
                "添加时间",
                "操作",
              ]}
              rows={rows}
            />
            
            {users.length === 0 && (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <Text as="p" tone="subdued">
                  暂无白名单用户，点击右上角按钮添加
                </Text>
              </div>
            )}
          </Card>
        </Layout.Section>
      </Layout>
      
      {/* 添加用户模态框 */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="添加白名单用户"
        primaryAction={{
          content: "添加",
          onAction: handleAddUser,
          disabled: !formData.email || isLoading,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: "取消",
            onAction: () => setShowAddModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="邮箱地址"
              value={formData.email}
              onChange={(value) => setFormData({ ...formData, email: value })}
              type="email"
              autoComplete="email"
              placeholder="example@domain.com"
              helpText="必填，用于权限验证"
              requiredIndicator
            />
            
            <TextField
              label="姓名"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              autoComplete="name"
              placeholder="用户姓名"
              helpText="可选"
            />
            
            <TextField
              label="备注说明"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              multiline={2}
              placeholder="添加此用户的原因或备注"
              helpText="可选"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
      
      {/* 编辑用户模态框 */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="编辑白名单用户"
        primaryAction={{
          content: "保存",
          onAction: handleUpdateUser,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: "取消",
            onAction: () => setShowEditModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="邮箱地址"
              value={formData.email}
              disabled
              helpText="邮箱地址不可修改"
            />
            
            <TextField
              label="姓名"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              autoComplete="name"
              placeholder="用户姓名"
            />
            
            <TextField
              label="备注说明"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              multiline={2}
              placeholder="添加此用户的原因或备注"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
