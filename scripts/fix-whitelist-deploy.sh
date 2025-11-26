#!/bin/bash

# 修复白名单功能部署脚本
# 使用方法: ./scripts/fix-whitelist-deploy.sh

set -e  # 遇到错误立即退出

echo "======================================"
echo "修复白名单功能部署"
echo "======================================"
echo ""

# 1. 停止应用
echo "📍 步骤 1/5: 停止应用..."
pm2 stop shopify-app || echo "应用未运行"
echo "✅ 应用已停止"
echo ""

# 2. 拉取最新代码
echo "📍 步骤 2/5: 拉取最新代码..."
cd /var/www/shopify-app
git pull origin main
echo "✅ 代码已更新"
echo ""

# 3. 安装依赖
echo "📍 步骤 3/5: 安装依赖..."
npm install
echo "✅ 依赖已安装"
echo ""

# 4. 生成 Prisma 客户端
echo "📍 步骤 4/5: 生成 Prisma 客户端..."
npx prisma generate
echo "✅ Prisma 客户端已生成"
echo ""

# 5. 构建应用
echo "📍 步骤 5/5: 构建应用..."
npm run build
echo "✅ 应用已构建"
echo ""

# 6. 执行数据库迁移
echo "📍 额外步骤: 执行数据库迁移..."
node scripts/migrate-add-whitelist-prisma.js
echo "✅ 数据库迁移完成"
echo ""

# 7. 启动应用
echo "📍 启动应用..."
pm2 start ecosystem.config.js
pm2 save
echo "✅ 应用已启动"
echo ""

echo "======================================"
echo "✅ 部署完成！"
echo "======================================"
echo ""
echo "现在可以访问以下页面："
echo "  - 首页: https://fr-manage.ecolife-us.com/app"
echo "  - 权限管理: https://fr-manage.ecolife-us.com/app/permissions"
echo ""
echo "检查应用状态: pm2 status"
echo "查看日志: pm2 logs shopify-app"
