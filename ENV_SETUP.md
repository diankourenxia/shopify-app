# 环境变量配置指南

## 必需的环境变量

### 1. 复制环境变量模板
```bash
cp .env.example .env
```

### 2. 配置 Shopify 应用信息

从 Shopify Partners 后台获取以下信息：

- **SHOPIFY_API_KEY**: 你的 Shopify 应用 API Key
- **SHOPIFY_API_SECRET**: 你的 Shopify 应用 API Secret
- **SHOPIFY_APP_URL**: 你的应用域名（生产环境）

### 3. 环境变量说明

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `SHOPIFY_API_KEY` | Shopify 应用 API Key | `7d75de835d000b08084b28b703115b48` |
| `SHOPIFY_API_SECRET` | Shopify 应用 API Secret | `your_secret_key` |
| `SHOPIFY_APP_URL` | 应用域名 | `https://your-domain.com` |
| `SCOPES` | 应用权限范围 | `write_products,read_orders,read_customers` |
| `DATABASE_URL` | 数据库连接字符串 | `file:./dev.sqlite` |
| `NODE_ENV` | 运行环境 | `development` 或 `production` |
| `PORT` | 服务器端口 | `3000` |
| `HMR_SERVER_PORT` | 热重载端口 | `8002` |
| `FRONTEND_PORT` | 前端端口 | `8002` |

### 4. 可选环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `SHOP_CUSTOM_DOMAIN` | 自定义商店域名 | `your-custom-domain.com` |
| `HOST` | 生产环境主机名 | `your-production-domain.com` |

## 开发环境设置

1. **复制环境变量文件**：
   ```bash
   cp .env.example .env
   ```

2. **编辑 `.env` 文件**，填入你的 Shopify 应用信息

3. **安装依赖**：
   ```bash
   npm install
   ```

4. **初始化数据库**：
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. **启动开发服务器**：
   ```bash
   npm run dev
   ```

## 生产环境设置

1. **设置生产环境变量**：
   ```bash
   export NODE_ENV=production
   export SHOPIFY_APP_URL=https://your-production-domain.com
   export SHOPIFY_API_KEY=your_production_api_key
   export SHOPIFY_API_SECRET=your_production_api_secret
   ```

2. **构建应用**：
   ```bash
   npm run build
   ```

3. **启动生产服务器**：
   ```bash
   npm start
   ```

## 安全注意事项

- ⚠️ **永远不要将 `.env` 文件提交到 Git**
- ⚠️ **确保 `.env` 文件在 `.gitignore` 中**
- ⚠️ **生产环境使用环境变量而不是文件**
- ⚠️ **定期轮换 API 密钥**
