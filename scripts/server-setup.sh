#!/bin/bash

# 完整服务器部署脚本
# 使用方法: ./scripts/server-setup.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 开始完整服务器部署...${NC}"

# 检查是否以 root 身份运行
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}此脚本需要 root 权限运行${NC}"
   echo -e "${YELLOW}请使用: sudo ./scripts/server-setup.sh${NC}"
   exit 1
fi

# 获取用户输入
echo -e "${YELLOW}请输入以下信息：${NC}"

read -p "域名 (例如: your-domain.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "${RED}域名不能为空${NC}"
    exit 1
fi

read -p "应用目录 (默认: /var/www/shopify-app): " APP_DIR
APP_DIR=${APP_DIR:-/var/www/shopify-app}

read -p "应用端口 (默认: 3000): " APP_PORT
APP_PORT=${APP_PORT:-3000}

read -p "Shopify API Key (默认: 7d75de835d000b08084b28b703115b48): " API_KEY
API_KEY=${API_KEY:-7d75de835d000b08084b28b703115b48}

read -p "Shopify API Secret: " API_SECRET
if [ -z "$API_SECRET" ]; then
    echo -e "${RED}API Secret 不能为空${NC}"
    exit 1
fi

echo -e "${BLUE}📋 部署信息：${NC}"
echo "域名: $DOMAIN"
echo "应用目录: $APP_DIR"
echo "应用端口: $APP_PORT"
echo "API Key: $API_KEY"
echo ""

read -p "确认开始部署？(y/N): " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}部署已取消${NC}"
    exit 0
fi

# 1. 更新系统
echo -e "${BLUE}📦 更新系统包...${NC}"
apt update && apt upgrade -y

# 2. 安装基础依赖
echo -e "${BLUE}🔧 安装基础依赖...${NC}"
apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release

# 3. 安装 Node.js
echo -e "${BLUE}📦 安装 Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 验证 Node.js 安装
node_version=$(node --version)
npm_version=$(npm --version)
echo -e "${GREEN}✅ Node.js $node_version, npm $npm_version 安装完成${NC}"

# 4. 安装 PM2
echo -e "${BLUE}🔧 安装 PM2...${NC}"
npm install -g pm2

# 设置 PM2 开机自启
pm2 startup systemd -u root --hp /root

# 5. 安装 Nginx
echo -e "${BLUE}🔧 安装 Nginx...${NC}"
apt install -y nginx

# 6. 配置防火墙
echo -e "${BLUE}🔥 配置防火墙...${NC}"
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

# 7. 创建应用目录
echo -e "${BLUE}📁 创建应用目录...${NC}"
mkdir -p $APP_DIR
chown -R www-data:www-data $APP_DIR

# 8. 设置环境变量
echo -e "${BLUE}🔧 设置环境变量...${NC}"
cat > /etc/environment << EOF
SHOPIFY_API_KEY=$API_KEY
SHOPIFY_API_SECRET=$API_SECRET
SHOPIFY_APP_URL=https://$DOMAIN
SCOPES=write_products,read_orders,read_customers
NODE_ENV=production
PORT=$APP_PORT
DATABASE_URL=file:./dev.sqlite
EOF

# 9. 配置 Nginx
echo -e "${BLUE}🔧 配置 Nginx...${NC}"
cat > /etc/nginx/sites-available/shopify-app << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    access_log /var/log/nginx/shopify-app.access.log;
    error_log /var/log/nginx/shopify-app.error.log;
    
    client_max_body_size 10M;
    
    location /assets/ {
        alias $APP_DIR/build/client/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        gzip_static on;
    }
    
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        root $APP_DIR/build/client;
        expires 1y;
        add_header Cache-Control "public, immutable";
        gzip_static on;
    }
    
    location = /favicon.ico {
        root $APP_DIR/build/client;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# 启用站点
ln -sf /etc/nginx/sites-available/shopify-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试 Nginx 配置
nginx -t

# 启动 Nginx
systemctl start nginx
systemctl enable nginx

# 10. 安装 SSL 证书
echo -e "${BLUE}🔒 安装 SSL 证书...${NC}"
apt install -y certbot python3-certbot-nginx

# 获取 SSL 证书
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# 11. 创建 PM2 配置文件
echo -e "${BLUE}🔧 创建 PM2 配置文件...${NC}"
cat > $APP_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'shopify-order-app',
    script: './build/server/index.js',
    cwd: '$APP_DIR',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      SHOPIFY_API_KEY: '$API_KEY',
      SHOPIFY_API_SECRET: '$API_SECRET',
      SHOPIFY_APP_URL: 'https://$DOMAIN',
      PORT: $APP_PORT,
      SCOPES: 'write_products,read_orders,read_customers',
      DATABASE_URL: 'file:./dev.sqlite'
    }
  }]
}
EOF

# 12. 设置自动续期
echo -e "${BLUE}🔄 设置 SSL 证书自动续期...${NC}"
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -

echo -e "${GREEN}✅ 服务器部署完成！${NC}"
echo ""
echo -e "${YELLOW}下一步：${NC}"
echo "1. 上传应用代码到 $APP_DIR"
echo "2. 在应用目录运行:"
echo "   cd $APP_DIR"
echo "   npm install"
echo "   npm run build"
echo "   pm2 start ecosystem.config.js"
echo ""
echo -e "${GREEN}🎉 服务器环境配置完成！${NC}"
