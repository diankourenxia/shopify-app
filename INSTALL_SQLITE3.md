# 安装 SQLite3 命令行工具

## 为什么需要安装？

SQLite3 命令行工具对于数据库管理非常有用，可以：
- 直接查看和修改数据库
- 执行 SQL 查询进行调试
- 导出和导入数据
- 查看表结构

虽然我们提供了不依赖 sqlite3 的 Node.js 迁移脚本，但安装 sqlite3 命令行工具可以让你更方便地管理数据库。

## 快速安装

### 方法 1: 使用自动安装脚本（推荐）

在服务器上运行：

```bash
cd /var/www/shopify-app
./scripts/install-sqlite3.sh
```

脚本会自动检测操作系统并安装相应的包。

### 方法 2: 手动安装

#### Ubuntu/Debian 系统

```bash
sudo apt-get update
sudo apt-get install -y sqlite3
```

#### CentOS/RHEL 系统

```bash
# 使用 yum
sudo yum install -y sqlite

# 或使用 dnf (较新版本)
sudo dnf install -y sqlite
```

#### 验证安装

```bash
sqlite3 --version
```

应该输出类似：
```
3.31.1 2020-01-27 19:55:54 ...
```

## 安装后的使用

### 查看数据库表结构

```bash
sqlite3 /var/www/shopify-app/prisma/prod.sqlite "PRAGMA table_info(OrderStatus);"
```

### 查询数据

```bash
# 查看所有订单状态
sqlite3 /var/www/shopify-app/prisma/prod.sqlite "SELECT * FROM OrderStatus LIMIT 10;"

# 查看有备注的记录
sqlite3 /var/www/shopify-app/prisma/prod.sqlite "SELECT * FROM OrderStatus WHERE note IS NOT NULL;"
```

### 进入交互式模式

```bash
sqlite3 /var/www/shopify-app/prisma/prod.sqlite
```

在交互式模式中可以执行：
```sql
-- 查看所有表
.tables

-- 查看表结构
.schema OrderStatus

-- 执行查询
SELECT COUNT(*) FROM OrderStatus;

-- 退出
.quit
```

### 导出数据

```bash
# 导出为 SQL
sqlite3 /var/www/shopify-app/prisma/prod.sqlite .dump > backup.sql

# 导出为 CSV
sqlite3 -header -csv /var/www/shopify-app/prisma/prod.sqlite "SELECT * FROM OrderStatus;" > orders.csv
```

## 常用 SQLite3 命令

| 命令 | 说明 |
|------|------|
| `.tables` | 列出所有表 |
| `.schema [table]` | 显示表结构 |
| `.mode column` | 列模式显示 |
| `.headers on` | 显示列名 |
| `.dump [table]` | 导出表数据 |
| `.quit` | 退出 |

## 安装失败？

### 权限不足

如果遇到权限错误，需要使用 `sudo`：

```bash
sudo apt-get install sqlite3
```

### 包管理器未更新

如果提示找不到包：

```bash
sudo apt-get update
sudo apt-get install sqlite3
```

### 无 sudo 权限

如果没有 sudo 权限：
1. 联系服务器管理员
2. 或继续使用 Node.js 版本的迁移脚本（不需要 sqlite3）

## Node.js 脚本 vs SQLite3 命令

| 特性 | Node.js 脚本 | SQLite3 命令 |
|------|-------------|--------------|
| 安装要求 | 仅需 Node.js | 需要安装 sqlite3 |
| 速度 | 稍慢 | 更快 |
| 灵活性 | 自动化处理 | 需要手动操作 |
| 适用场景 | CI/CD、自动化部署 | 手动管理、调试 |

## 建议

- **生产环境**: 使用 Node.js 脚本，更可靠，不依赖外部工具
- **开发环境**: 安装 sqlite3，方便调试和查看数据

两种方法可以并存，互不影响！
