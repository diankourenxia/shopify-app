#!/bin/bash

# SSL 证书管理脚本
# 使用方法: ./scripts/ssl-manager.sh [install|renew|status|test|monitor]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认配置
DOMAIN=""
EMAIL=""
NGINX_CONF="/etc/nginx/sites-available/shopify-app"
DAYS_THRESHOLD=30

# 显示帮助信息
show_help() {
    echo -e "${BLUE}SSL 证书管理脚本${NC}"
    echo ""
    echo "使用方法:"
    echo "  $0 install [domain] [email]  - 安装 SSL 证书"
    echo "  $0 renew                     - 续期 SSL 证书"
    echo "  $0 status                    - 查看证书状态"
    echo "  $0 test                      - 测试证书续期"
    echo "  $0 monitor [domain]          - 监控证书到期时间"
    echo "  $0 config [domain] [email]   - 配置域名和邮箱"
    echo ""
    echo "示例:"
    echo "  $0 install your-domain.com admin@your-domain.com"
    echo "  $0 renew"
    echo "  $0 status"
    echo "  $0 monitor your-domain.com"
}

# 检查是否以 root 身份运行
check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}此脚本需要 root 权限运行${NC}"
        echo -e "${YELLOW}请使用: sudo $0 $@${NC}"
        exit 1
    fi
}

# 安装 Certbot
install_certbot() {
    echo -e "${BLUE}📦 检查并安装 Certbot...${NC}"
    
    if ! command -v certbot &> /dev/null; then
        echo -e "${YELLOW}⚠️  Certbot 未安装，正在安装...${NC}"
        
        # 检测系统类型
        if [ -f /etc/debian_version ]; then
            # Debian/Ubuntu
            apt update
            apt install -y certbot python3-certbot-nginx
        elif [ -f /etc/redhat-release ]; then
            # CentOS/RHEL
            if command -v dnf &> /dev/null; then
                dnf install -y certbot python3-certbot-nginx
            else
                yum install -y certbot python3-certbot-nginx
            fi
        else
            echo -e "${RED}❌ 不支持的系统类型${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}✅ Certbot 安装完成${NC}"
    else
        echo -e "${GREEN}✅ Certbot 已安装${NC}"
    fi
}

# 安装 SSL 证书
install_ssl() {
    local domain=$1
    local email=$2
    
    if [ -z "$domain" ] || [ -z "$email" ]; then
        echo -e "${RED}❌ 域名和邮箱不能为空${NC}"
        echo "使用方法: $0 install your-domain.com admin@your-domain.com"
        exit 1
    fi
    
    echo -e "${BLUE}🔒 开始安装 SSL 证书...${NC}"
    echo "域名: $domain"
    echo "邮箱: $email"
    echo ""
    
    # 检查域名解析
    echo -e "${BLUE}🔍 检查域名解析...${NC}"
    if ! nslookup $domain &> /dev/null; then
        echo -e "${RED}❌ 域名 $domain 解析失败${NC}"
        echo -e "${YELLOW}请确保域名已正确解析到服务器 IP${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ 域名解析正常${NC}"
    
    # 检查 Nginx 配置
    echo -e "${BLUE}🔧 检查 Nginx 配置...${NC}"
    if [ ! -f "$NGINX_CONF" ]; then
        echo -e "${RED}❌ Nginx 配置文件不存在: $NGINX_CONF${NC}"
        echo -e "${YELLOW}请先配置 Nginx${NC}"
        exit 1
    fi
    
    if ! nginx -t &> /dev/null; then
        echo -e "${RED}❌ Nginx 配置有误${NC}"
        nginx -t
        exit 1
    fi
    echo -e "${GREEN}✅ Nginx 配置正常${NC}"
    
    # 申请 SSL 证书
    echo -e "${BLUE}🔒 申请 SSL 证书...${NC}"
    certbot --nginx -d $domain --email $email --agree-tos --non-interactive
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ SSL 证书安装成功！${NC}"
        
        # 设置自动续期
        echo -e "${BLUE}🔄 设置自动续期...${NC}"
        (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx") | crontab -
        echo -e "${GREEN}✅ 自动续期已设置${NC}"
        
        # 显示证书信息
        echo ""
        echo -e "${YELLOW}证书信息：${NC}"
        certbot certificates
    else
        echo -e "${RED}❌ SSL 证书安装失败${NC}"
        exit 1
    fi
}

# 续期 SSL 证书
renew_ssl() {
    echo -e "${BLUE}🔄 开始续期 SSL 证书...${NC}"
    
    certbot renew --quiet
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ SSL 证书续期成功${NC}"
        
        # 重新加载 Nginx
        systemctl reload nginx
        echo -e "${GREEN}✅ Nginx 已重新加载${NC}"
    else
        echo -e "${RED}❌ SSL 证书续期失败${NC}"
        exit 1
    fi
}

# 查看证书状态
show_status() {
    echo -e "${BLUE}📋 SSL 证书状态：${NC}"
    echo ""
    
    if command -v certbot &> /dev/null; then
        certbot certificates
    else
        echo -e "${RED}❌ Certbot 未安装${NC}"
        exit 1
    fi
}

# 测试证书续期
test_renew() {
    echo -e "${BLUE}🧪 测试证书续期...${NC}"
    
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 证书续期测试通过${NC}"
    else
        echo -e "${RED}❌ 证书续期测试失败${NC}"
        exit 1
    fi
}

# 监控证书到期时间
monitor_cert() {
    local domain=$1
    
    if [ -z "$domain" ]; then
        echo -e "${RED}❌ 域名不能为空${NC}"
        echo "使用方法: $0 monitor your-domain.com"
        exit 1
    fi
    
    echo -e "${BLUE}🔍 监控证书 $domain 的到期时间...${NC}"
    
    # 获取证书到期日期
    expiry_info=$(echo | openssl s_client -connect $domain:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ 无法获取证书信息${NC}"
        echo -e "${YELLOW}请检查域名和端口配置${NC}"
        exit 1
    fi
    
    expiry_date=$(echo $expiry_info | cut -d= -f2)
    expiry_timestamp=$(date -d "$expiry_date" +%s 2>/dev/null)
    current_timestamp=$(date +%s)
    
    if [ $? -eq 0 ] && [ ! -z "$expiry_timestamp" ]; then
        days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
        
        echo "证书到期日期: $expiry_date"
        echo "剩余天数: $days_until_expiry 天"
        
        if [ $days_until_expiry -le $DAYS_THRESHOLD ]; then
            echo -e "${RED}⚠️  警告: 证书将在 $days_until_expiry 天后到期！${NC}"
            echo -e "${YELLOW}建议立即续期证书${NC}"
        else
            echo -e "${GREEN}✅ 证书有效期正常${NC}"
        fi
    else
        echo -e "${RED}❌ 无法解析证书到期日期${NC}"
        exit 1
    fi
}

# 主函数
main() {
    case "${1:-help}" in
        install)
            check_root
            install_certbot
            install_ssl "$2" "$3"
            ;;
        renew)
            check_root
            renew_ssl
            ;;
        status)
            show_status
            ;;
        test)
            check_root
            test_renew
            ;;
        monitor)
            monitor_cert "$2"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo -e "${RED}❌ 无效的命令: $1${NC}"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
