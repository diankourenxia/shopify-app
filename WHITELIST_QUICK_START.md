# 白名单权限管理 - 快速开始

## 快速迁移

在服务器上执行以下命令添加白名单功能：

```bash
cd /var/www/shopify-app
node scripts/migrate-add-whitelist-prisma.js
```

## 功能说明

- ✅ 超级管理员 (yaohuiruyi@gmail.com) 可以管理白名单
- ✅ 白名单用户可以访问所有管理功能
- ✅ 普通用户只能访问订单管理

## 使用指南

1. 以超级管理员身份登录
2. 访问 **权限管理** 菜单
3. 添加需要授权的用户邮箱
4. 用户重新登录后即可看到管理功能

详细文档请查看：[WHITELIST_PERMISSIONS_GUIDE.md](./WHITELIST_PERMISSIONS_GUIDE.md)
