# 服务器部署步骤指南

## 域名配置
- **域名**: `fr-manage.ecolife-us.com`
- **邮箱**: `447536716@qq.com`
- **应用端口**: `3000`

## 1. 服务器环境准备

### 1.1 安装基础软件
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo apt install -y nginx

# 安装 Certbot (SSL 证书)
sudo apt install -y certbot python3-certbot-nginx
```

### 1.2 配置防火墙
```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

## 2. 创建 Nginx 配置文件

### 2.1 复制配置文件
```bash
# 复制 Nginx 配置文件
sudo cp nginx-shopify-app.conf /etc/nginx/sites-available/shopify-app

# 启用站点
sudo ln -s /etc/nginx/sites-available/shopify-app /etc/nginx/sites-enabled/

# 删除默认站点
sudo rm -f /etc/nginx/sites-enabled/default
```

### 2.2 测试 Nginx 配置
```bash
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## 3. 申请 SSL 证书

### 3.1 使用 SSL 管理脚本
```bash
# 进入项目目录
cd /path/to/your/project

# 安装 SSL 证书
sudo ./scripts/ssl-manager.sh install fr-manage.ecolife-us.com 447536716@qq.com
```

### 3.2 或者手动申请
```bash
sudo certbot --nginx -d fr-manage.ecolife-us.com
```

## 4. 设置环境变量

### 4.1 系统环境变量
```bash
sudo nano /etc/environment
```

添加以下内容：
```bash
SHOPIFY_API_KEY=7d75de835d000b08084b28b703115b48
SHOPIFY_API_SECRET=8b4ce8d47dfbc3879f388be2cff41648
SHOPIFY_APP_URL=https://fr-manage.ecolife-us.com
SCOPES=write_products,read_orders,read_customers
NODE_ENV=production
PORT=3000
DATABASE_URL=file:./dev.sqlite
```

### 4.2 重新加载环境变量
```bash
source /etc/environment
```

## 5. 部署应用

### 5.1 创建应用目录
```bash
sudo mkdir -p /var/www/shopify-app
sudo chown -R $USER:$USER /var/www/shopify-app
```

### 5.2 上传项目文件
```bash
# 方法一：使用 scp
scp -r /path/to/local/project/* user@server:/var/www/shopify-app/

# 方法二：使用 rsync
rsync -avz --delete /path/to/local/project/ user@server:/var/www/shopify-app/
```

### 5.3 安装依赖和构建
```bash
cd /var/www/shopify-app

# 安装依赖
npm ci --only=production

# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy

# 构建应用
npm run build
```

## 6. 启动应用

### 6.1 创建 PM2 配置文件
```bash
nano ecosystem.config.js
```

内容：
```javascript
module.exports = {
  apps: [{
    name: 'shopify-order-app',
    script: './build/server/index.js',
    cwd: '/var/www/shopify-app',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      SHOPIFY_API_KEY: '7d75de835d000b08084b28b703115b48',
      SHOPIFY_API_SECRET: '8b4ce8d47dfbc3879f388be2cff41648',
      SHOPIFY_APP_URL: 'https://fr-manage.ecolife-us.com',
      PORT: 3000,
      SCOPES: 'write_products,read_orders,read_customers',
      DATABASE_URL: 'file:./dev.sqlite'
    }
  }]
}
```

### 6.2 启动应用
```bash
# 启动应用
pm2 start ecosystem.config.js

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
```

## 7. 验证部署

### 7.1 检查服务状态
```bash
# 检查 Nginx 状态
sudo systemctl status nginx

# 检查应用状态
pm2 status

# 检查端口占用
sudo netstat -tlnp | grep :3000
```

### 7.2 测试访问
```bash
# 测试 HTTP 重定向
curl -I http://fr-manage.ecolife-us.com

# 测试 HTTPS 访问
curl -I https://fr-manage.ecolife-us.com

# 测试健康检查
curl https://fr-manage.ecolife-us.com/health
```

## 8. 监控和维护

### 8.1 查看日志
```bash
# 查看应用日志
pm2 logs shopify-order-app

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/shopify-app.access.log
sudo tail -f /var/log/nginx/shopify-app.error.log
```

### 8.2 SSL 证书管理
```bash
# 查看证书状态
sudo ./scripts/ssl-manager.sh status

# 测试证书续期
sudo ./scripts/ssl-manager.sh test

# 监控证书到期时间
sudo ./scripts/ssl-manager.sh monitor fr-manage.ecolife-us.com
```

## 9. 故障排查

### 9.1 常见问题
```bash
# 检查防火墙状态
sudo ufw status

# 检查域名解析
nslookup fr-manage.ecolife-us.com

# 检查 SSL 证书
sudo certbot certificates

# 检查 Nginx 配置
sudo nginx -t
```

### 9.2 重启服务
```bash
# 重启应用
pm2 restart shopify-order-app

# 重启 Nginx
sudo systemctl restart nginx

# 重新加载环境变量
source /etc/environment
```

## 10. 自动化部署脚本

创建一键部署脚本：
```bash
#!/bin/bash
# deploy.sh

echo "🚀 开始部署 Shopify 应用..."

# 停止现有应用
pm2 stop shopify-order-app 2>/dev/null || true

# 进入项目目录
cd /var/www/shopify-app

# 拉取最新代码（如果使用 Git）
# git pull origin main

# 安装依赖
npm ci --only=production

# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy

# 构建应用
npm run build

# 启动应用
pm2 start ecosystem.config.js

# 保存 PM2 配置
pm2 save

echo "✅ 部署完成！"
pm2 status
```

设置执行权限：
```bash
chmod +x deploy.sh
```

现在你的 Shopify 应用就可以在服务器上正常运行了！
