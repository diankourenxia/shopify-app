#!/bin/bash

# 快速修复脚本 - 重新生成 Prisma Client 并重启应用

set -e

echo "=========================================="
echo "快速修复 - 重新生成 Prisma Client"
echo "=========================================="
echo ""

cd /var/www/shopify-app

# 步骤 1: 重新生成 Prisma Client
echo "🔄 步骤 1: 重新生成 Prisma Client..."
npx prisma generate

if [ $? -eq 0 ]; then
    echo "✅ Prisma Client 生成成功"
else
    echo "❌ Prisma Client 生成失败"
    exit 1
fi
echo ""

# 步骤 2: 重新构建应用
echo "🔨 步骤 2: 重新构建应用..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ 构建成功"
else
    echo "❌ 构建失败"
    exit 1
fi
echo ""

# 步骤 3: 重启应用
echo "🔄 步骤 3: 重启应用..."
pm2 restart shopify-order-app

if [ $? -eq 0 ]; then
    echo "✅ 应用重启成功"
else
    echo "❌ 重启失败"
    exit 1
fi
echo ""

echo "=========================================="
echo "✅ 修复完成！"
echo "=========================================="
echo ""
echo "查看应用状态:"
echo "  pm2 status"
echo ""
echo "查看日志:"
echo "  pm2 logs shopify-order-app --lines 50"
echo ""
