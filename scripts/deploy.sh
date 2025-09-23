#!/bin/bash

# Shopify App 一键部署脚本
# 使用方法: ./scripts/deploy.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_NAME="shopify-order-app"
APP_DIR=$(pwd)

echo -e "${BLUE}🚀 开始部署 $APP_NAME...${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装，请先安装 Node.js${NC}"
    exit 1
fi

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PM2 未安装，正在安装...${NC}"
    npm install -g pm2
fi

# 检查环境变量
echo -e "${BLUE}🔍 检查环境变量...${NC}"
if [ -z "$SHOPIFY_API_KEY" ]; then
    echo -e "${RED}❌ SHOPIFY_API_KEY 未设置${NC}"
    echo -e "${YELLOW}请先运行: ./scripts/setup-env.sh${NC}"
    exit 1
fi

if [ -z "$SHOPIFY_API_SECRET" ]; then
    echo -e "${RED}❌ SHOPIFY_API_SECRET 未设置${NC}"
    echo -e "${YELLOW}请先运行: ./scripts/setup-env.sh${NC}"
    exit 1
fi

if [ -z "$SHOPIFY_APP_URL" ]; then
    echo -e "${RED}❌ SHOPIFY_APP_URL 未设置${NC}"
    echo -e "${YELLOW}请先运行: ./scripts/setup-env.sh${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 环境变量检查通过${NC}"

# 停止现有应用
echo -e "${BLUE}🛑 停止现有应用...${NC}"
pm2 stop $APP_NAME 2>/dev/null || true
pm2 delete $APP_NAME 2>/dev/null || true

# 安装依赖
echo -e "${BLUE}📦 安装依赖...${NC}"
npm ci --only=production

# 生成 Prisma 客户端
echo -e "${BLUE}🗄️  生成 Prisma 客户端...${NC}"
npx prisma generate

# 运行数据库迁移
echo -e "${BLUE}🔄 运行数据库迁移...${NC}"
npx prisma migrate deploy

# 构建应用
echo -e "${BLUE}🔨 构建应用...${NC}"
npm run build

# 检查构建结果
if [ ! -f "build/server/index.js" ]; then
    echo -e "${RED}❌ 构建失败，build/server/index.js 不存在${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 构建完成${NC}"

# 启动应用
echo -e "${BLUE}🚀 启动应用...${NC}"

# 检查是否有 PM2 配置文件
if [ -f "ecosystem.config.js" ]; then
    echo -e "${BLUE}使用 PM2 配置文件启动...${NC}"
    pm2 start ecosystem.config.js --env production
else
    echo -e "${BLUE}使用默认配置启动...${NC}"
    pm2 start ./build/server/index.js --name $APP_NAME
fi

# 保存 PM2 配置
pm2 save

# 显示状态
echo -e "${GREEN}✅ 部署完成！${NC}"
echo ""
echo -e "${YELLOW}应用状态：${NC}"
pm2 status

echo ""
echo -e "${YELLOW}查看日志：${NC}"
echo "pm2 logs $APP_NAME"

echo ""
echo -e "${YELLOW}重启应用：${NC}"
echo "pm2 restart $APP_NAME"

echo ""
echo -e "${YELLOW}停止应用：${NC}"
echo "pm2 stop $APP_NAME"

echo ""
echo -e "${GREEN}🎉 部署成功！应用正在运行在端口 ${PORT:-3000}${NC}"
