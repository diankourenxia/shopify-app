#!/bin/bash

# 在服务器上安装 sqlite3 命令行工具
# 支持 Ubuntu/Debian 和 CentOS/RHEL 系统

set -e

echo "=========================================="
echo "安装 SQLite3 命令行工具"
echo "=========================================="
echo ""

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    echo "❌ 无法检测操作系统"
    exit 1
fi

echo "检测到操作系统: $OS $VERSION"
echo ""

# 检查是否已安装
if command -v sqlite3 &> /dev/null; then
    SQLITE_VERSION=$(sqlite3 --version | cut -d' ' -f1)
    echo "✅ SQLite3 已安装"
    echo "   版本: $SQLITE_VERSION"
    echo ""
    exit 0
fi

# 根据不同的系统安装
case $OS in
    ubuntu|debian)
        echo "📦 使用 apt 安装 sqlite3..."
        sudo apt-get update
        sudo apt-get install -y sqlite3
        ;;
    
    centos|rhel|fedora)
        echo "📦 使用 yum/dnf 安装 sqlite..."
        if command -v dnf &> /dev/null; then
            sudo dnf install -y sqlite
        else
            sudo yum install -y sqlite
        fi
        ;;
    
    *)
        echo "❌ 不支持的操作系统: $OS"
        echo ""
        echo "请手动安装 sqlite3:"
        echo "  Ubuntu/Debian: sudo apt-get install sqlite3"
        echo "  CentOS/RHEL:   sudo yum install sqlite"
        exit 1
        ;;
esac

# 验证安装
if command -v sqlite3 &> /dev/null; then
    SQLITE_VERSION=$(sqlite3 --version | cut -d' ' -f1)
    echo ""
    echo "=========================================="
    echo "✅ SQLite3 安装成功！"
    echo "=========================================="
    echo ""
    echo "版本: $SQLITE_VERSION"
    echo ""
    echo "现在可以运行原始的迁移脚本了:"
    echo "  ./scripts/migrate-add-note.sh"
    echo ""
else
    echo ""
    echo "❌ 安装失败"
    echo "请手动检查错误信息"
    exit 1
fi
