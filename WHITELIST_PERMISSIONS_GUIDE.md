# 白名单权限管理使用指南

## 功能概述

白名单权限管理系统允许超级管理员添加和管理有权限访问管理功能的用户邮箱。

### 权限级别

1. **超级管理员** (yaohuiruyi@gmail.com)
   - 硬编码在系统中，始终拥有所有权限
   - 可以访问所有功能，包括白名单管理
   - 可以添加、编辑、删除白名单用户

2. **白名单用户**
   - 邮箱被添加到白名单后，可以访问管理功能
   - 可以访问：布料管理、衬布管理、标签管理、演示页面等
   - 不能访问：权限管理页面

3. **普通用户**
   - 未在白名单中的用户
   - 只能访问：首页、订单管理
   - 无法看到其他管理功能的菜单项

## 数据库迁移

### 方法1：使用 Prisma 脚本（推荐）

```bash
# 在服务器上执行
cd /var/www/shopify-app
node scripts/migrate-add-whitelist-prisma.js
```

### 方法2：使用 Shell 脚本

```bash
# 给脚本添加执行权限
chmod +x /var/www/shopify-app/scripts/migrate-add-whitelist.sh

# 执行迁移
/var/www/shopify-app/scripts/migrate-add-whitelist.sh
```

### 方法3：手动执行 SQL

```bash
# 连接到数据库
sqlite3 /var/www/shopify-app/prisma/prod.sqlite

# 执行以下 SQL
CREATE TABLE IF NOT EXISTS "WhitelistUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhitelistUser_email_key" ON "WhitelistUser"("email");

# 退出
.quit
```

### 方法4：使用 Prisma CLI（开发环境）

```bash
# 生成迁移文件
npx prisma migrate dev --name add_whitelist_users

# 或者直接推送架构变更（生产环境慎用）
npx prisma db push
```

## 使用指南

### 1. 访问权限管理页面

只有超级管理员 (yaohuiruyi@gmail.com) 可以看到并访问 **权限管理** 菜单项。

路径：`/app/permissions`

### 2. 添加白名单用户

1. 点击右上角 **"添加白名单用户"** 按钮
2. 填写必填信息：
   - **邮箱地址**：必填，用于权限验证
   - 姓名：可选，用于显示
   - 备注说明：可选，记录添加原因
3. 点击 **"添加"** 保存

### 3. 管理白名单用户

每个用户有以下操作：

- **编辑**：修改姓名和备注（邮箱不可修改）
- **启用/禁用**：临时禁用用户权限，不删除记录
- **删除**：永久删除白名单记录

### 4. 用户状态

- 🟢 **启用**：用户可以访问管理功能
- ⚪ **禁用**：用户暂时无法访问管理功能

## 技术实现

### 数据模型

```prisma
model WhitelistUser {
  id          String   @id @default(uuid())
  email       String   @unique
  name        String?
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?
}
```

### 权限检查流程

1. 获取用户邮箱（从 `session.onlineAccessInfo.associated_user.email`）
2. 检查是否为超级管理员 (yaohuiruyi@gmail.com)
3. 如果不是，查询白名单数据库
4. 验证邮箱是否在白名单中且状态为启用
5. 根据结果决定是否允许访问

### 关键函数

```javascript
// 检查邮箱是否在白名单中
isEmailWhitelisted(email, prisma)

// 检查用户权限
checkPermission(session, requiredPermission, prisma)

// 要求特定权限（无权限则重定向）
requirePermission(session, requiredPermission, prisma)

// 判断是否为受限用户
isRestrictedUser(session, prisma)

// 判断是否为超级管理员
isSuperAdmin(session)
```

## 注意事项

1. **邮箱唯一性**：每个邮箱只能添加一次
2. **邮箱验证**：系统不验证邮箱格式，请确保输入正确
3. **超级管理员**：yaohuiruyi@gmail.com 是硬编码的，即使不在白名单中也有全部权限
4. **权限生效**：添加或修改白名单后，用户需要重新登录才能看到权限变化
5. **数据备份**：修改权限前建议备份数据库

## 故障排查

### 问题：用户在白名单中但无法访问

1. 检查用户邮箱是否完全匹配（区分大小写）
2. 确认用户状态为"启用"
3. 让用户退出并重新登录应用
4. 检查是否使用了在线令牌（`useOnlineTokens: true`）

### 问题：权限管理页面无法访问

1. 确认当前登录用户是否为 yaohuiruyi@gmail.com
2. 检查在线令牌是否正常工作
3. 查看浏览器控制台是否有错误信息

### 问题：数据库迁移失败

1. 检查数据库文件权限
2. 确认 sqlite3 已安装
3. 尝试手动执行 SQL 语句
4. 查看详细错误信息

## 更新日志

### 2025-01-26
- ✅ 创建 WhitelistUser 数据表
- ✅ 实现白名单用户管理页面
- ✅ 集成权限检查系统
- ✅ 添加数据库迁移脚本
- ✅ 更新所有受限页面支持白名单验证
