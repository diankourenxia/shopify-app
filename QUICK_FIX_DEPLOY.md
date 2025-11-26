# 快速修复部署指南

## 问题原因
构建失败是因为在部分文件中 `prisma` 变量被重复声明。

## 已修复的文件
- ✅ `app/routes/app.fabrics.jsx`
- ✅ `app/routes/app.linings.jsx`
- ✅ `app/routes/app.tags.jsx`
- ✅ `app/routes/app.orders.demo.jsx`

## 在服务器上执行以下命令

### 1. 进入项目目录
```bash
cd /var/www/shopify-app
```

### 2. 拉取最新代码
```bash
git pull origin main
```

### 3. 重新构建并启动
```bash
# 停止应用
pm2 stop shopify-app

# 生成 Prisma 客户端
npx prisma generate

# 构建应用
npm run build

# 启动应用
pm2 restart shopify-app
pm2 save
```

### 4. 执行数据库迁移（首次部署需要）
```bash
node scripts/migrate-add-whitelist-prisma.js
```

### 5. 查看状态
```bash
# 检查应用状态
pm2 status

# 查看日志
pm2 logs shopify-app --lines 50
```

## 一键执行脚本

或者使用提供的脚本一键执行：

```bash
cd /var/www/shopify-app
chmod +x scripts/quick-rebuild.sh
./scripts/quick-rebuild.sh
```

## 验证部署

访问以下页面确认功能正常：
- 首页: https://fr-manage.ecolife-us.com/app
- 权限管理: https://fr-manage.ecolife-us.com/app/permissions

如果还有问题，查看完整日志：
```bash
pm2 logs shopify-app
```
