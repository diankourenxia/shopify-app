# 生产环境部署修复指南

## 问题描述
在生产环境中出现错误：`TypeError: Cannot read properties of undefined (reading 'findMany')`

## 根本原因
1. Prisma 客户端没有正确初始化
2. 数据库路径配置不正确
3. 环境变量 `DATABASE_URL` 未设置

## 修复内容

### 1. 更新 Prisma Schema
- 将硬编码的数据库路径改为使用环境变量 `DATABASE_URL`
- 支持开发和生产环境的不同数据库路径

### 2. 统一 Prisma 客户端使用
- 所有文件现在都使用 `db.server.js` 中的单例实例
- 避免重复创建 Prisma 客户端实例

### 3. 环境变量配置
- 开发环境：`DATABASE_URL="file:./dev.sqlite"`
- 生产环境：`DATABASE_URL="file:/var/www/shopify-app/prisma/prod.sqlite"`

## 部署步骤

### 1. 设置环境变量
```bash
export DATABASE_URL="file:/var/www/shopify-app/prisma/prod.sqlite"
export NODE_ENV="production"
```

### 2. 运行数据库设置脚本
```bash
./scripts/setup-production-db.sh
```

### 3. 重启应用
```bash
pm2 restart shopify-app
# 或者
systemctl restart shopify-app
```

## 验证修复
1. 检查应用日志确保没有 Prisma 相关错误
2. 访问订单页面确认数据正常加载
3. 测试订单状态更新功能

## 注意事项
- 确保生产环境有正确的文件权限
- 数据库文件路径必须存在且可写
- 定期备份生产数据库文件
