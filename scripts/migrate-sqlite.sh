#!/bin/bash

# 通用 SQLite 数据库迁移脚本
# 用法: ./scripts/migrate-sqlite.sh

set -e

echo "============================="
echo "SQLite 数据库迁移脚本"
echo "============================="

# 查找数据库文件
APP_DIR="/var/www/shopify-app"
DB_FILE=""

# 常见的数据库路径
POSSIBLE_PATHS=(
    "$APP_DIR/prisma/prod.sqlite"
    "$APP_DIR/prisma/dev.sqlite"
    "$APP_DIR/prisma/database.sqlite"
    "$APP_DIR/dev.sqlite"
    "$APP_DIR/prod.sqlite"
)

# 从 .env 读取 DATABASE_URL
if [ -f "$APP_DIR/.env" ]; then
    DB_URL=$(grep "DATABASE_URL" "$APP_DIR/.env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [[ "$DB_URL" == file:* ]]; then
        DB_PATH="${DB_URL#file:}"
        # 处理相对路径
        if [[ "$DB_PATH" != /* ]]; then
            DB_PATH="$APP_DIR/$DB_PATH"
        fi
        POSSIBLE_PATHS=("$DB_PATH" "${POSSIBLE_PATHS[@]}")
    fi
fi

# 查找存在的数据库文件
for path in "${POSSIBLE_PATHS[@]}"; do
    if [ -f "$path" ]; then
        DB_FILE="$path"
        break
    fi
done

# 如果还没找到，用 find 搜索
if [ -z "$DB_FILE" ]; then
    DB_FILE=$(find "$APP_DIR" -name "*.sqlite" -type f 2>/dev/null | head -1)
fi

if [ -z "$DB_FILE" ]; then
    echo "❌ 错误: 未找到 SQLite 数据库文件"
    echo "请手动指定数据库路径:"
    echo "  sqlite3 /path/to/database.sqlite"
    exit 1
fi

echo "✅ 找到数据库: $DB_FILE"
echo ""

# 检查表是否存在
TABLE_EXISTS=$(sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name='OrderStatus';" 2>/dev/null)
if [ -z "$TABLE_EXISTS" ]; then
    echo "❌ 错误: OrderStatus 表不存在"
    exit 1
fi

echo "正在检查并添加缺失的字段..."
echo ""

# 获取现有列
EXISTING_COLUMNS=$(sqlite3 "$DB_FILE" "PRAGMA table_info(OrderStatus);" | cut -d'|' -f2)

# 定义需要添加的字段
declare -A COLUMNS_TO_ADD=(
    ["sampleShippingNo"]="TEXT"
    ["sampleShippingStatus"]="TEXT"
    ["sampleShippingCreatedAt"]="DATETIME"
    ["sampleTrackingNo"]="TEXT"
    ["processingFee"]="REAL"
    ["fabricFee"]="REAL"
    ["productFee"]="REAL"
    ["heatSettingFee"]="REAL"
)

# 添加缺失的字段
for column in "${!COLUMNS_TO_ADD[@]}"; do
    if echo "$EXISTING_COLUMNS" | grep -q "^${column}$"; then
        echo "  ⏭️  $column 已存在，跳过"
    else
        TYPE="${COLUMNS_TO_ADD[$column]}"
        echo "  ➕ 添加字段: $column ($TYPE)"
        sqlite3 "$DB_FILE" "ALTER TABLE OrderStatus ADD COLUMN $column $TYPE;" 2>/dev/null || echo "    ⚠️  添加失败（可能已存在）"
    fi
done

echo ""
echo "============================="
echo "迁移完成！"
echo "============================="

# 显示当前表结构
echo ""
echo "当前 OrderStatus 表结构:"
sqlite3 "$DB_FILE" "PRAGMA table_info(OrderStatus);" | while IFS='|' read -r cid name type notnull dflt pk; do
    echo "  - $name ($type)"
done

echo ""
echo "正在重启服务..."

# 重启 PM2
if command -v pm2 &> /dev/null; then
    pm2 restart shopify-app 2>/dev/null && echo "✅ PM2 服务已重启" || echo "⚠️  PM2 重启失败，请手动重启"
else
    echo "⚠️  PM2 未安装，请手动重启服务"
fi

echo ""
echo "✅ 全部完成！"
