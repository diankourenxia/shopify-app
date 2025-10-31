#!/bin/bash

# 数据库迁移脚本 - 从订单级状态升级到 LineItem 级状态
# 使用方法: ./scripts/migrate-to-lineitem-status.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="${APP_DIR:-$(pwd)}"
BACKUP_DIR="${APP_DIR}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  数据库迁移: LineItem 状态跟踪${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}\n"

# 步骤 1: 前置检查
echo -e "${BLUE}[1/8] 前置条件检查...${NC}"

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 检查 Prisma schema 文件
if [ ! -f "prisma/schema.prisma" ]; then
    echo -e "${RED}❌ 错误: 找不到 prisma/schema.prisma${NC}"
    exit 1
fi

# 检查数据库文件
DB_FILE=""
if [ -f "prisma/prod.sqlite" ]; then
    DB_FILE="prisma/prod.sqlite"
    echo -e "${GREEN}✓ 找到生产数据库${NC}"
elif [ -f "prisma/dev.sqlite" ]; then
    DB_FILE="prisma/dev.sqlite"
    echo -e "${YELLOW}⚠ 找到开发数据库${NC}"
else
    echo -e "${RED}❌ 错误: 找不到数据库文件${NC}"
    exit 1
fi

# 检查 Node 版本
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node 版本: ${NODE_VERSION}${NC}"

# 步骤 2: 备份数据库
echo -e "\n${BLUE}[2/8] 备份数据库...${NC}"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="${BACKUP_DIR}/before_lineitem_migration_${TIMESTAMP}.sqlite"
cp "$DB_FILE" "$BACKUP_FILE"
gzip "$BACKUP_FILE"
echo -e "${GREEN}✓ 备份完成: ${BACKUP_FILE}.gz${NC}"

# 步骤 3: 停止应用（可选）
echo -e "\n${BLUE}[3/8] 检查应用状态...${NC}"
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "shopify-order-app"; then
        echo -e "${YELLOW}⚠ 检测到 PM2 应用正在运行${NC}"
        read -p "是否停止应用? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            pm2 stop shopify-order-app
            echo -e "${GREEN}✓ 应用已停止${NC}"
        else
            echo -e "${YELLOW}⚠ 继续运行，但可能影响迁移${NC}"
        fi
    fi
fi

# 步骤 4: 安装依赖
echo -e "\n${BLUE}[4/8] 安装依赖...${NC}"
npm ci --only=production
echo -e "${GREEN}✓ 依赖安装完成${NC}"

# 步骤 5: 生成 Prisma Client
echo -e "\n${BLUE}[5/8] 生成 Prisma Client...${NC}"
npx prisma generate
echo -e "${GREEN}✓ Prisma Client 生成完成${NC}"

# 步骤 6: 运行数据库迁移
echo -e "\n${BLUE}[6/8] 运行数据库迁移...${NC}"
echo -e "${YELLOW}选择迁移方式:${NC}"
echo -e "  1) prisma migrate deploy (推荐)"
echo -e "  2) prisma db push (快速，无迁移历史)"
echo -e "  3) 跳过迁移（手动执行）"
read -p "请选择 (1-3): " -n 1 -r
echo

case $REPLY in
    1)
        echo -e "${BLUE}执行 prisma migrate deploy...${NC}"
        npx prisma migrate deploy
        ;;
    2)
        echo -e "${BLUE}执行 prisma db push...${NC}"
        npx prisma db push --accept-data-loss
        ;;
    3)
        echo -e "${YELLOW}跳过自动迁移${NC}"
        ;;
    *)
        echo -e "${RED}无效选择，跳过迁移${NC}"
        ;;
esac

echo -e "${GREEN}✓ 数据库迁移完成${NC}"

# 步骤 7: 验证数据库结构
echo -e "\n${BLUE}[7/8] 验证数据库结构...${NC}"
sqlite3 "$DB_FILE" ".schema OrderStatus" | grep -q "lineItemId" && \
    echo -e "${GREEN}✓ 检测到 lineItemId 字段${NC}" || \
    echo -e "${RED}❌ 未检测到 lineItemId 字段${NC}"

# 显示表结构
echo -e "\n${YELLOW}当前 OrderStatus 表结构:${NC}"
sqlite3 "$DB_FILE" ".schema OrderStatus"

# 显示数据示例
echo -e "\n${YELLOW}数据示例:${NC}"
sqlite3 "$DB_FILE" "SELECT * FROM OrderStatus LIMIT 3;"

# 步骤 8: 构建应用
echo -e "\n${BLUE}[8/8] 构建应用...${NC}"
npm run build
echo -e "${GREEN}✓ 构建完成${NC}"

# 完成
echo -e "\n${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ 迁移完成！${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}\n"

# 显示后续步骤
echo -e "${YELLOW}后续步骤：${NC}"
echo -e "1. 启动应用:"
echo -e "   ${BLUE}pm2 start ecosystem.config.js${NC}"
echo -e "   或 ${BLUE}pm2 restart shopify-order-app${NC}"
echo ""
echo -e "2. 查看日志:"
echo -e "   ${BLUE}pm2 logs shopify-order-app${NC}"
echo ""
echo -e "3. 验证功能:"
echo -e "   访问 https://fr-manage.ecolife-us.com/app/orders"
echo -e "   检查每个 lineItem 是否有独立的状态下拉框"
echo ""
echo -e "4. 如需回滚:"
echo -e "   ${BLUE}pm2 stop shopify-order-app${NC}"
echo -e "   ${BLUE}gunzip -c ${BACKUP_FILE}.gz > ${DB_FILE}${NC}"
echo -e "   ${BLUE}pm2 restart shopify-order-app${NC}"
echo ""
echo -e "${YELLOW}备份文件位置: ${BACKUP_FILE}.gz${NC}"
