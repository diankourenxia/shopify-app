# SSL 证书申请和配置指南

## 1. Let's Encrypt 免费 SSL 证书（推荐）

### 1.1 准备工作

在申请 SSL 证书之前，确保：

- ✅ 域名已经解析到服务器 IP
- ✅ 服务器可以正常访问（HTTP）
- ✅ 防火墙开放 80 和 443 端口
- ✅ Nginx 已安装并运行

### 1.2 验证域名解析

```bash
# 检查域名解析
nslookup your-domain.com
dig your-domain.com

# 或者使用 ping 测试
ping your-domain.com
```

### 1.3 安装 Certbot

```bash
# Ubuntu/Debian 系统
sudo apt update
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL 系统
sudo yum install certbot python3-certbot-nginx
# 或者
sudo dnf install certbot python3-certbot-nginx
```

### 1.4 申请 SSL 证书

#### 方法一：自动配置 Nginx（推荐）

```bash
# 自动申请并配置 Nginx
sudo certbot --nginx -d your-domain.com

# 如果有 www 子域名
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

#### 方法二：仅申请证书

```bash
# 仅申请证书，不自动配置
sudo certbot certonly --nginx -d your-domain.com

# 或者使用 webroot 方式
sudo certbot certonly --webroot -w /var/www/html -d your-domain.com
```

### 1.5 验证证书申请

```bash
# 查看证书信息
sudo certbot certificates

# 测试证书
sudo certbot renew --dry-run
```

### 1.6 设置自动续期

```bash
# 添加到 crontab
sudo crontab -e

# 添加以下行（每天检查并自动续期）
0 12 * * * /usr/bin/certbot renew --quiet
```

## 2. 手动配置 Nginx SSL

如果 Certbot 没有自动配置，可以手动配置：

### 2.1 编辑 Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/shopify-app
```

### 2.2 添加 SSL 配置

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 证书路径
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # 其他配置...
    location / {
        proxy_pass http://localhost:3000;
        # 代理配置...
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### 2.3 测试并重启 Nginx

```bash
# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

## 3. 其他 SSL 证书选项

### 3.1 商业 SSL 证书

#### 购买渠道：
- **DigiCert** - 企业级证书
- **Comodo/Sectigo** - 性价比高
- **GlobalSign** - 国际知名
- **阿里云 SSL** - 国内服务
- **腾讯云 SSL** - 国内服务

#### 申请流程：
1. 购买证书
2. 提交域名验证
3. 下载证书文件
4. 配置到服务器

### 3.2 自签名证书（仅测试用）

```bash
# 生成私钥
sudo openssl genrsa -out /etc/ssl/private/selfsigned.key 2048

# 生成证书
sudo openssl req -new -x509 -key /etc/ssl/private/selfsigned.key -out /etc/ssl/certs/selfsigned.crt -days 365

# 配置 Nginx
ssl_certificate /etc/ssl/certs/selfsigned.crt;
ssl_certificate_key /etc/ssl/private/selfsigned.key;
```

## 4. SSL 证书验证

### 4.1 在线验证工具

- **SSL Labs**: https://www.ssllabs.com/ssltest/
- **SSL Checker**: https://www.sslshopper.com/ssl-checker.html
- **SSL Test**: https://www.htbridge.com/ssl/

### 4.2 命令行验证

```bash
# 检查证书信息
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# 检查证书有效期
echo | openssl s_client -connect your-domain.com:443 2>/dev/null | openssl x509 -noout -dates

# 检查证书链
openssl s_client -connect your-domain.com:443 -showcerts
```

## 5. 常见问题解决

### 5.1 证书申请失败

**问题**: `Failed authorization procedure`

**解决方案**:
```bash
# 检查域名解析
nslookup your-domain.com

# 检查防火墙
sudo ufw status

# 检查 Nginx 配置
sudo nginx -t

# 手动验证
sudo certbot --nginx -d your-domain.com --dry-run
```

### 5.2 证书续期失败

**问题**: 自动续期失败

**解决方案**:
```bash
# 手动续期
sudo certbot renew

# 强制续期
sudo certbot renew --force-renewal

# 检查日志
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### 5.3 SSL 配置错误

**问题**: SSL 握手失败

**解决方案**:
```bash
# 检查证书文件权限
ls -la /etc/letsencrypt/live/your-domain.com/

# 检查 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 测试 SSL 连接
openssl s_client -connect your-domain.com:443
```

## 6. 安全最佳实践

### 6.1 SSL 配置优化

```nginx
# 现代 SSL 配置
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# HSTS 安全头
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### 6.2 证书管理

```bash
# 定期检查证书状态
sudo certbot certificates

# 设置证书到期提醒
echo "0 9 * * 1 /usr/bin/certbot certificates | grep -E 'VALID|INVALID' | mail -s 'SSL Certificate Status' admin@your-domain.com" | sudo crontab -
```

## 7. 自动化脚本

创建 SSL 证书管理脚本：

```bash
#!/bin/bash
# ssl-manager.sh

DOMAIN="your-domain.com"
EMAIL="admin@your-domain.com"

case "$1" in
    install)
        sudo certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --non-interactive
        ;;
    renew)
        sudo certbot renew --quiet
        sudo systemctl reload nginx
        ;;
    status)
        sudo certbot certificates
        ;;
    test)
        sudo certbot renew --dry-run
        ;;
    *)
        echo "Usage: $0 {install|renew|status|test}"
        exit 1
        ;;
esac
```

使用方法：
```bash
chmod +x ssl-manager.sh
./ssl-manager.sh install    # 安装证书
./ssl-manager.sh renew      # 续期证书
./ssl-manager.sh status     # 查看状态
./ssl-manager.sh test       # 测试续期
```

## 8. 监控和告警

### 8.1 证书到期监控

```bash
# 创建监控脚本
cat > /usr/local/bin/ssl-monitor.sh << 'EOF'
#!/bin/bash
DOMAIN="your-domain.com"
DAYS_THRESHOLD=30

# 获取证书到期日期
expiry_date=$(echo | openssl s_client -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
expiry_timestamp=$(date -d "$expiry_date" +%s)
current_timestamp=$(date +%s)
days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))

if [ $days_until_expiry -le $DAYS_THRESHOLD ]; then
    echo "SSL certificate for $DOMAIN expires in $days_until_expiry days"
    # 发送告警邮件
    echo "SSL certificate for $DOMAIN expires in $days_until_expiry days" | mail -s "SSL Certificate Expiry Warning" admin@your-domain.com
fi
EOF

chmod +x /usr/local/bin/ssl-monitor.sh

# 添加到 crontab
echo "0 9 * * * /usr/local/bin/ssl-monitor.sh" | sudo crontab -
```

这样你就可以完全自动化管理 SSL 证书了！
