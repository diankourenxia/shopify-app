#!/bin/bash

# 数据库备份脚本
# 使用方法: ./scripts/backup-database.sh [backup_name]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
APP_DIR="${APP_DIR:-/var/www/shopify-app}"
BACKUP_DIR="${APP_DIR}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${1:-backup_${TIMESTAMP}}"

echo -e "${BLUE}📦 开始备份数据库...${NC}"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 查找数据库文件
DB_FILE=""
if [ -f "${APP_DIR}/prisma/prod.sqlite" ]; then
    DB_FILE="${APP_DIR}/prisma/prod.sqlite"
    echo -e "${GREEN}找到生产数据库: prod.sqlite${NC}"
elif [ -f "${APP_DIR}/prisma/dev.sqlite" ]; then
    DB_FILE="${APP_DIR}/prisma/dev.sqlite"
    echo -e "${YELLOW}找到开发数据库: dev.sqlite${NC}"
else
    echo -e "${RED}❌ 未找到数据库文件${NC}"
    exit 1
fi

# 备份数据库文件
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sqlite"
cp "$DB_FILE" "$BACKUP_FILE"

echo -e "${GREEN}✅ 数据库备份成功！${NC}"
echo -e "${BLUE}备份文件: ${BACKUP_FILE}${NC}"

# 压缩备份文件
gzip "$BACKUP_FILE"
echo -e "${GREEN}✅ 备份文件已压缩${NC}"
echo -e "${BLUE}压缩文件: ${BACKUP_FILE}.gz${NC}"

# 显示备份文件大小
BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo -e "${BLUE}备份大小: ${BACKUP_SIZE}${NC}"

# 列出最近的备份
echo -e "\n${YELLOW}最近的备份文件：${NC}"
ls -lht "$BACKUP_DIR" | head -6

# 删除超过30天的备份
echo -e "\n${BLUE}清理30天前的旧备份...${NC}"
find "$BACKUP_DIR" -name "*.sqlite.gz" -type f -mtime +30 -delete
echo -e "${GREEN}✅ 清理完成${NC}"

# 输出恢复命令
echo -e "\n${YELLOW}恢复数据库命令：${NC}"
echo -e "gunzip -c ${BACKUP_FILE}.gz > ${DB_FILE}"
