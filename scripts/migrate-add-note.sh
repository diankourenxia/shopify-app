#!/bin/bash

# 添加 note 字段到生产数据库的安全迁移脚本
# 使用日期: 2025-11-04

set -e

echo "=========================================="
echo "添加 note 字段到 OrderStatus 表"
echo "=========================================="
echo ""

# 检查是否在服务器上
if [ ! -f "/var/www/shopify-app/prisma/prod.sqlite" ]; then
    echo "❌ 错误: 未找到生产数据库"
    echo "   此脚本需要在服务器上运行"
    exit 1
fi

cd /var/www/shopify-app

# 备份数据库
echo "📦 步骤 1: 备份数据库..."
BACKUP_DIR="./backups"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/prod_before_add_note_${TIMESTAMP}.sqlite"
cp prisma/prod.sqlite $BACKUP_FILE
echo "✅ 数据库已备份到: $BACKUP_FILE"
echo ""

# 检查表结构
echo "📋 步骤 2: 检查当前表结构..."
sqlite3 prisma/prod.sqlite "PRAGMA table_info(OrderStatus);" > /tmp/table_info.txt
cat /tmp/table_info.txt
echo ""

# 检查是否已存在 note 字段
if grep -q "note" /tmp/table_info.txt; then
    echo "✅ note 字段已存在，无需迁移"
    echo ""
    echo "当前表结构:"
    sqlite3 prisma/prod.sqlite "PRAGMA table_info(OrderStatus);"
    exit 0
fi

# 添加 note 字段
echo "🔧 步骤 3: 添加 note 字段..."
sqlite3 prisma/prod.sqlite <<EOF
ALTER TABLE OrderStatus ADD COLUMN note TEXT;
EOF

if [ $? -eq 0 ]; then
    echo "✅ note 字段添加成功"
else
    echo "❌ 添加字段失败，正在恢复备份..."
    cp $BACKUP_FILE prisma/prod.sqlite
    echo "数据库已恢复"
    exit 1
fi
echo ""

# 验证迁移
echo "🔍 步骤 4: 验证迁移结果..."
echo "新的表结构:"
sqlite3 prisma/prod.sqlite "PRAGMA table_info(OrderStatus);"
echo ""

# 标记迁移为已应用（baseline）
echo "📝 步骤 5: 标记 Prisma 迁移为已应用..."
npx prisma migrate resolve --applied 20251104064456_add_note_to_order_status

echo ""
echo "=========================================="
echo "✅ 迁移完成！"
echo "=========================================="
echo ""
echo "备份位置: $BACKUP_FILE"
echo ""
echo "下一步: 重新构建并重启应用"
echo "  npm run build"
echo "  pm2 restart shopify-order-app"
echo ""
