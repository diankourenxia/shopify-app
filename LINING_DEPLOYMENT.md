# 衬布管理功能线上部署指南

## 🎯 本次更新内容

本次更新将衬布价格从布料管理中独立出来，新增衬布管理功能：

### 数据库变更
- 从 `FabricPrice` 和 `FabricColorPrice` 表中移除 `liningPrice` 字段
- 新增 `Lining` 表：管理衬布类型和价格
- 新增 `LiningPrice` 表：衬布价格历史记录

### 新增功能
- ✅ 衬布管理页面：`/app/linings`
- ✅ 衬布价格 API：`/api/lining-prices`
- ✅ 导出订单时根据 Lining Type 自动计算成本

## 🚀 线上部署步骤

### 步骤 1: SSH 连接到服务器

```bash
ssh user@your-server-ip
cd /var/www/shopify-app
```

### 步骤 2: 备份数据库（重要！）

```bash
# 备份生产数据库
cp prisma/prod.sqlite prisma/prod.sqlite.backup.$(date +%Y%m%d_%H%M%S)

# 确认备份成功
ls -lh prisma/prod.sqlite.backup.*
```

### 步骤 3: 拉取最新代码

```bash
# 拉取最新代码
git pull origin main

# 查看最新提交
git log --oneline -5
```

### 步骤 4: 安装依赖

```bash
npm install
```

### 步骤 5: 运行数据库迁移（关键步骤）

```bash
# 生成 Prisma 客户端
npx prisma generate

# 应用数据库迁移
npx prisma migrate deploy

# 如果上面命令报错，使用指定数据库路径
DATABASE_URL="file:./prisma/prod.sqlite" npx prisma migrate deploy
```

**注意：** 数据库迁移会：
- 从 `FabricPrice` 表删除 `liningPrice` 列
- 从 `FabricColorPrice` 表删除 `liningPrice` 列  
- 创建新的 `Lining` 和 `LiningPrice` 表

### 步骤 6: 重新构建应用

```bash
npm run build
```

### 步骤 7: 重启应用

```bash
# 使用 PM2 重启
pm2 restart shopify-order-app

# 或使用 ecosystem 配置
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
sqlite3 prisma/prod.sqlite "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
# 应该能看到: Lining, LiningPrice
```

## ✅ 功能测试

### 1. 访问衬布管理页面

```
https://fr-manage.ecolife-us.com/app/linings
```

### 2. 初始化衬布数据

在衬布管理页面，添加常用的衬布类型：

| 衬布类型 | 价格（¥/米） | 描述 |
|---------|------------|------|
| No Lining | 0.00 | 无衬布 |
| Standard | 10.00 | 标准衬布 |
| Blackout | 15.00 |遮光衬布 |
| Thermal | 12.00 | 保温衬布 |
| Interlining | 8.00 | 中间衬 |

### 3. 测试导出功能

1. 访问订单管理页面
2. 选择几个订单
3. 点击"导出Excel"
4. 检查导出的Excel文件：
   - ✅ "布料单价"列显示正确（布料价格 + 衬布价格）
   - ✅ "布料成本"列计算正确

### 4. 验证价格计算

示例订单：
- 布料：8823-5（布料单价 ¥25.00）
- 衬布：Standard（衬布单价 ¥10.00）
- 采购米数：5.58 米

期望结果：
- 布料单价 = ¥25.00 + ¥10.00 = **¥35.00**
- 布料成本 = 5.58 × ¥35.00 = **¥195.30**

## 🔧 故障排查

### 问题 1: 数据库迁移失败

```bash
# 检查数据库文件权限
ls -la prisma/prod.sqlite

# 手动指定数据库路径
DATABASE_URL="file:./prisma/prod.sqlite" npx prisma migrate deploy

# 如果仍然失败，查看迁移状态
npx prisma migrate status
```

### 问题 2: 页面无法访问

```bash
# 检查路由是否正确
cat app/routes/app.jsx | grep linings

# 重新构建
npm run build
pm2 restart shopify-order-app

# 查看详细日志
pm2 logs shopify-order-app --err --lines 100
```

### 问题 3: 导出价格显示为空

原因：衬布类型名称不匹配

解决方案：
1. 检查订单中的 `Lining Type` 字段值
2. 在衬布管理中创建对应的衬布类型
3. 确保类型名称完全匹配（区分大小写）

```bash
# 查看数据库中的衬布类型
sqlite3 prisma/prod.sqlite "SELECT type, price FROM Lining;"
```

### 问题 4: PM2 启动失败

```bash
# 查看 PM2 进程
pm2 list

# 删除旧进程
pm2 delete shopify-order-app

# 重新启动
pm2 start ecosystem.config.js

# 查看启动日志
pm2 logs shopify-order-app --lines 100
```

## 📊 数据迁移说明

### 原有数据影响

**FabricPrice 表变更：**
```sql
-- 迁移前
FabricPrice {
  id, fabricId, fabricPrice, liningPrice, effectiveDate, createdAt
}

-- 迁移后
FabricPrice {
  id, fabricId, fabricPrice, effectiveDate, createdAt
}
```

**原有的 liningPrice 数据会被删除！**

### 数据恢复策略

如果需要保留原有的衬布价格数据：

1. 在迁移前导出数据：
```bash
sqlite3 prisma/prod.sqlite "SELECT fabricId, liningPrice FROM FabricPrice;" > lining_prices_backup.csv
```

2. 迁移后，可以根据导出的数据在衬布管理中手动创建对应的衬布类型和价格

## 🔄 回滚方案

如果部署后出现严重问题，可以回滚：

```bash
# 1. 停止应用
pm2 stop shopify-order-app

# 2. 回滚代码
git reset --hard HEAD~1
git log --oneline -5  # 确认回滚成功

# 3. 恢复数据库备份
cp prisma/prod.sqlite.backup.YYYYMMDD_HHMMSS prisma/prod.sqlite

# 4. 重新生成 Prisma 客户端
npx prisma generate

# 5. 重新构建
npm run build

# 6. 重启应用
pm2 start ecosystem.config.js
```

## 📝 部署检查清单

部署前：
- [ ] 代码已经在本地测试通过
- [ ] 已经备份生产数据库
- [ ] 已经通知相关人员即将更新

部署中：
- [ ] 已成功拉取最新代码
- [ ] 依赖已安装（npm install）
- [ ] Prisma 客户端已生成
- [ ] 数据库迁移已成功运行
- [ ] 应用已重新构建
- [ ] 应用已重启

部署后：
- [ ] 应用运行正常（pm2 status）
- [ ] 可以访问衬布管理页面
- [ ] 已初始化衬布数据
- [ ] 导出功能正常工作
- [ ] 价格计算正确

## 🎉 部署完成

衬布管理功能现已上线！

**主要变化：**
1. 衬布价格独立管理，不再与布料绑定
2. 可以灵活配置不同类型衬布的价格
3. 导出订单时自动根据 Lining Type 计算成本

**使用流程：**
1. 在衬布管理页面添加常用衬布类型和价格
2. 在布料管理页面只需设置布料价格
3. 导出订单时系统自动组合计算

如有问题，请查看日志：
```bash
pm2 logs shopify-order-app
```
