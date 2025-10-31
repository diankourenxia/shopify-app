# 生产环境数据库迁移指南 - LineItem 状态跟踪

> **重要提示**: 本次迁移将数据库模型从"订单级状态"扩展为"商品行级状态"，向后兼容现有数据。

## 📋 迁移概述

### 变更内容
- **添加字段**: `OrderStatus` 表新增 `lineItemId` 字段（可选）
- **移除约束**: 移除 `orderId` 的唯一约束，允许同一订单有多个状态记录
- **向后兼容**: 现有的订单级状态记录保持不变，`lineItemId` 为 `NULL`

### 数据库变更
```sql
-- 原有结构
CREATE TABLE "OrderStatus" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT UNIQUE,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

-- 新结构
CREATE TABLE "OrderStatus" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,           -- 移除 UNIQUE 约束
  "lineItemId" TEXT,                  -- 新增字段
  "status" TEXT NOT NULL,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
```

## 🔧 服务器端操作步骤

### 前置条件检查
```bash
# 登录服务器
ssh user@your-server

# 进入应用目录
cd /var/www/shopify-app

# 检查当前 Git 分支和状态
git status
git log --oneline -5

# 检查 Node 版本（需要 18.20+）
node --version

# 检查 PM2 应用状态
pm2 status
```

---

## 步骤 1: 备份数据库 ⚠️ **必须执行**

```bash
# 方法 A: 使用备份脚本（推荐）
chmod +x scripts/backup-database.sh
./scripts/backup-database.sh "before_lineitem_migration"

# 方法 B: 手动备份
mkdir -p backups
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
cp prisma/prod.sqlite backups/prod_backup_${TIMESTAMP}.sqlite
gzip backups/prod_backup_${TIMESTAMP}.sqlite

# 验证备份
ls -lh backups/
```

**⚠️ 重要**: 将备份文件下载到本地保存
```bash
# 在本地机器执行
scp user@your-server:/var/www/shopify-app/backups/before_lineitem_migration.sqlite.gz ~/backups/
```

---

## 步骤 2: 拉取最新代码

```bash
# 拉取最新代码（包含数据库模型变更）
git fetch origin
git pull origin main

# 检查 schema.prisma 变更
git diff HEAD~1 prisma/schema.prisma

# 确认看到以下变更：
# - orderId 字段移除了 @unique
# + lineItemId String?
```

---

## 步骤 3: 停止应用

```bash
# 停止 PM2 应用
pm2 stop shopify-order-app

# 或者如果使用 systemd
sudo systemctl stop shopify-app

# 验证应用已停止
pm2 status
# 或
sudo systemctl status shopify-app
```

---

## 步骤 4: 安装依赖和生成 Prisma Client

```bash
# 安装新依赖（如果有）
npm ci --only=production

# 重新生成 Prisma Client（包含新的类型定义）
npx prisma generate

# 验证生成成功
ls -la node_modules/.prisma/client/
```

---

## 步骤 5: 运行数据库迁移 🔄

### 方法 A: 使用 Prisma Migrate（推荐）

```bash
# 部署迁移
npx prisma migrate deploy

# 如果是第一次运行迁移或出现问题，可以重置并重新应用
# ⚠️ 注意：这会清空数据，只在开发环境或确认有备份时使用
# npx prisma migrate reset --force
```

### 方法 B: 使用 db push（适合小规模变更）

```bash
# 直接将 schema 推送到数据库
npx prisma db push

# 系统会提示确认，输入 y 继续
```

### 方法 C: 手动 SQL（高级用户）

如果自动迁移失败，可以手动执行 SQL：

```bash
# 连接到数据库
sqlite3 prisma/prod.sqlite

# 执行迁移 SQL
```

```sql
-- 1. 创建新表（带新结构）
CREATE TABLE "OrderStatus_new" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "lineItemId" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

-- 2. 复制现有数据
INSERT INTO "OrderStatus_new" ("id", "orderId", "status", "createdAt", "updatedAt")
SELECT "id", "orderId", "status", "createdAt", "updatedAt" FROM "OrderStatus";

-- 3. 删除旧表
DROP TABLE "OrderStatus";

-- 4. 重命名新表
ALTER TABLE "OrderStatus_new" RENAME TO "OrderStatus";

-- 5. 验证数据
SELECT COUNT(*) FROM "OrderStatus";
SELECT * FROM "OrderStatus" LIMIT 5;

-- 6. 退出
.quit
```

---

## 步骤 6: 验证数据库结构

```bash
# 使用 Prisma Studio 检查
npx prisma studio &

# 或使用 sqlite3 命令行
sqlite3 prisma/prod.sqlite

# 在 sqlite3 中执行：
.schema OrderStatus
.headers on
.mode column
SELECT * FROM OrderStatus LIMIT 5;
.quit
```

**预期结果**:
- 应该看到 `lineItemId` 列
- `orderId` 不再有 UNIQUE 约束
- 现有数据的 `lineItemId` 应该为 NULL

---

## 步骤 7: 构建应用

```bash
# 构建 Remix 应用
npm run build

# 验证构建输出
ls -la build/server/index.js

# 检查构建日志中是否有错误
```

---

## 步骤 8: 启动应用

```bash
# 使用 PM2 启动
pm2 start ecosystem.config.js --env production

# 或者重启现有应用
pm2 restart shopify-order-app

# 保存 PM2 配置
pm2 save

# 查看应用状态
pm2 status
pm2 logs shopify-order-app --lines 50
```

---

## 步骤 9: 验证功能 ✅

### 9.1 检查应用启动日志
```bash
# 查看实时日志
pm2 logs shopify-order-app --lines 100

# 检查是否有 Prisma 或数据库错误
pm2 logs shopify-order-app --err --lines 50
```

### 9.2 测试订单列表页面
```bash
# 测试 HTTPS 访问
curl -I https://fr-manage.ecolife-us.com/app/orders

# 检查响应状态码（应该是 200 或 302）
```

### 9.3 在浏览器中测试
1. 访问 `https://fr-manage.ecolife-us.com/app/orders`
2. 检查订单列表是否正常显示
3. 展开某个订单，查看每个 lineItem 是否有独立的状态下拉框
4. 尝试更新某个 lineItem 的状态
5. 刷新页面，验证状态是否保存成功

### 9.4 检查数据库记录
```bash
sqlite3 prisma/prod.sqlite
```

```sql
-- 查看更新后的状态记录
SELECT id, orderId, lineItemId, status, updatedAt 
FROM OrderStatus 
ORDER BY updatedAt DESC 
LIMIT 10;

-- 检查是否有 lineItemId 不为空的记录
SELECT COUNT(*) FROM OrderStatus WHERE lineItemId IS NOT NULL;

.quit
```

---

## 🔙 回滚方案（如果出现问题）

### 方案 A: 快速回滚（恢复备份 + 回滚代码）

```bash
# 1. 停止应用
pm2 stop shopify-order-app

# 2. 恢复数据库备份
gunzip -c backups/before_lineitem_migration.sqlite.gz > prisma/prod.sqlite

# 3. 回滚代码到之前的版本
git log --oneline -5
git checkout <previous_commit_hash>

# 4. 重新安装依赖和构建
npm ci --only=production
npx prisma generate
npm run build

# 5. 启动应用
pm2 start ecosystem.config.js --env production

# 6. 验证
pm2 logs shopify-order-app
curl -I https://fr-manage.ecolife-us.com/app/orders
```

### 方案 B: 仅回滚数据库（保留新代码）

如果只是数据库问题但代码没问题：

```bash
# 停止应用
pm2 stop shopify-order-app

# 恢复备份
gunzip -c backups/before_lineitem_migration.sqlite.gz > prisma/prod.sqlite

# 使用旧的 schema（临时）
git checkout HEAD~1 -- prisma/schema.prisma

# 重新生成 Prisma Client
npx prisma generate

# 启动应用
pm2 restart shopify-order-app
```

---

## 📊 监控和日志

### 持续监控（迁移后 24-48 小时）

```bash
# 实时查看日志
pm2 logs shopify-order-app

# 监控内存和 CPU
pm2 monit

# 检查错误日志
pm2 logs shopify-order-app --err --lines 100

# 查看 Nginx 访问日志
sudo tail -f /var/log/nginx/shopify-app.access.log

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/shopify-app.error.log
```

### 设置日志告警（可选）

```bash
# 使用 pm2-logrotate 管理日志
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 🐛 常见问题排查

### 问题 1: Prisma Client 类型错误
```bash
# 重新生成 Prisma Client
rm -rf node_modules/.prisma
npx prisma generate
```

### 问题 2: 数据库锁定
```bash
# 检查是否有其他进程在使用数据库
lsof | grep prod.sqlite

# 停止所有相关进程
pm2 delete all
```

### 问题 3: 迁移失败
```bash
# 查看详细错误
npx prisma migrate status
npx prisma migrate resolve --help

# 如果需要，标记迁移为已应用（仅在确认数据库结构正确后）
npx prisma migrate resolve --applied <migration_name>
```

### 问题 4: 应用无法启动
```bash
# 检查环境变量
pm2 env shopify-order-app

# 检查端口占用
sudo netstat -tlnp | grep :3000

# 检查文件权限
ls -la prisma/prod.sqlite
chmod 664 prisma/prod.sqlite
```

---

## 📝 迁移后检查清单

- [ ] 数据库备份已完成并下载到本地
- [ ] 应用正常启动，无错误日志
- [ ] 订单列表页面正常显示
- [ ] 每个 lineItem 有独立的状态下拉框
- [ ] 可以成功更新 lineItem 状态
- [ ] 状态更新后刷新页面，数据正确保存
- [ ] 旧的订单级状态仍然可见（如果有）
- [ ] 数据库中有新的带 `lineItemId` 的记录
- [ ] 监控日志 24 小时，无异常
- [ ] 备份文件已妥善保存

---

## 📞 支持和文档

- **Prisma 迁移文档**: https://www.prisma.io/docs/concepts/components/prisma-migrate
- **SQLite 备份**: https://www.sqlite.org/backup.html
- **PM2 文档**: https://pm2.keymetrics.io/docs/usage/quick-start/

---

## 总结

本次迁移是向后兼容的增量升级，不会破坏现有数据。关键步骤：

1. **备份** → 2. **停止应用** → 3. **迁移数据库** → 4. **构建** → 5. **启动** → 6. **验证**

如果出现任何问题，可以快速回滚到备份状态。建议在非高峰时段执行迁移操作。
