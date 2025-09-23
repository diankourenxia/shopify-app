# 部署指南 - 环境变量配置

## 环境变量加载机制

项目使用 `app/env.server.js` 来统一管理环境变量加载：

- **开发环境**：自动读取 `.env` 文件
- **生产环境**：读取系统环境变量
- **自动验证**：启动时检查必需的环境变量

## 不同部署方式的环境变量配置

### 1. 开发环境

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env 文件，填入你的配置
# 3. 启动开发服务器
npm run dev
```

### 2. 服务器部署（PM2）

```bash
# 1. 设置系统环境变量
export SHOPIFY_API_KEY=your_api_key
export SHOPIFY_API_SECRET=your_secret
export SHOPIFY_APP_URL=https://your-domain.com
export NODE_ENV=production
export PORT=3000

# 2. 或者使用 PM2 配置文件
```

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'shopify-app',
    script: './build/server/index.js',
    env: {
      NODE_ENV: 'production',
      SHOPIFY_API_KEY: 'your_api_key',
      SHOPIFY_API_SECRET: 'your_secret',
      SHOPIFY_APP_URL: 'https://your-domain.com',
      PORT: 3000
    }
  }]
}
```

启动：
```bash
pm2 start ecosystem.config.js
```

### 3. Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY build/ ./build/
COPY prisma/ ./prisma/

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 注意：敏感信息通过 docker run 传递
EXPOSE 3000

CMD ["node", "build/server/index.js"]
```

运行：
```bash
docker run -e SHOPIFY_API_KEY=your_key \
           -e SHOPIFY_API_SECRET=your_secret \
           -e SHOPIFY_APP_URL=https://your-domain.com \
           -p 3000:3000 \
           your-app
```

### 4. 云平台部署

#### Vercel
在 Vercel 控制台设置环境变量：
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `NODE_ENV=production`

#### Railway
在 Railway 控制台设置环境变量，或使用 `railway.toml`：

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"

[env]
NODE_ENV = "production"
```

#### Heroku
```bash
heroku config:set SHOPIFY_API_KEY=your_key
heroku config:set SHOPIFY_API_SECRET=your_secret
heroku config:set SHOPIFY_APP_URL=https://your-domain.com
heroku config:set NODE_ENV=production
```

### 5. Nginx + PM2 部署

#### 1. 设置环境变量
```bash
# 在 /etc/environment 或 ~/.bashrc 中添加
export SHOPIFY_API_KEY=your_api_key
export SHOPIFY_API_SECRET=your_secret
export SHOPIFY_APP_URL=https://your-domain.com
export NODE_ENV=production
export PORT=3000
```

#### 2. Nginx 配置
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
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

#### 3. 启动应用
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 环境变量检查

应用启动时会自动检查必需的环境变量：

```
✅ Environment variables loaded:
   - SHOPIFY_API_KEY: ✅ Set
   - SHOPIFY_API_SECRET: ✅ Set
   - SHOPIFY_APP_URL: ✅ Set
   - NODE_ENV: production
```

如果缺少必需的环境变量，应用会显示错误并退出：

```
❌ Missing required environment variables:
   - SHOPIFY_API_KEY
   - SHOPIFY_API_SECRET

💡 Please check your .env file or system environment variables.
```

## 安全注意事项

1. **永远不要将 `.env` 文件提交到 Git**
2. **生产环境使用系统环境变量，不要使用 `.env` 文件**
3. **定期轮换 API 密钥**
4. **使用 HTTPS 保护敏感数据传输**
5. **限制环境变量的访问权限**
