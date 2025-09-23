#!/bin/bash

# Nginx 安装和配置脚本
# 使用方法: ./scripts/setup-nginx.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 开始配置 Nginx...${NC}"

# 检查是否以 root 身份运行
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}此脚本需要 root 权限运行${NC}"
   echo -e "${YELLOW}请使用: sudo ./scripts/setup-nginx.sh${NC}"
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

# 更新包列表
echo -e "${BLUE}📦 更新包列表...${NC}"
apt update

# 安装 Nginx
echo -e "${BLUE}🔧 安装 Nginx...${NC}"
apt install -y nginx

# 启动并启用 Nginx
echo -e "${BLUE}🚀 启动 Nginx...${NC}"
systemctl start nginx
systemctl enable nginx

# 创建 Nginx 配置文件
echo -e "${BLUE}📝 创建 Nginx 配置文件...${NC}"
cat > /etc/nginx/sites-available/shopify-app << EOF
# 重定向 HTTP 到 HTTPS
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# 主服务器配置 - HTTPS
server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    
    # SSL 证书配置 (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # 日志配置
    access_log /var/log/nginx/shopify-app.access.log;
    error_log /var/log/nginx/shopify-app.error.log;
    
    # 客户端最大上传大小
    client_max_body_size 10M;
    
    # 静态资源处理
    location /assets/ {
        alias $APP_DIR/build/client/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff";
        gzip_static on;
    }
    
    # 处理静态文件
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        root $APP_DIR/build/client;
        expires 1y;
        add_header Cache-Control "public, immutable";
        gzip_static on;
    }
    
    # 处理 favicon
    location = /favicon.ico {
        root $APP_DIR/build/client;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # API 路由
    location /api/ {
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
    
    # Webhook 路由
    location /webhooks/ {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    # 认证路由
    location /auth/ {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # 所有其他请求
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
    
    # 健康检查端点
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}

# 临时 HTTP 配置（SSL 证书配置前使用）
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # 临时根目录
    root /var/www/html;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF

# 启用站点
echo -e "${BLUE}🔗 启用站点...${NC}"
ln -sf /ext/nginx/sites-available/shopify-app /etc/nginx/sites-enabled/

# 删除默认站点
rm -f /etc/nginx/sites-enabled/default

# 测试 Nginx 配置
echo -e "${BLUE}🧪 测试 Nginx 配置...${NC}"
nginx -t

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Nginx 配置测试通过${NC}"
    
    # 重启 Nginx
    echo -e "${BLUE}🔄 重启 Nginx...${NC}"
    systemctl restart nginx
    
    echo -e "${GREEN}✅ Nginx 配置完成！${NC}"
    echo ""
    echo -e "${YELLOW}下一步：${NC}"
    echo "1. 配置防火墙:"
    echo "   sudo ufw allow 22"
    echo "   sudo ufw allow 80"
    echo "   sudo ufw allow 443"
    echo "   sudo ufw enable"
    echo ""
    echo "2. 安装 SSL 证书:"
    echo "   sudo apt install certbot python3-certbot-nginx"
    echo "   sudo certbot --nginx -d $DOMAIN"
    echo ""
    echo "3. 验证配置:"
    echo "   sudo nginx -t"
    echo "   sudo systemctl status nginx"
    echo ""
    echo -e "${GREEN}🎉 Nginx 配置完成！${NC}"
else
    echo -e "${RED}❌ Nginx 配置测试失败${NC}"
    echo -e "${YELLOW}请检查配置文件语法${NC}"
    exit 1
fi
