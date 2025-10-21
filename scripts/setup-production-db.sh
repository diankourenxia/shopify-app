#!/bin/bash

# 生产环境数据库设置脚本
echo "Setting up production database..."

# 设置环境变量
export DATABASE_URL="file:/var/www/shopify-app/prisma/prod.sqlite"
export NODE_ENV="production"

# 创建数据库目录
mkdir -p /var/www/shopify-app/prisma

# 生成 Prisma 客户端
echo "Generating Prisma client..."
npx prisma generate

# 运行数据库迁移
echo "Running database migrations..."
npx prisma db push

# 设置正确的权限
chown -R www-data:www-data /var/www/shopify-app/prisma
chmod 755 /var/www/shopify-app/prisma

echo "Production database setup completed!"
