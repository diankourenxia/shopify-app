#!/bin/bash

# 顺丰运单信息数据库迁移脚本
# 用于在生产环境添加运单信息字段和打印次数字段

set -e

echo "================================"
echo "顺丰运单信息数据库迁移"
echo "================================"

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
  echo "错误: 请在项目根目录运行此脚本"
  exit 1
fi

# 备份数据库
echo "1. 备份数据库..."
BACKUP_FILE="prisma/prod.sqlite.backup.$(date +%Y%m%d_%H%M%S)"
if [ -f "prisma/prod.sqlite" ]; then
  cp prisma/prod.sqlite "$BACKUP_FILE"
  echo "✓ 数据库已备份到: $BACKUP_FILE"
else
  echo "⚠ 警告: 未找到 prisma/prod.sqlite，跳过备份"
fi

# 应用迁移
echo ""
echo "2. 应用数据库迁移..."
npx prisma migrate deploy

echo ""
echo "3. 重新生成 Prisma Client..."
npx prisma generate

echo ""
echo "================================"
echo "✓ 迁移完成！"
echo "================================"
echo ""
echo "新增字段："
echo "  - sfWaybillNo: 顺丰运单号"
echo "  - sfLabelUrl: 面单打印链接"
echo "  - sfInvoiceUrl: 发票打印链接"
echo "  - sfCreatedAt: 运单创建时间"
echo "  - sfPrintCount: 打印次数（用于重新打印时生成递增后缀）"
echo ""
echo "请执行以下命令重启应用："
echo "  pm2 restart shopify-app"
echo ""
