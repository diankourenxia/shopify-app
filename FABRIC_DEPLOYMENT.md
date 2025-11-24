# 布料管理功能部署指南

本指南说明如何在线上环境部署新增的布料管理功能。

## 🎯 新增功能概述

- ✅ 布料材质管理（Fabric）
- ✅ 布料颜色管理（FabricColor）
- ✅ 价格历史记录（FabricPrice, FabricColorPrice）
- ✅ 从订单自动同步布料信息
- ✅ 独立的布料管理页面

## 📋 部署前准备

### 检查文件
确保以下文件已经更新：
- ✅ `prisma/schema.prisma` - 新增了4个数据库模型
- ✅ `app/routes/app.fabrics.jsx` - 布料管理页面
- ✅ `app/routes/api.sync-fabrics.jsx` - 同步API
- ✅ `app/routes/app.jsx` - 导航菜单更新
- ✅ `prisma/migrations/20251124021745_add_fabric_management/` - 数据库迁移文件

## 🚀 线上部署步骤

### 步骤 1: 连接到服务器

```bash
ssh user@your-server-ip
cd /var/www/shopify-app
```

### 步骤 2: 备份现有数据库

```bash
# 备份数据库（重要！）
cp prisma/prod.sqlite prisma/prod.sqlite.backup.$(date +%Y%m%d_%H%M%S)

# 或者如果使用 dev.db
cp dev.db dev.db.backup.$(date +%Y%m%d_%H%M%S)
```

### 步骤 3: 拉取最新代码

```bash
# 如果使用 Git
git pull origin main

# 或者手动上传文件
# scp -r /local/path/* user@server:/var/www/shopify-app/
```

### 步骤 4: 安装依赖

```bash
npm install
```

### 步骤 5: 运行数据库迁移

```bash
# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移（会自动创建新表）
npx prisma migrate deploy

# 如果上面命令报错，使用以下命令强制应用迁移
DATABASE_URL="file:./prisma/prod.sqlite" npx prisma migrate deploy
```

### 步骤 6: 重新构建应用

```bash
npm run build
```

### 步骤 7: 重启应用

```bash
# 使用 PM2 重启
pm2 restart shopify-order-app

# 或使用 ecosystem 配置重启
pm2 restart ecosystem.config.js

# 保存 PM2 配置
pm2 save
```

### 步骤 8: 验证部署

```bash
# 检查应用状态
pm2 status

# 查看应用日志
pm2 logs shopify-order-app --lines 50

# 检查数据库表是否创建成功
sqlite3 prisma/prod.sqlite ".tables"
# 应该能看到: Fabric, FabricColor, FabricPrice, FabricColorPrice
```

## ✅ 功能测试

### 1. 访问布料管理页面

在浏览器中访问：
```
https://fr-manage.ecolife-us.com/app/fabrics
```

### 2. 同步布料信息

1. 点击 "从订单同步" 按钮
2. 系统会自动扫描所有订单
3. 提取布料编号和颜色信息
4. 创建对应的布料和颜色记录

### 3. 设置价格

1. 在布料列表中点击 "编辑价格"
2. 设置布料价格和内衬价格
3. 保存后会创建价格历史记录

### 4. 管理颜色

1. 切换到 "颜色管理" 标签
2. 可以为每个颜色单独设置价格
3. 查看价格历史记录

## 🔧 故障排查

### 问题 1: 数据库迁移失败

```bash
# 检查数据库连接
echo $DATABASE_URL

# 手动运行迁移
DATABASE_URL="file:./prisma/prod.sqlite" npx prisma migrate deploy

# 如果权限问题
sudo chown -R $USER:$USER prisma/
```

### 问题 2: 页面无法访问

```bash
# 检查路由是否正确
cat app/routes/app.jsx | grep fabrics

# 重新构建
npm run build
pm2 restart shopify-order-app
```

### 问题 3: 同步功能报错

```bash
# 检查缓存文件
ls -la cache/orders.json

# 查看应用日志
pm2 logs shopify-order-app

# 检查 API 路由
curl -X POST https://fr-manage.ecolife-us.com/api/sync-fabrics
```

### 问题 4: PM2 启动失败

```bash
# 检查 PM2 进程
pm2 list

# 删除旧进程
pm2 delete shopify-order-app

# 重新启动
pm2 start ecosystem.config.js

# 查看详细错误
pm2 logs shopify-order-app --err --lines 100
```

## 📊 数据库表结构

### Fabric（布料材质表）
```sql
CREATE TABLE "Fabric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,  -- 布料编号，如 "8823"
    "name" TEXT,                   -- 布料名称
    "description" TEXT,            -- 描述
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
```

### FabricColor（颜色表）
```sql
CREATE TABLE "FabricColor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fabricId" TEXT NOT NULL,      -- 关联的布料ID
    "colorCode" TEXT NOT NULL,     -- 颜色编号，如 "1"
    "colorName" TEXT,              -- 颜色名称
    "fullCode" TEXT NOT NULL UNIQUE, -- 完整编号，如 "8823-1"
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FabricColor_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric" ("id") ON DELETE CASCADE
);
```

### FabricPrice（价格历史表）
```sql
CREATE TABLE "FabricPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fabricId" TEXT NOT NULL,
    "fabricPrice" REAL NOT NULL,    -- 布料价格
    "liningPrice" REAL NOT NULL,    -- 内衬价格
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "FabricPrice_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric" ("id") ON DELETE CASCADE
);
```

### FabricColorPrice（颜色价格历史表）
```sql
CREATE TABLE "FabricColorPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colorId" TEXT NOT NULL,
    "fabricPrice" REAL NOT NULL,
    "liningPrice" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "FabricColorPrice_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "FabricColor" ("id") ON DELETE CASCADE
);
```

## 🔄 回滚方案

如果部署后出现问题，可以回滚：

```bash
# 1. 停止应用
pm2 stop shopify-order-app

# 2. 恢复数据库备份
cp prisma/prod.sqlite.backup.YYYYMMDD_HHMMSS prisma/prod.sqlite

# 3. 回滚代码
git reset --hard HEAD~1  # 回退到上一个版本

# 4. 重新构建
npm run build

# 5. 重启应用
pm2 start ecosystem.config.js
```

## 📝 部署检查清单

- [ ] 数据库已备份
- [ ] 代码已更新到最新版本
- [ ] 依赖已安装（npm install）
- [ ] Prisma 客户端已生成（npx prisma generate）
- [ ] 数据库迁移已运行（npx prisma migrate deploy）
- [ ] 应用已重新构建（npm run build）
- [ ] 应用已重启（pm2 restart）
- [ ] 可以访问布料管理页面
- [ ] 可以从订单同步布料信息
- [ ] 可以正常设置和查看价格

## 🎉 部署完成

布料管理功能现已上线！可以通过以下方式使用：

1. **访问**: `https://fr-manage.ecolife-us.com/app/fabrics`
2. **首次使用**: 点击"从订单同步"获取布料数据
3. **价格管理**: 设置每个布料的价格
4. **颜色管理**: 为特殊颜色设置独立价格

如有问题，请查看日志：
```bash
pm2 logs shopify-order-app
```
