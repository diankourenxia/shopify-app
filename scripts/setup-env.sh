#!/bin/bash

# Shopify App 环境变量配置脚本
# 使用方法: ./scripts/setup-env.sh

set -e

echo "🔧 开始配置 Shopify App 环境变量..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否以 root 身份运行
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}请不要以 root 身份运行此脚本${NC}"
   exit 1
fi

# 获取用户输入
echo -e "${YELLOW}请输入以下信息：${NC}"

read -p "Shopify API Key (默认: 7d75de835d000b08084b28b703115b48): " API_KEY
API_KEY=${API_KEY:-7d75de835d000b08084b28b703115b48}

read -p "Shopify API Secret: " API_SECRET
if [ -z "$API_SECRET" ]; then
    echo -e "${RED}API Secret 不能为空${NC}"
    exit 1
fi

read -p "应用域名 (例如: https://your-domain.com): " APP_URL
if [ -z "$APP_URL" ]; then
    echo -e "${RED}应用域名不能为空${NC}"
    exit 1
fi

read -p "端口号 (默认: 3000): " PORT
PORT=${PORT:-3000}

read -p "Node 环境 (development/production, 默认: production): " NODE_ENV
NODE_ENV=${NODE_ENV:-production}

# 环境变量内容
ENV_CONTENT="
# Shopify App Configuration
export SHOPIFY_API_KEY=$API_KEY
export SHOPIFY_API_SECRET=$API_SECRET
export SHOPIFY_APP_URL=$APP_URL
export SCOPES=write_products,read_orders,read_customers

# Database Configuration
export DATABASE_URL=\"file:./dev.sqlite\"

# Node Environment
export NODE_ENV=$NODE_ENV

# Server Configuration
export PORT=$PORT
"

echo -e "${YELLOW}选择配置方式：${NC}"
echo "1) 用户级环境变量 (~/.bashrc)"
echo "2) 系统级环境变量 (/etc/environment)"
echo "3) 创建 PM2 配置文件"
echo "4) 创建 .env 文件（仅开发环境）"
echo "5) 全部配置"

read -p "请选择 (1-5): " choice

case $choice in
    1)
        echo -e "${GREEN}配置用户级环境变量...${NC}"
        echo "$ENV_CONTENT" >> ~/.bashrc
        echo "source ~/.bashrc" >> ~/.bashrc
        echo -e "${GREEN}✅ 用户级环境变量配置完成${NC}"
        echo -e "${YELLOW}请运行: source ~/.bashrc${NC}"
        ;;
    2)
        echo -e "${GREEN}配置系统级环境变量...${NC}"
        echo "$ENV_CONTENT" | sudo tee -a /etc/environment
        echo -e "${GREEN}✅ 系统级环境变量配置完成${NC}"
        echo -e "${YELLOW}需要重启系统或重新登录生效${NC}"
        ;;
    3)
        echo -e "${GREEN}创建 PM2 配置文件...${NC}"
        cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'shopify-order-app',
    script: './build/server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: '$NODE_ENV',
      SHOPIFY_API_KEY: '$API_KEY',
      SHOPIFY_API_SECRET: '$API_SECRET',
      SHOPIFY_APP_URL: '$APP_URL',
      PORT: $PORT,
      SCOPES: 'write_products,read_orders,read_customers',
      DATABASE_URL: 'file:./dev.sqlite'
    }
  }]
}
EOF
        echo -e "${GREEN}✅ PM2 配置文件创建完成${NC}"
        ;;
    4)
        echo -e "${GREEN}创建 .env 文件...${NC}"
        cat > .env << EOF
# Shopify App Configuration
SHOPIFY_API_KEY=$API_KEY
SHOPIFY_API_SECRET=$API_SECRET
SHOPIFY_APP_URL=$APP_URL
SCOPES=write_products,read_orders,read_customers

# Database Configuration
DATABASE_URL="file:./dev.sqlite"

# Node Environment
NODE_ENV=$NODE_ENV

# Server Configuration
PORT=$PORT
EOF
        echo -e "${GREEN}✅ .env 文件创建完成${NC}"
        ;;
    5)
        echo -e "${GREEN}配置所有方式...${NC}"
        
        # 用户级
        echo "$ENV_CONTENT" >> ~/.bashrc
        
        # PM2 配置
        cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'shopify-order-app',
    script: './build/server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: '$NODE_ENV',
      SHOPIFY_API_KEY: '$API_KEY',
      SHOPIFY_API_SECRET: '$API_SECRET',
      SHOPIFY_APP_URL: '$APP_URL',
      PORT: $PORT,
      SCOPES: 'write_products,read_orders,read_customers',
      DATABASE_URL: 'file:./dev.sqlite'
    }
  }]
}
EOF
        
        # .env 文件
        cat > .env << EOF
# Shopify App Configuration
SHOPIFY_API_KEY=$API_KEY
SHOPIFY_API_SECRET=$API_SECRET
SHOPIFY_APP_URL=$APP_URL
SCOPES=write_products,read_orders,read_customers

# Database Configuration
DATABASE_URL="file:./dev.sqlite"

# Node Environment
NODE_ENV=$NODE_ENV

# Server Configuration
PORT=$PORT
EOF
        
        echo -e "${GREEN}✅ 所有配置完成${NC}"
        echo -e "${YELLOW}请运行: source ~/.bashrc${NC}"
        ;;
    *)
        echo -e "${RED}无效选择${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}🎉 环境变量配置完成！${NC}"
echo ""
echo -e "${YELLOW}下一步：${NC}"
echo "1. 运行: source ~/.bashrc (如果配置了用户级环境变量)"
echo "2. 构建应用: npm run build"
echo "3. 启动应用: pm2 start ecosystem.config.js"
echo "4. 查看状态: pm2 status"
