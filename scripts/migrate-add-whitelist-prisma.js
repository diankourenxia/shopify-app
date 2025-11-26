#!/usr/bin/env node

/**
 * 添加白名单用户表的迁移脚本（使用 Prisma）
 * 使用方法: node scripts/migrate-add-whitelist-prisma.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

console.log('开始添加白名单用户表迁移...');

// 创建表的 SQL
const createTableSQL = `
CREATE TABLE IF NOT EXISTS "WhitelistUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);
`;

// 创建唯一索引的 SQL
const createIndexSQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "WhitelistUser_email_key" ON "WhitelistUser"("email");
`;

async function migrate() {
  try {
    console.log('✅ 已连接到数据库');
    
    // 执行创建表的 SQL
    await prisma.$executeRawUnsafe(createTableSQL);
    console.log('✅ WhitelistUser 表创建成功');
    
    // 执行创建索引的 SQL
    await prisma.$executeRawUnsafe(createIndexSQL);
    console.log('✅ 唯一索引创建成功');
    
    console.log('\n✅ 迁移成功完成！\n');
    console.log('已创建 WhitelistUser 表，包含以下字段：');
    console.log('  - id: 主键');
    console.log('  - email: 邮箱地址（唯一）');
    console.log('  - name: 用户名称（可选）');
    console.log('  - description: 备注说明（可选）');
    console.log('  - isActive: 是否启用（默认 true）');
    console.log('  - createdAt: 创建时间');
    console.log('  - updatedAt: 更新时间');
    console.log('  - createdBy: 创建人（可选）');
    console.log('\n现在可以访问 /app/permissions 页面管理白名单用户了');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
