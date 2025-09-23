# Linux 服务器部署指南

## 1. 服务器环境准备

### 安装 Node.js
```bash
# 使用 NodeSource 仓库安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 安装 PM2 进程管理器
```bash
# 全局安装 PM2
sudo npm install -g pm2

# 设置 PM2 开机自启
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
```

## 2. 环境变量配置方法

### 方法一：系统环境变量（推荐）

#### 2.1 在 `/etc/environment` 中设置（系统级）
```bash
# 编辑系统环境变量文件
sudo nano /etc/environment

# 添加以下内容
SHOPIFY_API_KEY=7d75de835d000b08084b28b703115b48
SHOPIFY_API_SECRET=your_actual_secret_here
SHOPIFY_APP_URL=https://your-domain.com
NODE_ENV=production
PORT=3000
SCOPES=write_products,read_orders,read_customers
```

#### 2.2 在用户配置文件中设置（用户级）
```bash
# 编辑用户环境变量
nano ~/.bashrc

# 在文件末尾添加
export SHOPIFY_API_KEY=7d75de835d000b08084b28b703115b48
export SHOPIFY_API_SECRET=your_actual_secret_here
export SHOPIFY_APP_URL=https://your-domain.com
export NODE_ENV=production
export PORT=3000
export SCOPES=write_products,read_orders,read_customers

# 重新加载配置
source ~/.bashrc
```

#### 2.3 在 `/etc/profile.d/` 中创建配置文件
```bash
# 创建应用专用的环境变量文件
sudo nano /etc/profile.d/shopify-app.sh

# 添加内容
#!/bin/bash
export SHOPIFY_API_KEY=7d75de835d000b08084b28b703115b48
export SHOPIFY_API_SECRET=your_actual_secret_here
export SHOPIFY_APP_URL=https://your-domain.com
export NODE_ENV=production
export PORT=3000
export SCOPES=write_products,read_orders,read_customers

# 设置执行权限
sudo chmod +x /etc/profile.d/shopify-app.sh
```

### 方法二：使用 PM2 配置文件

#### 2.4 创建 PM2 配置文件
```bash
# 在项目根目录创建配置文件
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'shopify-order-app',
    script: './build/server/index.js',
    cwd: '/path/to/your/app',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      SHOPIFY_API_KEY: '7d75de835d000b08084b28b703115b48',
      SHOPIFY_API_SECRET: 'your_actual_secret_here',
      SHOPIFY_APP_URL: 'https://your-domain.com',
      PORT: 3000,
      SCOPES: 'write_products,read_orders,read_customers'
    },
    env_production: {
      NODE_ENV: 'production',
      SHOPIFY_API_KEY: '7d75de835d000b08084b28b703115b48',
      SHOPIFY_API_SECRET: 'your_actual_secret_here',
      SHOPIFY_APP_URL: 'https://your-domain.com',
      PORT: 3000,
      SCOPES: 'write_products,read_orders,read_customers'
    }
  }]
}
```

## 3. 部署步骤

### 3.1 上传项目文件
```bash
# 使用 scp 上传项目
scp -r /path/to/local/project user@your-server:/var/www/

# 或者使用 rsync（推荐）
rsync -avz --delete /path/to/local/project/ user@your-server:/var/www/shopify-app/
```

### 3.2 在服务器上安装依赖
```bash
# 进入项目目录
cd /var/www/shopify-app

# 安装生产依赖
npm ci --only=production

# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy
```

### 3.3 构建应用
```bash
# 构建生产版本
npm run build
```

### 3.4 启动应用
```bash
# 使用 PM2 启动
pm2 start ecosystem.config.js --env production

# 或者直接启动
pm2 start ./build/server/index.js --name shopify-app

# 保存 PM2 配置
pm2 save

# 查看应用状态
pm2 status
pm2 logs shopify-app
```

## 4. Nginx 配置

### 4.1 安装 Nginx
```bash
sudo apt update
sudo apt install nginx
```

### 4.2 配置 Nginx
```bash
# 创建站点配置文件
sudo nano /etc/nginx/sites-available/shopify-app
```

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 证书配置（使用 Let's Encrypt）
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # 静态资源处理
    location /assets/ {
        alias /var/www/shopify-app/build/client/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # 处理静态文件
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        root /var/www/shopify-app/build/client;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # 处理 favicon
    location = /favicon.ico {
        root /var/www/shopify-app/build/client;
        expires 1y;
    }
    
    # 所有其他请求转发到 Node.js 应用
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4.3 启用站点
```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/shopify-app /etc/nginx/sites-enabled/

# 测试 Nginx 配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

## 5. SSL 证书配置（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取 SSL 证书
sudo certbot --nginx -d your-domain.com

# 设置自动续期
sudo crontab -e
# 添加以下行
0 12 * * * /usr/bin/certbot renew --quiet
```

## 6. 防火墙配置

```bash
# 配置 UFW 防火墙
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable

# 查看状态
sudo ufw status
```

## 7. 监控和维护

### 7.1 PM2 监控
```bash
# 查看应用状态
pm2 status

# 查看日志
pm2 logs shopify-app

# 重启应用
pm2 restart shopify-app

# 停止应用
pm2 stop shopify-app

# 删除应用
pm2 delete shopify-app
```

### 7.2 系统监控
```bash
# 查看系统资源使用
htop

# 查看端口占用
netstat -tlnp | grep :3000

# 查看 Nginx 状态
sudo systemctl status nginx

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/error.log
```

## 8. 一键部署脚本

创建 `deploy.sh` 脚本：

```bash
#!/bin/bash

# 设置变量
APP_NAME="shopify-order-app"
APP_DIR="/var/www/shopify-app"
USER="your-username"

echo "🚀 开始部署 $APP_NAME..."

# 1. 停止应用
pm2 stop $APP_NAME 2>/dev/null || true

# 2. 进入项目目录
cd $APP_DIR

# 3. 拉取最新代码（如果使用 Git）
# git pull origin main

# 4. 安装依赖
npm ci --only=production

# 5. 生成 Prisma 客户端
npx prisma generate

# 6. 运行数据库迁移
npx prisma migrate deploy

# 7. 构建应用
npm run build

# 8. 启动应用
pm2 start ecosystem.config.js --env production

# 9. 保存 PM2 配置
pm2 save

echo "✅ 部署完成！"
pm2 status
```

设置执行权限：
```bash
chmod +x deploy.sh
./deploy.sh
```

## 9. 环境变量验证

```bash
# 检查环境变量是否正确设置
echo $SHOPIFY_API_KEY
echo $SHOPIFY_API_SECRET
echo $SHOPIFY_APP_URL

# 或者在 Node.js 中验证
node -e "console.log('SHOPIFY_API_KEY:', process.env.SHOPIFY_API_KEY)"
```

## 10. 常见问题排查

### 10.1 环境变量未生效
```bash
# 重新加载环境变量
source /etc/environment
source ~/.bashrc

# 或者重启终端会话
```

### 10.2 应用无法启动
```bash
# 查看详细错误日志
pm2 logs shopify-app --lines 50

# 手动启动查看错误
cd /var/www/shopify-app
node build/server/index.js
```

### 10.3 端口被占用
```bash
# 查看端口占用
sudo netstat -tlnp | grep :3000

# 杀死占用进程
sudo kill -9 <PID>
```

这样配置后，你的 Shopify 应用就可以在 Linux 服务器上稳定运行了！
