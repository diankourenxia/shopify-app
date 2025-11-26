#!/bin/bash

# 添加白名单用户表的迁移脚本
# 使用方法: ./scripts/migrate-add-whitelist.sh

echo "开始添加白名单用户表迁移..."

# 生成迁移SQL
cat > /tmp/add_whitelist_migration.sql << 'EOF'
-- CreateTable
CREATE TABLE IF NOT EXISTS "WhitelistUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WhitelistUser_email_key" ON "WhitelistUser"("email");

EOF

# 应用到生产数据库
echo "应用迁移到生产数据库..."
sqlite3 /var/www/shopify-app/prisma/prod.sqlite < /tmp/add_whitelist_migration.sql

if [ $? -eq 0 ]; then
    echo "✅ 迁移成功完成！"
    echo ""
    echo "已创建 WhitelistUser 表，包含以下字段："
    echo "  - id: 主键"
    echo "  - email: 邮箱地址（唯一）"
    echo "  - name: 用户名称（可选）"
    echo "  - description: 备注说明（可选）"
    echo "  - isActive: 是否启用（默认 true）"
    echo "  - createdAt: 创建时间"
    echo "  - updatedAt: 更新时间"
    echo "  - createdBy: 创建人（可选）"
    echo ""
    echo "现在可以访问 /app/permissions 页面管理白名单用户了"
else
    echo "❌ 迁移失败，请检查错误信息"
    exit 1
fi

# 清理临时文件
rm /tmp/add_whitelist_migration.sql
