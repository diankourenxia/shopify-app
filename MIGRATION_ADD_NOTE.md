# 添加 note 字段迁移指南

## 问题说明

当在已有数据的生产数据库上运行 `prisma migrate deploy` 时，会遇到以下错误：

```
Error: P3005
The database schema is not empty. Read more about how to baseline an existing production database
```

这是因为 Prisma 检测到数据库已经有数据，不能直接应用迁移。

## 解决方案

我们提供了两种迁移方法：

### 方法 1: 使用自动化脚本（推荐）

在服务器上运行预制的迁移脚本：

```bash
cd /var/www/shopify-app
./scripts/migrate-add-note.sh
```

该脚本会自动完成：
1. ✅ 备份数据库
2. ✅ 检查 note 字段是否已存在
3. ✅ 使用 ALTER TABLE 添加字段
4. ✅ 验证迁移结果
5. ✅ 标记 Prisma 迁移为已应用

### 方法 2: 手动迁移

#### 步骤 1: 备份数据库

```bash
cd /var/www/shopify-app
mkdir -p backups
cp prisma/prod.sqlite backups/prod_before_add_note_$(date +%Y%m%d_%H%M%S).sqlite
```

#### 步骤 2: 检查当前表结构

```bash
sqlite3 prisma/prod.sqlite "PRAGMA table_info(OrderStatus);"
```

#### 步骤 3: 添加 note 字段

```bash
sqlite3 prisma/prod.sqlite "ALTER TABLE OrderStatus ADD COLUMN note TEXT;"
```

#### 步骤 4: 验证字段已添加

```bash
sqlite3 prisma/prod.sqlite "PRAGMA table_info(OrderStatus);"
```

确认输出中包含：
```
5|note|TEXT|0||0
```

#### 步骤 5: 标记迁移为已应用（Baseline）

```bash
npx prisma migrate resolve --applied 20251104064456_add_note_to_order_status
```

这会告诉 Prisma 该迁移已经手动应用了。

#### 步骤 6: 验证 Prisma 状态

```bash
npx prisma migrate status
```

应该显示所有迁移都已应用。

## 迁移后操作

完成迁移后，需要重新构建并重启应用：

```bash
cd /var/www/shopify-app
git pull                    # 如果还没拉取最新代码
npm run build               # 重新构建前端
pm2 restart shopify-order-app  # 重启应用
```

## 验证功能

1. 访问订单管理页面
2. 找到任意订单的 lineItem
3. 应该能看到：
   - 状态下拉框中有"暂停生产"选项
   - 状态下拉框下方有备注输入框
4. 选择状态并输入备注，失去焦点后自动保存

## 回滚方案

如果需要回滚，使用备份恢复数据库：

```bash
# 找到备份文件
ls -lh backups/

# 恢复备份（替换 TIMESTAMP 为实际时间戳）
cp backups/prod_before_add_note_TIMESTAMP.sqlite prisma/prod.sqlite

# 重启应用
pm2 restart shopify-order-app
```

## 数据库变更详情

### OrderStatus 表新增字段：

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| note | TEXT | NULL | 备注信息，可选 |

### 影响范围：

- 现有数据的 `note` 字段默认为 `NULL`
- 不影响现有功能
- 向后兼容

## 常见问题

### Q: 如果脚本执行失败怎么办？
A: 脚本会自动恢复备份。也可以手动恢复备份文件。

### Q: 如何确认迁移成功？
A: 运行 `sqlite3 prisma/prod.sqlite "PRAGMA table_info(OrderStatus);"` 检查是否有 note 字段。

### Q: 迁移会影响现有数据吗？
A: 不会。只是添加一个新的可空字段，不修改或删除任何现有数据。

### Q: 需要停机维护吗？
A: ALTER TABLE 操作很快（通常<1秒），可以在不停机的情况下执行。但建议选择低峰期操作。

## 技术细节

迁移 SQL：
```sql
ALTER TABLE OrderStatus ADD COLUMN note TEXT;
```

这是一个 DDL 操作，在 SQLite 中执行很快，不会锁表太久。

## 联系支持

如果遇到问题，请检查：
1. 数据库文件权限
2. 磁盘空间
3. 备份文件是否创建成功

或联系技术支持。
