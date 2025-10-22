# 生产环境启动指南

## 📋 前提条件

1. **服务器要求**：
   - Node.js >= 18.20
   - npm 或 yarn
   - PM2（进程管理器）
   - Git

2. **环境变量**：
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SHOPIFY_APP_URL`
   - `DATABASE_URL`
   - `NODE_ENV=production`

---

## 🚀 方法一：使用部署脚本（推荐）

### 1. 设置环境变量

```bash
# 编辑环境变量文件
nano .env

# 添加以下内容：
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-domain.com
DATABASE_URL="file:./prisma/prod.sqlite"
NODE_ENV=production
PORT=3000
```

### 2. 加载环境变量

```bash
# 方式A：使用 source
source .env

# 方式B：使用 export
export $(cat .env | xargs)
```

### 3. 运行部署脚本

```bash
# 给脚本执行权限
chmod +x scripts/deploy.sh

# 执行部署
./scripts/deploy.sh
```

这个脚本会自动完成：
- ✅ 检查环境变量
- ✅ 安装依赖
- ✅ 生成 Prisma 客户端
- ✅ 运行数据库迁移
- ✅ 构建应用
- ✅ 使用 PM2 启动应用

---

## 🔧 方法二：手动启动

### 1. 安装依赖

```bash
npm install
# 或
npm ci --only=production
```

### 2. 设置数据库

```bash
# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy

# 或者直接推送 schema
npx prisma db push
```

### 3. 构建应用

```bash
npm run build
```

### 4. 启动应用

#### 选项A：直接启动

```bash
npm start
# 应用会运行在端口 3000
```

#### 选项B：使用 PM2（推荐）

```bash
# 安装 PM2（如果还没安装）
npm install -g pm2

# 启动应用
pm2 start ./build/server/index.js --name shopify-order-app

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
```

---

## 📝 PM2 常用命令

```bash
# 查看应用状态
pm2 status

# 查看日志
pm2 logs shopify-order-app

# 实时日志
pm2 logs shopify-order-app --lines 100

# 重启应用
pm2 restart shopify-order-app

# 停止应用
pm2 stop shopify-order-app

# 删除应用
pm2 delete shopify-order-app

# 监控
pm2 monit
```

---

## 🔍 验证部署

### 1. 检查应用是否运行

```bash
# 查看进程
pm2 status

# 或
ps aux | grep node
```

### 2. 检查端口

```bash
# 检查端口是否被监听
netstat -tulpn | grep 3000
# 或
lsof -i :3000
```

### 3. 测试访问

```bash
# 本地测试
curl http://localhost:3000

# 外部访问
curl https://your-domain.com
```

---

## 🔄 更新应用

### 方式A：使用脚本

```bash
# 拉取最新代码
git pull origin main

# 重新部署
./scripts/deploy.sh
```

### 方式B：手动更新

```bash
# 1. 拉取代码
git pull origin main

# 2. 安装新依赖
npm install

# 3. 更新数据库
npx prisma generate
npx prisma db push

# 4. 重新构建
npm run build

# 5. 重启应用
pm2 restart shopify-order-app
```

---

## 🐛 故障排查

### 应用无法启动

1. **检查日志**：
```bash
pm2 logs shopify-order-app --err
```

2. **检查环境变量**：
```bash
pm2 show shopify-order-app
```

3. **检查端口占用**：
```bash
lsof -i :3000
```

### 数据库错误

```bash
# 重新初始化数据库
npx prisma migrate reset --force
npx prisma db push
```

### 构建失败

```bash
# 清理缓存
rm -rf node_modules
rm -rf build
npm install
npm run build
```

---

## 🔐 安全建议

1. **使用 HTTPS**：配置 Nginx 反向代理
2. **环境变量**：不要提交 `.env` 文件到 Git
3. **文件权限**：
```bash
chmod 600 .env
chmod 755 prisma/
```

4. **定期备份数据库**：
```bash
# 备份
cp prisma/prod.sqlite prisma/prod.sqlite.backup.$(date +%Y%m%d)

# 定时备份（添加到 crontab）
0 2 * * * cp /path/to/prisma/prod.sqlite /path/to/backup/prod.sqlite.$(date +\%Y\%m\%d)
```

---

## 📊 监控

### PM2 监控

```bash
pm2 monit
```

### 日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 🆘 快速命令参考

```bash
# 启动
./scripts/deploy.sh

# 重启
pm2 restart shopify-order-app

# 查看日志
pm2 logs shopify-order-app

# 查看状态
pm2 status

# 停止
pm2 stop shopify-order-app

# 更新后重启
git pull && npm run build && pm2 restart shopify-order-app
```

---

## 📞 需要帮助？

- 查看日志：`pm2 logs shopify-order-app`
- 检查状态：`pm2 status`
- 查看详细信息：`pm2 show shopify-order-app`

