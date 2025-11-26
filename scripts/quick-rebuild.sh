#!/bin/bash

# 快速修复 - 只重新构建和启动
# 使用方法: ./scripts/quick-rebuild.sh

set -e

echo "🔄 快速重新构建..."

cd /var/www/shopify-app

# 停止应用
echo "停止应用..."
pm2 stop shopify-app || true

# 生成 Prisma 客户端
echo "生成 Prisma 客户端..."
npx prisma generate

# 构建应用
echo "构建应用..."
npm run build

# 启动应用
echo "启动应用..."
pm2 restart shopify-app || pm2 start ecosystem.config.js
pm2 save

echo "✅ 完成！"
echo "查看日志: pm2 logs shopify-app"
